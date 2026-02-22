-- Friends-of-friends interest check visibility
-- Expands check visibility from 1-hop (direct friends) to 2-hop (friends of friends).
-- Uses SECURITY DEFINER to bypass friendships RLS at the second hop,
-- following the existing is_squad_member() pattern.

-- 1a. Helper: is_friend_or_fof(viewer, author) → boolean
CREATE OR REPLACE FUNCTION public.is_friend_or_fof(p_viewer UUID, p_author UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    -- Direct friend
    SELECT 1 FROM public.friendships f1
    WHERE f1.status = 'accepted'
    AND (
      (f1.requester_id = p_viewer AND f1.addressee_id = p_author) OR
      (f1.addressee_id = p_viewer AND f1.requester_id = p_author)
    )
  )
  OR EXISTS (
    -- Friend-of-friend: viewer↔mutual, mutual↔author
    SELECT 1 FROM public.friendships f1
    JOIN public.friendships f2 ON (
      -- f2 connects the mutual friend to the author
      (f2.requester_id = CASE WHEN f1.requester_id = p_viewer THEN f1.addressee_id ELSE f1.requester_id END AND f2.addressee_id = p_author) OR
      (f2.addressee_id = CASE WHEN f1.requester_id = p_viewer THEN f1.addressee_id ELSE f1.requester_id END AND f2.requester_id = p_author)
    )
    WHERE f1.status = 'accepted'
    AND f2.status = 'accepted'
    AND (f1.requester_id = p_viewer OR f1.addressee_id = p_viewer)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 1b. Replace interest_checks SELECT policy
DROP POLICY IF EXISTS "Interest checks visible to friends" ON public.interest_checks;
DROP POLICY IF EXISTS "Interest checks visible to friends and fof" ON public.interest_checks;
CREATE POLICY "Interest checks visible to friends and fof" ON public.interest_checks
  FOR SELECT USING (
    author_id = auth.uid()
    OR public.is_friend_or_fof(auth.uid(), author_id)
  );

-- 1c. Replace check_responses SELECT policy
DROP POLICY IF EXISTS "Responses visible to check participants" ON public.check_responses;
DROP POLICY IF EXISTS "Responses visible to check participants and fof" ON public.check_responses;
CREATE POLICY "Responses visible to check participants and fof" ON public.check_responses
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_responses.check_id
      AND (
        ic.author_id = auth.uid()
        OR public.is_friend_or_fof(auth.uid(), ic.author_id)
      )
    )
  );

-- 1d. RPC: get_fof_check_annotations() → table of (check_id, via_friend_name)
-- Returns one mutual-friend name per FoF check (excludes own + direct-friend checks).
CREATE OR REPLACE FUNCTION public.get_fof_check_annotations()
RETURNS TABLE(check_id UUID, via_friend_name TEXT) AS $$
  SELECT DISTINCT ON (ic.id)
    ic.id AS check_id,
    mutual.display_name AS via_friend_name
  FROM public.interest_checks ic
  -- Only active checks
  JOIN LATERAL (SELECT 1 WHERE ic.expires_at IS NULL OR ic.expires_at > now()) alive ON true
  -- Not your own check
  JOIN LATERAL (SELECT 1 WHERE ic.author_id <> auth.uid()) notmine ON true
  -- No direct friendship with author
  JOIN LATERAL (
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM public.friendships df
      WHERE df.status = 'accepted'
      AND (
        (df.requester_id = auth.uid() AND df.addressee_id = ic.author_id) OR
        (df.addressee_id = auth.uid() AND df.requester_id = ic.author_id)
      )
    )
  ) notdirect ON true
  -- Find mutual friend: viewer↔mutual, mutual↔author
  JOIN public.friendships f1 ON f1.status = 'accepted'
    AND (f1.requester_id = auth.uid() OR f1.addressee_id = auth.uid())
  JOIN public.friendships f2 ON f2.status = 'accepted'
    AND (f2.requester_id = ic.author_id OR f2.addressee_id = ic.author_id)
    AND (
      CASE WHEN f1.requester_id = auth.uid() THEN f1.addressee_id ELSE f1.requester_id END
      =
      CASE WHEN f2.requester_id = ic.author_id THEN f2.addressee_id ELSE f2.requester_id END
    )
  JOIN public.profiles mutual ON mutual.id = (
    CASE WHEN f1.requester_id = auth.uid() THEN f1.addressee_id ELSE f1.requester_id END
  )
  ORDER BY ic.id, mutual.display_name
$$ LANGUAGE sql SECURITY DEFINER STABLE;
