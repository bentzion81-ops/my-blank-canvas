import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarIcon, Plus, Search, Loader2, Check, X, Trash2, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";

export type WorkLog = {
  id: string;
  source_table: "attendance" | "replacement_report" | "absence";
  source: "meckano" | "manual" | "worker_form" | "absence";
  employee_id: string | null;
  employee_name: string | null;
  client_id: string | null;
  client_name: string | null;
  custom_workplace: string | null;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  hours_worked: number;
  payment_amount: number;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type Expected = {
  employee_id: string;
  day_type: "weekday" | "friday" | "saturday";
  is_working_day: boolean;
  expected_check_in: string | null;
  expected_check_out: string | null;
};

const sourceLabel: Record<string, string> = {
  meckano: "Meckano",
  manual: "Manual",
  worker_form: "Worker Form",
  absence: "Absence",
};

const sourceColor: Record<string, string> = {
  meckano: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  manual: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  worker_form: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  absence: "bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/20",
};

function statusTone(status: string): "success" | "warning" | "destructive" | "muted" {
  if (["approved", "active"].includes(status)) return "success";
  if (["pending"].includes(status)) return "warning";
  if (["rejected", "no_show"].includes(status)) return "destructive";
  return "muted";
}

const toneClass: Record<string, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  muted: "bg-muted text-muted-foreground border-border",
};

function rowToneClass(exceptions: string[], status: string) {
  if (status === "rejected" || exceptions.some((e) => e.includes("missing"))) return "border-l-4 border-l-destructive";
  if (exceptions.length > 0 || status === "pending") return "border-l-4 border-l-warning";
  if (status === "approved") return "border-l-4 border-l-success";
  return "border-l-4 border-l-muted";
}

interface Props {
  scope?: "global" | "employee" | "client";
  employeeId?: string;
  clientId?: string;
  defaultRange?: DateRange;
  compact?: boolean;
}

export function WorkLogsTable({ scope = "global", employeeId, clientId, defaultRange, compact }: Props) {
  const qc = useQueryClient();
  const today = new Date();
  const [range, setRange] = useState<DateRange | undefined>(
    defaultRange ?? { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today }
  );
  const [search, setSearch] = useState("");
  const [empFilter, setEmpFilter] = useState<string>(employeeId ?? "all");
  const [clientFilter, setClientFilter] = useState<string>(clientId ?? "all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [detail, setDetail] = useState<WorkLog | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const fromStr = range?.from ? format(range.from, "yyyy-MM-dd") : null;
  const toStr = range?.to ? format(range.to, "yyyy-MM-dd") : fromStr;

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ["work-logs-unified", fromStr, toStr, employeeId, clientId],
    queryFn: async () => {
      if (!fromStr || !toStr) return [];
      let q = supabase
        .from("work_logs_unified" as any)
        .select("*")
        .gte("work_date", fromStr)
        .lte("work_date", toStr)
        .order("work_date", { ascending: false });
      if (employeeId) q = q.eq("employee_id", employeeId);
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as WorkLog[];
    },
    enabled: !!fromStr && !!toStr,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-min"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id, first_name, last_name").eq("status", "active").order("first_name");
      return data || [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-min"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").eq("status", "active").order("name");
      return data || [];
    },
  });

  const { data: expected = [] } = useQuery({
    queryKey: ["expected-hours-all"],
    queryFn: async () => {
      const { data } = await supabase.from("employee_expected_hours").select("employee_id, day_type, is_working_day, expected_check_in, expected_check_out");
      return (data || []) as Expected[];
    },
  });

  const expectedMap = useMemo(() => {
    const m = new Map<string, Expected>();
    for (const e of expected) m.set(`${e.employee_id}_${e.day_type}`, e);
    return m;
  }, [expected]);

  function getExceptions(log: WorkLog): string[] {
    const ex: string[] = [];
    if (log.source_table !== "attendance" || !log.employee_id) return ex;
    const dow = parseISO(log.work_date).getDay();
    const dayType = dow === 5 ? "friday" : dow === 6 ? "saturday" : "weekday";
    const exp = expectedMap.get(`${log.employee_id}_${dayType}`);
    if (exp && !exp.is_working_day) ex.push("not scheduled");
    if (log.check_in && !log.check_out) ex.push("missing exit");
    if (exp?.expected_check_in && log.check_in) {
      const expectedTs = new Date(`${log.work_date}T${exp.expected_check_in}`);
      const actual = new Date(log.check_in);
      const diffMin = (actual.getTime() - expectedTs.getTime()) / 60000;
      if (diffMin >= 20) ex.push(`late ${Math.round(diffMin)}m`);
    }
    return ex;
  }

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (search && !(l.employee_name?.toLowerCase().includes(search.toLowerCase()) || l.client_name?.toLowerCase().includes(search.toLowerCase()))) return false;
      if (empFilter !== "all" && l.employee_id !== empFilter) return false;
      if (clientFilter !== "all" && l.client_id !== clientFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      return true;
    });
  }, [logs, search, empFilter, clientFilter, sourceFilter, statusFilter]);

  async function approveReport(id: string) {
    const { error } = await supabase
      .from("replacement_reports")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Approved");
    qc.invalidateQueries({ queryKey: ["work-logs-unified"] });
  }

  async function rejectReport(id: string) {
    const { error } = await supabase
      .from("replacement_reports")
      .update({ status: "rejected" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Rejected");
    qc.invalidateQueries({ queryKey: ["work-logs-unified"] });
  }

  async function deleteLog(log: WorkLog) {
    if (!confirm("Delete this entry?")) return;
    const table = log.source_table === "attendance" ? "attendance_records" : log.source_table === "replacement_report" ? "replacement_reports" : "attendance_absences";
    const { error } = await supabase.from(table as any).delete().eq("id", log.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["work-logs-unified"] });
  }

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Work Logs</CardTitle>
            <Button size="sm" onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Manual entry
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {range?.from ? format(range.from, "dd MMM") : "From"} – {range?.to ? format(range.to, "dd MMM") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="range" selected={range} onSelect={setRange} initialFocus />
              </PopoverContent>
            </Popover>

            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee / site" className="pl-8 h-9 w-[220px]" />
            </div>

            {scope !== "employee" && (
              <Select value={empFilter} onValueChange={setEmpFilter}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {employees.map((e: any) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {scope !== "client" && (
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Work site" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="meckano">Meckano</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="worker_form">Worker form</SelectItem>
                <SelectItem value="absence">Absence</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="no_show">No show</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No work logs in this range</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    {!compact && <TableHead>Work site</TableHead>}
                    <TableHead>Date</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Exceptions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => {
                    const ex = getExceptions(log);
                    const tone = statusTone(log.status);
                    return (
                      <TableRow key={`${log.source_table}_${log.id}`} className={cn("cursor-pointer", rowToneClass(ex, log.status))} onClick={() => setDetail(log)}>
                        <TableCell className="font-medium">{log.employee_name || "—"}</TableCell>
                        {!compact && <TableCell>{log.client_name || log.custom_workplace || "—"}</TableCell>}
                        <TableCell>{format(parseISO(log.work_date), "dd MMM yyyy")}</TableCell>
                        <TableCell className="tabular-nums">
                          {log.check_in ? format(new Date(log.check_in), "HH:mm") : "—"}
                          {" – "}
                          {log.check_out ? format(new Date(log.check_out), "HH:mm") : "—"}
                          <span className="text-muted-foreground ml-2">({Number(log.hours_worked).toFixed(1)}h)</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[11px]", sourceColor[log.source])}>{sourceLabel[log.source]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[11px] capitalize", toneClass[tone])}>{log.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {ex.length === 0 ? (
                            <span className="text-xs text-success">OK</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {ex.map((e) => <Badge key={e} variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">{e}</Badge>)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetail(log)}><Eye className="h-3.5 w-3.5" /></Button>
                            {log.source_table === "replacement_report" && log.status === "pending" && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={() => approveReport(log.id)}><Check className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => rejectReport(log.id)}><X className="h-3.5 w-3.5" /></Button>
                              </>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteLog(log)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <DetailDialog log={detail} onClose={() => setDetail(null)} expected={expectedMap} />
      <ManualEntryDialog open={manualOpen} onClose={() => { setManualOpen(false); refetch(); }} employees={employees} clients={clients} defaultEmployeeId={employeeId} defaultClientId={clientId} />
    </div>
  );
}

function DetailDialog({ log, onClose, expected }: { log: WorkLog | null; onClose: () => void; expected: Map<string, Expected> }) {
  if (!log) return null;
  const dow = parseISO(log.work_date).getDay();
  const dayType = dow === 5 ? "friday" : dow === 6 ? "saturday" : "weekday";
  const exp = log.employee_id ? expected.get(`${log.employee_id}_${dayType}`) : null;

  return (
    <Dialog open={!!log} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{log.employee_name}</DialogTitle>
          <DialogDescription>{format(parseISO(log.work_date), "EEEE, dd MMMM yyyy")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Source: </span><Badge variant="outline" className={sourceColor[log.source]}>{sourceLabel[log.source]}</Badge></div>
            <div><span className="text-muted-foreground">Status: </span><span className="capitalize">{log.status}</span></div>
            <div><span className="text-muted-foreground">Work site: </span>{log.client_name || log.custom_workplace || "—"}</div>
            <div><span className="text-muted-foreground">Hours: </span>{Number(log.hours_worked).toFixed(2)}h</div>
            <div><span className="text-muted-foreground">Check in: </span>{log.check_in ? format(new Date(log.check_in), "HH:mm") : "—"}</div>
            <div><span className="text-muted-foreground">Check out: </span>{log.check_out ? format(new Date(log.check_out), "HH:mm") : "—"}</div>
          </div>

          {exp && exp.is_working_day && (
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="text-xs font-medium mb-1">Planned vs actual</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Planned: </span>{exp.expected_check_in || "—"} – {exp.expected_check_out || "—"}</div>
                <div><span className="text-muted-foreground">Actual: </span>
                  {log.check_in ? format(new Date(log.check_in), "HH:mm") : "—"} – {log.check_out ? format(new Date(log.check_out), "HH:mm") : "—"}
                </div>
              </div>
            </div>
          )}

          {log.payment_amount > 0 && (
            <div><span className="text-muted-foreground">Payment: </span>₪{Number(log.payment_amount).toFixed(2)}</div>
          )}

          {log.notes && (
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="text-xs font-medium mb-1">Notes</div>
              <div className="text-xs whitespace-pre-wrap">{log.notes}</div>
            </div>
          )}

          <div className="text-xs text-muted-foreground border-t pt-2">
            Created: {format(new Date(log.created_at), "dd MMM yyyy HH:mm")} · Updated: {format(new Date(log.updated_at), "dd MMM yyyy HH:mm")}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManualEntryDialog({
  open, onClose, employees, clients, defaultEmployeeId, defaultClientId,
}: {
  open: boolean; onClose: () => void; employees: any[]; clients: any[];
  defaultEmployeeId?: string; defaultClientId?: string;
}) {
  const [mode, setMode] = useState<"detailed" | "quick">("detailed");
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId || "");
  const [clientId, setClientId] = useState(defaultClientId || "");
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [checkIn, setCheckIn] = useState("08:00");
  const [checkOut, setCheckOut] = useState("17:00");
  const [hours, setHours] = useState("8");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!employeeId || !date) return toast.error("Employee and date are required");
    setSaving(true);
    try {
      let payload: any = {
        employee_id: employeeId,
        client_id: clientId || null,
        date,
        source: "manual",
        notes: notes || null,
      };
      if (mode === "detailed") {
        const ci = new Date(`${date}T${checkIn}`);
        let co = new Date(`${date}T${checkOut}`);
        // Handle overnight shifts (e.g., 20:00 → 00:00 next day)
        if (co.getTime() <= ci.getTime()) {
          co = new Date(co.getTime() + 24 * 3600000);
        }
        payload.check_in = ci.toISOString();
        payload.check_out = co.toISOString();
        payload.hours_worked = (co.getTime() - ci.getTime()) / 3600000;
      } else {
        payload.hours_worked = Number(hours) || 0;
      }
      const { error } = await supabase.from("attendance_records").insert(payload);
      if (error) throw error;
      toast.success("Entry added");
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual work log entry</DialogTitle>
          <DialogDescription>Add an attendance record manually</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "detailed" ? "default" : "outline"} onClick={() => setMode("detailed")}>Detailed</Button>
            <Button size="sm" variant={mode === "quick" ? "default" : "outline"} onClick={() => setMode("quick")}>Quick</Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Employee *</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Work site</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {mode === "detailed" ? (
              <>
                <div className="space-y-1">
                  <Label>Check in</Label>
                  <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Check out</Label>
                  <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label>Total hours</Label>
                <Input type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
