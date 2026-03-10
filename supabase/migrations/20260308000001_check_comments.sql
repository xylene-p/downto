-- ============================================================================
-- Check Comments: Public comments on interest checks
-- ============================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.check_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID NOT NULL REFERENCES public.interest_checks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) <= 280),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_check_comments_check_created ON public.check_comments(check_id, created_at ASC);

-- 2. RLS
ALTER TABLE public.check_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments visible to check viewers"
  ON public.check_comments FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_comments.check_id
      AND (
        ic.author_id = (SELECT auth.uid())
        OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
      )
    )
  );

CREATE POLICY "Users can comment on visible checks"
  ON public.check_comments FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_comments.check_id
      AND (
        ic.author_id = (SELECT auth.uid())
        OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
      )
    )
  );

CREATE POLICY "Users can delete own comments"
  ON public.check_comments FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- 3. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.check_comments;
