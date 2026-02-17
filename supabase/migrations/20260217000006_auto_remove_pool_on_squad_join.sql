-- When a user is added to an event-linked squad, auto-remove them from that event's crew_pool.
-- Prevents stale pool entries causing duplicate squad invitations.

CREATE OR REPLACE FUNCTION public.remove_from_pool_on_squad_join()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Get the event_id for this squad (if any)
  SELECT event_id INTO v_event_id
  FROM public.squads
  WHERE id = NEW.squad_id;

  -- If the squad is linked to an event, remove user from that event's pool
  IF v_event_id IS NOT NULL THEN
    DELETE FROM public.crew_pool
    WHERE event_id = v_event_id AND user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_squad_member_cleanup_pool ON public.squad_members;
CREATE TRIGGER on_squad_member_cleanup_pool
  AFTER INSERT ON public.squad_members
  FOR EACH ROW EXECUTE FUNCTION public.remove_from_pool_on_squad_join();
