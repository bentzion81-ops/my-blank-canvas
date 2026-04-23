-- Enum for recurrence
CREATE TYPE public.replacement_event_recurrence AS ENUM ('none', 'weekly', 'monthly');

-- Enum for planned event status
CREATE TYPE public.replacement_planned_event_status AS ENUM ('scheduled', 'pending_fill', 'completed', 'cancelled');

CREATE TABLE public.replacement_planned_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  custom_workplace TEXT,
  workplace_address TEXT,
  maps_link TEXT,
  worker_id UUID REFERENCES public.replacement_workers(id) ON DELETE SET NULL,
  -- Scheduling
  recurrence public.replacement_event_recurrence NOT NULL DEFAULT 'none',
  event_date DATE,                 -- for 'none'
  weekday SMALLINT CHECK (weekday BETWEEN 0 AND 6), -- for 'weekly' (0=Sunday)
  monthly_day SMALLINT CHECK (monthly_day BETWEEN 1 AND 31), -- for 'monthly'
  next_occurrence DATE,            -- precomputed next date
  -- Time / pay (planned)
  expected_check_in TIME,
  expected_check_out TIME,
  expected_hours NUMERIC DEFAULT 0,
  hourly_wage NUMERIC DEFAULT 0,
  expected_payment NUMERIC DEFAULT 0,
  -- State
  status public.replacement_planned_event_status NOT NULL DEFAULT 'scheduled',
  notified_at TIMESTAMPTZ,
  replacement_report_id UUID REFERENCES public.replacement_reports(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planned_events_next ON public.replacement_planned_events(next_occurrence);
CREATE INDEX idx_planned_events_status ON public.replacement_planned_events(status);
CREATE INDEX idx_planned_events_worker ON public.replacement_planned_events(worker_id);
CREATE INDEX idx_planned_events_client ON public.replacement_planned_events(client_id);

ALTER TABLE public.replacement_planned_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read planned events"
  ON public.replacement_planned_events FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Auth insert planned events"
  ON public.replacement_planned_events FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Auth update planned events"
  ON public.replacement_planned_events FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Auth delete planned events"
  ON public.replacement_planned_events FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER update_replacement_planned_events_updated_at
  BEFORE UPDATE ON public.replacement_planned_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();