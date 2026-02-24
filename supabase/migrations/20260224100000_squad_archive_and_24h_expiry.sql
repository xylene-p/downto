-- 1. Check-based squads now expire 24h after squad creation (not with the check).
-- 2. Archive expired squads instead of hard deleting; cleanup after 7 days.

-- Add archived_at column
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Update trigger: check-based squads get 24h from creation
CREATE OR REPLACE FUNCTION public.set_squad_expiry()
RETURNS TRIGGER AS $$
DECLARE
  v_event_date DATE;
BEGIN
  -- Event-based squad: 24h after event date ends
  IF NEW.event_id IS NOT NULL THEN
    SELECT date INTO v_event_date FROM public.events WHERE id = NEW.event_id;
    IF v_event_date IS NOT NULL THEN
      NEW.expires_at := (v_event_date + INTERVAL '1 day') + INTERVAL '24 hours';
    END IF;
  END IF;

  -- Fallback: 24h from creation (covers check-based and standalone squads)
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := NOW() + INTERVAL '24 hours';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update cron function: archive instead of hard delete
CREATE OR REPLACE FUNCTION public.process_squad_expiry()
RETURNS void AS $$
BEGIN
  -- 1. 1h warnings for squads about to expire
  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  SELECT id, NULL, 'This chat expires in 1 hour — set a date to keep it going', TRUE
  FROM public.squads
  WHERE warned_at IS NULL
    AND archived_at IS NULL
    AND expires_at > NOW()
    AND expires_at <= NOW() + INTERVAL '1 hour';

  UPDATE public.squads
  SET warned_at = NOW()
  WHERE warned_at IS NULL
    AND archived_at IS NULL
    AND expires_at > NOW()
    AND expires_at <= NOW() + INTERVAL '1 hour';

  -- 2. Archive expired squads (soft delete)
  UPDATE public.squads
  SET archived_at = NOW()
  WHERE archived_at IS NULL
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  -- 3. Hard delete squads archived more than 7 days ago
  DELETE FROM public.squads
  WHERE archived_at IS NOT NULL
    AND archived_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: extend check-based squads that haven't expired yet and have no locked_date
-- Give them 24h from now so they don't vanish when the check timer runs out
UPDATE public.squads s
SET expires_at = GREATEST(s.expires_at, NOW() + INTERVAL '24 hours')
WHERE s.check_id IS NOT NULL
  AND s.locked_date IS NULL
  AND s.event_id IS NULL
  AND s.archived_at IS NULL
  AND s.expires_at IS NOT NULL
  AND s.expires_at > NOW();
