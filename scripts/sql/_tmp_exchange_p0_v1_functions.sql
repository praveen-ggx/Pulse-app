-- Exchange Phase 0 / V1 — live function bodies vs repo (READ ONLY).
set transaction read only;
with f as (
  select p.proname, p.oid, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_trip_from_assigned_indent', 'ensure_awarded_bidder_supplier',
      'settle_marketplace_fee_as_cash', 'confirm_marketplace_fee_payment',
      'award_market_bid', 'create_market_trip_after_fee_payment',
      'is_marketplace_indent_award'
    )
)
select
  proname,
  count(*) over (partition by proname) as overloads,
  left(md5(def), 12) as def_md5,
  position('insert into public.transactions' in lower(def)) > 0 as writes_transactions,
  def ~* $re$when v_supplier_id is not null then 'market' else 'asset'$re$ as payout_asset_when_no_supplier,
  def ~* 'v_client_price\s*:=\s*coalesce\(\s*v_market_bid\.amount' as client_price_from_bid,
  def ~* 'v_supplier_id\s*:=\s*null' as market_award_null_supplier,
  def ~* 'is_marketplace_indent_award' as uses_marketplace_award_check,
  length(def) as def_len
from f
order by proname;
