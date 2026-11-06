DO $$
DECLARE
  v_region text;
  v_name text;
  v_trip uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_member uuid := '11111111-1111-4111-8111-111111111111';
  v_stranger uuid := '22222222-2222-4222-8222-222222222222';
  v_ok boolean;
BEGIN
  SELECT column_name INTO v_region
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'primary_region';
  SELECT column_name INTO v_name
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'entity_bank_accounts' AND column_name = 'beneficiary_name';
  IF v_region IS NULL OR v_name IS NULL THEN
    RAISE EXCEPTION 'columns still missing after migration';
  END IF;

  INSERT INTO public.organizations (id, name) VALUES
    ('33333333-3333-4333-8333-333333333333', 'trip-org');
  INSERT INTO public.organization_members (id, organization_id, user_id, status)
  VALUES ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', v_member, 'active');
  INSERT INTO public.trips (id, organization_id) VALUES (v_trip, '33333333-3333-4333-8333-333333333333');
  INSERT INTO public.suppliers (organization_id, name, primary_region)
  VALUES ('33333333-3333-4333-8333-333333333333', 'Acme', 'South');
  INSERT INTO public.entity_bank_accounts (
    organization_id, entity_type, entity_id, beneficiary_name, branch_name
  ) VALUES (
    '33333333-3333-4333-8333-333333333333', 'supplier', v_trip, 'Payee', 'MG Road'
  );

  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  IF NOT public.fn_trip_documents_storage_allowed(v_trip::text || '/pod/a.jpg', 'select', v_member) THEN
    RAISE EXCEPTION 'trip org member should read trip-documents';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
  IF public.fn_trip_documents_storage_allowed(v_trip::text || '/pod/a.jpg', 'select', v_stranger) THEN
    RAISE EXCEPTION 'stranger must stay denied';
  END IF;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES ('trip-documents', v_trip::text || '/pod/a.jpg', v_stranger::text);
    RESET ROLE;
    RAISE EXCEPTION 'stranger insert should fail 42501';
  EXCEPTION
    WHEN SQLSTATE '42501' THEN
      RESET ROLE;
      INSERT INTO harness_events VALUES ('storage_rls_after', '42501', 'stranger denied');
    WHEN insufficient_privilege THEN
      RESET ROLE;
      INSERT INTO harness_events VALUES ('storage_rls_after', '42501', 'stranger denied');
  END;

  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES ('trip-documents', v_trip::text || '/pod/b.jpg', v_member::text);
  RESET ROLE;

  v_ok := public.fn_trip_documents_storage_allowed(v_trip::text || '/pod/b.jpg', 'select', v_member);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'member lost read after insert';
  END IF;

  INSERT INTO harness_events VALUES ('columns_ok', NULL, 'primary_region+beneficiary_name');
END $$;

DO $$
BEGIN
  IF (SELECT count(*) FROM harness_events WHERE kind = 'missing_column') <> 2 THEN
    RAISE EXCEPTION 'before-state 42703 events were lost';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM harness_events WHERE kind = 'columns_ok') THEN
    RAISE EXCEPTION 'after-state column write failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM harness_events WHERE kind = 'storage_rls_after') THEN
    RAISE EXCEPTION 'stranger storage deny was not observed after the policy';
  END IF;
END $$;

SELECT kind, sqlstate, note FROM harness_events ORDER BY kind, note;
