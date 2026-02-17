-- Add logistics columns to squads for coordination
ALTER TABLE public.squads
  ADD COLUMN meeting_spot TEXT,
  ADD COLUMN arrival_time TEXT,
  ADD COLUMN transport_notes TEXT;

-- Squad members can update their squad (logistics fields etc.)
CREATE POLICY "Squad members can update squad" ON public.squads
  FOR UPDATE USING (public.is_squad_member(id, auth.uid()));

-- Crew pool for stranger matching on events
CREATE TABLE public.crew_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.crew_pool ENABLE ROW LEVEL SECURITY;

-- Anyone can see who's in the crew pool
CREATE POLICY "Anyone can view crew pool" ON public.crew_pool
  FOR SELECT USING (true);

-- Users can add themselves to the pool
CREATE POLICY "Users can join crew pool" ON public.crew_pool
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can remove themselves from the pool
CREATE POLICY "Users can leave crew pool" ON public.crew_pool
  FOR DELETE USING (auth.uid() = user_id);

-- Index for fast lookups by event
CREATE INDEX idx_crew_pool_event_id ON public.crew_pool(event_id);
