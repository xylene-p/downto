-- ============================================================================
-- Missing indexes and RPC auth.uid() optimization
-- ============================================================================

-- 1. squads.check_id — used by getSquadByCheckId()
CREATE INDEX IF NOT EXISTS idx_squads_check ON public.squads(check_id) WHERE check_id IS NOT NULL;

-- 2. crew_pool.user_id — used by leaveCrewPool(), getUserPoolEventIds()
CREATE INDEX IF NOT EXISTS idx_crew_pool_user ON public.crew_pool(user_id);

-- 3. notifications(user_id, related_squad_id) — used by markSquadNotificationsRead()
CREATE INDEX IF NOT EXISTS idx_notifications_squad_unread
  ON public.notifications(user_id, related_squad_id) WHERE is_read = FALSE;

-- 4. pg_trgm for ILIKE search on profiles
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm ON public.profiles USING GIN (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm ON public.profiles USING GIN (display_name gin_trgm_ops);

-- 5. Rewrite get_fof_check_annotations() to evaluate auth.uid() once via CTE
CREATE OR REPLACE FUNCTION public.get_fof_check_annotations()
RETURNS TABLE(check_id UUID, via_friend_name TEXT) AS $$
  WITH me AS (SELECT auth.uid() AS uid)
  SELECT DISTINCT ON (ic.id)
    ic.id AS check_id,
    mutual.display_name AS via_friend_name
  FROM public.interest_checks ic
  CROSS JOIN me
  -- Only active checks
  JOIN LATERAL (SELECT 1 WHERE ic.expires_at IS NULL OR ic.expires_at > now()) alive ON true
  -- Not your own check
  JOIN LATERAL (SELECT 1 WHERE ic.author_id <> me.uid) notmine ON true
  -- No direct friendship with author
  JOIN LATERAL (
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM public.friendships df
      WHERE df.status = 'accepted'
      AND (
        (df.requester_id = me.uid AND df.addressee_id = ic.author_id) OR
        (df.addressee_id = me.uid AND df.requester_id = ic.author_id)
      )
    )
  ) notdirect ON true
  -- Find mutual friend: viewer↔mutual, mutual↔author
  JOIN public.friendships f1 ON f1.status = 'accepted'
    AND (f1.requester_id = me.uid OR f1.addressee_id = me.uid)
  JOIN public.friendships f2 ON f2.status = 'accepted'
    AND (f2.requester_id = ic.author_id OR f2.addressee_id = ic.author_id)
    AND (
      CASE WHEN f1.requester_id = me.uid THEN f1.addressee_id ELSE f1.requester_id END
      =
      CASE WHEN f2.requester_id = ic.author_id THEN f2.addressee_id ELSE f2.requester_id END
    )
  JOIN public.profiles mutual ON mutual.id = (
    CASE WHEN f1.requester_id = me.uid THEN f1.addressee_id ELSE f1.requester_id END
  )
  ORDER BY ic.id, mutual.display_name
$$ LANGUAGE sql SECURITY DEFINER STABLE;
