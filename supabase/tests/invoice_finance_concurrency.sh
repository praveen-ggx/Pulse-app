#!/usr/bin/env bash
# Concurrent finance mutations on a LOCAL database. Two real sessions race; the
# second starts while the first still holds its transaction open.
#
#   CONTAINER=supabase_db_<project> DB=<scratch database> supabase/tests/invoice_finance_concurrency.sh
#
# The database must already have 20271103213000, 20271103220000, 20271103231500
# and 20271103234500.
# Fixtures are committed (cross-session), use their own synthetic org, and are
# removed at the end. Refuses to run against a database that has real orgs unless
# the scratch database name starts with "fin".
set -euo pipefail

CONTAINER=${CONTAINER:?set CONTAINER to the local db container}
DB=${DB:?set DB to a scratch database}
case "$DB" in fin*) ;; *) echo "refusing: DB must be a scratch database named fin*"; exit 2 ;; esac

ORG=cc000000-0000-4000-8000-00000000a001
FIN=cc000000-0000-4000-8000-00000000f001
CLI=cc000000-0000-4000-8000-0000000c1001
INV1=cc000000-0000-4000-8000-000000000101
INV2=cc000000-0000-4000-8000-000000000102
INV3=cc000000-0000-4000-8000-000000000103
INV4=cc000000-0000-4000-8000-000000000104
INV5=cc000000-0000-4000-8000-000000000105
INV6=cc000000-0000-4000-8000-000000000106
INV7=cc000000-0000-4000-8000-000000000107

psqlc() { docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -qAt "$@"; }

session() {
  # $1 = sleep before start, $2 = SQL to run inside the user transaction, $3 = hold seconds
  local wait=$1 sql=$2 hold=$3
  sleep "$wait"
  psqlc 2>&1 <<SQL || true
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '$FIN', true) IS NOT NULL AS _;
$sql
SELECT pg_sleep($hold) IS NOT NULL AS _;
COMMIT;
SQL
}

race() {
  # Runs A and B together; B starts 0.5s after A, while A holds its lock for 2s.
  local label=$1 a=$2 b=$3
  local outa outb
  outa=$(mktemp); outb=$(mktemp)
  session 0 "$a" 2 >"$outa" &
  local pa=$!
  session 0.5 "$b" 0 >"$outb" &
  local pb=$!
  wait $pa $pb
  echo "  [$label] A: $(grep -vE '^(t|BEGIN|COMMIT|SET)?$' "$outa" | tr '\n' ' ')"
  echo "  [$label] B: $(grep -vE '^(t|BEGIN|COMMIT|SET)?$' "$outb" | tr '\n' ' ')"
  rm -f "$outa" "$outb"
}

check() {
  local label=$1 sql=$2
  local got
  got=$(psqlc -c "$sql")
  if [ "$got" = "t" ]; then echo "PASS: $label"; else echo "FAIL: $label ($got)"; FAILED=1; fi
}

cleanup() {
  psqlc >/dev/null <<SQL
SET session_replication_role = replica;
DELETE FROM public.invoice_control_events WHERE org_id = '$ORG';
DELETE FROM public.invoice_customer_refunds WHERE org_id = '$ORG';
DELETE FROM public.invoice_refund_sequences WHERE org_id = '$ORG';
DELETE FROM public.invoice_credit_note_lines WHERE org_id = '$ORG';
DELETE FROM public.invoice_credit_notes WHERE org_id = '$ORG';
DELETE FROM public.invoice_finance_operations WHERE org_id = '$ORG';
DELETE FROM public.invoice_bank_lines WHERE org_id = '$ORG';
DELETE FROM public.invoice_payment_operations WHERE org_id = '$ORG';
DELETE FROM public.invoice_payment_events WHERE org_id = '$ORG';
DELETE FROM public.invoice_payment_allocations WHERE org_id = '$ORG';
DELETE FROM public.invoice_payments WHERE org_id = '$ORG';
DELETE FROM public.invoice_receipt_sequences WHERE org_id = '$ORG';
DELETE FROM public.invoices WHERE org_id = '$ORG';
DELETE FROM public.clients WHERE organization_id = '$ORG';
DELETE FROM public.organization_members WHERE organization_id = '$ORG';
DELETE FROM public.organizations WHERE id = '$ORG';
DELETE FROM public.profiles WHERE id = '$FIN';
DELETE FROM auth.users WHERE id = '$FIN';
SQL
}

FAILED=0
cleanup
trap cleanup EXIT

psqlc >/dev/null <<SQL
INSERT INTO auth.users (id, email) VALUES ('$FIN', 'cc-finance@test.local');
INSERT INTO public.organizations (id, name) VALUES ('$ORG', 'CC Concurrency Org');
INSERT INTO public.organization_members (organization_id, user_id, status, role) VALUES ('$ORG', '$FIN', 'active', 'owner');
INSERT INTO public.clients (id, organization_id, name, phone) VALUES ('$CLI', '$ORG', 'CC Client', '9000000777');
INSERT INTO public.invoices (id, org_id, invoice_number, financial_year, client_id, client_name, total_amount, status, invoice_date) VALUES
  ('$INV1', '$ORG', 'CC-1', '2026-27', '$CLI', 'CC Client', 1000, 'sent', CURRENT_DATE - 5),
  ('$INV2', '$ORG', 'CC-2', '2026-27', '$CLI', 'CC Client', 1000, 'sent', CURRENT_DATE - 5),
  ('$INV3', '$ORG', 'CC-3', '2026-27', '$CLI', 'CC Client', 1000, 'sent', CURRENT_DATE - 5),
  ('$INV4', '$ORG', 'CC-4', '2026-27', '$CLI', 'CC Client', 1000, 'sent', CURRENT_DATE - 5);
INSERT INTO public.invoices (id, org_id, invoice_number, financial_year, client_id, client_name, status, invoice_date,
                             subtotal, gst_rate, cgst_amount, sgst_amount, igst_amount, total_amount) VALUES
  ('$INV5', '$ORG', 'CC-5', '2026-27', '$CLI', 'CC Client', 'sent', CURRENT_DATE - 5, 1000, 18, 90, 90, 0, 1180),
  ('$INV6', '$ORG', 'CC-6', '2026-27', '$CLI', 'CC Client', 'sent', CURRENT_DATE - 5, 1000, 18, 90, 90, 0, 1180),
  ('$INV7', '$ORG', 'CC-7', '2026-27', '$CLI', 'CC Client', 'sent', CURRENT_DATE - 5, 1000, 0, 0, 0, 0, 1000);
SQL

pay() { # key, ref, invoice, amount, total
  echo "SELECT public.record_invoice_payment('$ORG', '$CLI', CURRENT_DATE, ${5:-$4}, 'neft', ${2}, NULL, NULL, NULL, '$1', '[{\"invoice_id\":\"$3\",\"amount\":$4}]')->>'payment_id';"
}

echo "1. Two receipts race for the full balance of one invoice"
race full "$(pay cc-full-a "'CC-A'" $INV1 1000)" "$(pay cc-full-b "'CC-B'" $INV1 1000)"
check "exactly one receipt applied; invoice not over-allocated" \
  "SELECT (SELECT count(*) FROM public.invoice_payments WHERE org_id = '$ORG' AND idempotency_key IN ('cc-full-a','cc-full-b')) = 1
      AND (SELECT sum(amount) FROM public.invoice_payment_allocations WHERE invoice_id = '$INV1' AND status = 'confirmed') = 1000"

echo "2. Same idempotency key from two sessions"
race idem "$(pay cc-idem-1 "'CC-IDEM'" $INV2 300)" "$(pay cc-idem-1 "'CC-IDEM'" $INV2 300)"
check "one payment row, one allocation" \
  "SELECT (SELECT count(*) FROM public.invoice_payments WHERE org_id = '$ORG' AND idempotency_key = 'cc-idem-1') = 1
      AND (SELECT count(*) FROM public.invoice_payment_allocations WHERE invoice_id = '$INV2') = 1"

echo "3. Two allocations race for the remainder of one payment"
psqlc >/dev/null <<SQL
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$FIN', true);
SELECT public.record_invoice_payment('$ORG', '$CLI', CURRENT_DATE, 500, 'neft', 'CC-POOL', NULL, NULL, NULL, 'cc-pool-01', '[]');
COMMIT;
SQL
POOL=$(psqlc -c "SELECT id FROM public.invoice_payments WHERE idempotency_key = 'cc-pool-01'")
race remainder \
  "SELECT public.allocate_invoice_payment('$ORG', '$POOL', '[{\"invoice_id\":\"$INV3\",\"amount\":400}]', 'cc-alloc-a')->>'unallocated';" \
  "SELECT public.allocate_invoice_payment('$ORG', '$POOL', '[{\"invoice_id\":\"$INV4\",\"amount\":400}]', 'cc-alloc-b')->>'unallocated';"
check "payment never allocated beyond its amount" \
  "SELECT (SELECT sum(amount) FROM public.invoice_payment_allocations WHERE payment_id = '$POOL' AND status = 'confirmed') = 400"

echo "4. Receipt vs cancellation of the same invoice"
race cancel \
  "SELECT public.cancel_customer_invoice('$ORG', '$INV4', 'race', 'cc-cancel-01')->>'status';" \
  "$(pay cc-vs-cancel "'CC-VS'" $INV4 100)"
check "either cancelled with nothing applied, or open with the receipt" \
  "SELECT CASE (SELECT status FROM public.invoices WHERE id = '$INV4')
            WHEN 'cancelled' THEN NOT EXISTS (SELECT 1 FROM public.invoice_payment_allocations WHERE invoice_id = '$INV4' AND status = 'confirmed')
            ELSE EXISTS (SELECT 1 FROM public.invoice_payment_allocations WHERE invoice_id = '$INV4' AND status = 'confirmed') END"

echo "5. Two bank lines race to match the same receipt"
psqlc >/dev/null <<SQL
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$FIN', true);
SELECT public.import_bank_statement('$ORG', '[{"txn_date":"2026-11-01","reference":"L1","credit":"1000"},{"txn_date":"2026-11-01","reference":"L2","credit":"1000"}]', 'cc-bank-001');
COMMIT;
SQL
L1=$(psqlc -c "SELECT id FROM public.invoice_bank_lines WHERE org_id = '$ORG' AND reference = 'L1'")
L2=$(psqlc -c "SELECT id FROM public.invoice_bank_lines WHERE org_id = '$ORG' AND reference = 'L2'")
WIN=$(psqlc -c "SELECT id FROM public.invoice_payments WHERE org_id = '$ORG' AND idempotency_key IN ('cc-full-a','cc-full-b')")
race match \
  "SELECT public.match_bank_line('$ORG', '$L1', '$WIN')->>'status';" \
  "SELECT public.match_bank_line('$ORG', '$L2', '$WIN')->>'status';"
check "the receipt is matched to one line only" \
  "SELECT (SELECT count(*) FROM public.invoice_bank_lines WHERE matched_payment_id = '$WIN' AND status = 'matched') = 1"

echo "6. Receipt numbers stay unique and gapless under the races"
check "receipt numbers 1..n" \
  "SELECT count(*) = max(split_part(receipt_number, '/', 3)::int) AND count(*) = count(DISTINCT receipt_number) FROM public.invoice_payments WHERE org_id = '$ORG'"

echo "7. Two GST credit notes race for the whole remaining taxable value"
cn() { # key
  echo "SELECT public.issue_invoice_credit_note('$ORG', '$INV5', CURRENT_DATE, 'race', 'gst', '[{\"description\":\"race\",\"taxable_amount\":1000}]', '$1')->>'credit_number';"
}
race credit "$(cn cc-cn-a)" "$(cn cc-cn-b)"
check "one credit note; taxable and CGST/SGST within the invoice" \
  "SELECT count(*) = 1 AND sum(taxable_amount) <= 1000 AND sum(cgst_amount) <= 90 AND sum(sgst_amount) <= 90
   FROM public.invoice_credit_notes WHERE invoice_id = '$INV5' AND status = 'issued'"

echo "8. Two refunds race for the same credit-note customer credit"
psqlc >/dev/null <<SQL
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$FIN', true);
SELECT public.record_invoice_payment('$ORG', '$CLI', CURRENT_DATE, 1180, 'neft', 'CC-PAID6', NULL, NULL, NULL, 'cc-paid6-01', '[{"invoice_id":"$INV6","amount":1180}]');
SELECT public.issue_invoice_credit_note('$ORG', '$INV6', CURRENT_DATE, 'credit', 'no_gst', '[{"description":"credit","amount":200}]', 'cc-cn6-0001');
COMMIT;
SQL
CN6=$(psqlc -c "SELECT id FROM public.invoice_credit_notes WHERE invoice_id = '$INV6'")
rf() { # key, source type, source id, amount
  echo "SELECT public.record_customer_refund('$ORG', '$2', '$3', CURRENT_DATE, $4, 'neft', NULL, NULL, '$1')->>'refund_number';"
}
race refund "$(rf cc-rfd-a credit_note "$CN6" 200)" "$(rf cc-rfd-b credit_note "$CN6" 200)"
check "one refund; refunds never exceed the customer credit" \
  "SELECT count(*) = 1 AND sum(amount) = 200 FROM public.invoice_customer_refunds WHERE credit_note_id = '$CN6' AND status = 'recorded'"

echo "9. Same refund key from two sessions"
psqlc >/dev/null <<SQL
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$FIN', true);
SELECT public.record_invoice_payment('$ORG', '$CLI', CURRENT_DATE, 300, 'neft', 'CC-ADV9', NULL, NULL, NULL, 'cc-adv9-001', '[]');
COMMIT;
SQL
ADV9=$(psqlc -c "SELECT id FROM public.invoice_payments WHERE idempotency_key = 'cc-adv9-001'")
race refund-key "$(rf cc-rfd-same payment "$ADV9" 100)" "$(rf cc-rfd-same payment "$ADV9" 100)"
check "one refund row for the key" \
  "SELECT count(*) = 1 FROM public.invoice_customer_refunds WHERE idempotency_key = 'cc-rfd-same'"

echo "10. Refund and allocation race for the same unapplied receipt money"
psqlc >/dev/null <<SQL
BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '$FIN', true);
SELECT public.record_invoice_payment('$ORG', '$CLI', CURRENT_DATE, 500, 'neft', 'CC-ADV10', NULL, NULL, NULL, 'cc-adv10-01', '[]');
COMMIT;
SQL
ADV10=$(psqlc -c "SELECT id FROM public.invoice_payments WHERE idempotency_key = 'cc-adv10-01'")
race refund-vs-allocate \
  "$(rf cc-rfd-10a payment "$ADV10" 500)" \
  "SELECT public.allocate_invoice_payment('$ORG', '$ADV10', '[{\"invoice_id\":\"$INV7\",\"amount\":500}]', 'cc-alloc-10b')->>'unallocated';"
check "allocated + refunded never exceeds the receipt" \
  "SELECT coalesce((SELECT sum(amount) FROM public.invoice_payment_allocations WHERE payment_id = '$ADV10' AND status = 'confirmed'), 0)
        + coalesce((SELECT sum(amount) FROM public.invoice_customer_refunds WHERE payment_id = '$ADV10' AND status = 'recorded'), 0) = 500"

echo "11. Refund numbers stay unique and gapless"
check "refund numbers 1..n" \
  "SELECT count(*) = max(split_part(refund_number, '/', 3)::int) AND count(*) = count(DISTINCT refund_number) FROM public.invoice_customer_refunds WHERE org_id = '$ORG'"

if [ "$FAILED" = 0 ]; then echo "ALL CONCURRENCY CHECKS PASSED"; else echo "CONCURRENCY FAILURES"; exit 1; fi
