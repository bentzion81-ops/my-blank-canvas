import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { AbsenceDialog, ABSENCE_LABELS, type AbsenceStatus } from "./AbsenceDialog";
import {
  ChevronLeft,
  ChevronRight,
  CalendarIcon,
  AlertTriangle,
  AlertCircle,
  UserX,
  Pencil,
} from "lucide-react";
import {
  format,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
  isSameDay,
} from "date-fns";
import { cn } from "@/lib/utils";

type Mode = "day" | "month";
type DayType = "weekday" | "friday" | "saturday";

const dayTypeFor = (d: Date): DayType => {
  const dow = d.getDay();
  if (dow === 5) return "friday";
  if (dow === 6) return "saturday";
  return "weekday";
};

// Compare HH:mm (Israel TZ) of actual ISO vs expected HH:mm, return signed diff minutes.
const diffMinutes = (actualIso: string, expectedHHmm: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(actualIso));
  const ah = Number(parts.find((p) => p.type === "hour")?.value || "0");
  const am = Number(parts.find((p) => p.type === "minute")?.value || "0");
  const [eh, em] = expectedHHmm.split(":").map(Number);
  return ah * 60 + am - (eh * 60 + em);
};

// Current time in Israel TZ as minutes since midnight on a given date.
// Returns null if the given date is not "today" in Israel.
const minutesNowInIsraelIfToday = (dateStr: string): number | null => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const y = fmt.find((p) => p.type === "year")?.value;
  const mo = fmt.find((p) => p.type === "month")?.value;
  const d = fmt.find((p) => p.type === "day")?.value;
  const h = Number(fmt.find((p) => p.type === "hour")?.value || "0");
  const mi = Number(fmt.find((p) => p.type === "minute")?.value || "0");
  const todayStr = `${y}-${mo}-${d}`;
  if (todayStr !== dateStr) return null;
  return h * 60 + mi;
};

interface Props {
  selectedDay: Date;
  onSelectedDayChange: (d: Date) => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
}

export const AttendanceAlertsPanel = ({
  selectedDay,
  onSelectedDayChange,
  mode,
  onModeChange,
}: Props) => {
  const [monthAnchor, setMonthAnchor] = useState<Date>(startOfMonth(selectedDay));

  const { fromDate, toDate } = useMemo(() => {
    if (mode === "day") return { fromDate: selectedDay, toDate: selectedDay };
    return { fromDate: startOfMonth(monthAnchor), toDate: endOfMonth(monthAnchor) };
  }, [mode, selectedDay, monthAnchor]);

  const fromStr = format(fromDate, "yyyy-MM-dd");
  const toStr = format(toDate, "yyyy-MM-dd");

  const { data: activeEmployees = [] } = useQuery({
    queryKey: ["alerts-active-synced-employees"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("status", "active")
        .eq("meckano_synced", true);
      return data || [];
    },
  });
  const employeeNameById = useMemo(() => {
    const m = new Map<string, string>();
    (activeEmployees as any[]).forEach((e) => {
      m.set(e.id, `${e.first_name || ""} ${e.last_name || ""}`.trim() || "—");
    });
    return m;
  }, [activeEmployees]);

  const { data: records = [] } = useQuery({
    queryKey: ["alerts-records", fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("id, date, check_in, check_out, employee_id, client_id, employees!inner(first_name, last_name, status, meckano_synced), clients(name)")
        .eq("employees.status", "active")
        .eq("employees.meckano_synced", true)
        .gte("date", fromStr)
        .lte("date", toStr);
      return data || [];
    },
  });

  const { data: absences = [] } = useQuery({
    queryKey: ["alerts-absences", fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_absences")
        .select("id, date, status, employee_id, replacement_name, notes, employees!inner(first_name, last_name, status, meckano_synced)")
        .eq("employees.status", "active")
        .eq("employees.meckano_synced", true)
        .gte("date", fromStr)
        .lte("date", toStr);
      return data || [];
    },
  });

  const { data: expectedHours = [] } = useQuery({
    queryKey: ["alerts-expected-synced-hours"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_expected_hours")
        .select("employee_id, day_type, is_working_day, expected_check_in, expected_check_out, employees!inner(status, meckano_synced)")
        .eq("employees.status", "active")
        .eq("employees.meckano_synced", true);
      return data || [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["alerts-assignments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_client_assignments")
        .select("employee_id, client_id, is_primary, start_date, end_date, clients(name)");
      return data || [];
    },
  });

  const { data: noWorkPeriods = [] } = useQuery({
    queryKey: ["alerts-no-work-periods", fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("no_work_periods")
        .select("scope, employee_id, client_id, from_date, to_date")
        .lte("from_date", toStr)
        .gte("to_date", fromStr);
      return data || [];
    },
  });

  // Returns true if the (employee, date) is covered by any no_work period
  // (either directly for the employee, or for a client they were assigned to on that date).
  const isNoWorkDay = useMemo(() => {
    return (employeeId: string, dateStr: string) => {
      for (const p of noWorkPeriods as any[]) {
        if (dateStr < p.from_date || dateStr > p.to_date) continue;
        if (p.scope === "employee" && p.employee_id === employeeId) return true;
        if (p.scope === "client" && p.client_id) {
          // Suppress if employee is assigned to this client and the assignment
          // overlaps the no-work period (not necessarily the specific date —
          // covers cases where assignment started after the no-work window).
          const matched = (assignments as any[]).some(
            (a) =>
              a.employee_id === employeeId &&
              a.client_id === p.client_id &&
              (!a.end_date || a.end_date >= p.from_date),
          );
          if (matched) return true;
        }
      }
      return false;
    };
  }, [noWorkPeriods, assignments]);

  const expectedMap = useMemo(() => {
    const m = new Map<string, Record<DayType, { in: string | null; out: string | null; working: boolean }>>();
    expectedHours.forEach((e: any) => {
      if (!m.has(e.employee_id)) m.set(e.employee_id, {} as any);
      (m.get(e.employee_id) as any)[e.day_type] = {
        in: e.expected_check_in,
        out: e.expected_check_out,
        working: e.is_working_day,
      };
    });
    return m;
  }, [expectedHours]);

  const clientByEmployee = useMemo(() => {
    const m = new Map<string, string>();
    assignments.forEach((a: any) => {
      if (a.end_date) return; // only currently active assignments
      if (!m.has(a.employee_id) || a.is_primary) {
        m.set(a.employee_id, a.clients?.name || "—");
      }
    });
    return m;
  }, [assignments]);

  // Build "missing report" entries: scheduled to work today, expected check-in time passed,
  // but no attendance record AND no absence record yet. Once they report (even late) — alert clears.
  type MissingEntry = {
    id: string;
    employeeId: string;
    name: string;
    client: string;
    date: string;
    expected: string;
    minutesPast: number;
  };

  const missingEntries = useMemo<MissingEntry[]>(() => {
    const out: MissingEntry[] = [];
    const recordKey = new Set(records.map((r: any) => `${r.employee_id}-${r.date}`));
    const absenceKey = new Set(absences.map((a: any) => `${a.employee_id}-${a.date}`));

    const dates: string[] = [];
    for (let d = new Date(fromDate); d <= toDate; d = addDays(d, 1)) {
      dates.push(format(d, "yyyy-MM-dd"));
    }

    const nameById = new Map<string, string>();
    records.forEach((r: any) => {
      const n = `${r.employees?.first_name || ""} ${r.employees?.last_name || ""}`.trim();
      if (n) nameById.set(r.employee_id, n);
    });
    absences.forEach((a: any) => {
      const n = `${a.employees?.first_name || ""} ${a.employees?.last_name || ""}`.trim();
      if (n) nameById.set(a.employee_id, n);
    });

    expectedMap.forEach((byDay, employeeId) => {
      dates.forEach((dateStr) => {
        const dt = dayTypeFor(new Date(dateStr));
        const exp = byDay[dt];
        if (!exp || !exp.working || !exp.in) return;
        const k = `${employeeId}-${dateStr}`;
        if (recordKey.has(k) || absenceKey.has(k)) return;
        if (isNoWorkDay(employeeId, dateStr)) return;

        // Only alert if today in Israel & expected time already passed.
        // Past dates without report should already be auto-flipped to absences.
        const nowMin = minutesNowInIsraelIfToday(dateStr);
        if (nowMin === null) return;
        const [eh, em] = exp.in.split(":").map(Number);
        const expMin = eh * 60 + em;
        if (nowMin < expMin) return;

        out.push({
          id: `miss-${employeeId}-${dateStr}`,
          employeeId,
          name: employeeNameById.get(employeeId) || "—",
          client: clientByEmployee.get(employeeId) || "—",
          date: dateStr,
          expected: exp.in.slice(0, 5),
          minutesPast: nowMin - expMin,
        });
      });
    });
    return out;
  }, [records, absences, expectedMap, clientByEmployee, employeeNameById, fromDate, toDate, isNoWorkDay]);

  type AbsenceEntry = {
    id: string;
    employeeId: string;
    name: string;
    client: string;
    date: string;
    status: string;
    replacement?: string | null;
    notes?: string | null;
  };

  const absenceEntries = useMemo<AbsenceEntry[]>(() => {
    return absences.map((a: any) => {
      const empName =
        `${a.employees?.first_name || ""} ${a.employees?.last_name || ""}`.trim() ||
        employeeNameById.get(a.employee_id) ||
        "—";
      return {
        id: a.id,
        employeeId: a.employee_id,
        name: empName,
        client: clientByEmployee.get(a.employee_id) || "—",
        date: a.date,
        status: a.status,
        replacement: a.replacement_name,
        notes: a.notes,
      };
    });
  }, [absences, clientByEmployee, employeeNameById]);

  // Dialog state for marking/editing an absence on click
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    employeeId: string;
    employeeName: string;
    date: string;
  }>({ open: false, employeeId: "", employeeName: "", date: "" });

  const openDialog = (employeeId: string, employeeName: string, date: string) =>
    setDialogState({ open: true, employeeId, employeeName, date });

  // Group by client
  const groupByClient = <T extends { client: string }>(arr: T[]) => {
    const m = new Map<string, T[]>();
    arr.forEach((item) => {
      const key = item.client || "—";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(item);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "he"));
  };

  // Unclassified absences (auto-detected no_show) stay as alerts at top.
  // Classified ones (replacement / no_work / vacation / sick) move to bottom "reports".
  const unclassifiedAbsences = absenceEntries.filter(
    (a) => a.status === "no_show" && !isNoWorkDay(a.employeeId, a.date),
  );
  const classifiedAbsences = absenceEntries.filter((a) => a.status !== "no_show");

  const missingGroups = groupByClient(missingEntries);
  const unclassifiedAbsenceGroups = groupByClient(unclassifiedAbsences);
  const classifiedAbsenceGroups = groupByClient(classifiedAbsences);

  const isToday = isSameDay(selectedDay, new Date());
  const rangeLabel =
    mode === "day"
      ? format(selectedDay, "EEEE, dd/MM/yyyy")
      : format(monthAnchor, "MMMM yyyy");

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            התראות נוכחות
            <span className="text-xs text-muted-foreground font-normal">
              · {rangeLabel}
              {mode === "day" && isToday && " (היום)"}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1">
            {mode === "day" && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onSelectedDayChange(subDays(selectedDay, 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 font-normal">
                      <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                      {format(selectedDay, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={selectedDay}
                      onSelect={(d) => d && onSelectedDayChange(d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onSelectedDayChange(addDays(selectedDay, 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setMonthAnchor(startOfMonth(selectedDay));
                    onModeChange("month");
                  }}
                >
                  חודש נוכחי
                </Button>
              </>
            )}
            {mode === "month" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 font-normal">
                      <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                      {format(monthAnchor, "MMMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={monthAnchor}
                      month={monthAnchor}
                      onMonthChange={setMonthAnchor}
                      onSelect={(d) => d && setMonthAnchor(startOfMonth(d))}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => onModeChange("day")}
                >
                  חזרה ליום
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* MISSING REPORTS + UNCLASSIFIED ABSENCES (alerts that still need handling) */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold">חיסורים ואיחורים (לא סווגו)</h3>
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
              {missingEntries.length + unclassifiedAbsences.length}
            </Badge>
          </div>
          {missingGroups.length === 0 && unclassifiedAbsenceGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">אין התראות בטווח זה</p>
          ) : (
            <div className="space-y-2">
              {missingGroups.map(([client, items]) => (
                <div key={`miss-${client}`} className="border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold flex items-center justify-between">
                    <span>{client}</span>
                    <span className="text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="divide-y">
                    {items.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => openDialog(e.employeeId, e.name, e.date)}
                        className="w-full px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-accent/40 transition text-right"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate flex items-center gap-1">
                            {e.name}
                            <Pencil className="h-3 w-3 text-muted-foreground opacity-60" />
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {format(new Date(e.date), "dd/MM/yyyy")} · לא דווחה כניסה{" "}
                            <span className="opacity-70">(צפוי {e.expected})</span>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="bg-warning/10 text-warning border-warning/20 whitespace-nowrap"
                        >
                          +{Math.round(e.minutesPast)} דק׳
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {unclassifiedAbsenceGroups.map(([client, items]) => (
                <div key={`abs-${client}`} className="border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold flex items-center justify-between">
                    <span>{client}</span>
                    <span className="text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="divide-y">
                    {items.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => openDialog(e.employeeId, e.name, e.date)}
                        className="w-full px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-accent/40 transition text-right"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate flex items-center gap-1">
                            {e.name}
                            <Pencil className="h-3 w-3 text-muted-foreground opacity-60" />
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {format(new Date(e.date), "dd/MM/yyyy")} · חיסור — לא סווג
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="bg-destructive/10 text-destructive border-destructive/20 whitespace-nowrap"
                        >
                          לא הגיע
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CLASSIFIED REPORTS */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <UserX className="h-4 w-4 text-info" />
            <h3 className="text-sm font-semibold">דיווחים (אירועים מסומנים)</h3>
            <Badge variant="outline" className="bg-info/10 text-info border-info/20">
              {classifiedAbsences.length}
            </Badge>
          </div>
          {classifiedAbsenceGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">אין דיווחים בטווח זה</p>
          ) : (
            <div className="space-y-2">
              {classifiedAbsenceGroups.map(([client, items]) => (
                <div key={client} className="border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold flex items-center justify-between">
                    <span>{client}</span>
                    <span className="text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="divide-y">
                    {items.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => openDialog(e.employeeId, e.name, e.date)}
                        className="w-full px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-accent/40 transition text-right"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate flex items-center gap-1">
                            {e.name}
                            <Pencil className="h-3 w-3 text-muted-foreground opacity-60" />
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {format(new Date(e.date), "dd/MM/yyyy")}
                            {e.replacement && ` · מחליף: ${e.replacement}`}
                            {e.notes && ` · ${e.notes}`}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "whitespace-nowrap",
                            e.status === "no_show" && "bg-destructive/10 text-destructive border-destructive/20",
                            e.status === "replacement" && "bg-warning/10 text-warning border-warning/20",
                            e.status === "no_work" && "bg-muted text-muted-foreground border-border",
                            (e.status === "vacation" || e.status === "sick") && "bg-info/10 text-info border-info/20",
                          )}
                        >
                          {ABSENCE_LABELS[e.status as AbsenceStatus] || e.status}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      <AbsenceDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((s) => ({ ...s, open }))}
        employeeId={dialogState.employeeId}
        employeeName={dialogState.employeeName}
        date={dialogState.date}
      />
    </Card>
  );
};
