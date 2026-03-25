-- RPC to check if an email already exists in auth.users.
-- SECURITY DEFINER so it can read auth.users from the service client.
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM auth.users WHERE email = LOWER(p_email);
$$ LANGUAGE sql SECURITY DEFINER STABLE;
