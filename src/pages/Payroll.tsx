import { useMemo, useState, Fragment } from "react";
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
import { Clock, Wallet, DollarSign, TrendingDown, Plus, Loader2, ChevronDown, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`;

const Payroll = () => {
  const [month, setMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [payOpen, setPayOpen] = useState<null | { employeeId: string; employeeName: string; balance: number }>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
        .select("id, first_name, last_name, passport_number, hourly_wage, transportation, medical_insurance, food, other_expenses, rent_deduction, loan_deduction, equipment_deduction, other_deductions, status")
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

  const { data: assignmentRates = [] } = useQuery({
    queryKey: ["payroll-assignment-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_client_assignments")
        .select("employee_id, client_id, employee_hourly_wage, is_primary, start_date")
        .not("employee_hourly_wage", "is", null);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: additionalItems = [] } = useQuery({
    queryKey: ["payroll-additional-items", fromStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_additional_items" as any)
        .select("*")
        .or(`month.is.null,month.eq.${fromStr}`);
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

  const rateMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assignmentRates as any[]) {
      m.set(`${a.employee_id}|${a.client_id}`, Number(a.employee_hourly_wage));
    }
    return m;
  }, [assignmentRates]);

  // Fallback rate per employee (primary assignment, else any assignment with a rate)
  const employeeFallbackRate = useMemo(() => {
    const m = new Map<string, number>();
    const sorted = [...(assignmentRates as any[])].sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return (b.start_date || "").localeCompare(a.start_date || "");
    });
    for (const a of sorted) {
      if (!m.has(a.employee_id)) m.set(a.employee_id, Number(a.employee_hourly_wage));
    }
    return m;
  }, [assignmentRates]);

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
        // Rate precedence: per-(employee,client) override > employee-level override (any assignment with a custom rate) > log payment_amount > employee default
        const directRate = l.client_id ? rateMap.get(`${emp.id}|${l.client_id}`) : undefined;
        const fallbackRate = employeeFallbackRate.get(emp.id);
        const overrideRate = directRate ?? fallbackRate;
        const lineGross = overrideRate != null
          ? h * overrideRate
          : (pay > 0 ? pay : h * Number(emp.hourly_wage || 0));
        grossFromLogs += lineGross;
        const cur = sites.get(key) || { name, hours: 0, gross: 0, sources: new Set() };
        cur.hours += h;
        cur.gross += lineGross;
        cur.sources.add(l.source);
        sites.set(key, cur);
      }

      const empItems = (additionalItems as any[]).filter((it) => it.employee_id === emp.id);
      const itemsExpenses = empItems.filter((it) => it.type === "expense").reduce((s, it) => s + Number(it.amount || 0), 0);
      const itemsDeductions = empItems.filter((it) => it.type === "deduction").reduce((s, it) => s + Number(it.amount || 0), 0);

      const expenses =
        Number(emp.transportation || 0) +
        Number(emp.medical_insurance || 0) +
        Number(emp.food || 0) +
        Number(emp.other_expenses || 0) +
        itemsExpenses;
      const deductions =
        Number(emp.rent_deduction || 0) +
        Number(emp.loan_deduction || 0) +
        Number(emp.equipment_deduction || 0) +
        Number(emp.other_deductions || 0) +
        itemsDeductions;

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
        items: empItems,
      };
    });
  }, [employees, logs, payments, rateMap, employeeFallbackRate, additionalItems]);

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
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>ID / Passport</TableHead>
                  <TableHead className="text-right">Total Hours</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No payroll data for this month</TableCell></TableRow>
                ) : rows.map((r) => {
                  const isOpen = expanded.has(r.emp.id);
                  return (
                    <Fragment key={r.emp.id}>
                      <TableRow key={r.emp.id} className="cursor-pointer" onClick={() => toggleRow(r.emp.id)}>
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="font-medium">{r.emp.first_name} {r.emp.last_name}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{r.emp.passport_number || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.totalHours.toFixed(1)}h</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmt(r.totalDue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.paid)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          <span className={r.balance > 0 ? "text-destructive" : "text-success"}>{fmt(r.balance)}</span>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="outline" onClick={() => { setPayOpen({ employeeId: r.emp.id, employeeName: `${r.emp.first_name} ${r.emp.last_name}`, balance: r.balance }); setPayAmount(String(Math.max(0, Math.round(r.balance)))); }}>
                            <Plus className="h-3 w-3 mr-1" /> Pay
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={r.emp.id + "-detail"} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell></TableCell>
                          <TableCell colSpan={7} className="py-3">
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work sites breakdown</div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Workplace</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead className="text-right">Hours</TableHead>
                                    <TableHead className="text-right">Rate / hr</TableHead>
                                    <TableHead className="text-right">Subtotal</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {r.sites.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-xs">No work logs</TableCell></TableRow>
                                  ) : r.sites.map((s, i) => {
                                    const rate = s.hours > 0 ? s.gross / s.hours : 0;
                                    return (
                                      <TableRow key={i}>
                                        <TableCell className="font-medium">{s.name}</TableCell>
                                        <TableCell>
                                          <div className="flex gap-1 flex-wrap">
                                            {Array.from(s.sources).map((src) => (
                                              <Badge key={src} variant="outline" className="text-[10px] py-0 h-4">{src}</Badge>
                                            ))}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums">{s.hours.toFixed(1)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{fmt(rate)}</TableCell>
                                        <TableCell className="text-right tabular-nums font-medium">{fmt(s.gross)}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 text-xs">
                                <div className="rounded-md border p-2">
                                  <div className="text-muted-foreground">Gross (hours)</div>
                                  <div className="font-semibold tabular-nums">{fmt(r.grossFromLogs)}</div>
                                </div>
                                <div className="rounded-md border p-2">
                                  <div className="text-muted-foreground">Expenses (+)</div>
                                  <div className="font-semibold tabular-nums text-success">+{fmt(r.expenses)}</div>
                                </div>
                                <div className="rounded-md border p-2">
                                  <div className="text-muted-foreground">Deductions (-)</div>
                                  <div className="font-semibold tabular-nums text-warning">-{fmt(r.deductions)}</div>
                                </div>
                                <div className="rounded-md border p-2">
                                  <div className="text-muted-foreground">Total Due</div>
                                  <div className="font-semibold tabular-nums">{fmt(r.totalDue)}</div>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
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
