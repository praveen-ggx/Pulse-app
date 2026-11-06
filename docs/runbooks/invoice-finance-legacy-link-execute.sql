-- APPROVED execution of the legacy link plan. Do not run without written approval
-- of the exact plan fingerprint printed by invoice-finance-legacy-audit.sql (B4).
--
--   psql "<connection>" \
--     -v org=<organization uuid> \
--     -v approver=<auth user id of the approving finance user (owner/admin/finance)> \
--     -v plan_hash=<B4 plan_hash> \
--     -v planned_rows=<B4 planned_rows> \
--     -f docs/runbooks/invoice-finance-legacy-link-execute.sql
--
-- What it does, in one transaction:
--   1. recomputes the plan and stops if its fingerprint or row count differs from
--      what was approved (data changed since the dry run);
--   2. for every planned row calls link_trip_receipt_to_invoice_payment as the
--      approver (finance authority is checked by the RPC, and every receipt,
--      allocation and event records the approver as actor);
--   3. idempotency key 'legacy-link:<transaction id>'. Re-running the same approval
--      after it succeeded stops at step 1 (the linked rows now fall under R5, so the
--      fingerprint changes) and writes nothing; a row linked by someone else in the
--      meantime is refused by the RPC and the whole run rolls back.
-- Trip-ledger rows, invoice totals and invoices.tax_snapshot are not modified.

\set ON_ERROR_STOP 1
\ir invoice-finance-legacy-plan.sql

BEGIN;

CREATE TEMP TABLE legacy_link_approved ON COMMIT DROP AS
SELECT transaction_id, client_id, invoice_id, amount, idempotency_key
FROM legacy_link_plan
WHERE plan_status = 'planned';

SELECT set_config('legacy.expected_hash', :'plan_hash', true),
       set_config('legacy.expected_rows', :'planned_rows', true),
       set_config('legacy.org', :'org', true) IS NOT NULL AS _;

DO $$
DECLARE
  v_hash text;
  v_rows integer;
BEGIN
  SELECT count(*),
         md5(coalesce(string_agg(transaction_id::text || ':' || invoice_id::text || ':' || amount::text, ',' ORDER BY transaction_id), ''))
    INTO v_rows, v_hash
  FROM legacy_link_approved;
  IF v_hash <> current_setting('legacy.expected_hash') OR v_rows <> current_setting('legacy.expected_rows')::integer THEN
    RAISE EXCEPTION 'plan changed since approval (now % rows, hash %); re-run the audit and re-approve', v_rows, v_hash;
  END IF;
END;
$$;

GRANT SELECT ON legacy_link_approved TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'approver', true),
       set_config('request.jwt.claims', json_build_object('sub', :'approver', 'role', 'authenticated')::text, true) IS NOT NULL AS _;

DO $$
DECLARE
  v_row record;
  v_result jsonb;
  v_linked integer := 0;
  v_replayed integer := 0;
BEGIN
  FOR v_row IN SELECT * FROM legacy_link_approved ORDER BY transaction_id LOOP
    v_result := public.link_trip_receipt_to_invoice_payment(
      current_setting('legacy.org')::uuid,
      v_row.transaction_id,
      v_row.client_id,
      jsonb_build_array(jsonb_build_object('invoice_id', v_row.invoice_id, 'amount', v_row.amount)),
      v_row.idempotency_key
    );
    IF coalesce((v_result->>'replayed')::boolean, false) THEN
      v_replayed := v_replayed + 1;
    ELSE
      v_linked := v_linked + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'legacy link: % linked, % already linked by this plan (replayed)', v_linked, v_replayed;
END;
$$;

COMMIT;
