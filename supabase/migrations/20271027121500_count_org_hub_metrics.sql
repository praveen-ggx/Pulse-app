-- Exact hub / profile metrics. One pass on trips + set-based indent counts.
-- Do not derive these numbers from get_trips_for_org (newest 400) or list pages.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.count_org_hub_metrics(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH trip_counts AS (
    SELECT
      count(*) FILTER (WHERE t.deleted_at IS NULL)::int AS trips_total,
      count(*) FILTER (
        WHERE t.deleted_at IS NULL
          AND lower(coalesce(t.status, '')) IN ('completed', 'delivered', 'done')
      )::int AS trips_completed,
      count(*) FILTER (
        WHERE t.deleted_at IS NULL
          AND lower(coalesce(t.status, '')) = 'cancelled'
      )::int AS trips_cancelled,
      count(*) FILTER (
        WHERE t.deleted_at IS NULL
          AND lower(coalesce(t.status, '')) NOT IN ('completed', 'delivered', 'done', 'cancelled')
      )::int AS trips_active,
      count(*) FILTER (
        WHERE t.deleted_at IS NULL
          AND lower(coalesce(t.status, '')) NOT IN ('completed', 'delivered', 'done')
          AND (
            t.driver_id IS NULL
            OR btrim(t.driver_id::text) = ''
            OR lower(coalesce(t.status, '')) IN ('cancelled', 'draft')
          )
      )::int AS unassigned,
      count(*) FILTER (
        WHERE t.deleted_at IS NULL
          AND t.driver_id IS NOT NULL
          AND btrim(t.driver_id::text) <> ''
          AND lower(coalesce(t.status, '')) = 'assigned'
      )::int AS assigned,
      count(*) FILTER (
        WHERE t.deleted_at IS NULL
          AND t.driver_id IS NOT NULL
          AND btrim(t.driver_id::text) <> ''
          AND lower(coalesce(t.status, '')) IN ('picked_up', 'pickup', 'in_progress')
      )::int AS loading,
      count(*) FILTER (
        WHERE t.deleted_at IS NULL
          AND t.driver_id IS NOT NULL
          AND btrim(t.driver_id::text) <> ''
          AND lower(coalesce(t.status, '')) IN ('in_transit', 'dispatched', 'transit')
      )::int AS in_transit,
      count(*) FILTER (
        WHERE t.deleted_at IS NULL
          AND t.driver_id IS NOT NULL
          AND btrim(t.driver_id::text) <> ''
          AND lower(coalesce(t.status, '')) IN ('unloading', 'arrived', 'at_destination', 'at_drop')
      )::int AS unloading
    FROM public.trips t
    WHERE t.organization_id = p_org_id
  ),
  indent_counts AS (
    SELECT
      count(*) FILTER (
        WHERE i.deleted_at IS NULL
          AND lower(coalesce(i.status, '')) NOT IN ('completed', 'cancelled', 'closed', 'expired')
          AND NOT EXISTS (
            SELECT 1
            FROM public.trips t
            WHERE t.indent_id = i.id
              AND t.organization_id = p_org_id
              AND t.deleted_at IS NULL
          )
      )::int AS indent_unallocated,
      count(*) FILTER (
        WHERE i.deleted_at IS NULL
          AND lower(coalesce(i.status, '')) IN ('cancelled', 'expired')
      )::int AS indent_failed,
      count(*) FILTER (
        WHERE i.deleted_at IS NULL
          AND i.cancel_reason = 'client_cancelled'
      )::int AS fail_client_cancelled,
      count(*) FILTER (
        WHERE i.deleted_at IS NULL
          AND (
            i.cancel_reason = 'indent_expired'
            OR (
              lower(coalesce(i.status, '')) = 'expired'
              AND coalesce(i.cancel_reason, '') NOT IN (
                'client_cancelled', 'no_rates_available', 'wrong_entry'
              )
            )
          )
      )::int AS fail_indent_expired,
      count(*) FILTER (
        WHERE i.deleted_at IS NULL
          AND i.cancel_reason = 'no_rates_available'
      )::int AS fail_no_rates_available,
      count(*) FILTER (
        WHERE i.deleted_at IS NULL
          AND i.cancel_reason = 'wrong_entry'
      )::int AS fail_wrong_entry
    FROM public.indents i
    WHERE i.organization_id = p_org_id
  )
  SELECT jsonb_build_object(
    'trips_total', tc.trips_total,
    'trips_completed', tc.trips_completed,
    'trips_cancelled', tc.trips_cancelled,
    'trips_active', tc.trips_active,
    'unassigned', tc.unassigned,
    'assigned', tc.assigned,
    'loading', tc.loading,
    'in_transit', tc.in_transit,
    'unloading', tc.unloading,
    'delivered_docs_pending', tc.trips_completed,
    'indent_unallocated', ic.indent_unallocated,
    'indent_failed', ic.indent_failed,
    'fail_client_cancelled', ic.fail_client_cancelled,
    'fail_indent_expired', ic.fail_indent_expired,
    'fail_no_rates_available', ic.fail_no_rates_available,
    'fail_wrong_entry', ic.fail_wrong_entry
  )
  FROM trip_counts tc, indent_counts ic;
$$;

REVOKE ALL ON FUNCTION public.count_org_hub_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_org_hub_metrics(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.count_org_hub_metrics(uuid) IS
  'Exact org hub/profile counters. Never derive these from a paginated trip catalog.';
