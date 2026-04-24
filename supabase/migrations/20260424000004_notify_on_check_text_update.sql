-- Notify interested users when an interest check's title/text is edited.
-- Recipients: union of "down" responders + people who commented on the check,
-- minus the author, deduped.


-- 1. Extend the notifications.type constraint with 'check_text_updated'.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention', 'comment_mention', 'friend_event', 'event_reminder',
    'event_down', 'check_date_updated', 'event_date_updated',
    'check_text_updated'
  ));


-- 2. Trigger function — fires when text actually changes, notifies the
-- union (down responders ∪ commenters) minus the author, deduped.
CREATE OR REPLACE FUNCTION public.notify_check_text_updated()
RETURNS TRIGGER AS $$
DECLARE
  v_author_name TEXT;
  v_body TEXT;
  v_recipient UUID;
BEGIN
  IF NEW.text IS NOT DISTINCT FROM OLD.text THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO v_author_name
  FROM public.profiles WHERE id = NEW.author_id;
  v_author_name := COALESCE(v_author_name, 'Someone');

  v_body := LEFT(COALESCE(NEW.text, 'an interest check'), 120);

  FOR v_recipient IN
    SELECT uid FROM (
      SELECT cr.user_id AS uid
        FROM public.check_responses cr
        WHERE cr.check_id = NEW.id
          AND cr.response = 'down'
      UNION
      SELECT cc.user_id AS uid
        FROM public.check_comments cc
        WHERE cc.check_id = NEW.id
    ) recipients
    WHERE uid <> NEW.author_id
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      v_recipient,
      'check_text_updated',
      v_author_name || ' updated the check',
      v_body,
      NEW.author_id,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


DROP TRIGGER IF EXISTS on_check_text_updated ON public.interest_checks;
CREATE TRIGGER on_check_text_updated
  AFTER UPDATE ON public.interest_checks
  FOR EACH ROW EXECUTE FUNCTION public.notify_check_text_updated();
