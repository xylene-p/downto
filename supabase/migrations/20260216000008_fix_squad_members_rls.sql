-- Fix infinite recursion in squad_members SELECT policy
-- The old policy queried squad_members from within squad_members RLS, causing recursion.
-- Fix: use a non-recursive check — user can see members of squads they created,
-- or members of squads where their own user_id row exists (checked via the row itself).
DROP POLICY IF EXISTS "Squad members visible to squad members" ON public.squad_members;
CREATE POLICY "Squad members visible to squad members" ON public.squad_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.squads s
      WHERE s.id = squad_members.squad_id
      AND s.created_by = auth.uid()
    )
  );

-- Also add: any squad member can see other members (use a security definer function to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_squad_member(p_squad_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.squad_members
    WHERE squad_id = p_squad_id AND user_id = p_user_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Replace with a policy that uses the security definer function
DROP POLICY IF EXISTS "Squad members visible to squad members" ON public.squad_members;
CREATE POLICY "Squad members visible to squad members" ON public.squad_members
  FOR SELECT USING (
    public.is_squad_member(squad_id, auth.uid())
  );
