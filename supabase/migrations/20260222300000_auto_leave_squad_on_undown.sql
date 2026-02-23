-- Trigger: auto-remove user from squad when they un-down a check response
CREATE OR REPLACE FUNCTION public.auto_leave_squad_on_check_response_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_display_name TEXT;
  v_remaining INT;
BEGIN
  -- Find squad linked to this check
  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = OLD.check_id
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN OLD; END IF;

  -- Remove user from squad
  DELETE FROM public.squad_members
  WHERE squad_id = v_squad_id
    AND user_id = OLD.user_id;

  -- Look up display name for system message
  SELECT p.display_name INTO v_display_name
  FROM public.profiles p
  WHERE p.id = OLD.user_id;

  -- Post "{name} left the squad" system message
  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (v_squad_id, NULL, v_display_name || ' left the squad', TRUE);

  -- Count remaining members
  SELECT COUNT(*) INTO v_remaining
  FROM public.squad_members
  WHERE squad_id = v_squad_id;

  IF v_remaining = 1 THEN
    -- Warn the last member
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_squad_id, NULL,
      'You''re the last one here — invite more people or this squad will dissolve', TRUE);
  ELSIF v_remaining = 0 THEN
    -- No one left, delete the squad (cascade deletes messages + members)
    DELETE FROM public.squads WHERE id = v_squad_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_check_response_delete_auto_leave
  AFTER DELETE ON public.check_responses
  FOR EACH ROW EXECUTE FUNCTION public.auto_leave_squad_on_check_response_delete();


-- Trigger: auto-remove user from squad AND crew pool when they un-down an event
CREATE OR REPLACE FUNCTION public.auto_leave_squad_on_event_undown()
RETURNS TRIGGER AS $$
DECLARE
  v_squad RECORD;
  v_display_name TEXT;
  v_remaining INT;
BEGIN
  -- Only act when is_down changes from true to false
  IF OLD.is_down = true AND NEW.is_down = false THEN

    -- Look up display name once
    SELECT p.display_name INTO v_display_name
    FROM public.profiles p
    WHERE p.id = OLD.user_id;

    -- Loop over each squad linked to this event
    FOR v_squad IN
      SELECT s.id FROM public.squads s WHERE s.event_id = OLD.event_id
    LOOP
      -- Remove user from this squad
      DELETE FROM public.squad_members
      WHERE squad_id = v_squad.id
        AND user_id = OLD.user_id;

      -- Post "{name} left the squad" system message
      INSERT INTO public.messages (squad_id, sender_id, text, is_system)
      VALUES (v_squad.id, NULL, v_display_name || ' left the squad', TRUE);

      -- Count remaining members
      SELECT COUNT(*) INTO v_remaining
      FROM public.squad_members
      WHERE squad_id = v_squad.id;

      IF v_remaining = 1 THEN
        INSERT INTO public.messages (squad_id, sender_id, text, is_system)
        VALUES (v_squad.id, NULL,
          'You''re the last one here — invite more people or this squad will dissolve', TRUE);
      ELSIF v_remaining = 0 THEN
        DELETE FROM public.squads WHERE id = v_squad.id;
      END IF;
    END LOOP;

    -- Also remove from crew pool
    DELETE FROM public.crew_pool
    WHERE user_id = OLD.user_id
      AND event_id = OLD.event_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_event_undown_auto_leave
  AFTER UPDATE ON public.saved_events
  FOR EACH ROW EXECUTE FUNCTION public.auto_leave_squad_on_event_undown();
