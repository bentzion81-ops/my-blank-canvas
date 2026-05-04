import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, MapPin, ChevronLeft, ChevronRight, ExternalLink, Copy, FileDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getShareableAppOrigin } from "@/lib/utils";
import ApprovedEventsTab from "@/components/replacement/ApprovedEventsTab";
import PlannedEventsTab from "@/components/replacement/PlannedEventsTab";

type Report = {
  id: string;
  worker_id: string;
  passport_number: string;
  worker_name: string;
  work_date: string;
  check_in: string;
  check_out: string;
  total_hours: number;
  hourly_wage: number;
  total_payment: number;
  workplace_description: string;
  workplace_address: string | null;
  maps_link: string | null;
  status: string;
  assigned_client_id: string | null;
  assigned_custom_workplace: string | null;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
};

type Client = { id: string; name: string };
type Worker = { id: string; full_name: string; passport_number: string; phone: string | null };
type ChangeReq = {
  id: string;
  report_id: string;
  worker_id: string;
  description: string;
  status: string;
  created_at: string;
  replacement_reports?: { worker_name: string; work_date: string };
};

const statusColor: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  needs_clarification: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
};

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const monthEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const fmtMonth = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
const toLocalISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function ReplacementAdmin() {
  const portalUrl = `${getShareableAppOrigin()}/report`;
  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">דיווח שעות מחליפים</h1>
          <p className="text-sm text-muted-foreground">Replacement Workers Hour Reporting</p>
        </div>
        <Card className="shrink-0">
          <CardContent className="flex items-center gap-2 py-3">
            <span className="text-sm text-muted-foreground">קישור לעובדים:</span>
            <code className="text-xs bg-muted px-2 py-1 rounded">{portalUrl}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(portalUrl);
                toast.success("Link copied");
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="reports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reports">דיווחי עובדים</TabsTrigger>
          <TabsTrigger value="approved">אירועים מאושרים</TabsTrigger>
          <TabsTrigger value="planned">אירועים מתוכננים</TabsTrigger>
          <TabsTrigger value="pending">ממתינים לאישור</TabsTrigger>
          <TabsTrigger value="employees">עובדים</TabsTrigger>
          <TabsTrigger value="clients">לקוחות</TabsTrigger>
          <TabsTrigger value="changes">בקשות שינוי</TabsTrigger>
        </TabsList>

        <TabsContent value="reports"><AllReportsTab /></TabsContent>
        <TabsContent value="approved"><ApprovedEventsTab /></TabsContent>
        <TabsContent value="planned"><PlannedEventsTab /></TabsContent>
        <TabsContent value="pending"><PendingTab /></TabsContent>
        <TabsContent value="employees"><EmployeesTab /></TabsContent>
        <TabsContent value="clients"><ClientsTab /></TabsContent>
        <TabsContent value="changes"><ChangesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ReportRow({ r, clients, onChanged }: { r: Report; clients: Client[]; onChanged: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState<string>(r.assigned_client_id || "");
  const [customName, setCustomName] = useState(r.assigned_custom_workplace || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Editable fields
  const [workDate, setWorkDate] = useState(r.work_date);
  const [workerName, setWorkerName] = useState(r.worker_name);
  const [passport, setPassport] = useState(r.passport_number);
  const [checkIn, setCheckIn] = useState(r.check_in);
  const [checkOut, setCheckOut] = useState(r.check_out);
  const [wage, setWage] = useState(String(r.hourly_wage ?? ""));
  const [workplaceDesc, setWorkplaceDesc] = useState(r.workplace_description || "");
  const [workplaceAddress, setWorkplaceAddress] = useState(r.workplace_address || "");
  const [mapsLink, setMapsLink] = useState(r.maps_link || "");
  const [notes, setNotes] = useState(r.notes || "");

  // Reset state when row data changes
  useEffect(() => {
    setClientId(r.assigned_client_id || "");
    setCustomName(r.assigned_custom_workplace || "");
    setWorkDate(r.work_date);
    setWorkerName(r.worker_name);
    setPassport(r.passport_number);
    setCheckIn(r.check_in);
    setCheckOut(r.check_out);
    setWage(String(r.hourly_wage ?? ""));
    setWorkplaceDesc(r.workplace_description || "");
    setWorkplaceAddress(r.workplace_address || "");
    setMapsLink(r.maps_link || "");
    setNotes(r.notes || "");
  }, [r.id]);

  const computedHours = useMemo(() => {
    if (!checkIn || !checkOut) return Number(r.total_hours) || 0;
    const [h1, m1] = checkIn.split(":").map(Number);
    const [h2, m2] = checkOut.split(":").map(Number);
    if ([h1, m1, h2, m2].some((n) => isNaN(n))) return Number(r.total_hours) || 0;
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 24 * 60; // overnight shift
    return diff / 60;
  }, [checkIn, checkOut, r.total_hours]);
  const wageNum = parseFloat(wage) || 0;
  const computedPayment = computedHours * wageNum;

  const buildEditedPatch = () => ({
    work_date: workDate,
    worker_name: workerName.trim(),
    passport_number: passport.trim(),
    check_in: checkIn,
    check_out: checkOut,
    hourly_wage: wageNum,
    total_hours: computedHours,
    total_payment: computedPayment,
    workplace_description: workplaceDesc.trim(),
    workplace_address: workplaceAddress.trim() || null,
    maps_link: mapsLink.trim() || null,
    notes: notes.trim() || null,
  });

  const update = async (patch: any) => {
    setBusy(true);
    const { error } = await supabase.from("replacement_reports").update(patch).eq("id", r.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    onChanged();
    setOpen(false);
  };

  const saveOnly = () => update(buildEditedPatch());

  const resetEdits = () => {
    setClientId(r.assigned_client_id || "");
    setCustomName(r.assigned_custom_workplace || "");
    setWorkDate(r.work_date);
    setWorkerName(r.worker_name);
    setPassport(r.passport_number);
    setCheckIn(r.check_in);
    setCheckOut(r.check_out);
    setWage(String(r.hourly_wage ?? ""));
    setWorkplaceDesc(r.workplace_description || "");
    setWorkplaceAddress(r.workplace_address || "");
    setMapsLink(r.maps_link || "");
    setNotes(r.notes || "");
    setReason("");
    toast.success("השינויים בוטלו - הוחזרו הערכים המקוריים");
  };

  const isDirty =
    workDate !== r.work_date ||
    workerName !== r.worker_name ||
    passport !== r.passport_number ||
    checkIn !== r.check_in ||
    checkOut !== r.check_out ||
    wage !== String(r.hourly_wage ?? "") ||
    workplaceDesc !== (r.workplace_description || "") ||
    workplaceAddress !== (r.workplace_address || "") ||
    mapsLink !== (r.maps_link || "") ||
    notes !== (r.notes || "") ||
    clientId !== (r.assigned_client_id || "") ||
    customName !== (r.assigned_custom_workplace || "");

  const approve = async () => {
    if (!clientId && !customName.trim()) {
      return toast.error("יש לשייך ללקוח קיים או להזין מקום עבודה חדש");
    }
    let finalClientId = clientId;
    if (!finalClientId && customName.trim()) {
      // Create new client in main clients list
      const { data: newClient, error: createErr } = await supabase
        .from("clients")
        .insert({
          name: customName.trim(),
          address: workplaceAddress.trim() || null,
          google_maps_link: mapsLink.trim() || null,
          billing_type: "hourly",
          hourly_rate: 0,
          status: "active",
          client_type: "business",
        })
        .select("id")
        .single();
      if (createErr) {
        return toast.error("שגיאה ביצירת לקוח חדש: " + createErr.message);
      }
      finalClientId = newClient.id;
      toast.success(`נוצר לקוח חדש: ${customName.trim()}`);
    }
    update({
      ...buildEditedPatch(),
      status: "approved",
      assigned_client_id: finalClientId,
      assigned_custom_workplace: null,
      approved_at: new Date().toISOString(),
      approved_by: user?.id,
      rejection_reason: null,
    });
  };

  const reject = () => update({ ...buildEditedPatch(), status: "rejected", rejection_reason: reason || null });

  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen(true)}>
        <TableCell>{r.work_date}</TableCell>
        <TableCell className="font-medium">{r.worker_name}</TableCell>
        <TableCell className="text-xs text-muted-foreground">{r.passport_number}</TableCell>
        <TableCell>{r.check_in}–{r.check_out}</TableCell>
        <TableCell>{Number(r.total_hours).toFixed(2)}</TableCell>
        <TableCell className="max-w-[200px] truncate">{r.workplace_description}</TableCell>
        <TableCell>{Number(r.total_payment).toFixed(2)}</TableCell>
        <TableCell>
          <Badge variant="outline" className={statusColor[r.status]}>{r.status}</Badge>
        </TableCell>
      </TableRow>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>דיווח של {r.worker_name} — {r.work_date}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>שם עובד</Label>
                <Input value={workerName} onChange={(e) => setWorkerName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>דרכון</Label>
                <Input value={passport} onChange={(e) => setPassport(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>תאריך</Label>
                <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>שכר/שעה</Label>
                <Input type="number" step="0.01" value={wage} onChange={(e) => setWage(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>שעת כניסה</Label>
                <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>שעת יציאה</Label>
                <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              סה"כ שעות: <strong className="text-foreground">{computedHours.toFixed(2)}</strong> ·
              תשלום מחושב: <strong className="text-foreground">{computedPayment.toFixed(2)}</strong>
            </div>
            <div className="space-y-1">
              <Label>תיאור מקום העבודה</Label>
              <Input value={workplaceDesc} onChange={(e) => setWorkplaceDesc(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>כתובת</Label>
              <Input value={workplaceAddress} onChange={(e) => setWorkplaceAddress(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>קישור למפה</Label>
              <div className="flex gap-2">
                <Input value={mapsLink} onChange={(e) => setMapsLink(e.target.value)} placeholder="https://maps..." />
                {mapsLink && (
                  <a href={mapsLink} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-sm whitespace-nowrap px-2">
                    <MapPin className="h-3 w-3" /> פתח <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>הערות</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="space-y-2">
                <Label>שייך ללקוח קיים</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="בחר לקוח..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-center text-muted-foreground">— או —</div>
              <div className="space-y-2">
                <Label>מקום עבודה חדש (לא ברשימה)</Label>
                <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="למשל: תחנת דלק שדרות" />
              </div>
              <div className="space-y-2">
                <Label>סיבת דחייה (אם דוחה)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="ghost" onClick={resetEdits} disabled={busy || !isDirty}>
              בטל שינויים
            </Button>
            <Button variant="secondary" onClick={saveOnly} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמור שינויים"}
            </Button>
            <Button variant="outline" onClick={() => update({ ...buildEditedPatch(), status: "needs_clarification" })} disabled={busy}>
              ממתין לבירור
            </Button>
            <Button variant="destructive" onClick={reject} disabled={busy}>דחה</Button>
            <Button onClick={approve} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "אשר"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => {
    supabase.from("clients").select("id, name").order("name").then(({ data }) => {
      setClients((data as Client[]) || []);
    });
  }, []);
  return clients;
}

function PendingTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const clients = useClients();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("replacement_reports")
      .select("*")
      .in("status", ["pending", "needs_clarification"])
      .order("created_at", { ascending: false });
    setReports((data as Report[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <Card>
      <CardHeader><CardTitle>דיווחים ממתינים לאישור ({reports.length})</CardTitle></CardHeader>
      <CardContent>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
          reports.length === 0 ? <p className="text-muted-foreground text-center py-6">אין דיווחים ממתינים</p> :
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>תאריך</TableHead><TableHead>עובד</TableHead><TableHead>דרכון</TableHead>
                  <TableHead>שעות</TableHead><TableHead>סה"כ</TableHead><TableHead>מקום</TableHead>
                  <TableHead>תשלום</TableHead><TableHead>סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => <ReportRow key={r.id} r={r} clients={clients} onChanged={load} />)}
              </TableBody>
            </Table>
        }
      </CardContent>
    </Card>
  );
}

function AllReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const clients = useClients();

  const load = async () => {
    setLoading(true);
    let q = supabase.from("replacement_reports").select("*").order("work_date", { ascending: false });
    if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    const { data } = await q;
    setReports((data as Report[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter]);

  const filtered = reports.filter((r) =>
    !search.trim() ||
    r.worker_name.toLowerCase().includes(search.toLowerCase()) ||
    r.passport_number.includes(search) ||
    r.workplace_description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle>כל הדיווחים</CardTitle>
          <div className="ml-auto flex gap-2">
            <Input placeholder="חיפוש לפי שם / דרכון / מקום" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                <SelectItem value="pending">ממתין</SelectItem>
                <SelectItem value="approved">מאושר</SelectItem>
                <SelectItem value="rejected">נדחה</SelectItem>
                <SelectItem value="needs_clarification">בירור</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תאריך</TableHead><TableHead>עובד</TableHead><TableHead>דרכון</TableHead>
                <TableHead>שעות</TableHead><TableHead>סה"כ</TableHead><TableHead>מקום</TableHead>
                <TableHead>תשלום</TableHead><TableHead>סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => <ReportRow key={r.id} r={r} clients={clients} onChanged={load} />)}
            </TableBody>
          </Table>}
      </CardContent>
    </Card>
  );
}

function MonthNav({ month, setMonth }: { month: Date; setMonth: (d: Date) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button size="icon" variant="outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <div className="font-medium w-40 text-center">{fmtMonth(month)}</div>
      <Button size="icon" variant="outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EmployeesTab() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selected, setSelected] = useState<Worker | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [month, setMonth] = useState(monthStart(new Date()));
  const clients = useClients();

  useEffect(() => {
    supabase.from("replacement_workers").select("id, full_name, passport_number, phone").order("full_name")
      .then(({ data }) => setWorkers((data as Worker[]) || []));
  }, []);

  const load = async () => {
    if (!selected) return;
    const start = toLocalISODate(monthStart(month));
    const end = toLocalISODate(monthEnd(month));
    const { data } = await supabase
      .from("replacement_reports")
      .select("*")
      .eq("worker_id", selected.id)
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date");
    setReports((data as Report[]) || []);
  };
  useEffect(() => { load(); }, [selected, month]);

  const totals = useMemo(() => ({
    hours: reports.reduce((s, r) => s + Number(r.total_hours), 0),
    pay: reports.reduce((s, r) => s + Number(r.total_payment), 0),
  }), [reports]);

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">עובדים ({workers.length})</CardTitle></CardHeader>
        <CardContent className="p-2 max-h-[600px] overflow-y-auto">
          {workers.map((w) => (
            <button
              key={w.id}
              onClick={() => setSelected(w)}
              className={`w-full text-right p-2 rounded hover:bg-muted ${selected?.id === w.id ? "bg-muted" : ""}`}
            >
              <div className="font-medium text-sm">{w.full_name}</div>
              <div className="text-xs text-muted-foreground">{w.passport_number}</div>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{selected ? selected.full_name : "בחר עובד"}</CardTitle>
            {selected && <MonthNav month={month} setMonth={setMonth} />}
          </div>
          {selected && (
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>סך שעות: <strong className="text-foreground">{totals.hours.toFixed(2)}</strong></span>
              <span>סך תשלום: <strong className="text-foreground">{totals.pay.toFixed(2)}</strong></span>
              <span>דיווחים: <strong className="text-foreground">{reports.length}</strong></span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {selected && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>תאריך</TableHead><TableHead>עובד</TableHead><TableHead>דרכון</TableHead>
                  <TableHead>שעות</TableHead><TableHead>סה"כ</TableHead><TableHead>מקום</TableHead>
                  <TableHead>תשלום</TableHead><TableHead>סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => <ReportRow key={r.id} r={r} clients={clients} onChanged={load} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ClientsTab() {
  const clients = useClients();
  const [selected, setSelected] = useState<Client | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [month, setMonth] = useState(monthStart(new Date()));

  const load = async () => {
    if (!selected) return;
    const start = toLocalISODate(monthStart(month));
    const end = toLocalISODate(monthEnd(month));
    const { data } = await supabase
      .from("replacement_reports")
      .select("*")
      .eq("assigned_client_id", selected.id)
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date");
    setReports((data as Report[]) || []);
  };
  useEffect(() => { load(); }, [selected, month]);

  const totals = useMemo(() => ({
    hours: reports.reduce((s, r) => s + Number(r.total_hours), 0),
    pay: reports.reduce((s, r) => s + Number(r.total_payment), 0),
  }), [reports]);

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">לקוחות ({clients.length})</CardTitle></CardHeader>
        <CardContent className="p-2 max-h-[600px] overflow-y-auto">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className={`w-full text-right p-2 rounded hover:bg-muted ${selected?.id === c.id ? "bg-muted" : ""}`}
            >
              <div className="font-medium text-sm">{c.name}</div>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{selected ? selected.name : "בחר לקוח"}</CardTitle>
            <div className="flex items-center gap-2">
              {selected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportClientReportPdf(selected, month, reports, totals)}
                >
                  <FileDown className="h-4 w-4 mr-1" /> הורד PDF
                </Button>
              )}
              {selected && <MonthNav month={month} setMonth={setMonth} />}
            </div>
          </div>
          {selected && (
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>סך שעות: <strong className="text-foreground">{totals.hours.toFixed(2)}</strong></span>
              <span>סך תשלום: <strong className="text-foreground">{totals.pay.toFixed(2)}</strong></span>
              <span>דיווחים: <strong className="text-foreground">{reports.length}</strong></span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {selected && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>תאריך</TableHead><TableHead>עובד</TableHead><TableHead>דרכון</TableHead>
                  <TableHead>שעות</TableHead><TableHead>סה"כ</TableHead><TableHead>מקום</TableHead>
                  <TableHead>תשלום</TableHead><TableHead>סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => <ReportRow key={r.id} r={r} clients={clients} onChanged={load} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function exportClientReportPdf(
  client: Client,
  month: Date,
  reports: Report[],
  totals: { hours: number; pay: number },
) {
  const monthLabel = month.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  const escape = (s: any) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rowsHtml = reports
    .map((r) => {
      const place = r.assigned_custom_workplace || r.workplace_description || "";
      return `<tr>
        <td>${escape(r.work_date)}</td>
        <td>${escape(r.worker_name)}</td>
        <td>${escape((r.check_in || "").slice(0, 5))}–${escape((r.check_out || "").slice(0, 5))}</td>
        <td>${Number(r.total_hours).toFixed(2)}</td>
        <td>${escape(place)}</td>
        <td>${escape(r.status)}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"/>
    <title>${escape(client.name)} - ${escape(monthLabel)}</title>
    <style>
      body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; padding: 24px; color: #111; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
      .totals { display: flex; gap: 24px; margin: 12px 0 18px; font-size: 13px; }
      .totals strong { color: #000; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; }
      th { background: #f3f4f6; font-weight: 600; }
      tr:nth-child(even) td { background: #fafafa; }
      @media print { body { padding: 0; } @page { size: A4; margin: 12mm; } }
    </style></head><body>
    <h1>דוח שעות מחליפים — ${escape(client.name)}</h1>
    <div class="sub">${escape(monthLabel)} · נוצר ב-${new Date().toLocaleDateString("he-IL")}</div>
    <div class="totals">
      <span>סך שעות: <strong>${totals.hours.toFixed(2)}</strong></span>
      <span>דיווחים: <strong>${reports.length}</strong></span>
    </div>
    <table>
      <thead><tr>
        <th>תאריך</th><th>עובד</th><th>שעות</th><th>סה"כ</th><th>מקום</th><th>סטטוס</th>
      </tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="6" style="text-align:center;color:#888;padding:20px">אין דיווחים בחודש זה</td></tr>`}</tbody>
    </table>
    <script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    toast.error("הדפדפן חסם את הפתיחה. אפשר חלונות קופצים ונסה שוב.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function ChangesTab() {
  const [items, setItems] = useState<ChangeReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("replacement_change_requests")
      .select("*, replacement_reports(worker_name, work_date)")
      .order("created_at", { ascending: false });
    if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
    const { data } = await q;
    setItems((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter]);

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("replacement_change_requests")
      .update({ status: status as any, handled_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>בקשות שינוי</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">פתוחות</SelectItem>
              <SelectItem value="resolved">טופלו</SelectItem>
              <SelectItem value="dismissed">נדחו</SelectItem>
              <SelectItem value="all">הכל</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> :
          items.length === 0 ? <p className="text-muted-foreground text-center py-6">אין בקשות</p> :
            items.map((c) => (
              <div key={c.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {c.replacement_reports?.worker_name} — {c.replacement_reports?.work_date}
                  </div>
                  <Badge variant="outline">{c.status}</Badge>
                </div>
                <p className="text-sm">{c.description}</p>
                <div className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()}
                </div>
                {c.status === "open" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setStatus(c.id, "resolved")}>סמן כטופל</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "dismissed")}>דחה</Button>
                  </div>
                )}
              </div>
            ))}
      </CardContent>
    </Card>
  );
}
