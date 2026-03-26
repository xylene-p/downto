-- Remove "joined the squad" system message from auto_squad_on_event_down.
-- The squad invite notification is sufficient.

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
    VALUES
      (v_event_creator, 'squad_invite', v_event_title || ' squad', v_user_name || ' is down — squad formed!', v_new_squad_id),
      (NEW.user_id, 'squad_invite', v_event_title || ' squad', 'You and ' || v_creator_name || ' are squadded up', v_new_squad_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
