-- Replace the partial unique index on (user_id, device_token) with a real
-- unique constraint so PostgREST's `onConflict: user_id,device_token` upsert
-- can find a matching constraint.
--
-- Background: 20260403000001 added
--   CREATE UNIQUE INDEX push_subscriptions_user_device_token_key
--     ON push_subscriptions (user_id, device_token)
--     WHERE device_token IS NOT NULL;
--
-- Postgres can use partial indexes for ON CONFLICT only if the INSERT also
-- specifies the same WHERE predicate, and PostgREST's `onConflict` query
-- parameter doesn't emit one. Result: every native-push subscribe upsert
-- fails with "there is no unique or exclusion constraint matching the
-- ON CONFLICT specification" → API route returns 500 → push token never
-- saved.
--
-- A non-partial UNIQUE constraint is functionally equivalent here: web push
-- rows have device_token = NULL, and standard SQL treats NULL ≠ NULL for
-- uniqueness, so multiple web-push rows per user are still allowed.

DROP INDEX IF EXISTS public.push_subscriptions_user_device_token_key;

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_user_device_token_key
  UNIQUE (user_id, device_token);
