-- Add max_squad_size to interest_checks (default 5)
ALTER TABLE public.interest_checks
  ADD COLUMN max_squad_size INT NOT NULL DEFAULT 5;

-- Trigger: auto-add "down" responders to existing squad if room
CREATE OR REPLACE FUNCTION public.auto_join_squad_on_down_response()
RETURNS TRIGGER AS $$
DECLARE
  v_squad_id UUID;
  v_max_size INT;
  v_current_count INT;
BEGIN
  -- Only act on "down" responses
  IF NEW.response != 'down' THEN RETURN NEW; END IF;

  -- Find squad linked to this check
  SELECT s.id INTO v_squad_id
  FROM public.squads s
  WHERE s.check_id = NEW.check_id
  LIMIT 1;

  IF v_squad_id IS NULL THEN RETURN NEW; END IF;

  -- Get max size from the interest check
  SELECT ic.max_squad_size INTO v_max_size
  FROM public.interest_checks ic
  WHERE ic.id = NEW.check_id;

  -- Count current members
  SELECT COUNT(*) INTO v_current_count
  FROM public.squad_members
  WHERE squad_id = v_squad_id;

  -- Add if room (UNIQUE constraint prevents duplicates)
  IF v_current_count < v_max_size THEN
    INSERT INTO public.squad_members (squad_id, user_id)
    VALUES (v_squad_id, NEW.user_id)
    ON CONFLICT (squad_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_check_response_auto_join
  AFTER INSERT OR UPDATE ON public.check_responses
  FOR EACH ROW EXECUTE FUNCTION public.auto_join_squad_on_down_response();
