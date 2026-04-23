import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plus, MapPin, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Client = { id: string; name: string };
type Worker = { id: string; full_name: string; passport_number: string };

type ApprovedItem = {
  id: string;
  source: "report" | "manual";
  work_date: string;
  worker_name: string | null;
  worker_id: string | null;
  passport_number: string | null;
  check_in: string | null;
  check_out: string | null;
  total_hours: number;
  hourly_wage: number;
  total_payment: number;
  workplace_description: string;
  workplace_address: string | null;
  maps_link: string | null;
  assigned_client_id: string | null;
  assigned_custom_workplace: string | null;
  client_name: string | null;
  notes: string | null;
};

export default function ApprovedEventsTab() {
  const { user } = useAuth();
  const [items, setItems] = useState<ApprovedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<"none" | "client" | "worker">("none");
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ws }] = await Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("replacement_workers").select("id, full_name, passport_number").order("full_name"),
    ]);
    setClients((cs as Client[]) || []);
    setWorkers((ws as Worker[]) || []);

    const clientMap = new Map<string, string>();
    (cs as Client[] || []).forEach((c) => clientMap.set(c.id, c.name));

    // Approved replacement_reports
    const { data: reports } = await supabase
      .from("replacement_reports")
      .select("*")
      .eq("status", "approved")
      .order("work_date", { ascending: false });

    // Manual completed planned events
    const { data: planned } = await supabase
      .from("replacement_planned_events")
      .select("*")
      .eq("status", "completed")
      .order("event_date", { ascending: false });

    const fromReports: ApprovedItem[] = (reports || []).map((r: any) => ({
      id: `r:${r.id}`,
      source: "report",
      work_date: r.work_date,
      worker_name: r.worker_name,
      worker_id: r.worker_id,
      passport_number: r.passport_number,
      check_in: r.check_in,
      check_out: r.check_out,
      total_hours: Number(r.total_hours) || 0,
      hourly_wage: Number(r.hourly_wage) || 0,
      total_payment: Number(r.total_payment) || 0,
      workplace_description: r.workplace_description,
      workplace_address: r.workplace_address,
      maps_link: r.maps_link,
      assigned_client_id: r.assigned_client_id,
      assigned_custom_workplace: r.assigned_custom_workplace,
      client_name: r.assigned_client_id ? clientMap.get(r.assigned_client_id) || null : r.assigned_custom_workplace,
      notes: r.notes,
    }));

    const workerMap = new Map<string, Worker>();
    (ws as Worker[] || []).forEach((w) => workerMap.set(w.id, w));

    const fromPlanned: ApprovedItem[] = (planned || []).map((p: any) => {
      const w = p.worker_id ? workerMap.get(p.worker_id) : null;
      return {
        id: `p:${p.id}`,
        source: "manual",
        work_date: p.event_date || p.next_occurrence || "",
        worker_name: w?.full_name || null,
        worker_id: p.worker_id,
        passport_number: w?.passport_number || null,
        check_in: p.expected_check_in,
        check_out: p.expected_check_out,
        total_hours: Number(p.expected_hours) || 0,
        hourly_wage: Number(p.hourly_wage) || 0,
        total_payment: Number(p.expected_payment) || 0,
        workplace_description: p.title,
        workplace_address: p.workplace_address,
        maps_link: p.maps_link,
        assigned_client_id: p.client_id,
        assigned_custom_workplace: p.custom_workplace,
        client_name: p.client_id ? clientMap.get(p.client_id) || null : p.custom_workplace,
        notes: p.notes,
      };
    });

    setItems([...fromReports, ...fromPlanned].sort((a, b) => b.work_date.localeCompare(a.work_date)));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) =>
      (i.worker_name || "").toLowerCase().includes(q) ||
      (i.client_name || "").toLowerCase().includes(q) ||
      i.workplace_description.toLowerCase().includes(q)
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", rows: filtered }];
    const map = new Map<string, { label: string; rows: ApprovedItem[] }>();
    for (const it of filtered) {
      const key = groupBy === "client" ? (it.client_name || "ללא לקוח") : (it.worker_name || "ללא עובד");
      if (!map.has(key)) map.set(key, { label: key, rows: [] });
      map.get(key)!.rows.push(it);
    }
    return Array.from(map.entries()).map(([key, val]) => ({ key, ...val }));
  }, [filtered, groupBy]);

  const totals = useMemo(() => ({
    hours: filtered.reduce((s, r) => s + r.total_hours, 0),
    pay: filtered.reduce((s, r) => s + r.total_payment, 0),
  }), [filtered]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle>אירועים מיוחדים מאושרים</CardTitle>
          <Badge variant="outline">{filtered.length}</Badge>
          <div className="text-sm text-muted-foreground ml-2">
            סה"כ שעות: <strong className="text-foreground">{totals.hours.toFixed(2)}</strong> ·
            סה"כ תשלום: <strong className="text-foreground">{totals.pay.toFixed(2)}</strong>
          </div>
          <div className="ml-auto flex gap-2">
            <Input placeholder="חיפוש..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא קיבוץ</SelectItem>
                <SelectItem value="client">קבץ לפי לקוח</SelectItem>
                <SelectItem value="worker">קבץ לפי עובד</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setOpenNew(true)}>
              <Plus className="h-4 w-4" /> הוסף ידנית
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">אין אירועים מאושרים</p>
        ) : (
          grouped.map((g) => (
            <div key={g.key} className="space-y-2">
              {g.label && (
                <div className="font-semibold text-sm bg-muted/50 px-3 py-1.5 rounded">
                  {g.label} ({g.rows.length})
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>עובד</TableHead>
                    <TableHead>לקוח / מקום</TableHead>
                    <TableHead>שעות</TableHead>
                    <TableHead>סה"כ</TableHead>
                    <TableHead>תשלום</TableHead>
                    <TableHead>מקור</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.rows.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.work_date}</TableCell>
                      <TableCell className="font-medium">{i.worker_name || "—"}</TableCell>
                      <TableCell>
                        {i.client_name || "—"}
                        {i.maps_link && (
                          <a href={i.maps_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 ml-2 text-primary text-xs">
                            <MapPin className="h-3 w-3" /><ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell>{i.check_in && i.check_out ? `${i.check_in}–${i.check_out}` : "—"}</TableCell>
                      <TableCell>{i.total_hours.toFixed(2)}</TableCell>
                      <TableCell>{i.total_payment.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={i.source === "report" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : "bg-blue-500/10 text-blue-700 border-blue-500/30"}>
                          {i.source === "report" ? "דיווח עובד" : "ידני"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))
        )}
      </CardContent>

      <ManualEventDialog
        open={openNew}
        onClose={() => setOpenNew(false)}
        clients={clients}
        workers={workers}
        userId={user?.id || null}
        onSaved={() => { setOpenNew(false); load(); }}
      />
    </Card>
  );
}

function ManualEventDialog({
  open, onClose, clients, workers, userId, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  workers: Worker[];
  userId: string | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [clientId, setClientId] = useState("");
  const [customWorkplace, setCustomWorkplace] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [checkIn, setCheckIn] = useState("08:00");
  const [checkOut, setCheckOut] = useState("17:00");
  const [wage, setWage] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const hours = useMemo(() => {
    const [h1, m1] = checkIn.split(":").map(Number);
    const [h2, m2] = checkOut.split(":").map(Number);
    return Math.max(0, (h2 * 60 + m2 - h1 * 60 - m1) / 60);
  }, [checkIn, checkOut]);
  const wageNum = parseFloat(wage) || 0;
  const payment = hours * wageNum;

  const submit = async () => {
    if (!title.trim()) return toast.error("נדרש שם אירוע");
    if (!clientId && !customWorkplace.trim()) return toast.error("יש לבחור לקוח או להזין מקום עבודה");
    setBusy(true);
    const { error } = await supabase.from("replacement_planned_events").insert({
      title: title.trim(),
      client_id: clientId || null,
      custom_workplace: clientId ? null : customWorkplace.trim(),
      worker_id: workerId || null,
      recurrence: "none",
      event_date: date,
      next_occurrence: date,
      expected_check_in: checkIn,
      expected_check_out: checkOut,
      expected_hours: hours,
      hourly_wage: wageNum,
      expected_payment: payment,
      status: "completed",
      notes: notes.trim() || null,
      created_by: userId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("האירוע נוסף");
    onSaved();
    setTitle(""); setNotes(""); setWage(""); setClientId(""); setCustomWorkplace(""); setWorkerId("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>הוספת אירוע מיוחד ידנית</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label>שם / תיאור האירוע *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>תאריך</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>עובד (אופציונלי)</Label>
              <Select value={workerId} onValueChange={setWorkerId}>
                <SelectTrigger><SelectValue placeholder="בחר..." /></SelectTrigger>
                <SelectContent>
                  {workers.map((w) => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>לקוח</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="בחר לקוח..." /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-center text-muted-foreground">— או —</div>
          <div className="space-y-2">
            <Label>מקום עבודה חופשי</Label>
            <Input value={customWorkplace} onChange={(e) => setCustomWorkplace(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>כניסה</Label><Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
            <div className="space-y-2"><Label>יציאה</Label><Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
            <div className="space-y-2"><Label>שכר/שעה</Label><Input type="number" value={wage} onChange={(e) => setWage(e.target.value)} /></div>
          </div>
          <div className="text-sm text-muted-foreground">
            סה"כ שעות: <strong className="text-foreground">{hours.toFixed(2)}</strong> ·
            תשלום: <strong className="text-foreground">{payment.toFixed(2)}</strong>
          </div>
          <div className="space-y-2"><Label>הערות</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
