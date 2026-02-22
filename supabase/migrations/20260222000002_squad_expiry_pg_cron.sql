-- Move squad expiry cron logic into pg_cron (runs every 15 min in-database)

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- The function that does all the work
CREATE OR REPLACE FUNCTION public.process_squad_expiry()
RETURNS void AS $$
BEGIN
  -- 1. Grace-period messages: check-based squads where check timer expired
  --    but grace period hasn't started yet
  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  SELECT s.id, NULL, 'Timer''s up — set a date to lock it in', TRUE
  FROM public.squads s
  JOIN public.interest_checks ic ON s.check_id = ic.id
  WHERE s.check_id IS NOT NULL
    AND s.grace_started_at IS NULL
    AND s.expires_at IS NOT NULL
    AND ic.expires_at IS NOT NULL
    AND ic.expires_at < NOW();

  UPDATE public.squads s
  SET grace_started_at = NOW()
  FROM public.interest_checks ic
  WHERE s.check_id = ic.id
    AND s.check_id IS NOT NULL
    AND s.grace_started_at IS NULL
    AND s.expires_at IS NOT NULL
    AND ic.expires_at IS NOT NULL
    AND ic.expires_at < NOW();

  -- 2. 1h warnings for squads expiring within the next hour
  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  SELECT id, NULL, 'This chat expires in 1 hour', TRUE
  FROM public.squads
  WHERE warned_at IS NULL
    AND expires_at > NOW()
    AND expires_at <= NOW() + INTERVAL '1 hour';

  UPDATE public.squads
  SET warned_at = NOW()
  WHERE warned_at IS NULL
    AND expires_at > NOW()
    AND expires_at <= NOW() + INTERVAL '1 hour';

  -- 3. Delete expired squads (cascade deletes messages + members)
  DELETE FROM public.squads
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: every 15 minutes
SELECT cron.schedule(
  'squad-expiry',
  '*/15 * * * *',
  $$SELECT public.process_squad_expiry()$$
);
