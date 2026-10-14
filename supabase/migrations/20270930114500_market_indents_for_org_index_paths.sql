-- market_indents_for_org was running 19–25s and hitting statement_timeout
-- (57014) on 2026-09-30. via_award started from every non-draft indent and
-- OR'd an EXISTS, so the assigned-supplier and bidder indexes were not used.
-- via_reach looked up posts with a per-row subquery. Same rows, index paths.

CREATE OR REPLACE FUNCTION public.market_indents_for_org(p_org_id uuid)
 RETURNS TABLE(id uuid, organization_id uuid, indent_number text, pickup_area text, drop_location text, client_name text, client_price numeric, supplier_target numeric, status text, vehicle_type text, load_type text, pickup_date date, circulation_target text, created_at timestamp with time zone, updated_at timestamp with time zone, creator_organization_name text, assigned_supplier_id uuid, assigned_supplier_rate numeric, weight numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_staff(p_org_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  raw_relations AS (
    SELECT r.from_organization_id AS shipper_org_id, r.created_at AS link_since
    FROM public.organization_relations r
    WHERE r.to_organization_id = p_org_id
      AND r.relation_type = 'client_supplier'
      AND r.status = 'active'
    UNION ALL
    SELECT r.to_organization_id AS shipper_org_id, r.created_at AS link_since
    FROM public.organization_relations r
    WHERE r.from_organization_id = p_org_id
      AND r.relation_type = 'supplier_client'
      AND r.status = 'active'
  ),
  partner_links AS (
    SELECT shipper_org_id, MIN(link_since) AS link_since
    FROM raw_relations
    GROUP BY shipper_org_id
  ),
  fallback_links AS (
    SELECT s.organization_id AS shipper_org_id, MIN(s.updated_at) AS link_since
    FROM public.suppliers s
    WHERE s.linked_organization_id = p_org_id
      AND s.organization_id IS NOT NULL
      AND s.organization_id <> p_org_id
    GROUP BY s.organization_id
  ),
  client_org_links AS (
    SELECT c.linked_organization_id AS shipper_org_id, MIN(c.created_at) AS link_since
    FROM public.clients c
    WHERE c.organization_id = p_org_id
      AND c.status = 'active'
      AND c.linked_organization_id IS NOT NULL
      AND c.linked_organization_id <> p_org_id
    GROUP BY c.linked_organization_id
  ),
  effective_links AS (
    SELECT pl.shipper_org_id
    FROM partner_links pl
    UNION
    SELECT fl.shipper_org_id
    FROM fallback_links fl
    UNION
    SELECT clo.shipper_org_id
    FROM client_org_links clo
  ),
  via_link AS (
    SELECT
      i.id,
      i.organization_id,
      i.indent_number,
      i.pickup_area,
      i.drop_location,
      i.client_name,
      i.client_price,
      i.supplier_target,
      i.status,
      i.vehicle_type,
      i.load_type,
      i.pickup_date,
      i.circulation_target,
      i.created_at,
      i.updated_at,
      o.name::text AS creator_organization_name,
      i.assigned_supplier_id,
      i.assigned_supplier_rate,
      i.weight
    FROM public.indents i
    JOIN public.organizations o ON o.id = i.organization_id
    JOIN effective_links e ON e.shipper_org_id = i.organization_id
    WHERE i.deleted_at IS NULL
      AND (
        i.circulation_target IS NULL
        OR i.circulation_target IN ('integrated_supplier', 'both')
      )
      AND i.status <> 'draft'
      AND lower(i.status) NOT IN ('awarded', 'completed', 'cancelled', 'canceled')
  ),
  via_award_assigned AS (
    SELECT
      i.id,
      i.organization_id,
      i.indent_number,
      i.pickup_area,
      i.drop_location,
      i.client_name,
      i.client_price,
      i.supplier_target,
      i.status,
      i.vehicle_type,
      i.load_type,
      i.pickup_date,
      i.circulation_target,
      i.created_at,
      i.updated_at,
      o.name::text AS creator_organization_name,
      i.assigned_supplier_id,
      i.assigned_supplier_rate,
      i.weight
    FROM public.indents i
    JOIN public.organizations o ON o.id = i.organization_id
    WHERE i.deleted_at IS NULL
      AND i.status <> 'draft'
      AND i.organization_id <> p_org_id
      AND i.assigned_supplier_id = p_org_id
  ),
  via_award_quote AS (
    SELECT
      i.id,
      i.organization_id,
      i.indent_number,
      i.pickup_area,
      i.drop_location,
      i.client_name,
      i.client_price,
      i.supplier_target,
      i.status,
      i.vehicle_type,
      i.load_type,
      i.pickup_date,
      i.circulation_target,
      i.created_at,
      i.updated_at,
      o.name::text AS creator_organization_name,
      i.assigned_supplier_id,
      i.assigned_supplier_rate,
      i.weight
    FROM public.direct_quotes dq
    JOIN public.indents i ON i.id = dq.indent_id
    JOIN public.organizations o ON o.id = i.organization_id
    WHERE dq.bidder_organization_id = p_org_id
      AND dq.status = 'accepted'
      AND i.deleted_at IS NULL
      AND i.status <> 'draft'
      AND i.organization_id <> p_org_id
  ),
  via_reach AS (
    SELECT
      i.id,
      i.organization_id,
      i.indent_number,
      i.pickup_area,
      i.drop_location,
      i.client_name,
      i.client_price,
      i.supplier_target,
      i.status,
      i.vehicle_type,
      i.load_type,
      i.pickup_date,
      i.circulation_target,
      i.created_at,
      i.updated_at,
      o.name::text AS creator_organization_name,
      i.assigned_supplier_id,
      i.assigned_supplier_rate,
      i.weight
    FROM public.reach_campaign_targets t
    JOIN public.reach_campaigns camp ON camp.id = t.campaign_id
    LEFT JOIN public.posts p ON p.id = camp.post_id
    JOIN public.indents i
      ON i.id = COALESCE(camp.snapshot_source_indent_id, p.source_indent_id)
    JOIN public.organizations o ON o.id = i.organization_id
    WHERE t.org_id = p_org_id
      AND t.released_at IS NOT NULL
      AND camp.archived_at IS NULL
      AND i.deleted_at IS NULL
      AND i.status <> 'draft'
      AND i.organization_id <> p_org_id
      AND (
        (camp.status = 'active' AND (camp.expires_at IS NULL OR camp.expires_at > now()))
        OR EXISTS (
          SELECT 1
          FROM public.direct_quotes dq
          WHERE dq.indent_id = i.id
            AND dq.bidder_organization_id = p_org_id
        )
      )
  )
  SELECT * FROM via_link
  UNION
  SELECT * FROM via_award_assigned
  UNION
  SELECT * FROM via_award_quote
  UNION
  SELECT * FROM via_reach
  ORDER BY created_at DESC;
END;
$function$;
