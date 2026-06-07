CREATE TABLE public.daily_check_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_date date NOT NULL UNIQUE,
  closed_by uuid,
  closed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_check_closures TO authenticated;
GRANT ALL ON public.daily_check_closures TO service_role;
ALTER TABLE public.daily_check_closures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read closures" ON public.daily_check_closures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert closures" ON public.daily_check_closures FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update closures" ON public.daily_check_closures FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins delete closures" ON public.daily_check_closures FOR DELETE TO authenticated USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));
CREATE TRIGGER update_daily_check_closures_updated_at BEFORE UPDATE ON public.daily_check_closures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();