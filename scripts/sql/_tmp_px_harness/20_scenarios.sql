\set ON_ERROR_STOP on
-- Pulse Exchange two-gate scenarios. Runs as superuser for setup, then as
-- `authenticated` with a JWT subject per actor.

CREATE TRIGGER trg_sync_trip_payment_status AFTER INSERT OR DELETE OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_trip_payment_status();

CREATE FUNCTION public.t_assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED: %', p_msg; END IF;
  RAISE NOTICE 'PASS %', p_msg;
END $$;
CREATE FUNCTION public.t_expect_error(p_sql text, p_pattern text, p_msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ~* p_pattern THEN RAISE NOTICE 'PASS % (%)', p_msg, SQLERRM; RETURN; END IF;
    RAISE EXCEPTION 'ASSERT FAILED: % expected /%/ got: %', p_msg, p_pattern, SQLERRM;
  END;
  RAISE EXCEPTION 'ASSERT FAILED: % expected error /%/ but statement succeeded', p_msg, p_pattern;
END $$;
CREATE FUNCTION public.t_as(p_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false)
$$;
GRANT EXECUTE ON FUNCTION public.t_assert(boolean, text), public.t_expect_error(text, text, text), public.t_as(uuid) TO authenticated;

-- Orgs: A shipper, B Marketplace bidder, C Network supplier of A, S stranger.
INSERT INTO public.organizations (id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Shipper A'),
  ('b0000000-0000-0000-0000-000000000001', 'Bidder B'),
  ('c0000000-0000-0000-0000-000000000001', 'Network C'),
  ('d0000000-0000-0000-0000-000000000001', 'Stranger S');
INSERT INTO auth.users (id) VALUES
  ('a1000000-0000-0000-0000-000000000001'), ('a2000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000001'), ('b2000000-0000-0000-0000-000000000001'),
  ('c1000000-0000-0000-0000-000000000001'), ('d1000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000001');
INSERT INTO public.users (id, name) SELECT id, 'u' FROM auth.users;
INSERT INTO public.org_members (organization_id, user_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001');

-- A's Network supplier C, and a regular customer of A.
INSERT INTO public.suppliers (id, organization_id, name, supplier_type, linked_organization_id)
VALUES ('5c000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Network C', 'integrated', 'c0000000-0000-0000-0000-000000000001');
INSERT INTO public.clients (id, organization_id, name, phone)
VALUES ('cc000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Customer', '9000000001');

-- I1: 'both' indent won on the Marketplace by B (bid 30,000, fee 500 unpaid).
INSERT INTO public.indents (id, organization_id, status, assigned_supplier_id, assigned_supplier_rate, client_price, circulation_target)
VALUES ('11000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'awarded', 'b0000000-0000-0000-0000-000000000001', 30000, 32500, 'both');
INSERT INTO public.market_bids (id, indent_id, bidder_type, bidder_organization_id, bidder_user_id, status, amount, fee_payment_status, platform_fee_amount, accepted_at)
VALUES ('b1d00000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', 'organization', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'accepted', 30000, 'required', 500, now());
-- I2: 'both' indent won by Network supplier C.
INSERT INTO public.indents (id, organization_id, status, assigned_supplier_id, assigned_supplier_rate, client_price, circulation_target)
VALUES ('12000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'awarded', 'c0000000-0000-0000-0000-000000000001', 25000, 28000, 'both');
-- I3: Marketplace indent won by B through an accepted direct quote.
INSERT INTO public.indents (id, organization_id, status, assigned_supplier_id, assigned_supplier_rate, client_price, circulation_target)
VALUES ('13000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'awarded', 'b0000000-0000-0000-0000-000000000001', 20000, 22000, 'marketplace');
INSERT INTO public.direct_quotes (id, indent_id, bidder_organization_id, amount, status)
VALUES ('d9000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 20000, 'accepted');
-- A second accepted bid of B with an unpaid fee (no trip yet).
INSERT INTO public.indents (id, organization_id, status, assigned_supplier_id, client_price, circulation_target)
VALUES ('14000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'awarded', 'b0000000-0000-0000-0000-000000000001', 9000, 'marketplace');
INSERT INTO public.market_bids (id, indent_id, bidder_type, bidder_organization_id, status, amount, fee_payment_status, platform_fee_amount, accepted_at)
VALUES ('b2d00000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'organization', 'b0000000-0000-0000-0000-000000000001', 'accepted', 8000, 'required', 700, now());

SET ROLE authenticated;

-- ===== Award -> trip =====
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT id FROM public.create_trip_from_assigned_indent('11000000-0000-0000-0000-000000000001') \gset mtrip_
RESET ROLE;
SELECT public.t_assert(
  (SELECT t.source = 'market_bid' AND t.trip_payout_mode = 'market' AND t.client_price = 32500 AND t.supplier_rate = 30000
          AND s.system_party_key = 'pulse_exchange' AND s.organization_id = t.organization_id
   FROM public.trips t JOIN public.suppliers s ON s.id = t.supplier_id WHERE t.id = :'mtrip_id'),
  'marketplace trip: market lane, shipper client_price kept, supplier = shipper Pulse Exchange');
SELECT public.t_assert(
  (SELECT count(*) = 1 FROM public.clients WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND system_party_key = 'pulse_exchange'),
  'bidder Pulse Exchange client created at deploy');
SELECT public.t_assert(
  (SELECT count(*) = 1 FROM public.transactions WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND ledger_category = 'MARKETPLACE_PLATFORM_FEE'
     AND amount_out = 500 AND contact_type = 'supplier'
     AND contact_id = (SELECT id FROM public.suppliers WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND system_party_key = 'pulse_exchange')),
  'cash fee posted once to bidder ledger against its Pulse Exchange supplier');

SET ROLE authenticated;
SELECT public.t_as('c1000000-0000-0000-0000-000000000001');
SELECT id FROM public.create_trip_from_assigned_indent('12000000-0000-0000-0000-000000000001') \gset ntrip_
SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT id FROM public.create_trip_from_direct_quote('d9000000-0000-0000-0000-000000000001') \gset qtrip_
RESET ROLE;
SELECT public.t_assert(
  (SELECT source = 'indent' AND supplier_id = '5c000000-0000-0000-0000-000000000001' AND trip_payout_mode = 'market' FROM public.trips WHERE id = :'ntrip_id'),
  'network award on a both indent links the Network supplier');
SELECT public.t_assert(
  (SELECT t.source = 'direct_quote' AND t.trip_payout_mode = 'market' AND s.system_party_key = 'pulse_exchange'
   FROM public.trips t JOIN public.suppliers s ON s.id = t.supplier_id WHERE t.id = :'qtrip_id'),
  'marketplace direct-quote trip settles through Pulse Exchange');

-- ===== Summary visibility =====
SET ROLE authenticated;
SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT public.t_assert((public.get_exchange_trip_summary(:'mtrip_id')->>'viewer_side') = 'payer', 'shipper sees payer side');
SELECT public.t_assert((public.get_exchange_trip_summary(:'mtrip_id')->>'agreed_amount')::numeric = 30000, 'agreed amount = supplier rate');
SELECT public.t_assert(public.get_exchange_trip_summary(:'ntrip_id') IS NULL, 'network trip has no Exchange summary');
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT public.t_assert((public.get_exchange_trip_summary(:'mtrip_id')->>'viewer_side') = 'payee', 'bidder sees payee side');
SELECT public.t_as('d1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(public.get_exchange_trip_summary(:'mtrip_id') IS NULL, 'stranger sees nothing');

-- ===== Gate 1: shipper records 10,000 =====
SELECT public.t_as('d1000000-0000-0000-0000-000000000001');
SELECT public.t_expect_error(format($q$SELECT public.claim_exchange_payment(%L, 100, 'UPI', 'k-s')$q$, :'mtrip_id'), 'unauthorized', 'stranger cannot claim');
SELECT public.t_as('e1000000-0000-0000-0000-000000000001');
SELECT public.t_expect_error(format($q$SELECT public.claim_exchange_payment(%L, 100, 'UPI', 'k-e')$q$, :'mtrip_id'), 'ambiguous_side', 'staff of both orgs cannot claim');
SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT public.t_expect_error(format($q$SELECT public.claim_exchange_payment(%L, 100, 'UPI', 'k-n')$q$, :'ntrip_id'), 'not_exchange_trip', 'network trip cannot be claimed');
SELECT public.t_expect_error(format($q$SELECT public.claim_exchange_payment(%L, 100, 'WIRE', 'k-m')$q$, :'mtrip_id'), 'payment mode', 'invalid mode rejected');
SELECT (public.claim_exchange_payment(:'mtrip_id', 10000, 'UPI', 'k-1', 'UTR-001'))->>'id' AS p1 \gset
SELECT public.t_assert((public.claim_exchange_payment(:'mtrip_id', 10000, 'UPI', 'k-1', 'UTR-001'))->>'note' = 'duplicate_request', 'idempotent replay returns the same claim');
SELECT public.t_expect_error(format($q$SELECT public.claim_exchange_payment(%L, 999, 'UPI', 'k-1')$q$, :'mtrip_id'), 'idempotency_conflict', 'reused key with other amount rejected');
SELECT public.t_expect_error(format($q$SELECT public.claim_exchange_payment(%L, 100, 'UPI', 'k-2', 'utr-001')$q$, :'mtrip_id'), 'duplicate_reference', 'duplicate UTR rejected (case-insensitive)');
SELECT public.t_expect_error(format($q$SELECT public.claim_exchange_payment(%L, 25000, 'BANK', 'k-3')$q$, :'mtrip_id'), 'over_settlement', 'claims cannot exceed agreed amount');
SELECT public.t_assert((SELECT count(*) = 0 FROM public.transactions WHERE ledger_category IN ('EXCHANGE_PAYMENT', 'EXCHANGE_RECEIPT')), 'a claim writes nothing to Finance');

-- ===== Gate 2 =====
SELECT public.t_as('a2000000-0000-0000-0000-000000000001');
SELECT public.t_expect_error(format($q$SELECT public.confirm_exchange_payment(%L)$q$, :'p1'), 'only the other side', 'claiming side cannot confirm');
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT public.t_assert((public.confirm_exchange_payment(:'p1'))->>'status' = 'confirmed', 'bidder confirms');
SELECT public.t_assert((public.confirm_exchange_payment(:'p1'))->>'note' = 'already_confirmed', 'confirm is idempotent');
RESET ROLE;
SELECT public.t_assert(
  (SELECT count(*) = 1 FROM public.transactions WHERE organization_id = 'a0000000-0000-0000-0000-000000000001' AND ledger_category = 'EXCHANGE_PAYMENT'
     AND amount_out = 10000 AND contact_type = 'supplier' AND payment_reference = 'UTR-001' AND trip_id = :'mtrip_id'
     AND description = 'EXCHANGE PAYMENT | Mode: UPI | UTR: UTR-001' AND created_by = 'a1000000-0000-0000-0000-000000000001'),
  'payer ledger: amount_out against shipper Pulse Exchange');
SELECT public.t_assert(
  (SELECT count(*) = 1 FROM public.transactions WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND ledger_category = 'EXCHANGE_RECEIPT'
     AND amount_in = 10000 AND contact_type = 'client' AND trip_id = :'mtrip_id' AND created_by = 'b1000000-0000-0000-0000-000000000001'
     AND contact_id = (SELECT id FROM public.clients WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND system_party_key = 'pulse_exchange')),
  'payee ledger: amount_in against bidder Pulse Exchange');
SELECT public.t_assert((SELECT coalesce(amount_paid, 0) = 0 FROM public.trips WHERE id = :'mtrip_id'),
  'bidder receipt does not mark the shipper customer invoice paid');

-- ===== Payee-initiated claim, reject, cancel =====
SET ROLE authenticated;
SELECT public.t_as('b2000000-0000-0000-0000-000000000001');
SELECT (public.claim_exchange_payment(:'mtrip_id', 5000, 'cash', 'k-4'))->>'id' AS p2 \gset
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT public.t_expect_error(format($q$SELECT public.confirm_exchange_payment(%L)$q$, :'p2'), 'only the other side', 'payee staff cannot confirm payee claim');
SELECT public.t_as('a2000000-0000-0000-0000-000000000001');
SELECT public.t_assert((public.confirm_exchange_payment(:'p2'))->>'status' = 'confirmed', 'shipper confirms the bidder''s receipt claim');

SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT (public.claim_exchange_payment(:'mtrip_id', 1000, 'CHEQUE', 'k-5', 'CHQ-9'))->>'id' AS p3 \gset
SELECT (public.claim_exchange_payment(:'mtrip_id', 1000, 'BANK', 'k-6'))->>'id' AS p4 \gset
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT public.t_expect_error(format($q$SELECT public.reject_exchange_payment(%L, '  ')$q$, :'p3'), 'reason is required', 'reject needs a reason');
SELECT public.t_assert((public.reject_exchange_payment(:'p3', 'Not received'))->>'status' = 'rejected', 'bidder rejects');
SELECT public.t_expect_error(format($q$SELECT public.cancel_exchange_payment(%L)$q$, :'p4'), 'only the side that recorded', 'other side cannot withdraw');
SELECT public.t_as('a2000000-0000-0000-0000-000000000001');
SELECT public.t_assert((public.cancel_exchange_payment(:'p4'))->>'status' = 'cancelled', 'claiming org withdraws');
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT public.t_expect_error(format($q$SELECT public.confirm_exchange_payment(%L)$q$, :'p4'), 'invalid_state', 'withdrawn claim cannot be confirmed');
SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT public.t_assert((public.claim_exchange_payment(:'mtrip_id', 100, 'UPI', 'k-7', 'CHQ-9'))->>'status' = 'claimed', 'reference of a rejected claim can be reused');

-- ===== Guards =====
SELECT public.t_expect_error(format($q$INSERT INTO public.transactions (organization_id, trip_id, party_name, amount_out, contact_type, contact_id)
  VALUES ('a0000000-0000-0000-0000-000000000001', %L, 'x', 50, 'supplier', (SELECT supplier_id FROM public.trips WHERE id = %L))$q$, :'mtrip_id', :'mtrip_id'),
  'exchange_ledger_locked', 'direct Finance insert against Pulse Exchange blocked');
SELECT public.t_expect_error($q$UPDATE public.transactions SET description = 'edit' WHERE ledger_category = 'EXCHANGE_PAYMENT'$q$,
  'exchange_ledger_locked', 'confirmed Exchange row cannot be edited');
SELECT public.t_expect_error($q$DELETE FROM public.transactions WHERE ledger_category = 'EXCHANGE_PAYMENT'$q$,
  'exchange_ledger_locked', 'confirmed Exchange row cannot be deleted');
SELECT public.t_expect_error($q$UPDATE public.suppliers SET name = 'Mine' WHERE system_party_key = 'pulse_exchange'$q$,
  'protected', 'Pulse Exchange party cannot be renamed');
SELECT public.t_expect_error($q$UPDATE public.suppliers SET is_active = false WHERE system_party_key = 'pulse_exchange'$q$,
  'protected', 'Pulse Exchange party cannot be deactivated');
SELECT public.t_expect_error($q$DELETE FROM public.suppliers WHERE system_party_key = 'pulse_exchange'$q$,
  'protected', 'Pulse Exchange party cannot be deleted');
SELECT public.t_expect_error($q$INSERT INTO public.suppliers (organization_id, name, system_party_key) VALUES ('a0000000-0000-0000-0000-000000000001', 'Fake', 'pulse_exchange')$q$,
  'reserved', 'users cannot create a Pulse Exchange party');
SELECT public.t_expect_error($q$UPDATE public.clients SET system_party_key = 'pulse_exchange' WHERE id = 'cc000000-0000-0000-0000-000000000001'$q$,
  'reserved', 'users cannot convert a party into Pulse Exchange');
SELECT public.t_expect_error(format($q$INSERT INTO public.trips (organization_id, source, supplier_id, status) VALUES ('a0000000-0000-0000-0000-000000000001', 'manual', (SELECT supplier_id FROM public.trips WHERE id = %L), 'draft')$q$, :'mtrip_id'),
  'pulse_exchange_supplier_reserved', 'Pulse Exchange cannot be the supplier on a manual trip');
UPDATE public.suppliers SET contact_person = 'ok' WHERE id = '5c000000-0000-0000-0000-000000000001';
UPDATE public.suppliers SET contact_person = 'Desk' WHERE system_party_key = 'pulse_exchange';
SELECT public.t_assert((SELECT count(*) >= 2 FROM public.suppliers WHERE contact_person IN ('ok', 'Desk')), 'ordinary party edits still pass the guards');
SELECT public.t_expect_error($q$INSERT INTO public.exchange_payments (trip_id, payer_organization_id, payee_organization_id, amount, payment_mode, paid_on, claimed_by_side, idempotency_key)
  VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 'UPI', current_date, 'payer', 'x')$q$,
  'permission denied', 'no direct insert into exchange_payments');
SELECT public.t_as('d1000000-0000-0000-0000-000000000001');
SELECT public.t_assert((SELECT count(*) = 0 FROM public.exchange_payments), 'stranger reads no exchange payments');
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT public.t_assert((SELECT count(*) = 5 FROM public.exchange_payments), 'bidder reads its exchange payments');

-- ===== Finance aggregation =====
SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT due = 50000 AND paid = 15000 AND unsettled = 35000 AND trips_count = 2
   FROM public.get_supplier_ledger_aggregation('a0000000-0000-0000-0000-000000000001')
   WHERE supplier_id = (SELECT supplier_id FROM public.trips WHERE id = :'mtrip_id')),
  'shipper Pulse Exchange payable: 2 trips 50,000 due, 15,000 confirmed paid');
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT due = 1200 AND paid = 500 AND unsettled = 700
   FROM public.get_supplier_ledger_aggregation('b0000000-0000-0000-0000-000000000001') x
   JOIN public.suppliers s ON s.id = x.supplier_id AND s.system_party_key = 'pulse_exchange'),
  'bidder Pulse Exchange fee payable: 500 paid + 700 unpaid');
SELECT public.t_assert(
  (SELECT count(*) = 2
     AND sum((e->>'sales')::numeric) = 50000
     AND sum((e->>'initial_paid')::numeric) = 15000
   FROM jsonb_array_elements(public.get_customer_ledger_inputs('b0000000-0000-0000-0000-000000000001')->'trip_inputs') e
   WHERE e->>'client_id' = (SELECT id::text FROM public.clients WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND system_party_key = 'pulse_exchange')),
  'bidder Pulse Exchange receivable: 2 won trips 50,000 billed, 15,000 received');
SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT count(*) = 0 FROM jsonb_array_elements(public.get_customer_ledger_inputs('a0000000-0000-0000-0000-000000000001')->'trip_inputs') e
   WHERE e->>'client_id' IN (SELECT id::text FROM public.clients WHERE system_party_key = 'pulse_exchange')),
  'shipper has no Pulse Exchange receivable for trips it gave out');

-- ===== Shipper's own customer receipt still syncs =====
INSERT INTO public.transactions (organization_id, trip_id, party_name, amount_in, contact_type, contact_id)
VALUES ('a0000000-0000-0000-0000-000000000001', :'mtrip_id', 'Customer', 32500, 'client', 'cc000000-0000-0000-0000-000000000001');
RESET ROLE;
SELECT public.t_assert((SELECT amount_paid = 32500 AND payment_status = 'paid' FROM public.trips WHERE id = :'mtrip_id'),
  'owner customer receipt still updates trip payment status');

-- ===== Razorpay fee =====
INSERT INTO public.marketplace_fee_payments (id, market_bid_id, bidder_type, bidder_organization_id, amount, provider, provider_order_id, status)
VALUES ('fe000000-0000-0000-0000-000000000001', 'b2d00000-0000-0000-0000-000000000001', 'organization', 'b0000000-0000-0000-0000-000000000001', 700, 'razorpay', 'order_1', 'pending');
UPDATE public.marketplace_fee_payments SET status = 'paid', paid_at = now(), provider_payment_id = 'pay_1' WHERE id = 'fe000000-0000-0000-0000-000000000001';
UPDATE public.market_bids SET fee_payment_status = 'paid' WHERE id = 'b2d00000-0000-0000-0000-000000000001';
UPDATE public.marketplace_fee_payments SET provider_event_id = 'evt_2', status = 'paid' WHERE id = 'fe000000-0000-0000-0000-000000000001';
SELECT public.t_assert(
  (SELECT count(*) = 1 FROM public.transactions WHERE payment_ref = 'b2d00000-0000-0000-0000-000000000001' AND ledger_category = 'MARKETPLACE_PLATFORM_FEE'
     AND amount_out = 700 AND payment_reference = 'pay_1' AND description = 'MARKETPLACE PLATFORM FEE | Mode: Online | UTR: pay_1'),
  'online fee posts once with the provider payment id');
SET ROLE authenticated;
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT due = 1200 AND paid = 1200 AND unsettled = 0
   FROM public.get_supplier_ledger_aggregation('b0000000-0000-0000-0000-000000000001') x
   JOIN public.suppliers s ON s.id = x.supplier_id AND s.system_party_key = 'pulse_exchange'),
  'bidder fee payable settles to zero after online payment');
SELECT public.t_assert(
  (public.ensure_pulse_exchange_parties('b0000000-0000-0000-0000-000000000001')->>'supplier_id') =
  (SELECT id::text FROM public.suppliers WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND system_party_key = 'pulse_exchange'),
  'ensure_pulse_exchange_parties returns the existing party');
SELECT public.t_expect_error($q$SELECT public.ensure_pulse_exchange_parties('a0000000-0000-0000-0000-000000000001')$q$, 'unauthorized', 'non-member cannot ensure another org''s parties');
SELECT public.t_as('d1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT count(*) = 2 FROM jsonb_each_text(public.ensure_pulse_exchange_parties('d0000000-0000-0000-0000-000000000001'))),
  'first call creates both default parties');
RESET ROLE;

-- ===== Bidder execution trip (mover_asset) =====
-- B also has a real customer row named after the shipper; it must never be billed.
INSERT INTO public.clients (id, organization_id, name, phone)
VALUES ('cc000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Shipper A', '9000000002');
INSERT INTO public.drivers (id, organization_id, name) VALUES
  ('db000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'B driver'),
  ('dc000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'C driver');
-- I5: Marketplace bid won by B (18,000, no fee), executed with B's own driver.
INSERT INTO public.indents (id, organization_id, status, assigned_supplier_id, assigned_supplier_rate, client_price, circulation_target, indent_code)
VALUES ('15000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'awarded', 'b0000000-0000-0000-0000-000000000001', 18000, 21000, 'marketplace', 'IND-5');
INSERT INTO public.market_bids (id, indent_id, bidder_type, bidder_organization_id, bidder_user_id, status, amount, fee_payment_status, platform_fee_amount, accepted_at)
VALUES ('b3d00000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'organization', 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'accepted', 18000, 'not_required', 0, now());

SET ROLE authenticated;
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT id FROM public.create_trip_from_assigned_indent('15000000-0000-0000-0000-000000000001') \gset s5trip_
SELECT id FROM public.create_mover_asset_trip('15000000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001') \gset mirror_
SELECT public.t_assert(
  (SELECT m.source = 'mover_asset' AND m.client_name = 'Pulse Exchange' AND m.client_price = 18000 AND m.source_indent_code = 'IND-5'
          AND c.system_party_key = 'pulse_exchange' AND c.organization_id = 'b0000000-0000-0000-0000-000000000001'
   FROM public.trips m JOIN public.clients c ON c.id = m.client_id WHERE m.id = :'mirror_id'),
  'marketplace execution trip bills the bidder''s Pulse Exchange client, not the shipper');
SELECT public.t_assert((SELECT id FROM public.create_mover_asset_trip('15000000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001')) = :'mirror_id',
  'create_mover_asset_trip stays idempotent');
SELECT public.t_as('c1000000-0000-0000-0000-000000000001');
SELECT id FROM public.create_mover_asset_trip('12000000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001') \gset nmirror_
RESET ROLE;
SELECT public.t_assert((SELECT client_name = 'Shipper A' AND client_id IS NULL FROM public.trips WHERE id = :'nmirror_id'),
  'network execution trip keeps billing the shipper by name');
SELECT public._ensure_mover_asset_trip('13000000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT m.status = 'draft' AND m.client_price = 20000 AND c.system_party_key = 'pulse_exchange'
   FROM public.trips m JOIN public.clients c ON c.id = m.client_id
   WHERE m.source = 'mover_asset' AND m.source_indent_id = '13000000-0000-0000-0000-000000000001'),
  '_ensure_mover_asset_trip (direct quote) also bills Pulse Exchange');

SET ROLE authenticated;
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT s->>'viewer_side' = 'payee' AND (s->>'agreed_amount')::numeric = 18000 AND s->>'trip_id' = :'s5trip_id'
   FROM (SELECT public.get_exchange_trip_summary(:'mirror_id') AS s) x),
  'summary from the execution trip resolves to the Exchange trip');
SELECT (public.claim_exchange_payment(:'mirror_id', 6000, 'UPI', 'k-m1', 'UTR-M1'))->>'id' AS pm1 \gset
SELECT public.t_assert((SELECT trip_id = :'s5trip_id' FROM public.exchange_payments WHERE id = :'pm1'),
  'claim from the execution trip is recorded on the Exchange trip');
SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT public.t_assert((public.confirm_exchange_payment(:'pm1'))->>'status' = 'confirmed', 'shipper confirms the execution-trip claim');
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT (public.claim_exchange_payment(:'s5trip_id', 2000, 'UPI', 'k-m2', 'UTR-M2'))->>'id' AS pm2 \gset
SELECT public.t_assert(public.get_mover_asset_client_paid(:'mirror_id') = 6000,
  'execution trip client-paid counts confirmed Exchange receipts only');
RESET ROLE;
SELECT public.t_assert(
  (SELECT count(*) = 1 FROM public.transactions WHERE organization_id = 'a0000000-0000-0000-0000-000000000001'
     AND ledger_category = 'EXCHANGE_PAYMENT' AND amount_out = 6000 AND trip_id = :'s5trip_id'),
  'shipper payment posts on its Exchange trip');
SELECT public.t_assert(
  (SELECT count(*) = 1 FROM public.transactions WHERE organization_id = 'b0000000-0000-0000-0000-000000000001'
     AND ledger_category = 'EXCHANGE_RECEIPT' AND amount_in = 6000 AND trip_id = :'mirror_id'),
  'bidder receipt posts on its execution trip');
SELECT public.t_assert((SELECT amount_paid = 6000 FROM public.trips WHERE id = :'mirror_id'),
  'execution trip amount_paid follows the confirmed receipt');

SET ROLE authenticated;
SELECT public.t_as('b1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT count(*) = 3 AND sum((e->>'sales')::numeric) = 68000
     AND count(*) FILTER (WHERE e->>'trip_id' = :'mirror_id') = 1
     AND count(*) FILTER (WHERE e->>'trip_id' IN (:'s5trip_id', :'qtrip_id')) = 0
   FROM jsonb_array_elements(public.get_customer_ledger_inputs('b0000000-0000-0000-0000-000000000001')->'trip_inputs') e
   WHERE e->>'client_id' = (SELECT id::text FROM public.clients WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND system_party_key = 'pulse_exchange')),
  'bidder receivable counts each won trip once (execution trip replaces the Exchange row)');
SELECT public.t_assert(
  (SELECT count(*) = 0 FROM jsonb_array_elements(public.get_customer_ledger_inputs('b0000000-0000-0000-0000-000000000001')->'trip_inputs') e
   WHERE e->>'client_id' = 'cc000000-0000-0000-0000-000000000002'),
  'bidder never bills the shipper as a Finance customer');
RESET ROLE;

-- ===== Marketplace DCO (Driver App surface of the same Exchange record) =====
-- F is an individual DCO. Its tracking-only driver row makes it a non-staff
-- member of shipper A, as in production.
INSERT INTO auth.users (id) VALUES ('f1000000-0000-0000-0000-000000000001');
INSERT INTO public.users (id, name) VALUES ('f1000000-0000-0000-0000-000000000001', 'Ravi DCO');
INSERT INTO public.org_members (organization_id, user_id, staff) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', false);
INSERT INTO public.dco_payees (id, user_id) VALUES ('dd000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001');
INSERT INTO public.indents (id, organization_id, status, client_price, circulation_target, client_name)
VALUES ('16000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'awarded', 17000, 'marketplace', 'Customer');
INSERT INTO public.market_bids (id, indent_id, bidder_type, bidder_organization_id, bidder_user_id, status, amount, fee_payment_status, platform_fee_amount, accepted_at)
VALUES ('b4d00000-0000-0000-0000-000000000001', '16000000-0000-0000-0000-000000000001', 'dco', NULL, 'f1000000-0000-0000-0000-000000000001', 'accepted', 15000, 'not_required', 0, now());
-- A Reach direct-bid DCO trip of the same DCO stays on the DCO payee lane.
INSERT INTO public.trips (organization_id, source, operating_mode, dco_payee_id, supplier_rate, client_price, trip_payout_mode, status)
VALUES ('a0000000-0000-0000-0000-000000000001', 'direct_bid', 'DCO', 'dd000000-0000-0000-0000-000000000001', 5000, 5000, 'market', 'completed');

SET ROLE authenticated;
SELECT public.t_as('f1000000-0000-0000-0000-000000000001');
SELECT (public.create_market_trip_after_fee_payment('b4d00000-0000-0000-0000-000000000001'))->>'trip_id' AS dtrip_id \gset
RESET ROLE;
SELECT public.t_assert(
  (SELECT t.operating_mode = 'DCO' AND t.dco_payee_id = 'dd000000-0000-0000-0000-000000000001' AND t.trip_payout_mode = 'market'
          AND t.supplier_rate = 15000 AND s.system_party_key = 'pulse_exchange' AND s.organization_id = t.organization_id
   FROM public.trips t JOIN public.suppliers s ON s.id = t.supplier_id WHERE t.id = :'dtrip_id'),
  'DCO1 marketplace DCO trip settles through the shipper''s Pulse Exchange supplier');
SELECT public.t_expect_error(format($q$UPDATE public.trips SET supplier_id = '5c000000-0000-0000-0000-000000000001' WHERE id = %L$q$, :'dtrip_id'),
  'dco_trip_supplier', 'a DCO trip cannot carry an ordinary supplier');
SELECT public.t_expect_error($q$INSERT INTO public.trips (organization_id, source, operating_mode, dco_payee_id, supplier_id, status)
  VALUES ('a0000000-0000-0000-0000-000000000001', 'direct_bid', 'DCO', 'dd000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 'draft')$q$,
  'dco_trip_supplier|trips_dco_consistency_check', 'a Reach DCO trip still has no supplier');
SELECT public.t_expect_error($q$INSERT INTO public.trips (organization_id, source, operating_mode, dco_payee_id, supplier_id, status)
  VALUES ('a0000000-0000-0000-0000-000000000001', 'direct_bid', 'DCO', 'dd000000-0000-0000-0000-000000000001',
          (SELECT id FROM public.suppliers WHERE organization_id = 'a0000000-0000-0000-0000-000000000001' AND system_party_key = 'pulse_exchange'), 'draft')$q$,
  'pulse_exchange_supplier_reserved|trips_dco_consistency_check', 'a Reach DCO trip cannot use Pulse Exchange');

SET ROLE authenticated;
SELECT public.t_as('f1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT s->>'viewer_side' = 'payee' AND s->>'payee_kind' = 'dco' AND s->>'trip_id' = :'dtrip_id'
          AND (s->>'agreed_amount')::numeric = 15000 AND s->>'payee_organization_name' = 'Ravi DCO'
   FROM (SELECT public.get_exchange_trip_summary(:'dtrip_id') AS s) x),
  'DCO2 driver app identifies the Exchange receivable on the trip it drives');
SELECT public.t_assert(public.get_exchange_trip_summary(:'mtrip_id') IS NULL,
  'DCO stub membership does not reveal the shipper''s other Exchange trips');
SELECT public.t_assert((SELECT count(*) = 0 FROM public.exchange_payments WHERE trip_id <> :'dtrip_id'),
  'DCO reads no other Exchange payments');
SELECT public.t_expect_error(format($q$SELECT public.claim_exchange_payment(%L, 100, 'UPI', 'k-dx')$q$, :'mtrip_id'),
  'unauthorized', 'DCO cannot claim on someone else''s Exchange trip');

-- Gate 1 from the Driver App, gate 2 from the Business App.
SELECT (public.claim_exchange_payment(:'dtrip_id', 4000, 'UPI', 'k-d1', 'UTR-D1'))->>'id' AS pd1 \gset
SELECT public.t_assert((SELECT claimed_by_side = 'payee' AND payee_dco_payee_id = 'dd000000-0000-0000-0000-000000000001'
                          AND payee_organization_id IS NULL AND trip_id = :'dtrip_id' FROM public.exchange_payments WHERE id = :'pd1'),
  'DCO4 driver claim is a row on the same Exchange trip');
SELECT public.t_expect_error(format($q$SELECT public.confirm_exchange_payment(%L)$q$, :'pd1'), 'only the other side', 'DCO cannot confirm its own claim');
SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT public.t_assert((public.confirm_exchange_payment(:'pd1'))->>'status' = 'confirmed', 'shipper confirms the DCO''s claim');
-- Gate 1 from the Business App, gate 2 from the Driver App.
SELECT (public.claim_exchange_payment(:'dtrip_id', 3000, 'BANK', 'k-d2', 'UTR-D2'))->>'id' AS pd2 \gset
SELECT public.t_as('f1000000-0000-0000-0000-000000000001');
SELECT public.t_assert((public.confirm_exchange_payment(:'pd2'))->>'status' = 'confirmed', 'DCO5 DCO confirms the shipper''s claim in the Driver App');
SELECT public.t_assert((public.confirm_exchange_payment(:'pd2'))->>'note' = 'already_confirmed', 'DCO confirm is idempotent');
SELECT public.t_as('a2000000-0000-0000-0000-000000000001');
SELECT (public.claim_exchange_payment(:'dtrip_id', 1000, 'CASH', 'k-d3'))->>'id' AS pd3 \gset
SELECT (public.claim_exchange_payment(:'dtrip_id', 500, 'CASH', 'k-d4'))->>'id' AS pd4 \gset
SELECT public.t_as('f1000000-0000-0000-0000-000000000001');
SELECT public.t_assert((public.reject_exchange_payment(:'pd3', 'Not received'))->>'status' = 'rejected', 'DCO rejects a shipper claim');
SELECT public.t_expect_error(format($q$SELECT public.cancel_exchange_payment(%L)$q$, :'pd4'), 'only the side that recorded', 'DCO cannot withdraw the shipper''s claim');
SELECT public.t_expect_error(format($q$SELECT public.claim_exchange_payment(%L, 9000, 'UPI', 'k-d5')$q$, :'dtrip_id'),
  'over_settlement', 'DCO claims cannot exceed the agreed amount');
SELECT (public.claim_exchange_payment(:'dtrip_id', 200, 'UPI', 'k-d6'))->>'id' AS pd6 \gset
SELECT public.t_assert((public.cancel_exchange_payment(:'pd6'))->>'status' = 'cancelled', 'DCO withdraws its own claim');
SELECT public.t_assert(
  (SELECT (s->>'confirmed_amount')::numeric = 7000 AND (s->>'claimed_amount')::numeric = 500 FROM (SELECT public.get_exchange_trip_summary(:'dtrip_id') AS s) x),
  'DCO view: 7,000 confirmed, 500 pending');
SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT s->>'viewer_side' = 'payer' AND (s->>'agreed_amount')::numeric = 15000
          AND (s->>'confirmed_amount')::numeric = 7000 AND (s->>'claimed_amount')::numeric = 500
   FROM (SELECT public.get_exchange_trip_summary(:'dtrip_id') AS s) x),
  'DCO3 shipper sees the same agreed, confirmed and pending amounts');
SELECT public.t_expect_error(format($q$INSERT INTO public.transactions (organization_id, trip_id, party_name, amount_out, contact_type, contact_id)
  VALUES ('a0000000-0000-0000-0000-000000000001', %L, 'Ravi DCO', 100, 'dco', 'dd000000-0000-0000-0000-000000000001')$q$, :'dtrip_id'),
  'exchange_ledger_locked', 'no direct DCO payment on an Exchange-settled DCO trip');
RESET ROLE;

SELECT public.t_assert(
  (SELECT count(*) = 2 AND sum(amount_out) = 7000 AND bool_and(contact_type = 'supplier' AND ledger_category = 'EXCHANGE_PAYMENT'
     AND organization_id = 'a0000000-0000-0000-0000-000000000001'
     AND contact_id = (SELECT supplier_id FROM public.trips WHERE id = :'dtrip_id'))
   FROM public.transactions WHERE trip_id = :'dtrip_id'),
  'DCO6 Finance has one shipper row per confirmed payment, against Pulse Exchange');
SELECT public.t_assert(
  (SELECT count(*) = 0 FROM public.transactions WHERE payment_ref IN (SELECT 'EXR-' || id::text FROM public.exchange_payments WHERE payee_dco_payee_id IS NOT NULL)),
  'DCO6 no second (receipt) row for an individual DCO');
SELECT public.t_assert(
  (SELECT payee_transaction_id IS NULL AND payer_transaction_id IS NOT NULL FROM public.exchange_payments WHERE id = :'pd2'),
  'DCO confirmed payment links only the payer ledger row');
SELECT public.t_assert((SELECT coalesce(amount_paid, 0) = 0 FROM public.trips WHERE id = :'dtrip_id'),
  'DCO7 shipper customer amount_paid is untouched; the DCO''s received amount is the confirmed Exchange total');

SET ROLE authenticated;
SELECT public.t_as('a1000000-0000-0000-0000-000000000001');
SELECT public.t_assert(
  (SELECT due = 5000 AND trips_count = 1 FROM public.get_dco_ledger_aggregation('a0000000-0000-0000-0000-000000000001')
   WHERE dco_payee_id = 'dd000000-0000-0000-0000-000000000001'),
  'DCO8 the DCO payee lane keeps only the Reach trip (no second obligation)');
SELECT public.t_assert(
  (SELECT due = 83000 AND paid = 28000
   FROM public.get_supplier_ledger_aggregation('a0000000-0000-0000-0000-000000000001')
   WHERE supplier_id = (SELECT supplier_id FROM public.trips WHERE id = :'dtrip_id')),
  'shipper Pulse Exchange payable includes the DCO trip once (83,000 due, 28,000 paid)');
RESET ROLE;
SELECT 'ALL SCENARIOS PASSED' AS result;
