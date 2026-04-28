-- Mystery checks — author + responders are hidden from other viewers until
-- the day the event happens, when everything reveals at once.
--
-- Rules:
--   • mystery defaults to false (everything stays normal for existing checks)
--   • mystery=true REQUIRES event_date AND location to both be set, since
--     the whole point is "I don't know who's posting but I know exactly
--     where + when to show up"
--
-- Reveal logic is applied in the client transform (useChecks.ts) and at the
-- check-card render layer for v0.1. Server-side hardening (don't even ship
-- the author_id over the wire pre-reveal) can layer on later if motivated
-- snooping via devtools becomes a real concern.

ALTER TABLE public.interest_checks
  ADD COLUMN IF NOT EXISTS mystery BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.interest_checks
  DROP CONSTRAINT IF EXISTS interest_checks_mystery_requires_date_location;
ALTER TABLE public.interest_checks
  ADD CONSTRAINT interest_checks_mystery_requires_date_location
    CHECK (
      mystery = false
      OR (event_date IS NOT NULL AND location IS NOT NULL AND length(trim(location)) > 0)
    );
