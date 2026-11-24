-- 2026-09-22 saturation incident (supabase_logs-49):
--   1) 23502 null url on net.http_request_queue (separate from pool saturation)
--   2) 42501 on get_drivers_with_profiles + get_connection_partner_display
--
-- Do not make http_request_queue.url nullable. Reject empty URLs before enqueue.
-- Re-assert EXECUTE for authenticated only; never grant to anon/PUBLIC.

CREATE OR REPLACE FUNCTION public.net_http_post_if_url(
  url text,
  headers jsonb DEFAULT '{}'::jsonb,
  body jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
BEGIN
  IF url IS NULL OR btrim(url) = '' THEN
    RETURN NULL;
  END IF;
  IF url !~* '^https?://' THEN
    RETURN NULL;
  END IF;

  RETURN net.http_post(
    url := url,
    headers := COALESCE(headers, '{}'::jsonb),
    body := COALESCE(body, '{}'::jsonb),
    timeout_milliseconds := COALESCE(timeout_milliseconds, 5000)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.net_http_post_if_url(text, jsonb, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.net_http_post_if_url(text, jsonb, jsonb, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.net_http_post_if_url(text, jsonb, jsonb, integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.net_http_post_if_url(text, jsonb, jsonb, integer) TO service_role;

-- Remaining cron jobs that still concatenate current_setting('app.supabase_url')
-- can enqueue a NULL url when the GUC is unset. Route those through the guard
-- by rewriting the command text in place (job identity / schedule unchanged).
DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid, command
    FROM cron.job
    WHERE command ILIKE '%net.http_post%'
      AND command ILIKE '%current_setting%supabase_url%'
  LOOP
    UPDATE cron.job
    SET command = replace(r.command, 'net.http_post', 'public.net_http_post_if_url')
    WHERE jobid = r.jobid;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.get_drivers_with_profiles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_drivers_with_profiles(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_drivers_with_profiles(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_connection_partner_display(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_connection_partner_display(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_connection_partner_display_batch(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_connection_partner_display_batch(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_connection_partner_display_batch(uuid[]) TO authenticated;
