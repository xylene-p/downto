-- Check-based squads now expire with the check (no 24h grace).
-- If someone sets a date via set-date API, that extends the expiry.
-- Event-based squads keep 24h after event date.

CREATE OR REPLACE FUNCTION public.set_squad_expiry()
RETURNS TRIGGER AS $$
DECLARE
  v_event_date DATE;
  v_check_expires TIMESTAMPTZ;
  v_check_created TIMESTAMPTZ;
BEGIN
  -- Event-based squad: 24h after event date ends
  IF NEW.event_id IS NOT NULL THEN
    SELECT date INTO v_event_date FROM public.events WHERE id = NEW.event_id;
    IF v_event_date IS NOT NULL THEN
      NEW.expires_at := (v_event_date + INTERVAL '1 day') + INTERVAL '24 hours';
    END IF;
  END IF;

  -- Check-based squad: expires when check expires (no grace)
  IF NEW.check_id IS NOT NULL THEN
    SELECT expires_at, created_at INTO v_check_expires, v_check_created
    FROM public.interest_checks WHERE id = NEW.check_id;
    IF v_check_expires IS NOT NULL THEN
      NEW.expires_at := v_check_expires;
    ELSE
      -- Open-ended check: 7 days from check creation
      NEW.expires_at := v_check_created + INTERVAL '7 days';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing check-based squads: remove the 24h grace
-- (only for squads where no date has been set via set-date API)
UPDATE public.squads s
SET expires_at = COALESCE(ic.expires_at, s.created_at + INTERVAL '7 days')
FROM public.interest_checks ic
WHERE s.check_id = ic.id
  AND s.event_id IS NULL
  AND s.expires_at IS NOT NULL
  AND s.expires_at = COALESCE(ic.expires_at, s.created_at + INTERVAL '7 days') + INTERVAL '24 hours';
