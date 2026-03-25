-- Add a unique token for webcal subscription URLs (no auth headers needed)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_token UUID DEFAULT gen_random_uuid();

-- Ensure uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_calendar_token
  ON public.profiles (calendar_token);
