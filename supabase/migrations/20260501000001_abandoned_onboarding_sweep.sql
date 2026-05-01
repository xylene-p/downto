-- Daily sweep of abandoned-onboarding accounts.
--
-- If a signup hasn't completed onboarding within 24h of creating their auth
-- row, the cohort almost never comes back to finish (we ran the cleanup by
-- hand once and confirmed each account had zero check/comment/friend/squad
-- footprint). Auto-deleting the auth row cascades cleanly:
--   profiles.id REFERENCES auth.users(id) ON DELETE CASCADE, and every
--   downstream table FKs to profiles.id ON DELETE CASCADE.

CREATE OR REPLACE FUNCTION public.process_abandoned_onboarding()
RETURNS void AS $$
BEGIN
  DELETE FROM auth.users
  WHERE id IN (
    SELECT id FROM public.profiles
    WHERE onboarded = false
      AND created_at < NOW() - INTERVAL '24 hours'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Daily at 06:00 UTC (low-traffic window).
SELECT cron.schedule(
  'abandoned-onboarding-sweep',
  '0 6 * * *',
  $$SELECT public.process_abandoned_onboarding()$$
);
