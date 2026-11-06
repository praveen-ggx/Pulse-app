-- Exchange Phase 0 / V7 — market_bid trips that don't resolve to a market_bids row,
-- plus timing of paid fees vs the cash-ledger write (READ ONLY).
set transaction read only;
select 'orphan_trips' as section,
  (t.source_market_bid_id is null)::text as k1,
  (t.source_bid_id is not null)::text as k2,
  o.name as k3,
  count(*)::text as n,
  min(t.created_at)::date::text || ' → ' || max(t.created_at)::date::text as span,
  count(*) filter (where i.id is null)::text as no_indent,
  count(distinct t.driver_id)::text as drivers
from public.trips t
left join public.market_bids mb on mb.id = t.source_market_bid_id
left join public.indents i on i.id = t.indent_id
left join public.organizations o on o.id = t.organization_id
where t.source = 'market_bid' and mb.id is null
group by 1, 2, 3, 4
union all
select 'paid_fees', mb.bidder_type, coalesce(fp.provider, '-'),
  coalesce(nullif(t.booking_ref, ''), '(no trip)'),
  mb.platform_fee_amount::text,
  coalesce(fp.paid_at::text, '-'),
  (select string_agg(case when x.organization_id = mb.bidder_organization_id then 'bidder_org' else 'other_org' end || ':' || x.ledger_category, ',')
     from public.transactions x where x.payment_ref = mb.id::text),
  null
from public.market_bids mb
left join public.marketplace_fee_payments fp on fp.market_bid_id = mb.id and fp.status = 'paid'
left join public.trips t on t.source_market_bid_id = mb.id and t.source = 'market_bid'
where mb.status = 'accepted' and mb.fee_payment_status = 'paid'
order by 1, 2, 3;
