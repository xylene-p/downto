-- Remove auto-join trigger: responding "down" to a check should NOT
-- auto-add users to the squad. They can join manually via "Join Squad →".

DROP TRIGGER IF EXISTS on_check_response_auto_join ON public.check_responses;
DROP FUNCTION IF EXISTS public.auto_join_squad_on_down_response();
