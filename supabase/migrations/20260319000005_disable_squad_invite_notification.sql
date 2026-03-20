-- Disable the squad_invite notification trigger since squads are now
-- auto-created and the notification is no longer needed
DROP TRIGGER IF EXISTS on_squad_member_added ON public.squad_members;
