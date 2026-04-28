-- Preserve the user's typed "when" phrase when it implied multiple dates.
--
-- parseWhen() (PR #485) lets the user type "next thurs or next fri at 7pm"
-- in a check input. The schema only has a single event_date column though,
-- so the second date silently disappears: the check is created with
-- Thursday's ISO and the displayed label is recomputed as "Thu, Apr 30",
-- losing the "or fri" part the author intended.
--
-- Adding event_date_label as the *typed* phrase to round-trip — populated
-- only when the parse produced multiple dates. Single-date inputs leave it
-- NULL and consumers fall back to the auto-formatted "Mon, Mmm DD" display
-- (transformCheck in src/features/checks/hooks/useChecks.ts), so single-day
-- checks look identical to before.
--
-- This is the cheapest of the three options laid out in the parseWhen PR
-- discussion: captures intent without committing to a multi-date data
-- model. If/when we want true multi-date checks we'd add an event_dates
-- DATE[] (or pivot table) and update RLS / the cron archiver / the
-- date-update notification trigger to handle the array shape.

ALTER TABLE public.interest_checks
  ADD COLUMN IF NOT EXISTS event_date_label TEXT;
