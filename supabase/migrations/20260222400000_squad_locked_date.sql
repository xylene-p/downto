-- Add locked_date column to squads for when a date is manually set
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS locked_date date;
