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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, Settings } from "lucide-react";
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
  const [closure, setClosure] = useState<any | null>(null);
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(false);

  // Client-level status for non-meckano clients
  const [clientStatus, setClientStatus] = useState<Record<string, { status: ClientStatus; notes: string }>>({});
  const [savingClient, setSavingClient] = useState<string | null>(null);
  const [savingEmp, setSavingEmp] = useState<string | null>(null);

  // employees marked no_work today: key = `${clientId}::${employeeId}`
  const empNoWork = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((r: any) => {
      if (r.employee_id && r.status === "no_work") s.add(`${r.client_id}::${r.employee_id}`);
    });
    return s;
  }, [logs]);

  const toggleEmpNoWork = async (clientId: string, employeeId: string, makeNoWork: boolean) => {
    const key = `${clientId}::${employeeId}`;
    setSavingEmp(key);
    try {
      if (makeNoWork) {
        // upsert
        const { data: existing } = await supabase
          .from("daily_check_logs" as any)
          .select("id")
          .eq("check_date", dateStr)
          .eq("client_id", clientId)
          .eq("employee_id", employeeId)
          .maybeSingle();
        const row = {
          check_date: dateStr,
          client_id: clientId,
          employee_id: employeeId,
          status: "no_work",
          source: "manual",
          checked_by: user?.id || null,
        };
        const ex = existing as any;
        if (ex?.id) {
          const { error } = await supabase.from("daily_check_logs" as any).update(row).eq("id", ex.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("daily_check_logs" as any).insert(row);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("daily_check_logs" as any)
          .delete()
          .eq("check_date", dateStr)
          .eq("client_id", clientId)
          .eq("employee_id", employeeId);
        if (error) throw error;
      }
      toast.success(makeNoWork ? "סומן: לא היה עבודה" : "בוטל");
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setSavingEmp(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [c, a, s, r, l, cl] = await Promise.all([
        supabase.from("clients").select("id, name, meckano_synced, status, exclude_from_daily_check" as any).eq("status", "active"),
        supabase.from("employee_client_assignments")
          .select("employee_id, client_id, employees(id, first_name, last_name, status, meckano_synced, exclude_from_daily_check, israeli_phone, foreign_phone)")
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
        supabase.from("daily_check_closures" as any)
          .select("*")
          .eq("check_date", dateStr)
          .maybeSingle(),
      ]);
      setClients(c.data || []);
      setAssignments(a.data || []);
      setSchedules((s.data as any[]) || []);
      setRecords(r.data || []);
      setLogs((l.data as any[]) || []);
      setClosure((cl as any)?.data || null);

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
    const result: { client: any; isMeckano: boolean; employees: { id: string; name: string; israeli_phone?: string; foreign_phone?: string }[] }[] = [];
    const hasAnySchedules = schedules.length > 0;
    for (const client of clients) {
      if (client.exclude_from_daily_check) continue;
      // Meckano employees assigned to this client (excluding hidden ones)
      const meckanoAssigns = assignments.filter(
        (a: any) =>
          a.client_id === client.id &&
          a.employees?.status === "active" &&
          a.employees?.meckano_synced === true &&
          !a.employees?.exclude_from_daily_check
      );
      const isMeckano = client.meckano_synced || meckanoAssigns.length > 0;

      if (isMeckano) {
        const clientSchedules = schedules.filter((s: any) => s.client_id === client.id);
        const useSchedule = hasAnySchedules && clientSchedules.length > 0;
        const empIds = useSchedule ? new Set(clientSchedules.map((s: any) => s.employee_id)) : null;
        const emps: { id: string; name: string; israeli_phone?: string; foreign_phone?: string }[] = [];
        meckanoAssigns
          .filter((a: any) => (empIds ? empIds.has(a.employee_id) : true))
          .forEach((a: any) => {
            if (!emps.some((e) => e.id === a.employee_id)) {
              emps.push({
                id: a.employee_id,
                name: `${a.employees?.first_name || ""} ${a.employees?.last_name || ""}`.trim(),
                israeli_phone: a.employees?.israeli_phone,
                foreign_phone: a.employees?.foreign_phone,
              });
            }
          });
        result.push({ client, isMeckano: true, employees: emps });
      } else {
        result.push({ client, isMeckano: false, employees: [] });
      }
    }
    return result;
  }, [clients, assignments, schedules]);

  // Meckano-synced active employees with NO active client assignment
  const unassignedMeckano = useMemo(() => {
    const assignedIds = new Set(
      assignments
        .filter((a: any) => a.employees?.status === "active")
        .map((a: any) => a.employee_id),
    );
    return allMeckanoEmployees.filter((e: any) => !assignedIds.has(e.id));
  }, [assignments, allMeckanoEmployees]);


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

  const saveClientStatus = async (clientId: string, overrideStatus?: ClientStatus) => {
    setSavingClient(clientId);
    try {
      const current = clientStatus[clientId] || { status: "missing" as ClientStatus, notes: "" };
      const cs = overrideStatus ? { ...current, status: overrideStatus } : current;
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
      const existingRow = existing as any;
      if (existingRow?.id) {
        const { error } = await supabase
          .from("daily_check_logs" as any)
          .update(row)
          .eq("id", existingRow.id);
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

  const clearClientStatus = async (clientId: string) => {
    setSavingClient(clientId);
    try {
      const { error } = await supabase
        .from("daily_check_logs" as any)
        .delete()
        .eq("check_date", dateStr)
        .eq("client_id", clientId)
        .is("employee_id", null);
      if (error) throw error;
      setClientStatus((p) => {
        const n = { ...p };
        delete n[clientId];
        return n;
      });
      toast.success("בוטל");
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setSavingClient(null);
    }
  };

  // Readiness: all displayed rows are OK (or no_work). Counts what's left.
  const readiness = useMemo(() => {
    let pending = 0;
    let total = 0;
    for (const { client, isMeckano, employees } of grouped) {
      if (isMeckano) {
        const override = clientStatus[client.id];
        if (override?.status === "no_work") { total += 1; continue; }
        const activeEmps = employees.filter((e) => !empNoWork.has(`${client.id}::${e.id}`));
        if (activeEmps.length === 0) { total += 1; continue; }
        for (const e of activeEmps) {
          total += 1;
          const st = getRecordStatus(e.id, client.id);
          if (st !== "ok") pending += 1;
        }
      } else {
        total += 1;
        const cs = clientStatus[client.id];
        if (!cs || (cs.status !== "ok" && cs.status !== "no_work")) pending += 1;
      }
    }
    return { pending, total, ready: total > 0 && pending === 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, clientStatus, empNoWork, records, schedules, dateStr]);

  // Sort: pending/issues on top, resolved (OK / no work) at bottom
  const sortedGrouped = useMemo(() => {
    const isResolved = (g: typeof grouped[number]) => {
      const { client, isMeckano, employees } = g;
      const override = clientStatus[client.id];
      if (isMeckano) {
        if (override?.status === "no_work") return true;
        const activeEmps = employees.filter((e) => !empNoWork.has(`${client.id}::${e.id}`));
        if (activeEmps.length === 0) return true;
        return activeEmps.every((e) => getRecordStatus(e.id, client.id) === "ok");
      }
      const cs = clientStatus[client.id];
      return !!cs && (cs.status === "ok" || cs.status === "no_work");
    };
    return [...grouped].sort((a, b) => {
      const ra = isResolved(a) ? 1 : 0;
      const rb = isResolved(b) ? 1 : 0;
      return ra - rb;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, clientStatus, empNoWork, records, schedules, dateStr]);

  const closeCheck = async () => {
    setClosing(true);
    try {
      if (closure) {
        const { error } = await supabase.from("daily_check_closures" as any).delete().eq("id", closure.id);
        if (error) throw error;
        toast.success("הסגירה בוטלה");
      } else {
        const { error } = await supabase.from("daily_check_closures" as any).insert({
          check_date: dateStr,
          closed_by: user?.id || null,
        });
        if (error) throw error;
        toast.success("הבדיקה נסגרה");
      }
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setClosing(false);
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
                <div className="text-sm font-medium min-w-[170px] text-center">
                  {["יום ראשון","יום שני","יום שלישי","יום רביעי","יום חמישי","יום שישי","שבת"][selectedDate.getDay()]}, {format(selectedDate, "dd/MM/yyyy")}
                </div>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onDateChange?.(addDays(selectedDate, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <ExclusionsDialog onChanged={() => setRefreshKey((k) => k + 1)} />
                <Button size="sm" onClick={handleSyncMeckano} disabled={syncing}>
                  {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  רענן מכונה
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading && <div className="text-sm text-muted-foreground">טוען…</div>}

          {!loading && sortedGrouped.map(({ client, isMeckano, employees }) => {
            if (isMeckano) {
              const override = clientStatus[client.id];
              const isNoWork = override?.status === "no_work";

              // Aggregate skips employees marked no_work
              const statuses = employees
                .filter((e) => !empNoWork.has(`${client.id}::${e.id}`))
                .map((e) => getRecordStatus(e.id, client.id));
              let agg: { text: string; cls: string };
              if (isNoWork) {
                agg = { text: "לא היה עבודה", cls: "bg-purple-500/10 text-purple-500 border-purple-500/20" };
              } else if (statuses.length === 0) {
                agg = { text: "אין עובדים", cls: "bg-muted text-muted-foreground border-border" };
              } else if (statuses.some((s) => s === "missing_in")) {
                agg = { text: "חסר כניסה", cls: "bg-destructive/10 text-destructive border-destructive/20" };
              } else if (statuses.some((s) => s === "missing_out")) {
                agg = { text: "חסרה יציאה", cls: "bg-warning/10 text-warning border-warning/20" };
              } else if (statuses.every((s) => s === "ok")) {
                agg = { text: "דווח תקין", cls: "bg-success/10 text-success border-success/20" };
              } else {
                agg = { text: "טרם דווח", cls: "bg-muted text-muted-foreground border-border" };
              }
              return (
                <Card key={client.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                    <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                      {client.name}
                      <Badge variant="outline" className="bg-info/10 text-info border-info/20">🔄 מכונה</Badge>
                      <Badge variant="outline" className={agg.cls}>{agg.text}</Badge>
                    </CardTitle>
                    {isNoWork ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingClient === client.id}
                        onClick={() => clearClientStatus(client.id)}
                      >
                        בטל
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-purple-400/40 text-purple-500 hover:bg-purple-500/10"
                        disabled={savingClient === client.id}
                        onClick={() => {
                          setClientStatus((p) => ({ ...p, [client.id]: { status: "no_work", notes: "" } }));
                          saveClientStatus(client.id, "no_work");
                        }}
                      >
                        {savingClient === client.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                        לא היה עבודה
                      </Button>
                    )}
                  </CardHeader>
                  {!isNoWork && (
                    <CardContent className="space-y-3">
                      {employees.map((e) => {
                        const key = `${client.id}::${e.id}`;
                        const empNW = empNoWork.has(key);
                        const st = getRecordStatus(e.id, client.id);
                        const lbl = labelFor(st);
                        return (
                          <div key={e.id} className="flex flex-wrap items-center gap-3 border-b pb-2 last:border-0">
                            <div className="min-w-[140px]">
                              <div className="font-medium text-sm">{e.name}</div>
                              {(e.israeli_phone || e.foreign_phone) && (
                                <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                                  {[e.israeli_phone, e.foreign_phone].filter(Boolean).join(" · ")}
                                </div>
                              )}
                            </div>
                            {empNW ? (
                              <Badge variant="outline" className="bg-purple-500/10 text-purple-500 border-purple-500/20">לא היה עבודה</Badge>
                            ) : (
                              <Badge variant="outline" className={lbl.cls}>{lbl.text}</Badge>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className={cn("h-7 ml-auto", !empNW && "border-purple-400/40 text-purple-500 hover:bg-purple-500/10")}
                              disabled={savingEmp === key}
                              onClick={() => toggleEmpNoWork(client.id, e.id, !empNW)}
                            >
                              {savingEmp === key ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                              {empNW ? "בטל" : "לא עבד"}
                            </Button>
                          </div>
                        );
                      })}
                    </CardContent>
                  )}
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

          {!loading && grouped.length > 0 && (
            <Card className="border-0 shadow-sm sticky bottom-2">
              <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  {closure ? (
                    <span className="text-success font-medium">
                      ✓ הבדיקה נסגרה {closure.closed_at ? `(${format(new Date(closure.closed_at), "dd/MM/yyyy HH:mm")})` : ""}
                    </span>
                  ) : readiness.ready ? (
                    <span className="text-success font-medium">כל הדיווחים תקינים — ניתן לסגור את הבדיקה</span>
                  ) : (
                    <span className="text-muted-foreground">
                      נותרו {readiness.pending} מתוך {readiness.total} שורות לסגירה (יש לסמן דווח / לא היה עבודה / לא עבד)
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={closure ? "outline" : "default"}
                  disabled={closing || (!closure && !readiness.ready)}
                  onClick={closeCheck}
                >
                  {closing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  {closure ? "בטל סגירה" : "סגור בדיקה"}
                </Button>
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
  const [closures, setClosures] = useState<any[]>([]);
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
      const [{ data }, { data: cl }] = await Promise.all([
        q,
        supabase.from("daily_check_closures" as any).select("check_date").gte("check_date", from).lte("check_date", to),
      ]);
      setRows((data as any[]) || []);
      setClosures((cl as any[]) || []);
      setLoading(false);
    })();
  }, [month, clientId]);

  const unclosedDays = useMemo(() => {
    const closedSet = new Set((closures || []).map((c: any) => c.check_date));
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const today = format(new Date(), "yyyy-MM-dd");
    const days: string[] = [];
    for (let day = 1; day <= lastDay; day++) {
      const ds = `${month}-${String(day).padStart(2, "0")}`;
      if (ds > today) break;
      if (!closedSet.has(ds)) days.push(ds);
    }
    return days.reverse();
  }, [closures, month]);

  const dayName = (ds: string) => ["יום ראשון","יום שני","יום שלישי","יום רביעי","יום חמישי","יום שישי","שבת"][new Date(ds).getDay()];

  const statusLabel = (s: string) => {
    if (s === "ok") return { text: "דווח", cls: "bg-success/10 text-success border-success/20" };
    if (s === "checking") return { text: "בבדיקה", cls: "bg-warning/10 text-warning border-warning/20" };
    if (s === "no_work") return { text: "לא היה עבודה", cls: "bg-purple-500/10 text-purple-500 border-purple-500/20" };
    if (s === "missing") return { text: "חסר דיווח", cls: "bg-destructive/10 text-destructive border-destructive/20" };
    return { text: "ממתין", cls: "bg-muted text-muted-foreground border-border" };
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            ימים שלא נסגרו
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
              {unclosedDays.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="text-sm text-muted-foreground">טוען…</div>
          ) : unclosedDays.length === 0 ? (
            <div className="text-sm text-muted-foreground">כל הימים בחודש נסגרו ✓</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unclosedDays.map((ds) => (
                <Badge key={ds} variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                  {dayName(ds)} {format(new Date(ds), "dd/MM/yyyy")}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}

function ExclusionsDialog({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"clients" | "employees">("clients");
  const [clients, setClients] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, e] = await Promise.all([
        supabase
          .from("clients")
          .select("id, name, exclude_from_daily_check" as any)
          .eq("status", "active")
          .order("name"),
        supabase
          .from("employees")
          .select("id, first_name, last_name, exclude_from_daily_check" as any)
          .eq("status", "active")
          .order("first_name"),
      ]);
      setClients((c.data as any[]) || []);
      setEmployees((e.data as any[]) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSearch("");
      load();
    }
  }, [open]);

  const toggleClient = async (id: string, value: boolean) => {
    setSavingId(id);
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, exclude_from_daily_check: value } : c)));
    const { error } = await supabase
      .from("clients")
      .update({ exclude_from_daily_check: value } as any)
      .eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      setClients((prev) => prev.map((c) => (c.id === id ? { ...c, exclude_from_daily_check: !value } : c)));
    } else {
      onChanged();
    }
  };

  const toggleEmployee = async (id: string, value: boolean) => {
    setSavingId(id);
    setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, exclude_from_daily_check: value } : e)));
    const { error } = await supabase
      .from("employees")
      .update({ exclude_from_daily_check: value } as any)
      .eq("id", id);
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      setEmployees((prev) => prev.map((e) => (e.id === id ? { ...e, exclude_from_daily_check: !value } : e)));
    } else {
      onChanged();
    }
  };

  const filteredClients = clients.filter((c) => !search || c.name?.toLowerCase().includes(search.toLowerCase()));
  const filteredEmployees = employees.filter((e) => {
    if (!search) return true;
    const full = `${e.first_name || ""} ${e.last_name || ""}`.toLowerCase();
    return full.includes(search.toLowerCase());
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Settings className="h-4 w-4 mr-1" />
          הגדרות בדיקה
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>החרגה מהבדיקה היומית</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="clients" className="flex-1">לקוחות</TabsTrigger>
            <TabsTrigger value="employees" className="flex-1">עובדים</TabsTrigger>
          </TabsList>
          <div className="pt-3">
            <Input
              placeholder="חיפוש…"
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              className="h-8 mb-2"
            />
          </div>
          <TabsContent value="clients">
            <ScrollArea className="h-[380px] pr-2">
              {loading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">טוען…</div>
              ) : filteredClients.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">אין תוצאות</div>
              ) : (
                <div className="space-y-1">
                  {filteredClients.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <span className="text-sm">{c.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {c.exclude_from_daily_check ? "מוסתר" : "מוצג"}
                        </span>
                        <Switch
                          checked={!c.exclude_from_daily_check}
                          disabled={savingId === c.id}
                          onCheckedChange={(v) => toggleClient(c.id, !v)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          <TabsContent value="employees">
            <ScrollArea className="h-[380px] pr-2">
              {loading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">טוען…</div>
              ) : filteredEmployees.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">אין תוצאות</div>
              ) : (
                <div className="space-y-1">
                  {filteredEmployees.map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <span className="text-sm">{e.first_name} {e.last_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {e.exclude_from_daily_check ? "מוסתר" : "מוצג"}
                        </span>
                        <Switch
                          checked={!e.exclude_from_daily_check}
                          disabled={savingId === e.id}
                          onCheckedChange={(v) => toggleEmployee(e.id, !v)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
