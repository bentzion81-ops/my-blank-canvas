import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Users, AlertTriangle, CheckCircle, Search, RefreshCw, MessageCircle, CalendarIcon, UserX, Sparkles, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { AbsenceDialog, ABSENCE_LABELS, type AbsenceStatus } from "@/components/attendance/AbsenceDialog";
import { AttendanceAlertsPanel } from "@/components/attendance/AttendanceAlertsPanel";
import { NoWorkPeriodsPanel } from "@/components/attendance/NoWorkPeriodsPanel";

type ViewMode = "day" | "range" | "month";
type TopTab = "attendance" | "no_work";

const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const Attendance = () => {
  const [topTab, setTopTab] = useState<TopTab>("attendance");
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState<ViewMode>("day");
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());
  const [range, setRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [absenceDialog, setAbsenceDialog] = useState<{ employeeId: string; name: string; date: string } | null>(null);

  // Compute active date range based on view
  const { fromDate, toDate } = useMemo(() => {
    if (view === "day") return { fromDate: selectedDay, toDate: selectedDay };
    if (view === "month") return { fromDate: startOfMonth(month), toDate: endOfMonth(month) };
    return { fromDate: range?.from ?? new Date(), toDate: range?.to ?? range?.from ?? new Date() };
  }, [view, selectedDay, range, month]);

  const fromStr = format(fromDate, "yyyy-MM-dd");
  const toStr = format(toDate, "yyyy-MM-dd");
  const isSingleDay = isSameDay(fromDate, toDate);

  const { data: records, refetch, isFetching } = useQuery({
    queryKey: ["attendance-range", fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("*, employees(first_name, last_name, status), clients(name)")
        .gte("date", fromStr)
        .lte("date", toStr)
        .order("date", { ascending: false });
      return data || [];
    },
  });

  const { data: schedules } = useQuery({
    queryKey: ["work-schedules-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("work_schedules")
        .select("employee_id, day_of_week, start_time, end_time, employees(first_name, last_name, status), clients(name)");
      return data || [];
    },
  });

  const { data: absences } = useQuery({
    queryKey: ["attendance-absences", fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_absences" as any)
        .select("*, employees(first_name, last_name)")
        .gte("date", fromStr)
        .lte("date", toStr);
      return (data as any[]) || [];
    },
  });

  const { data: expectedHours } = useQuery({
    queryKey: ["employee-expected-hours-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employee_expected_hours" as any)
        .select("employee_id, day_type, is_working_day, expected_check_in, expected_check_out");
      return (data as any[]) || [];
    },
  });

  // Pending late-attendance notifications in the active date range (unread = pending).
  const { data: pendingLateNotifs } = useQuery({
    queryKey: ["pending-late-notifs", fromStr, toStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, entity_id, created_at, is_read")
        .eq("type", "late_attendance")
        .eq("is_read", false)
        .gte("created_at", `${fromStr}T00:00:00`)
        .lte("created_at", `${toStr}T23:59:59`);
      return data || [];
    },
  });

  // Build lookup: employee_id -> day_type -> {in, out}
  const expectedMap = useMemo(() => {
    const m = new Map<string, Record<string, { in: string | null; out: string | null; working: boolean }>>();
    (expectedHours || []).forEach((e: any) => {
      if (!m.has(e.employee_id)) m.set(e.employee_id, {});
      m.get(e.employee_id)![e.day_type] = {
        in: e.expected_check_in,
        out: e.expected_check_out,
        working: e.is_working_day,
      };
    });
    return m;
  }, [expectedHours]);

  // Returns true if `actual` deviates from `expected` (HH:mm in Israel time) by 20+ min.
  // Uses Asia/Jerusalem timezone consistently regardless of browser locale.
  const isLateTime = (actualIso: string | null, expectedHHmm: string | null | undefined, _dateStr: string) => {
    if (!actualIso || !expectedHHmm) return false;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(actualIso));
    const ah = Number(parts.find((p) => p.type === "hour")?.value || "0");
    const am = Number(parts.find((p) => p.type === "minute")?.value || "0");
    const [eh, em] = expectedHHmm.split(":").map(Number);
    const diff = Math.abs((ah * 60 + am) - (eh * 60 + em));
    return diff >= 20;
  };

  const dayTypeFor = (dateStr: string): "weekday" | "friday" | "saturday" => {
    const dow = new Date(dateStr).getDay();
    if (dow === 5) return "friday";
    if (dow === 6) return "saturday";
    return "weekday";
  };

  // Build merged rows: for single-day view, show scheduled vs actual. For range/month, show actual records only.
  const rows = useMemo(() => {
    const absenceMap = new Map<string, any>();
    (absences || []).forEach((a: any) => absenceMap.set(`${a.employee_id}-${a.date}`, a));

    if (isSingleDay) {
      const todayDay = dayNames[fromDate.getDay()];
      const scheduled = (schedules || []).filter(
        (s: any) => s.day_of_week === todayDay && s.employees?.status === "active"
      );
      const now = new Date();
      const isToday = isSameDay(fromDate, new Date());

      return scheduled.map((schedule: any) => {
        const record = records?.find((r: any) => r.employee_id === schedule.employee_id);
        const absence = absenceMap.get(`${schedule.employee_id}-${fromStr}`);
        const scheduledTime = schedule.start_time;
        let status = "not yet time";

        if (record?.check_in) {
          const checkInTime = new Date(record.check_in);
          const [h, m] = scheduledTime.split(":").map(Number);
          const scheduledDate = new Date(fromDate);
          scheduledDate.setHours(h, m, 0, 0);
          status = checkInTime > new Date(scheduledDate.getTime() + 15 * 60000) ? "late" : "arrived";
        } else if (absence) {
          status = "absent";
        } else if (!isToday) {
          status = "not reported";
        } else {
          const [h, m] = scheduledTime.split(":").map(Number);
          const scheduledDate = new Date();
          scheduledDate.setHours(h, m, 0, 0);
          if (now > new Date(scheduledDate.getTime() + 30 * 60000)) status = "not reported";
        }

        return {
          key: `${schedule.employee_id}-${fromStr}`,
          date: fromStr,
          employeeId: schedule.employee_id,
          name: `${schedule.employees?.first_name || ""} ${schedule.employees?.last_name || ""}`.trim(),
          client: schedule.clients?.name || record?.clients?.name || "—",
          scheduled: scheduledTime?.slice(0, 5) || "—",
          checkIn: record?.check_in ? format(new Date(record.check_in), "HH:mm") : null,
          checkOut: record?.check_out ? format(new Date(record.check_out), "HH:mm") : null,
          checkInRaw: record?.check_in || null,
          checkOutRaw: record?.check_out || null,
          hours: record?.hours_worked ?? null,
          status,
          absence,
        };
      });
    }

    // Range / month: actual records + absences (no record)
    const recordRows = (records || []).map((r: any) => {
      const absence = absenceMap.get(`${r.employee_id}-${r.date}`);
      return {
        key: r.id,
        date: r.date,
        employeeId: r.employee_id,
        name: `${r.employees?.first_name || ""} ${r.employees?.last_name || ""}`.trim() || "—",
        client: r.clients?.name || "—",
        scheduled: "—",
        checkIn: r.check_in ? format(new Date(r.check_in), "HH:mm") : null,
        checkOut: r.check_out ? format(new Date(r.check_out), "HH:mm") : null,
        checkInRaw: r.check_in || null,
        checkOutRaw: r.check_out || null,
        hours: r.hours_worked ?? null,
        status: r.check_in ? "arrived" : absence ? "absent" : "not reported",
        absence,
      };
    });

    const recordKeys = new Set(recordRows.map((r) => `${r.employeeId}-${r.date}`));
    const absenceOnlyRows = (absences || [])
      .filter((a: any) => !recordKeys.has(`${a.employee_id}-${a.date}`))
      .map((a: any) => ({
        key: `abs-${a.id}`,
        date: a.date,
        employeeId: a.employee_id,
        name: `${a.employees?.first_name || ""} ${a.employees?.last_name || ""}`.trim() || "—",
        client: "—",
        scheduled: "—",
        checkIn: null,
        checkOut: null,
        checkInRaw: null,
        checkOutRaw: null,
        hours: null,
        status: "absent",
        absence: a,
      }));
    return [...recordRows, ...absenceOnlyRows].sort((a, b) => b.date.localeCompare(a.date));
  }, [isSingleDay, fromDate, fromStr, records, schedules, absences]);

  const filtered = rows.filter(
    (a) =>
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.client.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const arrivedCount = rows.filter((a) => a.status === "arrived").length;
  const lateCount = rows.filter((a) => a.status === "late").length;
  const notReportedCount = rows.filter((a) => a.status === "not reported").length;
  const totalHours = rows.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);

  // KPIs for the redesigned header strip
  const pendingAbsencesCount = (absences || []).filter(
    (a: any) => a.status === "no_show" && a.notes === "נוצר אוטומטית - לא דווחה כניסה"
  ).length;
  const pendingLateCount = (pendingLateNotifs || []).length;
  const totalReportsCount = (records || []).length;
  const specialEventsCount = 0; // Placeholder - to be defined later

  const subtitle = isSingleDay
    ? format(fromDate, "EEEE, dd/MM/yyyy")
    : `${format(fromDate, "dd/MM/yyyy")} – ${format(toDate, "dd/MM/yyyy")}`;

  return (
    <div className="flex flex-col">
      <AppHeader title="Attendance" subtitle={subtitle} />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <Tabs value={topTab} onValueChange={(v) => setTopTab(v as TopTab)}>
          <TabsList>
            <TabsTrigger value="attendance">נוכחות</TabsTrigger>
            <TabsTrigger value="no_work">תקופות אי-עבודה</TabsTrigger>
          </TabsList>
        </Tabs>

        {topTab === "no_work" ? (
          <NoWorkPeriodsPanel />
        ) : (
        <>
        {/* Alerts panel */}
        <AttendanceAlertsPanel
          selectedDay={selectedDay}
          onSelectedDayChange={(d) => {
            setSelectedDay(d);
            setView("day");
          }}
          mode={view === "month" ? "month" : "day"}
          onModeChange={(m) => setView(m)}
        />

        {/* Date selector */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 flex flex-wrap items-center gap-3">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="day">Day</TabsTrigger>
                <TabsTrigger value="range">Range</TabsTrigger>
                <TabsTrigger value="month">Month</TabsTrigger>
              </TabsList>
            </Tabs>

            {view === "day" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDay, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDay}
                    onSelect={(d) => d && setSelectedDay(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            )}

            {view === "range" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 w-[280px] justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {range?.from
                      ? range.to
                        ? `${format(range.from, "dd/MM/yyyy")} – ${format(range.to, "dd/MM/yyyy")}`
                        : format(range.from, "dd/MM/yyyy")
                      : "Pick a range"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    numberOfMonths={2}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            )}

            {view === "month" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(month, "MMMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={month}
                    month={month}
                    onMonthChange={setMonth}
                    onSelect={(d) => d && setMonth(startOfMonth(d))}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            )}

            {view === "range" && (
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "Today", days: 0 },
                  { label: "Last 7d", days: 7 },
                  { label: "Last 30d", days: 30 },
                  { label: "This month", days: -1 },
                ].map((p) => (
                  <Button
                    key={p.label}
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => {
                      const end = new Date();
                      let start = new Date();
                      if (p.days === -1) start = startOfMonth(end);
                      else start.setDate(end.getDate() - p.days);
                      setRange({ from: start, to: end });
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="pl-9 h-9 w-48"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn("h-4 w-4 mr-1", isFetching && "animate-spin")} /> Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            title={isSingleDay ? "Scheduled" : "Records"}
            value={String(rows.length)}
            icon={Users}
            variant="info"
          />
          <KpiCard title="Arrived" value={String(arrivedCount)} icon={CheckCircle} variant="success" />
          <KpiCard
            title={isSingleDay ? "Not Reported" : "Total Hours"}
            value={isSingleDay ? String(notReportedCount) : totalHours.toFixed(1)}
            icon={isSingleDay ? AlertTriangle : Clock}
            variant={isSingleDay ? "destructive" : "info"}
          />
          <KpiCard title="Late" value={String(lateCount)} icon={Clock} variant="warning" />
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Attendance List</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                {rows.length === 0
                  ? "No attendance data for this period. Try syncing from Settings → Attendance."
                  : "No results found."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {!isSingleDay && <TableHead>Date</TableHead>}
                    <TableHead>Employee</TableHead>
                    <TableHead>Client</TableHead>
                    {isSingleDay && <TableHead className="hidden md:table-cell">Scheduled</TableHead>}
                    <TableHead className="hidden md:table-cell">Check In</TableHead>
                    <TableHead className="hidden md:table-cell">Check Out</TableHead>
                    {!isSingleDay && <TableHead className="hidden md:table-cell">Hours</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => {
                    const exp = expectedMap.get(a.employeeId || "")?.[dayTypeFor(a.date)];
                    const lateIn = isLateTime(a.checkInRaw, exp?.in, a.date);
                    const lateOut = isLateTime(a.checkOutRaw, exp?.out, a.date);
                    return (
                    <TableRow key={a.key}>
                      {!isSingleDay && (
                        <TableCell className="text-xs">{format(new Date(a.date), "dd/MM/yyyy")}</TableCell>
                      )}
                      <TableCell className="font-medium">
                        {a.name}
                        {a.absence && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {ABSENCE_LABELS[a.absence.status as AbsenceStatus]}
                            {a.absence.replacement_name && ` — ${a.absence.replacement_name}`}
                            {a.absence.notes && ` · ${a.absence.notes}`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{a.client}</TableCell>
                      {isSingleDay && <TableCell className="hidden md:table-cell">{a.scheduled}</TableCell>}
                      <TableCell className={cn("hidden md:table-cell", lateIn && "bg-warning/15 text-warning font-medium")}>
                        {a.checkIn || "—"}
                      </TableCell>
                      <TableCell className={cn("hidden md:table-cell", lateOut && "bg-warning/15 text-warning font-medium")}>
                        {a.checkOut || "—"}
                      </TableCell>
                      {!isSingleDay && (
                        <TableCell className="hidden md:table-cell">
                          {a.hours != null ? Number(a.hours).toFixed(2) : "—"}
                        </TableCell>
                      )}
                      <TableCell>
                        {a.status === "absent" && a.absence ? (
                          <Badge variant="outline" className="gap-1">
                            <UserX className="h-3 w-3" />
                            {ABSENCE_LABELS[a.absence.status as AbsenceStatus]}
                          </Badge>
                        ) : (
                          <StatusBadge status={a.status} />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {(a.status === "not reported" || a.status === "absent") && a.employeeId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setAbsenceDialog({ employeeId: a.employeeId!, name: a.name, date: a.date })}
                            >
                              <UserX className="h-3 w-3 mr-1" /> {a.absence ? "ערוך" : "סמן חיסור"}
                            </Button>
                          )}
                          {isSingleDay && (a.status === "not reported" || a.status === "late") && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              <MessageCircle className="h-3 w-3 mr-1" /> Send
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        </>
        )}
      </div>
      {absenceDialog && (
        <AbsenceDialog
          open={!!absenceDialog}
          onOpenChange={(o) => !o && setAbsenceDialog(null)}
          employeeId={absenceDialog.employeeId}
          employeeName={absenceDialog.name}
          date={absenceDialog.date}
        />
      )}
    </div>
  );
};

export default Attendance;
