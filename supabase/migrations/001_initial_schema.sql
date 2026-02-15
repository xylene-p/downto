-- ============================================================================
-- DOWN TO - Initial Database Schema
-- ============================================================================

-- Drop existing tables (cascade removes dependencies)
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.squad_members CASCADE;
DROP TABLE IF EXISTS public.squads CASCADE;
DROP TABLE IF EXISTS public.check_responses CASCADE;
DROP TABLE IF EXISTS public.interest_checks CASCADE;
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.saved_events CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS
-- ============================================================================
-- Extends Supabase auth.users with app-specific profile data

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  avatar_letter CHAR(1) GENERATED ALWAYS AS (UPPER(LEFT(display_name, 1))) STORED,
  availability TEXT CHECK (availability IN ('open', 'awkward', 'not-available')) DEFAULT 'open',
  ig_handle TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- EVENTS
-- ============================================================================
-- Events scraped from Instagram or manually created

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  venue TEXT,
  neighborhood TEXT,
  date DATE,
  date_display TEXT, -- "Fri, Feb 14" or "Tonight"
  time_display TEXT, -- "11PM-5AM"
  vibes TEXT[] DEFAULT '{}',
  image_url TEXT,
  ig_handle TEXT,
  ig_url TEXT, -- Original Instagram post URL
  is_public BOOLEAN DEFAULT FALSE, -- Public events visible to all
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying tonight's events
CREATE INDEX IF NOT EXISTS idx_events_date ON public.events(date);
CREATE INDEX IF NOT EXISTS idx_events_public ON public.events(is_public) WHERE is_public = TRUE;

-- ============================================================================
-- SAVED EVENTS (User <-> Event relationship)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  is_down BOOLEAN DEFAULT FALSE, -- User marked as "down" (visible to friends)
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

-- Index for finding who's down for an event
CREATE INDEX IF NOT EXISTS idx_saved_events_down ON public.saved_events(event_id) WHERE is_down = TRUE;
CREATE INDEX IF NOT EXISTS idx_saved_events_user ON public.saved_events(user_id);

-- ============================================================================
-- FRIENDSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);

-- Index for querying a user's friends
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships(addressee_id, status);

-- ============================================================================
-- INTEREST CHECKS (Ephemeral "who's down?" posts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.interest_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by expiration
CREATE INDEX IF NOT EXISTS idx_interest_checks_active ON public.interest_checks(expires_at);
CREATE INDEX IF NOT EXISTS idx_interest_checks_author ON public.interest_checks(author_id);

-- ============================================================================
-- INTEREST CHECK RESPONSES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.check_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_id UUID NOT NULL REFERENCES public.interest_checks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('down', 'maybe', 'nah')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(check_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_check_responses_check ON public.check_responses(check_id);

-- ============================================================================
-- SQUADS (Group chats formed from events or interest checks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.squads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  check_id UUID REFERENCES public.interest_checks(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_squads_event ON public.squads(event_id);

-- ============================================================================
-- SQUAD MEMBERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.squad_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  squad_id UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(squad_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_squad_members_squad ON public.squad_members(squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_user ON public.squad_members(user_id);

-- ============================================================================
-- MESSAGES (Squad chat messages)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  squad_id UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching recent messages
CREATE INDEX IF NOT EXISTS idx_messages_squad ON public.messages(squad_id, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Profiles: Users can read all profiles, update only their own
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Events: Public events visible to all, private events visible to creator and friends
DROP POLICY IF EXISTS "Public events are viewable by everyone" ON public.events;
CREATE POLICY "Public events are viewable by everyone" ON public.events
  FOR SELECT USING (is_public = TRUE OR created_by = auth.uid());

DROP POLICY IF EXISTS "Users can create events" ON public.events;
CREATE POLICY "Users can create events" ON public.events
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Saved Events: Users can manage their own saves
DROP POLICY IF EXISTS "Users can view own saved events" ON public.saved_events;
CREATE POLICY "Users can view own saved events" ON public.saved_events
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can save events" ON public.saved_events;
CREATE POLICY "Users can save events" ON public.saved_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own saves" ON public.saved_events;
CREATE POLICY "Users can update own saves" ON public.saved_events
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own saves" ON public.saved_events;
CREATE POLICY "Users can delete own saves" ON public.saved_events
  FOR DELETE USING (user_id = auth.uid());

-- Friends can see each other's saved events where is_down = true
DROP POLICY IF EXISTS "Friends can see who is down" ON public.saved_events;
CREATE POLICY "Friends can see who is down" ON public.saved_events
  FOR SELECT USING (
    is_down = TRUE AND
    EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
      AND (
        (requester_id = auth.uid() AND addressee_id = saved_events.user_id) OR
        (addressee_id = auth.uid() AND requester_id = saved_events.user_id)
      )
    )
  );

-- Friendships: Users can see/manage their own friendships
DROP POLICY IF EXISTS "Users can view own friendships" ON public.friendships;
CREATE POLICY "Users can view own friendships" ON public.friendships
  FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());

DROP POLICY IF EXISTS "Users can send friend requests" ON public.friendships;
CREATE POLICY "Users can send friend requests" ON public.friendships
  FOR INSERT WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "Users can update friendships they're part of" ON public.friendships;
CREATE POLICY "Users can update friendships they're part of" ON public.friendships
  FOR UPDATE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete friendships they're part of" ON public.friendships;
CREATE POLICY "Users can delete friendships they're part of" ON public.friendships
  FOR DELETE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- Interest Checks: Visible to author and their friends
DROP POLICY IF EXISTS "Interest checks visible to friends" ON public.interest_checks;
CREATE POLICY "Interest checks visible to friends" ON public.interest_checks
  FOR SELECT USING (
    author_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
      AND (
        (requester_id = auth.uid() AND addressee_id = interest_checks.author_id) OR
        (addressee_id = auth.uid() AND requester_id = interest_checks.author_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can create interest checks" ON public.interest_checks;
CREATE POLICY "Users can create interest checks" ON public.interest_checks
  FOR INSERT WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own interest checks" ON public.interest_checks;
CREATE POLICY "Users can delete own interest checks" ON public.interest_checks
  FOR DELETE USING (author_id = auth.uid());

-- Check Responses: Visible to check author and friends
DROP POLICY IF EXISTS "Responses visible to check participants" ON public.check_responses;
CREATE POLICY "Responses visible to check participants" ON public.check_responses
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_responses.check_id
      AND (
        ic.author_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.friendships
          WHERE status = 'accepted'
          AND (
            (requester_id = auth.uid() AND addressee_id = ic.author_id) OR
            (addressee_id = auth.uid() AND requester_id = ic.author_id)
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "Users can respond to checks" ON public.check_responses;
CREATE POLICY "Users can respond to checks" ON public.check_responses
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own responses" ON public.check_responses;
CREATE POLICY "Users can update own responses" ON public.check_responses
  FOR UPDATE USING (user_id = auth.uid());

-- Squads: Visible to members
DROP POLICY IF EXISTS "Squads visible to members" ON public.squads;
CREATE POLICY "Squads visible to members" ON public.squads
  FOR SELECT USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.squad_members
      WHERE squad_id = squads.id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create squads" ON public.squads;
CREATE POLICY "Users can create squads" ON public.squads
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- Squad Members: Visible to squad members
DROP POLICY IF EXISTS "Squad members visible to squad members" ON public.squad_members;
CREATE POLICY "Squad members visible to squad members" ON public.squad_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.squad_members sm
      WHERE sm.squad_id = squad_members.squad_id AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Squad creators can add members" ON public.squad_members;
CREATE POLICY "Squad creators can add members" ON public.squad_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.squads
      WHERE id = squad_members.squad_id AND created_by = auth.uid()
    )
    OR user_id = auth.uid() -- Users can add themselves if invited
  );

-- Messages: Visible to squad members
DROP POLICY IF EXISTS "Messages visible to squad members" ON public.messages;
CREATE POLICY "Messages visible to squad members" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.squad_members
      WHERE squad_id = messages.squad_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Squad members can send messages" ON public.messages;
CREATE POLICY "Squad members can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.squad_members
      WHERE squad_id = messages.squad_id AND user_id = auth.uid()
    )
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_friendship_updated ON public.friendships;
CREATE TRIGGER on_friendship_updated
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- REALTIME
-- ============================================================================

-- Enable realtime for messages (squad chat)
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Enable realtime for check responses (live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.check_responses;
