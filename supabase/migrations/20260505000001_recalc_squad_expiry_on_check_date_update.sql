-- When an interest check's event_date changes, recalculate the linked squad's
-- expires_at to match. Uses the same formula as set_squad_expiry() and
-- reactivate_squad(): (event_date + 1 day) + 24h grace, or NOW() + 24h when
-- the date is cleared. Only touches active (non-archived) squads — reviving
-- an archived squad stays a separate, explicit action.

CREATE OR REPLACE FUNCTION public.recalc_squad_expiry_on_check_date_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_date IS NOT DISTINCT FROM OLD.event_date THEN
    RETURN NEW;
  END IF;

  UPDATE public.squads
  SET expires_at = CASE
    WHEN NEW.event_date IS NOT NULL
      THEN (NEW.event_date + INTERVAL '1 day') + INTERVAL '24 hours'
    ELSE NOW() + INTERVAL '24 hours'
  END
  WHERE check_id = NEW.id
    AND archived_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_check_date_recalc_squad_expiry ON public.interest_checks;
CREATE TRIGGER on_check_date_recalc_squad_expiry
  AFTER UPDATE ON public.interest_checks
  FOR EACH ROW EXECUTE FUNCTION public.recalc_squad_expiry_on_check_date_change();
