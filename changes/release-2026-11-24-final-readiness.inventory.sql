with v(version) as (values ('20261029170000'),('20261112140000'),('20261113100000'),('20261113104000'),('20261114110000'),('20261114111733'),('20261118114448'),('20270304120000'),('20270309030100'),('20270917100030'),('20270921182802'),('20270922143500'),('20271006185000'),('20271027155318'),('20271106053000'),('20271117021500'),('20271117144500'),('20271118123000'),('20271118143000'),('20271118161500'),('20271118174500'),('20271118191000'),('20271118194500'))
select 'hist:'||v.version as k, (m.version is not null)::text as v from v left join supabase_migrations.schema_migrations m on m.version=v.version
union all select 'obj:market_bids.expires_at', exists(select 1 from information_schema.columns where table_schema='public' and table_name='market_bids' and column_name='expires_at')::text
union all select 'obj:indents.award_revoked_at', exists(select 1 from information_schema.columns where table_schema='public' and table_name='indents' and column_name='award_revoked_at')::text
union all select 'obj:trips.owner_vehicle_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='trips' and column_name='owner_vehicle_id')::text
union all select 'obj:organization_member_warehouses', (to_regclass('public.organization_member_warehouses') is not null)::text
union all select 'obj:bulk_operation_batches', (to_regclass('public.bulk_operation_batches') is not null)::text
union all select 'obj:idx_trips_org_count_cover', (to_regclass('public.idx_trips_org_count_cover') is not null)::text
union all select 'obj:idx_trips_org_created_cover', (to_regclass('public.idx_trips_org_created_cover') is not null)::text
union all select 'obj:market_bids_one_pending_per_carrier_idx', (to_regclass('public.market_bids_one_pending_per_carrier_idx') is not null)::text
union all select 'fn:'||n, (select count(*) from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname=n)::text
  from unnest(array['bulk_payment_post_record','bulk_payment_field_submit','bulk_payment_field_correct','bulk_payment_amount_allowed','bulk_payment_mode_id','bulk_payment_normalize_fields','bulk_payment_commit_row','list_trips_where_org_is_supplier_keyset','list_compliance_ops_pipeline_keyset','compliance_ops_pipeline_match','hub_tile_match','tg_market_bid_set_expiry','submit_market_bid','list_my_org_market_bids','list_market_bids_for_indent','is_org_staff','_attach_market_lane_commit']) n
union all select 'meta:hist_count', count(*)::text from supabase_migrations.schema_migrations
union all select 'meta:max_version', max(version) from supabase_migrations.schema_migrations
union all select 'meta:db', current_database()||' '||split_part(version(),' ',2)
order by 1;
