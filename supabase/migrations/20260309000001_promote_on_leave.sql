-- Auto-promote the first waitlisted member when a spot opens in a squad.
-- Unlike promote_from_waitlist (date_confirm_flow), this does NOT require
-- a confirm_message_id or create a date_confirms row — it just promotes.

CREATE OR REPLACE FUNCTION public.promote_waitlisted_member(p_squad_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_name TEXT;
  v_squad_name TEXT;
  v_check_id UUID;
  v_max_size INT;
  v_current_count INT;
BEGIN
  -- Get linked check for capacity info
  SELECT s.check_id INTO v_check_id
  FROM squads s WHERE s.id = p_squad_id;

  -- If no linked check, no waitlist concept — skip
  IF v_check_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if there's actually room now
  SELECT ic.max_squad_size INTO v_max_size
  FROM interest_checks ic WHERE ic.id = v_check_id;

  SELECT COUNT(*) INTO v_current_count
  FROM squad_members
  WHERE squad_id = p_squad_id AND role = 'member';

  IF v_current_count >= v_max_size THEN
    RETURN NULL;
  END IF;

  -- Find first waitlisted member (earliest joined_at)
  SELECT sm.user_id INTO v_user_id
  FROM squad_members sm
  WHERE sm.squad_id = p_squad_id AND sm.role = 'waitlist'
  ORDER BY sm.joined_at ASC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Promote to member
  UPDATE squad_members
  SET role = 'member'
  WHERE squad_id = p_squad_id AND user_id = v_user_id;

  SELECT display_name INTO v_name FROM profiles WHERE id = v_user_id;
  SELECT name INTO v_squad_name FROM squads WHERE id = p_squad_id;

  -- System message
  INSERT INTO messages (squad_id, sender_id, text, is_system)
  VALUES (p_squad_id, NULL,
          coalesce(v_name, 'Someone') || ' was promoted from the waitlist',
          TRUE);

  -- Notification
  INSERT INTO notifications (user_id, type, title, body, related_squad_id)
  VALUES (v_user_id, 'squad_invite',
          coalesce(v_squad_name, 'Squad'),
          'A spot opened up — you''re in!',
          p_squad_id);

  RETURN v_user_id;
END;
$$;
