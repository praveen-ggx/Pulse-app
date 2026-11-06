-- Rollback of 20271103213000, 20271103220000, 20271103231500, 20271103234500,
-- 20271103235000 and 20271103235500 (invoice payments, finance controls, credit-note
-- GST, refunds, dashboard, delivery outbox). PRE-ADOPTION ONLY: this drops the
-- payment, allocation, credit-note, refund and bank-line tables. It refuses to run
-- once any receipt, credit note or refund exists; use the post-adoption freeze in
-- invoice-finance-rollback.md instead.
-- Verified on a local stack: 2026-11-03.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
  v_table text;
  v_has_rows boolean;
BEGIN
  -- Re-runnable: a table may already be gone after a partial rollback.
  FOREACH v_table IN ARRAY ARRAY['invoice_payments', 'invoice_credit_notes', 'invoice_customer_refunds'] LOOP
    v_has_rows := false;
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', v_table) INTO v_has_rows;
    END IF;
    IF v_has_rows AND coalesce(current_setting('pulse.finance_rollback_discard_data', true), '') <> 'yes' THEN
      RAISE EXCEPTION '% has rows; refusing to drop financial records. Use the post-adoption freeze.', v_table;
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS invoices_issued_guard ON public.invoices;

DROP TABLE IF EXISTS
  public.invoice_delivery_jobs,
  public.invoice_reminder_client_preferences,
  public.invoice_customer_refunds,
  public.invoice_refund_sequences,
  public.invoice_bank_lines,
  public.invoice_credit_note_lines,
  public.invoice_credit_notes,
  public.invoice_control_events,
  public.invoice_finance_operations,
  public.invoice_email_events,
  public.invoice_reminder_rules,
  public.invoice_reminder_events,
  public.invoice_payment_events,
  public.invoice_payment_allocations,
  public.invoice_payment_operations,
  public.invoice_receipt_sequences,
  public.invoice_payments
  CASCADE;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'allocate_invoice_payment',
        'apply_invoice_payment_allocations',
        'assert_invoice_payment_authority',
        'assert_invoice_payment_reader',
        'bank_reconciliation_history',
        'bank_reconciliation_lines',
        'cancel_customer_invoice',
        'claim_invoice_delivery_jobs',
        'complete_invoice_delivery_job',
        'customer_credit_balance',
        'customer_refundable_sources',
        'enqueue_invoice_reminders',
        'fail_invoice_delivery_job',
        'invoice_credit_refunded_amount',
        'invoice_customer_refunds_assign_number',
        'invoice_customer_refunds_guard',
        'invoice_delivery_register',
        'invoice_finance_dashboard',
        'invoice_payment_refunded_amount',
        'invoice_refund_register',
        'invoice_refundable_amount',
        'queue_invoice_email',
        'record_customer_refund',
        'reverse_customer_refund',
        'save_invoice_reminder_preference',
        'customer_finance_ledger',
        'customer_invoice_receivables',
        'customer_ledger_entries',
        'customer_ledger_rows',
        'import_bank_statement',
        'indian_financial_year',
        'invoice_collections_summary',
        'invoice_control_events_guard',
        'invoice_credit_note_lines_guard',
        'invoice_credit_note_register',
        'invoice_credit_notes_guard',
        'invoice_credited_amount',
        'invoice_finance_history',
        'invoice_payment_allocations_guard',
        'invoice_payment_events_guard',
        'invoice_payment_history',
        'invoice_payment_open_write',
        'invoice_payment_operations_guard',
        'invoice_payment_receipt',
        'invoice_payment_register',
        'invoice_payment_summaries',
        'invoice_payments_assign_receipt_number',
        'invoice_payments_guard',
        'invoice_register',
        'invoice_settled_amount',
        'invoices_issued_guard',
        'issue_invoice_credit_note',
        'link_trip_receipt_to_invoice_payment',
        'match_bank_line',
        'org_receivables_aging',
        'record_customer_receipt',
        'record_invoice_email',
        'record_invoice_payment',
        'record_invoice_payment_core',
        'reverse_invoice_payment',
        'save_invoice_reminder_rule',
        'trip_ledger_receipts_for_invoicing',
        'unmatch_bank_line'
      ])
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE';
  END LOOP;
END;
$$;

DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20271103213000', '20271103220000', '20271103231500',
                  '20271103234500', '20271103235000', '20271103235500');

COMMIT;
