-- Table: no_work_periods
CREATE TABLE public.no_work_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('employee','client')),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL,
  reason text NOT NULL DEFAULT 'no_work',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date),
  CHECK (
    (scope = 'employee' AND employee_id IS NOT NULL AND client_id IS NULL)
    OR (scope = 'client' AND client_id IS NOT NULL AND employee_id IS NULL)
  )
);

CREATE INDEX idx_no_work_periods_employee ON public.no_work_periods(employee_id, from_date, to_date);
CREATE INDEX idx_no_work_periods_client ON public.no_work_periods(client_id, from_date, to_date);

ALTER TABLE public.no_work_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read no_work_periods" ON public.no_work_periods
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manage no_work_periods insert" ON public.no_work_periods
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

CREATE POLICY "Manage no_work_periods update" ON public.no_work_periods
  FOR UPDATE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

CREATE POLICY "Manage no_work_periods delete" ON public.no_work_periods
  FOR DELETE TO authenticated
  USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

CREATE TRIGGER trg_no_work_periods_updated_at
  BEFORE UPDATE ON public.no_work_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function: apply a no_work_period to existing absences (mark as 'no_work')
CREATE OR REPLACE FUNCTION public.apply_no_work_period(_period_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  affected int := 0;
BEGIN
  SELECT * INTO p FROM no_work_periods WHERE id = _period_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF p.scope = 'employee' THEN
    -- Update existing absences for this employee in range -> no_work
    UPDATE attendance_absences
       SET status = 'no_work',
           notes = COALESCE(notes,'') || CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE ' | ' END
                   || 'אין עבודה: ' || COALESCE(p.notes, p.reason),
           updated_at = now()
     WHERE employee_id = p.employee_id
       AND date BETWEEN p.from_date AND p.to_date
       AND status <> 'no_work';
    GET DIAGNOSTICS affected = ROW_COUNT;

    -- Clear missing_attendance notifications in range for this employee
    DELETE FROM notifications
     WHERE type = 'missing_attendance'
       AND entity_type = 'employee_absence'
       AND entity_id = p.employee_id
       AND created_at::date BETWEEN p.from_date AND p.to_date + 2;

  ELSIF p.scope = 'client' THEN
    -- Find employees assigned to this client during the range and mark their absences
    UPDATE attendance_absences a
       SET status = 'no_work',
           notes = COALESCE(a.notes,'') || CASE WHEN COALESCE(a.notes,'') = '' THEN '' ELSE ' | ' END
                   || 'אין עבודה אצל לקוח: ' || COALESCE(p.notes, p.reason),
           updated_at = now()
      FROM employee_client_assignments eca
     WHERE eca.employee_id = a.employee_id
       AND eca.client_id = p.client_id
       AND a.date BETWEEN p.from_date AND p.to_date
       AND (eca.start_date IS NULL OR eca.start_date <= a.date)
       AND (eca.end_date IS NULL OR eca.end_date >= a.date)
       AND a.status <> 'no_work';
    GET DIAGNOSTICS affected = ROW_COUNT;
  END IF;

  RETURN affected;
END;
$$;

-- Trigger: auto-apply on insert
CREATE OR REPLACE FUNCTION public.trg_apply_no_work_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.apply_no_work_period(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_no_work_periods_apply
  AFTER INSERT ON public.no_work_periods
  FOR EACH ROW EXECUTE FUNCTION public.trg_apply_no_work_period();

-- Update check_employee_absence to skip dates covered by a no_work_period
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

  -- Skip if employee or any of their assigned clients are in a no_work_period for this date
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

  SELECT * INTO expected FROM employee_expected_hours
  WHERE employee_id = _employee_id AND day_type = dtype;
  has_expected := FOUND;

  IF has_expected THEN
    IF NOT expected.is_working_day THEN RETURN; END IF;
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