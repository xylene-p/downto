-- Allow friends to see each other's events (not just public + own)
DROP POLICY "Public events are viewable by everyone" ON public.events;
CREATE POLICY "Public events are viewable by everyone" ON public.events
  FOR SELECT USING (
    is_public = TRUE
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
      AND (
        (requester_id = auth.uid() AND addressee_id = events.created_by) OR
        (addressee_id = auth.uid() AND requester_id = events.created_by)
      )
    )
  );
