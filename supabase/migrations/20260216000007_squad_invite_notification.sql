-- Add squad_invite notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('friend_request', 'friend_accepted', 'check_response', 'squad_message', 'squad_invite'));

-- Notify users when they're added to a squad (skip the squad creator)
CREATE OR REPLACE FUNCTION public.notify_squad_invite()
RETURNS TRIGGER AS $$
DECLARE
  squad_name TEXT;
  creator_id UUID;
  creator_name TEXT;
BEGIN
  -- Don't notify the squad creator (they already know)
  SELECT s.name, s.created_by INTO squad_name, creator_id
  FROM public.squads s WHERE s.id = NEW.squad_id;

  IF NEW.user_id = creator_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO creator_name
  FROM public.profiles WHERE id = creator_id;

  INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_squad_id)
  VALUES (
    NEW.user_id,
    'squad_invite',
    squad_name,
    creator_name || ' started a squad with you!',
    creator_id,
    NEW.squad_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_squad_member_added ON public.squad_members;
CREATE TRIGGER on_squad_member_added
  AFTER INSERT ON public.squad_members
  FOR EACH ROW EXECUTE FUNCTION public.notify_squad_invite();
