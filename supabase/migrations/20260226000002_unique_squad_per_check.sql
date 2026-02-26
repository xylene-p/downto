-- Re-run merge for any new duplicate squads, then add unique index to
-- prevent this at the DB level going forward.

DO $$
DECLARE
  rec RECORD;
  orig_id UUID;
  dupe RECORD;
BEGIN
  FOR rec IN
    SELECT check_id
    FROM public.squads
    WHERE check_id IS NOT NULL AND archived_at IS NULL
    GROUP BY check_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO orig_id
    FROM public.squads
    WHERE check_id = rec.check_id AND archived_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    FOR dupe IN
      SELECT id FROM public.squads
      WHERE check_id = rec.check_id AND archived_at IS NULL AND id != orig_id
      ORDER BY created_at ASC
    LOOP
      INSERT INTO public.squad_members (squad_id, user_id)
      SELECT orig_id, user_id
      FROM public.squad_members
      WHERE squad_id = dupe.id
      ON CONFLICT (squad_id, user_id) DO NOTHING;

      UPDATE public.squads SET archived_at = NOW() WHERE id = dupe.id;
    END LOOP;
  END LOOP;
END;
$$;

-- One active squad per check — enforced at DB level
CREATE UNIQUE INDEX IF NOT EXISTS idx_squads_one_active_per_check
  ON public.squads (check_id)
  WHERE check_id IS NOT NULL AND archived_at IS NULL;
