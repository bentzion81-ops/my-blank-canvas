-- 1. Add meckano_employee_id to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS meckano_employee_id text;

CREATE UNIQUE INDEX IF NOT EXISTS employees_meckano_employee_id_key
  ON public.employees (meckano_employee_id)
  WHERE meckano_employee_id IS NOT NULL;

-- 2. Raw Meckano attendance reports (deduped by meckano_report_id)
CREATE TABLE IF NOT EXISTS public.meckano_attendance_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meckano_report_id text NOT NULL UNIQUE,
  meckano_employee_id text NOT NULL,
  employee_id uuid NULL,
  event_timestamp timestamptz NOT NULL,
  event_type text NULL, -- 'entry' | 'exit' | other
  latitude numeric NULL,
  longitude numeric NULL,
  address text NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meckano_raw_employee_idx
  ON public.meckano_attendance_raw (meckano_employee_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS meckano_raw_employee_uuid_idx
  ON public.meckano_attendance_raw (employee_id, event_timestamp DESC);

ALTER TABLE public.meckano_attendance_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read meckano_raw"
  ON public.meckano_attendance_raw FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Manage meckano_raw"
  ON public.meckano_attendance_raw FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

CREATE POLICY "Update meckano_raw"
  ON public.meckano_attendance_raw FOR UPDATE
  TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

CREATE POLICY "Delete meckano_raw"
  ON public.meckano_attendance_raw FOR DELETE
  TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

-- 3. Sync logs
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'meckano',
  sync_type text NOT NULL, -- 'employees' | 'attendance'
  status text NOT NULL DEFAULT 'running', -- 'running' | 'success' | 'error'
  records_count integer NOT NULL DEFAULT 0,
  error_message text NULL,
  triggered_by uuid NULL,
  trigger_kind text NOT NULL DEFAULT 'manual', -- 'manual' | 'cron'
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS sync_logs_started_idx
  ON public.sync_logs (started_at DESC);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read sync_logs"
  ON public.sync_logs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Manage sync_logs"
  ON public.sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

CREATE POLICY "Update sync_logs"
  ON public.sync_logs FOR UPDATE
  TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));