-- Defect 12 / V9 — per-supplier impact of misclassified Network awards (READ ONLY).
set transaction read only;
select
  so.name as supplier_org,
  count(*) as trips,
  count(*) filter (where t.status = 'completed') as completed,
  count(*) filter (where t.status not in ('completed', 'cancelled')) as active,
  sum(i.client_price) as customer_price,
  sum(t.client_price) as trip_client_price,
  sum(i.client_price) - sum(t.client_price) as revenue_understated,
  sum(t.supplier_rate) as supplier_payable,
  min(t.created_at)::date as first_trip,
  max(t.created_at)::date as last_trip
from public.trips t
join public.indents i on i.id = t.indent_id
left join public.organizations so on so.id = i.assigned_supplier_id
left join public.market_bids mb on mb.id = t.source_market_bid_id
where t.source = 'market_bid' and mb.id is null
group by so.name
order by trips desc;
