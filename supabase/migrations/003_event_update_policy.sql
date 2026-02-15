CREATE POLICY "Users can update own events" ON public.events
  FOR UPDATE USING (created_by = auth.uid());
