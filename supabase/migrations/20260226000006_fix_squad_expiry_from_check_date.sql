-- Fix: check-based squads should use the check's event_date for expiry,
-- not the 24h fallback. Previously only event_id (events table) was checked.

CREATE OR REPLACE FUNCTION public.set_squad_expiry()
RETURNS TRIGGER AS $$
DECLARE
  v_event_date DATE;
  v_check_event_date DATE;
BEGIN
  -- Event-based squad: 24h after event date ends
  IF NEW.event_id IS NOT NULL THEN
    SELECT date INTO v_event_date FROM public.events WHERE id = NEW.event_id;
    IF v_event_date IS NOT NULL THEN
      NEW.expires_at := (v_event_date + INTERVAL '1 day') + INTERVAL '24 hours';
    END IF;
  END IF;

  -- Check-based squad: use check's event_date if set
  IF NEW.expires_at IS NULL AND NEW.check_id IS NOT NULL THEN
    SELECT event_date INTO v_check_event_date
    FROM public.interest_checks WHERE id = NEW.check_id;
    IF v_check_event_date IS NOT NULL THEN
      NEW.expires_at := (v_check_event_date + INTERVAL '1 day') + INTERVAL '24 hours';
    END IF;
  END IF;

  -- Fallback: 24h from creation
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '24 hours';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Unarchive and fix expiry for the mahjong squad (and any others hit by this)
UPDATE public.squads s
SET archived_at = NULL,
    expires_at = (ic.event_date + INTERVAL '1 day') + INTERVAL '24 hours'
FROM public.interest_checks ic
WHERE s.check_id = ic.id
  AND ic.event_date IS NOT NULL
  AND ic.event_date >= CURRENT_DATE
  AND s.archived_at IS NOT NULL
  AND (s.expires_at < NOW() OR s.expires_at IS NULL);
