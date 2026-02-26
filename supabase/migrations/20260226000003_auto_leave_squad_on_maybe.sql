-- Extend auto-leave: also kick from squad when response changes from "down"
-- to "maybe" (or anything else). Previously only fired on DELETE.

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

  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (v_squad_id, NULL, v_display_name || ' is now a maybe. ' || v_display_name || ' got kicked from the chat', TRUE);

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

-- Replace the old delete-only trigger with one that covers both
DROP TRIGGER IF EXISTS on_check_response_delete_auto_leave ON public.check_responses;
CREATE TRIGGER on_check_response_change_auto_leave
  AFTER DELETE OR UPDATE ON public.check_responses
  FOR EACH ROW EXECUTE FUNCTION public.auto_leave_squad_on_check_response_change();
