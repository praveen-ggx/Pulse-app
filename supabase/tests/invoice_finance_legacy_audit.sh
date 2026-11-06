#!/usr/bin/env bash
# Legacy AR capture audit, dry-run plan and approved execution on a LOCAL scratch
# database, against synthetic rows written in the exact format of the legacy capture.
#
#   CONTAINER=supabase_db_<project> DB=fin<scratch> supabase/tests/invoice_finance_legacy_audit.sh
#
# Requires 20271103213000 .. 20271103234500. Fixtures use their own synthetic org and
# are removed at the end.
set -euo pipefail

CONTAINER=${CONTAINER:?set CONTAINER to the local db container}
DB=${DB:?set DB to a scratch database}
case "$DB" in fin*) ;; *) echo "refusing: DB must be a scratch database named fin*"; exit 2 ;; esac
HERE=$(cd "$(dirname "$0")" && pwd)
RUNBOOKS="$HERE/../../docs/runbooks"

ORG=1a000000-0000-4000-8000-00000000a001
FIN=1a000000-0000-4000-8000-00000000f001
CLI=1a000000-0000-4000-8000-0000000c1001
CL2=1a000000-0000-4000-8000-0000000c2001
L1=1a000000-0000-4000-8000-000000000101
L2=1a000000-0000-4000-8000-000000000102
L3=1a000000-0000-4000-8000-000000000103
L4=1a000000-0000-4000-8000-000000000104
T=1a000000-0000-4000-8000-0000000006

psqlc() { docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qAt "$@"; }
FAILED=0
check() {
  local label=$1 sql=$2 got
  got=$(psqlc -c "$sql")
  if [ "$got" = "t" ]; then echo "PASS: $label"; else echo "FAIL: $label ($got)"; FAILED=1; fi
}
as_fin() {
  psqlc >/dev/null <<SQL
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$FIN', true);
$1
COMMIT;
SQL
}

cleanup() {
  psqlc >/dev/null <<SQL
SET session_replication_role = replica;
DELETE FROM public.invoice_control_events WHERE org_id = '$ORG';
DELETE FROM public.invoice_finance_operations WHERE org_id = '$ORG';
DELETE FROM public.invoice_payment_operations WHERE org_id = '$ORG';
DELETE FROM public.invoice_payment_events WHERE org_id = '$ORG';
DELETE FROM public.invoice_payment_allocations WHERE org_id = '$ORG';
DELETE FROM public.invoice_payments WHERE org_id = '$ORG';
DELETE FROM public.invoice_receipt_sequences WHERE org_id = '$ORG';
DELETE FROM public.transactions WHERE organization_id = '$ORG';
DELETE FROM public.invoices WHERE org_id = '$ORG';
DELETE FROM public.clients WHERE organization_id = '$ORG';
DELETE FROM public.organization_members WHERE organization_id = '$ORG';
DELETE FROM public.organizations WHERE id = '$ORG';
DELETE FROM public.profiles WHERE id = '$FIN';
DELETE FROM auth.users WHERE id = '$FIN';
SQL
}
cleanup
trap cleanup EXIT

docker exec "$CONTAINER" mkdir -p /tmp/runbooks
for f in invoice-finance-legacy-plan.sql invoice-finance-legacy-audit.sql invoice-finance-legacy-link-execute.sql; do
  docker cp "$RUNBOOKS/$f" "$CONTAINER:/tmp/runbooks/$f" >/dev/null
done

psqlc >/dev/null <<SQL
INSERT INTO auth.users (id, email) VALUES ('$FIN', 'la-finance@test.local');
INSERT INTO public.profiles (id, email, full_name, role) VALUES ('$FIN', 'la-finance@test.local', 'LA Finance', 'user');
INSERT INTO public.organizations (id, name) VALUES ('$ORG', 'LA Legacy Audit Org');
INSERT INTO public.organization_members (organization_id, user_id, status, role) VALUES ('$ORG', '$FIN', 'active', 'owner');
INSERT INTO public.clients (id, organization_id, name, phone) VALUES
  ('$CLI', '$ORG', 'LA Client', '9000000881'), ('$CL2', '$ORG', 'LA Other Client', '9000000882');
-- What the legacy capture left on the invoices: status paid + tax_snapshot.receipt_applied
INSERT INTO public.invoices (id, org_id, invoice_number, financial_year, client_id, client_name, total_amount, status, invoice_date, tax_snapshot) VALUES
  ('$L1', '$ORG', 'LA-001', '2026-27', '$CLI', 'LA Client', 1180, 'paid', CURRENT_DATE - 20, '{"supply_type":"intra","receipt_applied":1180}'),
  ('$L2', '$ORG', 'LA-002', '2026-27', '$CLI', 'LA Client', 1000, 'sent', CURRENT_DATE - 20, '{"receipt_applied":1100}'),
  ('$L3', '$ORG', 'LA-003', '2026-27', '$CLI', 'LA Client', 500,  'sent', CURRENT_DATE - 20, NULL),
  ('$L4', '$ORG', 'LA-004', '2026-27', '$CLI', 'LA Client', 300,  'cancelled', CURRENT_DATE - 20, NULL);
-- Trip-ledger rows in the legacy capture format (and some that must not be linked)
INSERT INTO public.transactions (id, organization_id, party_name, description, amount_in, amount_out, transaction_date, contact_id, contact_type, ledger_category, payment_reference) VALUES
  ('${T}01', '$ORG', 'LA Client', 'Customer receipt UTR-L1 · LA-001 · trip TRP-1', 1000, 0, CURRENT_DATE - 10, '$CLI', 'client', 'customer_receipt', 'UTR-L1'),
  ('${T}02', '$ORG', 'LA Client', 'TDS deducted by customer UTR-L1 · LA-001 · trip TRP-1', 180, 0, CURRENT_DATE - 10, '$CLI', 'client', 'tds_receivable', 'UTR-L1'),
  ('${T}03', '$ORG', 'LA Client', 'Customer receipt UTR-L2 · LA-002', 600, 0, CURRENT_DATE - 9, '$CLI', 'client', 'customer_receipt', 'UTR-L2'),
  ('${T}04', '$ORG', 'LA Client', 'Customer receipt UTR-L2B · LA-002', 500, 0, CURRENT_DATE - 8, '$CLI', 'client', 'customer_receipt', 'UTR-L2B'),
  ('${T}05', '$ORG', 'LA Client', 'Customer receipt · LA-999', 100, 0, CURRENT_DATE - 8, '$CLI', 'client', 'customer_receipt', NULL),
  ('${T}06', '$ORG', 'LA Other Client', 'Customer receipt UTR-X · LA-003', 100, 0, CURRENT_DATE - 8, '$CL2', 'client', 'customer_receipt', 'UTR-X'),
  ('${T}07', '$ORG', 'LA Client', 'Customer receipt UTR-DUP · LA-003', 200, 0, CURRENT_DATE - 8, '$CLI', 'client', 'customer_receipt', 'UTR-DUP'),
  ('${T}08', '$ORG', 'LA Client', 'Received cash from client', 50, 0, CURRENT_DATE - 8, '$CLI', 'client', 'customer_receipt', NULL),
  ('${T}09', '$ORG', 'LA Client', 'Customer receipt · LA-004', 300, 0, CURRENT_DATE - 8, '$CLI', 'client', 'customer_receipt', NULL),
  ('${T}10', '$ORG', 'LA Client', 'Customer receipt UTR-L3 · LA-003', 100, 0, CURRENT_DATE - 7, '$CLI', 'client', 'customer_receipt', 'UTR-L3');
SQL
# An invoice payment already carries the reference of T07; T10 is already linked.
as_fin "SELECT public.record_invoice_payment('$ORG', '$CLI', CURRENT_DATE - 8, 200, 'neft', 'UTR-DUP', NULL, NULL, NULL, 'la-dup-pay-01', '[{\"invoice_id\":\"$L3\",\"amount\":200}]');
SELECT public.link_trip_receipt_to_invoice_payment('$ORG', '${T}10', '$CLI', '[{\"invoice_id\":\"$L3\",\"amount\":100}]', 'la-prelink-10');"

fingerprint() {
  psqlc -c "SELECT md5(concat_ws('|',
    (SELECT count(*) || ':' || coalesce(sum(amount), 0) FROM public.invoice_payments WHERE org_id = '$ORG'),
    (SELECT count(*) || ':' || coalesce(sum(amount), 0) FROM public.invoice_payment_allocations WHERE org_id = '$ORG'),
    (SELECT string_agg(id::text || amount_in || description || coalesce(payment_reference, ''), ',' ORDER BY id) FROM public.transactions WHERE organization_id = '$ORG'),
    (SELECT string_agg(id::text || status || coalesce(tax_snapshot::text, '') || total_amount, ',' ORDER BY id) FROM public.invoices WHERE org_id = '$ORG')))"
}

echo "1. Read-only audit"
BEFORE=$(fingerprint)
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -v org="$ORG" -f /tmp/runbooks/invoice-finance-legacy-audit.sql > /tmp/la-audit-out.txt 2>&1 \
  && echo "PASS: audit script ran" || { echo "FAIL: audit script"; cat /tmp/la-audit-out.txt; FAILED=1; }
AFTER=$(fingerprint)
[ "$BEFORE" = "$AFTER" ] && echo "PASS: audit changed nothing" || { echo "FAIL: audit changed data"; FAILED=1; }
grep -q "READ ONLY\|BEGIN" /tmp/la-audit-out.txt || true

plan() {
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qAt -v org="$ORG" \
    -f /tmp/runbooks/invoice-finance-legacy-plan.sql -c "$1"
}
check_plan() {
  local label=$1 sql=$2 got
  got=$(plan "$sql" | tail -1)
  if [ "$got" = "t" ]; then echo "PASS: $label"; else echo "FAIL: $label ($got)"; FAILED=1; fi
}

echo "2. Dry-run plan follows the deterministic rule"
check_plan "cash + TDS of LA-001 and the first LA-002 receipt are planned" \
  "SELECT array_agg(right(transaction_id::text, 2) ORDER BY transaction_id) = '{01,02,03}' FROM legacy_link_plan WHERE plan_status = 'planned'"
check_plan "TDS row is planned as a TDS receipt" \
  "SELECT payment_mode = 'tds' FROM legacy_link_plan WHERE transaction_id = '${T}02'"
check_plan "second LA-002 receipt exceeds the open balance (R8)" \
  "SELECT exclusion LIKE 'R8%' FROM legacy_link_plan WHERE transaction_id = '${T}04'"
check_plan "unknown invoice number (R3)" "SELECT exclusion = 'R3 invoice number not found' FROM legacy_link_plan WHERE transaction_id = '${T}05'"
check_plan "other client's receipt (R4)" "SELECT exclusion LIKE 'R4%' FROM legacy_link_plan WHERE transaction_id = '${T}06'"
check_plan "same reference already an invoice payment (R6)" "SELECT exclusion LIKE 'R6%' FROM legacy_link_plan WHERE transaction_id = '${T}07'"
check_plan "free-text trip receipt is not legacy format (R2)" "SELECT exclusion LIKE 'R2%' FROM legacy_link_plan WHERE transaction_id = '${T}08'"
check_plan "cancelled invoice (R3)" "SELECT exclusion = 'R3 invoice is draft or cancelled' FROM legacy_link_plan WHERE transaction_id = '${T}09'"
check_plan "already linked (R5)" "SELECT exclusion = 'R5 already linked' FROM legacy_link_plan WHERE transaction_id = '${T}10'"
check_plan "open balance after the plan is shown" \
  "SELECT invoice_open_after = 400 FROM legacy_link_plan WHERE transaction_id = '${T}03'"

HASH=$(plan "SELECT md5(coalesce(string_agg(transaction_id::text || ':' || invoice_id::text || ':' || amount::text, ',' ORDER BY transaction_id), '')) FROM legacy_link_plan WHERE plan_status = 'planned'" | tail -1)
ROWS=$(plan "SELECT count(*) FROM legacy_link_plan WHERE plan_status = 'planned'" | tail -1)
grep -q "$HASH" /tmp/la-audit-out.txt && echo "PASS: audit prints the same plan fingerprint" || { echo "FAIL: fingerprint not in audit output"; FAILED=1; }

execute() {
  docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qAt -v org="$ORG" -v approver="$FIN" \
    -v plan_hash="$1" -v planned_rows="$2" -f /tmp/runbooks/invoice-finance-legacy-link-execute.sql 2>&1
}

echo "3. Execution refuses an unapproved plan"
BEFORE=$(fingerprint)
OUT=$(execute 00000000000000000000000000000000 "$ROWS" || true)
echo "$OUT" | grep -q "plan changed since approval" && echo "PASS: wrong fingerprint refused" || { echo "FAIL: $OUT"; FAILED=1; }
[ "$BEFORE" = "$(fingerprint)" ] && echo "PASS: refused run wrote nothing" || { echo "FAIL: refused run wrote data"; FAILED=1; }

echo "4. Approved execution"
TXN_BEFORE=$(psqlc -c "SELECT md5(string_agg(id::text || amount_in || amount_out || description || transaction_date || coalesce(payment_reference, ''), ',' ORDER BY id)) FROM public.transactions WHERE organization_id = '$ORG'")
OUT=$(execute "$HASH" "$ROWS")
echo "$OUT" | grep -q "3 linked, 0 already linked" && echo "PASS: three planned rows linked" || { echo "FAIL: $OUT"; FAILED=1; }
check "LA-001 settled by exactly the trip-ledger cash + TDS" \
  "SELECT (SELECT sum(amount) FROM public.invoice_payment_allocations WHERE invoice_id = '$L1' AND status = 'confirmed') = 1180
      AND (SELECT count(*) FROM public.invoice_payments WHERE org_id = '$ORG' AND source_transaction_id IN ('${T}01', '${T}02')) = 2
      AND (SELECT payment_mode FROM public.invoice_payments WHERE source_transaction_id = '${T}02') = 'tds'"
check "LA-002 has 600 received, 400 open; the excluded 500 was not applied" \
  "SELECT (SELECT sum(amount) FROM public.invoice_payment_allocations WHERE invoice_id = '$L2' AND status = 'confirmed') = 600
      AND NOT EXISTS (SELECT 1 FROM public.invoice_payments WHERE source_transaction_id = '${T}04')"
check "excluded rows were not linked" \
  "SELECT NOT EXISTS (SELECT 1 FROM public.invoice_payments WHERE source_transaction_id IN ('${T}05','${T}06','${T}07','${T}08','${T}09'))"
check "trip-ledger rows and invoice rows are unchanged" \
  "SELECT (SELECT md5(string_agg(id::text || amount_in || amount_out || description || transaction_date || coalesce(payment_reference, ''), ',' ORDER BY id)) FROM public.transactions WHERE organization_id = '$ORG') = '$TXN_BEFORE'
      AND (SELECT tax_snapshot->>'receipt_applied' FROM public.invoices WHERE id = '$L1') = '1180'
      AND (SELECT status FROM public.invoices WHERE id = '$L1') = 'paid'
      AND (SELECT count(*) FROM public.transactions WHERE organization_id = '$ORG') = 10"
check "every linked receipt records the approver as actor" \
  "SELECT bool_and(recorded_by = '$FIN') FROM public.invoice_payments WHERE org_id = '$ORG' AND idempotency_key LIKE 'legacy-link:%'"

echo "5. Re-running the same approval cannot double-link"
BEFORE=$(fingerprint)
OUT=$(execute "$HASH" "$ROWS" || true)
echo "$OUT" | grep -q "plan changed since approval" && echo "PASS: re-run refused (plan now empty)" || { echo "FAIL: $OUT"; FAILED=1; }
[ "$BEFORE" = "$(fingerprint)" ] && echo "PASS: re-run wrote nothing" || { echo "FAIL: re-run wrote data"; FAILED=1; }
check_plan "after execution the linked rows show as R5 already linked" \
  "SELECT count(*) = 4 FROM legacy_link_plan WHERE exclusion = 'R5 already linked'"

if [ "$FAILED" = 0 ]; then echo "ALL LEGACY AUDIT CHECKS PASSED"; else echo "LEGACY AUDIT FAILURES"; exit 1; fi
