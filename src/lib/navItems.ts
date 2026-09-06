export const ALL_NAV_ITEMS = [
  "Dashboard",
  "Attendance",
  "Work Logs",
  "Employees",
  "Clients",
  "Billing",
  "Payroll",
  "Profitability",
  "Cash Flow",
  "Partners",
  "Reports",
  "Documents",
  "Notifications",
  "Replacement Hours",
  "Users",
  "Settings",
] as const;

export type NavItem = (typeof ALL_NAV_ITEMS)[number];
