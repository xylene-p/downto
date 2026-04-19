-- Expand get_friends_events to include friends-of-friends creators.
--
-- Context: migration 20260324000001 already allows FoF to SELECT events with
-- visibility='friends' via RLS (using is_friend_or_fof). But the feed RPC
-- itself only fetched events where created_by IN (direct friends), so FoF
-- events never hit the feed. Parallel to the check FoF fix in 20260222200000.

CREATE OR REPLACE FUNCTION public.get_friends_events()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH friend_ids AS (
    SELECT CASE
      WHEN requester_id = (SELECT auth.uid()) THEN addressee_id
      ELSE requester_id
    END AS uid
    FROM public.friendships
    WHERE status = 'accepted'
      AND (requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid()))
  ),
  -- 2-hop: anyone who shares a friendship with one of my direct friends.
  -- (Includes me and my direct friends; filtered out below.)
  fof_ids AS (
    SELECT DISTINCT
      CASE
        WHEN f.requester_id IN (SELECT uid FROM friend_ids) THEN f.addressee_id
        ELSE f.requester_id
      END AS uid
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        f.requester_id IN (SELECT uid FROM friend_ids)
        OR f.addressee_id IN (SELECT uid FROM friend_ids)
      )
  ),
  visible_creators AS (
    SELECT uid FROM friend_ids
    UNION
    SELECT uid FROM fof_ids
  )
  SELECT COALESCE(jsonb_agg(row_data ORDER BY (row_data->>'date')), '[]'::jsonb)
  FROM (
    SELECT to_jsonb(e) || jsonb_build_object(
      'creator', jsonb_build_object(
        'display_name', p.display_name,
        'avatar_letter', p.avatar_letter
      )
    ) AS row_data
    FROM public.events e
    LEFT JOIN public.profiles p ON p.id = e.created_by
    WHERE e.created_by IN (SELECT uid FROM visible_creators)
      AND e.created_by <> (SELECT auth.uid())
      AND e.date >= CURRENT_DATE
  ) sub;
$$;

GRANT EXECUTE ON FUNCTION public.get_friends_events() TO authenticated;
