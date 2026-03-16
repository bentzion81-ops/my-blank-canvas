import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Users, AlertTriangle, CheckCircle, Search, RefreshCw, MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useState } from "react";

const Attendance = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: todayRecords, refetch } = useQuery({
    queryKey: ["attendance-today", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_records")
        .select("*, employees(first_name, last_name), clients(name)")
        .eq("date", today);
      return data || [];
    },
  });

  const { data: scheduledToday } = useQuery({
    queryKey: ["scheduled-today"],
    queryFn: async () => {
      const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const todayDay = dayNames[new Date().getDay()];
      const { data } = await supabase
        .from("work_schedules")
        .select("employee_id, start_time, end_time, employees(first_name, last_name, status), clients(name)")
        .eq("day_of_week", todayDay);
      return (data || []).filter((s: any) => s.employees?.status === "active");
    },
  });

  // Merge scheduled with actual attendance
  const mergedData = (scheduledToday || []).map((schedule: any) => {
    const record = todayRecords?.find((r: any) => r.employee_id === schedule.employee_id);
    const now = new Date();
    const scheduledTime = schedule.start_time;
    let status = "not yet time";

    if (record?.check_in) {
      const checkInTime = new Date(record.check_in);
      const [h, m] = scheduledTime.split(":").map(Number);
      const scheduledDate = new Date();
      scheduledDate.setHours(h, m, 0, 0);
      status = checkInTime > new Date(scheduledDate.getTime() + 15 * 60000) ? "late" : "arrived";
    } else {
      const [h, m] = scheduledTime.split(":").map(Number);
      const scheduledDate = new Date();
      scheduledDate.setHours(h, m, 0, 0);
      if (now > new Date(scheduledDate.getTime() + 30 * 60000)) {
        status = "not reported";
      }
    }

    return {
      employee_id: schedule.employee_id,
      name: `${schedule.employees?.first_name || ""} ${schedule.employees?.last_name || ""}`.trim(),
      client: schedule.clients?.name || "—",
      scheduled: scheduledTime?.slice(0, 5) || "—",
      checkIn: record?.check_in ? format(new Date(record.check_in), "HH:mm") : null,
      checkOut: record?.check_out ? format(new Date(record.check_out), "HH:mm") : null,
      status,
    };
  });

  const filtered = mergedData.filter((a) =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.client.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const arrivedCount = mergedData.filter((a) => a.status === "arrived").length;
  const lateCount = mergedData.filter((a) => a.status === "late").length;
  const notReportedCount = mergedData.filter((a) => a.status === "not reported").length;

  return (
    <div className="flex flex-col">
      <AppHeader title="Daily Attendance" subtitle={`Today — ${format(new Date(), "dd/MM/yyyy")}`} />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Scheduled Today" value={String(mergedData.length)} icon={Users} variant="info" />
          <KpiCard title="Arrived" value={String(arrivedCount)} icon={CheckCircle} variant="success" />
          <KpiCard title="Not Reported" value={String(notReportedCount)} icon={AlertTriangle} variant="destructive" />
          <KpiCard title="Late" value={String(lateCount)} icon={Clock} variant="warning" />
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-semibold">Attendance List</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    className="pl-9 h-9 w-48"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                {mergedData.length === 0
                  ? "No work schedules for today. Add employees and schedules to track attendance."
                  : "No results found."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="hidden md:table-cell">Scheduled</TableHead>
                    <TableHead className="hidden md:table-cell">Check In</TableHead>
                    <TableHead className="hidden md:table-cell">Check Out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.employee_id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>{a.client}</TableCell>
                      <TableCell className="hidden md:table-cell">{a.scheduled}</TableCell>
                      <TableCell className="hidden md:table-cell">{a.checkIn || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{a.checkOut || "—"}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell>
                        {(a.status === "not reported" || a.status === "late") && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            <MessageCircle className="h-3 w-3 mr-1" /> Send
                          </Button>
                        )}
                      </TableCell>
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
