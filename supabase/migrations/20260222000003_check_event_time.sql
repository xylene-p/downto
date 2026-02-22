ALTER TABLE public.interest_checks
  ADD COLUMN IF NOT EXISTS event_time TEXT;
