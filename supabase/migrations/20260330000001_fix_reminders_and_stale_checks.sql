-- Fix three bugs:
-- 1. Event reminder timing uses UTC instead of America/New_York
-- 2. Reminder UPDATE on saved_events triggers event_down notifications
-- 3. Stale checks with past dates not auto-archived

-- =========================================================================
-- 1. Fix event_down trigger: only fire when is_down actually CHANGES
-- The current guard fires on any UPDATE where is_down=true, including
-- reminder updates that don't change is_down at all.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.notify_event_down()
RETURNS TRIGGER AS $$
DECLARE
  v_user_name TEXT;
  v_event_title TEXT;
  v_event_creator UUID;
  v_friend_id UUID;
BEGIN
  -- Only fire on actual is_down changes: INSERT with is_down=true, or UPDATE from false to true
  IF TG_OP = 'UPDATE' THEN
    -- Skip if is_down didn't change (e.g. reminder column updates)
    IF OLD.is_down = NEW.is_down THEN RETURN NEW; END IF;
    -- Skip if is_down changed to false (un-downing)
    IF NOT NEW.is_down THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NOT NEW.is_down THEN RETURN NEW; END IF;
  END IF;

  SELECT display_name INTO v_user_name
  FROM public.profiles WHERE id = NEW.user_id;

  SELECT title, created_by INTO v_event_title, v_event_creator
  FROM public.events WHERE id = NEW.event_id;

  v_user_name := COALESCE(v_user_name, 'Someone');
  v_event_title := COALESCE(v_event_title, 'an event');

  -- Notify event creator if friend
  IF v_event_creator IS NOT NULL
    AND v_event_creator != NEW.user_id
    AND EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
        AND ((requester_id = NEW.user_id AND addressee_id = v_event_creator)
          OR (requester_id = v_event_creator AND addressee_id = NEW.user_id))
    )
  THEN
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_event_id)
    VALUES (v_event_creator, 'event_down', v_user_name || ' is down', LEFT(v_event_title, 80), NEW.user_id, NEW.event_id);
  END IF;

  -- Notify other friends already down
  FOR v_friend_id IN
    SELECT se.user_id FROM public.saved_events se
    WHERE se.event_id = NEW.event_id AND se.is_down = true
      AND se.user_id != NEW.user_id
      AND se.user_id != COALESCE(v_event_creator, '00000000-0000-0000-0000-000000000000')
      AND EXISTS (
        SELECT 1 FROM public.friendships
        WHERE status = 'accepted'
          AND ((requester_id = NEW.user_id AND addressee_id = se.user_id)
            OR (requester_id = se.user_id AND addressee_id = NEW.user_id))
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_event_id)
    VALUES (v_friend_id, 'event_down', v_user_name || ' is also down', LEFT(v_event_title, 80), NEW.user_id, NEW.event_id);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Same fix for auto_squad trigger
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
  -- Only fire on actual is_down changes
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_down = NEW.is_down THEN RETURN NEW; END IF;
    IF NOT NEW.is_down THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NOT NEW.is_down THEN RETURN NEW; END IF;
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

  IF NOT v_is_friend THEN RETURN NEW; END IF;

  SELECT s.id INTO v_existing_squad_id
  FROM public.squads s
  JOIN public.squad_members sm ON sm.squad_id = s.id
  WHERE s.event_id = NEW.event_id AND sm.user_id = v_event_creator
  LIMIT 1;

  SELECT display_name INTO v_creator_name FROM public.profiles WHERE id = v_event_creator;
  SELECT display_name INTO v_user_name FROM public.profiles WHERE id = NEW.user_id;
  v_creator_name := COALESCE(v_creator_name, 'Someone');
  v_user_name := COALESCE(v_user_name, 'Someone');

  IF v_existing_squad_id IS NOT NULL THEN
    SELECT ic.max_squad_size INTO v_max_size
    FROM public.squads s JOIN public.interest_checks ic ON ic.id = s.check_id
    WHERE s.id = v_existing_squad_id;
    v_max_size := COALESCE(v_max_size, 20);

    SELECT COUNT(*) INTO v_current_count
    FROM public.squad_members WHERE squad_id = v_existing_squad_id AND role = 'member';

    IF NOT EXISTS (
      SELECT 1 FROM public.squad_members
      WHERE squad_id = v_existing_squad_id AND user_id = NEW.user_id
    ) THEN
      IF v_current_count < v_max_size THEN
        INSERT INTO public.squad_members (squad_id, user_id, role) VALUES (v_existing_squad_id, NEW.user_id, 'member');
      ELSE
        INSERT INTO public.squad_members (squad_id, user_id, role) VALUES (v_existing_squad_id, NEW.user_id, 'waitlist');
      END IF;

      INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
      VALUES (NEW.user_id, 'squad_invite', COALESCE(v_event_title, 'Event') || ' squad', 'You''ve been added to the squad', v_existing_squad_id);
    END IF;
  ELSE
    v_event_title := COALESCE(v_event_title, 'Event');
    INSERT INTO public.squads (name, event_id, created_by) VALUES (LEFT(v_event_title, 30), NEW.event_id, v_event_creator) RETURNING id INTO v_new_squad_id;
    INSERT INTO public.squad_members (squad_id, user_id) VALUES (v_new_squad_id, v_event_creator), (v_new_squad_id, NEW.user_id);

    v_names := v_creator_name || ' and ' || v_user_name;
    v_formation_msg := public.pick_squad_formation_message(v_names, v_event_title);
    INSERT INTO public.messages (squad_id, sender_id, text, is_system) VALUES (v_new_squad_id, NULL, v_formation_msg, TRUE);
    INSERT INTO public.messages (squad_id, sender_id, text, is_system) VALUES (v_new_squad_id, v_event_creator, public.pick_squad_opener(v_event_title), FALSE);

    INSERT INTO public.notifications (user_id, type, title, body, related_squad_id) VALUES
      (v_event_creator, 'squad_invite', v_event_title || ' squad', v_user_name || ' is down — squad formed!', v_new_squad_id),
      (NEW.user_id, 'squad_invite', v_event_title || ' squad', 'You and ' || v_creator_name || ' are squadded up', v_new_squad_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 2. Fix reminder timing: use America/New_York timezone
-- =========================================================================

CREATE OR REPLACE FUNCTION public.process_event_reminders()
RETURNS void AS $$
DECLARE
  r RECORD;
  event_ts TIMESTAMPTZ;
  hours_until DOUBLE PRECISION;
BEGIN
  FOR r IN
    SELECT
      se.id AS saved_id, se.user_id, se.event_id,
      se.reminded_24h_at, se.reminded_2h_at,
      e.title, e.date, e.time_display, e.venue,
      public.parse_event_start_hour(e.time_display) AS start_hour
    FROM public.saved_events se
    JOIN public.events e ON se.event_id = e.id
    WHERE e.date IS NOT NULL AND e.date >= CURRENT_DATE
      AND (se.reminded_24h_at IS NULL OR se.reminded_2h_at IS NULL)
  LOOP
    -- Build event timestamp in America/New_York (events are local NYC time)
    IF r.start_hour IS NOT NULL THEN
      event_ts := ((r.date || ' ' || LPAD(r.start_hour::TEXT, 2, '0') || ':00:00')::TIMESTAMP AT TIME ZONE 'America/New_York');
    ELSE
      event_ts := ((r.date || ' 12:00:00')::TIMESTAMP AT TIME ZONE 'America/New_York');
    END IF;

    hours_until := EXTRACT(EPOCH FROM (event_ts - NOW())) / 3600.0;

    IF r.reminded_24h_at IS NULL AND hours_until <= 24 AND hours_until > 0 THEN
      INSERT INTO public.notifications (user_id, type, title, body, related_event_id)
      VALUES (r.user_id, 'event_reminder', r.title,
        CASE
          WHEN r.venue IS NOT NULL AND r.venue != '' AND r.time_display IS NOT NULL AND r.time_display != '' AND r.time_display != 'TBD'
            THEN 'Tomorrow · ' || r.time_display || ' · ' || r.venue
          WHEN r.time_display IS NOT NULL AND r.time_display != '' AND r.time_display != 'TBD'
            THEN 'Tomorrow · ' || r.time_display
          ELSE 'Tomorrow'
        END,
        r.event_id);
      UPDATE public.saved_events SET reminded_24h_at = NOW() WHERE id = r.saved_id;
    END IF;

    IF r.reminded_2h_at IS NULL AND hours_until <= 2 AND hours_until > 0 THEN
      INSERT INTO public.notifications (user_id, type, title, body, related_event_id)
      VALUES (r.user_id, 'event_reminder', r.title,
        CASE WHEN r.venue IS NOT NULL AND r.venue != '' THEN 'Starting soon · ' || r.venue ELSE 'Starting soon' END,
        r.event_id);
      UPDATE public.saved_events SET reminded_2h_at = NOW() WHERE id = r.saved_id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 3. Auto-archive stale checks with past event dates
-- =========================================================================

UPDATE public.interest_checks
SET archived_at = NOW()
WHERE archived_at IS NULL
  AND event_date IS NOT NULL
  AND event_date < CURRENT_DATE;
