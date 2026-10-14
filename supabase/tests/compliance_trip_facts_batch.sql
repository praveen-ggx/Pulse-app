-- Compliance batch RPC regression suite —
-- public.get_compliance_list_trip_facts / public.get_compliance_vehicle_vault_for_trips
-- and their security boundary private.compliance_visible_trips
-- (migration 20261005122431_compliance_batch_trip_facts_and_vault).
--
-- The helper mirrors get_trips_for_org visibility (own org, supplier-linked
-- indent trips, ground-ops warehouse scope) and excludes deleted trips. These
-- checks pin that down as the real `authenticated` role with a JWT `sub`, plus
-- grants (anon denied, helper not callable), the 1000-id guard and the
-- supplier-label rules ported from get_supplier_details.
--
-- Fully self-contained: fixtures under the fixed fake prefix cccc0000-…,
-- RAISE EXCEPTION on failure, ROLLBACK at the end (never commits).
--
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/compliance_trip_facts_batch.sql
-- Pass: every check prints "PASS: ...", script ends with ROLLBACK and no error.

BEGIN;

-- ── Fixtures (as postgres) ───────────────────────────────────────────────
-- users   01 owner · 02 driver · 03 dispatcher · 04 outsider · 05 other-org
--         06 supplier-linked · 07 client-linked · 08 ground-ops
-- orgs    11 A (subject) · 12 S (supplier-linked) · 13 C (client-linked)
--         14 Z (unrelated) · 15 L (linked org "LinkedCo") · 16 L2 (blank name)
-- indents 51 W1 · 52 W2 · 53 W1 (one trip per indent)
-- trips   61 own/W1 · 62 partner/W2 · 63 no vehicle · 64 deleted · 65 empty docs
--         66 "Connected" · 67 supplier-linked/W1 · 68 supplier-linked no indent
--         69 client-linked · 70 org Z
DO $$
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    ('cccc0000-0000-0000-0000-000000000001', 'cbf-owner@test.local'),
    ('cccc0000-0000-0000-0000-000000000002', 'cbf-driver@test.local'),
    ('cccc0000-0000-0000-0000-000000000003', 'cbf-dispatcher@test.local'),
    ('cccc0000-0000-0000-0000-000000000004', 'cbf-outsider@test.local'),
    ('cccc0000-0000-0000-0000-000000000005', 'cbf-other@test.local'),
    ('cccc0000-0000-0000-0000-000000000006', 'cbf-suplink@test.local'),
    ('cccc0000-0000-0000-0000-000000000007', 'cbf-clientlink@test.local'),
    ('cccc0000-0000-0000-0000-000000000008', 'cbf-groundops@test.local');

  INSERT INTO public.organizations (id, name, owner_id) VALUES
    ('cccc0000-0000-0000-0000-000000000011', 'CBF Org A', 'cccc0000-0000-0000-0000-000000000001'),
    ('cccc0000-0000-0000-0000-000000000012', 'CBF Org S', NULL),
    ('cccc0000-0000-0000-0000-000000000013', 'CBF Org C', NULL),
    ('cccc0000-0000-0000-0000-000000000014', 'CBF Org Z', NULL),
    ('cccc0000-0000-0000-0000-000000000015', 'LinkedCo', NULL),
    ('cccc0000-0000-0000-0000-000000000016', '  ', NULL);

  INSERT INTO public.organization_members (organization_id, user_id, role, status, permissions) VALUES
    ('cccc0000-0000-0000-0000-000000000011', 'cccc0000-0000-0000-0000-000000000001', 'owner', 'active', '{}'),
    ('cccc0000-0000-0000-0000-000000000011', 'cccc0000-0000-0000-0000-000000000002', 'driver', 'active', '{}'),
    ('cccc0000-0000-0000-0000-000000000011', 'cccc0000-0000-0000-0000-000000000003', 'dispatcher', 'active', '{"platformRole":"tripops"}'),
    ('cccc0000-0000-0000-0000-000000000011', 'cccc0000-0000-0000-0000-000000000008', 'member', 'active', '{"platformRole":"ground_ops"}'),
    ('cccc0000-0000-0000-0000-000000000014', 'cccc0000-0000-0000-0000-000000000005', 'owner', 'active', '{}'),
    ('cccc0000-0000-0000-0000-000000000012', 'cccc0000-0000-0000-0000-000000000006', 'owner', 'active', '{}'),
    ('cccc0000-0000-0000-0000-000000000013', 'cccc0000-0000-0000-0000-000000000007', 'owner', 'active', '{}');

  INSERT INTO public.clients (id, organization_id, name, phone, linked_organization_id) VALUES
    ('cccc0000-0000-0000-0000-000000000021', 'cccc0000-0000-0000-0000-000000000011', 'CBF Client', '0000000000',
     'cccc0000-0000-0000-0000-000000000013');

  INSERT INTO public.client_warehouses (id, organization_id, client_id, name) VALUES
    ('cccc0000-0000-0000-0000-000000000022', 'cccc0000-0000-0000-0000-000000000011', 'cccc0000-0000-0000-0000-000000000021', 'CBF W1'),
    ('cccc0000-0000-0000-0000-000000000023', 'cccc0000-0000-0000-0000-000000000011', 'cccc0000-0000-0000-0000-000000000021', 'CBF W2');

  INSERT INTO public.organization_member_warehouses (organization_member_id, warehouse_id)
  SELECT om.id, 'cccc0000-0000-0000-0000-000000000022'
  FROM public.organization_members om
  WHERE om.organization_id = 'cccc0000-0000-0000-0000-000000000011'
    AND om.user_id = 'cccc0000-0000-0000-0000-000000000008';

  INSERT INTO public.suppliers (id, organization_id, name, company_name, contact_person, supplier_type, linked_organization_id) VALUES
    ('cccc0000-0000-0000-0000-000000000031', 'cccc0000-0000-0000-0000-000000000011', 'Acme', NULL, NULL, NULL, NULL),
    ('cccc0000-0000-0000-0000-000000000032', 'cccc0000-0000-0000-0000-000000000011', '  ', NULL, NULL, NULL, NULL),
    ('cccc0000-0000-0000-0000-000000000033', 'cccc0000-0000-0000-0000-000000000011', NULL, NULL, 'Ravi', NULL, NULL),
    ('cccc0000-0000-0000-0000-000000000034', 'cccc0000-0000-0000-0000-000000000011', '', NULL, NULL, 'integrated', 'cccc0000-0000-0000-0000-000000000015'),
    ('cccc0000-0000-0000-0000-000000000035', 'cccc0000-0000-0000-0000-000000000011', NULL, NULL, NULL, 'integrated', 'cccc0000-0000-0000-0000-000000000016'),
    ('cccc0000-0000-0000-0000-000000000036', 'cccc0000-0000-0000-0000-000000000011', 'S Co', NULL, NULL, 'integrated', 'cccc0000-0000-0000-0000-000000000012');

  INSERT INTO public.vehicles (id, organization_id, vehicle_number, vehicle_type, documents) VALUES
    ('cccc0000-0000-0000-0000-000000000041', 'cccc0000-0000-0000-0000-000000000011', 'CBF01', ' 20 ft ', NULL),
    ('cccc0000-0000-0000-0000-000000000042', 'cccc0000-0000-0000-0000-000000000014', 'CBF02', '32 ft', '{"rc":{"url":"x"}}'),
    ('cccc0000-0000-0000-0000-000000000043', 'cccc0000-0000-0000-0000-000000000014', 'CBF03', NULL, '{}');

  INSERT INTO public.indents (id, organization_id, indent_number, pickup_area, drop_location, client_name, warehouse_id) VALUES
    ('cccc0000-0000-0000-0000-000000000051', 'cccc0000-0000-0000-0000-000000000011', 'CBF-IND-1', 'P', 'D', 'CBF Client', 'cccc0000-0000-0000-0000-000000000022'),
    ('cccc0000-0000-0000-0000-000000000052', 'cccc0000-0000-0000-0000-000000000011', 'CBF-IND-2', 'P', 'D', 'CBF Client', 'cccc0000-0000-0000-0000-000000000023'),
    ('cccc0000-0000-0000-0000-000000000053', 'cccc0000-0000-0000-0000-000000000011', 'CBF-IND-3', 'P', 'D', 'CBF Client', 'cccc0000-0000-0000-0000-000000000022');

  INSERT INTO public.trips (id, organization_id, trip_number, pickup_area, drop_location, client_name,
                            vehicle_id, supplier_id, client_id, indent_id, deleted_at, booking_ref) VALUES
    ('cccc0000-0000-0000-0000-000000000061', 'cccc0000-0000-0000-0000-000000000011', 'CBF-T61', 'P', 'D', 'CBF Client',
     'cccc0000-0000-0000-0000-000000000041', 'cccc0000-0000-0000-0000-000000000031', NULL, 'cccc0000-0000-0000-0000-000000000051', NULL, 'CBF-BR-61'),
    ('cccc0000-0000-0000-0000-000000000062', 'cccc0000-0000-0000-0000-000000000011', 'CBF-T62', 'P', 'D', 'CBF Client',
     'cccc0000-0000-0000-0000-000000000042', 'cccc0000-0000-0000-0000-000000000034', NULL, 'cccc0000-0000-0000-0000-000000000052', NULL, 'CBF-BR-62'),
    ('cccc0000-0000-0000-0000-000000000063', 'cccc0000-0000-0000-0000-000000000011', 'CBF-T63', 'P', 'D', 'CBF Client',
     NULL, 'cccc0000-0000-0000-0000-000000000032', NULL, NULL, NULL, 'CBF-BR-63'),
    ('cccc0000-0000-0000-0000-000000000064', 'cccc0000-0000-0000-0000-000000000011', 'CBF-T64', 'P', 'D', 'CBF Client',
     'cccc0000-0000-0000-0000-000000000042', 'cccc0000-0000-0000-0000-000000000031', NULL, NULL, now(), 'CBF-BR-64'),
    ('cccc0000-0000-0000-0000-000000000065', 'cccc0000-0000-0000-0000-000000000011', 'CBF-T65', 'P', 'D', 'CBF Client',
     'cccc0000-0000-0000-0000-000000000043', 'cccc0000-0000-0000-0000-000000000033', NULL, NULL, NULL, 'CBF-BR-65'),
    ('cccc0000-0000-0000-0000-000000000066', 'cccc0000-0000-0000-0000-000000000011', 'CBF-T66', 'P', 'D', 'CBF Client',
     NULL, 'cccc0000-0000-0000-0000-000000000035', NULL, NULL, NULL, 'CBF-BR-66'),
    ('cccc0000-0000-0000-0000-000000000067', 'cccc0000-0000-0000-0000-000000000011', 'CBF-T67', 'P', 'D', 'CBF Client',
     'cccc0000-0000-0000-0000-000000000042', 'cccc0000-0000-0000-0000-000000000036', NULL, 'cccc0000-0000-0000-0000-000000000053', NULL, 'CBF-BR-67'),
    ('cccc0000-0000-0000-0000-000000000068', 'cccc0000-0000-0000-0000-000000000011', 'CBF-T68', 'P', 'D', 'CBF Client',
     'cccc0000-0000-0000-0000-000000000042', 'cccc0000-0000-0000-0000-000000000036', NULL, NULL, NULL, 'CBF-BR-68'),
    ('cccc0000-0000-0000-0000-000000000069', 'cccc0000-0000-0000-0000-000000000011', 'CBF-T69', 'P', 'D', 'CBF Client',
     'cccc0000-0000-0000-0000-000000000042', NULL, 'cccc0000-0000-0000-0000-000000000021', NULL, NULL, 'CBF-BR-69'),
    ('cccc0000-0000-0000-0000-000000000070', 'cccc0000-0000-0000-0000-000000000014', 'CBF-T70', 'P', 'D', 'CBF Client',
     'cccc0000-0000-0000-0000-000000000042', NULL, NULL, NULL, NULL, 'CBF-BR-70');

  RAISE NOTICE 'fixtures ready';
END $$;

-- Every fixture trip id (61–70), reused below.
CREATE TEMP TABLE cbf_ids ON COMMIT DROP AS
SELECT array_agg(('cccc0000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid ORDER BY n) AS ids
FROM generate_series(61, 70) n;
GRANT SELECT ON cbf_ids TO authenticated, anon;

-- ── 19/20 + object checks (as postgres) ──────────────────────────────────
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.get_compliance_list_trip_facts(uuid,uuid[])',
                           'public.get_compliance_vehicle_vault_for_trips(uuid,uuid[])'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') THEN RAISE EXCEPTION 'FAIL: anon can execute %', f; END IF;
    IF NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN RAISE EXCEPTION 'FAIL: authenticated cannot execute %', f; END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, unnest(coalesce(p.proacl, '{}')) a
               WHERE p.oid = f::regprocedure AND a::text LIKE '=%') THEN
      RAISE EXCEPTION 'FAIL: PUBLIC has a grant on %', f;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f::regprocedure AND p.prosecdef
                   AND pg_get_userbyid(p.proowner) = 'postgres'
                   AND p.proconfig @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'FAIL: % must be SECURITY DEFINER, owned by postgres, search_path=''''', f;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = 'private.compliance_visible_trips(uuid,uuid[])'::regprocedure
                 AND NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'FAIL: helper must be SECURITY INVOKER with search_path=''''';
  END IF;
  IF has_schema_privilege('authenticated', 'private', 'USAGE') OR has_schema_privilege('anon', 'private', 'USAGE') THEN
    RAISE EXCEPTION 'FAIL: private schema is usable by anon/authenticated';
  END IF;
  RAISE NOTICE 'PASS: grants, owner, SECURITY DEFINER/INVOKER and search_path';
END $$;

-- ── 1. Owner of org A ────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"cccc0000-0000-0000-0000-000000000001","role":"authenticated"}', true);
DO $$
DECLARE
  a uuid := 'cccc0000-0000-0000-0000-000000000011';
  ids uuid[] := (SELECT ids FROM cbf_ids);
  n int;
  r record;
BEGIN
  -- 61,62,63,65,66,67,68,69 (org A, not deleted); 64 deleted; 70 is org Z.
  SELECT count(*) INTO n FROM public.get_compliance_list_trip_facts(a, ids);
  IF n <> 8 THEN RAISE EXCEPTION 'FAIL: owner should see 8 facts rows, got %', n; END IF;

  SELECT * INTO r FROM public.get_compliance_list_trip_facts(a, ids) WHERE trip_id = 'cccc0000-0000-0000-0000-000000000061';
  IF r.truck_type IS DISTINCT FROM '20 ft' OR r.supplier_name IS DISTINCT FROM 'Acme'
     OR r.vehicle_id IS DISTINCT FROM 'cccc0000-0000-0000-0000-000000000041' THEN
    RAISE EXCEPTION 'FAIL: own trip facts wrong: % / %', r.truck_type, r.supplier_name;
  END IF;
  -- Partner vehicle (owned by org Z) resolves without vehicles RLS.
  SELECT * INTO r FROM public.get_compliance_list_trip_facts(a, ids) WHERE trip_id = 'cccc0000-0000-0000-0000-000000000062';
  IF r.truck_type IS DISTINCT FROM '32 ft' THEN RAISE EXCEPTION 'FAIL: partner truck type %', r.truck_type; END IF;
  -- 12. integrated: blank name → linked org name.
  IF r.supplier_name IS DISTINCT FROM 'LinkedCo' THEN RAISE EXCEPTION 'FAIL: integrated label %', r.supplier_name; END IF;
  -- 11/14. NULL vehicle → NULL truck type; non-integrated blank name stays '' (client renders "—").
  SELECT * INTO r FROM public.get_compliance_list_trip_facts(a, ids) WHERE trip_id = 'cccc0000-0000-0000-0000-000000000063';
  IF r.vehicle_id IS NOT NULL OR r.truck_type IS NOT NULL OR r.supplier_name IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'FAIL: null-vehicle / blank supplier row: % % %', r.vehicle_id, r.truck_type, r.supplier_name;
  END IF;
  -- 13. non-integrated name NULL, company NULL → contact_person.
  SELECT * INTO r FROM public.get_compliance_list_trip_facts(a, ids) WHERE trip_id = 'cccc0000-0000-0000-0000-000000000065';
  IF r.supplier_name IS DISTINCT FROM 'Ravi' OR r.truck_type IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: contact-person label / null type: % %', r.supplier_name, r.truck_type;
  END IF;
  -- 12. integrated, every name blank → 'Connected'.
  SELECT * INTO r FROM public.get_compliance_list_trip_facts(a, ids) WHERE trip_id = 'cccc0000-0000-0000-0000-000000000066';
  IF r.supplier_name IS DISTINCT FROM 'Connected' THEN RAISE EXCEPTION 'FAIL: Connected label %', r.supplier_name; END IF;
  -- 10. deleted trip excluded; other tenant excluded.
  IF EXISTS (SELECT 1 FROM public.get_compliance_list_trip_facts(a, ids)
             WHERE trip_id IN ('cccc0000-0000-0000-0000-000000000064', 'cccc0000-0000-0000-0000-000000000070')) THEN
    RAISE EXCEPTION 'FAIL: deleted or org-Z trip returned';
  END IF;

  -- Vault: one row per visible trip with a vehicle (61,62,65,67,68,69); 63 has no vehicle.
  SELECT count(*) INTO n FROM public.get_compliance_vehicle_vault_for_trips(a, ids);
  IF n <> 6 THEN RAISE EXCEPTION 'FAIL: owner should see 6 vault rows, got %', n; END IF;
  -- Empty documents are a resolved row, not "not found".
  SELECT * INTO r FROM public.get_compliance_vehicle_vault_for_trips(a, ids) WHERE trip_id = 'cccc0000-0000-0000-0000-000000000065';
  IF r.vehicle_id IS DISTINCT FROM 'cccc0000-0000-0000-0000-000000000043' OR r.documents IS DISTINCT FROM '{}'::jsonb
     OR r.vehicle_number IS DISTINCT FROM 'CBF03' THEN
    RAISE EXCEPTION 'FAIL: empty-docs vault row: % % %', r.vehicle_id, r.vehicle_number, r.documents;
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_compliance_vehicle_vault_for_trips(a, ids)
             WHERE trip_id IN ('cccc0000-0000-0000-0000-000000000063', 'cccc0000-0000-0000-0000-000000000064')) THEN
    RAISE EXCEPTION 'FAIL: vault returned a no-vehicle or deleted trip';
  END IF;

  -- 16/17. NULL and empty input → zero rows.
  IF EXISTS (SELECT 1 FROM public.get_compliance_list_trip_facts(a, NULL))
     OR EXISTS (SELECT 1 FROM public.get_compliance_list_trip_facts(a, ARRAY[]::uuid[]))
     OR EXISTS (SELECT 1 FROM public.get_compliance_vehicle_vault_for_trips(a, NULL))
     OR EXISTS (SELECT 1 FROM public.get_compliance_vehicle_vault_for_trips(a, ARRAY[]::uuid[])) THEN
    RAISE EXCEPTION 'FAIL: NULL/empty input returned rows';
  END IF;

  -- 15. more than 1000 ids → 22023 (both RPCs).
  BEGIN
    PERFORM 1 FROM public.get_compliance_list_trip_facts(a, ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 1001)));
    RAISE EXCEPTION 'FAIL: facts accepted 1001 ids';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.get_compliance_vehicle_vault_for_trips(a, ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 1001)));
    RAISE EXCEPTION 'FAIL: vault accepted 1001 ids';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  -- Exactly 1000 is allowed.
  PERFORM 1 FROM public.get_compliance_list_trip_facts(a, ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 1000)));

  -- 20. helper is not callable directly.
  BEGIN
    PERFORM 1 FROM private.compliance_visible_trips(a, ids);
    RAISE EXCEPTION 'FAIL: authenticated called private.compliance_visible_trips';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS: owner — 8 facts / 6 vault rows, labels, empty docs, deleted excluded, guards, helper denied';
END $$;

-- ── 2. Driver-role member (parity with get_trips_for_org: is_org_member) ──
SELECT set_config('request.jwt.claims', '{"sub":"cccc0000-0000-0000-0000-000000000002","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.get_compliance_list_trip_facts('cccc0000-0000-0000-0000-000000000011', (SELECT ids FROM cbf_ids));
  IF n <> 8 THEN RAISE EXCEPTION 'FAIL: driver member should see 8 rows, got %', n; END IF;
  RAISE NOTICE 'PASS: driver member';
END $$;

-- ── 3. Dispatcher ────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"cccc0000-0000-0000-0000-000000000003","role":"authenticated"}', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.get_compliance_list_trip_facts('cccc0000-0000-0000-0000-000000000011', (SELECT ids FROM cbf_ids));
  IF n <> 8 THEN RAISE EXCEPTION 'FAIL: dispatcher should see 8 rows, got %', n; END IF;
  RAISE NOTICE 'PASS: dispatcher';
END $$;

-- ── 4. Non-member claiming org A as viewer ───────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"cccc0000-0000-0000-0000-000000000004","role":"authenticated"}', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_compliance_list_trip_facts('cccc0000-0000-0000-0000-000000000011', (SELECT ids FROM cbf_ids)))
     OR EXISTS (SELECT 1 FROM public.get_compliance_vehicle_vault_for_trips('cccc0000-0000-0000-0000-000000000011', (SELECT ids FROM cbf_ids))) THEN
    RAISE EXCEPTION 'FAIL: non-member received rows';
  END IF;
  RAISE NOTICE 'PASS: non-member';
END $$;

-- ── 5. Unrelated org member sending org A trip ids ───────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"cccc0000-0000-0000-0000-000000000005","role":"authenticated"}', true);
DO $$
DECLARE ids uuid[] := (SELECT array_remove(ids, 'cccc0000-0000-0000-0000-000000000070') FROM cbf_ids);
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_compliance_list_trip_facts('cccc0000-0000-0000-0000-000000000014', ids))
     OR EXISTS (SELECT 1 FROM public.get_compliance_list_trip_facts('cccc0000-0000-0000-0000-000000000011', ids))
     OR EXISTS (SELECT 1 FROM public.get_compliance_vehicle_vault_for_trips('cccc0000-0000-0000-0000-000000000014', ids)) THEN
    RAISE EXCEPTION 'FAIL: unrelated org received org A rows';
  END IF;
  RAISE NOTICE 'PASS: unrelated org';
END $$;

-- ── 6. Supplier-linked viewer (org S) ────────────────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"cccc0000-0000-0000-0000-000000000006","role":"authenticated"}', true);
DO $$
DECLARE
  s uuid := 'cccc0000-0000-0000-0000-000000000012';
  r record;
  n int;
BEGIN
  -- Only trip 67 (supplier linked to S AND has an indent); 68 has no indent.
  SELECT count(*) INTO n FROM public.get_compliance_list_trip_facts(s, (SELECT ids FROM cbf_ids));
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: supplier-linked viewer should see 1 row, got %', n; END IF;
  SELECT * INTO r FROM public.get_compliance_list_trip_facts(s, (SELECT ids FROM cbf_ids));
  IF r.trip_id IS DISTINCT FROM 'cccc0000-0000-0000-0000-000000000067' OR r.truck_type IS DISTINCT FROM '32 ft' THEN
    RAISE EXCEPTION 'FAIL: supplier-linked row % %', r.trip_id, r.truck_type;
  END IF;
  -- Not a member of the supplier's org (A) → no label, same as get_supplier_details.
  IF r.supplier_name IS NOT NULL THEN RAISE EXCEPTION 'FAIL: supplier-linked viewer got supplier label %', r.supplier_name; END IF;
  SELECT count(*) INTO n FROM public.get_compliance_vehicle_vault_for_trips(s, (SELECT ids FROM cbf_ids));
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: supplier-linked vault rows %', n; END IF;
  RAISE NOTICE 'PASS: supplier-linked viewer';
END $$;

-- ── 7. Client-linked viewer (org C) — not in get_trips_for_org, so nothing ──
SELECT set_config('request.jwt.claims', '{"sub":"cccc0000-0000-0000-0000-000000000007","role":"authenticated"}', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_compliance_list_trip_facts('cccc0000-0000-0000-0000-000000000013', (SELECT ids FROM cbf_ids)))
     OR EXISTS (SELECT 1 FROM public.get_compliance_vehicle_vault_for_trips('cccc0000-0000-0000-0000-000000000013', (SELECT ids FROM cbf_ids))) THEN
    RAISE EXCEPTION 'FAIL: client-linked viewer received rows';
  END IF;
  RAISE NOTICE 'PASS: client-linked viewer';
END $$;

-- ── 8/9. Ground-ops member scoped to warehouse W1 ────────────────────────
SELECT set_config('request.jwt.claims', '{"sub":"cccc0000-0000-0000-0000-000000000008","role":"authenticated"}', true);
DO $$
DECLARE
  a uuid := 'cccc0000-0000-0000-0000-000000000011';
  got uuid[];
BEGIN
  SELECT array_agg(trip_id ORDER BY trip_id) INTO got FROM public.get_compliance_list_trip_facts(a, (SELECT ids FROM cbf_ids));
  -- W1 indent trips only: 61 and 67. 62 (W2) and indent-less trips are out of scope.
  IF got IS DISTINCT FROM ARRAY['cccc0000-0000-0000-0000-000000000061', 'cccc0000-0000-0000-0000-000000000067']::uuid[] THEN
    RAISE EXCEPTION 'FAIL: ground-ops scope returned %', got;
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_compliance_vehicle_vault_for_trips(a, ARRAY['cccc0000-0000-0000-0000-000000000062']::uuid[])) THEN
    RAISE EXCEPTION 'FAIL: ground-ops got vault data for an out-of-warehouse trip';
  END IF;
  RAISE NOTICE 'PASS: ground-ops warehouse scope';
END $$;

-- ── 18. anon is denied ───────────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.get_compliance_list_trip_facts('cccc0000-0000-0000-0000-000000000011', (SELECT ids FROM cbf_ids));
    RAISE EXCEPTION 'FAIL: anon executed get_compliance_list_trip_facts';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.get_compliance_vehicle_vault_for_trips('cccc0000-0000-0000-0000-000000000011', (SELECT ids FROM cbf_ids));
    RAISE EXCEPTION 'FAIL: anon executed get_compliance_vehicle_vault_for_trips';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'PASS: anon denied';
END $$;
RESET ROLE;

ROLLBACK;
