-- Squad chat expiry lifecycle
-- Adds expires_at tracking to squads and system message support to messages

-- 1. Add expiry columns to squads
ALTER TABLE public.squads
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warned_at TIMESTAMPTZ;

-- 2. Allow system messages (sender_id nullable)
ALTER TABLE public.messages
  ALTER COLUMN sender_id DROP NOT NULL;

-- 3. Add is_system column for easy filtering
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;

-- 4. Backfill expires_at for existing squads with dated events (24h after event day ends)
UPDATE public.squads s
SET expires_at = (e.date + INTERVAL '1 day' + INTERVAL '24 hours')
FROM public.events e
WHERE s.event_id = e.id AND e.date IS NOT NULL AND s.expires_at IS NULL;

-- 5. Backfill for existing squads linked to interest checks
UPDATE public.squads s
SET expires_at = COALESCE(ic.expires_at, s.created_at + INTERVAL '7 days') + INTERVAL '24 hours'
FROM public.interest_checks ic
WHERE s.check_id = ic.id AND s.expires_at IS NULL;

-- 6. Index for cron query efficiency
CREATE INDEX IF NOT EXISTS idx_squads_expires_at ON public.squads(expires_at)
  WHERE expires_at IS NOT NULL;

-- 7. Trigger: auto-set expires_at on new squads
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

  -- Check-based squad: expires when check timer expires + 24h grace
  IF NEW.check_id IS NOT NULL THEN
    SELECT expires_at, created_at INTO v_check_expires, v_check_created
    FROM public.interest_checks WHERE id = NEW.check_id;
    IF v_check_expires IS NOT NULL THEN
      NEW.expires_at := v_check_expires + INTERVAL '24 hours';
    ELSE
      -- Open-ended check: 7 days from check creation + 24h grace
      NEW.expires_at := v_check_created + INTERVAL '7 days' + INTERVAL '24 hours';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_squad_created_set_expiry
  BEFORE INSERT ON public.squads
  FOR EACH ROW EXECUTE FUNCTION public.set_squad_expiry();
