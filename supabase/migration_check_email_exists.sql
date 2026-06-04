-- Internal RPC function to check if a confirmed email exists in auth.users
-- Only callable by service_role (used by secure-signup Edge Function)
-- NOT exposed to anon/authenticated to prevent email enumeration

CREATE OR REPLACE FUNCTION public.check_email_exists_internal(email_input text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE email = lower(email_input)
      AND email_confirmed_at IS NOT NULL
  );
$$;

-- Only service_role can call this function
REVOKE ALL ON FUNCTION public.check_email_exists_internal(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_email_exists_internal(text) TO service_role;
