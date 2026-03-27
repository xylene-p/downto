-- Add a fun opener message from the event creator when auto-squad is created.
-- These appear as real user messages (not system), matching the client-side behavior.

CREATE OR REPLACE FUNCTION public.pick_squad_opener(p_title TEXT)
RETURNS TEXT AS $$
DECLARE
  -- ~25% chance to use the title
  title_openers TEXT[] := ARRAY[
    'I CANT WAIT TO ' || UPPER(p_title) || ' WITH YALL',
    'we are about to ' || p_title || ' SO HARD',
    p_title || ' isn''t ready for us',
    p_title || ' will never be the same after we''re done with it'
  ];
  generic_openers TEXT[] := ARRAY[
    'i cleared my schedule. i didn''t have anything but still',
    'i just told my mom i have plans',
    'already mentally there tbh',
    'i''m getting ready rn and idc if it''s in 3 days',
    'just cancelled plans i didn''t have for this',
    'i''ve been manifesting this exact hangout',
    'i already know what i''m wearing',
    'mentally i''m already there waiting for you guys',
    'if anyone flakes i''m airing it out',
    'screenshot taken. evidence logged.',
    'i have everyone''s location shared don''t even think about it',
    'flaking is a federal offense btw',
    'i will be checking in hourly until this happens',
    'i''m setting reminders for all of you don''t test me',
    'the universe aligned for this exact moment',
    'historians will write about this squad',
    'main character energy activated',
    'the prophecy has been fulfilled',
    'we were put on this earth for this moment',
    'this is our origin story',
    'cool. no turning back now',
    'well that happened fast',
    'anyway i''m already dressed',
    'so this is really happening huh',
    'ok bet',
    'noted. see you there i guess',
    'LETS GOOOOO',
    'oh this is gonna be unhinged',
    'everybody act normal',
    'nobody tell my therapist about this one',
    'this energy is immaculate',
    'i blacked out and now i''m in a squad'
  ];
BEGIN
  IF p_title IS NOT NULL AND random() < 0.25 THEN
    RETURN title_openers[1 + floor(random() * array_length(title_openers, 1))::int];
  END IF;
  RETURN generic_openers[1 + floor(random() * array_length(generic_openers, 1))::int];
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Update auto_squad_on_event_down to send opener from event creator
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
    SELECT ic.max_squad_size INTO v_max_size
    FROM public.squads s
    JOIN public.interest_checks ic ON ic.id = s.check_id
    WHERE s.id = v_existing_squad_id;
    v_max_size := COALESCE(v_max_size, 20);

    SELECT COUNT(*) INTO v_current_count
    FROM public.squad_members
    WHERE squad_id = v_existing_squad_id AND role = 'member';

    IF NOT EXISTS (
      SELECT 1 FROM public.squad_members
      WHERE squad_id = v_existing_squad_id AND user_id = NEW.user_id
    ) THEN
      IF v_current_count < v_max_size THEN
        INSERT INTO public.squad_members (squad_id, user_id, role)
        VALUES (v_existing_squad_id, NEW.user_id, 'member');
      ELSE
        INSERT INTO public.squad_members (squad_id, user_id, role)
        VALUES (v_existing_squad_id, NEW.user_id, 'waitlist');
      END IF;

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
    -- New squad: formation message + opener from creator
    v_event_title := COALESCE(v_event_title, 'Event');

    INSERT INTO public.squads (name, event_id, created_by)
    VALUES (LEFT(v_event_title, 30), NEW.event_id, v_event_creator)
    RETURNING id INTO v_new_squad_id;

    INSERT INTO public.squad_members (squad_id, user_id)
    VALUES (v_new_squad_id, v_event_creator), (v_new_squad_id, NEW.user_id);

    -- System formation message
    v_names := v_creator_name || ' and ' || v_user_name;
    v_formation_msg := public.pick_squad_formation_message(v_names, v_event_title);

    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_new_squad_id, NULL, v_formation_msg, TRUE);

    -- Fun opener from event creator (appears as their message)
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_new_squad_id, v_event_creator, public.pick_squad_opener(v_event_title), FALSE);

    INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
    VALUES
      (v_event_creator, 'squad_invite', v_event_title || ' squad', v_user_name || ' is down — squad formed!', v_new_squad_id),
      (NEW.user_id, 'squad_invite', v_event_title || ' squad', 'You and ' || v_creator_name || ' are squadded up', v_new_squad_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
