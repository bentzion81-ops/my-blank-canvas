import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Building2, Clock, DollarSign, Wallet, Receipt, TrendingUp, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/ui/status-badge";

const Dashboard = () => {
  const { data: employees } = useQuery({
    queryKey: ["dashboard-employees"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("*").eq("status", "active");
      return data || [];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["dashboard-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*").eq("status", "active");
      return data || [];
    },
  });

  const { data: notifications } = useQuery({
    queryKey: ["dashboard-notifications"],
    queryFn: async () => {
      const { data } = await supabase.from("notifications").select("*").eq("is_read", false).order("created_at", { ascending: false }).limit(10);
      return data || [];
    },
  });

  const { data: clientMetrics } = useQuery({
    queryKey: ["dashboard-client-metrics"],
    queryFn: async () => {
      const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
      const { data } = await supabase
        .from("client_monthly_metrics")
        .select("*, clients(name, status)")
        .eq("month", currentMonth);
      return data || [];
    },
  });

  const { data: employeeMetrics } = useQuery({
    queryKey: ["dashboard-employee-metrics"],
    queryFn: async () => {
      const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
      const { data } = await supabase
        .from("employee_monthly_metrics")
        .select("*, employees(first_name, last_name, status), clients(name)")
        .eq("month", currentMonth);
      return data || [];
    },
  });

  const { data: payrollRuns } = useQuery({
    queryKey: ["dashboard-payroll"],
    queryFn: async () => {
      const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
      const { data } = await supabase.from("payroll_runs").select("*").eq("month", currentMonth).limit(1);
      return data || [];
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["dashboard-invoices"],
    queryFn: async () => {
      const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
      const { data } = await supabase.from("invoices").select("*").eq("month", currentMonth);
      return data || [];
    },
  });

  const totalEmployees = employees?.length || 0;
  const totalClients = clients?.length || 0;
  const totalHours = clientMetrics?.reduce((sum, m) => sum + (Number(m.actual_hours) || 0), 0) || 0;
  const plannedHours = clientMetrics?.reduce((sum, m) => sum + (Number(m.planned_hours) || 0), 0) || 0;
  const totalPayroll = payrollRuns?.[0]?.total_gross || 0;
  const totalCollections = invoices?.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0) || 0;
  const totalOutstanding = invoices?.reduce((sum, inv) => sum + (Number(inv.balance) || 0), 0) || 0;
  const totalProfit = clientMetrics?.reduce((sum, m) => sum + (Number(m.profit) || 0), 0) || 0;
  const alertCount = notifications?.length || 0;

  const chartData = clientMetrics?.map((m: any) => ({
    name: m.clients?.name || "Unknown",
    planned: Number(m.planned_hours) || 0,
    actual: Number(m.actual_hours) || 0,
  })) || [];

  return (
    <div className="flex flex-col">
      <AppHeader title="Dashboard" subtitle="Business overview" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Active Employees" value={String(totalEmployees)} icon={Users} variant="info" />
          <KpiCard title="Active Clients" value={String(totalClients)} icon={Building2} variant="success" />
          <KpiCard title="Hours This Month" value={totalHours.toLocaleString()} subtitle={`of ${plannedHours.toLocaleString()} planned`} icon={Clock} variant="default" />
          <KpiCard title="Total Payroll" value={`₪${(Number(totalPayroll) / 1000).toFixed(0)}K`} icon={Wallet} variant="warning" />
          <KpiCard title="Collections" value={`₪${(totalCollections / 1000).toFixed(0)}K`} icon={Receipt} variant="success" />
          <KpiCard title="Outstanding" value={`₪${(totalOutstanding / 1000).toFixed(0)}K`} icon={DollarSign} variant="destructive" />
          <KpiCard title="Profit Est." value={`₪${(totalProfit / 1000).toFixed(0)}K`} icon={TrendingUp} variant="success" />
          <KpiCard title="Alerts" value={String(alertCount)} icon={AlertTriangle} variant="destructive" />
        </div>

        {notifications && notifications.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {notifications.map((n) => (
                <div key={n.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                  <div className="h-2 w-2 rounded-full shrink-0 bg-warning" />
                  <span>{n.title}{n.message ? ` — ${n.message}` : ""}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {chartData.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Planned vs Actual Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Legend />
                    <Bar dataKey="planned" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Planned" />
                    <Bar dataKey="actual" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Actual" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {clientMetrics && clientMetrics.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Client Utilization</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="hidden md:table-cell">Planned</TableHead>
                    <TableHead className="hidden md:table-cell">Actual</TableHead>
                    <TableHead>Completion</TableHead>
                    <TableHead className="hidden lg:table-cell">Revenue</TableHead>
                    <TableHead className="hidden lg:table-cell">Cost</TableHead>
                    <TableHead className="hidden lg:table-cell">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientMetrics.map((c: any) => {
                    const completion = Number(c.completion_pct) || 0;
                    return (
                      <TableRow key={c.id} className="cursor-pointer">
                        <TableCell className="font-medium">{c.clients?.name || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{c.planned_hours}h</TableCell>
                        <TableCell className="hidden md:table-cell">{c.actual_hours}h</TableCell>
                        <TableCell>
                          <span className={`font-medium ${completion >= 90 ? "text-success" : completion >= 70 ? "text-warning" : "text-destructive"}`}>
                            {completion}%
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">₪{Number(c.revenue).toLocaleString()}</TableCell>
                        <TableCell className="hidden lg:table-cell">₪{Number(c.employee_cost).toLocaleString()}</TableCell>
                        <TableCell className="hidden lg:table-cell">₪{Number(c.profit).toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {employeeMetrics && employeeMetrics.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Employee Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="hidden md:table-cell">Client</TableHead>
                    <TableHead className="hidden md:table-cell">Target</TableHead>
                    <TableHead className="hidden md:table-cell">Actual</TableHead>
                    <TableHead>Completion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeMetrics.map((e: any) => {
                    const completion = Number(e.completion_pct) || 0;
                    return (
                      <TableRow key={e.id} className="cursor-pointer">
                        <TableCell className="font-medium">{e.employees?.first_name} {e.employees?.last_name}</TableCell>
                        <TableCell className="hidden md:table-cell">{e.clients?.name || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell">{e.target_hours}h</TableCell>
                        <TableCell className="hidden md:table-cell">{e.actual_hours}h</TableCell>
                        <TableCell>
                          <span className={`font-medium ${completion >= 90 ? "text-success" : completion >= 70 ? "text-warning" : "text-destructive"}`}>
                            {completion}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {(!clientMetrics || clientMetrics.length === 0) && (!notifications || notifications.length === 0) && (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="text-sm">No data yet. Add employees, clients, and attendance records to see your dashboard.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
