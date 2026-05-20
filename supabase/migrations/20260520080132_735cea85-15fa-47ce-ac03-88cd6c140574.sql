
CREATE OR REPLACE FUNCTION public.ensure_employee_from_replacement(_report_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rep record;
  emp_id uuid;
  fname text;
  lname text;
  parts text[];
BEGIN
  SELECT * INTO rep FROM replacement_reports WHERE id = _report_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF COALESCE(TRIM(rep.passport_number), '') = '' THEN RETURN NULL; END IF;

  SELECT id INTO emp_id FROM employees
   WHERE TRIM(passport_number) = TRIM(rep.passport_number) LIMIT 1;

  IF emp_id IS NULL THEN
    parts := regexp_split_to_array(TRIM(COALESCE(rep.worker_name, '')), '\s+');
    fname := COALESCE(parts[1], rep.worker_name, 'Worker');
    lname := CASE WHEN array_length(parts,1) > 1
                  THEN array_to_string(parts[2:array_length(parts,1)], ' ')
                  ELSE '' END;

    INSERT INTO employees (
      first_name, last_name, passport_number, hourly_wage,
      status, employee_type, meckano_synced, source
    ) VALUES (
      fname, lname, TRIM(rep.passport_number), COALESCE(rep.hourly_wage, 0),
      'active', 'temporary', false, 'manual'
    )
    RETURNING id INTO emp_id;
  END IF;

  -- Link to client if assigned and no active assignment exists for that client
  IF rep.assigned_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM employee_client_assignments
    WHERE employee_id = emp_id AND client_id = rep.assigned_client_id
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  ) THEN
    INSERT INTO employee_client_assignments (employee_id, client_id, is_primary, start_date, employee_hourly_wage)
    VALUES (emp_id, rep.assigned_client_id,
            NOT EXISTS (SELECT 1 FROM employee_client_assignments WHERE employee_id = emp_id),
            COALESCE(rep.work_date, CURRENT_DATE),
            rep.hourly_wage);
  END IF;

  RETURN emp_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_replacement_report_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM public.ensure_employee_from_replacement(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS replacement_reports_auto_employee ON public.replacement_reports;
CREATE TRIGGER replacement_reports_auto_employee
AFTER INSERT OR UPDATE OF status ON public.replacement_reports
FOR EACH ROW EXECUTE FUNCTION public.trg_replacement_report_approved();

-- One-time backfill for already approved reports without matching employee
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (TRIM(passport_number)) id
    FROM replacement_reports
    WHERE status = 'approved'
      AND COALESCE(TRIM(passport_number),'') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM employees e
        WHERE TRIM(e.passport_number) = TRIM(replacement_reports.passport_number)
      )
    ORDER BY TRIM(passport_number), created_at
  LOOP
    PERFORM public.ensure_employee_from_replacement(r.id);
  END LOOP;
END $$;
