-- READ-ONLY. Step 2: post-apply verification of pulse-exchange-party.
SELECT 'migrations' AS check, string_agg(version || ':' || coalesce(name, ''), ', ' ORDER BY version) AS value
FROM supabase_migrations.schema_migrations
WHERE version IN ('20271006142659', '20271006144616', '20271006163527')
UNION ALL
SELECT 'functions', string_agg(p.proname, ', ' ORDER BY p.proname)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
WHERE p.proname IN ('claim_exchange_payment', 'confirm_exchange_payment', 'reject_exchange_payment',
                    'cancel_exchange_payment', 'get_exchange_trip_summary', '_ensure_pulse_exchange_party',
                    'ensure_pulse_exchange_parties', '_is_dco_payee_user', '_exchange_is_side',
                    '_exchange_payment_caller_is', 'tg_transactions_pulse_exchange_guard',
                    'tg_trips_pulse_exchange_supplier_guard', 'tg_protect_pulse_exchange_party')
UNION ALL
SELECT 'triggers', string_agg(tgname, ', ' ORDER BY tgname)
FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
  'trg_trips_pulse_exchange_supplier_guard', 'trg_transactions_pulse_exchange_guard',
  'trg_suppliers_protect_pulse_exchange', 'trg_clients_protect_pulse_exchange',
  'trg_marketplace_fee_payment_post_ledger', 'set_exchange_payments_updated_at')
UNION ALL
SELECT 'dco_check', pg_get_constraintdef(c.oid) || ' | validated=' || c.convalidated
FROM pg_constraint c WHERE c.conname = 'trips_dco_consistency_check'
UNION ALL
SELECT 'exchange_payments_rows', count(*)::text FROM public.exchange_payments
UNION ALL
SELECT 'px_suppliers', count(*)::text FROM public.suppliers WHERE system_party_key = 'pulse_exchange'
UNION ALL
SELECT 'px_clients', count(*)::text FROM public.clients WHERE system_party_key = 'pulse_exchange'
UNION ALL
SELECT 'trips_on_px_supplier', count(*)::text
FROM public.trips t JOIN public.suppliers s ON s.id = t.supplier_id AND s.system_party_key = 'pulse_exchange'
UNION ALL
SELECT 'exchange_ledger_rows', count(*)::text FROM public.transactions
WHERE ledger_category IN ('EXCHANGE_PAYMENT', 'EXCHANGE_RECEIPT')
UNION ALL
SELECT 'sat812_unrepaired',
  (SELECT (supplier_id IS NULL)::text FROM public.trips WHERE id = '31d183e5-3a57-4b4f-9dcd-781db2b0662c') || '/' ||
  (SELECT coalesce(client_id::text, 'null') || ':' || client_name FROM public.trips WHERE id = '22222d50-f085-4a1c-a609-3ffc52d633af')
UNION ALL
SELECT 'trp135_rows', string_agg(id::text || ':' || coalesce(amount_in, 0) || '/' || coalesce(amount_out, 0), ', ')
FROM public.transactions WHERE trip_id = 'f89afc5f-8b25-4274-81dc-101cab41d206'
UNION ALL
SELECT 'trp135_amount_paid', amount_paid::text || ' ' || payment_status
FROM public.trips WHERE id = 'f89afc5f-8b25-4274-81dc-101cab41d206'
UNION ALL
SELECT 'market_trips_since_apply', count(*)::text
FROM public.trips WHERE source IN ('market_bid', 'direct_quote') AND created_at > now() - interval '1 hour'
UNION ALL
SELECT 'classifier_corrected', (pg_get_functiondef('public.is_marketplace_indent_award'::regproc) ~ 'is_approved_supplier|suppliers')::text;
