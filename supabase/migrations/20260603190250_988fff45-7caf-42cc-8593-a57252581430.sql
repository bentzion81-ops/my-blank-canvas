
CREATE TABLE public.client_invoice_marks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  issued BOOLEAN NOT NULL DEFAULT true,
  marked_by UUID,
  marked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (client_id, month)
);

CREATE INDEX idx_client_invoice_marks_month ON public.client_invoice_marks(month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invoice_marks TO authenticated;
GRANT ALL ON public.client_invoice_marks TO service_role;

ALTER TABLE public.client_invoice_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read invoice_marks" ON public.client_invoice_marks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manage invoice_marks insert" ON public.client_invoice_marks
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_billing'));

CREATE POLICY "Manage invoice_marks update" ON public.client_invoice_marks
  FOR UPDATE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_billing'));

CREATE POLICY "Manage invoice_marks delete" ON public.client_invoice_marks
  FOR DELETE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_billing'));

CREATE TRIGGER update_client_invoice_marks_updated_at
  BEFORE UPDATE ON public.client_invoice_marks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
