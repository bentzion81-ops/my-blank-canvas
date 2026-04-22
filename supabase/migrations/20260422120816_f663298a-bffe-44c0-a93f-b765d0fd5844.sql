ALTER TABLE public.employee_expected_hours
  ADD COLUMN IF NOT EXISTS active_days text[] DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.check_employee_absence(_employee_id uuid, _date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  emp record;
  expected record;
  has_expected boolean;
  dow int;
  dtype expected_day_type;
  day_name text;
  has_attendance boolean;
  has_absence boolean;
  admin_user uuid;
  emp_name text;
  end_of_day timestamptz;
  in_no_work boolean;
BEGIN
  IF _date > CURRENT_DATE THEN RETURN; END IF;

  SELECT * INTO emp FROM employees WHERE id = _employee_id AND status = 'active';
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT COALESCE(emp.meckano_synced, false) THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM no_work_periods nwp
    WHERE _date BETWEEN nwp.from_date AND nwp.to_date
      AND (
        (nwp.scope = 'employee' AND nwp.employee_id = _employee_id)
        OR (nwp.scope = 'client' AND nwp.client_id IN (
          SELECT eca.client_id FROM employee_client_assignments eca
          WHERE eca.employee_id = _employee_id
            AND (eca.start_date IS NULL OR eca.start_date <= _date)
            AND (eca.end_date IS NULL OR eca.end_date >= _date)
        ))
      )
  ) INTO in_no_work;
  IF in_no_work THEN RETURN; END IF;

  dow := EXTRACT(DOW FROM _date)::int;
  dtype := CASE WHEN dow = 5 THEN 'friday'::expected_day_type
                WHEN dow = 6 THEN 'saturday'::expected_day_type
                ELSE 'weekday'::expected_day_type END;
  day_name := CASE dow
    WHEN 0 THEN 'sunday' WHEN 1 THEN 'monday' WHEN 2 THEN 'tuesday'
    WHEN 3 THEN 'wednesday' WHEN 4 THEN 'thursday' WHEN 5 THEN 'friday' WHEN 6 THEN 'saturday'
  END;

  SELECT * INTO expected FROM employee_expected_hours
  WHERE employee_id = _employee_id AND day_type = dtype;
  has_expected := FOUND;

  IF has_expected THEN
    IF NOT expected.is_working_day THEN RETURN; END IF;
    IF expected.active_days IS NOT NULL AND array_length(expected.active_days, 1) IS NOT NULL
       AND NOT (day_name = ANY(expected.active_days)) THEN
      RETURN;
    END IF;
    IF _date = CURRENT_DATE AND expected.expected_check_out IS NOT NULL THEN
      end_of_day := (_date::text || ' ' || expected.expected_check_out::text)::timestamp AT TIME ZONE 'Asia/Jerusalem';
      IF now() < end_of_day THEN RETURN; END IF;
    END IF;
  ELSE
    end_of_day := ((_date + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'Asia/Jerusalem';
    IF now() < end_of_day THEN RETURN; END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM attendance_records WHERE employee_id = _employee_id AND date = _date AND check_in IS NOT NULL) INTO has_attendance;
  IF has_attendance THEN RETURN; END IF;

  SELECT EXISTS (SELECT 1 FROM attendance_absences WHERE employee_id = _employee_id AND date = _date) INTO has_absence;

  IF NOT has_absence THEN
    INSERT INTO attendance_absences (employee_id, date, status, notes)
    VALUES (_employee_id, _date, 'no_show', 'נוצר אוטומטית - לא דווחה כניסה');
  END IF;

  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE type = 'missing_attendance' AND entity_type = 'employee_absence'
      AND entity_id = _employee_id AND title LIKE '%' || to_char(_date, 'DD/MM/YYYY') || '%'
  ) THEN RETURN; END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.check_attendance_lateness(_record_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  expected record;
  emp_name text;
  dow int;
  dtype expected_day_type;
  day_name text;
  exp_in_ts timestamptz;
  exp_out_ts timestamptz;
  diff_in_min numeric;
  diff_out_min numeric;
  threshold_min int := 20;
  admin_user uuid;
BEGIN
  SELECT ar.*, (e.first_name || ' ' || e.last_name) AS full_name, COALESCE(e.meckano_synced, false) AS synced
    INTO rec
  FROM attendance_records ar
  JOIN employees e ON e.id = ar.employee_id
  WHERE ar.id = _record_id;

  IF NOT FOUND THEN RETURN; END IF;
  IF NOT rec.synced THEN RETURN; END IF;

  dow := EXTRACT(DOW FROM rec.date)::int;
  dtype := CASE WHEN dow = 5 THEN 'friday'::expected_day_type
                WHEN dow = 6 THEN 'saturday'::expected_day_type
                ELSE 'weekday'::expected_day_type END;
  day_name := CASE dow
    WHEN 0 THEN 'sunday' WHEN 1 THEN 'monday' WHEN 2 THEN 'tuesday'
    WHEN 3 THEN 'wednesday' WHEN 4 THEN 'thursday' WHEN 5 THEN 'friday' WHEN 6 THEN 'saturday'
  END;

  SELECT * INTO expected FROM employee_expected_hours
  WHERE employee_id = rec.employee_id AND day_type = dtype;

  IF NOT FOUND OR NOT expected.is_working_day THEN RETURN; END IF;
  IF expected.active_days IS NOT NULL AND array_length(expected.active_days, 1) IS NOT NULL
     AND NOT (day_name = ANY(expected.active_days)) THEN
    RETURN;
  END IF;

  emp_name := rec.full_name;

  IF expected.expected_check_in IS NOT NULL AND rec.check_in IS NOT NULL THEN
    exp_in_ts := (rec.date::text || ' ' || expected.expected_check_in::text)::timestamp AT TIME ZONE 'Asia/Jerusalem';
    diff_in_min := EXTRACT(EPOCH FROM (rec.check_in - exp_in_ts)) / 60.0;
    IF diff_in_min >= threshold_min THEN
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE entity_type = 'attendance_record' AND entity_id = rec.id
          AND type = 'late_attendance' AND title LIKE '%כניסה%'
      ) THEN
        FOR admin_user IN SELECT user_id FROM user_roles WHERE role IN ('owner','admin','manager') LOOP
          INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
          VALUES (admin_user,'late_attendance','איחור בכניסה: ' || emp_name,
            emp_name || ' איחר/ה ב-' || ROUND(diff_in_min)::text || ' דק׳ בכניסה ב-' || to_char(rec.date,'DD/MM/YYYY') || ' (צפוי: ' || expected.expected_check_in::text || ')',
            'attendance_record', rec.id);
        END LOOP;
      END IF;
    END IF;
  END IF;

  IF expected.expected_check_out IS NOT NULL AND rec.check_out IS NOT NULL THEN
    exp_out_ts := (rec.date::text || ' ' || expected.expected_check_out::text)::timestamp AT TIME ZONE 'Asia/Jerusalem';
    diff_out_min := EXTRACT(EPOCH FROM (rec.check_out - exp_out_ts)) / 60.0;
    IF ABS(diff_out_min) >= threshold_min THEN
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE entity_type = 'attendance_record' AND entity_id = rec.id
          AND type = 'late_attendance' AND title LIKE '%יציאה%'
      ) THEN
        FOR admin_user IN SELECT user_id FROM user_roles WHERE role IN ('owner','admin','manager') LOOP
          INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
          VALUES (admin_user,'late_attendance','חריגה ביציאה: ' || emp_name,
            emp_name || ' ' || CASE WHEN diff_out_min>0 THEN 'נשאר/ה ' ELSE 'יצא/ה מוקדם ' END || ABS(ROUND(diff_out_min))::text || ' דק׳ ב-' || to_char(rec.date,'DD/MM/YYYY') || ' (צפוי: ' || expected.expected_check_out::text || ')',
            'attendance_record', rec.id);
        END LOOP;
      END IF;
    END IF;
  END IF;
END;
$function$;