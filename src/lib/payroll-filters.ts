export type PayrollPaymentFilter = "all" | "outstanding";

export function payrollBalanceDue(balance: number): number {
  return Math.max(0, balance);
}

export function matchesPayrollPaymentFilter(balance: number, filter: PayrollPaymentFilter): boolean {
  return filter === "all" || payrollBalanceDue(balance) > 0;
}