-- Compliance advance / balance are payments TO the supplier (cash out,
-- Dr Accounts Payable — CORE_ACCOUNTING_MODEL §4.2). They were written as
-- client receipts (amount_in, contact_type 'client'), so Trip Detail showed
-- them as "Client received" and sync_trip_payment_status counted them in the
-- client's amount_paid. Flip direction and counterparty only; amounts, dates,
-- UTRs and references are untouched. The UPDATE re-fires
-- trg_sync_trip_payment_status, which recomputes trips.amount_paid.

UPDATE public.transactions tx
SET amount_out = tx.amount_in,
    amount_in = 0,
    contact_type = 'supplier',
    contact_id = t.supplier_id,
    party_name = COALESCE(
      NULLIF(btrim(s.company_name), ''),
      NULLIF(btrim(s.name), ''),
      'Supplier'
    ),
    ledger_entity_type = 'supplier',
    ledger_flow_type = 'payable'
FROM public.trips t
LEFT JOIN public.suppliers s ON s.id = t.supplier_id
WHERE t.id = tx.trip_id
  AND tx.ledger_category IN ('compliance_advance', 'compliance_balance')
  AND COALESCE(tx.amount_in, 0) > 0
  AND COALESCE(tx.amount_out, 0) = 0;
