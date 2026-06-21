DROP POLICY IF EXISTS "Read employees" ON public.employees;
CREATE POLICY "Read employees basic" ON public.employees FOR SELECT TO authenticated USING (true);