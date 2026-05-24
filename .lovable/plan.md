## Billing & Profitability System

Build a complete billing and profitability system replacing the current stub `Billing.tsx` with real data, plus a new Profitability page.

### Step 1 — Database migration

Add to `clients` table:
- `billing_notes TEXT`
- `payment_terms_days INTEGER DEFAULT 30`

The `client_additional_charges` table already exists (with `month`, `quantity`, `unit_cost`, `unit_charge`). Will reuse it as-is — no need for the simpler schema in the brief, since the existing one is richer.

Add RPC `refresh_client_monthly_metrics(_month DATE)` that aggregates hours, revenue (fixed vs hourly), and employee_cost into `client_monthly_metrics`.

### Step 2 — ClientForm enhancements

Add a "Billing settings" section with:
- `billing_type` select (hourly/fixed)
- `hourly_rate` (shown when hourly)
- `monthly_payment` (shown when fixed)
- `payment_terms_days` input
- `billing_notes` textarea

(Additional charges already managed via existing `ClientAdditionalCharges` component on ClientProfile.)

### Step 3 — Rebuild Billing.tsx

Real data from Supabase. For each client + selected month:
- Hours from `work_logs_unified` (status approved) or `attendance_records`
- Base revenue: `monthly_payment` if fixed, else `hours × hourly_rate`
- Additional charges sum from `client_additional_charges` for that month
- Total due, paid (from `invoice_payments` joined via `invoices`), balance, status

Features:
- Month picker
- KPI cards (total due, paid, outstanding, clients with debt)
- Table with status badges (green/yellow/red)
- Action buttons: Create Invoice, Record Payment (dialog), View Client
- CSV export
- Refresh metrics button (calls RPC)

### Step 4 — New Profitability.tsx + route

Per-client computation:
- Revenue (same as billing)
- Employee cost: `Σ hours × (assignment_rate ?? employee.hourly_wage)`
- Overhead: prorated employee expenses by share of hours at this client
- Profit = revenue − costs; margin %
- Color-code margin: >30% green, 15–30% yellow, <15% red

UI:
- KPI cards (revenue, cost, profit, avg margin)
- Recharts BarChart: revenue vs cost per client
- Table with all columns from brief
- Month picker, CSV export

Add `/profitability` route in `App.tsx` and "רווחיות" entry in `AppSidebar`.

### Step 5 — ClientProfile billing tab

Add a "Billing" tab showing the client's invoices + payments history.

### Technical notes

- Reuse existing patterns from `Payroll.tsx` for month selection and table layout
- Use `StatusBadge`, `KpiCard` components for consistency
- All currency in ₪, Hebrew labels matching existing UI
- No mock data — purely DB-driven
- RPC uses `SECURITY DEFINER` with explicit search_path

### Order

1. Migration (clients fields + RPC)
2. ClientForm billing section
3. Billing.tsx full rebuild
4. Profitability.tsx + route + sidebar
5. ClientProfile billing tab
6. Polish: refresh button, CSV export