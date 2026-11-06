-- Exchange Phase 0 / V2 + V3 — Marketplace trip payout lane and client_price (READ ONLY).
set transaction read only;
select
  t.operating_mode,
  t.trip_payout_mode,
  coalesce(mb.bidder_type, '(no bid row)') as bidder_type,
  (t.supplier_id is null) as supplier_null,
  t.status,
  count(*) as trips,
  count(*) filter (where t.client_price = mb.amount) as client_price_eq_bid,
  count(*) filter (where coalesce(i.client_price, 0) > 0 and t.client_price is distinct from i.client_price) as client_price_ne_indent,
  count(*) filter (where coalesce(i.client_price, 0) = 0) as indent_client_price_unset,
  string_agg(coalesce(nullif(t.booking_ref, ''), nullif(t.trip_number, ''), left(t.id::text, 8)), ', ' order by t.created_at) as trip_refs
from public.trips t
left join public.market_bids mb on mb.id = t.source_market_bid_id
left join public.indents i on i.id = t.indent_id
where t.source = 'market_bid'
group by 1, 2, 3, 4, 5
order by 1, 2, 3, 4, 5;
