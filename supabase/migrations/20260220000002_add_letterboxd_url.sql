ALTER TABLE public.events ADD COLUMN IF NOT EXISTS letterboxd_url TEXT;
CREATE INDEX IF NOT EXISTS idx_events_letterboxd_url ON public.events(letterboxd_url) WHERE letterboxd_url IS NOT NULL;
