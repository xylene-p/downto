-- Track which theme each user is on, piggybacking on version_pings.
-- Nullable so old rows (and clients that don't know about themes yet) are fine.
ALTER TABLE public.version_pings
  ADD COLUMN IF NOT EXISTS theme TEXT;

-- Index for admin aggregation: "users per theme in last N days"
CREATE INDEX IF NOT EXISTS idx_version_pings_theme_created
  ON public.version_pings(theme, created_at DESC)
  WHERE theme IS NOT NULL;
