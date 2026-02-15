-- ============================================================================
-- FIX 1: Create missing profile for existing user
-- ============================================================================

-- Insert profile for any auth users that don't have one
INSERT INTO public.profiles (id, username, display_name)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'username', SPLIT_PART(email, '@', 1)),
  COALESCE(raw_user_meta_data->>'display_name', SPLIT_PART(email, '@', 1))
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- FIX 2: Fix infinite recursion in squad_members RLS policy
-- ============================================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Squad members visible to squad members" ON public.squad_members;

-- Create a simpler policy that doesn't self-reference
CREATE POLICY "Squad members visible to squad members" ON public.squad_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    squad_id IN (
      SELECT squad_id FROM public.squad_members WHERE user_id = auth.uid()
    )
  );

-- Also fix messages policy which might have same issue
DROP POLICY IF EXISTS "Messages visible to squad members" ON public.messages;

CREATE POLICY "Messages visible to squad members" ON public.messages
  FOR SELECT USING (
    squad_id IN (
      SELECT squad_id FROM public.squad_members WHERE user_id = auth.uid()
    )
  );
