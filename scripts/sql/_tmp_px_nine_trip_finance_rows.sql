-- READ-ONLY. The 9 supplier-less true Marketplace shipper trips (corrected
-- 20271006142659 classifier, inlined) and every transactions row on them.
WITH mkt AS (
  SELECT i.id AS indent_id, i.organization_id AS shipper_org, i.assigned_supplier_id AS bidder_org,
         i.circulation_target
  FROM public.indents i
  WHERE ( EXISTS (SELECT 1 FROM public.market_bids mb WHERE mb.indent_id = i.id AND mb.status = 'accepted'
                    AND mb.bidder_organization_id = i.assigned_supplier_id)
          OR ( lower(coalesce(i.circulation_target, '')) IN ('marketplace', 'both')
               AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.organization_id = i.organization_id
                                 AND s.linked_organization_id = i.assigned_supplier_id AND s.is_active) ) )
),
nine AS (
  SELECT t.*, m.bidder_org
  FROM public.trips t JOIN mkt m ON m.indent_id = t.indent_id
  WHERE t.deleted_at IS NULL AND t.source IN ('market_bid', 'direct_quote') AND t.supplier_id IS NULL
)
SELECT n.id AS trip_id, n.trip_code, n.source, n.source_market_bid_id, n.dco_payee_id,
       n.vehicle_id, n.driver_id, n.created_at AS trip_created_at,
       (SELECT jsonb_agg(jsonb_build_object('bid', mb.id, 'type', mb.bidder_type, 'org', mb.bidder_organization_id,
                                            'user', mb.bidder_user_id, 'amount', mb.amount, 'status', mb.status))
          FROM public.market_bids mb WHERE mb.indent_id = n.indent_id AND mb.status = 'accepted') AS accepted_bids,
       (SELECT i.circulation_target FROM public.indents i WHERE i.id = n.indent_id) AS circulation, n.organization_id AS trip_org, n.bidder_org, n.status AS trip_status,
       n.trip_payout_mode, n.operating_mode, n.client_id, n.client_name, n.client_price, n.supplier_rate,
       n.amount_paid, n.payment_status,
       tx.id AS tx_id, tx.organization_id AS tx_org,
       (tx.organization_id = n.organization_id) AS tx_in_trip_org,
       (tx.organization_id = n.bidder_org) AS tx_in_bidder_org,
       tx.ledger_entity_type, tx.ledger_category, tx.ledger_flow_type, tx.contact_type, tx.contact_id,
       tx.party_name, coalesce(c.name, s.name, d.name) AS contact_name,
       c.linked_organization_id AS contact_client_linked_org, s.linked_organization_id AS contact_supplier_linked_org,
       tx.amount_in, tx.amount_out, tx.payment_reference, tx.payment_ref, tx.booking_ref,
       tx.is_opening_balance, tx.chat_mirror_of_transaction_id,
       tx.transaction_date, tx.description, tx.created_by, tx.created_at
FROM nine n
LEFT JOIN public.transactions tx ON tx.trip_id = n.id
LEFT JOIN public.clients c ON tx.contact_type = 'client' AND c.id = tx.contact_id
LEFT JOIN public.suppliers s ON tx.contact_type = 'supplier' AND s.id = tx.contact_id
LEFT JOIN public.drivers d ON tx.contact_type = 'driver' AND d.id = tx.contact_id
ORDER BY n.created_at, tx.created_at;
