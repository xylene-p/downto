-- ============================================================================
-- Wrap all auth.uid() calls in RLS policies with (SELECT auth.uid())
-- so the value is evaluated once per query instead of once per row.
-- ============================================================================

-- ============================================================================
-- PROFILES
-- ============================================================================

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);

-- ============================================================================
-- EVENTS
-- ============================================================================

DROP POLICY IF EXISTS "Public events are viewable by everyone" ON public.events;
CREATE POLICY "Public events are viewable by everyone" ON public.events
  FOR SELECT USING (
    is_public = TRUE
    OR created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
      AND (
        (requester_id = (SELECT auth.uid()) AND addressee_id = events.created_by) OR
        (addressee_id = (SELECT auth.uid()) AND requester_id = events.created_by)
      )
    )
  );

DROP POLICY IF EXISTS "Users can create events" ON public.events;
CREATE POLICY "Users can create events" ON public.events
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = created_by);

DROP POLICY IF EXISTS "Users can update own events" ON public.events;
CREATE POLICY "Users can update own events" ON public.events
  FOR UPDATE USING (created_by = (SELECT auth.uid()));

-- ============================================================================
-- SAVED_EVENTS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own saved events" ON public.saved_events;
CREATE POLICY "Users can view own saved events" ON public.saved_events
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can save events" ON public.saved_events;
CREATE POLICY "Users can save events" ON public.saved_events
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own saves" ON public.saved_events;
CREATE POLICY "Users can update own saves" ON public.saved_events
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own saves" ON public.saved_events;
CREATE POLICY "Users can delete own saves" ON public.saved_events
  FOR DELETE USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Friends can see who is down" ON public.saved_events;
CREATE POLICY "Friends can see who is down" ON public.saved_events
  FOR SELECT USING (
    is_down = TRUE AND
    EXISTS (
      SELECT 1 FROM public.friendships
      WHERE status = 'accepted'
      AND (
        (requester_id = (SELECT auth.uid()) AND addressee_id = saved_events.user_id) OR
        (addressee_id = (SELECT auth.uid()) AND requester_id = saved_events.user_id)
      )
    )
  );

-- "Anyone can see who is down on public events" has no auth.uid() — no change needed

-- ============================================================================
-- FRIENDSHIPS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own friendships" ON public.friendships;
CREATE POLICY "Users can view own friendships" ON public.friendships
  FOR SELECT USING (requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can send friend requests" ON public.friendships;
CREATE POLICY "Users can send friend requests" ON public.friendships
  FOR INSERT WITH CHECK (requester_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update friendships they're part of" ON public.friendships;
CREATE POLICY "Users can update friendships they're part of" ON public.friendships
  FOR UPDATE USING (requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete friendships they're part of" ON public.friendships;
CREATE POLICY "Users can delete friendships they're part of" ON public.friendships
  FOR DELETE USING (requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid()));

-- ============================================================================
-- INTEREST_CHECKS
-- ============================================================================

DROP POLICY IF EXISTS "Interest checks visible to friends and fof" ON public.interest_checks;
CREATE POLICY "Interest checks visible to friends and fof" ON public.interest_checks
  FOR SELECT USING (
    author_id = (SELECT auth.uid())
    OR public.is_friend_or_fof((SELECT auth.uid()), author_id)
  );

DROP POLICY IF EXISTS "Users can create interest checks" ON public.interest_checks;
CREATE POLICY "Users can create interest checks" ON public.interest_checks
  FOR INSERT WITH CHECK (author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own interest checks" ON public.interest_checks;
CREATE POLICY "Users can delete own interest checks" ON public.interest_checks
  FOR DELETE USING (author_id = (SELECT auth.uid()));

-- ============================================================================
-- CHECK_RESPONSES
-- ============================================================================

DROP POLICY IF EXISTS "Responses visible to check participants and fof" ON public.check_responses;
CREATE POLICY "Responses visible to check participants and fof" ON public.check_responses
  FOR SELECT USING (
    user_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.interest_checks ic
      WHERE ic.id = check_responses.check_id
      AND (
        ic.author_id = (SELECT auth.uid())
        OR public.is_friend_or_fof((SELECT auth.uid()), ic.author_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can respond to checks" ON public.check_responses;
CREATE POLICY "Users can respond to checks" ON public.check_responses
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own responses" ON public.check_responses;
CREATE POLICY "Users can update own responses" ON public.check_responses
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- SQUADS
-- ============================================================================

DROP POLICY IF EXISTS "Squads visible to members" ON public.squads;
CREATE POLICY "Squads visible to members" ON public.squads
  FOR SELECT USING (
    created_by = (SELECT auth.uid()) OR
    public.is_squad_member(id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users can create squads" ON public.squads;
CREATE POLICY "Users can create squads" ON public.squads
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Squad members can update squad" ON public.squads;
CREATE POLICY "Squad members can update squad" ON public.squads
  FOR UPDATE USING (public.is_squad_member(id, (SELECT auth.uid())));

-- ============================================================================
-- SQUAD_MEMBERS
-- ============================================================================

DROP POLICY IF EXISTS "Squad members visible to squad members" ON public.squad_members;
CREATE POLICY "Squad members visible to squad members" ON public.squad_members
  FOR SELECT USING (public.is_squad_member(squad_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Squad creators or self can add members" ON public.squad_members;
CREATE POLICY "Squad creators or self can add members" ON public.squad_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.squads
      WHERE id = squad_members.squad_id AND created_by = (SELECT auth.uid())
    )
    OR user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Users can leave squads" ON public.squad_members;
CREATE POLICY "Users can leave squads" ON public.squad_members
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- MESSAGES
-- ============================================================================

DROP POLICY IF EXISTS "Messages visible to squad members" ON public.messages;
CREATE POLICY "Messages visible to squad members" ON public.messages
  FOR SELECT USING (public.is_squad_member(squad_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Squad members can send messages" ON public.messages;
CREATE POLICY "Squad members can send messages" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = (SELECT auth.uid()) AND
    public.is_squad_member(squad_id, (SELECT auth.uid()))
  );

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- "System can insert notifications" has no auth.uid() — no change needed

-- ============================================================================
-- PUSH_SUBSCRIPTIONS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.push_subscriptions
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert own subscriptions" ON public.push_subscriptions
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own subscriptions" ON public.push_subscriptions
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ============================================================================
-- CREW_POOL
-- ============================================================================

-- "Anyone can view crew pool" has no auth.uid() — no change needed

DROP POLICY IF EXISTS "Users can join crew pool" ON public.crew_pool;
CREATE POLICY "Users can join crew pool" ON public.crew_pool
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can leave crew pool" ON public.crew_pool;
CREATE POLICY "Users can leave crew pool" ON public.crew_pool
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- HIDDEN_CHECKS
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own hidden" ON public.hidden_checks;
CREATE POLICY "Users can view own hidden" ON public.hidden_checks
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can hide checks" ON public.hidden_checks;
CREATE POLICY "Users can hide checks" ON public.hidden_checks
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can unhide checks" ON public.hidden_checks;
CREATE POLICY "Users can unhide checks" ON public.hidden_checks
  FOR DELETE USING (user_id = (SELECT auth.uid()));
