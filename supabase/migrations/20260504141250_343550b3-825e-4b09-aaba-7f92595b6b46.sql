-- Add source column to track where employee was added from
DO $$ BEGIN
  CREATE TYPE public.employee_source AS ENUM ('manual', 'meckano', 'replacement_link');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS source public.employee_source NOT NULL DEFAULT 'manual';

-- Backfill: employees with a meckano_employee_id are from Meckano
UPDATE public.employees
   SET source = 'meckano'
 WHERE meckano_employee_id IS NOT NULL
   AND source = 'manual';