-- System messages in squad chat should not have a "sender:" prefix in
-- push notifications. Previously sender_id=NULL caused the body to be NULL.

CREATE OR REPLACE FUNCTION public.notify_squad_message()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
  squad_name TEXT;
  member_id UUID;
  msg_body TEXT;
BEGIN
  -- Skip push notifications for system messages
  IF NEW.is_system THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO sender_name
  FROM public.profiles WHERE id = NEW.sender_id;

  SELECT name INTO squad_name
  FROM public.squads WHERE id = NEW.squad_id;

  msg_body := sender_name || ': ' || LEFT(NEW.text, 80);

  FOR member_id IN
    SELECT user_id FROM public.squad_members
    WHERE squad_id = NEW.squad_id AND user_id != NEW.sender_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
    VALUES (
      member_id,
      'squad_message',
      squad_name,
      msg_body,
      NEW.sender_id,
      NEW.squad_id
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
