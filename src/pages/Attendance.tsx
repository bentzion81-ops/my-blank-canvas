import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Users, AlertTriangle, CheckCircle, Search, RefreshCw, MessageCircle } from "lucide-react";

const attendanceData = [
  { name: "Ahmed Hassan", client: "ABC Corp", scheduled: "07:00", checkIn: "06:55", checkOut: "15:00", status: "arrived" },
  { name: "Maria Santos", client: "XYZ Ltd", scheduled: "08:00", checkIn: "08:15", checkOut: null, status: "late" },
  { name: "John Smith", client: "Delta Inc", scheduled: "07:00", checkIn: null, checkOut: null, status: "not reported" },
  { name: "Li Wei", client: "Omega LLC", scheduled: "09:00", checkIn: null, checkOut: null, status: "not yet time" },
  { name: "Sara Cohen", client: "ABC Corp", scheduled: "07:00", checkIn: "07:02", checkOut: null, status: "arrived" },
];

const Attendance = () => {
  return (
    <div className="flex flex-col">
      <AppHeader title="Daily Attendance" subtitle="Today's attendance overview" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Scheduled Today" value="42" icon={Users} variant="info" />
          <KpiCard title="Arrived" value="35" icon={CheckCircle} variant="success" />
          <KpiCard title="Not Reported" value="5" icon={AlertTriangle} variant="destructive" />
          <KpiCard title="Late" value="2" icon={Clock} variant="warning" />
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-semibold">Attendance List</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search..." className="pl-9 h-9 w-48" />
                </div>
                <Button variant="outline" size="sm">
                  <MessageCircle className="h-4 w-4 mr-1" /> Remind All
                </Button>
                <Button variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-1" /> Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
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
                {attendanceData.map((a) => (
                  <TableRow key={a.name}>
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Attendance;
