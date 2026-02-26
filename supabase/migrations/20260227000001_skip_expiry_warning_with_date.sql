-- Don't send "set a date to keep it going" warning to squads that already have
-- a locked_date. The warning is irrelevant since they already set a date.

CREATE OR REPLACE FUNCTION public.process_squad_expiry()
RETURNS void AS $$
BEGIN
  -- 1. 1h warnings for squads about to expire (skip squads with a date already set)
  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  SELECT id, NULL, 'This chat expires in 1 hour — set a date to keep it going', TRUE
  FROM public.squads
  WHERE warned_at IS NULL
    AND archived_at IS NULL
    AND locked_date IS NULL
    AND expires_at > NOW()
    AND expires_at <= NOW() + INTERVAL '1 hour';

  UPDATE public.squads
  SET warned_at = NOW()
  WHERE warned_at IS NULL
    AND archived_at IS NULL
    AND locked_date IS NULL
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
