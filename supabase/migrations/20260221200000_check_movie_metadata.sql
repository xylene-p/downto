-- Add movie metadata columns to interest_checks
ALTER TABLE interest_checks
  ADD COLUMN letterboxd_url TEXT,
  ADD COLUMN movie_metadata JSONB;
