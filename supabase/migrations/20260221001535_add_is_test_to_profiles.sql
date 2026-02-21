ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

UPDATE profiles SET is_test = true WHERE username = 'zereptak';
