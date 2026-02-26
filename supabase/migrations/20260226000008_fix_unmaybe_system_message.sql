-- Fix: un-maybe (DELETE of a "maybe" response) was posting "got kicked from
-- the chat" system message. Only down→maybe (UPDATE) and down→un-down (DELETE
-- of a "down" response) should trigger squad removal + system messages.

CREATE OR REPLACE FUNCTION public.auto_leave_squad_on_check_response_change()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_user_id UUID;
  v_check_id UUID;
  v_display_name TEXT;
  v_remaining INT;
BEGIN
  -- Determine user/check based on trigger op
  IF TG_OP = 'DELETE' THEN
    -- Only act when the deleted response was "down"
    IF OLD.response != 'down' THEN
      RETURN OLD;
    END IF;
    v_user_id := OLD.user_id;
    v_check_id := OLD.check_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only act when changing AWAY from "down"
    IF OLD.response != 'down' OR NEW.response = 'down' THEN
      RETURN NEW;
    END IF;
    v_user_id := OLD.user_id;
    v_check_id := OLD.check_id;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Find squad linked to this check
  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = v_check_id AND s.archived_at IS NULL
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Remove user from squad
  DELETE FROM public.squad_members
  WHERE squad_id = v_squad_id AND user_id = v_user_id;

  -- Look up display name for system message
  SELECT p.display_name INTO v_display_name
  FROM public.profiles p WHERE p.id = v_user_id;

  -- Different message for un-down (DELETE) vs down→maybe (UPDATE)
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_squad_id, NULL, v_display_name || ' left the squad', TRUE);
  ELSE
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_squad_id, NULL, v_display_name || ' is now a maybe. bye ' || v_display_name, TRUE);
  END IF;

  -- Count remaining members
  SELECT COUNT(*) INTO v_remaining
  FROM public.squad_members WHERE squad_id = v_squad_id;

  IF v_remaining = 1 THEN
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_squad_id, NULL,
      'You''re the last one here — invite more people or this squad will dissolve', TRUE);
  ELSIF v_remaining = 0 THEN
    DELETE FROM public.squads WHERE id = v_squad_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
