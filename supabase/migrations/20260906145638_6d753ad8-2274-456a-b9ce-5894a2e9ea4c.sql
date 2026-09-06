CREATE TABLE public.cash_flow_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  direction text NOT NULL CHECK (direction IN ('income','expense')),
  name text NOT NULL,
  category text,
  amount numeric NOT NULL DEFAULT 0,
  recurrence text NOT NULL DEFAULT 'one_time' CHECK (recurrence IN ('monthly','one_time')),
  start_month date,
  end_month date,
  due_month date,
  installments_count integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_flow_items TO authenticated;
GRANT ALL ON public.cash_flow_items TO service_role;
ALTER TABLE public.cash_flow_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read cash_flow_items" ON public.cash_flow_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage cash_flow_items insert" ON public.cash_flow_items FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));
CREATE POLICY "Manage cash_flow_items update" ON public.cash_flow_items FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));
CREATE POLICY "Manage cash_flow_items delete" ON public.cash_flow_items FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));

CREATE TRIGGER trg_cash_flow_items_updated_at BEFORE UPDATE ON public.cash_flow_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.cash_flow_installments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.cash_flow_items(id) ON DELETE CASCADE,
  due_month date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  is_paid boolean NOT NULL DEFAULT false,
  paid_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_flow_installments TO authenticated;
GRANT ALL ON public.cash_flow_installments TO service_role;
ALTER TABLE public.cash_flow_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read cash_flow_installments" ON public.cash_flow_installments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage cash_flow_installments insert" ON public.cash_flow_installments FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));
CREATE POLICY "Manage cash_flow_installments update" ON public.cash_flow_installments FOR UPDATE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));
CREATE POLICY "Manage cash_flow_installments delete" ON public.cash_flow_installments FOR DELETE TO authenticated USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_payroll'));

CREATE TRIGGER trg_cash_flow_installments_updated_at BEFORE UPDATE ON public.cash_flow_installments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cash_flow_items_direction ON public.cash_flow_items(direction);
CREATE INDEX idx_cash_flow_items_due_month ON public.cash_flow_items(due_month);
CREATE INDEX idx_cash_flow_installments_due_month ON public.cash_flow_installments(due_month);
CREATE INDEX idx_cash_flow_installments_item ON public.cash_flow_installments(item_id);