-- Notify the tagger when a co-author accepts their tag
CREATE OR REPLACE FUNCTION public.auto_down_on_coauthor_accept()
RETURNS TRIGGER AS $$
DECLARE
  accepter_name TEXT;
  check_text TEXT;
BEGIN
  IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    -- Auto-respond "down"
    INSERT INTO public.check_responses (check_id, user_id, response)
    VALUES (NEW.check_id, NEW.user_id, 'down')
    ON CONFLICT (check_id, user_id) DO UPDATE SET response = 'down';

    -- Notify the person who tagged them
    SELECT display_name INTO accepter_name
      FROM public.profiles WHERE id = NEW.user_id;

    SELECT text INTO check_text
      FROM public.interest_checks WHERE id = NEW.check_id;

    INSERT INTO public.notifications (user_id, type, title, body, related_user_id, related_check_id)
    VALUES (
      NEW.invited_by,
      'check_tag',
      accepter_name || ' accepted your tag',
      LEFT(check_text, 80),
      NEW.user_id,
      NEW.check_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
