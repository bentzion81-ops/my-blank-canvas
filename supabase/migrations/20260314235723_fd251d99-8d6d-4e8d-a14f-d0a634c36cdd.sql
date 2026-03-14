
-- Fix audit_logs insert policy to scope to current user
DROP POLICY "Insert audit_logs" ON public.audit_logs;
CREATE POLICY "Insert audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Fix change_snapshots insert policy to require admin
DROP POLICY "Insert snapshots" ON public.change_snapshots;
CREATE POLICY "Insert snapshots" ON public.change_snapshots FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_owner(auth.uid()));
