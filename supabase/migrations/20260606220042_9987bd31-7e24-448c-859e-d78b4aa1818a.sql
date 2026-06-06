-- Add meckano_synced to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS meckano_synced boolean NOT NULL DEFAULT false;

-- daily_check_logs
CREATE TABLE public.daily_check_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_date date NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('ok','no_work','missing','pending')),
  missing_type text CHECK (missing_type IN ('no_checkin','no_checkout','both')),
  notes text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('auto','manual')),
  checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (check_date, employee_id, client_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_check_logs TO authenticated;
GRANT ALL ON public.daily_check_logs TO service_role;

ALTER TABLE public.daily_check_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read daily_check_logs" ON public.daily_check_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert daily_check_logs" ON public.daily_check_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update daily_check_logs" ON public.daily_check_logs FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete daily_check_logs" ON public.daily_check_logs FOR DELETE TO authenticated USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

CREATE TRIGGER trg_daily_check_logs_updated_at
BEFORE UPDATE ON public.daily_check_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_daily_check_logs_date ON public.daily_check_logs(check_date);
CREATE INDEX idx_daily_check_logs_client_date ON public.daily_check_logs(client_id, check_date);