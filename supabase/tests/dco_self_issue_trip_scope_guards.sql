-- issue_dco_self_receivable trip scope (20271102183000): security regression guards.
--
-- STATUS: NOT YET EXECUTED. Run only on a disposable database, or on one the
-- release owner has explicitly approved, after applying prod-2026-11-02-dco.
-- One transaction, ends with ROLLBACK. Fixtures already in that database are
-- passed as psql variables; nothing is invented:
--   dco_user     auth.users id of an approved DCO (is_dco_eligible = true,
--                dco_self_workspace_id(dco_user) is not null)
--   own_trip     trip in the DCO's own Self workspace organisation
--   dco_trip     operating_mode='DCO' trip in another org; its driver row user_id = dco_user
--   fleet_trip   operating_mode='FLEET' trip in another org; its driver row user_id = dco_user
--   other_trip   operating_mode='DCO' trip whose driver is NOT dco_user
--   market_trip  trip with source = 'market_bid'
--   deleted_trip trip with deleted_at set (otherwise eligible)
--
-- psql "$DISPOSABLE_DB_URL" -v ON_ERROR_STOP=1 -v dco_user=... -v own_trip=... \
--   -v dco_trip=... -v fleet_trip=... -v other_trip=... -v market_trip=... -v deleted_trip=... \
--   -f supabase/tests/dco_self_issue_trip_scope_guards.sql
-- Pass: every check prints PASS.
--
-- Concurrency (C1) needs two sessions, so it is a procedure, not part of this file:
--   As dco_user in sessions A and B: BEGIN; then in both call
--   issue_dco_self_receivable(<party>, 100, '<different key per session>', '<dco_trip>', NULL);
--   COMMIT A, then COMMIT B.
--   Expected: A succeeds. B waits on A's row, then raises dco_self_trip_already_issued
--   (dco_self_receivables_active_trip_uidx). Exactly one non-void row exists for the trip.
--   Repeat with the SAME key in both: A succeeds, B returns 'replayed': true with A's id.

BEGIN;

SELECT set_config('scope_test.user', :'dco_user', true),
       set_config('scope_test.own_trip', :'own_trip', true),
       set_config('scope_test.dco_trip', :'dco_trip', true),
       set_config('scope_test.fleet_trip', :'fleet_trip', true),
       set_config('scope_test.other_trip', :'other_trip', true),
       set_config('scope_test.market_trip', :'market_trip', true),
       set_config('scope_test.deleted_trip', :'deleted_trip', true);

DO $$
BEGIN
  IF to_regclass('public.dco_self_receivables_active_trip_uidx') IS NULL THEN
    RAISE EXCEPTION 'FAIL: dco_self_receivables_active_trip_uidx missing';
  END IF;
  IF has_function_privilege('anon', 'public.issue_dco_self_receivable(uuid, numeric, text, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anon can execute issue_dco_self_receivable';
  END IF;
  RAISE NOTICE 'PASS: index present, anon has no EXECUTE';
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('scope_test.user'), true),
       set_config('request.jwt.claims',
                  json_build_object('sub', current_setting('scope_test.user'), 'role', 'authenticated')::text,
                  true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_party uuid;
  v_r jsonb;
  v_first uuid;
BEGIN
  v_party := (public.upsert_dco_self_party('QA scope party', NULL, 'qa-scope-party') ->> 'id')::uuid;
  IF v_party IS NULL THEN RAISE EXCEPTION 'FAIL setup: no party'; END IF;
  PERFORM set_config('scope_test.party', v_party::text, true);

  -- S1: a trip in the DCO's own Self workspace can be issued.
  v_r := public.issue_dco_self_receivable(v_party, 500, 'qa-scope-own', current_setting('scope_test.own_trip')::uuid, NULL);
  IF (v_r ->> 'id') IS NULL THEN RAISE EXCEPTION 'FAIL S1: own-workspace trip not issued: %', v_r; END IF;
  RAISE NOTICE 'PASS S1: own-workspace trip issued';

  -- S2: an eligible DCO trip the caller drives can be issued.
  v_r := public.issue_dco_self_receivable(v_party, 1000, 'qa-scope-dco', current_setting('scope_test.dco_trip')::uuid, NULL);
  v_first := (v_r ->> 'id')::uuid;
  IF v_first IS NULL OR (v_r ->> 'replayed')::boolean THEN RAISE EXCEPTION 'FAIL S2: DCO trip not issued: %', v_r; END IF;
  PERFORM set_config('scope_test.first', v_first::text, true);
  RAISE NOTICE 'PASS S2: DCO trip issued';

  -- U1: the same key replays the same row.
  v_r := public.issue_dco_self_receivable(v_party, 1000, 'qa-scope-dco', current_setting('scope_test.dco_trip')::uuid, NULL);
  IF (v_r ->> 'id')::uuid IS DISTINCT FROM v_first OR NOT (v_r ->> 'replayed')::boolean THEN
    RAISE EXCEPTION 'FAIL U1: replay returned %', v_r;
  END IF;
  RAISE NOTICE 'PASS U1: same key is idempotent';

  -- U2: a different key for the same active trip is rejected.
  BEGIN
    PERFORM public.issue_dco_self_receivable(v_party, 1200, 'qa-scope-dco-2', current_setting('scope_test.dco_trip')::uuid, NULL);
    RAISE EXCEPTION 'FAIL U2: second active receivable created';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%dco_self_trip_already_issued%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS U2: second active receivable for the trip rejected';
  END;

  -- S3: a FLEET trip the caller drives is rejected.
  BEGIN
    PERFORM public.issue_dco_self_receivable(v_party, 500, 'qa-scope-fleet', current_setting('scope_test.fleet_trip')::uuid, NULL);
    RAISE EXCEPTION 'FAIL S3: fleet trip issued';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%dco_self_fleet_trip_denied%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS S3: fleet trip rejected';
  END;

  -- S4: a DCO trip driven by someone else is rejected.
  BEGIN
    PERFORM public.issue_dco_self_receivable(v_party, 500, 'qa-scope-other', current_setting('scope_test.other_trip')::uuid, NULL);
    RAISE EXCEPTION 'FAIL S4: another driver''s trip issued';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%dco_self_trip_denied%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS S4: trip driven by someone else rejected';
  END;

  -- S5: a marketplace trip stays rejected.
  BEGIN
    PERFORM public.issue_dco_self_receivable(v_party, 500, 'qa-scope-market', current_setting('scope_test.market_trip')::uuid, NULL);
    RAISE EXCEPTION 'FAIL S5: marketplace trip issued';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%dco_self_marketplace_denied%' AND SQLERRM NOT LIKE '%dco_self_trip_denied%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS S5: marketplace trip rejected';
  END;

  -- S6: a deleted trip is rejected with the same error as an unknown id.
  BEGIN
    PERFORM public.issue_dco_self_receivable(v_party, 500, 'qa-scope-deleted', current_setting('scope_test.deleted_trip')::uuid, NULL);
    RAISE EXCEPTION 'FAIL S6: deleted trip issued';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%dco_self_trip_denied%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.issue_dco_self_receivable(v_party, 500, 'qa-scope-unknown', gen_random_uuid(), NULL);
    RAISE EXCEPTION 'FAIL S6: unknown trip issued';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%dco_self_trip_denied%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS S6: deleted and unknown trips rejected alike';

  -- S7: no receivable without a trip is affected.
  IF (public.issue_dco_self_receivable(v_party, 300, 'qa-scope-none', NULL, 'Party A') ->> 'id') IS NULL THEN
    RAISE EXCEPTION 'FAIL S7: receivable without a trip not issued';
  END IF;
  RAISE NOTICE 'PASS S7: receivable without a trip issued';
END;
$$;

-- U3 needs a void receivable. This release has no void RPC, so the test voids the
-- row as the migration owner, inside this rolled-back transaction only.
RESET ROLE;
UPDATE public.dco_self_receivables SET status = 'void'
 WHERE id = current_setting('scope_test.first')::uuid;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_r jsonb;
BEGIN
  -- U3: once the original is void, the trip can carry a replacement.
  v_r := public.issue_dco_self_receivable(current_setting('scope_test.party')::uuid, 1100, 'qa-scope-dco-3',
                                          current_setting('scope_test.dco_trip')::uuid, NULL);
  IF (v_r ->> 'id') IS NULL OR (v_r ->> 'id')::uuid = current_setting('scope_test.first')::uuid THEN
    RAISE EXCEPTION 'FAIL U3: replacement after void returned %', v_r;
  END IF;
  RAISE NOTICE 'PASS U3: replacement allowed after void; void row kept';
END;
$$;

ROLLBACK;
