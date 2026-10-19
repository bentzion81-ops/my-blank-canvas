import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ClientProfitRow = {
  clientId: string;
  hours: number;
  revenue: number;
  employeeCost: number;
  overheadCost: number;
  totalCost: number;
  profit: number;
  margin: number;
};

/**
 * Shared per-client hours / revenue / cost / profit computation for a month.
 * Mirrors the logic used on the Profitability page.
 */
export function useClientProfitability(fromStr: string, toStr: string) {
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
        .select("employee_id, client_id, employee_hourly_wage, end_date, is_primary, start_date");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: workLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["profit-logs", fromStr, toStr],
    queryFn: async () => {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("work_logs_unified" as any)
          .select("client_id, employee_id, hours_worked, payment_amount, status")
          .gte("work_date", fromStr)
          .lte("work_date", toStr)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const chunk = (data as any[]) || [];
        all.push(...chunk);
        if (chunk.length < pageSize) break;
        from += pageSize;
      }
      return all;
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

  const rows = useMemo<ClientProfitRow[]>(() => {
    const rateMap = new Map<string, number>();
    for (const a of assignments as any[]) {
      if (a.employee_hourly_wage != null) {
        rateMap.set(`${a.employee_id}|${a.client_id}`, Number(a.employee_hourly_wage));
      }
    }

    const employeeFallbackRate = new Map<string, number>();
    const sortedRates = [...(assignments as any[])]
      .filter((a) => a.employee_hourly_wage != null)
      .sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return (b.start_date || "").localeCompare(a.start_date || "");
      });
    for (const a of sortedRates) {
      if (!employeeFallbackRate.has(a.employee_id)) {
        employeeFallbackRate.set(a.employee_id, Number(a.employee_hourly_wage));
      }
    }

    const empMap = new Map<string, any>();
    for (const e of employees as any[]) empMap.set(e.id, e);

    const employeeAssignedClient = new Map<string, string>();
    const sortedAssign = [...(assignments as any[])].sort((a, b) => {
      const ae = a.end_date ? 1 : 0;
      const be = b.end_date ? 1 : 0;
      if (ae !== be) return ae - be;
      return (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0);
    });
    for (const a of sortedAssign) {
      if (a.employee_id && a.client_id && !employeeAssignedClient.has(a.employee_id)) {
        employeeAssignedClient.set(a.employee_id, a.client_id);
      }
    }

    const approved = workLogs.filter((l: any) => l.status === "approved");
    const resolvedLogs = approved.map((l: any) => ({
      ...l,
      client_id: l.client_id || (l.employee_id ? employeeAssignedClient.get(l.employee_id) : null),
    }));

    const empTotalHours = new Map<string, number>();
    for (const l of resolvedLogs) {
      if (!l.employee_id) continue;
      empTotalHours.set(l.employee_id, (empTotalHours.get(l.employee_id) || 0) + Number(l.hours_worked || 0));
    }

    return (clients as any[]).map((c) => {
      const cLogs = resolvedLogs.filter((l: any) => l.client_id === c.id);
      const hours = cLogs.reduce((s: number, l: any) => s + Number(l.hours_worked || 0), 0);

      let employeeCost = 0;
      let overheadCost = 0;
      const empHoursAtClient = new Map<string, number>();

      for (const l of cLogs) {
        const h = Number(l.hours_worked || 0);
        const emp = l.employee_id ? empMap.get(l.employee_id) : null;
        const reportedPay = Number(l.payment_amount || 0);
        const directRate = l.employee_id && l.client_id ? rateMap.get(`${l.employee_id}|${l.client_id}`) : undefined;
        const fallbackRate = l.employee_id ? employeeFallbackRate.get(l.employee_id) : undefined;
        const overrideRate = directRate ?? fallbackRate;
        if (overrideRate != null) employeeCost += h * overrideRate;
        else if (reportedPay > 0) employeeCost += reportedPay;
        else employeeCost += h * Number(emp?.hourly_wage || 0);
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
        overheadCost +=
          (Number(emp.transportation || 0) +
            Number(emp.medical_insurance || 0) +
            Number(emp.food || 0) +
            Number(emp.other_expenses || 0)) * ratio;
      }

      const cCharges = (charges as any[]).filter((ch) => ch.client_id === c.id);
      const additionalRevenue = cCharges.reduce(
        (s, ch) => s + (Number(ch.total_charge) || Number(ch.quantity) * Number(ch.unit_charge) || 0),
        0,
      );
      const additionalCost = cCharges.reduce(
        (s, ch) => s + (Number(ch.total_cost) || Number(ch.quantity) * Number(ch.unit_cost) || 0),
        0,
      );

      const rate = Number(c.hourly_rate || 0);
      const baseRevenue = rate > 0 ? hours * rate : Number(c.monthly_payment || 0);
      const revenue = baseRevenue + additionalRevenue;
      const totalCost = employeeCost + overheadCost + additionalCost;
      const profit = revenue - totalCost;

      return {
        clientId: c.id,
        hours,
        revenue,
        employeeCost,
        overheadCost: overheadCost + additionalCost,
        totalCost,
        profit,
        margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      };
    });
  }, [clients, employees, assignments, workLogs, charges]);

  const byClient = useMemo(() => {
    const m = new Map<string, ClientProfitRow>();
    for (const r of rows) m.set(r.clientId, r);
    return m;
  }, [rows]);

  return { clients: clients as any[], rows, byClient, isLoading: loadingClients || loadingLogs };
}
