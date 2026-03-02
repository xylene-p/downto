-- Add message_type to messages (existing messages stay 'text')
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text';

-- Add date_status to squads (NULL = no date or legacy locked, 'proposed' = flexible, 'locked' = confirmed)
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS date_status TEXT
  CHECK (date_status IN ('proposed', 'locked')) DEFAULT NULL;

-- Track member confirmations for proposed dates
CREATE TABLE IF NOT EXISTS public.squad_date_confirms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response TEXT CHECK (response IN ('yes', 'no')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(squad_id, user_id)
);

CREATE INDEX idx_squad_date_confirms_squad ON public.squad_date_confirms(squad_id);

-- RLS
ALTER TABLE public.squad_date_confirms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Squad members can view confirms"
  ON public.squad_date_confirms FOR SELECT
  USING (public.is_squad_member(squad_id, auth.uid()));

CREATE POLICY "Users can update own confirm"
  ON public.squad_date_confirms FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Service insert confirms"
  ON public.squad_date_confirms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service delete confirms"
  ON public.squad_date_confirms FOR DELETE
  USING (true);

-- Add date_confirm notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('friend_request', 'friend_accepted', 'check_response',
                  'squad_message', 'squad_invite', 'friend_check', 'date_confirm'));

-- Promote first waitlisted person into a squad
CREATE OR REPLACE FUNCTION public.promote_from_waitlist(
  p_squad_id UUID,
  p_check_id UUID,
  p_confirm_message_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_name TEXT;
  v_squad_name TEXT;
BEGIN
  -- Find first "down" responder not already in squad and not declined
  SELECT cr.user_id INTO v_user_id
  FROM public.check_responses cr
  WHERE cr.check_id = p_check_id
    AND cr.response = 'down'
    AND cr.user_id NOT IN (
      SELECT sm.user_id FROM public.squad_members sm WHERE sm.squad_id = p_squad_id
    )
    AND cr.user_id NOT IN (
      SELECT sdc.user_id FROM public.squad_date_confirms sdc
      WHERE sdc.squad_id = p_squad_id AND sdc.response = 'no'
    )
  ORDER BY cr.created_at ASC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Add to squad
  INSERT INTO public.squad_members (squad_id, user_id)
  VALUES (p_squad_id, v_user_id)
  ON CONFLICT (squad_id, user_id) DO NOTHING;

  -- Create pending confirm row
  INSERT INTO public.squad_date_confirms (squad_id, message_id, user_id)
  VALUES (p_squad_id, p_confirm_message_id, v_user_id)
  ON CONFLICT (squad_id, user_id) DO UPDATE
    SET response = NULL, responded_at = NULL, message_id = EXCLUDED.message_id;

  SELECT display_name INTO v_name FROM public.profiles WHERE id = v_user_id;
  SELECT name INTO v_squad_name FROM public.squads WHERE id = p_squad_id;

  -- System message
  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (p_squad_id, NULL, coalesce(v_name, 'Someone') || ' was added from the waitlist', TRUE);

  -- Notification
  INSERT INTO public.notifications (user_id, type, title, body, related_squad_id)
  VALUES (v_user_id, 'date_confirm', coalesce(v_squad_name, 'Squad'),
          'A spot opened up — are you still down?', p_squad_id);

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.squad_date_confirms;
