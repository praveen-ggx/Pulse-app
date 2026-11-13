-- Batch form of indent_reference_for_viewer (20261112144350) for Load Center
-- Bids Won / Claimed cards: one call for every card on screen instead of one
-- per card. Same access rule (shipper org or awarded supplier org); indents
-- the caller may not see are simply left out. Capped at 500 ids per call.

CREATE OR REPLACE FUNCTION public.indent_references_for_viewer(p_indent_ids uuid[])
RETURNS TABLE (indent_id uuid, indent_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ids.id, public.indent_reference_for_viewer(ids.id)
  FROM (
    SELECT DISTINCT unnest(p_indent_ids[1:500]) AS id
  ) ids
  WHERE public.indent_reference_for_viewer(ids.id) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.indent_references_for_viewer(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.indent_references_for_viewer(uuid[]) TO authenticated;
