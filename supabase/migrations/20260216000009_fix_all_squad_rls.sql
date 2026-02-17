-- Update all policies that reference squad_members to use the
-- SECURITY DEFINER helper function, avoiding any RLS recursion issues.

-- Squads: visible to members
DROP POLICY IF EXISTS "Squads visible to members" ON public.squads;
CREATE POLICY "Squads visible to members" ON public.squads
  FOR SELECT USING (
    created_by = auth.uid()
    OR public.is_squad_member(id, auth.uid())
  );

-- Messages: visible to squad members
DROP POLICY IF EXISTS "Messages visible to squad members" ON public.messages;
CREATE POLICY "Messages visible to squad members" ON public.messages
  FOR SELECT USING (
    public.is_squad_member(squad_id, auth.uid())
  );

-- Messages: squad members can send
DROP POLICY IF EXISTS "Squad members can send messages" ON public.messages;
CREATE POLICY "Squad members can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND public.is_squad_member(squad_id, auth.uid())
  );
