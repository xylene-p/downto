-- Allow interest checks to have no expiry (open-ended checks)
ALTER TABLE public.interest_checks
  ALTER COLUMN expires_at DROP NOT NULL,
  ALTER COLUMN expires_at DROP DEFAULT;
