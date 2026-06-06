import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  selectedDate: Date;
}

const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

type RowStatus = "ok" | "missing_in" | "missing_out" | "pending";

const statusColor = (s: string) => {
  if (s === "ok") return "bg-success/10 text-success border-success/20";
  if (s === "no_work") return "bg-muted text-muted-foreground border-border";
  if (s === "missing") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-warning/10 text-warning border-warning/20";
};

export function DailyCheckTab({ selectedDate }: Props) {
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

  // Manual edit state: key = `${client_id}-${employee_id}` -> { status, notes }
  const [manualState, setManualState] = useState<Record<string, { status: "ok" | "no_work" | "missing"; notes: string }>>({});
  const [savingClient, setSavingClient] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, a, s, r, l] = await Promise.all([
        supabase.from("clients").select("id, name, meckano_synced, status").eq("status", "active"),
        supabase.from("employee_client_assignments")
          .select("employee_id, client_id, employees(id, first_name, last_name, status)")
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

      // Hydrate manual state from existing logs
      const next: Record<string, { status: "ok" | "no_work" | "missing"; notes: string }> = {};
      ((l.data as any[]) || []).forEach((row) => {
        if (row.source === "manual") {
          next[`${row.client_id}-${row.employee_id}`] = {
            status: row.status === "ok" ? "ok" : row.status === "no_work" ? "no_work" : "missing",
            notes: row.notes || "",
          };
        }
      });
      setManualState(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, refreshKey]);

  // Group: for each client, list employees scheduled this day-of-week.
  // If there are no work_schedules for this client at all on this day, fall back
  // to all active assignments for that client (so the page is useful even without schedules).
  const grouped = useMemo(() => {
    const result: { client: any; employees: { id: string; name: string }[] }[] = [];
    const hasAnySchedules = schedules.length > 0;
    for (const client of clients) {
      const clientSchedules = schedules.filter((s: any) => s.client_id === client.id);
      const useSchedule = hasAnySchedules && clientSchedules.length > 0;
      const empIds = useSchedule
        ? new Set(clientSchedules.map((s: any) => s.employee_id))
        : null;
      const emps: { id: string; name: string }[] = [];
      assignments
        .filter((a: any) =>
          a.client_id === client.id &&
          a.employees?.status === "active" &&
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
    }
    return result;
  }, [clients, assignments, schedules]);

  const getRecordStatus = (employeeId: string, clientId: string): RowStatus => {
    const rec = records.find((r: any) => r.employee_id === employeeId && (r.client_id === clientId || !r.client_id));
    const isFuture = new Date(dateStr) > new Date(format(new Date(), "yyyy-MM-dd"));
    if (isFuture) return "pending";
    if (!rec || !rec.check_in) {
      // check if scheduled start time is in the past
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

  const saveClient = async (clientId: string, employees: { id: string; name: string }[]) => {
    setSavingClient(clientId);
    try {
      const rows = employees.map((e) => {
        const key = `${clientId}-${e.id}`;
        const m = manualState[key] || { status: "ok" as const, notes: "" };
        if (m.status === "missing" && !m.notes.trim()) {
          throw new Error(`יש להוסיף הערה ל-${e.name}`);
        }
        return {
          check_date: dateStr,
          employee_id: e.id,
          client_id: clientId,
          status: m.status,
          notes: m.notes || null,
          source: "manual",
          checked_by: user?.id || null,
        };
      });
      const { error } = await supabase
        .from("daily_check_logs" as any)
        .upsert(rows, { onConflict: "check_date,employee_id,client_id" });
      if (error) throw error;
      toast.success("נשמר");
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e.message || String(e));
    } finally {
      setSavingClient(null);
    }
  };

  const meckanoGroups = grouped.filter((g) => g.client.meckano_synced);
  const manualGroups = grouped.filter((g) => !g.client.meckano_synced);

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
              <div className="text-sm text-muted-foreground">
                בדיקה יומית — {format(selectedDate, "dd/MM/yyyy")}
              </div>
              <Button size="sm" onClick={handleSyncMeckano} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                רענן מכונה
              </Button>
            </CardContent>
          </Card>

          {loading && <div className="text-sm text-muted-foreground">טוען…</div>}

          {!loading && meckanoGroups.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">לקוחות מכונה</h3>
              {meckanoGroups.map(({ client, employees }) => (
                <Card key={client.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {client.name}
                      <Badge className="bg-info/10 text-info border-info/20" variant="outline">🔄 מכונה</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>עובד</TableHead>
                          <TableHead>סטטוס</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employees.map((e) => {
                          const st = getRecordStatus(e.id, client.id);
                          const lbl = labelFor(st);
                          return (
                            <TableRow key={e.id}>
                              <TableCell>{e.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={lbl.cls}>{lbl.text}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && manualGroups.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">לקוחות ידניים</h3>
              {manualGroups.map(({ client, employees }) => (
                <Card key={client.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {client.name}
                      <Badge variant="outline" className="bg-muted text-muted-foreground">✏️ ידני</Badge>
                    </CardTitle>
                    <Button size="sm" disabled={savingClient === client.id} onClick={() => saveClient(client.id, employees)}>
                      {savingClient === client.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                      שמור
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {employees.map((e) => {
                      const key = `${client.id}-${e.id}`;
                      const m = manualState[key] || { status: "ok" as const, notes: "" };
                      return (
                        <div key={e.id} className="flex flex-wrap items-center gap-4 border-b pb-3 last:border-0">
                          <div className="min-w-[140px] font-medium text-sm">{e.name}</div>
                          <RadioGroup
                            value={m.status}
                            onValueChange={(v) =>
                              setManualState((p) => ({ ...p, [key]: { ...m, status: v as any } }))
                            }
                            className="flex flex-row gap-4"
                          >
                            <div className="flex items-center gap-1">
                              <RadioGroupItem value="ok" id={`${key}-ok`} />
                              <Label htmlFor={`${key}-ok`} className="text-xs">דווח תקין</Label>
                            </div>
                            <div className="flex items-center gap-1">
                              <RadioGroupItem value="no_work" id={`${key}-nw`} />
                              <Label htmlFor={`${key}-nw`} className="text-xs">לא היה עבודה</Label>
                            </div>
                            <div className="flex items-center gap-1">
                              <RadioGroupItem value="missing" id={`${key}-m`} />
                              <Label htmlFor={`${key}-m`} className="text-xs">חסר משהו</Label>
                            </div>
                          </RadioGroup>
                          {m.status === "missing" && (
                            <Input
                              className="h-8 flex-1 min-w-[200px]"
                              placeholder="הערה (חובה)"
                              value={m.notes}
                              onChange={(ev) =>
                                setManualState((p) => ({ ...p, [key]: { ...m, notes: ev.target.value } }))
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && grouped.length === 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                אין עובדים משובצים לעבודה ביום זה
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
    if (s === "ok") return { text: "תקין", cls: "bg-success/10 text-success border-success/20" };
    if (s === "no_work") return { text: "לא היה עבודה", cls: "bg-muted text-muted-foreground border-border" };
    if (s === "missing") return { text: "חסר", cls: "bg-destructive/10 text-destructive border-destructive/20" };
    return { text: "ממתין", cls: "bg-warning/10 text-warning border-warning/20" };
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
