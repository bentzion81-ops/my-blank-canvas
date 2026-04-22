-- 1) Clean up any existing auto-no_show rows for today where the shift hasn't ended yet.
DELETE FROM attendance_absences a
USING employees e, employee_expected_hours eeh
WHERE a.employee_id = e.id
  AND eeh.employee_id = e.id
  AND a.status = 'no_show'
  AND a.notes = 'נוצר אוטומטית - לא דווחה כניסה'
  AND a.date = (now() AT TIME ZONE 'Asia/Jerusalem')::date
  AND eeh.day_type = (
    CASE EXTRACT(DOW FROM a.date)::int
      WHEN 5 THEN 'friday'::expected_day_type
      WHEN 6 THEN 'saturday'::expected_day_type
      ELSE 'weekday'::expected_day_type
    END
  )
  AND eeh.is_working_day
  AND eeh.expected_check_out IS NOT NULL
  AND now() < ((a.date::text || ' ' || eeh.expected_check_out::text)::timestamp AT TIME ZONE 'Asia/Jerusalem');

-- Also clean up matching missing_attendance notifications.
DELETE FROM notifications n
WHERE n.type = 'missing_attendance'
  AND n.entity_type = 'employee_absence'
  AND NOT EXISTS (
    SELECT 1 FROM attendance_absences a
    WHERE a.employee_id = n.entity_id
      AND n.title LIKE '%' || to_char(a.date, 'DD/MM/YYYY') || '%'
  );

-- 2) Update check_employee_absence so that, if it runs for "today" and the shift
--    hasn't ended yet, it ALSO removes any previously auto-created no_show row.
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
      IF now() < end_of_day THEN
        -- Shift not over yet: also remove any premature auto no_show row.
        DELETE FROM attendance_absences
         WHERE employee_id = _employee_id
           AND date = _date
           AND status = 'no_show'
           AND notes = 'נוצר אוטומטית - לא דווחה כניסה';
        DELETE FROM notifications
         WHERE type = 'missing_attendance'
           AND entity_type = 'employee_absence'
           AND entity_id = _employee_id
           AND title LIKE '%' || to_char(_date, 'DD/MM/YYYY') || '%';
        RETURN;
      END IF;
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