-- Add last_rallied_at column for rally cooldown tracking
ALTER TABLE public.interest_checks ADD COLUMN IF NOT EXISTS last_rallied_at TIMESTAMPTZ;

-- RPC: rally_check — re-blast friend_check notifications with 30-min cooldown
CREATE OR REPLACE FUNCTION public.rally_check(p_check_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_author_id UUID;
  v_last_rallied TIMESTAMPTZ;
  v_text TEXT;
  v_author_name TEXT;
  v_friend_id UUID;
  v_notified INT := 0;
  v_cooldown_secs INT;
BEGIN
  -- Verify caller owns the check
  SELECT author_id, last_rallied_at, text
    INTO v_author_id, v_last_rallied, v_text
    FROM public.interest_checks
   WHERE id = p_check_id;

  IF v_author_id IS NULL THEN
    RETURN jsonb_build_object('error', 'check not found');
  END IF;

  IF v_author_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'not your check');
  END IF;

  -- Enforce 30-min cooldown
  IF v_last_rallied IS NOT NULL THEN
    v_cooldown_secs := EXTRACT(EPOCH FROM (v_last_rallied + INTERVAL '30 minutes' - NOW()))::INT;
    IF v_cooldown_secs > 0 THEN
      RETURN jsonb_build_object('error', 'cooldown', 'retry_after', v_cooldown_secs);
    END IF;
  END IF;

  -- Update cooldown timestamp
  UPDATE public.interest_checks
     SET last_rallied_at = NOW()
   WHERE id = p_check_id;

  -- Get author display name
  SELECT display_name INTO v_author_name
    FROM public.profiles WHERE id = v_author_id;

  -- Insert friend_check notifications for all friends
  FOR v_friend_id IN
    SELECT CASE
      WHEN requester_id = v_author_id THEN addressee_id
      ELSE requester_id
    END
    FROM public.friendships
    WHERE status = 'accepted'
      AND (requester_id = v_author_id OR addressee_id = v_author_id)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      v_friend_id,
      'friend_check',
      v_author_name,
      'rally! ' || LEFT(v_text, 70),
      v_author_id,
      p_check_id
    );
    v_notified := v_notified + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'notified', v_notified);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
