ALTER TABLE public.daily_check_logs ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.daily_check_logs DROP CONSTRAINT IF EXISTS daily_check_logs_check_date_employee_id_client_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS daily_check_logs_unique_emp ON public.daily_check_logs (check_date, client_id, employee_id) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS daily_check_logs_unique_client ON public.daily_check_logs (check_date, client_id) WHERE employee_id IS NULL;