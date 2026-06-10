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
import { Clock, Wallet, DollarSign, TrendingDown, Plus, Loader2, ChevronDown, ChevronRight, Search, Trash2, Printer } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`;

const Payroll = () => {
  const [month, setMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [payOpen, setPayOpen] = useState<null | { employeeId: string; employeeName: string; balance: number }>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"site" | "name">("site");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) => setExpanded((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelect = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
        .select("id, first_name, last_name, passport_number, israeli_phone, foreign_phone, hourly_wage, transportation, medical_insurance, food, other_expenses, rent_deduction, loan_deduction, equipment_deduction, other_deductions, status, employee_client_assignments(is_primary, end_date, client_id, clients(name))")
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

  // External workers from replacement reports who don't have a matching employee record
  const { data: extReports = [] } = useQuery({
    queryKey: ["payroll-ext-reports", fromStr, toStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("replacement_reports")
        .select("worker_id, worker_name, passport_number, work_date, total_hours, total_payment, hourly_wage, assigned_client_id, assigned_custom_workplace, status, clients:assigned_client_id(name)")
        .gte("work_date", fromStr)
        .lte("work_date", toStr)
        .eq("status", "approved");
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
    queryKey: ["payroll-payments", fromStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_payments")
        .select("id, amount, payment_date, notes, payroll_item_id, payroll_items!inner(employee_id, payroll_runs!inner(month))")
        .eq("payroll_items.payroll_runs.month", fromStr)
        .order("payment_date", { ascending: false });
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

  const getClientName = (e: any): string => {
    const assignments = e.employee_client_assignments ?? [];
    const active = assignments.filter((a: any) => a.clients && !a.end_date);
    const primary = active.find((a: any) => a.is_primary) ?? active[0] ?? assignments.find((a: any) => a.clients);
    return primary?.clients?.name ?? "";
  };

  // Build synthetic employees + logs for external workers (link reports) not in employees
  const { extEmployees, extLogs } = useMemo(() => {
    const passportToEmp = new Map<string, any>();
    for (const e of employees as any[]) {
      if (e.passport_number) passportToEmp.set(String(e.passport_number).trim(), e);
    }
    const synth = new Map<string, any>();
    const synthLogs: any[] = [];
    for (const r of extReports as any[]) {
      const passport = String(r.passport_number || "").trim();
      if (passport && passportToEmp.has(passport)) continue; // already covered
      const key = r.worker_id || passport || r.worker_name;
      if (!synth.has(key)) {
        const parts = String(r.worker_name || "").trim().split(/\s+/);
        synth.set(key, {
          id: r.worker_id || `ext-${key}`,
          first_name: parts[0] || r.worker_name || "External",
          last_name: parts.slice(1).join(" "),
          passport_number: r.passport_number,
          israeli_phone: null,
          foreign_phone: null,
          hourly_wage: Number(r.hourly_wage || 0),
          transportation: 0, medical_insurance: 0, food: 0, other_expenses: 0,
          rent_deduction: 0, loan_deduction: 0, equipment_deduction: 0, other_deductions: 0,
          status: "active",
          employee_client_assignments: [],
          __external: true,
        });
      }
      const emp = synth.get(key);
      synthLogs.push({
        employee_id: emp.id,
        client_id: r.assigned_client_id,
        client_name: r.clients?.name || null,
        custom_workplace: r.assigned_custom_workplace,
        source: "worker_form",
        hours_worked: Number(r.total_hours || 0),
        payment_amount: Number(r.total_payment || 0),
        status: "approved",
        work_date: r.work_date,
      });
    }
    return { extEmployees: Array.from(synth.values()), extLogs: synthLogs };
  }, [employees, extReports]);

  const rows = useMemo(() => {
    const allEmployees = [...employees, ...extEmployees];
    const allLogs = [...logs, ...extLogs];

    const computed = allEmployees.map((emp: any) => {
      const empLogs = allLogs.filter(
        (l: any) => l.employee_id === emp.id && l.status === "approved"
      );
      const sites = new Map<string, { key: string; name: string; clientId: string | null; hours: number; gross: number; sources: Set<string> }>();
      let totalHours = 0;
      let grossFromLogs = 0;
      for (const l of empLogs) {
        const key = l.client_id || l.custom_workplace || "unassigned";
        const name = l.client_name || l.custom_workplace || "Unassigned";
        const h = Number(l.hours_worked) || 0;
        const pay = Number(l.payment_amount) || 0;
        totalHours += h;
        const directRate = l.client_id ? rateMap.get(`${emp.id}|${l.client_id}`) : undefined;
        const fallbackRate = employeeFallbackRate.get(emp.id);
        const overrideRate = directRate ?? fallbackRate;
        const lineGross = overrideRate != null
          ? h * overrideRate
          : (pay > 0 ? pay : h * Number(emp.hourly_wage || 0));
        grossFromLogs += lineGross;
        const cur = sites.get(key) || { key, name, clientId: l.client_id || null, hours: 0, gross: 0, sources: new Set() };
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
      const empPayments = payments.filter((p: any) => p.payroll_items?.employee_id === emp.id);
      const paid = empPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const balance = totalDue - paid;

      const sitesArr = Array.from(sites.values());
      const primarySite = sitesArr.length
        ? [...sitesArr].sort((a, b) => b.hours - a.hours)[0]
        : null;
      const fallbackName = getClientName(emp);

      return {
        emp,
        sites: sitesArr,
        primarySiteKey: primarySite?.key ?? `noop-${emp.id}`,
        primarySiteName: primarySite?.name ?? (fallbackName || "Unassigned"),
        totalHours,
        grossFromLogs,
        expenses,
        deductions,
        totalDue,
        paid,
        balance,
        items: empItems,
        payments: empPayments,
      };
    });

    type SiteRow = {
      emp: any;
      siteKey: string;
      siteName: string;
      hoursAtSite: number;
      grossAtSite: number;
      isPrimary: boolean;
      base: typeof computed[number];
    };
    const siteRows: SiteRow[] = [];
    for (const r of computed) {
      if (r.sites.length === 0) {
        siteRows.push({
          emp: r.emp,
          siteKey: r.primarySiteKey,
          siteName: r.primarySiteName,
          hoursAtSite: 0,
          grossAtSite: 0,
          isPrimary: true,
          base: r,
        });
        continue;
      }
      for (const s of r.sites) {
        siteRows.push({
          emp: r.emp,
          siteKey: s.key,
          siteName: s.name,
          hoursAtSite: s.hours,
          grossAtSite: s.gross,
          isPrimary: s.key === r.primarySiteKey,
          base: r,
        });
      }
    }

    const q = search.toLowerCase();
    return siteRows
      .filter((r) =>
        `${r.emp.first_name} ${r.emp.last_name} ${r.emp.passport_number || ""} ${r.emp.israeli_phone || ""} ${r.siteName}`
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => {
        const aInactive = a.emp.status === "inactive" ? 1 : 0;
        const bInactive = b.emp.status === "inactive" ? 1 : 0;
        if (aInactive !== bInactive) return aInactive - bInactive;
        if (sortBy === "name") {
          const na = `${a.emp.first_name} ${a.emp.last_name}`.localeCompare(`${b.emp.first_name} ${b.emp.last_name}`);
          if (na !== 0) return na;
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          return (a.siteName || "").localeCompare(b.siteName || "");
        }
        const ca = a.siteName || "\uffff";
        const cb = b.siteName || "\uffff";
        if (ca !== cb) return ca.localeCompare(cb);
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return `${a.emp.first_name} ${a.emp.last_name}`.localeCompare(`${b.emp.first_name} ${b.emp.last_name}`);
      });
  }, [employees, extEmployees, logs, extLogs, payments, rateMap, employeeFallbackRate, additionalItems, search, sortBy]);

  const totals = useMemo(() => ({
    hours: rows.reduce((s, r) => s + r.hoursAtSite, 0),
    gross: rows.reduce((s, r) => s + r.grossAtSite, 0),
    deductions: rows.reduce((s, r) => s + (r.isPrimary ? r.base.deductions : 0), 0),
    paid: rows.reduce((s, r) => s + (r.isPrimary ? r.base.paid : 0), 0),
    balance: rows.reduce((s, r) => s + (r.isPrimary ? r.base.balance : 0), 0),
  }), [rows]);

  async function recordPayment() {
    if (!payOpen) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return toast.error("Enter a valid amount");

    // Ensure we have a fresh user session before calling the protected RPC
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      return toast.error("Session expired — please sign in again");
    }

    const { error } = await supabase.rpc("record_payroll_payment" as any, {
      _month: month,
      _employee_id: payOpen.employeeId,
      _amount: amount,
      _notes: payNotes || null,
    });
    if (error) return toast.error(error.message);

    toast.success("Payment recorded");
    setPayOpen(null);
    setPayAmount("");
    setPayNotes("");
    refetchPayments();
  }

  async function deletePayment(paymentId: string) {
    if (!confirm("Delete this payment? This cannot be undone.")) return;
    const { error } = await supabase.from("payroll_payments").delete().eq("id", paymentId);
    if (error) return toast.error(error.message);
    toast.success("Payment removed");
    refetchPayments();
  }

  const primaryRows = useMemo(() => rows.filter((r) => r.isPrimary), [rows]);
  const allSelected = primaryRows.length > 0 && primaryRows.every((r) => selected.has(r.emp.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(primaryRows.map((r) => r.emp.id)));
  };
  const selectedTotals = useMemo(() => {
    const chosen = primaryRows.filter((r) => selected.has(r.emp.id));
    return {
      count: chosen.length,
      balance: chosen.reduce((s, r) => s + r.base.balance, 0),
      totalDue: chosen.reduce((s, r) => s + r.base.totalDue, 0),
      paid: chosen.reduce((s, r) => s + r.base.paid, 0),
    };
  }, [primaryRows, selected]);

  function handlePrint() {
    const chosen = primaryRows.filter((r) => selected.has(r.emp.id));
    if (chosen.length === 0) return toast.error("Select at least one employee");
    const monthLabel = format(new Date(month), "MMMM yyyy");
    const totalBalance = chosen.reduce((s, r) => s + r.base.balance, 0);
    const totalDueAll = chosen.reduce((s, r) => s + r.base.totalDue, 0);
    const totalPaidAll = chosen.reduce((s, r) => s + r.base.paid, 0);
    const rowsHtml = chosen.map((r) => {
      const b = r.base;
      const sitesHtml = b.sites.length === 0
        ? `<tr><td colspan="4" style="text-align:center;color:#888">No work logs</td></tr>`
        : b.sites.map((s) => {
            const rate = s.hours > 0 ? s.gross / s.hours : 0;
            return `<tr><td>${s.name}</td><td style="text-align:right">${s.hours.toFixed(1)}</td><td style="text-align:right">${fmt(rate)}</td><td style="text-align:right">${fmt(s.gross)}</td></tr>`;
          }).join("");
      return `
        <div class="emp">
          <div class="emp-head">
            <div><strong>${r.emp.first_name || ""} ${r.emp.last_name || ""}</strong></div>
            <div class="muted">Passport: ${r.emp.passport_number || "—"}</div>
          </div>
          <table class="sites">
            <thead><tr><th>Workplace</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate/hr</th><th style="text-align:right">Subtotal</th></tr></thead>
            <tbody>${sitesHtml}</tbody>
          </table>
          <table class="summary">
            <tr><td>Gross</td><td style="text-align:right">${fmt(b.grossFromLogs)}</td>
                <td>Expenses (+)</td><td style="text-align:right">+${fmt(b.expenses)}</td></tr>
            <tr><td>Deductions (-)</td><td style="text-align:right">-${fmt(b.deductions)}</td>
                <td><strong>Total Due</strong></td><td style="text-align:right"><strong>${fmt(b.totalDue)}</strong></td></tr>
            <tr><td>Paid</td><td style="text-align:right">${fmt(b.paid)}</td>
                <td><strong>Balance</strong></td><td style="text-align:right"><strong>${fmt(b.balance)}</strong></td></tr>
          </table>
        </div>`;
    }).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payroll — ${monthLabel}</title>
      <style>
        body { font-family: -apple-system, Arial, sans-serif; padding: 24px; color:#111; }
        h1 { font-size: 20px; margin: 0 0 16px; }
        .emp { border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-bottom: 14px; page-break-inside: avoid; }
        .emp-head { display:flex; justify-content:space-between; margin-bottom: 8px; }
        .muted { color:#666; font-size: 12px; }
        table { width:100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
        th, td { border-bottom: 1px solid #eee; padding: 4px 6px; }
        th { background:#f5f5f5; text-align:left; }
        .summary td { border:none; padding: 3px 6px; }
        @media print { .no-print { display:none } }
      </style></head><body>
      <h1>Payroll — ${monthLabel}</h1>
      ${rowsHtml}
      <script>window.onload = () => { window.print(); };</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return toast.error("Popup blocked");
    w.document.open();
    w.document.write(html);
    w.document.close();
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
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, passport..."
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "site" | "name")}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="site">Sort by site</SelectItem>
              <SelectItem value="name">Sort by name</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handlePrint} className="h-9">
            <Printer className="h-4 w-4 mr-1" /> Print selected ({selected.size})
          </Button>
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
                  <TableHead className="w-8">
                    <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>ID / Passport</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Total Due / Site Gross</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No payroll data for this month</TableCell></TableRow>
                ) : (() => {
                  let lastGroup: string | null = null;
                  const out: JSX.Element[] = [];
                  rows.forEach((r) => {
                    const isInactive = r.emp.status === "inactive";
                    const groupLabel = isInactive ? "Inactive" : (r.siteName || "Unassigned");
                    if (sortBy === "site" && groupLabel !== lastGroup) {
                      out.push(
                        <TableRow key={`grp-${groupLabel}`} className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={9} className="py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {groupLabel}
                          </TableCell>
                        </TableRow>
                      );
                      lastGroup = groupLabel;
                    }
                    out.push(((r) => {
                  const rowKey = `${r.emp.id}|${r.siteKey}`;
                  const isOpen = expanded.has(rowKey);
                  const base = r.base;
                  return (
                    <Fragment key={rowKey}>
                      <TableRow key={rowKey} className="cursor-pointer" onClick={() => toggleRow(rowKey)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {r.isPrimary && !r.emp.__external && (
                            <Checkbox
                              checked={selected.has(r.emp.id)}
                              onCheckedChange={() => toggleSelect(r.emp.id)}
                              aria-label="Select employee"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.emp.first_name} {r.emp.last_name}
                          {!r.isPrimary && <span className="ml-2 text-[10px] text-muted-foreground">(also at {base.primarySiteName})</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{r.emp.passport_number || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.hoursAtSite.toFixed(1)}h</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {r.isPrimary ? fmt(base.totalDue) : <span className="text-muted-foreground">{fmt(r.grossAtSite)}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.isPrimary ? fmt(base.paid) : <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {r.isPrimary ? (
                            <span className={base.balance > 0 ? "text-destructive" : "text-success"}>{fmt(base.balance)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {r.isPrimary && (
                            r.emp.__external ? (
                              <Badge variant="outline" className="text-[10px]">External — add to Employees to pay</Badge>
                            ) : (
                              <Button size="sm" variant="outline" onClick={() => { setPayOpen({ employeeId: r.emp.id, employeeName: `${r.emp.first_name} ${r.emp.last_name}`, balance: base.balance }); setPayAmount(String(Math.max(0, Math.round(base.balance)))); }}>
                                <Plus className="h-3 w-3 mr-1" /> Pay
                              </Button>
                            )
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={rowKey + "-detail"} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell colSpan={7} className="py-3">
                            <div className="space-y-2">
                              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Work sites breakdown (full month)</div>
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
                                  {base.sites.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-xs">No work logs</TableCell></TableRow>
                                  ) : base.sites.map((s, i) => {
                                    const rate = s.hours > 0 ? s.gross / s.hours : 0;
                                    return (
                                      <TableRow key={i}>
                                        <TableCell className="font-medium">{s.name}</TableCell>
                                        <TableCell>
                                          <div className="flex gap-1 flex-wrap">
                                            {Array.from(s.sources).map((src) => (
                                              <Badge key={String(src)} variant="outline" className="text-[10px] py-0 h-4">{String(src)}</Badge>
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
                                  <div className="font-semibold tabular-nums">{fmt(base.grossFromLogs)}</div>
                                </div>
                                <div className="rounded-md border p-2">
                                  <div className="text-muted-foreground">Expenses (+)</div>
                                  <div className="font-semibold tabular-nums text-success">+{fmt(base.expenses)}</div>
                                </div>
                                <div className="rounded-md border p-2">
                                  <div className="text-muted-foreground">Deductions (-)</div>
                                  <div className="font-semibold tabular-nums text-warning">-{fmt(base.deductions)}</div>
                                </div>
                                <div className="rounded-md border p-2">
                                  <div className="text-muted-foreground">Total Due</div>
                                  <div className="font-semibold tabular-nums">{fmt(base.totalDue)}</div>
                                </div>
                              </div>
                              {r.isPrimary && (
                                <div className="space-y-1 pt-2">
                                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payments this month</div>
                                  {((base as any).payments || []).length === 0 ? (
                                    <div className="text-xs text-muted-foreground">No payments recorded</div>
                                  ) : (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Date</TableHead>
                                          <TableHead>Notes</TableHead>
                                          <TableHead className="text-right">Amount</TableHead>
                                          <TableHead className="w-10"></TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {((base as any).payments as any[]).map((p) => (
                                          <TableRow key={p.id}>
                                            <TableCell className="tabular-nums">{p.payment_date ? format(new Date(p.payment_date), "dd/MM/yyyy") : "—"}</TableCell>
                                            <TableCell className="text-muted-foreground">{p.notes || "—"}</TableCell>
                                            <TableCell className="text-right tabular-nums font-medium">{fmt(Number(p.amount))}</TableCell>
                                            <TableCell className="text-right">
                                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deletePayment(p.id)} aria-label="Delete payment">
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                    })(r));
                  });
                  return out;
                })()}
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
