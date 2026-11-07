-- Exchange Phase 0 / V6 — DCO bidders holding more than one live accepted award (READ ONLY).
set transaction read only;
select
  mb.bidder_user_id,
  count(*) as accepted_awards,
  count(*) filter (where mb.fee_payment_status not in ('paid', 'not_required')) as fee_unpaid,
  count(t.id) as with_trip,
  count(t.id) filter (where t.status not in ('completed', 'cancelled')) as active_trips,
  string_agg(left(mb.id::text, 8) || ':' || mb.fee_payment_status || ':' || coalesce(t.status, 'no_trip'), ', ' order by mb.accepted_at) as awards
from public.market_bids mb
left join public.trips t on t.source_market_bid_id = mb.id and t.source = 'market_bid'
where mb.bidder_type = 'dco' and mb.status = 'accepted'
  and coalesce(t.status, 'no_trip') not in ('completed', 'cancelled')
group by mb.bidder_user_id
having count(*) > 1
order by accepted_awards desc;
