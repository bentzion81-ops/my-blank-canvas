-- 1) Day type enum
CREATE TYPE public.expected_day_type AS ENUM ('weekday', 'friday', 'saturday');

-- 2) Expected hours table
CREATE TABLE public.employee_expected_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  day_type public.expected_day_type NOT NULL,
  is_working_day boolean NOT NULL DEFAULT true,
  expected_check_in time,
  expected_check_out time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, day_type)
);

CREATE INDEX idx_eeh_employee ON public.employee_expected_hours(employee_id);

ALTER TABLE public.employee_expected_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read expected_hours" ON public.employee_expected_hours
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage expected_hours" ON public.employee_expected_hours
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_employees'));
CREATE POLICY "Update expected_hours" ON public.employee_expected_hours
  FOR UPDATE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_employees'));
CREATE POLICY "Delete expected_hours" ON public.employee_expected_hours
  FOR DELETE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_employees'));

CREATE TRIGGER trg_eeh_updated_at
  BEFORE UPDATE ON public.employee_expected_hours
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Function: check lateness for a single attendance record
CREATE OR REPLACE FUNCTION public.check_attendance_lateness(_record_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  expected record;
  emp_name text;
  dow int;
  dtype expected_day_type;
  exp_in_ts timestamptz;
  exp_out_ts timestamptz;
  diff_in_min numeric;
  diff_out_min numeric;
  threshold_min int := 20;
  admin_user uuid;
BEGIN
  SELECT ar.*, (e.first_name || ' ' || e.last_name) AS full_name
    INTO rec
  FROM attendance_records ar
  JOIN employees e ON e.id = ar.employee_id
  WHERE ar.id = _record_id;

  IF NOT FOUND THEN RETURN; END IF;

  -- determine day type (PG: 0=Sun..6=Sat)
  dow := EXTRACT(DOW FROM rec.date)::int;
  dtype := CASE
    WHEN dow = 5 THEN 'friday'::expected_day_type
    WHEN dow = 6 THEN 'saturday'::expected_day_type
    ELSE 'weekday'::expected_day_type
  END;

  SELECT * INTO expected
  FROM employee_expected_hours
  WHERE employee_id = rec.employee_id AND day_type = dtype;

  IF NOT FOUND OR NOT expected.is_working_day THEN RETURN; END IF;

  emp_name := rec.full_name;

  -- Late check-in
  IF expected.expected_check_in IS NOT NULL AND rec.check_in IS NOT NULL THEN
    exp_in_ts := (rec.date::text || ' ' || expected.expected_check_in::text)::timestamp AT TIME ZONE 'Asia/Jerusalem';
    diff_in_min := EXTRACT(EPOCH FROM (rec.check_in - exp_in_ts)) / 60.0;
    IF diff_in_min >= threshold_min THEN
      -- avoid duplicates
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE entity_type = 'attendance_record'
          AND entity_id = rec.id
          AND type = 'late_attendance'
          AND title LIKE '%כניסה%'
      ) THEN
        FOR admin_user IN SELECT user_id FROM user_roles WHERE role IN ('owner','admin','manager') LOOP
          INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
          VALUES (
            admin_user,
            'late_attendance',
            'איחור בכניסה: ' || emp_name,
            emp_name || ' איחר/ה ב-' || ROUND(diff_in_min)::text || ' דק׳ בכניסה ב-' || to_char(rec.date,'DD/MM/YYYY') || ' (צפוי: ' || expected.expected_check_in::text || ')',
            'attendance_record',
            rec.id
          );
        END LOOP;
      END IF;
    END IF;
  END IF;

  -- Late check-out (left earlier than expected by 20+ min counts as early; we flag late = stayed later? user said "מאחר ב-20 דק מהשעה שהיה אמור לדווח כניסה או יציאה" => late reporting of check-out means left late OR didn't report. We'll flag if check_out is more than 20 min AFTER expected (stayed late) OR more than 20 min BEFORE (left early))
  IF expected.expected_check_out IS NOT NULL AND rec.check_out IS NOT NULL THEN
    exp_out_ts := (rec.date::text || ' ' || expected.expected_check_out::text)::timestamp AT TIME ZONE 'Asia/Jerusalem';
    diff_out_min := EXTRACT(EPOCH FROM (rec.check_out - exp_out_ts)) / 60.0;
    IF ABS(diff_out_min) >= threshold_min THEN
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE entity_type = 'attendance_record'
          AND entity_id = rec.id
          AND type = 'late_attendance'
          AND title LIKE '%יציאה%'
      ) THEN
        FOR admin_user IN SELECT user_id FROM user_roles WHERE role IN ('owner','admin','manager') LOOP
          INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
          VALUES (
            admin_user,
            'late_attendance',
            'חריגה ביציאה: ' || emp_name,
            emp_name || ' ' || CASE WHEN diff_out_min>0 THEN 'נשאר/ה ' ELSE 'יצא/ה מוקדם ' END || ABS(ROUND(diff_out_min))::text || ' דק׳ ב-' || to_char(rec.date,'DD/MM/YYYY') || ' (צפוי: ' || expected.expected_check_out::text || ')',
            'attendance_record',
            rec.id
          );
        END LOOP;
      END IF;
    END IF;
  END IF;
END;
$$;

-- 4) Trigger on attendance_records
CREATE OR REPLACE FUNCTION public.trg_check_attendance_lateness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.check_attendance_lateness(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER attendance_lateness_check
  AFTER INSERT OR UPDATE OF check_in, check_out, date ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_attendance_lateness();

-- 5) Bulk re-check function (manual button)
CREATE OR REPLACE FUNCTION public.recheck_all_lateness(_from_date date, _to_date date)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  cnt int := 0;
BEGIN
  FOR r IN SELECT id FROM attendance_records WHERE date BETWEEN _from_date AND _to_date LOOP
    PERFORM public.check_attendance_lateness(r.id);
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;