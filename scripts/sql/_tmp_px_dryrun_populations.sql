-- READ-ONLY. Historical populations touched by any later Pulse Exchange /
-- omni-channel repair. Classifier = 20271006142659 predicate, inlined (not live).
WITH
mkt AS (
  SELECT i.id AS indent_id, i.organization_id AS shipper_org, i.assigned_supplier_id AS bidder_org,
         i.circulation_target,
         ( EXISTS (SELECT 1 FROM public.market_bids mb WHERE mb.indent_id = i.id AND mb.status = 'accepted'
                     AND mb.bidder_organization_id = i.assigned_supplier_id)
           OR ( lower(coalesce(i.circulation_target, '')) IN ('marketplace', 'both')
                AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.organization_id = i.organization_id
                                  AND s.linked_organization_id = i.assigned_supplier_id AND s.is_active) ) ) AS is_mkt
  FROM public.indents i
  WHERE i.assigned_supplier_id IS NOT NULL
),
tx_by_trip AS (
  SELECT tx.trip_id,
         count(*) AS tx_rows,
         count(*) FILTER (WHERE tx.organization_id = t.organization_id AND tx.contact_type = 'client' AND coalesce(tx.amount_in, 0) > 0) AS own_client_receipts,
         sum(tx.amount_in) FILTER (WHERE tx.organization_id = t.organization_id AND tx.contact_type = 'client') AS own_client_in,
         count(*) FILTER (WHERE tx.organization_id <> t.organization_id AND tx.contact_type = 'client' AND coalesce(tx.amount_in, 0) > 0) AS foreign_client_receipts,
         sum(tx.amount_in) FILTER (WHERE tx.organization_id <> t.organization_id AND tx.contact_type = 'client') AS foreign_client_in,
         coalesce(sum(tx.amount_in) FILTER (WHERE tx.organization_id = t.organization_id AND tx.contact_type = 'client'), 0)
           - coalesce(sum(tx.amount_out) FILTER (WHERE tx.organization_id = t.organization_id AND tx.contact_type = 'client'), 0) AS owner_net_client
  FROM public.transactions tx JOIN public.trips t ON t.id = tx.trip_id
  GROUP BY tx.trip_id
),
pop AS (
  -- P1: bidder execution trips (mover_asset)
  SELECT 'P1_mirror' AS pop, t.id AS trip_id, m.is_mkt
  FROM public.trips t LEFT JOIN mkt m ON m.indent_id = t.source_indent_id AND m.bidder_org = t.organization_id
  WHERE t.source = 'mover_asset' AND t.deleted_at IS NULL
  UNION ALL
  -- P3: shipper trips on a Marketplace award pointing at a real (linked) bidder supplier
  SELECT 'P3_real_bidder_supplier', t.id, m.is_mkt
  FROM public.trips t JOIN mkt m ON m.indent_id = t.indent_id
  JOIN public.suppliers s ON s.id = t.supplier_id AND s.linked_organization_id = m.bidder_org
  WHERE t.deleted_at IS NULL AND m.is_mkt
  UNION ALL
  -- P4: defect-12 trips (Network award stored as supplier-less asset Marketplace trip)
  SELECT 'P4_defect12', t.id, m.is_mkt
  FROM public.trips t JOIN mkt m ON m.indent_id = t.indent_id
  WHERE t.deleted_at IS NULL AND t.source IN ('market_bid', 'direct_quote') AND t.supplier_id IS NULL
    AND t.trip_payout_mode = 'asset' AND NOT m.is_mkt
  UNION ALL
  -- P5: trips whose amount_paid includes another org's client receipts
  SELECT 'P5_amount_paid', t.id, NULL
  FROM public.trips t JOIN tx_by_trip x ON x.trip_id = t.id
  WHERE x.foreign_client_receipts > 0
)
SELECT p.pop, p.trip_id, t.organization_id, t.source, t.status, t.indent_id, t.source_indent_id,
       p.is_mkt, t.client_id, t.client_name, t.client_price, t.supplier_id, t.trip_payout_mode,
       t.amount_paid, t.payment_status,
       coalesce(x.tx_rows, 0) AS tx_rows, coalesce(x.own_client_receipts, 0) AS own_client_receipts,
       x.own_client_in, coalesce(x.foreign_client_receipts, 0) AS foreign_client_receipts, x.foreign_client_in,
       greatest(coalesce(x.owner_net_client, 0), 0) AS recomputed_amount_paid,
       (SELECT string_agg(p2.pop, ',' ORDER BY p2.pop) FROM pop p2 WHERE p2.trip_id = p.trip_id AND p2.pop <> p.pop) AS also_in,
       t.created_at
FROM pop p JOIN public.trips t ON t.id = p.trip_id
LEFT JOIN tx_by_trip x ON x.trip_id = p.trip_id
ORDER BY p.pop, t.created_at;
