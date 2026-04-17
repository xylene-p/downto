-- Add event_id to check_comments so the same table supports both
ALTER TABLE public.check_comments
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_check_comments_event_created
  ON public.check_comments(event_id, created_at ASC);

-- Update SELECT policy to also allow event viewers
DROP POLICY IF EXISTS "Comments visible to check viewers" ON public.check_comments;
CREATE POLICY "Comments visible to check or event viewers" ON public.check_comments
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR (check_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_comments.check_id
      AND (
        ic.author_id = (SELECT auth.uid())
        OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
      )
    ))
    OR (event_id IS NOT NULL)
  );

-- Update INSERT policy
DROP POLICY IF EXISTS "Users can comment on visible checks" ON public.check_comments;
CREATE POLICY "Users can comment on checks or events" ON public.check_comments
  FOR INSERT WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
      (check_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.interest_checks ic
        WHERE ic.id = check_comments.check_id
        AND (
          ic.author_id = (SELECT auth.uid())
          OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
        )
      ))
      OR (event_id IS NOT NULL)
    )
  );
