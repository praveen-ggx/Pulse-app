-- LOCAL-ONLY Commerce / Manual Invoice QA notes.
-- The old Client A–D trip multi-select fixture is retired.
-- Do not run with --linked.
--
-- Target rows (apply only after local sales_orders + products exist):
--   Client: QA Commerce Client
--   ORDER-OFF-001  Fulfilled, not invoiced
--   ORDER-ON-001   Draft (not billable)
--   ORDER-ISSUED-001 Fulfilled + issued invoice (when invoices.sales_order_id exists)
--   Merged child trips are not invoice candidates (no trip selector).
--
-- Manual Plan QA is blocked until a Client Plan entity exists.
--
-- This file is intentionally a no-op SELECT so local replay of the old
-- trip fixture cannot be mistaken for the new billing model.

SELECT
  'commerce_invoice_qa_fixture_retired_trip_abcd' AS fixture,
  'use Commerce Order Create Invoice; do not seed trip bulk invoices' AS next_step;
