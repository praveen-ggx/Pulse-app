-- Exchange Phase 0 / V5 — where each paid Marketplace fee was posted (READ ONLY).
set transaction read only;
with paid as (
  select mb.id as bid_id, mb.bidder_type, mb.bidder_organization_id, mb.platform_fee_amount,
         coalesce(fp.provider, '(no fee payment row)') as provider,
         t.id as trip_id, t.organization_id as shipper_org_id
  from public.market_bids mb
  left join lateral (
    select provider from public.marketplace_fee_payments f
    where f.market_bid_id = mb.id and f.status = 'paid'
    order by f.paid_at desc nulls last limit 1
  ) fp on true
  left join public.trips t on t.source_market_bid_id = mb.id and t.source = 'market_bid'
  where mb.status = 'accepted' and mb.fee_payment_status = 'paid'
)
select
  p.bidder_type,
  p.provider,
  count(*) as paid_bids,
  count(*) filter (where exists (
    select 1 from public.transactions x
    where x.ledger_category = 'MARKETPLACE_PLATFORM_FEE'
      and x.organization_id = p.bidder_organization_id
      and (x.payment_ref = p.bid_id::text or x.trip_id = p.trip_id)
  )) as fee_row_in_bidder_org,
  count(*) filter (where exists (
    select 1 from public.transactions x
    where x.ledger_category = 'MARKETPLACE_PLATFORM_FEE'
      and x.organization_id = p.shipper_org_id
      and (x.payment_ref = p.bid_id::text or x.trip_id = p.trip_id)
  )) as fee_row_in_shipper_org,
  count(*) filter (where not exists (
    select 1 from public.transactions x
    where x.ledger_category = 'MARKETPLACE_PLATFORM_FEE'
      and (x.payment_ref = p.bid_id::text or (p.trip_id is not null and x.trip_id = p.trip_id))
  )) as no_fee_row_anywhere,
  sum(p.platform_fee_amount) as fee_total
from paid p
group by 1, 2
order by 1, 2;
