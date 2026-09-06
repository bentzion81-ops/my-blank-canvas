import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, subMonths, addMonths, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/layout/AppHeader";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useClientProfitability } from "@/hooks/useClientProfitability";
import {
  TrendingUp, TrendingDown, Wallet, Receipt, AlertTriangle, CheckCircle2,
  Plus, Trash2, Loader2, CalendarClock,
} from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`;

type Draft = {
  direction: "income" | "expense";
  name: string;
  category: string;
  amount: string;
  recurrence: "monthly" | "one_time";
  month: string;
  endMonth: string;
  installments: string;
  notes: string;
};

const emptyDraft = (month: string): Draft => ({
  direction: "expense",
  name: "",
  category: "",
  amount: "",
  recurrence: "one_time",
  month,
  endMonth: "",
  installments: "1",
  notes: "",
});

const CashFlow = () => {
  const qc = useQueryClient();
  const [month, setMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft(format(startOfMonth(new Date()), "yyyy-MM-dd")));
  const [saving, setSaving] = useState(false);

  const fromStr = month;
  const toStr = format(endOfMonth(new Date(month)), "yyyy-MM-dd");

  const monthOptions = Array.from({ length: 18 }, (_, i) => {
    const d = startOfMonth(addMonths(subMonths(new Date(), 12), i));
    return { value: format(d, "yyyy-MM-dd"), label: format(d, "MMMM yyyy") };
  });

  // ---- Expected client income (mirrors Billing math) ----
  const { byClient, isLoading: loadingProfit } = useClientProfitability(fromStr, toStr);

  // VAT is remitted to the authorities one month after it is billed
  const prevMonth = format(startOfMonth(subMonths(new Date(month), 1)), "yyyy-MM-dd");
  const prevMonthEnd = format(endOfMonth(subMonths(new Date(month), 1)), "yyyy-MM-dd");
  const { byClient: prevByClient } = useClientProfitability(prevMonth, prevMonthEnd);

  const { data: billingClients = [] } = useQuery({
    queryKey: ["cashflow-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, status, vat_rate, tax_withholding_pct, invoicing_company")
        .neq("status", "ended")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["cashflow-invoices", fromStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("client_id, paid_amount")
        .eq("month", fromStr);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: payrollPayments = [] } = useQuery({
    queryKey: ["cashflow-payroll-payments", fromStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_payments")
        .select("amount, payroll_items!inner(payroll_runs!inner(month))")
        .eq("payroll_items.payroll_runs.month", fromStr);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["cashflow-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_flow_items" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: installments = [] } = useQuery({
    queryKey: ["cashflow-installments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_flow_installments" as any)
        .select("*")
        .order("due_month");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  // ---- Client income breakdown ----
  const clientIncome = useMemo(() => {
    let net = 0, vat = 0, withholding = 0, collected = 0;
    for (const c of billingClients as any[]) {
      const p = byClient.get(c.id);
      const revenue = Number(p?.revenue || 0);
      if (revenue <= 0) continue;
      const v = revenue * (Number(c.vat_rate ?? 18) / 100);
      const w = revenue * (Number(c.tax_withholding_pct || 0) / 100);
      net += revenue;
      vat += v;
      withholding += w;
    }
    collected = (invoices as any[]).reduce((s, i) => s + Number(i.paid_amount || 0), 0);
    const totalDue = net + vat - withholding;
    return { net, vat, withholding, totalDue, collected, outstanding: Math.max(totalDue - collected, 0) };
  }, [billingClients, byClient, invoices]);

  // VAT actually leaving this month = VAT billed in the previous month
  const vatPayable = useMemo(() => {
    let vat = 0;
    for (const c of billingClients as any[]) {
      const revenue = Number(prevByClient.get(c.id)?.revenue || 0);
      if (revenue <= 0) continue;
      vat += revenue * (Number(c.vat_rate ?? 18) / 100);
    }
    return vat;
  }, [billingClients, prevByClient]);

  const payrollExpected = useMemo(() => {
    let cost = 0;
    for (const r of byClient.values()) cost += r.totalCost;
    return cost;
  }, [byClient]);

  const payrollPaid = useMemo(
    () => (payrollPayments as any[]).reduce((s, p) => s + Number(p.amount || 0), 0),
    [payrollPayments],
  );

  // ---- Manual items active in the selected month ----
  const monthItems = useMemo(() => {
    const rows: {
      id: string;
      installmentId?: string;
      direction: "income" | "expense";
      name: string;
      category: string | null;
      amount: number;
      kind: string;
      isPaid: boolean;
      paidAmount: number | null;
      notes: string | null;
    }[] = [];

    for (const it of items as any[]) {
      if (it.is_active === false) continue;
      const multi = Number(it.installments_count || 1) > 1;
      const itemInst = (installments as any[]).filter((i) => i.item_id === it.id);
      const monthInst = itemInst.find((i) => i.due_month === month);

      if (it.recurrence === "monthly") {
        const startsOk = !it.start_month || it.start_month <= month;
        const endsOk = !it.end_month || it.end_month >= month;
        if (startsOk && endsOk) {
          rows.push({
            id: it.id,
            installmentId: monthInst?.id,
            direction: it.direction,
            name: it.name,
            category: it.category,
            amount: Number(it.amount || 0),
            kind: it.direction === "income" ? "הכנסה קבועה" : "הוצאה קבועה",
            isPaid: !!monthInst?.is_paid,
            paidAmount: monthInst?.paid_amount != null ? Number(monthInst.paid_amount) : null,
            notes: it.notes,
          });
        }
        continue;
      }

      if (multi && itemInst.length > 0) {
        const sorted = [...itemInst].sort((a, b) => (a.due_month < b.due_month ? -1 : 1));
        for (const inst of sorted.filter((i) => i.due_month === month)) {
          const idx = sorted.findIndex((i) => i.id === inst.id) + 1;
          rows.push({
            id: it.id,
            installmentId: inst.id,
            direction: it.direction,
            name: `${it.name} (תשלום ${idx}/${sorted.length})`,
            category: it.category,
            amount: Number(inst.amount || 0),
            kind: it.direction === "income" ? "הכנסה בתשלומים" : "הוצאה בתשלומים",
            isPaid: !!inst.is_paid,
            paidAmount: inst.paid_amount != null ? Number(inst.paid_amount) : null,
            notes: inst.notes || it.notes,
          });
        }
        continue;
      }

      if (it.due_month === month) {
        rows.push({
          id: it.id,
          installmentId: monthInst?.id,
          direction: it.direction,
          name: it.name,
          category: it.category,
          amount: Number(it.amount || 0),
          kind: it.direction === "income" ? "הכנסה חד פעמית" : "הוצאה חד פעמית",
          isPaid: !!monthInst?.is_paid,
          paidAmount: monthInst?.paid_amount != null ? Number(monthInst.paid_amount) : null,
          notes: it.notes,
        });
      }
    }
    return rows;
  }, [items, installments, month]);

  // Actual settled amount wins over the planned amount
  const effective = (r: { isPaid: boolean; paidAmount: number | null; amount: number }) =>
    r.isPaid && r.paidAmount != null ? r.paidAmount : r.amount;

  const otherIncome = monthItems.filter((r) => r.direction === "income").reduce((s, r) => s + effective(r), 0);
  const otherExpenses = monthItems.filter((r) => r.direction === "expense").reduce((s, r) => s + effective(r), 0);

  const totalIn = clientIncome.totalDue + otherIncome;
  const totalOut = payrollExpected + vatPayable + otherExpenses;
  const net = totalIn - totalOut;
  const ratio = totalOut > 0 ? totalIn / totalOut : 0;

  const health = net >= 0 && ratio >= 1.15
    ? { label: "תזרים בריא", variant: "success" as const, icon: CheckCircle2 }
    : net >= 0
      ? { label: "תזרים גבולי", variant: "warning" as const, icon: AlertTriangle }
      : { label: "קושי בתזרים", variant: "destructive" as const, icon: AlertTriangle };

  // ---- Next 6 months forecast (manual items + steady client/payroll baseline) ----
  const forecast = useMemo(() => {
    return Array.from({ length: 6 }, (_, k) => {
      const m = format(startOfMonth(addMonths(new Date(month), k)), "yyyy-MM-dd");
      let inc = 0, exp = 0;
      for (const it of items as any[]) {
        if (it.is_active === false) continue;
        let amount = 0;
        if (it.recurrence === "monthly") {
          const startsOk = !it.start_month || it.start_month <= m;
          const endsOk = !it.end_month || it.end_month >= m;
          if (startsOk && endsOk) amount = Number(it.amount || 0);
        } else {
          const itemInst = (installments as any[]).filter((i) => i.item_id === it.id);
          if (itemInst.length > 0) {
            amount = itemInst.filter((i) => i.due_month === m).reduce((s, i) => s + Number(i.amount || 0), 0);
          } else if (it.due_month === m) {
            amount = Number(it.amount || 0);
          }
        }
        if (!amount) continue;
        if (it.direction === "income") inc += amount;
        else exp += amount;
      }
      const baseIn = k === 0 ? clientIncome.totalDue : 0;
      const baseOut = k === 0 ? payrollExpected + vatPayable : k === 1 ? clientIncome.vat : 0;
      return {
        month: m,
        label: format(new Date(m), "MMM yyyy"),
        income: inc + baseIn,
        expense: exp + baseOut,
        net: inc + baseIn - exp - baseOut,
      };
    });
  }, [items, installments, month, clientIncome, vatPayable, payrollExpected]);

  const save = async () => {
    const amount = Number(draft.amount);
    if (!draft.name.trim()) return toast.error("יש להזין שם");
    if (!amount || amount <= 0) return toast.error("יש להזין סכום");
    const count = Math.max(1, Math.floor(Number(draft.installments) || 1));

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("cash_flow_items" as any)
        .insert({
          direction: draft.direction,
          name: draft.name.trim(),
          category: draft.category.trim() || null,
          amount,
          recurrence: draft.recurrence,
          start_month: draft.recurrence === "monthly" ? draft.month : null,
          end_month: draft.recurrence === "monthly" && draft.endMonth ? draft.endMonth : null,
          due_month: draft.recurrence === "one_time" ? draft.month : null,
          installments_count: draft.recurrence === "one_time" ? count : 1,
          notes: draft.notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (draft.recurrence === "one_time" && count > 1) {
        const per = Math.round((amount / count) * 100) / 100;
        const rows = Array.from({ length: count }, (_, i) => ({
          item_id: (data as any).id,
          due_month: format(startOfMonth(addMonths(new Date(draft.month), i)), "yyyy-MM-dd"),
          amount: i === count - 1 ? Math.round((amount - per * (count - 1)) * 100) / 100 : per,
        }));
        const { error: instErr } = await supabase.from("cash_flow_installments" as any).insert(rows);
        if (instErr) throw instErr;
      }

      toast.success("נוסף בהצלחה");
      setOpen(false);
      setDraft(emptyDraft(month));
      qc.invalidateQueries({ queryKey: ["cashflow-items"] });
      qc.invalidateQueries({ queryKey: ["cashflow-installments"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("cash_flow_items" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("נמחק");
    qc.invalidateQueries({ queryKey: ["cashflow-items"] });
    qc.invalidateQueries({ queryKey: ["cashflow-installments"] });
  };

  // Mark a row as actually settled (came in / went out) with the real amount
  const settle = async (
    row: { id: string; installmentId?: string; amount: number; paidAmount: number | null },
    isPaid: boolean,
    actual?: number | null,
  ) => {
    const paidAmount = isPaid ? (actual ?? row.paidAmount ?? row.amount) : null;
    const payload = {
      is_paid: isPaid,
      paid_amount: paidAmount,
      paid_date: isPaid ? format(new Date(), "yyyy-MM-dd") : null,
    };
    const { error } = row.installmentId
      ? await supabase.from("cash_flow_installments" as any).update(payload).eq("id", row.installmentId)
      : await supabase.from("cash_flow_installments" as any).insert({
          item_id: row.id,
          due_month: month,
          amount: row.amount,
          ...payload,
        });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["cashflow-installments"] });
  };


  return (
    <div className="flex flex-col">
      <AppHeader title="תזרים מזומנים" subtitle="Monthly cash flow — expected in vs out" />
      <div className="flex-1 space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={(v) => { setMonth(v); setDraft((d) => ({ ...d, month: v })); }}>
            <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => { setDraft(emptyDraft(month)); setOpen(true); }}>
            <Plus className="h-4 w-4 me-1" /> הוסף הכנסה / הוצאה
          </Button>
          <Badge
            variant="outline"
            className={
              health.variant === "success" ? "text-success border-success/40"
                : health.variant === "warning" ? "text-warning border-warning/40"
                  : "text-destructive border-destructive/40"
            }
          >
            <health.icon className="h-3.5 w-3.5 me-1" /> {health.label}
          </Badge>
          {loadingProfit && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="צפוי להיכנס" value={fmt(totalIn)} subtitle={`מלקוחות ${fmt(clientIncome.totalDue)} · אחר ${fmt(otherIncome)}`} icon={TrendingUp} variant="success" />
          <KpiCard title="צפוי לצאת" value={fmt(totalOut)} subtitle={`משכורות ${fmt(payrollExpected)} · מע״מ ${fmt(vatPayable)} · אחר ${fmt(otherExpenses)}`} icon={TrendingDown} variant="destructive" />
          <KpiCard title="תזרים נטו" value={fmt(net)} subtitle={`יחס כיסוי ${ratio ? ratio.toFixed(2) : "—"}`} icon={Wallet} variant={net >= 0 ? "success" : "destructive"} />
          <KpiCard title="נותר לגבייה" value={fmt(clientIncome.outstanding)} subtitle={`נגבה ${fmt(clientIncome.collected)}`} icon={Receipt} variant="warning" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-sm">פירוט צפי לחודש</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableBody>
                  <TableRow><TableCell>הכנסות מלקוחות (לפני מע״מ)</TableCell><TableCell className="text-end tabular-nums">{fmt(clientIncome.net)}</TableCell></TableRow>
                  <TableRow><TableCell>מע״מ שייגבה מהלקוחות</TableCell><TableCell className="text-end tabular-nums">{fmt(clientIncome.vat)}</TableCell></TableRow>
                  <TableRow><TableCell>ניכוי מס במקור</TableCell><TableCell className="text-end tabular-nums text-destructive">-{fmt(clientIncome.withholding)}</TableCell></TableRow>
                  <TableRow><TableCell>הכנסות נוספות</TableCell><TableCell className="text-end tabular-nums">{fmt(otherIncome)}</TableCell></TableRow>
                  <TableRow className="font-medium bg-muted/40"><TableCell>סך כל הכנסות צפויות</TableCell><TableCell className="text-end tabular-nums">{fmt(totalIn)}</TableCell></TableRow>
                  <TableRow><TableCell>משכורות ועלויות עובדים</TableCell><TableCell className="text-end tabular-nums text-destructive">{fmt(payrollExpected)}</TableCell></TableRow>
                  <TableRow><TableCell>מע״מ להעברה לרשויות <span className="text-xs text-muted-foreground">(של {format(new Date(prevMonth), "MMMM yyyy")})</span></TableCell><TableCell className="text-end tabular-nums text-destructive">{fmt(vatPayable)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground text-xs">מע״מ של החודש הזה — ישולם בחודש הבא</TableCell><TableCell className="text-end tabular-nums text-xs text-muted-foreground">{fmt(clientIncome.vat)}</TableCell></TableRow>
                  <TableRow><TableCell>הוצאות נוספות</TableCell><TableCell className="text-end tabular-nums text-destructive">{fmt(otherExpenses)}</TableCell></TableRow>
                  <TableRow className="font-medium bg-muted/40"><TableCell>סך כל הוצאות צפויות</TableCell><TableCell className="text-end tabular-nums">{fmt(totalOut)}</TableCell></TableRow>
                  <TableRow className="font-semibold"><TableCell>תזרים נטו</TableCell><TableCell className={`text-end tabular-nums ${net >= 0 ? "text-success" : "text-destructive"}`}>{fmt(net)}</TableCell></TableRow>
                  <TableRow><TableCell className="text-muted-foreground text-xs">שולם בפועל למשכורות</TableCell><TableCell className="text-end tabular-nums text-xs text-muted-foreground">{fmt(payrollPaid)}</TableCell></TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CalendarClock className="h-4 w-4" /> תחזית 6 חודשים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>חודש</TableHead>
                    <TableHead className="text-end">נכנס</TableHead>
                    <TableHead className="text-end">יוצא</TableHead>
                    <TableHead className="text-end">נטו</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecast.map((f) => (
                    <TableRow key={f.month}>
                      <TableCell>{f.label}</TableCell>
                      <TableCell className="text-end tabular-nums">{fmt(f.income)}</TableCell>
                      <TableCell className="text-end tabular-nums">{fmt(f.expense)}</TableCell>
                      <TableCell className={`text-end tabular-nums font-medium ${f.net >= 0 ? "text-success" : "text-destructive"}`}>{fmt(f.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="p-3 text-xs text-muted-foreground">
                התחזית לחודשים הבאים מבוססת על ההכנסות וההוצאות הקבועות והתשלומים שנפרסו.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-sm">הכנסות והוצאות שהוגדרו לחודש זה</CardTitle></CardHeader>
          <CardContent className="p-0">
            {monthItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                לא הוגדרו הכנסות או הוצאות לחודש זה
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>שם</TableHead>
                    <TableHead>סוג</TableHead>
                    <TableHead>קטגוריה</TableHead>
                    <TableHead className="text-end">סכום מתוכנן</TableHead>
                    <TableHead>בוצע</TableHead>
                    <TableHead className="text-end">סכום בפועל</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthItems.map((r) => (
                    <TableRow key={r.installmentId || r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={r.direction === "income" ? "text-success border-success/40" : "text-destructive border-destructive/40"}>
                          {r.kind}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.category || "—"}</TableCell>
                      <TableCell className={`text-end tabular-nums ${r.direction === "income" ? "text-success" : "text-destructive"}`}>{fmt(r.amount)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={r.isPaid} onCheckedChange={(v) => settle(r, !!v)} />
                          <span className="text-xs text-muted-foreground">
                            {r.isPaid ? (r.direction === "income" ? "נכנס" : "יצא") : "ממתין"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-end">
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 w-28 text-end tabular-nums ms-auto"
                          placeholder={String(r.amount)}
                          defaultValue={r.paidAmount ?? ""}
                          key={`${r.installmentId || r.id}-${r.paidAmount ?? "empty"}`}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            const num = v === "" ? null : Number(v);
                            if (num === (r.paidAmount ?? null)) return;
                            settle(r, true, num);
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>הוספת הכנסה / הוצאה</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>סוג</Label>
                <Select value={draft.direction} onValueChange={(v: any) => setDraft({ ...draft, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">הוצאה</SelectItem>
                    <SelectItem value="income">הכנסה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>אופי</Label>
                <Select value={draft.recurrence} onValueChange={(v: any) => setDraft({ ...draft, recurrence: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">חד פעמי</SelectItem>
                    <SelectItem value="monthly">קבוע חודשי</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>שם</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>קטגוריה</Label>
                <Input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>סכום (₪)</Label>
                <Input type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{draft.recurrence === "monthly" ? "מחודש" : "חודש התשלום הראשון"}</Label>
                <Select value={draft.month} onValueChange={(v) => setDraft({ ...draft, month: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {draft.recurrence === "monthly" ? (
                <div className="space-y-1.5">
                  <Label>עד חודש (אופציונלי)</Label>
                  <Select value={draft.endMonth || "none"} onValueChange={(v) => setDraft({ ...draft, endMonth: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ללא הגבלה</SelectItem>
                      {monthOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>מספר תשלומים</Label>
                  <Input type="number" min={1} value={draft.installments} onChange={(e) => setDraft({ ...draft, installments: e.target.value })} />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>הערות</Label>
              <Textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 me-1 animate-spin" />} שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CashFlow;
