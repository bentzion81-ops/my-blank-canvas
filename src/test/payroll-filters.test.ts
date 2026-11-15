import { describe, expect, it } from "vitest";
import { matchesPayrollPaymentFilter, payrollBalanceDue } from "@/lib/payroll-filters";

describe("payroll outstanding balance filter", () => {
  it("includes unpaid and partially paid employees, but excludes settled and overpaid employees", () => {
    const balances = [1000 - 0, 1000 - 400, 1000 - 1000, 1000 - 1200, 0.25];
    expect(balances.filter((balance) => matchesPayrollPaymentFilter(balance, "outstanding")))
      .toEqual([1000, 600, 0.25]);
  });

  it("keeps every balance when showing all employees", () => {
    const balances = [1000, 0, -200];
    expect(balances.filter((balance) => matchesPayrollPaymentFilter(balance, "all")))
      .toEqual(balances);
  });

  it("does not offset outstanding pay with another employee's negative balance", () => {
    const balances = [1000, 600, 0, -200, -2500];
    expect(balances.reduce((sum, balance) => sum + payrollBalanceDue(balance), 0)).toBe(1600);
    expect(payrollBalanceDue(-200)).toBe(0);
  });

  it("keeps balance due identical across both payment filters and counts multi-site employees once", () => {
    const siteRows = [
      { isPrimary: true, balance: 1000 },
      { isPrimary: false, balance: 1000 },
      { isPrimary: true, balance: 600 },
      { isPrimary: true, balance: -200 },
      { isPrimary: true, balance: 0 },
    ];
    const total = (filter: "all" | "outstanding") => siteRows
      .filter((row) => matchesPayrollPaymentFilter(row.balance, filter))
      .reduce((sum, row) => sum + (row.isPrimary ? payrollBalanceDue(row.balance) : 0), 0);
    expect(total("all")).toBe(1600);
    expect(total("outstanding")).toBe(1600);
  });
});