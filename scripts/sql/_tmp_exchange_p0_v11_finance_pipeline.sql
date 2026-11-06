-- Defect 12 / V11 — Finance linkage of affected trips + pipeline at risk (READ ONLY).
set transaction read only;
with affected as (
  select t.*, i.assigned_supplier_id, i.client_price as customer_price
  from public.trips t
  join public.indents i on i.id = t.indent_id
  left join public.market_bids mb on mb.id = t.source_market_bid_id
  where t.source = 'market_bid' and mb.id is null
)
select 'affected: ledger rows on these trips (any org)' as metric,
       (select count(*) from public.transactions x where x.trip_id in (select id from affected))::text as value
union all
select 'affected: client_id set',
       (select count(*) from affected where client_id is not null)::text
union all
select 'affected: supplier invoices/docs linked (trip_documents)',
       (select count(*) from public.trip_documents d where d.trip_id in (select id from affected))::text
union all
select 'GOGOVAN supplier-ledger rows since 2026-09-25 to affected suppliers (no trip_id)',
       (select count(*) from public.transactions x
         join public.suppliers s on s.id = x.contact_id and x.contact_type = 'supplier'
         where x.organization_id = (select organization_id from affected limit 1)
           and s.linked_organization_id in (select assigned_supplier_id from affected)
           and x.trip_id is null and x.created_at >= date '2026-09-25')::text
union all
select 'pipeline: both-indents assigned to a Network supplier, not yet deployed',
       (select count(*) from public.indents i
         where i.circulation_target = 'both'
           and i.assigned_supplier_id is not null
           and i.assigned_supplier_id <> i.organization_id
           and lower(coalesce(i.status, '')) not in ('completed', 'cancelled', 'closed', 'expired')
           and not exists (select 1 from public.trips t where t.indent_id = i.id))::text
union all
select 'pipeline: open both-indents (could be Network-awarded next)',
       (select count(*) from public.indents i
         where i.circulation_target = 'both'
           and lower(coalesce(i.status, '')) in ('open', 'broadcast'))::text
union all
select 'other orgs: both-indent Network deploys since 2026-09-25 (any source)',
       (select count(*) from public.trips t join public.indents i on i.id = t.indent_id
         join public.organizations o on o.id = t.organization_id
         where i.circulation_target = 'both' and o.name <> 'GOGOVAN INDIA PVT LTD'
           and t.created_at >= date '2026-09-25')::text;
