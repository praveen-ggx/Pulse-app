-- Exchange Phase 0 / V4 — ledger rows on Marketplace trips, by org side (READ ONLY).
set transaction read only;
select
  coalesce(mb.bidder_type, '(no bid row)') as bidder_type,
  t.trip_payout_mode,
  case
    when tx.organization_id = t.organization_id then 'shipper (trip owner)'
    when tx.organization_id = mb.bidder_organization_id then 'bidder org'
    else 'other org'
  end as ledger_side,
  coalesce(tx.ledger_category, '(null)') as ledger_category,
  coalesce(tx.contact_type, '(null)') as contact_type,
  count(*) as rows,
  sum(tx.amount_in) as sum_in,
  sum(tx.amount_out) as sum_out,
  count(distinct t.id) as trips,
  string_agg(distinct coalesce(nullif(t.booking_ref, ''), nullif(t.trip_number, ''), left(t.id::text, 8)), ', ') as trip_refs
from public.trips t
join public.transactions tx on tx.trip_id = t.id
left join public.market_bids mb on mb.id = t.source_market_bid_id
where t.source = 'market_bid'
group by 1, 2, 3, 4, 5
order by 1, 2, 3, 4, 5;
