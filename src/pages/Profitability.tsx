import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, Percent, FileDown, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`;

const Profitability = () => {
  const [month, setMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const fromStr = month;
  const toStr = format(endOfMonth(new Date(month)), "yyyy-MM-dd");

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = startOfMonth(subMonths(new Date(), i));
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
  });

  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["profit-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, billing_type, monthly_payment, hourly_rate, status")
        .neq("status", "ended")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["profit-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, hourly_wage, transportation, medical_insurance, food, other_expenses");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["profit-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_client_assignments")
        .select("employee_id, client_id, employee_hourly_wage, end_date");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: workLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["profit-logs", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_logs_unified" as any)
        .select("client_id, employee_id, hours_worked, status")
        .gte("work_date", fromStr)
        .lte("work_date", toStr);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: charges = [] } = useQuery({
    queryKey: ["profit-charges", fromStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_additional_charges" as any)
        .select("client_id, total_charge, total_cost, quantity, unit_charge, unit_cost")
        .eq("month", fromStr);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const rateMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assignments as any[]) {
      if (a.employee_hourly_wage != null && !a.end_date) {
        m.set(`${a.employee_id}|${a.client_id}`, Number(a.employee_hourly_wage));
      }
    }
    return m;
  }, [assignments]);

  const empMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of employees as any[]) m.set(e.id, e);
    return m;
  }, [employees]);

  const employeeAssignedClient = useMemo(() => {
    const m = new Map<string, string>();
    const sorted = [...(assignments as any[])].sort((a, b) => {
      const ae = a.end_date ? 1 : 0;
      const be = b.end_date ? 1 : 0;
      if (ae !== be) return ae - be;
      return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
    });
    for (const a of sorted) {
      if (a.employee_id && a.client_id && !m.has(a.employee_id)) {
        m.set(a.employee_id, a.client_id);
      }
    }
    return m;
  }, [assignments]);

  const rows = useMemo(() => {
    const approved = workLogs.filter((l) => l.status === "approved");

    // Resolve client_id for unassigned logs via employee's active assignment
    const resolvedLogs = approved.map((l) => ({
      ...l,
      client_id: l.client_id || (l.employee_id ? employeeAssignedClient.get(l.employee_id) : null),
    }));

    const empTotalHours = new Map<string, number>();
    for (const l of resolvedLogs) {
      if (!l.employee_id) continue;
      empTotalHours.set(l.employee_id, (empTotalHours.get(l.employee_id) || 0) + Number(l.hours_worked || 0));
    }

    return clients.map((c: any) => {
      const cLogs = resolvedLogs.filter((l) => l.client_id === c.id);
      const hours = cLogs.reduce((s, l) => s + Number(l.hours_worked || 0), 0);

      let employeeCost = 0;
      let overheadCost = 0;
      const empHoursAtClient = new Map<string, number>();

      for (const l of cLogs) {
        const h = Number(l.hours_worked || 0);
        const emp = l.employee_id ? empMap.get(l.employee_id) : null;
        const rate = (l.employee_id && l.client_id ? rateMap.get(`${l.employee_id}|${l.client_id}`) : undefined)
          ?? Number(emp?.hourly_wage || 0);
        employeeCost += h * rate;
        if (l.employee_id) {
          empHoursAtClient.set(l.employee_id, (empHoursAtClient.get(l.employee_id) || 0) + h);
        }
      }

      for (const [empId, hAtClient] of empHoursAtClient) {
        const emp = empMap.get(empId);
        if (!emp) continue;
        const totalH = empTotalHours.get(empId) || hAtClient;
        if (totalH <= 0) continue;
        const ratio = hAtClient / totalH;
        const overhead =
          (Number(emp.transportation || 0) +
            Number(emp.medical_insurance || 0) +
            Number(emp.food || 0) +
            Number(emp.other_expenses || 0)) * ratio;
        overheadCost += overhead;
      }

      const cCharges = charges.filter((ch) => ch.client_id === c.id);
      const additionalRevenue = cCharges.reduce(
        (s, ch) => s + (Number(ch.total_charge) || (Number(ch.quantity) * Number(ch.unit_charge)) || 0),
        0,
      );
      const additionalCost = cCharges.reduce(
        (s, ch) => s + (Number(ch.total_cost) || (Number(ch.quantity) * Number(ch.unit_cost)) || 0),
        0,
      );

      const rate = Number(c.hourly_rate || 0);
      const baseRevenue = rate > 0 ? hours * rate : Number(c.monthly_payment || 0);

      const revenue = baseRevenue + additionalRevenue;
      const totalCost = employeeCost + overheadCost + additionalCost;
      const profit = revenue - totalCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        client: c, hours, revenue, employeeCost, overheadCost: overheadCost + additionalCost,
        totalCost, profit, margin,
      };
    });
  }, [clients, workLogs, charges, rateMap, empMap, employeeAssignedClient]);

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const cost = rows.reduce((s, r) => s + r.totalCost, 0);
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, cost, profit, margin };
  }, [rows]);

  const chartData = useMemo(
    () => rows.slice(0, 12).map((r) => ({
      name: r.client.name.length > 14 ? r.client.name.slice(0, 14) + "…" : r.client.name,
      revenue: Math.round(r.revenue),
      cost: Math.round(r.totalCost),
    })),
    [rows],
  );

  const marginColor = (m: number) =>
    m >= 30 ? "text-success" : m >= 15 ? "text-warning" : "text-destructive";
  const marginBg = (m: number) =>
    m >= 30 ? "bg-success/10 text-success border-success/20"
    : m >= 15 ? "bg-warning/10 text-warning border-warning/20"
    : "bg-destructive/10 text-destructive border-destructive/20";

  const exportCsv = () => {
    const header = ["Client", "Hours", "Revenue", "Employee Cost", "Overhead", "Total Cost", "Profit", "Margin %"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        `"${r.client.name}"`, r.hours.toFixed(1), r.revenue.toFixed(0),
        r.employeeCost.toFixed(0), r.overheadCost.toFixed(0), r.totalCost.toFixed(0),
        r.profit.toFixed(0), r.margin.toFixed(1),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `profitability-${fromStr}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = loadingClients || loadingLogs;

  return (
    <div className="flex flex-col">
      <AppHeader title="Profitability" subtitle={format(new Date(month), "MMMM yyyy")} />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Revenue" value={fmt(totals.revenue)} icon={DollarSign} variant="info" />
          <KpiCard title="Total Cost" value={fmt(totals.cost)} icon={TrendingDown} variant="warning" />
          <KpiCard title="Profit" value={fmt(totals.profit)} icon={TrendingUp} variant={totals.profit >= 0 ? "success" : "destructive"} />
          <KpiCard title="Avg Margin" value={`${totals.margin.toFixed(1)}%`} icon={Percent} variant={totals.margin >= 30 ? "success" : totals.margin >= 15 ? "warning" : "destructive"} />
        </div>

        {chartData.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-sm">Revenue vs Cost</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => `₪${Number(v).toLocaleString()}`} />
                  <Legend />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" />
                  <Bar dataKey="cost" fill="hsl(var(--destructive))" name="Cost" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Employee Cost</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Overhead</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No profitability data for this month</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.client.id}>
                    <TableCell className="font-medium">{r.client.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.hours.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.employeeCost)}</TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell">{fmt(r.overheadCost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.totalCost)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums font-medium", r.profit >= 0 ? "text-success" : "text-destructive")}>{fmt(r.profit)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={cn("font-medium tabular-nums", marginBg(r.margin))}>
                        {r.margin.toFixed(1)}%
                      </Badge>
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

export default Profitability;
