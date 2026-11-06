-- READ-ONLY. Old (live 20270925194500) vs corrected classifier on the P1/P3 populations.
WITH cls AS (
  SELECT i.id AS indent_id, i.organization_id AS shipper_org, i.assigned_supplier_id AS bidder_org, i.circulation_target,
         EXISTS (SELECT 1 FROM public.market_bids mb WHERE mb.indent_id = i.id AND mb.status = 'accepted' AND mb.bidder_organization_id = i.assigned_supplier_id) AS has_bid,
         EXISTS (SELECT 1 FROM public.suppliers s WHERE s.organization_id = i.organization_id AND s.linked_organization_id = i.assigned_supplier_id AND s.is_active) AS approved,
         public.is_marketplace_indent_award(i.id, i.assigned_supplier_id) AS old_mkt
  FROM public.indents i WHERE i.assigned_supplier_id IS NOT NULL
)
SELECT 'P1_mirror' AS pop, c.old_mkt,
       (c.has_bid OR (lower(coalesce(c.circulation_target,'')) IN ('marketplace','both') AND NOT c.approved)) AS new_mkt,
       c.has_bid, c.approved, lower(coalesce(c.circulation_target,'')) AS circ,
       count(*) AS trips,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.transactions tx WHERE tx.trip_id = t.id AND tx.organization_id = t.organization_id AND tx.contact_type = 'client' AND tx.amount_in > 0)) AS with_receipts
FROM public.trips t LEFT JOIN cls c ON c.indent_id = t.source_indent_id AND c.bidder_org = t.organization_id
WHERE t.source = 'mover_asset' AND t.deleted_at IS NULL
GROUP BY 1,2,3,4,5,6
UNION ALL
SELECT 'P3_real_bidder_supplier', c.old_mkt,
       (c.has_bid OR (lower(coalesce(c.circulation_target,'')) IN ('marketplace','both') AND NOT c.approved)),
       c.has_bid, c.approved, lower(coalesce(c.circulation_target,'')),
       count(*), 0
FROM public.trips t JOIN cls c ON c.indent_id = t.indent_id
JOIN public.suppliers s ON s.id = t.supplier_id AND s.linked_organization_id = c.bidder_org
WHERE t.deleted_at IS NULL
GROUP BY 1,2,3,4,5,6
ORDER BY 1,2,3,4,5,6;
