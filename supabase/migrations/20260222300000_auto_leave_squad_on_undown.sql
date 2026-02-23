-- Trigger: auto-remove user from squad when they un-down a check response
CREATE OR REPLACE FUNCTION public.auto_leave_squad_on_check_response_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
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

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_check_response_delete_auto_leave
  AFTER DELETE ON public.check_responses
  FOR EACH ROW EXECUTE FUNCTION public.auto_leave_squad_on_check_response_delete();


-- Trigger: auto-remove user from squad AND crew pool when they un-down an event
CREATE OR REPLACE FUNCTION public.auto_leave_squad_on_event_undown()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when is_down changes from true to false
  IF OLD.is_down = true AND NEW.is_down = false THEN
    DELETE FROM public.squad_members
    WHERE user_id = OLD.user_id
      AND squad_id IN (
        SELECT s.id FROM public.squads s
        WHERE s.event_id = OLD.event_id
      );

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
