import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Building2, Clock, DollarSign, Wallet, Receipt, TrendingUp, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const chartData = [
  { name: "Client A", planned: 180, actual: 165 },
  { name: "Client B", planned: 220, actual: 210 },
  { name: "Client C", planned: 160, actual: 140 },
  { name: "Client D", planned: 200, actual: 195 },
  { name: "Client E", planned: 140, actual: 155 },
];

const alerts = [
  { message: "3 employees did not report attendance today", type: "destructive" as const },
  { message: "2 invoices are overdue", type: "warning" as const },
  { message: "1 passport expiring in 30 days", type: "warning" as const },
  { message: "Client C completion below 70%", type: "destructive" as const },
];

const clientUtilization = [
  { name: "ABC Corp", planned: 180, actual: 165, completion: 92, revenue: 12000, cost: 8500, profit: 3500, status: "active" },
  { name: "XYZ Ltd", planned: 220, actual: 210, completion: 95, revenue: 15000, cost: 11000, profit: 4000, status: "active" },
  { name: "Delta Inc", planned: 160, actual: 105, completion: 66, revenue: 9000, cost: 7200, profit: 1800, status: "active" },
  { name: "Omega LLC", planned: 200, actual: 195, completion: 98, revenue: 14000, cost: 10000, profit: 4000, status: "paused" },
];

const employeePerformance = [
  { name: "Ahmed Hassan", client: "ABC Corp", target: 180, actual: 165, completion: 92, today: "arrived", payroll: "ready" },
  { name: "Maria Santos", client: "XYZ Ltd", target: 200, actual: 190, completion: 95, today: "arrived", payroll: "draft" },
  { name: "John Smith", client: "Delta Inc", target: 160, actual: 105, completion: 66, today: "not reported", payroll: "draft" },
  { name: "Li Wei", client: "Omega LLC", target: 180, actual: 175, completion: 97, today: "late", payroll: "ready" },
];

const Dashboard = () => {
  return (
    <div className="flex flex-col">
      <AppHeader title="Dashboard" subtitle="Business overview" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Active Employees" value="42" icon={Users} variant="info" trend={{ value: 5, label: "vs last month" }} />
          <KpiCard title="Active Clients" value="18" icon={Building2} variant="success" />
          <KpiCard title="Hours This Month" value="3,240" subtitle="of 3,600 planned" icon={Clock} variant="default" />
          <KpiCard title="Total Payroll" value="₪185K" icon={Wallet} variant="warning" />
          <KpiCard title="Collections" value="₪220K" icon={Receipt} variant="success" />
          <KpiCard title="Outstanding" value="₪45K" icon={DollarSign} variant="destructive" />
          <KpiCard title="Profit Est." value="₪35K" icon={TrendingUp} variant="success" trend={{ value: 8, label: "vs last month" }} />
          <KpiCard title="Alerts" value="6" icon={AlertTriangle} variant="destructive" />
        </div>

        {/* Alerts */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <div className={`h-2 w-2 rounded-full shrink-0 ${alert.type === "destructive" ? "bg-destructive" : "bg-warning"}`} />
                <span>{alert.message}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Chart */}
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
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="planned" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Planned" />
                  <Bar dataKey="actual" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Actual" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Client Utilization */}
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
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientUtilization.map((c) => (
                  <TableRow key={c.name} className="cursor-pointer">
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="hidden md:table-cell">{c.planned}h</TableCell>
                    <TableCell className="hidden md:table-cell">{c.actual}h</TableCell>
                    <TableCell>
                      <span className={`font-medium ${c.completion >= 90 ? "text-success" : c.completion >= 70 ? "text-warning" : "text-destructive"}`}>
                        {c.completion}%
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">₪{c.revenue.toLocaleString()}</TableCell>
                    <TableCell className="hidden lg:table-cell">₪{c.cost.toLocaleString()}</TableCell>
                    <TableCell className="hidden lg:table-cell">₪{c.profit.toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Employee Performance */}
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
                  <TableHead>Today</TableHead>
                  <TableHead className="hidden lg:table-cell">Payroll</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeePerformance.map((e) => (
                  <TableRow key={e.name} className="cursor-pointer">
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="hidden md:table-cell">{e.client}</TableCell>
                    <TableCell className="hidden md:table-cell">{e.target}h</TableCell>
                    <TableCell className="hidden md:table-cell">{e.actual}h</TableCell>
                    <TableCell>
                      <span className={`font-medium ${e.completion >= 90 ? "text-success" : e.completion >= 70 ? "text-warning" : "text-destructive"}`}>
                        {e.completion}%
                      </span>
                    </TableCell>
                    <TableCell><StatusBadge status={e.today} /></TableCell>
                    <TableCell className="hidden lg:table-cell"><StatusBadge status={e.payroll} /></TableCell>
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

export default Dashboard;
