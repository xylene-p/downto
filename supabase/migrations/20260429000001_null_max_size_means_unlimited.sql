-- Treat NULL max_squad_size as "no cap" everywhere.
--
-- "∞" at create time → max_squad_size = NULL in interest_checks. But every
-- code path that compared against max_squad_size used a plain
-- `count < max_size` predicate, and Postgres's three-valued logic makes
-- `count < NULL` evaluate to NULL — never TRUE. So the "if room" branches
-- never fired for unlimited squads, and every late-joining responder
-- silently fell into the ELSE branch and got role='waitlist'.
--
-- Surfaced on prod for the "5k bakery roulette" mystery check (squad
-- 77b17e93…): max_squad_size NULL, four down responders, but only the
-- author + the responder who tripped the create-trigger ended up as
-- 'member'. The two later responders sat in 'waitlist' even though the
-- squad explicitly had no cap. The settings modal then wouldn't show
-- them in the active members list.
--
-- Three places touched:
--   1. auto_join_squad_on_down_response  (added the waitlist branch in
--      20260326000003)
--   2. auto_squad_on_event_down          (event-side equivalent, also
--      20260326000003 — its `COALESCE(v_max_size, 20)` capped unlimited
--      at 20 which is wrong in the other direction)
--   3. join_squad_if_room                (RPC from 20260303000001)
--
-- Plus a pending bug in auto_create_squad_on_first_other_down (the
-- 20260428000002 follow-up to PR #491) that uses
-- `LIMIT COALESCE(v_max_size, 5)` — would cap unlimited squads at 5
-- members on creation. Patched here so the moment that migration lands
-- on prod, it lands fixed.
--
-- Backfill: promote currently-waitlisted members on unlimited squads to
-- 'member' so the existing prod state is consistent with the new logic.

-- ── 1. auto_join_squad_on_down_response ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_join_squad_on_down_response()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_max_size INT;
  v_current_count INT;
BEGIN
  IF NEW.response != 'down' THEN RETURN NEW; END IF;

  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = NEW.check_id
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN NEW; END IF;

  SELECT ic.max_squad_size INTO v_max_size
  FROM public.interest_checks ic
  WHERE ic.id = NEW.check_id;

  SELECT COUNT(*) INTO v_current_count
  FROM public.squad_members
  WHERE squad_id = v_squad_id AND role = 'member';

  -- NULL max_size means "no cap" — always join as member.
  IF v_max_size IS NULL OR v_current_count < v_max_size THEN
    INSERT INTO public.squad_members (squad_id, user_id, role)
    VALUES (v_squad_id, NEW.user_id, 'member')
    ON CONFLICT (squad_id, user_id) DO NOTHING;
  ELSE
    INSERT INTO public.squad_members (squad_id, user_id, role)
    VALUES (v_squad_id, NEW.user_id, 'waitlist')
    ON CONFLICT (squad_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 2. auto_squad_on_event_down ──────────────────────────────────────────
-- Same fix on the event side. Also drop the `COALESCE(v_max_size, 20)`
-- which silently capped unlimited squads at 20 — keep the explicit IS NULL
-- check so "unlimited" really means unlimited.
CREATE OR REPLACE FUNCTION public.auto_squad_on_event_down()
RETURNS TRIGGER AS $$
DECLARE
  v_event_creator UUID;
  v_event_title TEXT;
  v_existing_squad_id UUID;
  v_new_squad_id UUID;
  v_is_friend BOOLEAN;
  v_creator_name TEXT;
  v_user_name TEXT;
  v_names TEXT;
  v_formation_msg TEXT;
  v_max_size INT;
  v_current_count INT;
BEGIN
  IF NOT NEW.is_down OR (OLD IS NOT NULL AND OLD.is_down) THEN
    RETURN NEW;
  END IF;

  SELECT created_by, title INTO v_event_creator, v_event_title
  FROM public.events WHERE id = NEW.event_id;

  IF v_event_creator IS NULL OR v_event_creator = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = NEW.user_id AND addressee_id = v_event_creator)
        OR (requester_id = v_event_creator AND addressee_id = NEW.user_id))
  ) INTO v_is_friend;

  IF NOT v_is_friend THEN
    RETURN NEW;
  END IF;

  SELECT s.id INTO v_existing_squad_id
  FROM public.squads s
  JOIN public.squad_members sm ON sm.squad_id = s.id
  WHERE s.event_id = NEW.event_id
    AND sm.user_id = v_event_creator
  LIMIT 1;

  SELECT display_name INTO v_creator_name FROM public.profiles WHERE id = v_event_creator;
  SELECT display_name INTO v_user_name FROM public.profiles WHERE id = NEW.user_id;
  v_creator_name := COALESCE(v_creator_name, 'Someone');
  v_user_name := COALESCE(v_user_name, 'Someone');

  IF v_existing_squad_id IS NOT NULL THEN
    -- Pull the cap from the linked check (if any). Leaving v_max_size NULL
    -- when the squad has no linked check OR the check has no cap means
    -- "no cap" — drop the old COALESCE-to-20 sentinel.
    SELECT ic.max_squad_size INTO v_max_size
    FROM public.squads s
    LEFT JOIN public.interest_checks ic ON ic.id = s.check_id
    WHERE s.id = v_existing_squad_id;

    SELECT COUNT(*) INTO v_current_count
    FROM public.squad_members
    WHERE squad_id = v_existing_squad_id AND role = 'member';

    IF NOT EXISTS (
      SELECT 1 FROM public.squad_members
      WHERE squad_id = v_existing_squad_id AND user_id = NEW.user_id
    ) THEN
      IF v_max_size IS NULL OR v_current_count < v_max_size THEN
        INSERT INTO public.squad_members (squad_id, user_id, role)
        VALUES (v_existing_squad_id, NEW.user_id, 'member');
      ELSE
        INSERT INTO public.squad_members (squad_id, user_id, role)
        VALUES (v_existing_squad_id, NEW.user_id, 'waitlist');
      END IF;

      INSERT INTO public.messages (squad_id, sender_id, text, is_system)
      VALUES (v_existing_squad_id, NULL, v_user_name || ' joined the squad', TRUE);

      INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
      VALUES (
        NEW.user_id,
        'squad_invite',
        COALESCE(v_event_title, 'Event') || ' squad',
        'You''ve been added to the squad',
        v_existing_squad_id
      );
    END IF;
  ELSE
    -- No squad yet: create one with creator + this user.
    v_event_title := COALESCE(v_event_title, 'Event');

    INSERT INTO public.squads (name, event_id, created_by)
    VALUES (LEFT(v_event_title, 30), NEW.event_id, v_event_creator)
    RETURNING id INTO v_new_squad_id;

    INSERT INTO public.squad_members (squad_id, user_id)
    VALUES (v_new_squad_id, v_event_creator), (v_new_squad_id, NEW.user_id);

    v_names := v_creator_name || ' and ' || v_user_name;
    v_formation_msg := public.pick_squad_formation_message(v_names, v_event_title);

    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_new_squad_id, NULL, v_formation_msg, TRUE);

    INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
    VALUES (
      NEW.user_id,
      'squad_invite',
      v_event_title || ' squad',
      'You''ve been added to the squad with ' || v_creator_name,
      v_new_squad_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 3. join_squad_if_room ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_squad_if_room(p_squad_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_id UUID;
  v_max_size INT;
  v_current_count INT;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT s.check_id INTO v_check_id
  FROM squads s WHERE s.id = p_squad_id;

  IF v_check_id IS NULL THEN
    INSERT INTO squad_members (squad_id, user_id, role)
    VALUES (p_squad_id, v_user_id, 'member')
    ON CONFLICT (squad_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('status', 'joined');
  END IF;

  SELECT ic.max_squad_size INTO v_max_size
  FROM interest_checks ic WHERE ic.id = v_check_id;

  SELECT COUNT(*) INTO v_current_count
  FROM squad_members
  WHERE squad_id = p_squad_id AND role = 'member';

  -- NULL max_size means "no cap" — always join as member.
  IF v_max_size IS NULL OR v_current_count < v_max_size THEN
    INSERT INTO squad_members (squad_id, user_id, role)
    VALUES (p_squad_id, v_user_id, 'member')
    ON CONFLICT (squad_id, user_id) DO NOTHING;
    RETURN jsonb_build_object('status', 'joined');
  END IF;

  INSERT INTO squad_members (squad_id, user_id, role)
  VALUES (p_squad_id, v_user_id, 'waitlist')
  ON CONFLICT (squad_id, user_id) DO NOTHING;
  RETURN jsonb_build_object('status', 'waitlisted');
END;
$$;


-- ── 4. auto_create_squad_on_first_other_down ─────────────────────────────
-- Fix the LIMIT in the membership backfill query: COALESCE(v_max_size, 5)
-- capped unlimited squads at 5 members on creation. PostgreSQL treats
-- LIMIT NULL as "no limit", so passing v_max_size directly does the right
-- thing for both finite caps and unlimited.
CREATE OR REPLACE FUNCTION public.auto_create_squad_on_first_other_down()
RETURNS TRIGGER AS $$
DECLARE
  v_check_id UUID := NEW.check_id;
  v_author_id UUID;
  v_check_text TEXT;
  v_max_size INT;
  v_squad_name TEXT;
  v_existing_squad_id UUID;
  v_existing_archived_squad_id UUID;
  v_squad_id UUID;
  v_opener TEXT;
BEGIN
  IF NEW.response != 'down' THEN
    RETURN NEW;
  END IF;

  SELECT author_id, text, max_squad_size INTO v_author_id, v_check_text, v_max_size
  FROM public.interest_checks
  WHERE id = v_check_id;

  IF NEW.user_id = v_author_id THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_existing_squad_id
  FROM public.squads
  WHERE check_id = v_check_id
    AND archived_at IS NULL
  LIMIT 1;
  IF v_existing_squad_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_existing_archived_squad_id
  FROM public.squads
  WHERE check_id = v_check_id
    AND archived_at IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing_archived_squad_id IS NOT NULL THEN
    UPDATE public.squads
      SET archived_at = NULL
      WHERE id = v_existing_archived_squad_id;
    INSERT INTO public.squad_members (squad_id, user_id)
    VALUES (v_existing_archived_squad_id, NEW.user_id)
    ON CONFLICT (squad_id, user_id) DO NOTHING;
    RETURN NEW;
  END IF;

  v_squad_name := SUBSTRING(COALESCE(v_check_text, 'squad') FROM 1 FOR 30);
  IF char_length(COALESCE(v_check_text, '')) > 30 THEN
    v_squad_name := v_squad_name || '...';
  END IF;

  INSERT INTO public.squads (name, check_id, created_by)
  VALUES (v_squad_name, v_check_id, NEW.user_id)
  RETURNING id INTO v_squad_id;

  -- LIMIT v_max_size — when v_max_size is NULL ("∞"), Postgres treats
  -- that as "no limit" and inserts every candidate. Finite caps work
  -- the same as before.
  INSERT INTO public.squad_members (squad_id, user_id, role)
  SELECT v_squad_id, t.user_id, 'member'
  FROM (
    SELECT v_author_id AS user_id, NULL::timestamptz AS responded_at, 0 AS rank
    UNION ALL
    SELECT user_id, created_at, 1 AS rank
    FROM public.check_responses
    WHERE check_id = v_check_id
      AND response = 'down'
      AND user_id <> v_author_id
    ORDER BY rank, responded_at
  ) t
  LIMIT v_max_size
  ON CONFLICT (squad_id, user_id) DO NOTHING;

  v_opener := (ARRAY[
    'i cleared my schedule. i didn''t have anything but still',
    'already mentally there tbh',
    'just cancelled plans i didn''t have for this',
    'mentally i''m already there waiting for you guys',
    'if anyone flakes i''m airing it out',
    'screenshot taken. evidence logged.',
    'flaking is a federal offense btw',
    'historians will write about this squad',
    'main character energy activated',
    'cool. no turning back now',
    'well that happened fast',
    'anyway i''m already dressed',
    'ok bet',
    'LETS GOOOOO',
    'oh this is gonna be unhinged',
    'everybody act normal',
    'this energy is immaculate'
  ])[1 + floor(random() * 17)::int];

  INSERT INTO public.messages (squad_id, sender_id, text)
  VALUES (v_squad_id, NEW.user_id, v_opener);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 5. Backfill: promote waitlisted members on unlimited squads ─────────
-- Existing rows where role='waitlist' on an unlimited squad were
-- mis-routed by the buggy logic above. Promote them to 'member' so the
-- prod state is consistent with the new rules.
UPDATE public.squad_members sm
SET role = 'member'
FROM public.squads s
LEFT JOIN public.interest_checks ic ON ic.id = s.check_id
WHERE sm.squad_id = s.id
  AND sm.role = 'waitlist'
  AND ic.max_squad_size IS NULL;
