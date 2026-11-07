CREATE TABLE harness_events (
  kind text NOT NULL,
  sqlstate text,
  note text
);

DO $$
BEGIN
  PERFORM primary_region FROM public.suppliers;
  INSERT INTO harness_events VALUES ('unexpected_ok', NULL, 'suppliers.primary_region existed before migration');
EXCEPTION WHEN SQLSTATE '42703' THEN
  INSERT INTO harness_events VALUES ('missing_column', '42703', 'suppliers.primary_region');
END $$;

DO $$
BEGIN
  PERFORM beneficiary_name FROM public.entity_bank_accounts;
  INSERT INTO harness_events VALUES ('unexpected_ok', NULL, 'entity_bank_accounts.beneficiary_name existed before migration');
EXCEPTION WHEN SQLSTATE '42703' THEN
  INSERT INTO harness_events VALUES ('missing_column', '42703', 'entity_bank_accounts.beneficiary_name');
END $$;

DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM 1 FROM storage.objects;
  INSERT INTO harness_events VALUES ('unexpected_ok', NULL, 'storage.objects readable with no policy');
EXCEPTION
  WHEN SQLSTATE '42501' THEN
    INSERT INTO harness_events VALUES ('storage_rls', '42501', 'no party policy');
  WHEN insufficient_privilege THEN
    INSERT INTO harness_events VALUES ('storage_rls', '42501', 'no party policy');
END $$;

DO $$
BEGIN
  IF (SELECT count(*) FROM harness_events WHERE kind = 'missing_column' AND sqlstate = '42703') <> 2 THEN
    RAISE EXCEPTION 'expected two 42703 column misses, got %',
      (SELECT count(*) FROM harness_events WHERE kind = 'missing_column');
  END IF;
  IF (SELECT count(*) FROM harness_events WHERE kind = 'storage_rls' AND sqlstate = '42501') <> 1 THEN
    RAISE EXCEPTION 'expected one 42501 storage miss, got %',
      (SELECT json_agg(harness_events) FROM harness_events);
  END IF;
END $$;
