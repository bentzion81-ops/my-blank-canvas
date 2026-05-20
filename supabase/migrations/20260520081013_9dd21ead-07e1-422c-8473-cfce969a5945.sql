DROP FUNCTION IF EXISTS public.ensure_employee_from_replacement(uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.ensure_employee_from_replacement(_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  emp_id uuid;
  fn text;
  ln text;
  parts text[];
BEGIN
  SELECT * INTO r FROM replacement_reports WHERE id = _report_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF r.passport_number IS NOT NULL AND r.passport_number <> '' THEN
    SELECT id INTO emp_id FROM employees WHERE passport_number = r.passport_number LIMIT 1;
  END IF;

  IF emp_id IS NULL THEN
    parts := regexp_split_to_array(coalesce(r.worker_name, ''), '\s+');
    fn := coalesce(parts[1], r.worker_name, 'Unknown');
    ln := coalesce(array_to_string(parts[2:], ' '), '');
    INSERT INTO employees (first_name, last_name, passport_number, hourly_wage, status, employee_type, meckano_synced, source)
    VALUES (fn, ln, r.passport_number, coalesce(r.hourly_wage, 0), 'active', 'temporary', false, 'replacement_link')
    RETURNING id INTO emp_id;
  ELSE
    UPDATE employees SET source = 'replacement_link'
    WHERE id = emp_id AND (source IS NULL OR source = 'manual');
  END IF;

  IF r.assigned_client_id IS NOT NULL AND emp_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM employee_client_assignments
      WHERE employee_id = emp_id AND client_id = r.assigned_client_id AND end_date IS NULL
    ) THEN
      INSERT INTO employee_client_assignments (employee_id, client_id, start_date, is_primary)
      VALUES (emp_id, r.assigned_client_id, coalesce(r.work_date, current_date), false);
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_ensure_employee_from_replacement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    PERFORM public.ensure_employee_from_replacement(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_replacement_report_approved ON public.replacement_reports;
CREATE TRIGGER trg_replacement_report_approved
AFTER INSERT OR UPDATE OF status ON public.replacement_reports
FOR EACH ROW
EXECUTE FUNCTION public.trg_ensure_employee_from_replacement();

UPDATE employees e
SET source = 'replacement_link'
FROM replacement_reports r
WHERE r.status = 'approved'
  AND r.passport_number IS NOT NULL
  AND r.passport_number = e.passport_number
  AND (e.source IS NULL OR e.source = 'manual');