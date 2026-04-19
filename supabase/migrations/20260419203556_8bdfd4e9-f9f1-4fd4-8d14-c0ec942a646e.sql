-- Enums
CREATE TYPE public.replacement_report_status AS ENUM ('pending', 'approved', 'rejected', 'needs_clarification');
CREATE TYPE public.replacement_change_request_status AS ENUM ('open', 'resolved', 'dismissed');
CREATE TYPE public.replacement_language AS ENUM ('he', 'en', 'si');

-- Workers table
CREATE TABLE public.replacement_workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  passport_number TEXT NOT NULL UNIQUE,
  phone TEXT,
  preferred_language public.replacement_language NOT NULL DEFAULT 'he',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_replacement_workers_passport ON public.replacement_workers(passport_number);

-- Reports table
CREATE TABLE public.replacement_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.replacement_workers(id) ON DELETE CASCADE,
  passport_number TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  work_date DATE NOT NULL,
  check_in TIME NOT NULL,
  check_out TIME NOT NULL,
  total_hours NUMERIC NOT NULL DEFAULT 0,
  hourly_wage NUMERIC DEFAULT 0,
  total_payment NUMERIC DEFAULT 0,
  workplace_description TEXT NOT NULL,
  workplace_address TEXT,
  maps_link TEXT,
  notes TEXT,
  status public.replacement_report_status NOT NULL DEFAULT 'pending',
  assigned_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  assigned_custom_workplace TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_replacement_reports_worker ON public.replacement_reports(worker_id);
CREATE INDEX idx_replacement_reports_status ON public.replacement_reports(status);
CREATE INDEX idx_replacement_reports_date ON public.replacement_reports(work_date);
CREATE INDEX idx_replacement_reports_client ON public.replacement_reports(assigned_client_id);

-- Change requests table
CREATE TABLE public.replacement_change_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.replacement_reports(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.replacement_workers(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status public.replacement_change_request_status NOT NULL DEFAULT 'open',
  handled_by UUID,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_replacement_change_requests_report ON public.replacement_change_requests(report_id);
CREATE INDEX idx_replacement_change_requests_status ON public.replacement_change_requests(status);

-- Enable RLS
ALTER TABLE public.replacement_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_change_requests ENABLE ROW LEVEL SECURITY;

-- WORKERS policies
-- Anonymous: can register (insert) and read by passport (read all - needed to identify by passport before knowing id)
CREATE POLICY "Public can read workers"
  ON public.replacement_workers FOR SELECT
  USING (true);

CREATE POLICY "Public can register workers"
  ON public.replacement_workers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can update own profile"
  ON public.replacement_workers FOR UPDATE
  USING (true);

CREATE POLICY "Admins delete workers"
  ON public.replacement_workers FOR DELETE
  TO authenticated
  USING (is_admin_or_owner(auth.uid()));

-- REPORTS policies
CREATE POLICY "Public can read reports"
  ON public.replacement_reports FOR SELECT
  USING (true);

CREATE POLICY "Public can insert reports"
  ON public.replacement_reports FOR INSERT
  WITH CHECK (true);

-- Only authenticated managers can update reports (assigning clients, approving)
CREATE POLICY "Managers update reports"
  ON public.replacement_reports FOR UPDATE
  TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

CREATE POLICY "Managers delete reports"
  ON public.replacement_reports FOR DELETE
  TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

-- CHANGE REQUESTS policies
CREATE POLICY "Public can read change requests"
  ON public.replacement_change_requests FOR SELECT
  USING (true);

CREATE POLICY "Public can insert change requests"
  ON public.replacement_change_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Managers update change requests"
  ON public.replacement_change_requests FOR UPDATE
  TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

CREATE POLICY "Managers delete change requests"
  ON public.replacement_change_requests FOR DELETE
  TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

-- Triggers for updated_at
CREATE TRIGGER trg_replacement_workers_updated
  BEFORE UPDATE ON public.replacement_workers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_replacement_reports_updated
  BEFORE UPDATE ON public.replacement_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_replacement_change_requests_updated
  BEFORE UPDATE ON public.replacement_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();