-- ============================================================================
-- TEST SEED DATA
-- ============================================================================
-- Creates test users via Supabase auth, profiles, friendships, events,
-- interest checks, a squad with messages — everything the E2E tests need.
--
-- This runs after all migrations via `supabase db reset` or `supabase start`.
-- ============================================================================

-- ─── Test users (created via auth.users so profile trigger fires) ────────────

-- User 1: kat@test.com
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, role, aud, created_at, updated_at)
VALUES (
  'a1111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'kat@test.com',
  crypt('testpass123', gen_salt('bf')),
  now(),
  '{"username": "kat", "display_name": "Kat"}'::jsonb,
  'authenticated',
  'authenticated',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- User 2: sara@test.com
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, role, aud, created_at, updated_at)
VALUES (
  'b2222222-2222-2222-2222-222222222222',
  '00000000-0000-0000-0000-000000000000',
  'sara@test.com',
  crypt('testpass123', gen_salt('bf')),
  now(),
  '{"username": "sara", "display_name": "Sara"}'::jsonb,
  'authenticated',
  'authenticated',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Mark profiles as onboarded
UPDATE public.profiles SET onboarded = true WHERE id IN (
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222'
);

-- ─── Friendship (accepted) ───────────────────────────────────────────────────

INSERT INTO public.friendships (id, requester_id, addressee_id, status)
VALUES (
  'f1111111-1111-1111-1111-111111111111',
  'a1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'accepted'
) ON CONFLICT DO NOTHING;

-- ─── Public event (today) ────────────────────────────────────────────────────

INSERT INTO public.events (id, title, venue, date, date_display, time_display, vibes, is_public, created_by)
VALUES (
  'e1111111-1111-1111-1111-111111111111',
  'Test Night Out',
  'The Warehouse',
  CURRENT_DATE,
  'Tonight',
  '10 PM',
  ARRAY['house', 'techno'],
  true,
  'a1111111-1111-1111-1111-111111111111'
) ON CONFLICT (id) DO NOTHING;

-- A future event (tomorrow) — should NOT appear in tonight feed
INSERT INTO public.events (id, title, venue, date, date_display, time_display, vibes, is_public, created_by)
VALUES (
  'e2222222-2222-2222-2222-222222222222',
  'Tomorrow Hangout',
  'Rooftop Bar',
  CURRENT_DATE + 1,
  'Tomorrow',
  '8 PM',
  ARRAY['chill'],
  true,
  'b2222222-2222-2222-2222-222222222222'
) ON CONFLICT (id) DO NOTHING;

-- ─── Interest check (from Sara, visible to Kat via friendship) ───────────────

INSERT INTO public.interest_checks (id, author_id, text, expires_at)
VALUES (
  'c1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222',
  'anyone down for drinks tonight?',
  now() + interval '24 hours'
) ON CONFLICT (id) DO NOTHING;

-- ─── Squad with messages ─────────────────────────────────────────────────────

INSERT INTO public.squads (id, name, check_id, created_by)
VALUES (
  'd1111111-1111-1111-1111-111111111111',
  'Drinks Crew',
  'c1111111-1111-1111-1111-111111111111',
  'b2222222-2222-2222-2222-222222222222'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.squad_members (squad_id, user_id) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111'),
  ('d1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

INSERT INTO public.messages (squad_id, sender_id, text, created_at) VALUES
  ('d1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'hey! where should we meet?', now() - interval '10 minutes'),
  ('d1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'how about the lobby at 9?', now() - interval '5 minutes')
ON CONFLICT DO NOTHING;
