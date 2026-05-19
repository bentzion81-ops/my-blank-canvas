import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, subMonths, endOfMonth } from "date-fns";
import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Clock, Wallet, DollarSign, TrendingDown, Plus, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`;

const Payroll = () => {
  const [month, setMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [payOpen, setPayOpen] = useState<null | { employeeId: string; employeeName: string; balance: number }>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = startOfMonth(subMonths(new Date(), i));
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
  });

  const fromStr = month;
  const toStr = format(endOfMonth(new Date(month)), "yyyy-MM-dd");

  const { data: employees = [] } = useQuery({
    queryKey: ["payroll-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, hourly_wage, transportation, medical_insurance, food, other_expenses, rent_deduction, loan_deduction, equipment_deduction, other_deductions, status")
        .order("first_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["payroll-work-logs", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_logs_unified" as any)
        .select("employee_id, client_id, client_name, custom_workplace, source, hours_worked, payment_amount, status, work_date")
        .gte("work_date", fromStr)
        .lte("work_date", toStr);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: payments = [], refetch: refetchPayments } = useQuery({
    queryKey: ["payroll-payments", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_payments")
        .select("amount, payment_date, payroll_item_id, payroll_items!inner(employee_id, payroll_runs!inner(month))")
        .gte("payment_date", fromStr)
        .lte("payment_date", toStr);
      if (error) throw error;
      return data || [];
    },
  });

  const rows = useMemo(() => {
    return employees.map((emp: any) => {
      // Group hours/pay by site for this employee
      const empLogs = logs.filter(
        (l: any) => l.employee_id === emp.id && l.status !== "rejected" && l.status !== "no_show"
      );
      const sites = new Map<string, { name: string; hours: number; gross: number; sources: Set<string> }>();
      let totalHours = 0;
      let grossFromLogs = 0;
      for (const l of empLogs) {
        const key = l.client_id || l.custom_workplace || "unassigned";
        const name = l.client_name || l.custom_workplace || "Unassigned";
        const h = Number(l.hours_worked) || 0;
        const pay = Number(l.payment_amount) || 0;
        totalHours += h;
        // For attendance/manual sources payment_amount may be 0 — fall back to hourly_wage
        const lineGross = pay > 0 ? pay : h * Number(emp.hourly_wage || 0);
        grossFromLogs += lineGross;
        const cur = sites.get(key) || { name, hours: 0, gross: 0, sources: new Set() };
        cur.hours += h;
        cur.gross += lineGross;
        cur.sources.add(l.source);
        sites.set(key, cur);
      }

      const expenses =
        Number(emp.transportation || 0) +
        Number(emp.medical_insurance || 0) +
        Number(emp.food || 0) +
        Number(emp.other_expenses || 0);
      const deductions =
        Number(emp.rent_deduction || 0) +
        Number(emp.loan_deduction || 0) +
        Number(emp.equipment_deduction || 0) +
        Number(emp.other_deductions || 0);

      const totalDue = grossFromLogs + expenses - deductions;
      const paid = payments
        .filter((p: any) => p.payroll_items?.employee_id === emp.id)
        .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const balance = totalDue - paid;

      return {
        emp,
        sites: Array.from(sites.values()),
        totalHours,
        grossFromLogs,
        expenses,
        deductions,
        totalDue,
        paid,
        balance,
      };
    }).filter((r) => r.totalHours > 0 || r.paid > 0 || r.expenses > 0 || r.deductions > 0);
  }, [employees, logs, payments]);

  const totals = useMemo(() => ({
    hours: rows.reduce((s, r) => s + r.totalHours, 0),
    gross: rows.reduce((s, r) => s + r.grossFromLogs, 0),
    deductions: rows.reduce((s, r) => s + r.deductions, 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
    balance: rows.reduce((s, r) => s + r.balance, 0),
  }), [rows]);

  async function recordPayment() {
    if (!payOpen) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");

    // Ensure a payroll_run for this month + payroll_item for this employee
    const { data: run } = await supabase.from("payroll_runs").select("id").eq("month", month).maybeSingle();
    let runId = run?.id;
    if (!runId) {
      const { data: newRun, error } = await supabase
        .from("payroll_runs").insert({ month }).select("id").single();
      if (error) return toast.error(error.message);
      runId = newRun.id;
    }
    const { data: item } = await supabase
      .from("payroll_items")
      .select("id")
      .eq("payroll_run_id", runId)
      .eq("employee_id", payOpen.employeeId)
      .maybeSingle();
    let itemId = item?.id;
    if (!itemId) {
      const { data: newItem, error } = await supabase
        .from("payroll_items")
        .insert({ payroll_run_id: runId, employee_id: payOpen.employeeId })
        .select("id").single();
      if (error) return toast.error(error.message);
      itemId = newItem.id;
    }
    const { error: payErr } = await supabase.from("payroll_payments").insert({
      payroll_item_id: itemId,
      amount,
      payment_date: format(new Date(), "yyyy-MM-dd"),
      notes: payNotes || null,
    });
    if (payErr) return toast.error(payErr.message);
    toast.success("Payment recorded");
    setPayOpen(null);
    setPayAmount("");
    setPayNotes("");
    refetchPayments();
  }

  return (
    <div className="flex flex-col">
      <AppHeader title="Payroll" subtitle={format(new Date(month), "MMMM yyyy")} />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard title="Total Hours" value={`${totals.hours.toFixed(0)}h`} icon={Clock} variant="info" />
          <KpiCard title="Gross" value={fmt(totals.gross)} icon={Wallet} />
          <KpiCard title="Deductions" value={fmt(totals.deductions)} icon={TrendingDown} variant="warning" />
          <KpiCard title="Paid" value={fmt(totals.paid)} icon={DollarSign} variant="success" />
          <KpiCard title="Balance Due" value={fmt(totals.balance)} icon={DollarSign} variant="destructive" />
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Work sites (hours)</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No payroll data for this month</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.emp.id}>
                    <TableCell className="font-medium">{r.emp.first_name} {r.emp.last_name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {r.sites.length === 0 ? <span className="text-muted-foreground text-xs">—</span> : r.sites.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span>{s.name}</span>
                            <span className="text-muted-foreground">({s.hours.toFixed(1)}h · {fmt(s.gross)})</span>
                            {Array.from(s.sources).map((src) => (
                              <Badge key={src} variant="outline" className="text-[10px] py-0 h-4">{src}</Badge>
                            ))}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.totalHours.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.grossFromLogs)}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">+{fmt(r.expenses)}</TableCell>
                    <TableCell className="text-right tabular-nums text-warning">-{fmt(r.deductions)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{fmt(r.totalDue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.paid)}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      <span className={r.balance > 0 ? "text-destructive" : "text-success"}>{fmt(r.balance)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => { setPayOpen({ employeeId: r.emp.id, employeeName: `${r.emp.first_name} ${r.emp.last_name}`, balance: r.balance }); setPayAmount(String(Math.max(0, Math.round(r.balance)))); }}>
                        <Plus className="h-3 w-3 mr-1" /> Pay
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!payOpen} onOpenChange={(o) => !o && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment — {payOpen?.employeeName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Outstanding balance: <span className="font-semibold text-foreground">{fmt(payOpen?.balance || 0)}</span></div>
            <div>
              <Label>Amount (₪)</Label>
              <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Bank transfer ref, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>Cancel</Button>
            <Button onClick={recordPayment}>Save payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payroll;
