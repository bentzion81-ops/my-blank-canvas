CREATE OR REPLACE FUNCTION public.record_payroll_payment(
  _month date,
  _employee_id uuid,
  _amount numeric,
  _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user uuid := auth.uid();
  _run_id uuid;
  _item_id uuid;
  _payment_id uuid;
BEGIN
  IF _user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.is_admin_or_owner(_user) OR public.has_permission(_user, 'edit_payroll')) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  SELECT id INTO _run_id FROM public.payroll_runs WHERE month = _month LIMIT 1;
  IF _run_id IS NULL THEN
    INSERT INTO public.payroll_runs (month) VALUES (_month) RETURNING id INTO _run_id;
  END IF;

  SELECT id INTO _item_id FROM public.payroll_items
    WHERE payroll_run_id = _run_id AND employee_id = _employee_id LIMIT 1;
  IF _item_id IS NULL THEN
    INSERT INTO public.payroll_items (payroll_run_id, employee_id)
    VALUES (_run_id, _employee_id) RETURNING id INTO _item_id;
  END IF;

  INSERT INTO public.payroll_payments (payroll_item_id, amount, payment_date, notes)
  VALUES (_item_id, _amount, CURRENT_DATE, _notes)
  RETURNING id INTO _payment_id;

  RETURN _payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_payroll_payment(date, uuid, numeric, text) TO authenticated;