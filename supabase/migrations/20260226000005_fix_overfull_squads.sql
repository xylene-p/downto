-- Clean up squads that have more members than max_squad_size.
-- Keep the earliest-joined members, remove the rest.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT s.id AS squad_id, ic.max_squad_size
    FROM public.squads s
    JOIN public.interest_checks ic ON ic.id = s.check_id
    WHERE s.archived_at IS NULL
      AND s.check_id IS NOT NULL
      AND (SELECT COUNT(*) FROM public.squad_members sm WHERE sm.squad_id = s.id) > ic.max_squad_size
  LOOP
    -- Delete members beyond the limit (keep earliest joined)
    DELETE FROM public.squad_members
    WHERE squad_id = rec.squad_id
      AND user_id NOT IN (
        SELECT user_id FROM public.squad_members
        WHERE squad_id = rec.squad_id
        ORDER BY joined_at ASC
        LIMIT rec.max_squad_size
      );
  END LOOP;
END;
$$;

-- Prevent joins that would exceed max_squad_size
CREATE OR REPLACE FUNCTION public.enforce_squad_max_size()
RETURNS TRIGGER AS $$
DECLARE
  v_max_size INT;
  v_current_count INT;
  v_check_id UUID;
BEGIN
  -- Get check_id for this squad
  SELECT check_id INTO v_check_id
  FROM public.squads WHERE id = NEW.squad_id;

  -- Only enforce for check-based squads
  IF v_check_id IS NOT NULL THEN
    SELECT max_squad_size INTO v_max_size
    FROM public.interest_checks WHERE id = v_check_id;

    SELECT COUNT(*) INTO v_current_count
    FROM public.squad_members WHERE squad_id = NEW.squad_id;

    IF v_current_count >= v_max_size THEN
      RAISE EXCEPTION 'Squad is full (%/%)' , v_current_count, v_max_size
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_squad_max_size
  BEFORE INSERT ON public.squad_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_squad_max_size();
