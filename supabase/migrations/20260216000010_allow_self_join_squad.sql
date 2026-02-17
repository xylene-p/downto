-- Allow users to add themselves to a squad (for late joiners)
DROP POLICY IF EXISTS "Squad creators can add members" ON public.squad_members;
CREATE POLICY "Squad creators or self can add members" ON public.squad_members
  FOR INSERT WITH CHECK (
    -- Squad creator can add anyone
    EXISTS (
      SELECT 1 FROM public.squads
      WHERE id = squad_members.squad_id AND created_by = auth.uid()
    )
    -- Or a user can add themselves
    OR user_id = auth.uid()
  );
