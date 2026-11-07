-- Signup looks up free-mail domains through SECURITY DEFINER functions.
-- The table itself stays readable by anon and authenticated, and is not writable by them.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.public_email_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_email_domains_read ON public.public_email_domains;
CREATE POLICY public_email_domains_read
  ON public.public_email_domains
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON TABLE public.public_email_domains FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_email_domains TO anon, authenticated;
