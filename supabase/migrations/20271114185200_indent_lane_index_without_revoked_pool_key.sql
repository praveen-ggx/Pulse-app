-- Indent INSERT evaluates indents_org_pool_key_live_idx as the inserting role.
-- That index called _pool_key, which is revoked from authenticated, anon, and
-- PUBLIC, so creating an indent failed with
-- "permission denied for function _pool_key" before the row committed.
--
-- standing_lane_key is the same lane identity (lower + btrim of the JS trim
-- set, NULL when any part is blank) and is executable by authenticated.
-- _pool_key stays revoked. SECURITY DEFINER readers may still call it; this
-- index is what an indent write has to execute itself.
--
-- Sort key is after 20271114174600. Not applied. Do not push until authorized.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.standing_lane_key(
  p_pickup text,
  p_drop text,
  p_vehicle_type text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  SELECT CASE
    WHEN k.pickup = '' OR k.drop = '' OR k.vehicle = '' THEN NULL
    ELSE k.pickup || '|' || k.drop || '|' || k.vehicle
  END
  FROM (
    SELECT
      pg_catalog.lower(pg_catalog.btrim(
        coalesce(p_pickup, ''),
        E' \t\n\u000B\f\r\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'
      )) AS pickup,
      pg_catalog.lower(pg_catalog.btrim(
        coalesce(p_drop, ''),
        E' \t\n\u000B\f\r\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'
      )) AS drop,
      pg_catalog.lower(pg_catalog.btrim(
        coalesce(p_vehicle_type, ''),
        E' \t\n\u000B\f\r\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'
      )) AS vehicle
  ) k;
$$;

REVOKE ALL ON FUNCTION public.standing_lane_key(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.standing_lane_key(text, text, text) TO authenticated, service_role;

DROP INDEX IF EXISTS public.indents_org_pool_key_live_idx;

CREATE INDEX indents_org_pool_key_live_idx
  ON public.indents (
    organization_id,
    public.standing_lane_key(pickup_area, drop_location, vehicle_type)
  )
  WHERE deleted_at IS NULL;
