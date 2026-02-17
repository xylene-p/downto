-- Allow users to remove themselves from a squad (leave squad)
DROP POLICY IF EXISTS "Users can leave squads" ON public.squad_members;
CREATE POLICY "Users can leave squads" ON public.squad_members
  FOR DELETE USING (user_id = auth.uid());
