import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  selectedDate: Date;
  onDateChange?: (date: Date) => void;
}

const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

type RowStatus = "ok" | "missing_in" | "missing_out" | "pending";
type ClientStatus = "ok" | "checking" | "no_work" | "missing";

const CLIENT_STATUS_OPTIONS: { value: ClientStatus; label: string; cls: string; activeCls: string }[] = [
  { value: "ok",       label: "דווח",          cls: "border-success/40 text-success hover:bg-success/10",                 activeCls: "bg-success text-success-foreground border-success hover:bg-success" },
  { value: "checking", label: "בבדיקה",        cls: "border-warning/40 text-warning hover:bg-warning/10",                 activeCls: "bg-warning text-warning-foreground border-warning hover:bg-warning" },
  { value: "no_work",  label: "לא היה עבודה",  cls: "border-purple-400/40 text-purple-500 hover:bg-purple-500/10",        activeCls: "bg-purple-500 text-white border-purple-500 hover:bg-purple-500" },
  { value: "missing",  label: "חסר דיווח",     cls: "border-destructive/40 text-destructive hover:bg-destructive/10",     activeCls: "bg-destructive text-destructive-foreground border-destructive hover:bg-destructive" },
];

export function DailyCheckTab({ selectedDate, onDateChange }: Props) {
  const { user } = useAuth();
  const [inner, setInner] = useState<"today" | "history">("today");
  const [refreshKey, setRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const dow = dayNames[selectedDate.getDay()];

  const [clients, setClients] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Client-level status for non-meckano clients
  const [clientStatus, setClientStatus] = useState<Record<string, { status: ClientStatus; notes: string }>>({});
  const [savingClient, setSavingClient] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, a, s, r, l] = await Promise.all([
        supabase.from("clients").select("id, name, meckano_synced, status").eq("status", "active"),
        supabase.from("employee_client_assignments")
          .select("employee_id, client_id, employees(id, first_name, last_name, status, meckano_synced)")
          .is("end_date", null),
        supabase.from("work_schedules" as any)
          .select("employee_id, client_id, day_of_week, start_time, end_time")
          .eq("day_of_week", dow),
        supabase.from("attendance_records")
          .select("employee_id, client_id, check_in, check_out, hours_worked")
          .eq("date", dateStr),
        supabase.from("daily_check_logs" as any)
          .select("*")
          .eq("check_date", dateStr),
      ]);
      setClients(c.data || []);
      setAssignments(a.data || []);
      setSchedules((s.data as any[]) || []);
      setRecords(r.data || []);
      setLogs((l.data as any[]) || []);

      // Hydrate client-level state from logs where employee_id is null
      const cs: Record<string, { status: ClientStatus; notes: string }> = {};
      ((l.data as any[]) || []).forEach((row) => {
        if (!row.employee_id) {
          const st = (["ok", "checking", "no_work", "missing"].includes(row.status) ? row.status : "missing") as ClientStatus;
          cs[row.client_id] = { status: st, notes: row.notes || "" };
        }
      });
      setClientStatus(cs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, refreshKey]);

  // Build display list:
  // - meckano client: list of meckano employees (with auto-detected status)
  // - non-meckano client: no employees, single client-level row
  const grouped = useMemo(() => {
    const result: { client: any; employees: { id: string; name: string }[] }[] = [];
    const hasAnySchedules = schedules.length > 0;
    for (const client of clients) {
      if (client.meckano_synced) {
        const clientSchedules = schedules.filter((s: any) => s.client_id === client.id);
        const useSchedule = hasAnySchedules && clientSchedules.length > 0;
        const empIds = useSchedule ? new Set(clientSchedules.map((s: any) => s.employee_id)) : null;
        const emps: { id: string; name: string }[] = [];
        assignments
          .filter((a: any) =>
            a.client_id === client.id &&
            a.employees?.status === "active" &&
            a.employees?.meckano_synced === true &&
            (empIds ? empIds.has(a.employee_id) : true)
          )
          .forEach((a: any) => {
            if (!emps.some((e) => e.id === a.employee_id)) {
              emps.push({
                id: a.employee_id,
                name: `${a.employees?.first_name || ""} ${a.employees?.last_name || ""}`.trim(),
              });
            }
          });
        if (emps.length) result.push({ client, employees: emps });
      } else {
        // Non-meckano: only show clients that have at least one active assignment
        const hasAssignment = assignments.some(
          (a: any) => a.client_id === client.id && a.employees?.status === "active"
        );
        if (hasAssignment) result.push({ client, employees: [] });
      }
    }
    return result;
  }, [clients, assignments, schedules]);

  const getRecordStatus = (employeeId: string, clientId: string): RowStatus => {
    const rec = records.find((r: any) => r.employee_id === employeeId && (r.client_id === clientId || !r.client_id));
    const isFuture = new Date(dateStr) > new Date(format(new Date(), "yyyy-MM-dd"));
    if (isFuture) return "pending";
    if (!rec || !rec.check_in) {
      const sch = schedules.find((s: any) => s.employee_id === employeeId && s.client_id === clientId);
      if (sch && new Date(dateStr) === new Date(format(new Date(), "yyyy-MM-dd"))) {
        const [h, m] = String(sch.start_time).split(":").map(Number);
        const sdate = new Date(selectedDate);
        sdate.setHours(h, m, 0, 0);
        if (new Date() < new Date(sdate.getTime() + 15 * 60000)) return "pending";
      }
      return "missing_in";
    }
    if (!rec.check_out) return "missing_out";
    return "ok";
  };

  const labelFor = (s: RowStatus) => {
    if (s === "ok") return { text: "דווח תקין", cls: "bg-success/10 text-success border-success/20" };
    if (s === "missing_out") return { text: "חסרה יציאה", cls: "bg-warning/10 text-warning border-warning/20" };
    if (s === "missing_in") return { text: "חסרה כניסה", cls: "bg-destructive/10 text-destructive border-destructive/20" };
    return { text: "טרם דווח", cls: "bg-muted text-muted-foreground border-border" };
  };

  const handleSyncMeckano = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("meckano-sync", {
        body: { action: "sync_attendance", from: dateStr, to: dateStr },
      });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any).error || "Sync failed");
      toast.success("סונכרן ממכונה");
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setSyncing(false);
    }
  };

  const saveClientStatus = async (clientId: string) => {
    setSavingClient(clientId);
    try {
      const cs = clientStatus[clientId] || { status: "missing" as ClientStatus, notes: "" };
      const row = {
        check_date: dateStr,
        employee_id: null as any,
        client_id: clientId,
        status: cs.status,
        notes: cs.notes || null,
        source: "manual",
        checked_by: user?.id || null,
      };
      // Upsert by (check_date, client_id) for employee_id IS NULL rows
      const { data: existing } = await supabase
        .from("daily_check_logs" as any)
        .select("id")
        .eq("check_date", dateStr)
        .eq("client_id", clientId)
        .is("employee_id", null)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase
          .from("daily_check_logs" as any)
          .update(row)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("daily_check_logs" as any).insert(row);
        if (error) throw error;
      }
      toast.success("נשמר");
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setSavingClient(null);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs value={inner} onValueChange={(v) => setInner(v as any)}>
        <TabsList>
          <TabsTrigger value="today">היום</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onDateChange?.(addDays(selectedDate, -1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium min-w-[110px] text-center">
                  {format(selectedDate, "dd/MM/yyyy")}
                </div>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onDateChange?.(addDays(selectedDate, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              <Button size="sm" onClick={handleSyncMeckano} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                רענן מכונה
              </Button>
            </CardContent>
          </Card>

          {loading && <div className="text-sm text-muted-foreground">טוען…</div>}

          {!loading && grouped.map(({ client, employees }) => {
            if (client.meckano_synced) {
              return (
                <Card key={client.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {client.name}
                      <Badge variant="outline" className="bg-info/10 text-info border-info/20">🔄 מכונה</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {employees.map((e) => {
                      const st = getRecordStatus(e.id, client.id);
                      const lbl = labelFor(st);
                      return (
                        <div key={e.id} className="flex flex-wrap items-center gap-3 border-b pb-2 last:border-0">
                          <div className="min-w-[140px] font-medium text-sm">{e.name}</div>
                          <Badge variant="outline" className={lbl.cls}>{lbl.text}</Badge>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            }
            // Non-meckano: client-level status
            const cs = clientStatus[client.id] || { status: "missing" as ClientStatus, notes: "" };
            return (
              <Card key={client.id} className="border-0 shadow-sm">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {client.name}
                    <Badge variant="outline" className="bg-muted text-muted-foreground">✏️ ידני</Badge>
                  </CardTitle>
                  <Button size="sm" disabled={savingClient === client.id} onClick={() => saveClientStatus(client.id)}>
                    {savingClient === client.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                    שמור
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {CLIENT_STATUS_OPTIONS.map((opt) => {
                      const active = cs.status === opt.value;
                      return (
                        <Button
                          key={opt.value}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={cn("h-8", active ? opt.activeCls : opt.cls)}
                          onClick={() =>
                            setClientStatus((p) => ({ ...p, [client.id]: { ...cs, status: opt.value } }))
                          }
                        >
                          {opt.label}
                        </Button>
                      );
                    })}
                  </div>
                  {(cs.status === "missing" || cs.status === "checking") && (
                    <Input
                      className="h-8"
                      placeholder="הערה (אופציונלי)"
                      value={cs.notes}
                      onChange={(ev) =>
                        setClientStatus((p) => ({ ...p, [client.id]: { ...cs, notes: ev.target.value } }))
                      }
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}

          {!loading && grouped.length === 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                אין לקוחות פעילים ביום זה
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <HistoryView clients={clients} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HistoryView({ clients }: { clients: any[] }) {
  const [month, setMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [clientId, setClientId] = useState<string>("all");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const from = `${month}-01`;
      const d = new Date(`${month}-01`);
      d.setMonth(d.getMonth() + 1);
      d.setDate(0);
      const to = format(d, "yyyy-MM-dd");
      let q = supabase
        .from("daily_check_logs" as any)
        .select("*, employees(first_name, last_name), clients(name)")
        .gte("check_date", from)
        .lte("check_date", to)
        .order("check_date", { ascending: false });
      if (clientId !== "all") q = q.eq("client_id", clientId);
      const { data } = await q;
      setRows((data as any[]) || []);
      setLoading(false);
    })();
  }, [month, clientId]);

  const statusLabel = (s: string) => {
    if (s === "ok") return { text: "דווח", cls: "bg-success/10 text-success border-success/20" };
    if (s === "checking") return { text: "בבדיקה", cls: "bg-warning/10 text-warning border-warning/20" };
    if (s === "no_work") return { text: "לא היה עבודה", cls: "bg-purple-500/10 text-purple-500 border-purple-500/20" };
    if (s === "missing") return { text: "חסר דיווח", cls: "bg-destructive/10 text-destructive border-destructive/20" };
    return { text: "ממתין", cls: "bg-muted text-muted-foreground border-border" };
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 flex flex-row flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">חודש</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">לקוח</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הלקוחות</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>תאריך</TableHead>
              <TableHead>לקוח</TableHead>
              <TableHead>עובד</TableHead>
              <TableHead>סטטוס</TableHead>
              <TableHead>מקור</TableHead>
              <TableHead>הערה</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">טוען…</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">אין רשומות</TableCell></TableRow>
            ) : (
              rows.map((r: any) => {
                const sl = statusLabel(r.status);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{format(new Date(r.check_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-xs">{r.clients?.name || "—"}</TableCell>
                    <TableCell className="text-xs">{r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : "—"}</TableCell>
                    <TableCell><Badge variant="outline" className={sl.cls}>{sl.text}</Badge></TableCell>
                    <TableCell className="text-xs">{r.source === "auto" ? "אוטומטי" : "ידני"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={r.notes || ""}>{r.notes || "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
