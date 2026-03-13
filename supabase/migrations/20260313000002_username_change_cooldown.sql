-- Add timestamp tracking for username changes
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

-- Enforce 14-day cooldown on username changes
CREATE OR REPLACE FUNCTION enforce_username_cooldown()
RETURNS trigger AS $$
BEGIN
  IF OLD.username IS DISTINCT FROM NEW.username THEN
    IF OLD.username_changed_at IS NOT NULL
       AND OLD.username_changed_at > now() - interval '24 hours' THEN
      RAISE EXCEPTION 'USERNAME_COOLDOWN' USING ERRCODE = 'P0001';
    END IF;
    NEW.username_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_username_cooldown
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_username_cooldown();
