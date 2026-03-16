-- Squad Join Requests: table, RLS, RPC, notification type, triggers

-- 1. Table
CREATE TABLE public.squad_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (squad_id, user_id)
);

CREATE INDEX idx_squad_join_requests_squad ON public.squad_join_requests(squad_id);
CREATE INDEX idx_squad_join_requests_user ON public.squad_join_requests(user_id);

-- 2. RLS
ALTER TABLE public.squad_join_requests ENABLE ROW LEVEL SECURITY;

-- Requester sees own rows; squad members see their squad's rows
CREATE POLICY "Users can view own join requests"
  ON public.squad_join_requests FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_squad_member(squad_id, auth.uid())
  );

-- Requester can insert for self
CREATE POLICY "Users can request to join"
  ON public.squad_join_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Squad creator can update (accept/decline)
CREATE POLICY "Squad creator can respond to requests"
  ON public.squad_join_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.squads s
      WHERE s.id = squad_id AND s.created_by = auth.uid()
    )
  );

-- Requester or squad creator can delete
CREATE POLICY "Requester or creator can delete"
  ON public.squad_join_requests FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.squads s
      WHERE s.id = squad_id AND s.created_by = auth.uid()
    )
  );

-- 3. RPC: get_event_squad_members
-- Returns all active squad members for squads linked to the given event
CREATE OR REPLACE FUNCTION public.get_event_squad_members(p_event_id UUID)
RETURNS TABLE (user_id UUID, squad_id UUID, squad_name TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT sm.user_id, sm.squad_id, s.name
  FROM public.squad_members sm
  JOIN public.squads s ON s.id = sm.squad_id
  WHERE s.event_id = p_event_id
    AND s.archived_at IS NULL
    AND sm.role IS DISTINCT FROM 'waitlist';
$$;

-- 4. Add squad_join_request notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request'
  ));

-- 5. Trigger: notify squad creator on join request
CREATE OR REPLACE FUNCTION public.notify_squad_join_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_creator_id UUID;
  v_requester_name TEXT;
  v_squad_name TEXT;
BEGIN
  SELECT s.created_by, s.name INTO v_creator_id, v_squad_name
  FROM public.squads s WHERE s.id = NEW.squad_id;

  SELECT p.display_name INTO v_requester_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  IF v_creator_id IS NOT NULL AND v_creator_id <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, related_squad_id, related_user_id)
    VALUES (
      v_creator_id,
      'squad_join_request',
      v_requester_name || ' wants to join ' || v_squad_name,
      NULL,
      NEW.squad_id,
      NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_squad_join_request
  AFTER INSERT ON public.squad_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_squad_join_request();

-- 6. Trigger: auto-join on accept + notify requester
CREATE OR REPLACE FUNCTION public.auto_join_on_request_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_squad_name TEXT;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    -- Add requester as squad member
    INSERT INTO public.squad_members (squad_id, user_id, role)
    VALUES (NEW.squad_id, NEW.user_id, 'member')
    ON CONFLICT (squad_id, user_id) DO UPDATE SET role = 'member';

    -- Notify requester they've been accepted
    SELECT s.name INTO v_squad_name
    FROM public.squads s WHERE s.id = NEW.squad_id;

    INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
    VALUES (
      NEW.user_id,
      'squad_invite',
      'You''ve been accepted into ' || v_squad_name,
      NULL,
      NEW.squad_id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_join_on_request_accept
  AFTER UPDATE ON public.squad_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_join_on_request_accept();
