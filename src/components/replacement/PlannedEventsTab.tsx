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
import { Loader2, Plus, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type Client = { id: string; name: string };
type Worker = { id: string; full_name: string; passport_number: string };

type PlannedEvent = {
  id: string;
  title: string;
  client_id: string | null;
  custom_workplace: string | null;
  workplace_address: string | null;
  maps_link: string | null;
  worker_id: string | null;
  recurrence: "none" | "weekly" | "monthly";
  event_date: string | null;
  weekday: number | null;
  monthly_day: number | null;
  next_occurrence: string | null;
  expected_check_in: string | null;
  expected_check_out: string | null;
  expected_hours: number;
  hourly_wage: number;
  expected_payment: number;
  status: "scheduled" | "pending_fill" | "completed" | "cancelled";
  notes: string | null;
};

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const RECURRENCE_LABEL = { none: "חד פעמי", weekly: "שבועי", monthly: "חודשי" };

function computeNextOccurrence(rec: "none" | "weekly" | "monthly", eventDate: string | null, weekday: number | null, monthlyDay: number | null, fromDate?: Date): string | null {
  const today = fromDate || new Date();
  today.setHours(0, 0, 0, 0);
  if (rec === "none") return eventDate;
  if (rec === "weekly" && weekday !== null) {
    const d = new Date(today);
    const diff = (weekday - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }
  if (rec === "monthly" && monthlyDay !== null) {
    const d = new Date(today.getFullYear(), today.getMonth(), monthlyDay);
    if (d < today) d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export default function PlannedEventsTab() {
  const { user } = useAuth();
  const [events, setEvents] = useState<PlannedEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [fillEvent, setFillEvent] = useState<PlannedEvent | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: ws }, { data: evs }] = await Promise.all([
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("replacement_workers").select("id, full_name, passport_number").order("full_name"),
      supabase.from("replacement_planned_events").select("*").in("status", ["scheduled", "pending_fill"]).order("next_occurrence", { ascending: true }),
    ]);
    setClients((cs as Client[]) || []);
    setWorkers((ws as Worker[]) || []);

    // Auto-mark pending_fill for past occurrences and refresh next_occurrence for recurring
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const toUpdate: string[] = [];
    const list: PlannedEvent[] = [];
    for (const e of (evs as any[]) || []) {
      const nextDate = e.next_occurrence ? new Date(e.next_occurrence) : null;
      if (e.status === "scheduled" && nextDate && nextDate < today) {
        toUpdate.push(e.id);
        list.push({ ...e, status: "pending_fill" });
      } else {
        list.push(e);
      }
    }
    if (toUpdate.length) {
      await supabase.from("replacement_planned_events").update({ status: "pending_fill" }).in("id", toUpdate);
    }
    setEvents(list);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const pendingFill = useMemo(() => events.filter(e => e.status === "pending_fill"), [events]);
  const upcoming = useMemo(() => events.filter(e => e.status === "scheduled"), [events]);

  const remove = async (id: string) => {
    if (!confirm("למחוק את האירוע?")) return;
    const { error } = await supabase.from("replacement_planned_events").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("נמחק");
    load();
  };

  const clientName = (id: string | null, custom: string | null) =>
    id ? (clients.find(c => c.id === id)?.name || "—") : (custom || "—");
  const workerName = (id: string | null) =>
    id ? (workers.find(w => w.id === id)?.full_name || "—") : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setOpenNew(true)}><Plus className="h-4 w-4" /> אירוע חדש</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            ממתינים למילוי ({pendingFill.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div> :
            pendingFill.length === 0 ? <p className="text-muted-foreground text-center py-4 text-sm">אין אירועים שעברו מועד</p> :
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead><TableHead>אירוע</TableHead><TableHead>לקוח</TableHead>
                    <TableHead>עובד</TableHead><TableHead>חזרה</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingFill.map(e => (
                    <TableRow key={e.id}>
                      <TableCell>{e.next_occurrence}</TableCell>
                      <TableCell className="font-medium">{e.title}</TableCell>
                      <TableCell>{clientName(e.client_id, e.custom_workplace)}</TableCell>
                      <TableCell>{workerName(e.worker_id)}</TableCell>
                      <TableCell><Badge variant="outline">{RECURRENCE_LABEL[e.recurrence]}</Badge></TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => setFillEvent(e)}>
                          <CheckCircle2 className="h-4 w-4" /> מלא ואשר
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          }
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>אירועים עתידיים ({upcoming.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? null :
            upcoming.length === 0 ? <p className="text-muted-foreground text-center py-4 text-sm">אין אירועים מתוכננים</p> :
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מועד הבא</TableHead><TableHead>אירוע</TableHead><TableHead>לקוח / מקום</TableHead>
                    <TableHead>עובד</TableHead><TableHead>חזרה</TableHead><TableHead>שעות</TableHead>
                    <TableHead>תשלום צפוי</TableHead><TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcoming.map(e => (
                    <TableRow key={e.id}>
                      <TableCell>{e.next_occurrence}</TableCell>
                      <TableCell className="font-medium">{e.title}</TableCell>
                      <TableCell>{clientName(e.client_id, e.custom_workplace)}</TableCell>
                      <TableCell>{workerName(e.worker_id)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{RECURRENCE_LABEL[e.recurrence]}</Badge>
                        {e.recurrence === "weekly" && e.weekday !== null && <span className="text-xs text-muted-foreground ml-1">({WEEKDAYS[e.weekday]})</span>}
                        {e.recurrence === "monthly" && e.monthly_day !== null && <span className="text-xs text-muted-foreground ml-1">(יום {e.monthly_day})</span>}
                      </TableCell>
                      <TableCell>{e.expected_check_in && e.expected_check_out ? `${e.expected_check_in}–${e.expected_check_out}` : "—"}</TableCell>
                      <TableCell>{Number(e.expected_payment).toFixed(2)}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          }
        </CardContent>
      </Card>

      <PlannedEventDialog
        open={openNew}
        onClose={() => setOpenNew(false)}
        clients={clients}
        workers={workers}
        userId={user?.id || null}
        onSaved={() => { setOpenNew(false); load(); }}
      />

      <FillEventDialog
        event={fillEvent}
        clients={clients}
        workers={workers}
        onClose={() => setFillEvent(null)}
        onDone={() => { setFillEvent(null); load(); }}
      />
    </div>
  );
}

function PlannedEventDialog({
  open, onClose, clients, workers, userId, onSaved,
}: {
  open: boolean; onClose: () => void; clients: Client[]; workers: Worker[]; userId: string | null; onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [recurrence, setRecurrence] = useState<"none" | "weekly" | "monthly">("none");
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [weekday, setWeekday] = useState<string>("0");
  const [monthlyDay, setMonthlyDay] = useState<string>("1");
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

  const submit = async () => {
    if (!title.trim()) return toast.error("נדרש שם אירוע");
    if (!clientId && !customWorkplace.trim()) return toast.error("יש לבחור לקוח או להזין מקום עבודה");
    setBusy(true);
    const wd = recurrence === "weekly" ? parseInt(weekday) : null;
    const md = recurrence === "monthly" ? parseInt(monthlyDay) : null;
    const ed = recurrence === "none" ? eventDate : null;
    const next = computeNextOccurrence(recurrence, ed, wd, md);
    const { error } = await supabase.from("replacement_planned_events").insert({
      title: title.trim(),
      client_id: clientId || null,
      custom_workplace: clientId ? null : customWorkplace.trim(),
      worker_id: workerId || null,
      recurrence,
      event_date: ed,
      weekday: wd,
      monthly_day: md,
      next_occurrence: next,
      expected_check_in: checkIn,
      expected_check_out: checkOut,
      expected_hours: hours,
      hourly_wage: wageNum,
      expected_payment: hours * wageNum,
      status: "scheduled",
      notes: notes.trim() || null,
      created_by: userId,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("אירוע נשמר");
    onSaved();
    setTitle(""); setNotes(""); setWage(""); setClientId(""); setCustomWorkplace(""); setWorkerId("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>אירוע מתוכנן חדש</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-2"><Label>שם האירוע *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>סוג חזרה</Label>
            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">חד פעמי</SelectItem>
                <SelectItem value="weekly">שבועי - יום קבוע</SelectItem>
                <SelectItem value="monthly">חודשי - תאריך קבוע</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {recurrence === "none" && (
            <div className="space-y-2"><Label>תאריך</Label><Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></div>
          )}
          {recurrence === "weekly" && (
            <div className="space-y-2">
              <Label>יום בשבוע</Label>
              <Select value={weekday} onValueChange={setWeekday}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {recurrence === "monthly" && (
            <div className="space-y-2"><Label>תאריך בחודש (1-31)</Label><Input type="number" min="1" max="31" value={monthlyDay} onChange={(e) => setMonthlyDay(e.target.value)} /></div>
          )}
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
          <div className="space-y-2"><Label>מקום עבודה חופשי</Label><Input value={customWorkplace} onChange={(e) => setCustomWorkplace(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>עובד (אופציונלי)</Label>
            <Select value={workerId} onValueChange={setWorkerId}>
              <SelectTrigger><SelectValue placeholder="בחר..." /></SelectTrigger>
              <SelectContent>
                {workers.map((w) => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>כניסה</Label><Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
            <div className="space-y-2"><Label>יציאה</Label><Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
            <div className="space-y-2"><Label>שכר/שעה</Label><Input type="number" value={wage} onChange={(e) => setWage(e.target.value)} /></div>
          </div>
          <div className="text-sm text-muted-foreground">
            שעות: <strong className="text-foreground">{hours.toFixed(2)}</strong> · תשלום צפוי: <strong className="text-foreground">{(hours * wageNum).toFixed(2)}</strong>
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

function FillEventDialog({
  event, clients, workers, onClose, onDone,
}: {
  event: PlannedEvent | null;
  clients: Client[];
  workers: Worker[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [workerId, setWorkerId] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [wage, setWage] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (event) {
      setWorkerId(event.worker_id || "");
      setCheckIn(event.expected_check_in || "08:00");
      setCheckOut(event.expected_check_out || "17:00");
      setWage(String(event.hourly_wage || ""));
      setNotes(event.notes || "");
    }
  }, [event]);

  if (!event) return null;

  const hours = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const [h1, m1] = checkIn.split(":").map(Number);
    const [h2, m2] = checkOut.split(":").map(Number);
    return Math.max(0, (h2 * 60 + m2 - h1 * 60 - m1) / 60);
  }, [checkIn, checkOut]);
  const wageNum = parseFloat(wage) || 0;

  const submit = async () => {
    if (!workerId) return toast.error("יש לבחור עובד");
    setBusy(true);
    // Mark this event as completed with actual values
    const { error: e1 } = await supabase.from("replacement_planned_events").update({
      worker_id: workerId,
      expected_check_in: checkIn,
      expected_check_out: checkOut,
      expected_hours: hours,
      hourly_wage: wageNum,
      expected_payment: hours * wageNum,
      notes: notes.trim() || null,
      status: "completed",
    }).eq("id", event.id);
    if (e1) { setBusy(false); return toast.error(e1.message); }

    // If recurring, create the next occurrence as a scheduled event
    if (event.recurrence !== "none") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const next = computeNextOccurrence(event.recurrence, null, event.weekday, event.monthly_day, tomorrow);
      await supabase.from("replacement_planned_events").insert({
        title: event.title,
        client_id: event.client_id,
        custom_workplace: event.custom_workplace,
        worker_id: event.worker_id,
        recurrence: event.recurrence,
        weekday: event.weekday,
        monthly_day: event.monthly_day,
        next_occurrence: next,
        expected_check_in: event.expected_check_in,
        expected_check_out: event.expected_check_out,
        expected_hours: event.expected_hours,
        hourly_wage: event.hourly_wage,
        expected_payment: event.expected_payment,
        status: "scheduled",
        notes: event.notes,
      });
    }
    setBusy(false);
    toast.success("האירוע אושר ועבר ללשונית האירועים המאושרים");
    onDone();
  };

  const clientName = event.client_id
    ? (clients.find(c => c.id === event.client_id)?.name || "—")
    : (event.custom_workplace || "—");

  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>מילוי פרטי אירוע: {event.title}</DialogTitle></DialogHeader>
        <div className="grid gap-3 text-sm">
          <div className="rounded-md bg-muted/50 p-3 space-y-1">
            <div><strong>מקום:</strong> {clientName}</div>
            <div><strong>תאריך:</strong> {event.next_occurrence}</div>
          </div>
          <div className="space-y-2">
            <Label>עובד שביצע *</Label>
            <Select value={workerId} onValueChange={setWorkerId}>
              <SelectTrigger><SelectValue placeholder="בחר עובד..." /></SelectTrigger>
              <SelectContent>
                {workers.map((w) => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>כניסה בפועל</Label><Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
            <div className="space-y-2"><Label>יציאה בפועל</Label><Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
            <div className="space-y-2"><Label>שכר/שעה</Label><Input type="number" value={wage} onChange={(e) => setWage(e.target.value)} /></div>
          </div>
          <div className="text-sm text-muted-foreground">
            שעות: <strong className="text-foreground">{hours.toFixed(2)}</strong> · תשלום: <strong className="text-foreground">{(hours * wageNum).toFixed(2)}</strong>
          </div>
          <div className="space-y-2"><Label>הערות</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>סגור</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "אשר ושלח לאירועים מאושרים"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
