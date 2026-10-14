-- Driver mobile for a batch of trips (Debit control table).
-- Most aggregate-trip drivers belong to the vendor's organization, so drivers
-- RLS hides them from the dispatching org and the column showed "—" for ~90%
-- of trips. This returns only the phone, only for trips the caller can already
-- see: staff of the trip's org, and Ground Ops limited to their warehouses.

CREATE OR REPLACE FUNCTION public.get_trip_driver_phones(p_trip_ids uuid[])
 RETURNS TABLE (trip_id uuid, phone text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT t.id, NULLIF(btrim(d.phone), '')
  FROM public.trips t
  JOIN public.drivers d ON d.id = t.driver_id
  WHERE cardinality(p_trip_ids) <= 500
    AND t.id = ANY (p_trip_ids)
    AND t.deleted_at IS NULL
    AND public.is_org_staff(t.organization_id)
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.organization_id = t.organization_id
          AND om.user_id = (SELECT auth.uid())
          AND om.status = 'active'
          AND COALESCE(om.permissions ->> 'platformRole', '') = 'ground_ops'
      )
      OR public.ground_ops_can_see_trip(t.organization_id, t.indent_id)
    );
$function$;

REVOKE ALL ON FUNCTION public.get_trip_driver_phones(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trip_driver_phones(uuid[]) TO authenticated;
