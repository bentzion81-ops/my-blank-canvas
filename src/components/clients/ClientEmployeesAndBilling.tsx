import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard } from "@/components/ui/kpi-card";
import { Loader2, Users, Clock, DollarSign } from "lucide-react";
import { useState } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import { ClientAdditionalCharges } from "./ClientAdditionalCharges";

interface Props {
  clientId: string;
  hourlyRate: number;
  billingType: string;
  monthlyPayment: number;
}

export const ClientEmployeesTab = ({ clientId }: { clientId: string }) => {
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["client-assignments", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_client_assignments")
        .select("*, employees(first_name, last_name, hourly_wage, status)")
        .eq("client_id", clientId)
        .is("end_date", null);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>;

  if (assignments.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No employees assigned to this client yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader><CardTitle className="text-sm">Assigned Employees</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Hourly Wage</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">
                  {a.employees?.first_name} {a.employees?.last_name}
                </TableCell>
                <TableCell>₪{a.employees?.hourly_wage || 0}</TableCell>
                <TableCell className="capitalize">{a.employees?.status || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export const ClientHoursAndBilling = ({ clientId, hourlyRate, billingType, monthlyPayment }: Props) => {
  const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = startOfMonth(subMonths(new Date(), i));
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
  });

  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ["client-employee-metrics", clientId, selectedMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_monthly_metrics")
        .select("*, employees(first_name, last_name, hourly_wage)")
        .eq("client_id", clientId)
        .eq("month", selectedMonth);
      if (error) throw error;
      return data;
    },
  });

  const totalHours = metrics.reduce((sum: number, m: any) => sum + (m.actual_hours || 0), 0);
  const totalEmployeeCost = metrics.reduce((sum: number, m: any) => sum + (m.gross_salary || 0), 0);
  const totalBilling = billingType === "hourly" ? totalHours * hourlyRate : monthlyPayment;
  const profit = totalBilling - totalEmployeeCost;

  return (
    <div className="space-y-4">
      <Select value={selectedMonth} onValueChange={setSelectedMonth}>
        <SelectTrigger className="w-48 h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {monthOptions.map((m) => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Total Hours" value={`${totalHours}h`} icon={Clock} />
        <KpiCard title="Employee Cost" value={`₪${totalEmployeeCost.toLocaleString()}`} icon={DollarSign} />
        <KpiCard title="Client Billing" value={`₪${totalBilling.toLocaleString()}`} icon={DollarSign} />
        <KpiCard
          title="Profit"
          value={`₪${profit.toLocaleString()}`}
          icon={DollarSign}
          
        />
      </div>

      {isLoading ? (
        <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
      ) : metrics.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-8 text-center text-muted-foreground">
            No hours recorded for this month
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Wage/hr</TableHead>
                  <TableHead>Employee Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.employees?.first_name} {m.employees?.last_name}
                    </TableCell>
                    <TableCell>{m.actual_hours || 0}</TableCell>
                    <TableCell>₪{m.employees?.hourly_wage || 0}</TableCell>
                    <TableCell>₪{(m.gross_salary || 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-medium bg-muted/50">
                  <TableCell>Total</TableCell>
                  <TableCell>{totalHours}</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>₪{totalEmployeeCost.toLocaleString()}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ClientAdditionalCharges clientId={clientId} selectedMonth={selectedMonth} />
    </div>
  );
};
