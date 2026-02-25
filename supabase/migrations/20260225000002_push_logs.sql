-- ============================================================================
-- Push notification delivery log
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'stale')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_logs_user ON public.push_logs(user_id);
CREATE INDEX idx_push_logs_failures ON public.push_logs(status) WHERE status != 'sent';
