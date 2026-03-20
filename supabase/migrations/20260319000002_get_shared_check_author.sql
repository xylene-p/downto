-- RPC to get the author profile of a shared check (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_shared_check_author(p_check_id UUID)
RETURNS SETOF public.profiles
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.* FROM public.profiles p
  JOIN public.interest_checks ic ON ic.author_id = p.id
  WHERE ic.id = p_check_id
    AND ic.shared_at IS NOT NULL
    AND ic.archived_at IS NULL;
$$;
