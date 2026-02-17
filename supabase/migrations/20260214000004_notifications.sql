-- ============================================================================
-- DOWN TO - Notifications + People Down visibility
-- ============================================================================

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('friend_request', 'friend_accepted', 'check_response', 'squad_message')),
  title TEXT NOT NULL,
  body TEXT,
  related_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  related_squad_id UUID REFERENCES public.squads(id) ON DELETE CASCADE,
  related_check_id UUID REFERENCES public.interest_checks(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id) WHERE is_read = FALSE;

-- ============================================================================
-- RLS for notifications
-- ============================================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- System can insert notifications (via triggers running as SECURITY DEFINER)
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- RLS for saved_events: anyone can see who's down on public events
-- ============================================================================

DROP POLICY IF EXISTS "Anyone can see who is down on public events" ON public.saved_events;
CREATE POLICY "Anyone can see who is down on public events" ON public.saved_events
  FOR SELECT USING (
    is_down = TRUE AND
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = saved_events.event_id
      AND events.is_public = TRUE
    )
  );

-- ============================================================================
-- NOTIFICATION TRIGGERS
-- ============================================================================

-- 1. Friend request sent → notify addressee
CREATE OR REPLACE FUNCTION public.notify_friend_request()
RETURNS TRIGGER AS $$
DECLARE
  requester_name TEXT;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT display_name INTO requester_name
    FROM public.profiles WHERE id = NEW.requester_id;

    INSERT INTO public.notifications (user_id, type, title, body, related_user_id)
    VALUES (
      NEW.addressee_id,
      'friend_request',
      'New friend request',
      requester_name || ' wants to connect',
      NEW.requester_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friend_request ON public.friendships;
CREATE TRIGGER on_friend_request
  AFTER INSERT ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.notify_friend_request();

-- 2. Friend request accepted → notify requester
CREATE OR REPLACE FUNCTION public.notify_friend_accepted()
RETURNS TRIGGER AS $$
DECLARE
  accepter_name TEXT;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT display_name INTO accepter_name
    FROM public.profiles WHERE id = NEW.addressee_id;

    INSERT INTO public.notifications (user_id, type, title, body, related_user_id)
    VALUES (
      NEW.requester_id,
      'friend_accepted',
      'Friend request accepted',
      accepter_name || ' accepted your request',
      NEW.addressee_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friend_accepted ON public.friendships;
CREATE TRIGGER on_friend_accepted
  AFTER UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.notify_friend_accepted();

-- 3. Interest check response → notify check author
CREATE OR REPLACE FUNCTION public.notify_check_response()
RETURNS TRIGGER AS $$
DECLARE
  responder_name TEXT;
  check_author_id UUID;
  check_text TEXT;
BEGIN
  SELECT ic.author_id, ic.text INTO check_author_id, check_text
  FROM public.interest_checks ic WHERE ic.id = NEW.check_id;

  -- Don't notify if author responds to own check
  IF check_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO responder_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
  VALUES (
    check_author_id,
    'check_response',
    'New response to your check',
    responder_name || ' is ' || NEW.response || ' for "' || LEFT(check_text, 40) || '"',
    NEW.user_id,
    NEW.check_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_check_response ON public.check_responses;
CREATE TRIGGER on_check_response
  AFTER INSERT ON public.check_responses
  FOR EACH ROW EXECUTE FUNCTION public.notify_check_response();

-- 4. Squad message → notify all squad members except sender
CREATE OR REPLACE FUNCTION public.notify_squad_message()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
  squad_name TEXT;
  member_id UUID;
BEGIN
  SELECT display_name INTO sender_name
  FROM public.profiles WHERE id = NEW.sender_id;

  SELECT name INTO squad_name
  FROM public.squads WHERE id = NEW.squad_id;

  FOR member_id IN
    SELECT user_id FROM public.squad_members
    WHERE squad_id = NEW.squad_id AND user_id != NEW.sender_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
    VALUES (
      member_id,
      'squad_message',
      squad_name,
      sender_name || ': ' || LEFT(NEW.text, 80),
      NEW.sender_id,
      NEW.squad_id
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_squad_message ON public.messages;
CREATE TRIGGER on_squad_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_squad_message();

-- ============================================================================
-- REALTIME for notifications
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
