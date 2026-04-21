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
import { Clock, Users, AlertTriangle, CheckCircle, Search, RefreshCw, MessageCircle, CalendarIcon, UserX } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { AbsenceDialog, ABSENCE_LABELS, type AbsenceStatus } from "@/components/attendance/AbsenceDialog";

type ViewMode = "day" | "range" | "month";

const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const Attendance = () => {
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

  // Build merged rows: for single-day view, show scheduled vs actual. For range/month, show actual records only.
  const rows = useMemo(() => {
    if (isSingleDay) {
      const todayDay = dayNames[fromDate.getDay()];
      const scheduled = (schedules || []).filter(
        (s: any) => s.day_of_week === todayDay && s.employees?.status === "active"
      );
      const now = new Date();
      const isToday = isSameDay(fromDate, new Date());

      return scheduled.map((schedule: any) => {
        const record = records?.find((r: any) => r.employee_id === schedule.employee_id);
        const scheduledTime = schedule.start_time;
        let status = "not yet time";

        if (record?.check_in) {
          const checkInTime = new Date(record.check_in);
          const [h, m] = scheduledTime.split(":").map(Number);
          const scheduledDate = new Date(fromDate);
          scheduledDate.setHours(h, m, 0, 0);
          status = checkInTime > new Date(scheduledDate.getTime() + 15 * 60000) ? "late" : "arrived";
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
          name: `${schedule.employees?.first_name || ""} ${schedule.employees?.last_name || ""}`.trim(),
          client: schedule.clients?.name || record?.clients?.name || "—",
          scheduled: scheduledTime?.slice(0, 5) || "—",
          checkIn: record?.check_in ? format(new Date(record.check_in), "HH:mm") : null,
          checkOut: record?.check_out ? format(new Date(record.check_out), "HH:mm") : null,
          hours: record?.hours_worked ?? null,
          status,
        };
      });
    }

    // Range / month: list all actual records
    return (records || []).map((r: any) => ({
      key: r.id,
      date: r.date,
      name: `${r.employees?.first_name || ""} ${r.employees?.last_name || ""}`.trim() || "—",
      client: r.clients?.name || "—",
      scheduled: "—",
      checkIn: r.check_in ? format(new Date(r.check_in), "HH:mm") : null,
      checkOut: r.check_out ? format(new Date(r.check_out), "HH:mm") : null,
      hours: r.hours_worked ?? null,
      status: r.check_in ? "arrived" : "not reported",
    }));
  }, [isSingleDay, fromDate, fromStr, records, schedules]);

  const filtered = rows.filter(
    (a) =>
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.client.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const arrivedCount = rows.filter((a) => a.status === "arrived").length;
  const lateCount = rows.filter((a) => a.status === "late").length;
  const notReportedCount = rows.filter((a) => a.status === "not reported").length;
  const totalHours = rows.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);

  const subtitle = isSingleDay
    ? format(fromDate, "EEEE, dd/MM/yyyy")
    : `${format(fromDate, "dd/MM/yyyy")} – ${format(toDate, "dd/MM/yyyy")}`;

  return (
    <div className="flex flex-col">
      <AppHeader title="Attendance" subtitle={subtitle} />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
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
                    {isSingleDay && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.key}>
                      {!isSingleDay && (
                        <TableCell className="text-xs">{format(new Date(a.date), "dd/MM/yyyy")}</TableCell>
                      )}
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.client}</TableCell>
                      {isSingleDay && <TableCell className="hidden md:table-cell">{a.scheduled}</TableCell>}
                      <TableCell className="hidden md:table-cell">{a.checkIn || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{a.checkOut || "—"}</TableCell>
                      {!isSingleDay && (
                        <TableCell className="hidden md:table-cell">
                          {a.hours != null ? Number(a.hours).toFixed(2) : "—"}
                        </TableCell>
                      )}
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      {isSingleDay && (
                        <TableCell>
                          {(a.status === "not reported" || a.status === "late") && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              <MessageCircle className="h-3 w-3 mr-1" /> Send
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Attendance;
