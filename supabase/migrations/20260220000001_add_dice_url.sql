ALTER TABLE public.events ADD COLUMN IF NOT EXISTS dice_url TEXT;
CREATE INDEX IF NOT EXISTS idx_events_dice_url ON public.events(dice_url) WHERE dice_url IS NOT NULL;
