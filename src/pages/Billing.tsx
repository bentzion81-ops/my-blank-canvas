import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth, subMonths, endOfMonth, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Receipt, DollarSign, AlertTriangle, Users, RefreshCw, Plus, Loader2, FileDown, Eye } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`;

const Billing = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [month, setMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [refreshing, setRefreshing] = useState(false);
  const [payOpen, setPayOpen] = useState<null | { clientId: string; clientName: string; balance: number; invoiceId?: string }>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const fromStr = month;
  const toStr = format(endOfMonth(new Date(month)), "yyyy-MM-dd");

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = startOfMonth(subMonths(new Date(), i));
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
  });

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["billing-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, billing_type, monthly_payment, hourly_rate, status, payment_terms_days, vat_rate, tax_withholding_pct, invoicing_company")
        .neq("status", "ended")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: workLogs = [] } = useQuery({
    queryKey: ["billing-work-logs", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_logs_unified" as any)
        .select("employee_id, client_id, hours_worked, status")
        .gte("work_date", fromStr)
        .lte("work_date", toStr);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["billing-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_client_assignments")
        .select("employee_id, client_id, is_primary, start_date, end_date")
        .not("client_id", "is", null);
      if (error) throw error;
      return data || [];
    },
  });

  const employeeAssignedClient = useMemo(() => {
    const map = new Map<string, string>();
    const sorted = [...(assignments as any[])].sort((a, b) => {
      if (!!a.end_date !== !!b.end_date) return a.end_date ? 1 : -1;
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return (b.start_date || "").localeCompare(a.start_date || "");
    });
    for (const a of sorted) {
      if (!a.employee_id || !a.client_id || a.end_date || map.has(a.employee_id)) continue;
      map.set(a.employee_id, a.client_id);
    }
    return map;
  }, [assignments]);

  const { data: charges = [] } = useQuery({
    queryKey: ["billing-charges", fromStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_additional_charges" as any)
        .select("client_id, total_charge, quantity, unit_charge")
        .eq("month", fromStr);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: invoices = [], refetch: refetchInvoices } = useQuery({
    queryKey: ["billing-invoices", fromStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, client_id, amount, paid_amount, balance, status, invoice_number, due_date, invoice_payments(amount)")
        .eq("month", fromStr);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: invoiceMarks = [], refetch: refetchMarks } = useQuery({
    queryKey: ["billing-invoice-marks", fromStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_invoice_marks" as any)
        .select("id, client_id, issued")
        .eq("month", fromStr);
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const rows = useMemo(() => {
    return clients.map((c: any) => {
      const hours = workLogs
        .filter((l) => {
          if (l.status !== "approved") return false;
          const resolvedClientId = l.client_id || employeeAssignedClient.get(l.employee_id);
          return resolvedClientId === c.id;
        })
        .reduce((s, l) => s + Number(l.hours_worked || 0), 0);

      const rate = Number(c.hourly_rate || 0);
      const baseRevenue = rate > 0
        ? hours * rate
        : Number(c.monthly_payment || 0);

      const additional = charges
        .filter((ch) => ch.client_id === c.id)
        .reduce((s, ch) => s + (Number(ch.total_charge) || (Number(ch.quantity) * Number(ch.unit_charge)) || 0), 0);

      const subtotal = baseRevenue + additional;
      const vatPct = Number(c.vat_rate ?? 18);
      const vat = subtotal * (vatPct / 100);
      const totalWithVat = subtotal + vat;
      const withholdingPct = Number(c.tax_withholding_pct || 0);
      const withholding = totalWithVat * (withholdingPct / 100);
      const totalDue = totalWithVat - withholding;

      const clientInvoices = invoices.filter((i: any) => i.client_id === c.id);
      const paid = clientInvoices.reduce((s: number, i: any) => s + Number(i.paid_amount || 0), 0);
      const balance = totalDue - paid;

      const today = new Date();
      const overdue = clientInvoices.some((i: any) =>
        i.due_date && new Date(i.due_date) < today && Number(i.balance) > 0
      );

      let status: string;
      if (totalDue === 0) status = "no charge";
      else if (balance <= 0) status = "paid";
      else if (paid > 0) status = "partial";
      else if (overdue) status = "overdue";
      else status = "due";

      const mark = invoiceMarks.find((m: any) => m.client_id === c.id);
      return {
        client: c,
        hours,
        baseRevenue,
        additional,
        subtotal,
        vatPct,
        vat,
        totalWithVat,
        withholdingPct,
        withholding,
        totalDue,
        paid,
        balance,
        status,
        invoice: clientInvoices[0],
        invoiceIssued: mark ? !!mark.issued : !!clientInvoices[0],
        invoiceMarkId: mark?.id as string | undefined,
      };
    }).filter((r) => r.totalDue > 0 || r.hours > 0);
  }, [clients, workLogs, employeeAssignedClient, charges, invoices, invoiceMarks]);

  const totals = useMemo(() => ({
    due: rows.reduce((s, r) => s + r.totalDue, 0),
    paid: rows.reduce((s, r) => s + r.paid, 0),
    balance: rows.reduce((s, r) => s + r.balance, 0),
    debtors: rows.filter((r) => r.balance > 0).length,
  }), [rows]);

  const balanceByCompany = useMemo(() => {
    const map: Record<string, number> = { urban_link: 0, ab_property: 0 };
    for (const r of rows) {
      const key = (r.client.invoicing_company as string) || "urban_link";
      map[key] = (map[key] || 0) + r.balance;
    }
    return map;
  }, [rows]);

  const companyLabel = (c?: string) =>
    c === "ab_property" ? "א.ב ניהול נכסים" : "אורבן לינק";

  const refresh = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.rpc("refresh_client_monthly_metrics" as any, { _month: fromStr });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["billing-work-logs"] });
      qc.invalidateQueries({ queryKey: ["billing-invoices"] });
      qc.invalidateQueries({ queryKey: ["billing-charges"] });
      toast.success("Metrics refreshed");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleInvoiceIssued = async (row: typeof rows[number]) => {
    const nextIssued = !row.invoiceIssued;
    const { error } = await supabase
      .from("client_invoice_marks" as any)
      .upsert(
        { client_id: row.client.id, month: fromStr, issued: nextIssued },
        { onConflict: "client_id,month" },
      );
    if (error) return toast.error(error.message);
    toast.success(nextIssued ? "Marked as issued" : "Unmarked");
    refetchMarks();
  };

  const createInvoice = async (row: typeof rows[number]) => {
    if (row.totalDue <= 0) return toast.error("Nothing to invoice");
    const c = row.client;
    const days = Number(c.payment_terms_days || 30);
    const dueDate = format(addDays(endOfMonth(new Date(month)), days), "yyyy-MM-dd");
    const number = `INV-${format(new Date(month), "yyyyMM")}-${c.id.slice(0, 6).toUpperCase()}`;
    const { error } = await supabase.from("invoices").insert({
      client_id: c.id,
      month: fromStr,
      amount: row.totalDue,
      balance: row.totalDue,
      paid_amount: 0,
      due_date: dueDate,
      invoice_number: number,
      status: "sent",
    });
    if (error) return toast.error(error.message);
    toast.success("Invoice created");
    refetchInvoices();
  };

  const recordPayment = async () => {
    if (!payOpen) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");

    let invoiceId = payOpen.invoiceId;
    if (!invoiceId) {
      const row = rows.find((r) => r.client.id === payOpen.clientId);
      if (!row) return toast.error("Client not found");
      const c = row.client;
      const days = Number(c.payment_terms_days || 30);
      const dueDate = format(addDays(endOfMonth(new Date(month)), days), "yyyy-MM-dd");
      const number = `INV-${format(new Date(month), "yyyyMM")}-${c.id.slice(0, 6).toUpperCase()}`;
      const { data: ins, error } = await supabase.from("invoices").insert({
        client_id: c.id,
        month: fromStr,
        amount: row.totalDue,
        balance: row.totalDue,
        paid_amount: 0,
        due_date: dueDate,
        invoice_number: number,
        status: "sent",
      }).select("id").single();
      if (error) return toast.error(error.message);
      invoiceId = ins.id;
    }

    const { error: payErr } = await supabase.from("invoice_payments").insert({
      invoice_id: invoiceId!,
      amount,
      payment_date: format(new Date(), "yyyy-MM-dd"),
      notes: payNotes || null,
    });
    if (payErr) return toast.error(payErr.message);

    // update invoice paid_amount/balance/status
    const inv = invoices.find((i: any) => i.id === invoiceId);
    if (inv) {
      const newPaid = Number(inv.paid_amount || 0) + amount;
      const newBalance = Number(inv.amount || 0) - newPaid;
      const newStatus = newBalance <= 0 ? "paid" : newPaid > 0 ? "partial" : inv.status;
      await supabase.from("invoices").update({
        paid_amount: newPaid,
        balance: newBalance,
        status: newStatus,
      }).eq("id", invoiceId!);
    }

    toast.success("Payment recorded");
    setPayOpen(null);
    setPayAmount("");
    setPayNotes("");
    refetchInvoices();
  };

  const exportCsv = () => {
    const header = ["Client", "Hours", "Base", "Additional", "Subtotal", "VAT%", "VAT", "Total w/VAT", "Withhold%", "Withholding", "Total Due", "Paid", "Balance", "Status"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        `"${r.client.name}"`, r.hours.toFixed(1), r.baseRevenue, r.additional,
        r.subtotal, r.vatPct, r.vat.toFixed(2), r.totalWithVat.toFixed(2),
        r.withholdingPct, r.withholding.toFixed(2),
        r.totalDue.toFixed(2), r.paid, r.balance.toFixed(2), r.status,
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `billing-${fromStr}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col">
      <AppHeader title="Billing & Collections" subtitle={format(new Date(month), "MMMM yyyy")} />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <FileDown className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard title="Total Due" value={fmt(totals.due)} icon={Receipt} variant="info" />
          <KpiCard title="Paid" value={fmt(totals.paid)} icon={DollarSign} variant="success" />
          <KpiCard title="Outstanding" value={fmt(totals.balance)} icon={DollarSign} variant="warning" />
          <KpiCard title="Clients with Debt" value={String(totals.debtors)} icon={AlertTriangle} variant="destructive" />
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Additional</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">Subtotal</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Withholding</TableHead>
                  <TableHead className="text-right">Total Due</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Invoice issued</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={15} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={15} className="text-center py-8 text-muted-foreground">No billing data for this month</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.client.id}>
                    <TableCell className="font-medium">{r.client.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.hours.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.baseRevenue)}</TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell">{fmt(r.additional)}</TableCell>
                    <TableCell className="text-right tabular-nums hidden lg:table-cell">{fmt(r.subtotal)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.vat)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.withholdingPct > 0 ? `−${fmt(r.withholding)} (${r.withholdingPct}%)` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmt(r.totalDue)}</TableCell>
                    <TableCell className="text-right tabular-nums hidden md:table-cell text-success">{fmt(r.paid)}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${r.balance > 0 ? "text-destructive" : "text-success"}`}>{fmt(r.balance)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={r.invoiceIssued}
                        disabled={r.totalDue <= 0}
                        onCheckedChange={() => toggleInvoiceIssued(r)}
                        aria-label="Invoice issued"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        {r.balance > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setPayOpen({ clientId: r.client.id, clientName: r.client.name, balance: r.balance, invoiceId: r.invoice?.id })}>
                            <DollarSign className="h-3.5 w-3.5 mr-1" /> Pay
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/clients/${r.client.id}`)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
            <DialogTitle>Record Payment — {payOpen?.clientName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Outstanding balance: <span className="font-medium text-foreground">{fmt(payOpen?.balance || 0)}</span></div>
            <div className="space-y-1.5">
              <Label>Amount (₪)</Label>
              <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>Cancel</Button>
            <Button onClick={recordPayment}>Save Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Billing;
