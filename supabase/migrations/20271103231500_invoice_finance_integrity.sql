-- Finance integrity fixes found by running the payment and finance-control RPCs
-- against a local database (supabase/tests/invoice_finance_controls.sql).
--
-- Fixes:
--   * allocation checked the issued total only; it now subtracts issued credit notes
--   * cancelled invoices reported their full total as outstanding
--   * the customer ledger dropped the original credit of a reversed payment, never
--     credited a cancelled invoice back, had no running balance and an unstable order
--   * one payment could be matched to several bank lines; debit lines could be matched;
--     no unmatch; import keys changed with number formatting ("100" vs "100.00")
--   * credit notes: lines and most columns were mutable inside the write window, and
--     the tax part was not bounded by the credit amount
--   * any org staff member could cancel, re-total or delete an issued invoice directly
--     through the table API, bypassing cancel_customer_invoice
-- Adds:
--   * receipt numbers (RCT/<FY>/<seq>, gapless per org and financial year)
--   * TDS deducted by the customer, carried on the receipt (bank credit = amount - tds)
--   * receipt document, customer ledger with running balance, statement period totals,
--     org aging, invoice and payment registers, collections, bank line listing
--   * an explicit, one-to-one link from a trip-ledger customer receipt to an invoice
--     payment, and a read-only report of trip-ledger receipts that are not linked
-- Does not move or rewrite any existing trip-ledger row or issued invoice total.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Receipt numbers, TDS, legacy link
-- ---------------------------------------------------------------------------

ALTER TABLE public.invoice_payments
  ADD COLUMN receipt_number text,
  ADD COLUMN tds_amount numeric(14,2) NOT NULL DEFAULT 0,
  -- No foreign key: the trip ledger keeps its own delete rules.
  ADD COLUMN source_transaction_id uuid;

ALTER TABLE public.invoice_payments
  ADD CONSTRAINT invoice_payments_tds_check CHECK (tds_amount >= 0 AND tds_amount < amount);

CREATE TABLE public.invoice_receipt_sequences (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  financial_year text NOT NULL,
  last_seq integer NOT NULL,
  PRIMARY KEY (org_id, financial_year)
);
ALTER TABLE public.invoice_receipt_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_receipt_sequences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.indian_financial_year(p_date date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN extract(month FROM p_date) >= 4
      THEN extract(year FROM p_date)::int::text || '-' || right((extract(year FROM p_date)::int + 1)::text, 2)
    ELSE (extract(year FROM p_date)::int - 1)::text || '-' || right(extract(year FROM p_date)::int::text, 2)
  END;
$$;

-- Number every payment on insert. The sequence row is updated in the inserting
-- transaction, so a rolled-back payment does not consume a number.
CREATE OR REPLACE FUNCTION public.invoice_payments_assign_receipt_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fy text := public.indian_financial_year(NEW.payment_date);
  v_seq integer;
BEGIN
  INSERT INTO public.invoice_receipt_sequences AS s (org_id, financial_year, last_seq)
  VALUES (NEW.org_id, v_fy, 1)
  ON CONFLICT (org_id, financial_year)
  DO UPDATE SET last_seq = s.last_seq + 1
  RETURNING last_seq INTO v_seq;
  NEW.receipt_number := 'RCT/' || v_fy || '/' || lpad(v_seq::text, 5, '0');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invoice_payments_assign_receipt_number() FROM PUBLIC, anon, authenticated;

-- Backfill payments recorded before this migration, in recorded order.
DO $$
BEGIN
  PERFORM set_config('pulse.invoice_payment_write', 'on', true);
  WITH numbered AS (
    SELECT p.id,
           public.indian_financial_year(p.payment_date) AS fy,
           row_number() OVER (
             PARTITION BY p.org_id, public.indian_financial_year(p.payment_date)
             ORDER BY p.created_at, p.id
           ) AS seq
    FROM public.invoice_payments p
    WHERE p.receipt_number IS NULL
  )
  UPDATE public.invoice_payments p
  SET receipt_number = 'RCT/' || n.fy || '/' || lpad(n.seq::text, 5, '0')
  FROM numbered n
  WHERE n.id = p.id;

  INSERT INTO public.invoice_receipt_sequences (org_id, financial_year, last_seq)
  SELECT p.org_id, public.indian_financial_year(p.payment_date), count(*)::int
  FROM public.invoice_payments p
  GROUP BY 1, 2;
  PERFORM set_config('pulse.invoice_payment_write', '', true);
END;
$$;

ALTER TABLE public.invoice_payments ALTER COLUMN receipt_number SET NOT NULL;

CREATE UNIQUE INDEX invoice_payments_org_receipt_number
  ON public.invoice_payments (org_id, receipt_number);

-- One active invoice payment per trip-ledger receipt. A reversed link frees it.
CREATE UNIQUE INDEX invoice_payments_source_transaction_active
  ON public.invoice_payments (org_id, source_transaction_id)
  WHERE source_transaction_id IS NOT NULL AND status = 'recorded';

CREATE INDEX invoice_payments_org_client_date
  ON public.invoice_payments (org_id, client_id, payment_date, id)
  WHERE client_id IS NOT NULL;

CREATE TRIGGER invoice_payments_assign_receipt_number
  BEFORE INSERT ON public.invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_payments_assign_receipt_number();

ALTER TABLE public.invoice_payments DROP CONSTRAINT invoice_payments_mode_check;
ALTER TABLE public.invoice_payments ADD CONSTRAINT invoice_payments_mode_check CHECK (
  payment_mode IN ('bank', 'upi', 'cash', 'cheque', 'neft', 'rtgs', 'imps', 'tds', 'other')
);

-- Receipt number, TDS and the legacy link are immutable once written.
CREATE OR REPLACE FUNCTION public.invoice_payments_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('pulse.invoice_payment_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'invoice payments are changed only by payment operations';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoice payments cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.tds_amount IS DISTINCT FROM OLD.tds_amount
       OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
       OR NEW.payment_mode IS DISTINCT FROM OLD.payment_mode
       OR NEW.transaction_reference IS DISTINCT FROM OLD.transaction_reference
       OR NEW.deposit_account_id IS DISTINCT FROM OLD.deposit_account_id
       OR NEW.deposit_account_label IS DISTINCT FROM OLD.deposit_account_label
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
       OR (OLD.client_id IS NOT NULL AND NEW.client_id IS DISTINCT FROM OLD.client_id)
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR (OLD.receipt_number IS NOT NULL AND NEW.receipt_number IS DISTINCT FROM OLD.receipt_number)
       OR NEW.source_transaction_id IS DISTINCT FROM OLD.source_transaction_id
    THEN
      RAISE EXCEPTION 'payment amount and identity are immutable';
    END IF;
    IF OLD.status = 'reversed' AND NEW.status IS DISTINCT FROM 'reversed' THEN
      RAISE EXCEPTION 'a reversed payment stays reversed';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM 'reversed' THEN
      RAISE EXCEPTION 'payment status can only move to reversed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Settlement: confirmed allocations + issued credit notes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoice_credited_amount(p_org_id uuid, p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT round(coalesce(sum(c.amount), 0), 2)
  FROM public.invoice_credit_notes c
  WHERE c.org_id = p_org_id
    AND c.invoice_id = p_invoice_id
    AND c.status = 'issued';
$$;
REVOKE ALL ON FUNCTION public.invoice_credited_amount(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Same body as 20271103213000 except the invoice limit: issued total minus
-- confirmed allocations minus issued credit notes.
CREATE OR REPLACE FUNCTION public.apply_invoice_payment_allocations(
  p_org_id uuid,
  p_payment_id uuid,
  p_allocations jsonb
)
RETURNS numeric
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.invoice_payments%ROWTYPE;
  v_item jsonb;
  v_invoice_id uuid;
  v_amount numeric;
  v_ids uuid[] := '{}'::uuid[];
  v_sum numeric := 0;
  v_used numeric := 0;
  v_received numeric := 0;
  v_credited numeric := 0;
  v_invoice record;
  v_seen int := 0;
  v_client uuid;
  v_allocation_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(872342, hashtext(p_org_id::text));

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'allocations must be a json array';
  END IF;
  IF jsonb_array_length(p_allocations) = 0 THEN
    RETURN 0;
  END IF;
  IF jsonb_array_length(p_allocations) > 200 THEN
    RAISE EXCEPTION 'too many allocations';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    BEGIN
      v_invoice_id := (v_item->>'invoice_id')::uuid;
      v_amount := round((v_item->>'amount')::numeric, 2);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'allocation amount must be positive';
    END;
    IF v_invoice_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'allocation amount must be positive';
    END IF;
    IF v_invoice_id = ANY(v_ids) THEN
      RAISE EXCEPTION 'duplicate invoice in allocation';
    END IF;
    v_ids := array_append(v_ids, v_invoice_id);
    v_sum := v_sum + v_amount;
  END LOOP;

  SELECT * INTO v_payment
  FROM public.invoice_payments
  WHERE id = p_payment_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found in this organization';
  END IF;
  IF v_payment.status <> 'recorded' THEN
    RAISE EXCEPTION 'payment is reversed';
  END IF;

  PERFORM 1
  FROM public.invoices i
  WHERE i.org_id = p_org_id
    AND i.id = ANY(v_ids)
  ORDER BY i.id
  FOR UPDATE;

  SELECT coalesce(sum(a.amount), 0)
    INTO v_used
  FROM public.invoice_payment_allocations a
  WHERE a.org_id = p_org_id
    AND a.payment_id = p_payment_id
    AND a.status = 'confirmed';

  IF round(v_used + v_sum, 2) > v_payment.amount THEN
    RAISE EXCEPTION 'allocation exceeds payment balance';
  END IF;

  v_client := v_payment.client_id;

  FOR v_invoice IN
    SELECT i.id, i.status, i.client_id, i.total_amount
    FROM public.invoices i
    WHERE i.org_id = p_org_id
      AND i.id = ANY(v_ids)
    ORDER BY i.id
  LOOP
    v_seen := v_seen + 1;
    IF v_invoice.status = 'draft' THEN
      RAISE EXCEPTION 'draft invoice cannot receive a payment';
    END IF;
    IF v_invoice.status NOT IN ('sent', 'paid') THEN
      RAISE EXCEPTION 'invoice is not issued';
    END IF;
    IF v_client IS NULL THEN
      v_client := v_invoice.client_id;
    ELSIF v_invoice.client_id IS DISTINCT FROM v_client THEN
      RAISE EXCEPTION 'allocations must belong to one client';
    END IF;

    SELECT coalesce(sum(a.amount), 0)
      INTO v_received
    FROM public.invoice_payment_allocations a
    WHERE a.org_id = p_org_id
      AND a.invoice_id = v_invoice.id
      AND a.status = 'confirmed';

    v_credited := public.invoice_credited_amount(p_org_id, v_invoice.id);

    SELECT round((elem->>'amount')::numeric, 2)
      INTO v_amount
    FROM jsonb_array_elements(p_allocations) elem
    WHERE (elem->>'invoice_id')::uuid = v_invoice.id;

    IF round(v_received + v_credited + v_amount, 2) > round(v_invoice.total_amount, 2) THEN
      RAISE EXCEPTION 'allocation exceeds invoice balance';
    END IF;
  END LOOP;

  IF v_seen <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'invoice not found in this organization';
  END IF;

  PERFORM public.invoice_payment_open_write();

  IF v_payment.client_id IS NULL AND v_client IS NOT NULL THEN
    UPDATE public.invoice_payments
    SET client_id = v_client,
        updated_at = now()
    WHERE id = v_payment.id;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    v_invoice_id := (v_item->>'invoice_id')::uuid;
    v_amount := round((v_item->>'amount')::numeric, 2);
    INSERT INTO public.invoice_payment_allocations (
      org_id, payment_id, invoice_id, amount, status, created_by
    ) VALUES (
      p_org_id, p_payment_id, v_invoice_id, v_amount, 'confirmed', auth.uid()
    )
    RETURNING id INTO v_allocation_id;

    INSERT INTO public.invoice_payment_events (
      org_id, payment_id, invoice_id, allocation_id, event_type, amount, payload, actor_id
    ) VALUES (
      p_org_id, p_payment_id, v_invoice_id, v_allocation_id, 'allocated', v_amount,
      jsonb_build_object('invoice_id', v_invoice_id, 'amount', v_amount),
      auth.uid()
    );
  END LOOP;

  RETURN v_sum;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_invoice_payment_allocations(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recording receipts (cash + optional TDS) and the trip-ledger link
-- ---------------------------------------------------------------------------

-- Shared body. Not callable by clients; the public RPCs below wrap it.
CREATE OR REPLACE FUNCTION public.record_invoice_payment_core(
  p_org_id uuid,
  p_client_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_tds_amount numeric,
  p_payment_mode text,
  p_transaction_reference text,
  p_deposit_account_id uuid,
  p_deposit_account_label text,
  p_notes text,
  p_idempotency_key text,
  p_allocations jsonb,
  p_source_transaction_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_mode text;
  v_reference text;
  v_amount numeric;
  v_tds numeric;
  v_label text;
  v_notes text;
  v_existing jsonb;
  v_payment_id uuid;
  v_receipt text;
  v_allocated numeric := 0;
  v_result jsonb;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  PERFORM pg_advisory_xact_lock(872342, hashtext(p_org_id::text));

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 128 THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  PERFORM pg_advisory_xact_lock(872343, hashtext(p_org_id::text || ':' || v_key));

  SELECT result
    INTO v_existing
  FROM public.invoice_payment_operations
  WHERE org_id = p_org_id
    AND operation = 'record'
    AND idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  v_amount := round(p_amount, 2);
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount >= 10000000000000 THEN
    RAISE EXCEPTION 'payment amount must be positive';
  END IF;
  v_tds := round(coalesce(p_tds_amount, 0), 2);
  IF v_tds < 0 OR v_tds >= v_amount THEN
    RAISE EXCEPTION 'TDS must be less than the receipt amount';
  END IF;
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'payment date is required';
  END IF;
  IF p_payment_date > (now() AT TIME ZONE 'Asia/Kolkata')::date + 1 THEN
    RAISE EXCEPTION 'payment date cannot be in the future';
  END IF;

  v_mode := lower(btrim(coalesce(p_payment_mode, '')));
  IF v_mode NOT IN ('bank', 'upi', 'cash', 'cheque', 'neft', 'rtgs', 'imps', 'tds', 'other') THEN
    RAISE EXCEPTION 'payment mode is invalid';
  END IF;
  IF v_mode = 'tds' AND v_tds <> 0 THEN
    RAISE EXCEPTION 'payment mode is invalid';
  END IF;

  v_reference := nullif(btrim(coalesce(p_transaction_reference, '')), '');
  IF v_reference IS NOT NULL AND char_length(v_reference) > 80 THEN
    RAISE EXCEPTION 'transaction reference is too long';
  END IF;
  IF v_reference IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.invoice_payments p
    WHERE p.org_id = p_org_id
      AND p.reference_key = lower(v_reference)
  ) THEN
    RAISE EXCEPTION 'duplicate transaction reference';
  END IF;

  v_label := nullif(btrim(coalesce(p_deposit_account_label, '')), '');
  IF v_label IS NOT NULL AND char_length(v_label) > 160 THEN
    RAISE EXCEPTION 'deposit account label is too long';
  END IF;
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'notes are too long';
  END IF;

  IF p_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND c.organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'client not found in this organization';
  END IF;

  IF p_deposit_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.entity_bank_accounts b
    WHERE b.id = p_deposit_account_id
      AND b.organization_id = p_org_id
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'deposit account is not in this organization';
  END IF;

  PERFORM public.invoice_payment_open_write();

  INSERT INTO public.invoice_payments (
    org_id, client_id, payment_date, amount, tds_amount, payment_mode, transaction_reference,
    deposit_account_id, deposit_account_label, notes, recorded_by, status, idempotency_key,
    source_transaction_id
  ) VALUES (
    p_org_id, p_client_id, p_payment_date, v_amount, v_tds, v_mode, v_reference,
    p_deposit_account_id, v_label, v_notes, auth.uid(), 'recorded', v_key,
    p_source_transaction_id
  )
  RETURNING id, receipt_number INTO v_payment_id, v_receipt;

  INSERT INTO public.invoice_payment_events (
    org_id, payment_id, event_type, amount, payload, actor_id
  ) VALUES (
    p_org_id,
    v_payment_id,
    'recorded',
    v_amount,
    jsonb_build_object(
      'payment_date', p_payment_date,
      'payment_mode', v_mode,
      'transaction_reference', v_reference,
      'amount', v_amount,
      'tds_amount', v_tds,
      'receipt_number', v_receipt,
      'source_transaction_id', p_source_transaction_id
    ),
    auth.uid()
  );

  v_allocated := public.apply_invoice_payment_allocations(p_org_id, v_payment_id, coalesce(p_allocations, '[]'::jsonb));

  v_result := jsonb_build_object(
    'payment_id', v_payment_id,
    'receipt_number', v_receipt,
    'amount', v_amount,
    'tds_amount', v_tds,
    'allocated', v_allocated,
    'unallocated', round(v_amount - v_allocated, 2),
    'status', 'recorded',
    'replayed', false
  );

  PERFORM public.invoice_payment_open_write();
  INSERT INTO public.invoice_payment_operations (
    org_id, operation, idempotency_key, payment_id, result
  ) VALUES (
    p_org_id, 'record', v_key, v_payment_id, v_result
  );

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.record_invoice_payment_core(uuid, uuid, date, numeric, numeric, text, text, uuid, text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- Existing signature, unchanged behaviour (no TDS).
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_org_id uuid,
  p_client_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_mode text,
  p_transaction_reference text,
  p_deposit_account_id uuid,
  p_deposit_account_label text,
  p_notes text,
  p_idempotency_key text,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.record_invoice_payment_core(
    p_org_id, p_client_id, p_payment_date, p_amount, 0, p_payment_mode, p_transaction_reference,
    p_deposit_account_id, p_deposit_account_label, p_notes, p_idempotency_key, p_allocations, NULL
  );
END;
$$;

-- Customer receipt: bank credit plus TDS the customer deducted. One receipt row;
-- amount = bank + TDS settles the invoices, bank matching uses amount - TDS.
CREATE OR REPLACE FUNCTION public.record_customer_receipt(
  p_org_id uuid,
  p_client_id uuid,
  p_payment_date date,
  p_bank_amount numeric,
  p_tds_amount numeric,
  p_payment_mode text,
  p_transaction_reference text,
  p_deposit_account_id uuid,
  p_deposit_account_label text,
  p_notes text,
  p_idempotency_key text,
  p_allocations jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank numeric := round(coalesce(p_bank_amount, 0), 2);
  v_tds numeric := round(coalesce(p_tds_amount, 0), 2);
BEGIN
  IF v_bank <= 0 THEN
    RAISE EXCEPTION 'payment amount must be positive';
  END IF;
  IF v_tds < 0 THEN
    RAISE EXCEPTION 'TDS must be less than the receipt amount';
  END IF;
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client is required';
  END IF;
  RETURN public.record_invoice_payment_core(
    p_org_id, p_client_id, p_payment_date, v_bank + v_tds, v_tds, p_payment_mode,
    p_transaction_reference, p_deposit_account_id, p_deposit_account_label, p_notes,
    p_idempotency_key, p_allocations, NULL
  );
END;
$$;

-- Explicit link: record an invoice payment for an existing trip-ledger customer
-- receipt. The trip-ledger row is not changed. Amount is the trip-ledger amount,
-- so the receipt cannot be counted twice or inflated; the link is one-to-one
-- while the payment stays recorded.
CREATE OR REPLACE FUNCTION public.link_trip_receipt_to_invoice_payment(
  p_org_id uuid,
  p_transaction_id uuid,
  p_client_id uuid,
  p_allocations jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn record;
  v_mode text;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  PERFORM pg_advisory_xact_lock(872342, hashtext(p_org_id::text));

  SELECT t.id, t.amount_in, t.transaction_date, t.ledger_category, t.contact_id, t.contact_type,
         t.payment_reference, t.description
    INTO v_txn
  FROM public.transactions t
  WHERE t.id = p_transaction_id
    AND t.organization_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trip ledger receipt not found in this organization';
  END IF;
  IF coalesce(v_txn.amount_in, 0) <= 0 THEN
    RAISE EXCEPTION 'trip ledger entry is not a receipt';
  END IF;
  IF p_client_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'client not found in this organization';
  END IF;
  IF coalesce(v_txn.contact_type, 'client') <> 'client'
     OR (v_txn.contact_id IS NOT NULL AND v_txn.contact_id <> p_client_id) THEN
    RAISE EXCEPTION 'trip ledger receipt belongs to another party';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoice_payments p
    WHERE p.org_id = p_org_id
      AND p.source_transaction_id = p_transaction_id
      AND p.status = 'recorded'
  ) THEN
    RAISE EXCEPTION 'trip ledger receipt is already linked';
  END IF;

  v_mode := CASE WHEN v_txn.ledger_category = 'tds_receivable' THEN 'tds' ELSE 'other' END;

  -- The trip-ledger reference may already be on another invoice payment; keep it
  -- in the notes so the duplicate-reference rule is not bypassed or tripped.
  RETURN public.record_invoice_payment_core(
    p_org_id,
    p_client_id,
    v_txn.transaction_date,
    v_txn.amount_in,
    0,
    v_mode,
    NULL,
    NULL,
    'Trip ledger',
    left(concat_ws(' · ', 'Linked from trip ledger', nullif(v_txn.payment_reference, ''), nullif(v_txn.description, '')), 2000),
    p_idempotency_key,
    p_allocations,
    p_transaction_id
  );
END;
$$;

-- Read-only: customer money-in rows on the trip ledger with their link status.
-- Nothing is allocated automatically.
CREATE OR REPLACE FUNCTION public.trip_ledger_receipts_for_invoicing(
  p_org_id uuid,
  p_client_id uuid,
  p_only_unlinked boolean DEFAULT true,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  transaction_id uuid,
  transaction_date date,
  amount numeric,
  ledger_category text,
  payment_reference text,
  description text,
  trip_id uuid,
  linked_payment_id uuid,
  linked_receipt_number text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'page size must be between 1 and 200';
  END IF;
  RETURN QUERY
  WITH src AS (
    SELECT t.id, t.transaction_date, round(t.amount_in, 2) AS amount, t.ledger_category,
           t.payment_reference, t.description, t.trip_id, t.created_at,
           lp.id AS payment_id, lp.receipt_number
    FROM public.transactions t
    LEFT JOIN LATERAL (
      SELECT p.id, p.receipt_number
      FROM public.invoice_payments p
      WHERE p.org_id = p_org_id
        AND p.source_transaction_id = t.id
        AND p.status = 'recorded'
      LIMIT 1
    ) lp ON true
    WHERE t.organization_id = p_org_id
      AND t.contact_type = 'client'
      AND t.contact_id = p_client_id
      AND coalesce(t.amount_in, 0) > 0
      AND coalesce(t.is_opening_balance, false) = false
      AND (NOT coalesce(p_only_unlinked, true) OR lp.id IS NULL)
  )
  SELECT r.id, r.transaction_date, r.amount, r.ledger_category, r.payment_reference,
         r.description, r.trip_id, r.payment_id, r.receipt_number, count(*) OVER ()
  FROM src r
  ORDER BY r.transaction_date DESC, r.created_at DESC, r.id
  LIMIT p_limit
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- Balances
-- ---------------------------------------------------------------------------

DROP FUNCTION public.invoice_payment_summaries(uuid, uuid[]);
CREATE FUNCTION public.invoice_payment_summaries(
  p_org_id uuid,
  p_invoice_ids uuid[]
)
RETURNS TABLE (
  invoice_id uuid,
  invoice_total numeric,
  amount_received numeric,
  amount_outstanding numeric,
  payment_status text,
  last_payment_date date,
  last_reference text,
  amount_credited numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_invoice_ids IS NULL OR cardinality(p_invoice_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_invoice_ids) > 500 THEN
    RAISE EXCEPTION 'too many invoices';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.total,
    s.received,
    CASE WHEN s.cancelled THEN 0::numeric ELSE greatest(round(s.total - s.received - s.credited, 2), 0) END,
    CASE
      WHEN s.cancelled THEN 'cancelled'
      WHEN s.received + s.credited <= 0 AND s.total > 0 THEN 'unpaid'
      WHEN s.received + s.credited > s.total THEN 'overpaid'
      WHEN s.received + s.credited < s.total THEN 'partially_paid'
      ELSE 'paid'
    END,
    s.last_date,
    s.last_ref,
    s.credited
  FROM (
    SELECT
      i.id,
      round(i.total_amount, 2) AS total,
      round(coalesce(paid.received, 0), 2) AS received,
      round(coalesce(cn.credited, 0), 2) AS credited,
      i.status IN ('cancelled', 'void') AS cancelled,
      last_pay.payment_date AS last_date,
      last_pay.transaction_reference AS last_ref
    FROM public.invoices i
    LEFT JOIN LATERAL (
      SELECT sum(a.amount) AS received
      FROM public.invoice_payment_allocations a
      WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'
    ) paid ON true
    LEFT JOIN LATERAL (
      SELECT sum(c.amount) AS credited
      FROM public.invoice_credit_notes c
      WHERE c.org_id = i.org_id AND c.invoice_id = i.id AND c.status = 'issued'
    ) cn ON true
    LEFT JOIN LATERAL (
      SELECT p.payment_date, p.transaction_reference
      FROM public.invoice_payment_allocations a
      JOIN public.invoice_payments p ON p.id = a.payment_id AND p.org_id = a.org_id
      WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT 1
    ) last_pay ON true
    WHERE i.org_id = p_org_id
      AND i.id = ANY(p_invoice_ids)
      AND i.status IN ('sent', 'paid', 'cancelled', 'void')
  ) s;
END;
$$;
REVOKE ALL ON FUNCTION public.invoice_payment_summaries(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_payment_summaries(uuid, uuid[]) TO authenticated;

-- Org-wide aging, one row per client with open receivables. Same anchor and
-- buckets as customer_invoice_receivables.
CREATE OR REPLACE FUNCTION public.org_receivables_aging(
  p_org_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  client_id uuid,
  client_name text,
  invoice_count integer,
  invoice_total numeric,
  amount_received numeric,
  amount_credited numeric,
  amount_outstanding numeric,
  current_amount numeric,
  days_1_30 numeric,
  days_31_60 numeric,
  days_61_90 numeric,
  days_over_90 numeric,
  oldest_due date,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'page size must be between 1 and 500';
  END IF;
  RETURN QUERY
  WITH issued AS (
    SELECT
      i.client_id,
      round(i.total_amount, 2) AS total,
      coalesce(i.due_date, i.invoice_date) AS anchor,
      round(coalesce(paid.received, 0), 2) AS received,
      round(coalesce(cn.credited, 0), 2) AS credited
    FROM public.invoices i
    LEFT JOIN LATERAL (
      SELECT sum(a.amount) AS received
      FROM public.invoice_payment_allocations a
      WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'
    ) paid ON true
    LEFT JOIN LATERAL (
      SELECT sum(c.amount) AS credited
      FROM public.invoice_credit_notes c
      WHERE c.org_id = i.org_id AND c.invoice_id = i.id AND c.status = 'issued'
    ) cn ON true
    WHERE i.org_id = p_org_id
      AND i.client_id IS NOT NULL
      AND i.status IN ('sent', 'paid')
  ),
  open_rows AS (
    SELECT issued.*, greatest(issued.total - issued.received - issued.credited, 0) AS open_amount,
           v_today - issued.anchor AS age
    FROM issued
  ),
  per_client AS (
    SELECT
      o.client_id,
      count(*)::integer AS invoice_count,
      sum(o.total) AS invoice_total,
      sum(o.received) AS received,
      sum(o.credited) AS credited,
      sum(o.open_amount) AS outstanding,
      coalesce(sum(o.open_amount) FILTER (WHERE o.age <= 0), 0) AS b0,
      coalesce(sum(o.open_amount) FILTER (WHERE o.age BETWEEN 1 AND 30), 0) AS b1,
      coalesce(sum(o.open_amount) FILTER (WHERE o.age BETWEEN 31 AND 60), 0) AS b2,
      coalesce(sum(o.open_amount) FILTER (WHERE o.age BETWEEN 61 AND 90), 0) AS b3,
      coalesce(sum(o.open_amount) FILTER (WHERE o.age > 90), 0) AS b4,
      min(o.anchor) FILTER (WHERE o.open_amount > 0) AS oldest
    FROM open_rows o
    GROUP BY o.client_id
    HAVING sum(o.open_amount) > 0
  )
  SELECT
    pc.client_id,
    coalesce(nullif(btrim(coalesce(c.legal_name, '')), ''), c.name),
    pc.invoice_count,
    round(pc.invoice_total, 2),
    round(pc.received, 2),
    round(pc.credited, 2),
    round(pc.outstanding, 2),
    round(pc.b0, 2), round(pc.b1, 2), round(pc.b2, 2), round(pc.b3, 2), round(pc.b4, 2),
    pc.oldest,
    count(*) OVER ()
  FROM per_client pc
  JOIN public.clients c ON c.id = pc.client_id AND c.organization_id = p_org_id
  ORDER BY pc.outstanding DESC, pc.client_id
  LIMIT p_limit
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

-- Same as 20271103220000 but ages against the India date, like org_receivables_aging,
-- so the two never disagree between 00:00 and 05:30 IST.
CREATE OR REPLACE FUNCTION public.customer_invoice_receivables(
  p_org_id uuid,
  p_client_id uuid
)
RETURNS TABLE (
  invoice_count integer,
  invoice_total numeric,
  amount_received numeric,
  amount_outstanding numeric,
  current_amount numeric,
  days_1_30 numeric,
  days_31_60 numeric,
  days_61_90 numeric,
  days_over_90 numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_client_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id AND c.organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'client not found in this organization';
  END IF;

  RETURN QUERY
  WITH issued AS (
    SELECT
      round(i.total_amount, 2) AS total,
      coalesce(i.due_date, i.invoice_date) AS anchor,
      round(coalesce(paid.received, 0), 2) AS received,
      round(coalesce(cn.credited, 0), 2) AS credited
    FROM public.invoices i
    LEFT JOIN LATERAL (
      SELECT sum(a.amount) AS received
      FROM public.invoice_payment_allocations a
      WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'
    ) paid ON true
    LEFT JOIN LATERAL (
      SELECT sum(c.amount) AS credited
      FROM public.invoice_credit_notes c
      WHERE c.org_id = i.org_id AND c.invoice_id = i.id AND c.status = 'issued'
    ) cn ON true
    WHERE i.org_id = p_org_id
      AND i.client_id = p_client_id
      AND i.status IN ('sent', 'paid')
  ),
  open_rows AS (
    SELECT issued.*, greatest(issued.total - issued.received - issued.credited, 0) AS open_amount,
           v_today - issued.anchor AS age
    FROM issued
  )
  SELECT
    count(*)::integer,
    coalesce(round(sum(o.total), 2), 0),
    coalesce(round(sum(o.received), 2), 0),
    coalesce(round(sum(o.open_amount), 2), 0),
    coalesce(round(sum(o.open_amount) FILTER (WHERE o.age <= 0), 2), 0),
    coalesce(round(sum(o.open_amount) FILTER (WHERE o.age BETWEEN 1 AND 30), 2), 0),
    coalesce(round(sum(o.open_amount) FILTER (WHERE o.age BETWEEN 31 AND 60), 2), 0),
    coalesce(round(sum(o.open_amount) FILTER (WHERE o.age BETWEEN 61 AND 90), 2), 0),
    coalesce(round(sum(o.open_amount) FILTER (WHERE o.age > 90), 2), 0)
  FROM open_rows o;
END;
$$;

-- Issued invoices with settlement, newest first. Bounded page.
CREATE OR REPLACE FUNCTION public.invoice_register(
  p_org_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_open_only boolean DEFAULT false
)
RETURNS TABLE (
  invoice_id uuid,
  invoice_number text,
  invoice_date date,
  due_date date,
  client_id uuid,
  client_name text,
  status text,
  invoice_total numeric,
  amount_received numeric,
  amount_credited numeric,
  amount_outstanding numeric,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'page size must be between 1 and 200';
  END IF;
  RETURN QUERY
  WITH page AS (
    SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.client_id, i.client_name,
           i.status, round(i.total_amount, 2) AS total, i.created_at,
           count(*) OVER () AS total_count,
           row_number() OVER (ORDER BY
             CASE WHEN coalesce(p_open_only, false) THEN coalesce(i.due_date, i.invoice_date) END ASC,
             i.invoice_date DESC, i.created_at DESC, i.id DESC) AS rn
    FROM public.invoices i
    WHERE i.org_id = p_org_id
      AND i.status IN ('sent', 'paid', 'cancelled', 'void')
      AND i.financial_year IS DISTINCT FROM 'DRAFT'
      AND (p_client_id IS NULL OR i.client_id = p_client_id)
      AND (p_from IS NULL OR i.invoice_date >= p_from)
      AND (p_to IS NULL OR i.invoice_date <= p_to)
      AND (
        NOT coalesce(p_open_only, false)
        OR (
          i.status IN ('sent', 'paid')
          AND round(i.total_amount, 2) > coalesce((
            SELECT sum(a.amount) FROM public.invoice_payment_allocations a
            WHERE a.org_id = p_org_id AND a.invoice_id = i.id AND a.status = 'confirmed'
          ), 0) + coalesce((
            SELECT sum(c.amount) FROM public.invoice_credit_notes c
            WHERE c.org_id = p_org_id AND c.invoice_id = i.id AND c.status = 'issued'
          ), 0)
        )
      )
    ORDER BY
      CASE WHEN coalesce(p_open_only, false) THEN coalesce(i.due_date, i.invoice_date) END ASC,
      i.invoice_date DESC, i.created_at DESC, i.id DESC
    LIMIT p_limit
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT
    page.id, page.invoice_number, page.invoice_date, page.due_date, page.client_id, page.client_name,
    CASE WHEN page.status IN ('cancelled', 'void') THEN 'cancelled' ELSE page.status END,
    page.total,
    round(coalesce(paid.received, 0), 2),
    round(coalesce(cn.credited, 0), 2),
    CASE WHEN page.status IN ('cancelled', 'void') THEN 0::numeric
         ELSE greatest(round(page.total - coalesce(paid.received, 0) - coalesce(cn.credited, 0), 2), 0) END,
    page.total_count
  FROM page
  LEFT JOIN LATERAL (
    SELECT sum(a.amount) AS received
    FROM public.invoice_payment_allocations a
    WHERE a.org_id = p_org_id AND a.invoice_id = page.id AND a.status = 'confirmed'
  ) paid ON true
  LEFT JOIN LATERAL (
    SELECT sum(c.amount) AS credited
    FROM public.invoice_credit_notes c
    WHERE c.org_id = p_org_id AND c.invoice_id = page.id AND c.status = 'issued'
  ) cn ON true
  ORDER BY page.rn;
END;
$$;

-- Receipts, newest first, with how much of each is applied.
CREATE OR REPLACE FUNCTION public.invoice_payment_register(
  p_org_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  payment_id uuid,
  receipt_number text,
  payment_date date,
  client_id uuid,
  client_name text,
  amount numeric,
  tds_amount numeric,
  bank_amount numeric,
  allocated numeric,
  unallocated numeric,
  payment_mode text,
  transaction_reference text,
  status text,
  bank_line_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := nullif(lower(btrim(coalesce(p_search, ''))), '');
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'page size must be between 1 and 200';
  END IF;
  RETURN QUERY
  WITH page AS (
    SELECT p.*, count(*) OVER () AS total_count
    FROM public.invoice_payments p
    WHERE p.org_id = p_org_id
      AND (p_client_id IS NULL OR p.client_id = p_client_id)
      AND (p_from IS NULL OR p.payment_date >= p_from)
      AND (p_to IS NULL OR p.payment_date <= p_to)
      AND (
        v_search IS NULL
        OR p.reference_key LIKE '%' || v_search || '%'
        OR lower(p.receipt_number) LIKE '%' || v_search || '%'
        OR (v_search ~ '^[0-9]+(\.[0-9]{1,2})?$' AND (p.amount = v_search::numeric OR p.amount - p.tds_amount = v_search::numeric))
      )
    ORDER BY p.payment_date DESC, p.created_at DESC, p.id DESC
    LIMIT p_limit
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT
    page.id, page.receipt_number, page.payment_date, page.client_id,
    coalesce(nullif(btrim(coalesce(c.legal_name, '')), ''), c.name),
    round(page.amount, 2), round(page.tds_amount, 2), round(page.amount - page.tds_amount, 2),
    round(coalesce(al.allocated, 0), 2),
    CASE WHEN page.status = 'reversed' THEN 0::numeric ELSE round(page.amount - coalesce(al.allocated, 0), 2) END,
    page.payment_mode, page.transaction_reference, page.status,
    bl.id,
    page.total_count
  FROM page
  LEFT JOIN public.clients c ON c.id = page.client_id AND c.organization_id = p_org_id
  LEFT JOIN LATERAL (
    SELECT sum(a.amount) AS allocated
    FROM public.invoice_payment_allocations a
    WHERE a.org_id = p_org_id AND a.payment_id = page.id AND a.status = 'confirmed'
  ) al ON true
  LEFT JOIN LATERAL (
    SELECT b.id FROM public.invoice_bank_lines b
    WHERE b.org_id = p_org_id AND b.matched_payment_id = page.id AND b.status = 'matched'
    LIMIT 1
  ) bl ON true
  ORDER BY page.payment_date DESC, page.created_at DESC, page.id DESC;
END;
$$;

-- Collections by month and mode. Reversed receipts are excluded.
CREATE OR REPLACE FUNCTION public.invoice_collections_summary(
  p_org_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  month date,
  payment_mode text,
  receipt_count integer,
  bank_amount numeric,
  tds_amount numeric,
  settled_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 1100 THEN
    RAISE EXCEPTION 'choose a period of up to three years';
  END IF;
  RETURN QUERY
  SELECT date_trunc('month', p.payment_date)::date,
         p.payment_mode,
         count(*)::integer,
         round(sum(p.amount - p.tds_amount), 2),
         round(sum(p.tds_amount), 2),
         round(sum(p.amount), 2)
  FROM public.invoice_payments p
  WHERE p.org_id = p_org_id
    AND p.status = 'recorded'
    AND p.payment_date BETWEEN p_from AND p_to
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

-- ---------------------------------------------------------------------------
-- Customer ledger with a running balance
-- ---------------------------------------------------------------------------

-- Every balance-affecting row for one client, oldest first, with the running
-- balance computed over the whole history (not the visible page). Internal.
CREATE OR REPLACE FUNCTION public.customer_ledger_rows(p_org_id uuid, p_client_id uuid)
RETURNS TABLE (
  entry_key text,
  entry_date date,
  sort_rank integer,
  entry_type text,
  entry_number text,
  reference text,
  description text,
  invoice_id uuid,
  payment_id uuid,
  credit_note_id uuid,
  debit numeric,
  credit numeric,
  created_at timestamptz,
  running_balance numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH cancel_events AS (
    SELECT DISTINCT ON (e.invoice_id)
      e.invoice_id,
      (e.created_at AT TIME ZONE 'Asia/Kolkata')::date AS cancel_date,
      e.reason,
      e.created_at
    FROM public.invoice_control_events e
    JOIN public.invoices i ON i.id = e.invoice_id AND i.org_id = p_org_id
    WHERE e.org_id = p_org_id
      AND e.event_type = 'cancelled'
      AND i.client_id = p_client_id
    ORDER BY e.invoice_id, e.created_at
  ),
  entries (entry_key, entry_date, sort_rank, entry_type, entry_number, reference,
           description, invoice_id, payment_id, credit_note_id, debit, credit, created_at) AS (
    -- Issued invoices, including ones later cancelled through cancel_customer_invoice.
    SELECT 'invoice:' || i.id::text, i.invoice_date, 10, 'invoice', i.invoice_number,
           i.invoice_number, 'Invoice issued', i.id, NULL::uuid, NULL::uuid,
           round(i.total_amount, 2), 0::numeric, i.created_at
    FROM public.invoices i
    WHERE i.org_id = p_org_id
      AND i.client_id = p_client_id
      AND (
        i.status IN ('sent', 'paid')
        OR (i.status IN ('cancelled', 'void') AND EXISTS (
          SELECT 1 FROM cancel_events ce WHERE ce.invoice_id = i.id
        ))
      )
    UNION ALL
    SELECT 'credit_note:' || c.id::text, c.credit_date, 20, 'credit_note', c.credit_number,
           i.invoice_number, c.reason, c.invoice_id, NULL::uuid, c.id,
           0::numeric, round(c.amount, 2), c.created_at
    FROM public.invoice_credit_notes c
    JOIN public.invoices i ON i.id = c.invoice_id AND i.org_id = p_org_id
    WHERE c.org_id = p_org_id
      AND c.client_id = p_client_id
      AND c.status = 'issued'
    UNION ALL
    -- Every receipt is credited on its date, reversed or not. A reversal is its own row.
    SELECT 'payment:' || p.id::text, p.payment_date, 30, 'payment', p.receipt_number,
           p.transaction_reference,
           CASE WHEN p.tds_amount > 0
             THEN 'Receipt · ' || p.payment_mode || ' · TDS ' || to_char(p.tds_amount, 'FM999999999990.00')
             ELSE 'Receipt · ' || p.payment_mode END,
           NULL::uuid, p.id, NULL::uuid,
           0::numeric, round(p.amount, 2), p.created_at
    FROM public.invoice_payments p
    WHERE p.org_id = p_org_id
      AND p.client_id = p_client_id
    UNION ALL
    -- Allocations move nothing between the customer and us; listed for the audit trail.
    SELECT 'allocation:' || a.id::text, (a.created_at AT TIME ZONE 'Asia/Kolkata')::date, 40,
           'allocation', p.receipt_number, i.invoice_number,
           'Applied ' || to_char(a.amount, 'FM999999999990.00') || ' to ' || i.invoice_number
             || CASE WHEN a.status = 'reversed' THEN ' (reversed)' ELSE '' END,
           a.invoice_id, a.payment_id, NULL::uuid,
           0::numeric, 0::numeric, a.created_at
    FROM public.invoice_payment_allocations a
    JOIN public.invoice_payments p ON p.id = a.payment_id AND p.org_id = p_org_id
    JOIN public.invoices i ON i.id = a.invoice_id AND i.org_id = p_org_id AND i.client_id = p_client_id
    WHERE a.org_id = p_org_id
      AND p.client_id = p_client_id
    UNION ALL
    SELECT 'reversal:' || p.id::text, (p.reversed_at AT TIME ZONE 'Asia/Kolkata')::date, 50,
           'reversal', p.receipt_number, p.transaction_reference,
           coalesce(p.reversal_reason, 'Receipt reversed'), NULL::uuid, p.id, NULL::uuid,
           round(p.amount, 2), 0::numeric, p.reversed_at
    FROM public.invoice_payments p
    WHERE p.org_id = p_org_id
      AND p.client_id = p_client_id
      AND p.status = 'reversed'
      AND p.reversed_at IS NOT NULL
    UNION ALL
    SELECT 'cancellation:' || i.id::text, ce.cancel_date, 60, 'cancellation', i.invoice_number,
           i.invoice_number, coalesce(ce.reason, 'Invoice cancelled'), i.id, NULL::uuid, NULL::uuid,
           0::numeric, round(i.total_amount, 2), ce.created_at
    FROM cancel_events ce
    JOIN public.invoices i ON i.id = ce.invoice_id AND i.org_id = p_org_id
  )
  SELECT e.*, sum(e.debit - e.credit) OVER (
           ORDER BY e.entry_date, e.sort_rank, e.created_at, e.entry_key
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS running_balance
  FROM entries e;
$$;
REVOKE ALL ON FUNCTION public.customer_ledger_rows(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Statement / ledger page. Rows are oldest first inside [p_from, p_to]; every row
-- carries the period's opening and closing balance and the full-history running
-- balance, so pages and filters cannot restart the balance.
CREATE OR REPLACE FUNCTION public.customer_ledger_entries(
  p_org_id uuid,
  p_client_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  entry_key text,
  entry_date date,
  entry_type text,
  entry_number text,
  reference text,
  description text,
  invoice_id uuid,
  payment_id uuid,
  credit_note_id uuid,
  debit numeric,
  credit numeric,
  running_balance numeric,
  opening_balance numeric,
  closing_balance numeric,
  period_debit numeric,
  period_credit numeric,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_client_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'client not found in this organization';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'page size must be between 1 and 500';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to < p_from THEN
    RAISE EXCEPTION 'statement end is before its start';
  END IF;

  RETURN QUERY
  WITH all_rows AS (
    SELECT * FROM public.customer_ledger_rows(p_org_id, p_client_id)
  ),
  bounds AS (
    SELECT
      coalesce(sum(r.debit - r.credit) FILTER (WHERE p_from IS NOT NULL AND r.entry_date < p_from), 0) AS opening,
      coalesce(sum(r.debit - r.credit) FILTER (WHERE p_to IS NULL OR r.entry_date <= p_to), 0) AS closing,
      coalesce(sum(r.debit) FILTER (WHERE (p_from IS NULL OR r.entry_date >= p_from) AND (p_to IS NULL OR r.entry_date <= p_to)), 0) AS pdebit,
      coalesce(sum(r.credit) FILTER (WHERE (p_from IS NULL OR r.entry_date >= p_from) AND (p_to IS NULL OR r.entry_date <= p_to)), 0) AS pcredit,
      count(*) FILTER (WHERE (p_from IS NULL OR r.entry_date >= p_from) AND (p_to IS NULL OR r.entry_date <= p_to)) AS n
    FROM all_rows r
  )
  SELECT r.entry_key, r.entry_date, r.entry_type, r.entry_number, r.reference, r.description,
         r.invoice_id, r.payment_id, r.credit_note_id, r.debit, r.credit, round(r.running_balance, 2),
         round(b.opening, 2), round(b.closing, 2), round(b.pdebit, 2), round(b.pcredit, 2), b.n
  FROM all_rows r
  CROSS JOIN bounds b
  WHERE (p_from IS NULL OR r.entry_date >= p_from)
    AND (p_to IS NULL OR r.entry_date <= p_to)
  ORDER BY r.entry_date, r.sort_rank, r.created_at, r.entry_key
  LIMIT p_limit
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

-- Older signature kept for the current client; now reads the corrected entries.
CREATE OR REPLACE FUNCTION public.customer_finance_ledger(
  p_org_id uuid,
  p_client_id uuid,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (
  entry_date date,
  entry_number text,
  entry_type text,
  reference text,
  debit numeric,
  credit numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'page size must be between 1 and 100';
  END IF;
  RETURN QUERY
  SELECT r.entry_date, r.entry_number, r.entry_type, r.reference, r.debit, r.credit
  FROM public.customer_ledger_rows(p_org_id, p_client_id) r
  WHERE r.entry_type <> 'allocation'
  ORDER BY r.entry_date DESC, r.sort_rank DESC, r.created_at DESC, r.entry_key DESC
  LIMIT p_limit
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- Receipt document
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoice_payment_receipt(
  p_org_id uuid,
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.invoice_payments%ROWTYPE;
  v_org public.organizations%ROWTYPE;
  v_client public.clients%ROWTYPE;
  v_allocated numeric;
  v_allocations jsonb;
  v_recorder text;
  v_reverser text;
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);

  SELECT * INTO v_payment
  FROM public.invoice_payments p
  WHERE p.id = p_payment_id AND p.org_id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found in this organization';
  END IF;

  SELECT * INTO v_org FROM public.organizations o WHERE o.id = p_org_id;
  IF v_payment.client_id IS NOT NULL THEN
    SELECT * INTO v_client FROM public.clients c
    WHERE c.id = v_payment.client_id AND c.organization_id = p_org_id;
  END IF;

  SELECT coalesce(sum(a.amount) FILTER (WHERE a.status = 'confirmed'), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'invoice_id', a.invoice_id,
           'invoice_number', i.invoice_number,
           'invoice_date', i.invoice_date,
           'invoice_total', round(i.total_amount, 2),
           'amount', round(a.amount, 2),
           'status', a.status,
           'allocated_at', a.created_at
         ) ORDER BY i.invoice_date, i.invoice_number, a.created_at), '[]'::jsonb)
    INTO v_allocated, v_allocations
  FROM public.invoice_payment_allocations a
  JOIN public.invoices i ON i.id = a.invoice_id AND i.org_id = a.org_id
  WHERE a.org_id = p_org_id AND a.payment_id = v_payment.id;

  SELECT coalesce(nullif(btrim(coalesce(pr.full_name, '')), ''), pr.email)
    INTO v_recorder
  FROM public.profiles pr WHERE pr.id = v_payment.recorded_by;
  IF v_payment.reversed_by IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(coalesce(pr.full_name, '')), ''), pr.email)
      INTO v_reverser
    FROM public.profiles pr WHERE pr.id = v_payment.reversed_by;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment.id,
    'receipt_number', v_payment.receipt_number,
    'status', v_payment.status,
    'payment_date', v_payment.payment_date,
    'payment_mode', v_payment.payment_mode,
    'transaction_reference', v_payment.transaction_reference,
    'deposit_account_label', v_payment.deposit_account_label,
    'notes', v_payment.notes,
    'amount', round(v_payment.amount, 2),
    'tds_amount', round(v_payment.tds_amount, 2),
    'bank_amount', round(v_payment.amount - v_payment.tds_amount, 2),
    'allocated', round(v_allocated, 2),
    'unallocated', CASE WHEN v_payment.status = 'reversed' THEN 0 ELSE round(v_payment.amount - v_allocated, 2) END,
    'allocations', v_allocations,
    'recorded_by', v_recorder,
    'recorded_at', v_payment.created_at,
    'reversed_at', v_payment.reversed_at,
    'reversed_by', v_reverser,
    'reversal_reason', v_payment.reversal_reason,
    'issuer', jsonb_build_object(
      'legal_name', v_org.name,
      'address_line', v_org.address_line,
      'locality', v_org.locality,
      'city', v_org.city,
      'state', v_org.state,
      'pincode', v_org.pincode,
      'gstin', CASE WHEN coalesce(v_org.gst_not_applicable, false) THEN NULL
                    ELSE nullif(upper(regexp_replace(coalesce(v_org.gstin, ''), '\s', '', 'g')), '') END,
      'business_pan', v_org.business_pan,
      'logo_url', v_org.logo_url
    ),
    'customer', CASE WHEN v_client.id IS NULL THEN NULL ELSE jsonb_build_object(
      'client_id', v_client.id,
      'legal_name', coalesce(nullif(btrim(coalesce(v_client.legal_name, '')), ''), v_client.name),
      'gstin', nullif(upper(regexp_replace(coalesce(v_client.gstin, ''), '\s', '', 'g')), ''),
      'pan', v_client.pan_number,
      'billing_address', coalesce(nullif(btrim(coalesce(v_client.billing_address, '')), ''),
                                  nullif(btrim(coalesce(v_client.registered_address, '')), ''),
                                  nullif(btrim(coalesce(v_client.address, '')), '')),
      'state', v_client.state,
      'phone', coalesce(nullif(btrim(coalesce(v_client.billing_contact_phone, '')), ''), v_client.phone),
      'email', coalesce(nullif(btrim(coalesce(v_client.billing_contact_email, '')), ''), v_client.email)
    ) END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Credit notes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoice_credit_notes_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('pulse.invoice_payment_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'credit notes are changed only by finance operations';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'credit notes cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Only issued -> void may change, and nothing currently performs it.
    IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status')
       OR NOT (OLD.status = 'issued' AND NEW.status IN ('issued', 'void'))
    THEN
      RAISE EXCEPTION 'an issued credit note is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_credit_note_lines_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'credit note lines are immutable';
  END IF;
  IF coalesce(current_setting('pulse.invoice_payment_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'credit notes are changed only by finance operations';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_credit_note_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_credit_note_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_credit_note_lines_guard();

CREATE INDEX invoice_credit_note_lines_note ON public.invoice_credit_note_lines (credit_note_id);
CREATE INDEX invoice_credit_notes_org_client ON public.invoice_credit_notes (org_id, client_id, credit_date);
CREATE INDEX invoice_credit_notes_org_date ON public.invoice_credit_notes (org_id, credit_date DESC, id);

ALTER TABLE public.invoice_credit_notes
  ADD CONSTRAINT invoice_credit_notes_tax_within_amount CHECK (tax_amount <= amount);
ALTER TABLE public.invoice_credit_note_lines
  ADD CONSTRAINT invoice_credit_note_lines_tax_within_amount CHECK (tax_amount <= amount);

-- Credit notes with their invoice, newest first.
CREATE OR REPLACE FUNCTION public.invoice_credit_note_register(
  p_org_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  credit_note_id uuid,
  credit_number text,
  credit_date date,
  status text,
  reason text,
  amount numeric,
  tax_amount numeric,
  invoice_id uuid,
  invoice_number text,
  invoice_date date,
  invoice_total numeric,
  client_id uuid,
  client_name text,
  issued_by text,
  created_at timestamptz,
  lines jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'page size must be between 1 and 200';
  END IF;
  RETURN QUERY
  WITH page AS (
    SELECT c.*, count(*) OVER () AS total_count
    FROM public.invoice_credit_notes c
    WHERE c.org_id = p_org_id
      AND (p_client_id IS NULL OR c.client_id = p_client_id)
    ORDER BY c.credit_date DESC, c.created_at DESC, c.id DESC
    LIMIT p_limit
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT page.id, page.credit_number, page.credit_date, page.status, page.reason,
         round(page.amount, 2), round(page.tax_amount, 2),
         page.invoice_id, i.invoice_number, i.invoice_date, round(i.total_amount, 2),
         page.client_id, coalesce(nullif(btrim(coalesce(cl.legal_name, '')), ''), cl.name),
         coalesce(nullif(btrim(coalesce(pr.full_name, '')), ''), pr.email),
         page.created_at,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object('description', l.description, 'amount', round(l.amount, 2), 'tax_amount', round(l.tax_amount, 2)) ORDER BY l.id)
           FROM public.invoice_credit_note_lines l
           WHERE l.credit_note_id = page.id AND l.org_id = p_org_id
         ), '[]'::jsonb),
         page.total_count
  FROM page
  JOIN public.invoices i ON i.id = page.invoice_id AND i.org_id = p_org_id
  LEFT JOIN public.clients cl ON cl.id = page.client_id AND cl.organization_id = p_org_id
  LEFT JOIN public.profiles pr ON pr.id = page.issued_by
  ORDER BY page.credit_date DESC, page.created_at DESC, page.id DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- Issued invoices: no direct financial edits, cancellation or deletion by clients
-- ---------------------------------------------------------------------------
-- Security-definer RPCs run as the function owner and are not affected. Client
-- roles keep editing drafts, and keep the notes / terms / document snapshot
-- updates the invoice book makes on issued rows.
CREATE OR REPLACE FUNCTION public.invoices_issued_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF coalesce(OLD.status, 'draft') <> 'draft' THEN
      RAISE EXCEPTION 'an issued invoice cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF coalesce(OLD.status, 'draft') = 'draft' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM 'cancelled' THEN
      RAISE EXCEPTION 'invoices are issued only through the issue operation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'issued invoice status changes only through finance operations';
  END IF;
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
     OR NEW.trip_ids IS DISTINCT FROM OLD.trip_ids
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.gst_rate IS DISTINCT FROM OLD.gst_rate
     OR NEW.cgst_amount IS DISTINCT FROM OLD.cgst_amount
     OR NEW.sgst_amount IS DISTINCT FROM OLD.sgst_amount
     OR NEW.igst_amount IS DISTINCT FROM OLD.igst_amount
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
  THEN
    RAISE EXCEPTION 'issued invoice amounts and identity are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_issued_guard
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.invoices_issued_guard();

-- ---------------------------------------------------------------------------
-- Bank reconciliation
-- ---------------------------------------------------------------------------

-- A receipt is matched to at most one bank line.
CREATE UNIQUE INDEX invoice_bank_lines_one_line_per_payment
  ON public.invoice_bank_lines (org_id, matched_payment_id)
  WHERE status = 'matched';

CREATE INDEX invoice_bank_lines_org_date
  ON public.invoice_bank_lines (org_id, txn_date DESC, id);

ALTER TABLE public.invoice_bank_lines
  ADD COLUMN matched_at timestamptz,
  ADD COLUMN matched_by uuid REFERENCES auth.users(id),
  ADD COLUMN import_event_id uuid;

ALTER TABLE public.invoice_bank_lines
  ADD CONSTRAINT invoice_bank_lines_matched_consistent CHECK (
    (status = 'matched' AND matched_payment_id IS NOT NULL)
    OR (status = 'unmatched' AND matched_payment_id IS NULL)
  );

CREATE INDEX invoice_control_events_bank
  ON public.invoice_control_events (org_id, created_at DESC)
  WHERE event_type LIKE 'bank_%';

CREATE OR REPLACE FUNCTION public.import_bank_statement(
  p_org_id uuid,
  p_rows jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_key text;
  v_existing jsonb;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_count integer := 0;
  v_import_key text;
  v_date date;
  v_debit numeric;
  v_credit numeric;
  v_reference text;
  v_description text;
  v_event uuid := gen_random_uuid();
  v_result jsonb;
  v_index integer := 0;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 128 THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  PERFORM pg_advisory_xact_lock(872344, hashtext(p_org_id::text));

  SELECT result INTO v_existing
  FROM public.invoice_finance_operations
  WHERE org_id = p_org_id AND operation = 'bank_import' AND idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'bank rows are required';
  END IF;
  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'too many bank rows';
  END IF;

  -- Validate every row first: a bad row rejects the whole file.
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_index := v_index + 1;
    BEGIN
      v_date := (v_row->>'txn_date')::date;
      v_debit := round(coalesce(nullif(btrim(coalesce(v_row->>'debit', '')), ''), '0')::numeric, 2);
      v_credit := round(coalesce(nullif(btrim(coalesce(v_row->>'credit', '')), ''), '0')::numeric, 2);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'bank row % has an invalid date or amount', v_index;
    END;
    IF v_date IS NULL THEN
      RAISE EXCEPTION 'bank row % has an invalid date or amount', v_index;
    END IF;
    IF v_debit < 0 OR v_credit < 0 OR (v_debit = 0 AND v_credit = 0) OR (v_debit > 0 AND v_credit > 0) THEN
      RAISE EXCEPTION 'bank row % needs exactly one of credit or debit', v_index;
    END IF;
    IF char_length(coalesce(v_row->>'reference', '')) > 120 OR char_length(coalesce(v_row->>'description', '')) > 500 THEN
      RAISE EXCEPTION 'bank row % text is too long', v_index;
    END IF;
  END LOOP;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_date := (v_row->>'txn_date')::date;
    v_debit := round(coalesce(nullif(btrim(coalesce(v_row->>'debit', '')), ''), '0')::numeric, 2);
    v_credit := round(coalesce(nullif(btrim(coalesce(v_row->>'credit', '')), ''), '0')::numeric, 2);
    v_reference := nullif(btrim(coalesce(v_row->>'reference', '')), '');
    v_description := nullif(btrim(coalesce(v_row->>'description', '')), '');
    -- Amounts are normalised so "100" and "100.00" are the same line.
    v_import_key := md5(concat_ws('|',
      v_date::text,
      lower(coalesce(v_reference, '')),
      to_char(v_credit, 'FM999999999990.00'),
      to_char(v_debit, 'FM999999999990.00'),
      lower(regexp_replace(coalesce(v_description, ''), '\s+', ' ', 'g'))
    ));
    INSERT INTO public.invoice_bank_lines (
      org_id, import_key, txn_date, reference, description, debit, credit, import_event_id
    ) VALUES (
      p_org_id, v_import_key, v_date, v_reference, v_description, v_debit, v_credit, v_event
    )
    ON CONFLICT (org_id, import_key) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  INSERT INTO public.invoice_control_events (id, org_id, event_type, payload, actor_id)
  VALUES (
    v_event, p_org_id, 'bank_import',
    jsonb_build_object('inserted', v_inserted, 'duplicates', v_skipped, 'rows', jsonb_array_length(p_rows)),
    auth.uid()
  );

  v_result := jsonb_build_object('inserted', v_inserted, 'duplicates', v_skipped, 'import_id', v_event, 'replayed', false);
  INSERT INTO public.invoice_finance_operations (org_id, operation, idempotency_key, result)
  VALUES (p_org_id, 'bank_import', v_key, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_bank_line(
  p_org_id uuid,
  p_line_id uuid,
  p_payment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line public.invoice_bank_lines%ROWTYPE;
  v_payment public.invoice_payments%ROWTYPE;
  v_bank numeric;
  v_difference numeric;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  PERFORM pg_advisory_xact_lock(872344, hashtext(p_org_id::text));

  SELECT * INTO v_line
  FROM public.invoice_bank_lines
  WHERE id = p_line_id AND org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank line not found in this organization';
  END IF;
  IF v_line.status <> 'unmatched' THEN
    RAISE EXCEPTION 'bank line is not open';
  END IF;
  IF v_line.credit <= 0 THEN
    RAISE EXCEPTION 'only a bank credit can be matched to a receipt';
  END IF;

  SELECT * INTO v_payment
  FROM public.invoice_payments p
  WHERE p.id = p_payment_id AND p.org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND OR v_payment.status <> 'recorded' THEN
    RAISE EXCEPTION 'payment not found in this organization';
  END IF;
  IF v_payment.payment_mode = 'tds' THEN
    RAISE EXCEPTION 'a TDS receipt has no bank credit';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoice_bank_lines b
    WHERE b.org_id = p_org_id AND b.matched_payment_id = p_payment_id AND b.status = 'matched'
  ) THEN
    RAISE EXCEPTION 'receipt is already matched to another bank line';
  END IF;

  v_bank := round(v_payment.amount - v_payment.tds_amount, 2);
  v_difference := round(v_line.credit - v_bank, 2);

  UPDATE public.invoice_bank_lines
  SET status = 'matched',
      matched_payment_id = p_payment_id,
      matched_at = now(),
      matched_by = auth.uid()
  WHERE id = p_line_id AND org_id = p_org_id;

  INSERT INTO public.invoice_control_events (org_id, event_type, payload, actor_id)
  VALUES (p_org_id, 'bank_matched', jsonb_build_object(
    'line_id', p_line_id,
    'payment_id', p_payment_id,
    'receipt_number', v_payment.receipt_number,
    'bank_credit', v_line.credit,
    'receipt_bank_amount', v_bank,
    'difference', v_difference
  ), auth.uid());

  RETURN jsonb_build_object(
    'line_id', p_line_id,
    'payment_id', p_payment_id,
    'status', 'matched',
    'difference', v_difference
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unmatch_bank_line(
  p_org_id uuid,
  p_line_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line public.invoice_bank_lines%ROWTYPE;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  PERFORM pg_advisory_xact_lock(872344, hashtext(p_org_id::text));
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'a reason is required to unmatch';
  END IF;
  SELECT * INTO v_line
  FROM public.invoice_bank_lines
  WHERE id = p_line_id AND org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank line not found in this organization';
  END IF;
  IF v_line.status <> 'matched' THEN
    RAISE EXCEPTION 'bank line is not matched';
  END IF;

  UPDATE public.invoice_bank_lines
  SET status = 'unmatched',
      matched_payment_id = NULL,
      matched_at = NULL,
      matched_by = NULL
  WHERE id = p_line_id AND org_id = p_org_id;

  INSERT INTO public.invoice_control_events (org_id, event_type, reason, payload, actor_id)
  VALUES (p_org_id, 'bank_unmatched', v_reason, jsonb_build_object(
    'line_id', p_line_id,
    'payment_id', v_line.matched_payment_id
  ), auth.uid());

  RETURN jsonb_build_object('line_id', p_line_id, 'status', 'unmatched');
END;
$$;

-- Bank lines with the matched receipt and any mismatch.
CREATE OR REPLACE FUNCTION public.bank_reconciliation_lines(
  p_org_id uuid,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  line_id uuid,
  txn_date date,
  reference text,
  description text,
  debit numeric,
  credit numeric,
  status text,
  matched_payment_id uuid,
  receipt_number text,
  receipt_date date,
  receipt_bank_amount numeric,
  receipt_status text,
  client_name text,
  difference numeric,
  warning text,
  matched_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'page size must be between 1 and 200';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('matched', 'unmatched', 'attention') THEN
    RAISE EXCEPTION 'status filter is invalid';
  END IF;
  RETURN QUERY
  WITH src AS (
    SELECT b.*, p.receipt_number AS r_number, p.payment_date AS r_date,
           round(p.amount - p.tds_amount, 2) AS r_bank, p.status AS r_status,
           coalesce(nullif(btrim(coalesce(c.legal_name, '')), ''), c.name) AS r_client,
           CASE WHEN p.id IS NULL THEN NULL ELSE round(b.credit - (p.amount - p.tds_amount), 2) END AS diff
    FROM public.invoice_bank_lines b
    LEFT JOIN public.invoice_payments p ON p.id = b.matched_payment_id AND p.org_id = b.org_id
    LEFT JOIN public.clients c ON c.id = p.client_id AND c.organization_id = b.org_id
    WHERE b.org_id = p_org_id
  ),
  flagged AS (
    SELECT src.*,
      CASE
        WHEN src.status = 'matched' AND src.r_status = 'reversed' THEN 'Matched receipt was reversed'
        WHEN src.status = 'matched' AND src.diff <> 0 THEN 'Bank credit and receipt differ'
        WHEN src.status = 'matched' AND abs(src.txn_date - src.r_date) > 7 THEN 'Dates are more than 7 days apart'
        ELSE NULL
      END AS warn
    FROM src
  ),
  filtered AS (
    SELECT flagged.*, count(*) OVER () AS total_count
    FROM flagged
    WHERE p_status IS NULL
       OR (p_status = 'attention' AND flagged.warn IS NOT NULL)
       OR (p_status <> 'attention' AND flagged.status = p_status)
  )
  SELECT f.id, f.txn_date, f.reference, f.description, f.debit, f.credit, f.status,
         f.matched_payment_id, f.r_number, f.r_date, f.r_bank, f.r_status, f.r_client,
         f.diff, f.warn, f.matched_at, f.total_count
  FROM filtered f
  ORDER BY f.txn_date DESC, f.created_at DESC, f.id DESC
  LIMIT p_limit
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

-- Bank import / match / unmatch history, newest first.
CREATE OR REPLACE FUNCTION public.bank_reconciliation_history(
  p_org_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  event_id uuid,
  event_type text,
  reason text,
  payload jsonb,
  actor_name text,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'page size must be between 1 and 200';
  END IF;
  RETURN QUERY
  SELECT e.id, e.event_type, e.reason, e.payload,
         coalesce(nullif(btrim(coalesce(pr.full_name, '')), ''), pr.email),
         e.created_at, count(*) OVER ()
  FROM public.invoice_control_events e
  LEFT JOIN public.profiles pr ON pr.id = e.actor_id
  WHERE e.org_id = p_org_id
    AND e.event_type LIKE 'bank_%'
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT p_limit
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

-- Invoice audit history (credit notes, cancellation, payments) for one invoice.
CREATE OR REPLACE FUNCTION public.invoice_finance_history(
  p_org_id uuid,
  p_invoice_id uuid
)
RETURNS TABLE (
  event_at timestamptz,
  event_type text,
  amount numeric,
  reference text,
  reason text,
  actor_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  RETURN QUERY
  SELECT h.at, h.kind, h.amount, h.ref, h.reason,
         coalesce(nullif(btrim(coalesce(pr.full_name, '')), ''), pr.email)
  FROM (
    SELECT e.created_at AS at, e.event_type AS kind,
           nullif(e.payload->>'amount', '')::numeric AS amount,
           e.payload->>'credit_note_id' AS ref, e.reason, e.actor_id
    FROM public.invoice_control_events e
    WHERE e.org_id = p_org_id AND e.invoice_id = p_invoice_id
    UNION ALL
    SELECT pe.created_at, 'payment_' || pe.event_type, pe.amount, p.receipt_number,
           pe.payload->>'reason', pe.actor_id
    FROM public.invoice_payment_events pe
    JOIN public.invoice_payments p ON p.id = pe.payment_id AND p.org_id = pe.org_id
    WHERE pe.org_id = p_org_id
      AND (pe.invoice_id = p_invoice_id
           OR (pe.event_type = 'reversed' AND EXISTS (
             SELECT 1 FROM public.invoice_payment_allocations a
             WHERE a.payment_id = pe.payment_id AND a.invoice_id = p_invoice_id AND a.org_id = p_org_id
           )))
  ) h
  LEFT JOIN public.profiles pr ON pr.id = h.actor_id
  ORDER BY h.at DESC
  LIMIT 200;
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.indian_financial_year(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.indian_financial_year(date) TO authenticated;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, uuid, date, numeric, text, text, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, uuid, date, numeric, text, text, uuid, text, text, text, jsonb) TO authenticated;

DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.record_customer_receipt(uuid, uuid, date, numeric, numeric, text, text, uuid, text, text, text, jsonb)',
    'public.link_trip_receipt_to_invoice_payment(uuid, uuid, uuid, jsonb, text)',
    'public.trip_ledger_receipts_for_invoicing(uuid, uuid, boolean, integer, integer)',
    'public.org_receivables_aging(uuid, integer, integer)',
    'public.invoice_register(uuid, uuid, date, date, integer, integer, boolean)',
    'public.invoice_payment_register(uuid, uuid, date, date, text, integer, integer)',
    'public.invoice_collections_summary(uuid, date, date)',
    'public.customer_ledger_entries(uuid, uuid, date, date, integer, integer)',
    'public.customer_finance_ledger(uuid, uuid, integer, integer)',
    'public.invoice_payment_receipt(uuid, uuid)',
    'public.invoice_credit_note_register(uuid, uuid, integer, integer)',
    'public.import_bank_statement(uuid, jsonb, text)',
    'public.match_bank_line(uuid, uuid, uuid)',
    'public.unmatch_bank_line(uuid, uuid, text)',
    'public.bank_reconciliation_lines(uuid, text, integer, integer)',
    'public.bank_reconciliation_history(uuid, integer, integer)',
    'public.invoice_finance_history(uuid, uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
  END LOOP;
END;
$$;

-- These run only inside the security-definer RPCs above.
REVOKE ALL ON FUNCTION public.invoice_settled_amount(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoices_issued_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_credit_note_lines_guard() FROM PUBLIC, anon, authenticated;

-- invoice_settled_amount (20271103220000) is still used by issue_invoice_credit_note
-- and cancel_customer_invoice; it already counts allocations + credit notes.
