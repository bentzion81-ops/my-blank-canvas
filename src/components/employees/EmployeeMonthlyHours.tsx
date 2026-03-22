import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, subMonths } from "date-fns";

interface Props {
  employeeId: string;
}

export const EmployeeMonthlyHours = ({ employeeId }: Props) => {
  const queryClient = useQueryClient();
  const [selectedMonth, setSelectedMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [selectedClient, setSelectedClient] = useState("");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);

  // Get assigned clients
  const { data: assignments = [] } = useQuery({
    queryKey: ["employee-assignments", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_client_assignments")
        .select("*, clients(id, name)")
        .eq("employee_id", employeeId)
        .is("end_date", null);
      if (error) throw error;
      return data;
    },
  });

  // Get employee for wage info
  const { data: employee } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("hourly_wage, target_monthly_hours")
        .eq("id", employeeId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Get existing monthly metrics
  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ["employee-monthly-metrics", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_monthly_metrics")
        .select("*, clients(name)")
        .eq("employee_id", employeeId)
        .order("month", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data;
    },
  });

  // Generate month options (last 12 months)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = startOfMonth(subMonths(new Date(), i));
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
  });

  const handleSave = async () => {
    if (!selectedClient || !hours) return;
    setSaving(true);

    const actualHours = parseFloat(hours);
    const grossSalary = actualHours * (employee?.hourly_wage || 0);

    // Check if record exists
    const { data: existing } = await supabase
      .from("employee_monthly_metrics")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("client_id", selectedClient)
      .eq("month", selectedMonth)
      .maybeSingle();

    let error;
    if (existing) {
      ({ error } = await supabase
        .from("employee_monthly_metrics")
        .update({ actual_hours: actualHours, gross_salary: grossSalary })
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase
        .from("employee_monthly_metrics")
        .insert({
          employee_id: employeeId,
          client_id: selectedClient,
          month: selectedMonth,
          actual_hours: actualHours,
          gross_salary: grossSalary,
          target_hours: employee?.target_monthly_hours || 0,
        }));
    }

    if (error) {
      toast.error("Failed to save hours");
    } else {
      toast.success("Hours saved");
      setHours("");
      queryClient.invalidateQueries({ queryKey: ["employee-monthly-metrics", employeeId] });
    }
    setSaving(false);
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm">Monthly Hours</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              {assignments.map((a: any) => (
                <SelectItem key={a.clients?.id || a.client_id} value={a.clients?.id || a.client_id}>
                  {a.clients?.name || "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Hours"
            className="h-9"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <Button size="sm" className="h-9" onClick={handleSave} disabled={!selectedClient || !hours || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : metrics.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No hours recorded yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Gross (₪)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell>{format(new Date(m.month), "MMM yyyy")}</TableCell>
                  <TableCell>{m.clients?.name || "—"}</TableCell>
                  <TableCell>{m.actual_hours || 0}</TableCell>
                  <TableCell>₪{(m.gross_salary || 0).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
