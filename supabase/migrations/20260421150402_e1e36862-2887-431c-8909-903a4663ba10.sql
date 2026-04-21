-- 1) When attendance is reported (insert/update with check_in or check_out), 
--    delete prior late_attendance notifications for that record + that employee/date
CREATE OR REPLACE FUNCTION public.trg_clear_late_notifications_on_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove late notifications tied to this attendance record
  DELETE FROM notifications
  WHERE type = 'late_attendance'
    AND entity_type = 'attendance_record'
    AND entity_id = NEW.id;

  -- Also remove any "missing_attendance" (absence) notification for that day,
  -- since the employee did report
  IF NEW.check_in IS NOT NULL THEN
    DELETE FROM notifications
    WHERE type = 'missing_attendance'
      AND entity_type = 'employee_absence'
      AND entity_id = NEW.employee_id
      AND title LIKE '%' || to_char(NEW.date, 'DD/MM/YYYY') || '%';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_clear_late_notifs ON attendance_records;
CREATE TRIGGER attendance_clear_late_notifs
AFTER INSERT OR UPDATE OF check_in, check_out ON attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.trg_clear_late_notifications_on_report();

-- 2) Update absence check to also clear late notifications when absence is created
CREATE OR REPLACE FUNCTION public.check_employee_absence(_employee_id uuid, _date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp record;
  expected record;
  dow int;
  dtype expected_day_type;
  has_attendance boolean;
  has_absence boolean;
  admin_user uuid;
  emp_name text;
  end_of_day timestamptz;
BEGIN
  IF _date > CURRENT_DATE THEN RETURN; END IF;

  SELECT * INTO emp FROM employees WHERE id = _employee_id AND status = 'active';
  IF NOT FOUND THEN RETURN; END IF;

  dow := EXTRACT(DOW FROM _date)::int;
  dtype := CASE WHEN dow = 5 THEN 'friday'::expected_day_type
                WHEN dow = 6 THEN 'saturday'::expected_day_type
                ELSE 'weekday'::expected_day_type END;

  SELECT * INTO expected FROM employee_expected_hours
  WHERE employee_id = _employee_id AND day_type = dtype;
  IF NOT FOUND OR NOT expected.is_working_day THEN RETURN; END IF;

  -- For today, only flag once expected check-out time has passed
  IF _date = CURRENT_DATE AND expected.expected_check_out IS NOT NULL THEN
    end_of_day := (_date::text || ' ' || expected.expected_check_out::text)::timestamp AT TIME ZONE 'Asia/Jerusalem';
    IF now() < end_of_day THEN RETURN; END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM attendance_records WHERE employee_id = _employee_id AND date = _date AND check_in IS NOT NULL) INTO has_attendance;
  IF has_attendance THEN RETURN; END IF;

  SELECT EXISTS (SELECT 1 FROM attendance_absences WHERE employee_id = _employee_id AND date = _date) INTO has_absence;
  IF has_absence THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE type = 'missing_attendance' AND entity_type = 'employee_absence'
      AND entity_id = _employee_id AND title LIKE '%' || to_char(_date, 'DD/MM/YYYY') || '%'
  ) THEN RETURN; END IF;

  -- Clear stale late notifications for that employee/date (if any)
  DELETE FROM notifications n
  USING attendance_records ar
  WHERE n.type = 'late_attendance'
    AND n.entity_type = 'attendance_record'
    AND n.entity_id = ar.id
    AND ar.employee_id = _employee_id
    AND ar.date = _date;

  emp_name := emp.first_name || ' ' || emp.last_name;
  FOR admin_user IN SELECT user_id FROM user_roles WHERE role IN ('owner','admin','manager') LOOP
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
      admin_user, 'missing_attendance',
      'חיסור: ' || emp_name || ' - ' || to_char(_date, 'DD/MM/YYYY'),
      emp_name || ' לא דיווח/ה כניסה ביום עבודה (' || to_char(_date, 'DD/MM/YYYY') || ').',
      'employee_absence', _employee_id
    );
  END LOOP;
END;
$$;

-- 3) Update cron schedule: instead of nightly, run every 15 minutes during working hours
--    so absences get flagged shortly after expected check-out time
DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'daily-absence-check';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'absence-check-frequent',
  '*/15 * * * *',
  $$ SELECT public.recheck_all_absences((CURRENT_DATE - INTERVAL '2 days')::date, CURRENT_DATE) $$
);