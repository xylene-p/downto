-- Fix: when the auto-create trigger forms the squad, enroll every existing
-- "down" responder, not just the one whose insert tripped it.
--
-- 20260426000003 introduced auto_create_squad_on_first_other_down which
-- creates the squad with author + NEW.user_id as members. The companion
-- auto_join_squad_on_down_response trigger from 20260217000008 keeps
-- adding *new* responders after that point. But responders who tapped
-- "down" before the squad existed (which is the common case when the
-- trigger gets installed after some checks already have responders, or
-- when prior responses don't trip another INSERT) get stranded outside
-- the squad — they appear in the down list but aren't squad members.
--
-- Surfaced on prod for check 929bbf42…: 3 down responders, squad formed
-- by the third, only the third + author landed in squad_members. Backfilled
-- the missing two by hand on the prod row; this migration prevents it
-- recurring.
--
-- Fix is local to the trigger: replace the two-row INSERT with a query
-- that grabs the author + every current down responder, capped at the
-- check's max_squad_size, ordered by response time so the earliest
-- engaged people get priority if the cap is tight.

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

  -- Author tapping down on their own check doesn't form a squad — author is
  -- implicit, we need at least one OTHER person down.
  IF NEW.user_id = v_author_id THEN
    RETURN NEW;
  END IF;

  -- Skip if a non-archived squad already exists. The companion auto-join
  -- trigger will fold this responder in.
  SELECT id INTO v_existing_squad_id
  FROM public.squads
  WHERE check_id = v_check_id
    AND archived_at IS NULL
  LIMIT 1;
  IF v_existing_squad_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Reactivate an archived squad rather than spawning a duplicate.
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

  -- Enroll the author + every "down" responder that exists right now,
  -- ordered by response time (earliest engagement wins the slot if the
  -- cap is tight). Author has rank 0 so they always make the cut. The
  -- LIMIT applies after ordering, so a 5-cap squad with 7 prior down
  -- responders keeps author + first 4. ON CONFLICT covers the case where
  -- somehow a member row already exists (defense in depth — shouldn't
  -- happen since we just created the squad).
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
  LIMIT COALESCE(v_max_size, 5)
  ON CONFLICT (squad_id, user_id) DO NOTHING;

  -- Random opener so the squad chat doesn't open empty. Sender is
  -- NEW.user_id — the responder whose tap formed the squad.
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
