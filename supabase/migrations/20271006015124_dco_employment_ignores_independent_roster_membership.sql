-- DCO employment predicate: independent roster membership and trip-assignment
-- stubs are not employment.
--
-- 20270915103100 (ADR-010 backfill) created an active organization_members
-- row (role 'driver') for every linked roster driver, including drivers whose
-- roster row is relationship_status = 'independent' and tracking_only
-- trip-assignment stubs (relationship_origin 'market_award' = the shipper that
-- awarded a Marketplace/Reach bid, 'phone_assignment', legacy). 20271005120000
-- treats any such membership as employment, so approved DCOs resolve to
-- DCO_EMPLOYMENT_CONFLICT (a shipper becomes their "employer") and are denied
-- Marketplace listing and bidding.
--
-- A driver membership no longer counts when the org has at least one current
-- roster row for that user and every such row is either 'independent' or
-- tracking_only. Everything else still counts:
--   * any current drivers row with relationship_status = 'active_employee';
--   * a membership with no current roster row in that org;
--   * a membership whose org has any current non-tracking_only roster row that
--     is NULL or not 'independent' (ambiguous data stays blocked).
--
-- Same signature, language, volatility, security and search_path as
-- 20271005120000. Callers (is_dco_eligible, get_my_driver_operating_mode,
-- platform_approve_dco, platform_reinstate_dco) are unchanged.

CREATE OR REPLACE FUNCTION public._is_active_employee_driver(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = p_user_id AND om.role = 'driver' AND om.status = 'active'
        AND NOT (
          EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.user_id = om.user_id
              AND d.organization_id = om.organization_id
              AND d.left_at IS NULL
              AND d.deleted_at IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.user_id = om.user_id
              AND d.organization_id = om.organization_id
              AND d.left_at IS NULL
              AND d.deleted_at IS NULL
              AND d.tracking_only IS NOT TRUE
              AND d.relationship_status IS DISTINCT FROM 'independent'
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.drivers d
      WHERE d.user_id = p_user_id
        AND d.left_at IS NULL
        AND d.relationship_status = 'active_employee'
    );
$function$;

REVOKE ALL ON FUNCTION public._is_active_employee_driver(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._is_active_employee_driver(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._is_active_employee_driver(uuid) FROM authenticated;
