-- hub_metric_contrib: Unassigned no longer counts cancelled trips, matching
-- count_org_hub_metrics and hub_tile_match (20271124132234, Vasanth's decision).
-- Only the unassigned predicate changes. The projection trigger is not enabled
-- and nothing reads hub_metric_counter, so no counter rows change.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.hub_metric_contrib(tr trips)
 RETURNS TABLE(organization_id uuid, bucket text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT o.organization_id, b.bucket
  FROM (
    SELECT tr.organization_id
    WHERE tr.deleted_at IS NULL
      AND tr.organization_id IS NOT NULL
    UNION
    SELECT s.linked_organization_id
    FROM public.suppliers s
    WHERE tr.deleted_at IS NULL
      AND tr.supplier_id IS NOT NULL
      AND tr.indent_id IS NOT NULL
      AND s.id = tr.supplier_id
      AND s.linked_organization_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.trips m
        WHERE m.organization_id = s.linked_organization_id
          AND m.source = 'mover_asset'
          AND m.source_indent_id = tr.indent_id
          AND m.deleted_at IS NULL
      )
  ) o
  CROSS JOIN LATERAL (
    SELECT x.bucket
    FROM (
      SELECT 'active'::text AS bucket
      WHERE lower(coalesce(tr.status, '')) NOT IN ('completed', 'delivered', 'done', 'cancelled')
      UNION ALL
      SELECT 'history'
      WHERE lower(coalesce(tr.status, '')) IN ('completed', 'delivered', 'done')
      UNION ALL
      SELECT 'cancelled'
      WHERE lower(coalesce(tr.status, '')) = 'cancelled'
      UNION ALL
      SELECT 'unassigned'
      WHERE lower(coalesce(tr.status, '')) NOT IN ('completed', 'delivered', 'done', 'cancelled')
        AND (
          tr.driver_id IS NULL
          OR lower(coalesce(tr.status, '')) = 'draft'
        )
      UNION ALL
      SELECT 'assigned'
      WHERE tr.driver_id IS NOT NULL
        AND lower(coalesce(tr.status, '')) = 'assigned'
      UNION ALL
      SELECT 'loading'
      WHERE tr.driver_id IS NOT NULL
        AND lower(coalesce(tr.status, '')) IN ('picked_up', 'pickup', 'in_progress')
      UNION ALL
      SELECT 'in_transit'
      WHERE tr.driver_id IS NOT NULL
        AND lower(coalesce(tr.status, '')) IN ('in_transit', 'dispatched', 'transit')
      UNION ALL
      SELECT 'unloading'
      WHERE tr.driver_id IS NOT NULL
        AND lower(coalesce(tr.status, '')) IN ('unloading', 'arrived', 'at_destination', 'at_drop')
    ) x
  ) b
$function$
;
