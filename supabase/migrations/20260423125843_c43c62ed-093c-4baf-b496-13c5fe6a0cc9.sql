DROP POLICY IF EXISTS "Auth insert planned events" ON public.replacement_planned_events;
DROP POLICY IF EXISTS "Auth update planned events" ON public.replacement_planned_events;
DROP POLICY IF EXISTS "Auth delete planned events" ON public.replacement_planned_events;

CREATE POLICY "Auth insert planned events"
  ON public.replacement_planned_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth update planned events"
  ON public.replacement_planned_events FOR UPDATE
  TO authenticated USING (auth.uid() IS NOT NULL);

CREATE POLICY "Auth delete planned events"
  ON public.replacement_planned_events FOR DELETE
  TO authenticated USING (auth.uid() IS NOT NULL);