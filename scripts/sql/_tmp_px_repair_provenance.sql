-- READ-ONLY. Provenance of the five trips approved for the Exchange historical repair.
WITH t5 AS (
  SELECT t.* FROM public.trips t
  WHERE t.id IN ('76b9e7aa-f1d8-42c8-98f5-8912501401e3',  -- NIH250-TRP-141
                 '42b8fdf1-0cf1-467f-b3b0-d5ca936291d4',  -- NIH250-TRP-147
                 '31d183e5-3a57-4b4f-9dcd-781db2b0662c',  -- SAT812-TRP-191
                 '3549a9de-cf05-4477-ab46-b9d79ff8e95f')  -- GOD684-TRP-037
     OR t.id::text LIKE '22222d50%'                       -- execution trip
)
SELECT t.id, t.trip_code, t.source, t.status, t.operating_mode, t.trip_payout_mode,
       t.organization_id, o.name AS trip_org_name,
       t.created_at, t.created_by_user_id, cu.email AS trip_created_by_email,
       t.client_id, t.client_name, cl.name AS client_row_name, cl.created_at AS client_created_at, ccu.email AS client_created_by_email,
       t.client_price, t.supplier_rate, t.supplier_id, t.dco_payee_id,
       coalesce(t.indent_id, t.source_indent_id) AS indent_id,
       i.indent_code, i.circulation_target, i.status AS indent_status, i.created_at AS indent_created_at,
       iu.email AS indent_created_by_email, i.assigned_supplier_id, ao.name AS assigned_org_name,
       mb.id AS bid_id, mb.bidder_type, mb.amount AS bid_amount, mb.created_at AS bid_created_at,
       bu.email AS bidder_email, bo.name AS bidder_org_name,
       (SELECT count(*) FROM public.transactions tx WHERE tx.trip_id = t.id) AS tx_rows,
       (SELECT count(*) FROM public.trips m WHERE m.source = 'mover_asset' AND m.deleted_at IS NULL
          AND m.source_indent_id = t.indent_id) AS execution_trips,
       (SELECT count(*) FROM public.marketplace_fee_payments f WHERE f.market_bid_id = mb.id) AS fee_rows,
       (SELECT string_agg(f.status || ':' || coalesce(f.amount::text, '') || ':' || coalesce(f.provider, ''), ',') FROM public.marketplace_fee_payments f
          WHERE f.market_bid_id = mb.id) AS fee_status
FROM t5 t
LEFT JOIN public.organizations o ON o.id = t.organization_id
LEFT JOIN auth.users cu ON cu.id = t.created_by_user_id
LEFT JOIN public.clients cl ON cl.id = t.client_id
LEFT JOIN auth.users ccu ON ccu.id = cl.created_by
LEFT JOIN public.indents i ON i.id = coalesce(t.indent_id, t.source_indent_id)
LEFT JOIN auth.users iu ON iu.id = i.created_by_user_id
LEFT JOIN public.organizations ao ON ao.id = i.assigned_supplier_id
LEFT JOIN public.market_bids mb ON mb.indent_id = i.id AND mb.status = 'accepted'
LEFT JOIN auth.users bu ON bu.id = mb.bidder_user_id
LEFT JOIN public.organizations bo ON bo.id = mb.bidder_organization_id
ORDER BY t.created_at;
