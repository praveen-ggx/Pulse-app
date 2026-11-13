-- Shared indent reference (indent_code, e.g. SAT812-IND-003971) for the
-- shipper org and the awarded supplier org only, so both sides can quote the
-- same ID when allocating a vehicle. Supplier org members cannot SELECT the
-- indents row (RLS), and the market RPCs only return indent_number.
-- Returns NULL for everyone else (no reveal before award).
-- Generic for every org: shipper = indent owner org; supplier = assigned
-- supplier org, or the bidder org of an accepted direct quote / market bid
-- (older awards did not always set assigned_supplier_id).

CREATE OR REPLACE FUNCTION public.indent_reference_for_viewer(p_indent_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT i.indent_code
  FROM public.indents i
  WHERE i.id = p_indent_id
    AND i.deleted_at IS NULL
    AND (
      public.is_org_member(i.organization_id)
      OR (
        i.award_revoked_at IS NULL
        AND (
          (
            i.assigned_supplier_id IS NOT NULL
            AND public.is_org_member(i.assigned_supplier_id)
          )
          OR EXISTS (
            SELECT 1 FROM public.direct_quotes q
            WHERE q.indent_id = i.id
              AND q.status = 'accepted'
              AND public.is_org_member(q.bidder_organization_id)
          )
          OR EXISTS (
            SELECT 1 FROM public.market_bids b
            WHERE b.indent_id = i.id
              AND b.status = 'accepted'
              AND public.is_org_member(b.bidder_organization_id)
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.indent_reference_for_viewer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.indent_reference_for_viewer(uuid) TO authenticated;
