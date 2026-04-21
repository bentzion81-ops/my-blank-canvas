import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  CalendarIcon,
  AlertTriangle,
  Clock,
  UserX,
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

  const { data: records = [] } = useQuery({
    queryKey: ["alerts-records", fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("id, date, check_in, check_out, employee_id, client_id, employees(first_name, last_name), clients(name)")
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
        .select("id, date, status, employee_id, replacement_name, notes, employees(first_name, last_name)")
        .gte("date", fromStr)
        .lte("date", toStr);
      return data || [];
    },
  });

  const { data: expectedHours = [] } = useQuery({
    queryKey: ["alerts-expected-hours"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_expected_hours")
        .select("employee_id, day_type, is_working_day, expected_check_in, expected_check_out");
      return data || [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["alerts-assignments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_client_assignments")
        .select("employee_id, is_primary, clients(name)")
        .is("end_date", null);
      return data || [];
    },
  });

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
      if (!m.has(a.employee_id) || a.is_primary) {
        m.set(a.employee_id, a.clients?.name || "—");
      }
    });
    return m;
  }, [assignments]);

  // Build late entries
  type LateEntry = {
    id: string;
    name: string;
    client: string;
    date: string;
    kind: "in" | "out";
    actual: string;
    expected: string;
    diff: number;
  };

  const lateEntries = useMemo<LateEntry[]>(() => {
    const out: LateEntry[] = [];
    records.forEach((r: any) => {
      const dt = dayTypeFor(new Date(r.date));
      const exp = expectedMap.get(r.employee_id)?.[dt];
      if (!exp || !exp.working) return;
      const name = `${r.employees?.first_name || ""} ${r.employees?.last_name || ""}`.trim() || "—";
      const client = r.clients?.name || clientByEmployee.get(r.employee_id) || "—";
      if (r.check_in && exp.in) {
        const d = diffMinutes(r.check_in, exp.in);
        if (Math.abs(d) >= 20) {
          out.push({
            id: `${r.id}-in`,
            name,
            client,
            date: r.date,
            kind: "in",
            actual: format(new Date(r.check_in), "HH:mm"),
            expected: exp.in.slice(0, 5),
            diff: d,
          });
        }
      }
      if (r.check_out && exp.out) {
        const d = diffMinutes(r.check_out, exp.out);
        if (Math.abs(d) >= 20) {
          out.push({
            id: `${r.id}-out`,
            name,
            client,
            date: r.date,
            kind: "out",
            actual: format(new Date(r.check_out), "HH:mm"),
            expected: exp.out.slice(0, 5),
            diff: d,
          });
        }
      }
    });
    return out;
  }, [records, expectedMap, clientByEmployee]);

  type AbsenceEntry = {
    id: string;
    name: string;
    client: string;
    date: string;
    status: string;
    replacement?: string | null;
    notes?: string | null;
  };

  const absenceEntries = useMemo<AbsenceEntry[]>(() => {
    return absences.map((a: any) => ({
      id: a.id,
      name: `${a.employees?.first_name || ""} ${a.employees?.last_name || ""}`.trim() || "—",
      client: clientByEmployee.get(a.employee_id) || "—",
      date: a.date,
      status: a.status,
      replacement: a.replacement_name,
      notes: a.notes,
    }));
  }, [absences, clientByEmployee]);

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

  const lateGroups = groupByClient(lateEntries);
  const absenceGroups = groupByClient(absenceEntries);

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
        {/* LATE */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold">איחורים</h3>
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
              {lateEntries.length}
            </Badge>
          </div>
          {lateGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">אין איחורים בטווח זה</p>
          ) : (
            <div className="space-y-2">
              {lateGroups.map(([client, items]) => (
                <div key={client} className="border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold flex items-center justify-between">
                    <span>{client}</span>
                    <span className="text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="divide-y">
                    {items.map((e) => (
                      <div key={e.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{e.name}</div>
                          <div className="text-muted-foreground text-[11px]">
                            {format(new Date(e.date), "dd/MM/yyyy")} ·{" "}
                            {e.kind === "in" ? "כניסה" : "יציאה"}: {e.actual}{" "}
                            <span className="opacity-70">(צפוי {e.expected})</span>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="bg-warning/10 text-warning border-warning/20 whitespace-nowrap"
                        >
                          {e.diff > 0 ? "+" : ""}
                          {Math.round(e.diff)} דק׳
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ABSENCES */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <UserX className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold">חיסורים</h3>
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
              {absenceEntries.length}
            </Badge>
          </div>
          {absenceGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">אין חיסורים בטווח זה</p>
          ) : (
            <div className="space-y-2">
              {absenceGroups.map(([client, items]) => (
                <div key={client} className="border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold flex items-center justify-between">
                    <span>{client}</span>
                    <span className="text-muted-foreground">{items.length}</span>
                  </div>
                  <div className="divide-y">
                    {items.map((e) => (
                      <div key={e.id} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{e.name}</div>
                          <div className="text-muted-foreground text-[11px]">
                            {format(new Date(e.date), "dd/MM/yyyy")}
                            {e.replacement && ` · מחליף: ${e.replacement}`}
                            {e.notes && ` · ${e.notes}`}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className="bg-destructive/10 text-destructive border-destructive/20 whitespace-nowrap"
                        >
                          {e.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
