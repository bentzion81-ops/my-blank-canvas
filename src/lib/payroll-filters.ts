export type PayrollPaymentFilter = "all" | "outstanding";

export function matchesPayrollPaymentFilter(balance: number, filter: PayrollPaymentFilter): boolean {
  return filter === "all" || balance > 0;
}