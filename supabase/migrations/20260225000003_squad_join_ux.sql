-- Improve UX when a user joins an existing squad:
-- 1. Post a system message in squad chat ("{name} joined the squad")
-- 2. Fix notification text: self-joins get "Squad started by {creator}" instead of "{creator} started a squad with you!"

-- ============================================================================
-- 1. System message on join
-- ============================================================================
CREATE OR REPLACE FUNCTION public.post_join_system_message()
RETURNS TRIGGER AS $$
DECLARE
  v_creator_id UUID;
  v_joiner_name TEXT;
BEGIN
  -- Only for self-joins (not batch-adds during squad creation)
  IF auth.uid() IS DISTINCT FROM NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Skip if the joiner is the squad creator (creator row added during creation)
  SELECT created_by INTO v_creator_id
  FROM public.squads WHERE id = NEW.squad_id;

  IF NEW.user_id = v_creator_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_joiner_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.messages (squad_id, sender_id, text, is_system)
  VALUES (NEW.squad_id, NULL, coalesce(v_joiner_name, 'Someone') || ' joined the squad', TRUE);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_squad_member_join_message ON public.squad_members;
CREATE TRIGGER on_squad_member_join_message
  AFTER INSERT ON public.squad_members
  FOR EACH ROW EXECUTE FUNCTION public.post_join_system_message();

-- ============================================================================
-- 2. Fix notification: different text for self-join vs invited
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_squad_invite()
RETURNS TRIGGER AS $$
DECLARE
  squad_name TEXT;
  creator_id UUID;
  creator_name TEXT;
  joiner_name TEXT;
  existing_member RECORD;
BEGIN
  SELECT s.name, s.created_by INTO squad_name, creator_id
  FROM public.squads s WHERE s.id = NEW.squad_id;

  -- Skip notification to the squad creator's own row
  IF NEW.user_id = creator_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO creator_name
  FROM public.profiles WHERE id = creator_id;

  -- Self-join: user joined on their own (clicked "Join Squad" or auto-joined via down response)
  IF auth.uid() = NEW.user_id THEN
    -- Notify the joiner with contextual text
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
    VALUES (
      NEW.user_id,
      'squad_invite',
      squad_name,
      'Squad started by ' || coalesce(creator_name, 'someone') || ' — you''re in!',
      creator_id,
      NEW.squad_id
    );

    -- Notify existing squad members that someone joined
    SELECT display_name INTO joiner_name
    FROM public.profiles WHERE id = NEW.user_id;

    FOR existing_member IN
      SELECT user_id FROM public.squad_members
      WHERE squad_id = NEW.squad_id AND user_id != NEW.user_id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
      VALUES (
        existing_member.user_id,
        'squad_invite',
        squad_name,
        coalesce(joiner_name, 'Someone') || ' joined the squad',
        NEW.user_id,
        NEW.squad_id
      );
    END LOOP;
  ELSE
    -- Added by someone else (initial squad creation) — keep original behavior
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
    VALUES (
      NEW.user_id,
      'squad_invite',
      squad_name,
      creator_name || ' started a squad with you!',
      creator_id,
      NEW.squad_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
