-- Invoice payment tracking. Separate from invoice issuance.
-- Balances come from confirmed allocation rows. Issued invoice totals are not updated.
-- Payments are not inferred from trip ledger entries.
-- Reversal keeps the original payment and allocation rows and appends an event.
--
-- Query shape (see scripts/sql/invoice_payment_explain.sql):
--   invoice balance: index scan invoice_payment_allocations_confirmed_invoice
--   payment remainder: index scan invoice_payment_allocations_confirmed_payment
--   customer aging: index scan idx_invoices_client, then the allocation index per invoice

SET LOCAL lock_timeout = '5s';

CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  client_id uuid REFERENCES public.clients(id),
  payment_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  payment_mode text NOT NULL,
  transaction_reference text,
  reference_key text GENERATED ALWAYS AS (
    CASE
      WHEN transaction_reference IS NULL OR btrim(transaction_reference) = '' THEN NULL
      ELSE lower(btrim(transaction_reference))
    END
  ) STORED,
  deposit_account_id uuid REFERENCES public.entity_bank_accounts(id),
  deposit_account_label text,
  notes text,
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'recorded',
  idempotency_key text NOT NULL,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id),
  reversal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payments_amount_check CHECK (amount > 0 AND amount < 10000000000000),
  CONSTRAINT invoice_payments_mode_check CHECK (
    payment_mode IN ('bank', 'upi', 'cash', 'cheque', 'neft', 'rtgs', 'imps', 'other')
  ),
  CONSTRAINT invoice_payments_status_check CHECK (status IN ('recorded', 'reversed')),
  CONSTRAINT invoice_payments_org_idempotency UNIQUE (org_id, idempotency_key)
);

CREATE UNIQUE INDEX invoice_payments_org_reference
  ON public.invoice_payments (org_id, reference_key)
  WHERE reference_key IS NOT NULL;

CREATE INDEX invoice_payments_org_date
  ON public.invoice_payments (org_id, payment_date DESC, id);

COMMENT ON TABLE public.invoice_payments IS
  'Customer receipt. Amount is immutable. Status moves recorded -> reversed without deleting the row.';

CREATE TABLE public.invoice_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  payment_id uuid NOT NULL REFERENCES public.invoice_payments(id),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  CONSTRAINT invoice_payment_allocations_amount_check CHECK (amount > 0),
  CONSTRAINT invoice_payment_allocations_status_check CHECK (status IN ('confirmed', 'reversed'))
);

CREATE INDEX invoice_payment_allocations_confirmed_invoice
  ON public.invoice_payment_allocations (org_id, invoice_id)
  INCLUDE (amount)
  WHERE status = 'confirmed';

CREATE INDEX invoice_payment_allocations_confirmed_payment
  ON public.invoice_payment_allocations (org_id, payment_id)
  INCLUDE (amount)
  WHERE status = 'confirmed';

CREATE INDEX invoice_payment_allocations_payment
  ON public.invoice_payment_allocations (payment_id, id);

COMMENT ON TABLE public.invoice_payment_allocations IS
  'How much of a payment is applied to an issued invoice. Confirmed rows are the amount received.';

CREATE TABLE public.invoice_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  payment_id uuid NOT NULL REFERENCES public.invoice_payments(id),
  invoice_id uuid,
  allocation_id uuid,
  event_type text NOT NULL,
  amount numeric(14,2),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payment_events_type_check CHECK (
    event_type IN ('recorded', 'allocated', 'reversed')
  )
);

CREATE INDEX invoice_payment_events_payment
  ON public.invoice_payment_events (payment_id, created_at);

COMMENT ON TABLE public.invoice_payment_events IS
  'Append-only audit. Reversal inserts a row and does not rewrite the recorded event.';

CREATE TABLE public.invoice_payment_operations (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  payment_id uuid,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payment_operations_pk PRIMARY KEY (org_id, operation, idempotency_key),
  CONSTRAINT invoice_payment_operations_op_check CHECK (
    operation IN ('record', 'allocate', 'reverse')
  )
);

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

CREATE TRIGGER invoice_payments_guard
  BEFORE UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_payments_guard();

CREATE TRIGGER invoice_payments_insert_guard
  BEFORE INSERT ON public.invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_payments_guard();

CREATE OR REPLACE FUNCTION public.invoice_payment_allocations_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('pulse.invoice_payment_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'invoice payment allocations are changed only by payment operations';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoice payment allocations cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
       OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'allocation amount and identity are immutable';
    END IF;
    IF OLD.status = 'reversed' AND NEW.status IS DISTINCT FROM 'reversed' THEN
      RAISE EXCEPTION 'a reversed allocation stays reversed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_payment_allocations_guard
  BEFORE UPDATE OR DELETE ON public.invoice_payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_payment_allocations_guard();

CREATE TRIGGER invoice_payment_allocations_insert_guard
  BEFORE INSERT ON public.invoice_payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_payment_allocations_guard();

CREATE OR REPLACE FUNCTION public.invoice_payment_events_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'invoice payment events are append-only';
  END IF;
  IF coalesce(current_setting('pulse.invoice_payment_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'invoice payment events are written only by payment operations';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_payment_events_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_payment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_payment_events_guard();

CREATE OR REPLACE FUNCTION public.invoice_payment_operations_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'invoice payment operations are append-only';
  END IF;
  IF coalesce(current_setting('pulse.invoice_payment_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'invoice payment operations are written only by payment operations';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_payment_operations_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_payment_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_payment_operations_guard();

CREATE OR REPLACE FUNCTION public.assert_invoice_payment_reader(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_org_id IS NULL OR NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_invoice_payment_authority(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND (
        lower(om.role) IN ('owner', 'admin', 'finance', 'accountant')
        OR COALESCE(om.permissions, '{}'::jsonb) ? 'finance_manage'
        OR COALESCE(om.permissions, '{}'::jsonb) @> '["finance_manage"]'::jsonb
      )
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_payment_open_write()
RETURNS void
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('pulse.invoice_payment_write', 'on', true);
END;
$$;

REVOKE ALL ON FUNCTION public.invoice_payment_open_write() FROM PUBLIC, anon, authenticated;

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

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations)
  LOOP
    v_invoice_id := (v_item->>'invoice_id')::uuid;
    v_amount := round((v_item->>'amount')::numeric, 2);
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

  PERFORM 1
  FROM public.invoice_payment_allocations a
  WHERE a.org_id = p_org_id
    AND (a.invoice_id = ANY(v_ids) OR a.payment_id = p_payment_id)
  ORDER BY a.id
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

    SELECT round((elem->>'amount')::numeric, 2)
      INTO v_amount
    FROM jsonb_array_elements(p_allocations) elem
    WHERE (elem->>'invoice_id')::uuid = v_invoice.id;

    IF round(v_received + v_amount, 2) > round(v_invoice.total_amount, 2) THEN
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
      p_org_id,
      p_payment_id,
      v_invoice_id,
      v_allocation_id,
      'allocated',
      v_amount,
      jsonb_build_object('invoice_id', v_invoice_id, 'amount', v_amount),
      auth.uid()
    );
  END LOOP;

  RETURN v_sum;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_invoice_payment_allocations(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

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
DECLARE
  v_key text;
  v_mode text;
  v_reference text;
  v_amount numeric;
  v_label text;
  v_notes text;
  v_existing jsonb;
  v_payment_id uuid;
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
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'payment date is required';
  END IF;

  v_mode := lower(btrim(coalesce(p_payment_mode, '')));
  IF v_mode NOT IN ('bank', 'upi', 'cash', 'cheque', 'neft', 'rtgs', 'imps', 'other') THEN
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
    org_id, client_id, payment_date, amount, payment_mode, transaction_reference,
    deposit_account_id, deposit_account_label, notes, recorded_by, status, idempotency_key
  ) VALUES (
    p_org_id, p_client_id, p_payment_date, v_amount, v_mode, v_reference,
    p_deposit_account_id, v_label, v_notes, auth.uid(), 'recorded', v_key
  )
  RETURNING id INTO v_payment_id;

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
      'amount', v_amount
    ),
    auth.uid()
  );

  v_allocated := public.apply_invoice_payment_allocations(p_org_id, v_payment_id, coalesce(p_allocations, '[]'::jsonb));

  v_result := jsonb_build_object(
    'payment_id', v_payment_id,
    'amount', v_amount,
    'allocated', v_allocated,
    'unallocated', round(v_amount - v_allocated, 2),
    'status', 'recorded',
    'replayed', false
  );

  INSERT INTO public.invoice_payment_operations (
    org_id, operation, idempotency_key, payment_id, result
  ) VALUES (
    p_org_id, 'record', v_key, v_payment_id, v_result
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_invoice_payment(
  p_org_id uuid,
  p_payment_id uuid,
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
  v_key text;
  v_existing jsonb;
  v_allocated numeric;
  v_amount numeric;
  v_used numeric;
  v_result jsonb;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  PERFORM pg_advisory_xact_lock(872342, hashtext(p_org_id::text));

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 128 THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  PERFORM pg_advisory_xact_lock(872343, hashtext(p_org_id::text || ':allocate:' || v_key));

  SELECT result
    INTO v_existing
  FROM public.invoice_payment_operations
  WHERE org_id = p_org_id
    AND operation = 'allocate'
    AND idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'allocation amount must be positive';
  END IF;

  v_allocated := public.apply_invoice_payment_allocations(p_org_id, p_payment_id, p_allocations);

  SELECT amount INTO v_amount
  FROM public.invoice_payments
  WHERE id = p_payment_id
    AND org_id = p_org_id;

  SELECT coalesce(sum(amount), 0)
    INTO v_used
  FROM public.invoice_payment_allocations
  WHERE org_id = p_org_id
    AND payment_id = p_payment_id
    AND status = 'confirmed';

  v_result := jsonb_build_object(
    'payment_id', p_payment_id,
    'amount', v_amount,
    'allocated', v_used,
    'unallocated', round(v_amount - v_used, 2),
    'applied', v_allocated,
    'status', 'recorded',
    'replayed', false
  );

  PERFORM public.invoice_payment_open_write();
  INSERT INTO public.invoice_payment_operations (
    org_id, operation, idempotency_key, payment_id, result
  ) VALUES (
    p_org_id, 'allocate', v_key, p_payment_id, v_result
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_invoice_payment(
  p_org_id uuid,
  p_payment_id uuid,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_reason text;
  v_existing jsonb;
  v_payment public.invoice_payments%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  PERFORM pg_advisory_xact_lock(872342, hashtext(p_org_id::text));

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 128 THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  PERFORM pg_advisory_xact_lock(872343, hashtext(p_org_id::text || ':reverse:' || v_key));

  SELECT result
    INTO v_existing
  FROM public.invoice_payment_operations
  WHERE org_id = p_org_id
    AND operation = 'reverse'
    AND idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_payment
  FROM public.invoice_payments
  WHERE id = p_payment_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found in this organization';
  END IF;

  IF v_payment.status = 'reversed' THEN
    v_result := jsonb_build_object(
      'payment_id', v_payment.id,
      'status', 'reversed',
      'replayed', true
    );
    RETURN v_result;
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reversal reason is required';
  END IF;

  PERFORM 1
  FROM public.invoice_payment_allocations
  WHERE payment_id = v_payment.id
  ORDER BY id
  FOR UPDATE;

  PERFORM public.invoice_payment_open_write();

  UPDATE public.invoice_payments
  SET status = 'reversed',
      reversed_at = now(),
      reversed_by = auth.uid(),
      reversal_reason = v_reason,
      updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.invoice_payment_allocations
  SET status = 'reversed',
      reversed_at = now()
  WHERE payment_id = v_payment.id
    AND status = 'confirmed';

  INSERT INTO public.invoice_payment_events (
    org_id, payment_id, event_type, amount, payload, actor_id
  ) VALUES (
    p_org_id,
    v_payment.id,
    'reversed',
    v_payment.amount,
    jsonb_build_object(
      'reason', v_reason,
      'previous_status', 'recorded',
      'amount', v_payment.amount
    ),
    auth.uid()
  );

  v_result := jsonb_build_object(
    'payment_id', v_payment.id,
    'status', 'reversed',
    'replayed', false
  );

  INSERT INTO public.invoice_payment_operations (
    org_id, operation, idempotency_key, payment_id, result
  ) VALUES (
    p_org_id, 'reverse', v_key, v_payment.id, v_result
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_payment_summaries(
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
  last_reference text
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
    i.id,
    round(i.total_amount, 2),
    round(coalesce(paid.received, 0), 2),
    round(i.total_amount - coalesce(paid.received, 0), 2),
    CASE
      WHEN round(coalesce(paid.received, 0), 2) <= 0 AND round(i.total_amount, 2) > 0 THEN 'unpaid'
      WHEN round(coalesce(paid.received, 0), 2) > round(i.total_amount, 2) THEN 'overpaid'
      WHEN round(coalesce(paid.received, 0), 2) < round(i.total_amount, 2) THEN 'partially_paid'
      ELSE 'paid'
    END,
    last_pay.payment_date,
    last_pay.transaction_reference
  FROM public.invoices i
  LEFT JOIN LATERAL (
    SELECT sum(a.amount) AS received
    FROM public.invoice_payment_allocations a
    WHERE a.org_id = i.org_id
      AND a.invoice_id = i.id
      AND a.status = 'confirmed'
  ) paid ON true
  LEFT JOIN LATERAL (
    SELECT p.payment_date, p.transaction_reference
    FROM public.invoice_payment_allocations a
    JOIN public.invoice_payments p ON p.id = a.payment_id AND p.org_id = a.org_id
    WHERE a.org_id = i.org_id
      AND a.invoice_id = i.id
      AND a.status = 'confirmed'
    ORDER BY p.payment_date DESC, p.created_at DESC
    LIMIT 1
  ) last_pay ON true
  WHERE i.org_id = p_org_id
    AND i.id = ANY(p_invoice_ids)
    AND i.status IN ('sent', 'paid');
END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_payment_history(
  p_org_id uuid,
  p_invoice_id uuid
)
RETURNS TABLE (
  payment_id uuid,
  allocation_id uuid,
  payment_date date,
  allocation_amount numeric,
  payment_amount numeric,
  payment_mode text,
  transaction_reference text,
  deposit_account_label text,
  notes text,
  status text,
  reversed_at timestamptz,
  reversal_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  RETURN QUERY
  SELECT
    p.id,
    a.id,
    p.payment_date,
    a.amount,
    p.amount,
    p.payment_mode,
    p.transaction_reference,
    p.deposit_account_label,
    p.notes,
    p.status,
    p.reversed_at,
    p.reversal_reason
  FROM public.invoice_payment_allocations a
  JOIN public.invoice_payments p ON p.id = a.payment_id AND p.org_id = a.org_id
  WHERE a.org_id = p_org_id
    AND a.invoice_id = p_invoice_id
  ORDER BY p.payment_date DESC, a.created_at DESC;
END;
$$;

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
BEGIN
  PERFORM public.assert_invoice_payment_reader(p_org_id);
  IF p_client_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND c.organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'client not found in this organization';
  END IF;

  RETURN QUERY
  WITH issued AS (
    SELECT
      i.total_amount,
      COALESCE(i.due_date, i.invoice_date) AS anchor,
      COALESCE(paid.received, 0) AS received
    FROM public.invoices i
    LEFT JOIN LATERAL (
      SELECT sum(a.amount) AS received
      FROM public.invoice_payment_allocations a
      WHERE a.org_id = i.org_id
        AND a.invoice_id = i.id
        AND a.status = 'confirmed'
    ) paid ON true
    WHERE i.org_id = p_org_id
      AND i.client_id = p_client_id
      AND i.status IN ('sent', 'paid')
  )
  SELECT
    count(*)::integer,
    coalesce(round(sum(issued.total_amount), 2), 0),
    coalesce(round(sum(issued.received), 2), 0),
    coalesce(round(sum(issued.total_amount - issued.received), 2), 0),
    coalesce(round(sum(issued.total_amount - issued.received) FILTER (
      WHERE (CURRENT_DATE - issued.anchor) <= 0
    ), 2), 0),
    coalesce(round(sum(issued.total_amount - issued.received) FILTER (
      WHERE (CURRENT_DATE - issued.anchor) BETWEEN 1 AND 30
    ), 2), 0),
    coalesce(round(sum(issued.total_amount - issued.received) FILTER (
      WHERE (CURRENT_DATE - issued.anchor) BETWEEN 31 AND 60
    ), 2), 0),
    coalesce(round(sum(issued.total_amount - issued.received) FILTER (
      WHERE (CURRENT_DATE - issued.anchor) BETWEEN 61 AND 90
    ), 2), 0),
    coalesce(round(sum(issued.total_amount - issued.received) FILTER (
      WHERE (CURRENT_DATE - issued.anchor) > 90
    ), 2), 0)
  FROM issued;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_invoice_payment_reader(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_invoice_payment_authority(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, uuid, date, numeric, text, text, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.allocate_invoice_payment(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_invoice_payment(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invoice_payment_summaries(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invoice_payment_history(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_invoice_receivables(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, uuid, date, numeric, text, text, uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_invoice_payment(uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_invoice_payment(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_payment_summaries(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_payment_history(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_invoice_receivables(uuid, uuid) TO authenticated;

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payment_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_payments_select_member
  ON public.invoice_payments
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY invoice_payment_allocations_select_member
  ON public.invoice_payment_allocations
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY invoice_payment_events_select_member
  ON public.invoice_payment_events
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY invoice_payment_operations_select_member
  ON public.invoice_payment_operations
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

REVOKE ALL ON public.invoice_payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_payment_allocations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_payment_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_payment_operations FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.invoice_payments TO authenticated;
GRANT SELECT ON public.invoice_payment_allocations TO authenticated;
GRANT SELECT ON public.invoice_payment_events TO authenticated;
GRANT SELECT ON public.invoice_payment_operations TO authenticated;

COMMENT ON FUNCTION public.record_invoice_payment(uuid, uuid, date, numeric, text, text, uuid, text, text, text, jsonb) IS
  'Records a customer payment and optional allocations. Does not update invoices.total_amount or invoices.status.';
COMMENT ON FUNCTION public.invoice_payment_summaries(uuid, uuid[]) IS
  'Amount received is the sum of confirmed allocations. Outstanding is the issued total minus that sum.';
