
CREATE TABLE public.client_additional_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  unit_charge NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  total_charge NUMERIC GENERATED ALWAYS AS (quantity * unit_charge) STORED,
  profit NUMERIC GENERATED ALWAYS AS (quantity * (unit_charge - unit_cost)) STORED,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_additional_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read client_additional_charges" ON public.client_additional_charges
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manage client_additional_charges" ON public.client_additional_charges
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_clients'::text));

CREATE POLICY "Update client_additional_charges" ON public.client_additional_charges
  FOR UPDATE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_clients'::text));

CREATE POLICY "Delete client_additional_charges" ON public.client_additional_charges
  FOR DELETE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_clients'::text));
