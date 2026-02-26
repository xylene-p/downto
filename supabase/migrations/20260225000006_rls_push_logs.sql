-- Enable RLS on tables missing it

-- push_logs: server-side only, no client access needed.
-- Only the service_role (used by push API routes) can read/write.
ALTER TABLE public.push_logs ENABLE ROW LEVEL SECURITY;

-- event_responses: enable RLS + basic policies
ALTER TABLE public.event_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own event responses" ON public.event_responses
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own event responses" ON public.event_responses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own event responses" ON public.event_responses
  FOR DELETE USING (user_id = auth.uid());
