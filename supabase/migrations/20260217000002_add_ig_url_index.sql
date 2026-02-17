CREATE INDEX IF NOT EXISTS idx_events_ig_url ON public.events(ig_url) WHERE ig_url IS NOT NULL;
