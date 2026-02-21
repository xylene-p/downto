-- Hidden checks: lets users hide interest checks from their Pulse feed
CREATE TABLE hidden_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  check_id UUID NOT NULL REFERENCES interest_checks(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, check_id)
);

ALTER TABLE hidden_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own hidden" ON hidden_checks FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can hide checks" ON hidden_checks FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can unhide checks" ON hidden_checks FOR DELETE USING (user_id = auth.uid());
