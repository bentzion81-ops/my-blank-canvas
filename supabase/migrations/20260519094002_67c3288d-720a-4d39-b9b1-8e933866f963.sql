ALTER TABLE public.employee_client_assignments
  ADD COLUMN IF NOT EXISTS employee_hourly_wage numeric;

CREATE TABLE IF NOT EXISTS public.employee_additional_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('expense','deduction')),
  name text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  month date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eai_employee ON public.employee_additional_items(employee_id);
CREATE INDEX IF NOT EXISTS idx_eai_month ON public.employee_additional_items(month);

ALTER TABLE public.employee_additional_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read employee_additional_items"
  ON public.employee_additional_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage employee_additional_items insert"
  ON public.employee_additional_items FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_employees'));
CREATE POLICY "Manage employee_additional_items update"
  ON public.employee_additional_items FOR UPDATE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_employees'));
CREATE POLICY "Manage employee_additional_items delete"
  ON public.employee_additional_items FOR DELETE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_employees'));

CREATE TRIGGER trg_eai_updated_at
  BEFORE UPDATE ON public.employee_additional_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();