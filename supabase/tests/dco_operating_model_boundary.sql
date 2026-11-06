-- DCO operating-model boundary (20271005120000 + 20271005130000).
-- Letters A–M match the product invariant list.
--
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/dco_operating_model_boundary.sql
-- Pass: every check prints "PASS: ..."; script ends with ROLLBACK.

BEGIN;

DO $$
DECLARE
  v_biz          uuid := 'dc000000-0000-0000-0000-000000000001';
  v_other_biz    uuid := 'dc000000-0000-0000-0000-000000000002';
  v_biz_owner    uuid := 'dc000000-0000-0000-0000-000000000011';
  v_driver_usr   uuid := 'dc000000-0000-0000-0000-000000000021';
  v_dco_usr      uuid := 'dc000000-0000-0000-0000-000000000031';
  v_fo_only_usr  uuid := 'dc000000-0000-0000-0000-000000000041';
  v_driver_row   uuid;
  v_dco_hist_row uuid;
  v_dco_stub_row uuid;
  v_vehicle_id   uuid;
  v_indent_id    uuid;
  v_invite_id    uuid;
  v_dco_invite   uuid;
  v_trip_id      uuid;
  v_payee_id     uuid;
  v_mode         jsonb;
  v_raised       boolean;
  v_count        integer;
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (v_biz_owner,   'dco-test-owner@test.local',     '{}'::jsonb),
    (v_driver_usr,  'dco-test-driver@test.local',    '{"role":"driver"}'::jsonb),
    (v_dco_usr,     'dco-test-dco@test.local',       '{"role":"driver"}'::jsonb),
    (v_fo_only_usr, 'dco-test-fo-only@test.local',   '{"role":"driver"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, role) VALUES
    (v_driver_usr,  'dco-test-driver@test.local',  'driver'),
    (v_dco_usr,     'dco-test-dco@test.local',     'driver'),
    (v_fo_only_usr, 'dco-test-fo-only@test.local', 'driver')
  ON CONFLICT (id) DO UPDATE SET role = 'driver';

  INSERT INTO public.organizations (id, name) VALUES
    (v_biz, 'DCO Test Business'),
    (v_other_biz, 'DCO Test Previous Employer')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organization_members (organization_id, user_id, status, role)
  VALUES (v_biz, v_biz_owner, 'active', 'owner')
  ON CONFLICT DO NOTHING;

  -- ── A. Normal Driver can join Business ─────────────────────────────────
  INSERT INTO public.driver_invites (from_organization_id, to_user_id, status)
  VALUES (v_biz, v_driver_usr, 'pending')
  RETURNING id INTO v_invite_id;
  PERFORM set_config('request.jwt.claim.sub', v_driver_usr::text, true);
  PERFORM public.accept_driver_invite(v_invite_id);
  SELECT id INTO v_driver_row
  FROM public.drivers
  WHERE user_id = v_driver_usr AND organization_id = v_biz AND left_at IS NULL;
  IF v_driver_row IS NULL
     OR (SELECT relationship_status FROM public.drivers WHERE id = v_driver_row) <> 'active_employee' THEN
    RAISE EXCEPTION 'FAIL A: normal driver did not become active_employee';
  END IF;
  RAISE NOTICE 'PASS: A — normal Driver can join Business';

  -- ── B. Normal Driver can leave Business ────────────────────────────────
  PERFORM public.leave_fleet(v_biz);
  IF EXISTS (
    SELECT 1 FROM public.drivers
    WHERE id = v_driver_row AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL B: leave_fleet left the row active';
  END IF;
  IF (SELECT relationship_status FROM public.drivers WHERE id = v_driver_row) <> 'disconnected' THEN
    RAISE EXCEPTION 'FAIL B: leave_fleet did not mark disconnected';
  END IF;
  -- Re-join so later FLEET assignment tests have an employee driver.
  INSERT INTO public.drivers (organization_id, name, phone, user_id, relationship_origin, relationship_status)
  VALUES (v_biz, 'Normal Driver', '9000000021', v_driver_usr, 'invite_accepted', 'active_employee')
  RETURNING id INTO v_driver_row;
  RAISE NOTICE 'PASS: B — normal Driver can leave Business';

  -- DCO-to-be: previously employed, already left (history).
  INSERT INTO public.drivers (organization_id, name, phone, user_id, relationship_origin, relationship_status, left_at)
  VALUES (v_other_biz, 'DCO Person', '9000000031', v_dco_usr, 'invite_accepted', 'disconnected', now() - interval '30 days')
  RETURNING id INTO v_dco_hist_row;

  INSERT INTO public.dco_profiles (user_id, status, requested_at, reviewed_at)
  VALUES (v_dco_usr, 'APPROVED', now(), now());
  INSERT INTO public.dco_payees (user_id) VALUES (v_dco_usr) RETURNING id INTO v_payee_id;

  -- Legacy FO-only person: FO row, not DCO.
  INSERT INTO public.driver_fleet_owner_profiles (user_id) VALUES (v_fo_only_usr);

  v_indent_id := gen_random_uuid();
  INSERT INTO public.indents (id, organization_id, indent_number, pickup_area, drop_location, client_name, client_price, status, circulation_target)
  VALUES (v_indent_id, v_biz, 'DCO-TEST-1', 'Chennai', 'Bengaluru', 'Test Client', 20000, 'open', 'marketplace');

  -- ── C. Approved DCO cannot join Business ───────────────────────────────
  v_raised := false;
  BEGIN
    INSERT INTO public.drivers (organization_id, name, phone, user_id, relationship_origin, relationship_status)
    VALUES (v_biz, 'DCO Person', '9000000032', v_dco_usr, 'invite_accepted', 'active_employee');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL C: DCO joined as employee driver'; END IF;
  RAISE NOTICE 'PASS: C — approved DCO cannot join Business';

  -- ── D. Approved DCO cannot accept employee invitation ──────────────────
  INSERT INTO public.driver_invites (from_organization_id, to_user_id, status)
  VALUES (v_other_biz, v_dco_usr, 'pending')
  RETURNING id INTO v_dco_invite;
  PERFORM set_config('request.jwt.claim.sub', v_dco_usr::text, true);
  v_raised := false;
  BEGIN
    PERFORM public.accept_driver_invite(v_dco_invite);
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL D: DCO accepted employee invite'; END IF;
  IF (SELECT status FROM public.driver_invites WHERE id = v_dco_invite) <> 'pending' THEN
    RAISE EXCEPTION 'FAIL D: invite was consumed';
  END IF;
  RAISE NOTICE 'PASS: D — approved DCO cannot accept employee invitation';

  -- ── E. Approved DCO cannot become active_employee ──────────────────────
  v_raised := false;
  BEGIN
    UPDATE public.drivers SET left_at = NULL, relationship_status = 'active_employee' WHERE id = v_dco_hist_row;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL E: historical row promoted to active_employee'; END IF;
  RAISE NOTICE 'PASS: E — approved DCO cannot become active_employee';

  -- ── F. Approved DCO cannot become a driver org member ──────────────────
  v_raised := false;
  BEGIN
    INSERT INTO public.organization_members (organization_id, user_id, status, role)
    VALUES (v_biz, v_dco_usr, 'active', 'driver');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL F: DCO given driver org membership'; END IF;
  RAISE NOTICE 'PASS: F — approved DCO cannot become a driver org member';

  -- ── G. Approved DCO cannot receive a Business App employee assignment ──
  v_dco_stub_row := public._resolve_or_create_market_driver(v_biz, v_dco_usr);
  v_raised := false;
  BEGIN
    INSERT INTO public.trips (organization_id, trip_number, pickup_area, drop_location, client_name, client_price, driver_id, status)
    VALUES (v_biz, '', 'Chennai', 'Salem', 'Test Client', 4000, v_dco_stub_row, 'assigned');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL G: FLEET trip created for DCO'; END IF;
  RAISE NOTICE 'PASS: G — approved DCO cannot receive employee-driver assignment';

  -- ── G2. Offline market hire of a DCO is allowed (20271110101500) ───────
  INSERT INTO public.trips (organization_id, trip_number, pickup_area, drop_location, client_name, client_price, driver_id, status, trip_payout_mode)
  VALUES (v_biz, '', 'Chennai', 'Salem', 'Test Client', 4000, v_dco_stub_row, 'assigned', 'market')
  RETURNING id INTO v_trip_id;
  IF v_trip_id IS NULL THEN RAISE EXCEPTION 'FAIL G2: market-hire trip not created for DCO'; END IF;
  RAISE NOTICE 'PASS: G2 — offline market-hire trip can track an approved DCO';

  -- ── G3. An asset (employee) trip to the same DCO stays blocked ─────────
  v_raised := false;
  BEGIN
    INSERT INTO public.trips (organization_id, trip_number, pickup_area, drop_location, client_name, client_price, driver_id, status, trip_payout_mode)
    VALUES (v_biz, '', 'Chennai', 'Salem', 'Test Client', 4000, v_dco_stub_row, 'assigned', 'asset');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL G3: asset trip created for DCO'; END IF;
  RAISE NOTICE 'PASS: G3 — asset trip to an approved DCO is still refused';

  -- ── H. Previous employer remains visible as history ────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.drivers
    WHERE id = v_dco_hist_row AND user_id = v_dco_usr AND left_at IS NOT NULL
      AND relationship_status = 'disconnected'
  ) THEN
    RAISE EXCEPTION 'FAIL H: historical employer row lost';
  END IF;
  RAISE NOTICE 'PASS: H — previous employer remains visible as history';

  -- ── I. Previous employer does not become current employer ──────────────
  IF public._is_active_employee_driver(v_dco_usr) THEN
    RAISE EXCEPTION 'FAIL I: DCO reads as currently employed';
  END IF;
  RAISE NOTICE 'PASS: I — previous employer is not current employer';

  -- ── J. DCO remains independent after viewing previous fleet history ────
  PERFORM set_config('request.jwt.claim.sub', v_dco_usr::text, true);
  v_mode := public.get_my_driver_operating_mode();
  IF v_mode->>'mode' <> 'DCO_VEHICLE_REQUIRED'
     OR (v_mode->>'is_employee_driver')::boolean THEN
    RAISE EXCEPTION 'FAIL J: viewing history changed operating mode = %', v_mode;
  END IF;
  RAISE NOTICE 'PASS: J — DCO remains independent after history is visible';

  -- ── L. DCO without vehicle cannot access Marketplace ───────────────────
  IF public.is_dco_marketplace_eligible(v_dco_usr)
     OR (v_mode->>'marketplace_allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL L: vehicle-less DCO is Marketplace-eligible';
  END IF;
  v_raised := false;
  BEGIN
    PERFORM * FROM public.list_open_marketplace_loads_for_fleet_owner(10);
  EXCEPTION WHEN OTHERS THEN v_raised := true;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL L: vehicle-less DCO listed Marketplace loads'; END IF;
  RAISE NOTICE 'PASS: L — DCO without vehicle cannot access Marketplace';

  -- ── K. DCO + active vehicle can access Marketplace ─────────────────────
  INSERT INTO public.owner_vehicles (owner_user_id, vehicle_number, vehicle_type, status)
  VALUES (v_dco_usr, 'TN01DC0001', 'Truck', 'active')
  RETURNING id INTO v_vehicle_id;
  v_mode := public.get_my_driver_operating_mode();
  IF v_mode->>'mode' <> 'DCO' OR NOT (v_mode->>'marketplace_allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL K: DCO with vehicle mode = %', v_mode;
  END IF;
  SELECT count(*) INTO v_count FROM public.list_open_marketplace_loads_for_fleet_owner(100) l WHERE l.id = v_indent_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL K: DCO did not see the open Marketplace indent'; END IF;
  PERFORM public.submit_market_bid(v_indent_id, 18000, 'dco test bid', NULL, v_vehicle_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.market_bids b
    WHERE b.indent_id = v_indent_id AND b.bidder_user_id = v_dco_usr AND b.bidder_type = 'dco'
  ) THEN
    RAISE EXCEPTION 'FAIL K: DCO bid row missing';
  END IF;
  RAISE NOTICE 'PASS: K — DCO + active vehicle can access Marketplace (list + bid)';

  -- ── M. Legacy Fleet Owner row alone does not grant DCO/Marketplace ─────
  PERFORM set_config('request.jwt.claim.sub', v_fo_only_usr::text, true);
  v_mode := public.get_my_driver_operating_mode();
  IF v_mode->>'mode' <> 'DRIVER'
     OR public.is_dco_marketplace_eligible(v_fo_only_usr)
     OR (v_mode->>'marketplace_allowed')::boolean
     OR public.is_dco_eligible(v_fo_only_usr) THEN
    RAISE EXCEPTION 'FAIL M: FO-only user got DCO/Marketplace: %', v_mode;
  END IF;
  v_raised := false;
  BEGIN
    PERFORM * FROM public.list_open_marketplace_loads_for_fleet_owner(10);
  EXCEPTION WHEN OTHERS THEN v_raised := true;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'FAIL M: FO-only user listed Marketplace loads'; END IF;
  RAISE NOTICE 'PASS: M — legacy Fleet Owner row alone does not grant DCO/Marketplace';
END;
$$;

ROLLBACK;
