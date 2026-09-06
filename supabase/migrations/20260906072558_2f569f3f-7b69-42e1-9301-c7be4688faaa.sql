REVOKE ALL ON FUNCTION public.restore_deleted_row(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_log_delete_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_deleted_row(uuid) TO authenticated;