-- Exchange Phase 0 / V8 — why source='market_bid' trips have no bid (READ ONLY).
set transaction read only;
select
  coalesce(i.circulation_target, '(null)') as circulation_target,
  (i.assigned_supplier_id = t.organization_id) as self_assigned,
  exists (
    select 1 from public.suppliers s
    where s.organization_id = t.organization_id
      and s.linked_organization_id = i.assigned_supplier_id
  ) as network_supplier_row_exists,
  exists (select 1 from public.market_bids mb where mb.indent_id = i.id) as indent_has_any_market_bid,
  count(*) as trips,
  count(*) filter (where t.client_price = i.assigned_supplier_rate) as client_price_eq_assigned_rate,
  count(*) filter (where t.supplier_rate = i.assigned_supplier_rate) as supplier_rate_eq_assigned_rate,
  count(*) filter (where coalesce(t.platform_fee, 0) > 0) as with_platform_fee,
  sum(i.client_price) as indent_client_price_total,
  sum(t.client_price) as trip_client_price_total,
  count(distinct i.assigned_supplier_id) as distinct_assigned_orgs
from public.trips t
join public.indents i on i.id = t.indent_id
left join public.market_bids mb0 on mb0.id = t.source_market_bid_id
where t.source = 'market_bid' and mb0.id is null
group by 1, 2, 3, 4
order by trips desc;
