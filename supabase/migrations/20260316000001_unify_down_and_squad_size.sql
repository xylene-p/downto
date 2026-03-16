-- Unify "down" responses and squad size: max_squad_size caps how many people
-- can respond "down". Extra people get a 'waitlist' response. "Maybe" is removed.

-- ═══════════════════════════════════════════════════════════════════════════════
-- A. Make max_squad_size nullable (NULL = unlimited)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.interest_checks ALTER COLUMN max_squad_size DROP NOT NULL;
ALTER TABLE public.interest_checks ALTER COLUMN max_squad_size SET DEFAULT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- B. Add 'waitlist' to check_responses, remove 'maybe'/'nah' data
-- ═══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.check_responses WHERE response IN ('maybe', 'nah');

ALTER TABLE public.check_responses DROP CONSTRAINT IF EXISTS check_responses_response_check;
ALTER TABLE public.check_responses ADD CONSTRAINT check_responses_response_check
  CHECK (response IN ('down', 'waitlist'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- C. BEFORE INSERT/UPDATE trigger: cap down responses
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cap_down_responses()
RETURNS TRIGGER AS $$
DECLARE
  v_max_size INT;
  v_current_downs INT;
  v_is_coauthor BOOLEAN;
BEGIN
  -- Only act when the incoming response is 'down'
  IF NEW.response != 'down' THEN RETURN NEW; END IF;

  -- On UPDATE, if already 'down' → 'down' (no-op), let it through
  IF TG_OP = 'UPDATE' AND OLD.response = 'down' THEN RETURN NEW; END IF;

  SELECT ic.max_squad_size INTO v_max_size
  FROM public.interest_checks ic WHERE ic.id = NEW.check_id;

  -- NULL = unlimited, skip cap
  IF v_max_size IS NULL THEN RETURN NEW; END IF;

  -- Co-authors (accepted) bypass the cap — they were explicitly invited
  SELECT EXISTS (
    SELECT 1 FROM public.check_co_authors
    WHERE check_id = NEW.check_id AND user_id = NEW.user_id AND status = 'accepted'
  ) INTO v_is_coauthor;
  IF v_is_coauthor THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_current_downs
  FROM public.check_responses
  WHERE check_id = NEW.check_id AND response = 'down';

  IF v_current_downs >= v_max_size THEN
    NEW.response := 'waitlist';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_cap_down_responses
  BEFORE INSERT OR UPDATE ON public.check_responses
  FOR EACH ROW EXECUTE FUNCTION public.cap_down_responses();

-- ═══════════════════════════════════════════════════════════════════════════════
-- D. Re-enable auto_join_squad_on_down_response with waitlist support
--    (was dropped in 20260226000004)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_join_squad_on_down_response()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_role TEXT;
BEGIN
  -- Only act on 'down' or 'waitlist' responses
  IF NEW.response NOT IN ('down', 'waitlist') THEN RETURN NEW; END IF;

  -- Find active squad linked to this check
  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = NEW.check_id AND s.archived_at IS NULL
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN NEW; END IF;

  -- Map response to squad role
  IF NEW.response = 'down' THEN
    v_role := 'member';
  ELSE
    v_role := 'waitlist';
  END IF;

  INSERT INTO public.squad_members (squad_id, user_id, role)
  VALUES (v_squad_id, NEW.user_id, v_role)
  ON CONFLICT (squad_id, user_id) DO UPDATE SET role = v_role;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_check_response_auto_join
  AFTER INSERT OR UPDATE ON public.check_responses
  FOR EACH ROW EXECUTE FUNCTION public.auto_join_squad_on_down_response();

-- ═══════════════════════════════════════════════════════════════════════════════
-- E. New RPC: promote_waitlisted_check_response
--    Finds earliest waitlist response, upgrades to 'down'. The UPDATE fires
--    auto_join trigger → promotes squad_member to 'member'.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.promote_waitlisted_check_response(p_check_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_max_size INT;
  v_current_downs INT;
BEGIN
  -- Check if there's actually room
  SELECT ic.max_squad_size INTO v_max_size
  FROM interest_checks ic WHERE ic.id = p_check_id;

  -- NULL = unlimited — shouldn't have waitlisted anyone, but handle gracefully
  IF v_max_size IS NULL THEN
    -- Promote all waitlisted (shouldn't normally exist)
    UPDATE check_responses SET response = 'down'
    WHERE check_id = p_check_id AND response = 'waitlist';
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_current_downs
  FROM check_responses
  WHERE check_id = p_check_id AND response = 'down';

  IF v_current_downs >= v_max_size THEN
    RETURN NULL;
  END IF;

  -- Find first waitlisted (earliest created_at)
  SELECT cr.user_id INTO v_user_id
  FROM check_responses cr
  WHERE cr.check_id = p_check_id AND cr.response = 'waitlist'
  ORDER BY cr.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Promote: set response to 'down'
  -- This fires the auto_join trigger which promotes the squad_member too
  UPDATE check_responses
  SET response = 'down'
  WHERE check_id = p_check_id AND user_id = v_user_id AND response = 'waitlist';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_user_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- F. Update auto_leave_squad_on_check_response_delete to call promotion
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_leave_squad_on_check_response_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_display_name TEXT;
  v_remaining INT;
  v_msg TEXT;
  v_leave_messages TEXT[] := ARRAY[
    '{name} left the squad',
    '{name} ghosted. classic {name} behavior honestly',
    '{name} said "something came up" lmaooo sure',
    'and just like that… {name} is gone. alexa play see you again',
    '{name} left. pour one out',
    '{name} pulled an irish goodbye and we''re not even irish',
    'rip {name}''s commitment. cause of death: being {name}',
    '{name} chose peace and violence at the same time by leaving',
    '{name} left the squad. their loss genuinely',
    'not {name} actually leaving omg'
  ];
  v_last_one_messages TEXT[] := ARRAY[
    'it''s just you now. squad of one is lowkey sad. invite someone or this dissolves',
    'everyone else bounced. you''re the last one here and the vibes are tragic',
    'solo squad. party of one. find your people before this expires fr',
    'literally everyone left. you''re the main character but like in a horror movie'
  ];
BEGIN
  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = OLD.check_id
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN OLD; END IF;

  DELETE FROM public.squad_members
  WHERE squad_id = v_squad_id AND user_id = OLD.user_id;

  IF NOT FOUND THEN RETURN OLD; END IF;

  SELECT p.display_name INTO v_display_name
  FROM public.profiles p WHERE p.id = OLD.user_id;

  v_msg := replace(pick_random(v_leave_messages), '{name}', coalesce(v_display_name, 'Someone'));

  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (v_squad_id, NULL, v_msg, TRUE);

  SELECT COUNT(*) INTO v_remaining
  FROM public.squad_members WHERE squad_id = v_squad_id;

  IF v_remaining = 1 THEN
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_squad_id, NULL, pick_random(v_last_one_messages), TRUE);
  ELSIF v_remaining = 0 THEN
    DELETE FROM public.squads WHERE id = v_squad_id;
  END IF;

  -- Auto-promote first waitlisted check response
  PERFORM public.promote_waitlisted_check_response(OLD.check_id);

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- F2. Update auto_leave_squad_on_check_response_change to call promotion
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_leave_squad_on_check_response_change()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_user_id UUID;
  v_check_id UUID;
  v_display_name TEXT;
  v_remaining INT;
  v_msg TEXT;
  v_leave_messages TEXT[] := ARRAY[
    '{name} left the squad',
    '{name} ghosted. classic {name} behavior honestly',
    '{name} said "something came up" lmaooo sure',
    'and just like that… {name} is gone. alexa play see you again',
    '{name} left. pour one out',
    '{name} pulled an irish goodbye and we''re not even irish',
    'rip {name}''s commitment. cause of death: being {name}',
    '{name} chose peace and violence at the same time by leaving',
    '{name} left the squad. their loss genuinely',
    'not {name} actually leaving omg'
  ];
  v_last_one_messages TEXT[] := ARRAY[
    'it''s just you now. squad of one is lowkey sad. invite someone or this dissolves',
    'everyone else bounced. you''re the last one here and the vibes are tragic',
    'solo squad. party of one. find your people before this expires fr',
    'literally everyone left. you''re the main character but like in a horror movie'
  ];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.response != 'down' THEN RETURN OLD; END IF;
    v_user_id := OLD.user_id;
    v_check_id := OLD.check_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.response != 'down' OR NEW.response = 'down' THEN RETURN NEW; END IF;
    v_user_id := OLD.user_id;
    v_check_id := OLD.check_id;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = v_check_id AND s.archived_at IS NULL
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  DELETE FROM public.squad_members
  WHERE squad_id = v_squad_id AND user_id = v_user_id;

  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT p.display_name INTO v_display_name
  FROM public.profiles p WHERE p.id = v_user_id;

  v_msg := replace(pick_random(v_leave_messages), '{name}', coalesce(v_display_name, 'Someone'));

  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (v_squad_id, NULL, v_msg, TRUE);

  SELECT COUNT(*) INTO v_remaining
  FROM public.squad_members WHERE squad_id = v_squad_id;

  IF v_remaining = 1 THEN
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (v_squad_id, NULL, pick_random(v_last_one_messages), TRUE);
  ELSIF v_remaining = 0 THEN
    DELETE FROM public.squads WHERE id = v_squad_id;
  END IF;

  -- Auto-promote first waitlisted check response
  PERFORM public.promote_waitlisted_check_response(v_check_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- G. Update leave_squad RPC to use check-level promotion
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.leave_squad(p_squad_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_display_name TEXT;
  v_remaining INT;
  v_msg TEXT;
  v_check_id UUID;
  v_event_id UUID;
  v_leave_messages TEXT[] := ARRAY[
    '{name} left the squad',
    '{name} ghosted. classic {name} behavior honestly',
    '{name} said "something came up" lmaooo sure',
    'and just like that… {name} is gone. alexa play see you again',
    '{name} left. pour one out',
    '{name} pulled an irish goodbye and we''re not even irish',
    'rip {name}''s commitment. cause of death: being {name}',
    '{name} chose peace and violence at the same time by leaving',
    '{name} left the squad. their loss genuinely',
    'not {name} actually leaving omg'
  ];
  v_last_one_messages TEXT[] := ARRAY[
    'it''s just you now. squad of one is lowkey sad. invite someone or this dissolves',
    'everyone else bounced. you''re the last one here and the vibes are tragic',
    'solo squad. party of one. find your people before this expires fr',
    'literally everyone left. you''re the main character but like in a horror movie'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.squad_members
  WHERE squad_id = p_squad_id AND user_id = v_user_id;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT s.check_id, s.event_id INTO v_check_id, v_event_id
  FROM public.squads s WHERE s.id = p_squad_id;

  IF v_check_id IS NOT NULL THEN
    -- Record as "left" before deleting response
    IF EXISTS (SELECT 1 FROM public.check_responses WHERE check_id = v_check_id AND user_id = v_user_id)
    AND NOT EXISTS (SELECT 1 FROM public.interest_checks WHERE id = v_check_id AND author_id = v_user_id)
    THEN
      INSERT INTO public.left_checks (user_id, check_id)
      VALUES (v_user_id, v_check_id)
      ON CONFLICT (user_id, check_id) DO UPDATE SET left_at = NOW();
    END IF;

    DELETE FROM public.check_responses
    WHERE check_id = v_check_id AND user_id = v_user_id;
  END IF;

  IF v_event_id IS NOT NULL THEN
    UPDATE public.saved_events
    SET is_down = false
    WHERE event_id = v_event_id AND user_id = v_user_id;
  END IF;

  SELECT display_name INTO v_display_name
  FROM public.profiles WHERE id = v_user_id;

  v_msg := replace(pick_random(v_leave_messages), '{name}', coalesce(v_display_name, 'Someone'));

  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (p_squad_id, NULL, v_msg, TRUE);

  SELECT COUNT(*) INTO v_remaining
  FROM public.squad_members WHERE squad_id = p_squad_id;

  IF v_remaining = 1 THEN
    INSERT INTO public.messages (squad_id, sender_id, text, is_system)
    VALUES (p_squad_id, NULL, pick_random(v_last_one_messages), TRUE);
  ELSIF v_remaining = 0 THEN
    DELETE FROM public.squads WHERE id = p_squad_id;
  END IF;

  -- Auto-promote from check-level waitlist (not squad-level)
  IF v_check_id IS NOT NULL THEN
    PERFORM public.promote_waitlisted_check_response(v_check_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════════
-- H. Update notify_check_response trigger
--    Fix notification text for 'waitlist' and skip on promotion UPDATE
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_check_response()
RETURNS TRIGGER AS $$
DECLARE
  responder_name TEXT;
  check_author_id UUID;
  check_text TEXT;
  response_label TEXT;
BEGIN
  -- On UPDATE, only notify if the response actually changed
  IF TG_OP = 'UPDATE' AND OLD.response = NEW.response THEN
    RETURN NEW;
  END IF;

  -- Skip notification when promoting from waitlist to down (author sees it in squad)
  IF TG_OP = 'UPDATE' AND OLD.response = 'waitlist' AND NEW.response = 'down' THEN
    RETURN NEW;
  END IF;

  SELECT ic.author_id, ic.text INTO check_author_id, check_text
  FROM public.interest_checks ic WHERE ic.id = NEW.check_id;

  IF check_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO responder_name
  FROM public.profiles WHERE id = NEW.user_id;

  -- Human-readable label
  IF NEW.response = 'waitlist' THEN
    response_label := 'waitlisted for';
  ELSE
    response_label := NEW.response || ' for';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
  VALUES (
    check_author_id,
    'check_response',
    'New response to your check',
    responder_name || ' is ' || response_label || ' "' || LEFT(check_text, 40) || '"',
    NEW.user_id,
    NEW.check_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
