CREATE OR REPLACE FUNCTION public.trg_log_delete_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _log_id uuid;
BEGIN
  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, metadata)
  VALUES (auth.uid(), TG_TABLE_NAME, OLD.id, 'delete', jsonb_build_object('deleted_at', now()))
  RETURNING id INTO _log_id;

  INSERT INTO public.change_snapshots (audit_log_id, entity_type, entity_id, snapshot_data)
  VALUES (_log_id, TG_TABLE_NAME, OLD.id, to_jsonb(OLD));

  RETURN OLD;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_records','replacement_reports','replacement_planned_events','attendance_absences','employees','clients','employee_client_assignments']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS log_delete_snapshot ON public.%I', t);
    EXECUTE format('CREATE TRIGGER log_delete_snapshot BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_log_delete_snapshot()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.restore_deleted_row(_snapshot_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _snap public.change_snapshots;
  _allowed text[] := ARRAY['attendance_records','replacement_reports','replacement_planned_events','attendance_absences','employees','clients','employee_client_assignments'];
BEGIN
  IF NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO _snap FROM public.change_snapshots WHERE id = _snapshot_id;
  IF _snap.id IS NULL THEN
    RAISE EXCEPTION 'snapshot not found';
  END IF;
  IF NOT (_snap.entity_type = ANY(_allowed)) THEN
    RAISE EXCEPTION 'restore not supported for %', _snap.entity_type;
  END IF;

  EXECUTE format(
    'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT DO NOTHING',
    _snap.entity_type, _snap.entity_type
  ) USING _snap.snapshot_data;

  INSERT INTO public.audit_logs (user_id, entity_type, entity_id, action, metadata)
  VALUES (auth.uid(), _snap.entity_type, _snap.entity_id, 'restore', jsonb_build_object('snapshot_id', _snapshot_id));

  RETURN _snap.entity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_deleted_row(uuid) TO authenticated;