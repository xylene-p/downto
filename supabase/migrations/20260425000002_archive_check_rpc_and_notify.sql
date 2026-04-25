-- Unify the check delete/archive flow on a SECURITY DEFINER RPC and notify
-- the people who actually committed (responded "down") that the plan is off.
--
-- Why an RPC instead of the existing client-side UPDATE:
--   1. The current archive UPDATE 42501s on staging — the consolidated SELECT
--      policy from 20260424000001 requires check_is_active (archived_at IS
--      NULL), which Postgres enforces as additional WITH CHECK on UPDATE, so
--      flipping archived_at non-null trips it. PR #430 was an incomplete fix
--      (Sentry DOWNTO-A is still open). SECURITY DEFINER sidesteps the
--      visibility policy entirely while we keep the auth check explicit.
--   2. We want archive + notification insert in a single transaction, so the
--      recipient never sees the notification for a not-yet-archived row.
--
-- Recipients are scoped to "down" responders only. friend_check already went
-- out at create time to all friends; firing another check_archived to that
-- broader set on every cancel would be noisy. Down responders are the people
-- who said they were coming — they're the ones who care that the plan is off.


-- 1. Extend the notifications.type CHECK constraint.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'check_response',
    'squad_message', 'squad_invite', 'friend_check', 'date_confirm',
    'check_tag', 'check_comment', 'poll_created', 'squad_join_request',
    'squad_mention', 'comment_mention', 'friend_event', 'event_reminder',
    'event_down', 'check_date_updated', 'event_date_updated',
    'check_text_updated',
    'check_archived'
  ));


-- 2. archive_interest_check(p_check_id) — SECURITY DEFINER.
--    Auth: caller must be the author or an accepted co-author.
--    Effect: sets archived_at = now() if not already, then inserts a
--    check_archived notification per "down" responder (excluding the author)
--    with a randomly chosen phrase. Idempotent — re-archiving an already
--    archived row is a no-op.
CREATE OR REPLACE FUNCTION public.archive_interest_check(p_check_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_author_id UUID;
  v_text TEXT;
  v_phrase TEXT;
  v_recipient UUID;
  v_phrases TEXT[] := ARRAY[
    'the check got deleted',
    'rip — they bailed',
    'this one is off the table',
    'cancelled. it happens.',
    'the check disintegrated',
    'plan dissolved',
    'they pulled the plug',
    'check went poof',
    'the check has left the building',
    'scratch that one'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT author_id, text INTO v_author_id, v_text
  FROM public.interest_checks
  WHERE id = p_check_id;

  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Check not found';
  END IF;

  IF v_author_id <> v_caller AND NOT public.is_check_coauthor(p_check_id, v_caller) THEN
    RAISE EXCEPTION 'Not authorized to archive this check';
  END IF;

  -- Only proceed if currently active. Re-archiving is a silent no-op so
  -- duplicate clicks don't fan out duplicate notifications.
  UPDATE public.interest_checks
    SET archived_at = now()
    WHERE id = p_check_id AND archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_recipient IN
    SELECT user_id FROM public.check_responses
    WHERE check_id = p_check_id
      AND response = 'down'
      AND user_id <> v_author_id
  LOOP
    v_phrase := v_phrases[1 + floor(random() * array_length(v_phrases, 1))::int];
    INSERT INTO public.notifications (
      user_id, type, title, body, related_user_id, related_check_id
    )
    VALUES (
      v_recipient,
      'check_archived',
      v_phrase,
      LEFT(COALESCE(v_text, 'a check'), 120),
      v_author_id,
      p_check_id
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_interest_check(UUID) TO authenticated;
