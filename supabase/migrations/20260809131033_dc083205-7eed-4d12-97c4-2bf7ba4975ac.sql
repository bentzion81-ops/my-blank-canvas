CREATE TABLE public.partners (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  phone text,
  email text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners_select" ON public.partners FOR SELECT TO authenticated USING (true);
CREATE POLICY "partners_insert" ON public.partners FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));
CREATE POLICY "partners_update" ON public.partners FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));
CREATE POLICY "partners_delete" ON public.partners FOR DELETE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));

CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.partner_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  commission_type text NOT NULL DEFAULT 'per_hour',
  commission_value numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, client_id),
  CONSTRAINT partner_clients_commission_type_chk CHECK (commission_type IN ('per_hour','percent_profit','percent_revenue'))
);

CREATE INDEX idx_partner_clients_partner ON public.partner_clients(partner_id);
CREATE INDEX idx_partner_clients_client ON public.partner_clients(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_clients TO authenticated;
GRANT ALL ON public.partner_clients TO service_role;
ALTER TABLE public.partner_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_clients_select" ON public.partner_clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "partner_clients_insert" ON public.partner_clients FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));
CREATE POLICY "partner_clients_update" ON public.partner_clients FOR UPDATE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));
CREATE POLICY "partner_clients_delete" ON public.partner_clients FOR DELETE TO authenticated
  USING (public.is_admin_or_owner(auth.uid()) OR public.has_permission(auth.uid(), 'edit_clients'));

CREATE TRIGGER update_partner_clients_updated_at BEFORE UPDATE ON public.partner_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();