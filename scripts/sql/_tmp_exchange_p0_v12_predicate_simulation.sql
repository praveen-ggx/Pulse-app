-- Defect 12 / V12 — simulate the corrected omni-channel predicate on real trips (READ ONLY).
-- new_is_marketplace = accepted market bid from this bidder org on this indent
--   OR (indent circulates to marketplace/both AND bidder org is not an approved Network supplier)
set transaction read only;
with c as (
  select
    t.id, t.source, t.trip_payout_mode, t.created_at,
    (t.supplier_id is not null) as has_supplier,
    i.circulation_target,
    i.assigned_supplier_id as bidder_org,
    exists (
      select 1 from public.market_bids mb
      where mb.indent_id = i.id and mb.status = 'accepted'
        and mb.bidder_organization_id = i.assigned_supplier_id
    ) as accepted_bid_from_bidder,
    public.is_approved_supplier(t.organization_id, i.assigned_supplier_id) as approved_supplier
  from public.trips t
  join public.indents i on i.id = t.indent_id
  where t.source in ('market_bid', 'direct_quote', 'indent')
    and i.assigned_supplier_id is not null
    and i.assigned_supplier_id <> t.organization_id
    and t.created_at >= date '2026-09-25'
)
select
  source,
  trip_payout_mode,
  has_supplier,
  circulation_target,
  accepted_bid_from_bidder,
  approved_supplier,
  (accepted_bid_from_bidder
    or (lower(coalesce(circulation_target, '')) in ('marketplace', 'both') and not approved_supplier)
  ) as new_is_marketplace,
  count(*) as trips
from c
group by 1, 2, 3, 4, 5, 6, 7
order by 1, 2, 3, 4, 5, 6;
