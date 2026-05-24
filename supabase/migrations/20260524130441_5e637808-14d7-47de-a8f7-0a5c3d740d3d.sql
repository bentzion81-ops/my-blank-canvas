
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_notes TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER NOT NULL DEFAULT 30;

CREATE OR REPLACE FUNCTION public.refresh_client_monthly_metrics(_month DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from DATE := date_trunc('month', _month)::date;
  _to   DATE := (date_trunc('month', _month) + INTERVAL '1 month - 1 day')::date;
BEGIN
  INSERT INTO client_monthly_metrics (client_id, month, actual_hours, revenue, employee_cost, profit)
  SELECT
    c.id,
    _from,
    COALESCE(h.hrs, 0),
    CASE c.billing_type
      WHEN 'fixed' THEN COALESCE(c.monthly_payment, 0)
      ELSE COALESCE(h.hrs, 0) * COALESCE(c.hourly_rate, 0)
    END,
    COALESCE(h.cost, 0),
    0
  FROM clients c
  LEFT JOIN (
    SELECT
      ar.client_id,
      SUM(ar.hours_worked) AS hrs,
      SUM(ar.hours_worked * COALESCE(eca.employee_hourly_wage, e.hourly_wage, 0)) AS cost
    FROM attendance_records ar
    LEFT JOIN employees e ON e.id = ar.employee_id
    LEFT JOIN employee_client_assignments eca
      ON eca.employee_id = ar.employee_id AND eca.client_id = ar.client_id AND eca.end_date IS NULL
    WHERE ar.date BETWEEN _from AND _to
    GROUP BY ar.client_id
  ) h ON h.client_id = c.id
  ON CONFLICT (client_id, month) DO UPDATE SET
    actual_hours = EXCLUDED.actual_hours,
    revenue = EXCLUDED.revenue,
    employee_cost = EXCLUDED.employee_cost,
    profit = EXCLUDED.revenue - EXCLUDED.employee_cost,
    updated_at = now();

  UPDATE client_monthly_metrics
  SET profit = revenue - employee_cost
  WHERE month = _from;
END;
$$;

-- Ensure unique constraint exists for ON CONFLICT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_monthly_metrics_client_month_key'
  ) THEN
    ALTER TABLE public.client_monthly_metrics
      ADD CONSTRAINT client_monthly_metrics_client_month_key UNIQUE (client_id, month);
  END IF;
END $$;
