-- 1. Enum for absence statuses
DO $$ BEGIN
  CREATE TYPE public.absence_status AS ENUM ('no_show', 'replacement', 'no_work', 'vacation', 'sick');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Absences table
CREATE TABLE IF NOT EXISTS public.attendance_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  date DATE NOT NULL,
  status public.absence_status NOT NULL DEFAULT 'no_show',
  replacement_name TEXT,
  notes TEXT,
  marked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_absences_employee_date ON public.attendance_absences(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_absences_date ON public.attendance_absences(date);

ALTER TABLE public.attendance_absences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read absences" ON public.attendance_absences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage absences" ON public.attendance_absences FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));
CREATE POLICY "Update absences" ON public.attendance_absences FOR UPDATE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));
CREATE POLICY "Delete absences" ON public.attendance_absences FOR DELETE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

CREATE TRIGGER trg_attendance_absences_updated_at
  BEFORE UPDATE ON public.attendance_absences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Function: check single employee/date for absence and create notification
CREATE OR REPLACE FUNCTION public.check_employee_absence(_employee_id UUID, _date DATE)
RETURNS VOID
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
  -- Don't check future days
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

  -- For today, only flag if expected end-of-work time has passed
  IF _date = CURRENT_DATE AND expected.expected_check_out IS NOT NULL THEN
    end_of_day := (_date::text || ' ' || expected.expected_check_out::text)::timestamp AT TIME ZONE 'Asia/Jerusalem';
    IF now() < end_of_day THEN RETURN; END IF;
  END IF;

  -- Skip if attendance recorded
  SELECT EXISTS (SELECT 1 FROM attendance_records WHERE employee_id = _employee_id AND date = _date AND check_in IS NOT NULL) INTO has_attendance;
  IF has_attendance THEN RETURN; END IF;

  -- Skip if absence already marked
  SELECT EXISTS (SELECT 1 FROM attendance_absences WHERE employee_id = _employee_id AND date = _date) INTO has_absence;
  IF has_absence THEN RETURN; END IF;

  -- Skip if notification already exists
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE type = 'missing_attendance' AND entity_type = 'employee_absence'
      AND entity_id = _employee_id AND title LIKE '%' || to_char(_date, 'DD/MM/YYYY') || '%'
  ) THEN RETURN; END IF;

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

-- 4. Bulk recheck for date range
CREATE OR REPLACE FUNCTION public.recheck_all_absences(_from_date DATE, _to_date DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_rec record;
  d DATE;
  cnt INT := 0;
BEGIN
  FOR emp_rec IN SELECT id FROM employees WHERE status = 'active' LOOP
    d := _from_date;
    WHILE d <= _to_date LOOP
      PERFORM public.check_employee_absence(emp_rec.id, d);
      d := d + 1;
      cnt := cnt + 1;
    END LOOP;
  END LOOP;
  RETURN cnt;
END;
$$;

-- 5. When absence marked, mark related notification as read
CREATE OR REPLACE FUNCTION public.trg_mark_absence_notification_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE notifications SET is_read = true
  WHERE type = 'missing_attendance'
    AND entity_type = 'employee_absence'
    AND entity_id = NEW.employee_id
    AND title LIKE '%' || to_char(NEW.date, 'DD/MM/YYYY') || '%';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_absence_marks_notification_read ON public.attendance_absences;
CREATE TRIGGER trg_absence_marks_notification_read
  AFTER INSERT OR UPDATE ON public.attendance_absences
  FOR EACH ROW EXECUTE FUNCTION public.trg_mark_absence_notification_read();