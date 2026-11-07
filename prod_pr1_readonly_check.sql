-- PR #1 prod readiness check. READ-ONLY: runs inside a read-only transaction.
\pset pager off
begin transaction read only;
set local statement_timeout = '60s';
\echo '=== 1. schema_migrations: which PR #1 versions prod has recorded'
select v.version, (sm.version is not null) as applied
from (values ('20260929141531'),('20260930165033'),('20260930170616'),('20261005080754'),('20261005122431'),('20270930114500'),('20270930121000'),('20270930123100'),('20270930124500'),('20270930130000'),('20270930153000'),('20270930183000'),('20270930201500'),('20270930213000'),('20270930220000'),('20270930235100'),('20271001093000'),('20271006154500'),('20271006161000'),('20271008112000'),('20271008113000'),('20271008114000'),('20271008115000'),('20271008116000'),('20271008117000'),('20271008118000'),('20271008119000'),('20271008120000'),('20271008121000'),('20271012130500'),('20271012140000'),('20271013101500'),('20271013113000'),('20271013120000'),('20271014051328'),('20260928122336'),('20260928125247'),('20270925195000'),('20270925195500')) v(version)
left join supabase_migrations.schema_migrations sm on sm.version = v.version
order by v.version;
\echo '=== 2. functions created/replaced by PR #1 migrations (missing = not on prod)'
select f.name, coalesce(string_agg(p.oid::regprocedure::text, ' | '), 'MISSING') as prod_signatures
from (values ('approve_trip_compliance_with_exception'),('can_insert_trip_document'),('can_manage_org_document_charges'),('check_transaction_paid_from_account'),('clear_trip_finance_flag'),('compliance_awaiting_resubmit'),('compliance_cleared'),('compliance_missing_required_files'),('compliance_reject_return_queue'),('decline_trip_compliance'),('flag_trip_for_compliance'),('generate_payment_request_no'),('get_compliance_list_trip_facts'),('get_compliance_vehicle_vault_for_trips'),('get_connection_partner_display_batch'),('get_trip_checkpoint_distance_sums'),('get_trip_documents_lr_pod_batch'),('get_trip_driver_phones'),('get_trips_for_org'),('get_vehicle_for_trip_viewer'),('ground_ops_can_see_trip'),('guard_trip_compliance_decline_columns'),('guard_trip_document_delete'),('guard_trip_finance_flag_columns'),('guard_trip_finance_verified_columns'),('issue_payment_request'),('lock_trip_for_compliance_ledger'),('log_trip_hard_copy_pod_courier'),('mark_trip_compliance_verified'),('mark_trip_finance_verified'),('market_indents_for_org'),('private'),('refresh_payment_request_status'),('refund_test_marketplace_fee_and_revoke_indent'),('reject_award_of_inactive_indent'),('reject_quote_accept_on_inactive_indent'),('reject_trip_compliance'),('resubmit_trip_compliance'),('save_org_document_charge_config'),('set_trip_operational_identity'),('tg_payment_requests_immutable'),('tg_transactions_link_payment_request'),('tg_trips_block_blacklisted_supplier'),('unmark_trip_finance_verified')) f(name)
left join pg_proc p on p.proname = f.name and p.pronamespace = 'public'::regnamespace
group by f.name order by (count(p.oid)=0) desc, f.name;
\echo '=== 3. tables'
select t.name, (c.oid is not null) as exists
from (values ('indent_stops'),('marketplace_fee_refunds'),('org_document_charge_settings'),('org_document_charge_slabs'),('payment_request_transactions'),('payment_requests'),('supplier_tds_rates'),('trip_stops')) t(name)
left join pg_class c on c.relname = t.name and c.relnamespace = 'public'::regnamespace
order by 2, 1;
\echo '=== 4. columns'
select x.tbl, x.col, (a.attname is not null) as exists
from (values ('entity_bank_accounts','beneficiary_name'),('entity_bank_accounts','branch_name'),('indents','cancel_reason'),('clients','valid_from'),('clients','valid_to'),('supplier_kyc_documents','doc_number'),('suppliers','aadhaar_number'),('suppliers','advance_percentage'),('suppliers','blacklist_reason'),('suppliers','gumasta_number'),('suppliers','secondary_phone'),('suppliers','status_changed_at'),('suppliers','status_changed_by'),('suppliers','vendor_status'),('trips','compliance_decline_reason'),('trips','compliance_declined_at'),('trips','compliance_declined_by'),('suppliers','primary_region'),('trips','finance_verified_at'),('trips','finance_verified_by'),('trips','compliance_reject_return_to'),('trips','compliance_resubmitted_at'),('trips','compliance_resubmit_note'),('transactions','paid_from_account_id'),('trips','finance_flag_note'),('trips','finance_flagged_at'),('trips','finance_flagged_by'),('entity_bank_accounts','verification_status')) x(tbl,col)
left join pg_attribute a on a.attrelid = to_regclass('public.'||x.tbl) and a.attname = x.col and not a.attisdropped
order by 3, 1, 2;
\echo '=== 5. recent API errors are not in Postgres; check Supabase Logs Explorer for PGRST202 / 42703 / 42P01 since 18:15 IST'
rollback;
