-- Defect 12 / V10 — GOGOVAN Network-supplier trips on 'both' indents, by day,
-- before vs after the regression (READ ONLY).
set transaction read only;
select
  t.created_at::date as day,
  t.source,
  t.trip_payout_mode,
  (t.supplier_id is not null) as has_supplier,
  (t.client_id is not null) as has_client,
  count(*) as trips,
  count(*) filter (where t.client_price = i.client_price) as client_price_eq_customer,
  count(*) filter (where t.client_price = i.assigned_supplier_rate) as client_price_eq_supplier_rate
from public.trips t
join public.indents i on i.id = t.indent_id
join public.organizations o on o.id = t.organization_id
where o.name = 'GOGOVAN INDIA PVT LTD'
  and i.circulation_target = 'both'
  and i.assigned_supplier_id is not null
  and i.assigned_supplier_id <> t.organization_id
  and t.created_at >= date '2026-09-18'
group by 1, 2, 3, 4, 5
order by 1, 2, 3, 4, 5;
