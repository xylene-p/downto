-- Add onboarded column to track whether user has completed profile setup
ALTER TABLE profiles ADD COLUMN onboarded BOOLEAN DEFAULT false;

-- Backfill: existing users are already onboarded
UPDATE profiles SET onboarded = true;
