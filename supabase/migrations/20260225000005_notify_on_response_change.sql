-- Fix: notify check author when a response is UPDATED (e.g. maybe → down)
-- The trigger previously only fired on INSERT. Since respondToCheck() uses
-- upsert, changing a response is an UPDATE and was silently skipped.

CREATE OR REPLACE FUNCTION public.notify_check_response()
RETURNS TRIGGER AS $$
DECLARE
  responder_name TEXT;
  check_author_id UUID;
  check_text TEXT;
BEGIN
  -- On UPDATE, only notify if the response actually changed
  IF TG_OP = 'UPDATE' AND OLD.response = NEW.response THEN
    RETURN NEW;
  END IF;

  SELECT ic.author_id, ic.text INTO check_author_id, check_text
  FROM public.interest_checks ic WHERE ic.id = NEW.check_id;

  -- Don't notify if author responds to own check
  IF check_author_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT display_name INTO responder_name
  FROM public.profiles WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
  VALUES (
    check_author_id,
    'check_response',
    'New response to your check',
    responder_name || ' is ' || NEW.response || ' for "' || LEFT(check_text, 40) || '"',
    NEW.user_id,
    NEW.check_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger to fire on both INSERT and UPDATE
DROP TRIGGER IF EXISTS on_check_response ON public.check_responses;
CREATE TRIGGER on_check_response
  AFTER INSERT OR UPDATE ON public.check_responses
  FOR EACH ROW EXECUTE FUNCTION public.notify_check_response();
