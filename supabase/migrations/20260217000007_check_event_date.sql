-- Add optional event_date to interest checks for natural language date parsing
ALTER TABLE public.interest_checks
  ADD COLUMN event_date DATE;
