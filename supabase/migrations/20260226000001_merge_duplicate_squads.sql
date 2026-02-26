-- Cleanup: merge duplicate squads created by the maybe→down bug.
-- For each check with multiple active squads, keep the oldest and archive
-- the rest after moving members into the original.
-- Then add a unique index so this can never happen again.

DO $$
DECLARE
  rec RECORD;
  orig_id UUID;
  dupe RECORD;
BEGIN
  -- Find checks that have more than one active squad
  FOR rec IN
    SELECT check_id
    FROM public.squads
    WHERE check_id IS NOT NULL AND archived_at IS NULL
    GROUP BY check_id
    HAVING COUNT(*) > 1
  LOOP
    -- The original squad is the oldest one
    SELECT id INTO orig_id
    FROM public.squads
    WHERE check_id = rec.check_id AND archived_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    -- For each duplicate (all except the original)
    FOR dupe IN
      SELECT id FROM public.squads
      WHERE check_id = rec.check_id AND archived_at IS NULL AND id != orig_id
      ORDER BY created_at ASC
    LOOP
      -- Move members to original (skip if already there)
      INSERT INTO public.squad_members (squad_id, user_id)
      SELECT orig_id, user_id
      FROM public.squad_members
      WHERE squad_id = dupe.id
      ON CONFLICT (squad_id, user_id) DO NOTHING;

      -- Archive the duplicate
      UPDATE public.squads SET archived_at = NOW() WHERE id = dupe.id;
    END LOOP;
  END LOOP;
END;
$$;

-- Prevent future duplicates: only one active squad per check
CREATE UNIQUE INDEX IF NOT EXISTS idx_squads_one_active_per_check
  ON public.squads (check_id)
  WHERE check_id IS NOT NULL AND archived_at IS NULL;
