-- Add friend_check notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('friend_request', 'friend_accepted', 'check_response',
                  'squad_message', 'squad_invite', 'friend_check'));

-- Notify direct friends when someone posts an interest check
CREATE OR REPLACE FUNCTION public.notify_friend_check()
RETURNS TRIGGER AS $$
DECLARE
  author_name TEXT;
  friend_id UUID;
BEGIN
  SELECT display_name INTO author_name
  FROM public.profiles WHERE id = NEW.author_id;

  FOR friend_id IN
    SELECT CASE
      WHEN requester_id = NEW.author_id THEN addressee_id
      ELSE requester_id
    END
    FROM public.friendships
    WHERE status = 'accepted'
      AND (requester_id = NEW.author_id OR addressee_id = NEW.author_id)
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      friend_id,
      'friend_check',
      author_name,
      LEFT(NEW.text, 80),
      NEW.author_id,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_friend_check ON public.interest_checks;
CREATE TRIGGER on_friend_check
  AFTER INSERT ON public.interest_checks
  FOR EACH ROW EXECUTE FUNCTION public.notify_friend_check();
