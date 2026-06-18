
DROP POLICY IF EXISTS "Auth read client_contacts" ON public.client_contacts;
CREATE POLICY "Read client_contacts" ON public.client_contacts FOR SELECT TO authenticated
USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_clients'));

DROP POLICY IF EXISTS "Auth read client_metrics" ON public.client_monthly_metrics;
CREATE POLICY "Read client_metrics" ON public.client_monthly_metrics FOR SELECT TO authenticated
USING (is_admin_or_owner(auth.uid()));

DROP POLICY IF EXISTS "Auth read employee_metrics" ON public.employee_monthly_metrics;
CREATE POLICY "Read employee_metrics" ON public.employee_monthly_metrics FOR SELECT TO authenticated
USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_payroll'));

DROP POLICY IF EXISTS "Auth read employees" ON public.employees;
CREATE POLICY "Read employees" ON public.employees FOR SELECT TO authenticated
USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_employees'));

DROP POLICY IF EXISTS "Auth read invoice_payments" ON public.invoice_payments;
CREATE POLICY "Read invoice_payments" ON public.invoice_payments FOR SELECT TO authenticated
USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'add_payments'));

DROP POLICY IF EXISTS "Auth read meckano_raw" ON public.meckano_attendance_raw;
CREATE POLICY "Read meckano_raw" ON public.meckano_attendance_raw FOR SELECT TO authenticated
USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_hours'));

DROP POLICY IF EXISTS "Auth read payroll_items" ON public.payroll_items;
CREATE POLICY "Read payroll_items" ON public.payroll_items FOR SELECT TO authenticated
USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_payroll'));

DROP POLICY IF EXISTS "Auth read payroll_payments" ON public.payroll_payments;
CREATE POLICY "Read payroll_payments" ON public.payroll_payments FOR SELECT TO authenticated
USING (is_admin_or_owner(auth.uid()) OR has_permission(auth.uid(), 'edit_payroll'));

DROP POLICY IF EXISTS "Auth read whatsapp_logs" ON public.whatsapp_message_logs;
DROP POLICY IF EXISTS "Authenticated can read whatsapp_message_logs" ON public.whatsapp_message_logs;
CREATE POLICY "Read whatsapp_logs" ON public.whatsapp_message_logs FOR SELECT TO authenticated
USING (is_admin_or_owner(auth.uid()));
