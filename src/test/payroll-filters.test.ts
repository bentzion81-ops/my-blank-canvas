import { describe, expect, it } from "vitest";
import { matchesPayrollPaymentFilter } from "@/lib/payroll-filters";

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
});