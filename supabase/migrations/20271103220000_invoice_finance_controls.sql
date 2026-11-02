-- Credit notes, cancellation, customer ledger, bank matching, and delivery history.
-- Outstanding = issued total − confirmed allocations − issued credit notes.
-- Issued invoice totals are not rewritten. Cancelled invoices leave receivables.

SET LOCAL lock_timeout = '5s';

CREATE TABLE public.invoice_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  credit_number text NOT NULL,
  credit_date date NOT NULL,
  reason text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'void')),
  issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_credit_notes_number_unique UNIQUE (org_id, credit_number)
);

CREATE INDEX invoice_credit_notes_invoice
  ON public.invoice_credit_notes (org_id, invoice_id)
  WHERE status = 'issued';

CREATE TABLE public.invoice_credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.invoice_credit_notes(id),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0)
);

CREATE TABLE public.invoice_control_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  invoice_id uuid REFERENCES public.invoices(id),
  event_type text NOT NULL,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invoice_control_events_invoice
  ON public.invoice_control_events (org_id, invoice_id, created_at DESC);

CREATE TABLE public.invoice_finance_operations (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  operation text NOT NULL,
  idempotency_key text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, operation, idempotency_key)
);

CREATE TABLE public.invoice_bank_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  import_key text NOT NULL,
  txn_date date NOT NULL,
  reference text,
  description text,
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched')),
  matched_payment_id uuid REFERENCES public.invoice_payments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_bank_lines_import_unique UNIQUE (org_id, import_key)
);

CREATE INDEX invoice_bank_lines_open
  ON public.invoice_bank_lines (org_id, txn_date DESC)
  WHERE status = 'unmatched';

CREATE TABLE public.invoice_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  recipients text[] NOT NULL,
  subject text NOT NULL,
  body text,
  status text NOT NULL CHECK (status IN ('recorded', 'failed')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_email_events_once UNIQUE (org_id, idempotency_key)
);

CREATE TABLE public.invoice_reminder_rules (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  days_before integer NOT NULL DEFAULT 3 CHECK (days_before BETWEEN 0 AND 30),
  days_after integer NOT NULL DEFAULT 7 CHECK (days_after BETWEEN 1 AND 60),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_reminder_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  kind text NOT NULL CHECK (kind IN ('upcoming', 'overdue')),
  created_at timestamptz NOT NULL DEFAULT now()
);

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
  IF TG_OP = 'UPDATE' AND (
    NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
    OR NEW.credit_number IS DISTINCT FROM OLD.credit_number
  ) THEN
    RAISE EXCEPTION 'an issued credit note is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_credit_notes_guard
  BEFORE UPDATE OR DELETE ON public.invoice_credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_credit_notes_guard();

CREATE TRIGGER invoice_credit_notes_insert_guard
  BEFORE INSERT ON public.invoice_credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_credit_notes_guard();

CREATE OR REPLACE FUNCTION public.invoice_control_events_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'invoice control events are append-only';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_control_events_guard
  BEFORE UPDATE OR DELETE ON public.invoice_control_events
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_control_events_guard();

CREATE OR REPLACE FUNCTION public.invoice_settled_amount(p_org_id uuid, p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(
    coalesce((
      SELECT sum(a.amount)
      FROM public.invoice_payment_allocations a
      WHERE a.org_id = p_org_id
        AND a.invoice_id = p_invoice_id
        AND a.status = 'confirmed'
    ), 0)
    + coalesce((
      SELECT sum(c.amount)
      FROM public.invoice_credit_notes c
      WHERE c.org_id = p_org_id
        AND c.invoice_id = p_invoice_id
        AND c.status = 'issued'
    ), 0)
  , 2);
$$;

REVOKE ALL ON FUNCTION public.invoice_settled_amount(uuid, uuid) FROM PUBLIC, anon, authenticated;

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
    round(greatest(i.total_amount - public.invoice_settled_amount(i.org_id, i.id), 0), 2),
    CASE
      WHEN i.status IN ('cancelled', 'void') THEN 'cancelled'
      WHEN public.invoice_settled_amount(i.org_id, i.id) <= 0 AND round(i.total_amount, 2) > 0 THEN 'unpaid'
      WHEN public.invoice_settled_amount(i.org_id, i.id) > round(i.total_amount, 2) THEN 'overpaid'
      WHEN public.invoice_settled_amount(i.org_id, i.id) < round(i.total_amount, 2) THEN 'partially_paid'
      ELSE 'paid'
    END,
    last_pay.payment_date,
    last_pay.transaction_reference
  FROM public.invoices i
  LEFT JOIN LATERAL (
    SELECT sum(a.amount) AS received
    FROM public.invoice_payment_allocations a
    WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'
  ) paid ON true
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
    AND i.status IN ('sent', 'paid', 'cancelled', 'void');
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
    WHERE c.id = p_client_id AND c.organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'client not found in this organization';
  END IF;

  RETURN QUERY
  WITH issued AS (
    SELECT
      i.total_amount,
      COALESCE(i.due_date, i.invoice_date) AS anchor,
      public.invoice_settled_amount(i.org_id, i.id) AS settled,
      COALESCE(paid.received, 0) AS received
    FROM public.invoices i
    LEFT JOIN LATERAL (
      SELECT sum(a.amount) AS received
      FROM public.invoice_payment_allocations a
      WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'
    ) paid ON true
    WHERE i.org_id = p_org_id
      AND i.client_id = p_client_id
      AND i.status IN ('sent', 'paid')
  )
  SELECT
    count(*)::integer,
    coalesce(round(sum(issued.total_amount), 2), 0),
    coalesce(round(sum(issued.received), 2), 0),
    coalesce(round(sum(greatest(issued.total_amount - issued.settled, 0)), 2), 0),
    coalesce(round(sum(greatest(issued.total_amount - issued.settled, 0)) FILTER (
      WHERE (CURRENT_DATE - issued.anchor) <= 0
    ), 2), 0),
    coalesce(round(sum(greatest(issued.total_amount - issued.settled, 0)) FILTER (
      WHERE (CURRENT_DATE - issued.anchor) BETWEEN 1 AND 30
    ), 2), 0),
    coalesce(round(sum(greatest(issued.total_amount - issued.settled, 0)) FILTER (
      WHERE (CURRENT_DATE - issued.anchor) BETWEEN 31 AND 60
    ), 2), 0),
    coalesce(round(sum(greatest(issued.total_amount - issued.settled, 0)) FILTER (
      WHERE (CURRENT_DATE - issued.anchor) BETWEEN 61 AND 90
    ), 2), 0),
    coalesce(round(sum(greatest(issued.total_amount - issued.settled, 0)) FILTER (
      WHERE (CURRENT_DATE - issued.anchor) > 90
    ), 2), 0)
  FROM issued;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_invoice_credit_note(
  p_org_id uuid,
  p_invoice_id uuid,
  p_credit_date date,
  p_reason text,
  p_lines jsonb,
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
  v_invoice public.invoices%ROWTYPE;
  v_line jsonb;
  v_amount numeric := 0;
  v_tax numeric := 0;
  v_line_amount numeric;
  v_line_tax numeric;
  v_note_id uuid;
  v_number text;
  v_reason text;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  PERFORM pg_advisory_xact_lock(872342, hashtext(p_org_id::text));
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  SELECT result INTO v_existing
  FROM public.invoice_finance_operations
  WHERE org_id = p_org_id AND operation = 'credit' AND idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'credit note reason is required';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'credit note lines are required';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id AND org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found in this organization';
  END IF;
  IF v_invoice.status NOT IN ('sent', 'paid') THEN
    RAISE EXCEPTION 'credit note requires an issued invoice';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_amount := round(coalesce((v_line->>'amount')::numeric, 0), 2);
    v_line_tax := round(coalesce((v_line->>'tax_amount')::numeric, 0), 2);
    IF v_line_amount <= 0 OR v_line_tax < 0 THEN
      RAISE EXCEPTION 'credit line amount must be positive';
    END IF;
    IF nullif(btrim(coalesce(v_line->>'description', '')), '') IS NULL THEN
      RAISE EXCEPTION 'credit line description is required';
    END IF;
    v_amount := v_amount + v_line_amount;
    v_tax := v_tax + v_line_tax;
  END LOOP;

  IF round(v_amount, 2) > round(v_invoice.total_amount - public.invoice_settled_amount(p_org_id, p_invoice_id), 2) THEN
    RAISE EXCEPTION 'credit exceeds remaining invoice value';
  END IF;

  SELECT count(*) + 1 INTO v_line_amount
  FROM public.invoice_credit_notes
  WHERE org_id = p_org_id AND invoice_id = p_invoice_id;
  v_number := 'CN/' || v_invoice.invoice_number || '/' || lpad(v_line_amount::int::text, 2, '0');

  PERFORM public.invoice_payment_open_write();
  INSERT INTO public.invoice_credit_notes (
    org_id, client_id, invoice_id, credit_number, credit_date, reason, amount, tax_amount, issued_by
  ) VALUES (
    p_org_id, v_invoice.client_id, p_invoice_id, v_number, coalesce(p_credit_date, CURRENT_DATE),
    v_reason, round(v_amount, 2), round(v_tax, 2), auth.uid()
  ) RETURNING id INTO v_note_id;

  INSERT INTO public.invoice_credit_note_lines (credit_note_id, org_id, description, amount, tax_amount)
  SELECT v_note_id, p_org_id, btrim(value->>'description'),
         round((value->>'amount')::numeric, 2),
         round(coalesce((value->>'tax_amount')::numeric, 0), 2)
  FROM jsonb_array_elements(p_lines);

  INSERT INTO public.invoice_control_events (org_id, invoice_id, event_type, reason, payload, actor_id)
  VALUES (p_org_id, p_invoice_id, 'credit_issued', v_reason,
          jsonb_build_object('credit_note_id', v_note_id, 'amount', round(v_amount, 2)), auth.uid());

  v_existing := jsonb_build_object(
    'credit_note_id', v_note_id,
    'credit_number', v_number,
    'amount', round(v_amount, 2),
    'replayed', false
  );
  INSERT INTO public.invoice_finance_operations (org_id, operation, idempotency_key, result)
  VALUES (p_org_id, 'credit', v_key, v_existing);
  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_customer_invoice(
  p_org_id uuid,
  p_invoice_id uuid,
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
  v_existing jsonb;
  v_invoice public.invoices%ROWTYPE;
  v_reason text;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  PERFORM pg_advisory_xact_lock(872342, hashtext(p_org_id::text));
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  SELECT result INTO v_existing
  FROM public.invoice_finance_operations
  WHERE org_id = p_org_id AND operation = 'cancel' AND idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'cancellation reason is required';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id AND org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found in this organization';
  END IF;
  IF v_invoice.status = 'cancelled' THEN
    RAISE EXCEPTION 'invoice is already cancelled';
  END IF;
  IF v_invoice.status NOT IN ('sent', 'paid') THEN
    RAISE EXCEPTION 'only an issued invoice can be cancelled';
  END IF;
  IF public.invoice_settled_amount(p_org_id, p_invoice_id) > 0 THEN
    RAISE EXCEPTION 'invoice has payments or credits';
  END IF;

  UPDATE public.invoices
  SET status = 'cancelled'
  WHERE id = p_invoice_id AND org_id = p_org_id;

  INSERT INTO public.invoice_control_events (org_id, invoice_id, event_type, reason, actor_id)
  VALUES (p_org_id, p_invoice_id, 'cancelled', v_reason, auth.uid());

  v_existing := jsonb_build_object('invoice_id', p_invoice_id, 'status', 'cancelled', 'replayed', false);
  INSERT INTO public.invoice_finance_operations (org_id, operation, idempotency_key, result)
  VALUES (p_org_id, 'cancel', v_key, v_existing);
  RETURN v_existing;
END;
$$;

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
  SELECT e.entry_date, e.entry_number, e.entry_type, e.reference, e.debit, e.credit
  FROM (
    SELECT i.invoice_date AS entry_date, i.invoice_number AS entry_number, 'invoice'::text AS entry_type,
           i.invoice_number AS reference, round(i.total_amount, 2) AS debit, 0::numeric AS credit, i.created_at
    FROM public.invoices i
    WHERE i.org_id = p_org_id AND i.client_id = p_client_id AND i.status IN ('sent', 'paid', 'cancelled')
    UNION ALL
    SELECT p.payment_date, coalesce(p.transaction_reference, p.id::text), 'payment',
           p.transaction_reference, 0, round(p.amount, 2), p.created_at
    FROM public.invoice_payments p
    WHERE p.org_id = p_org_id AND p.client_id = p_client_id AND p.status = 'recorded'
    UNION ALL
    SELECT c.credit_date, c.credit_number, 'credit_note', c.reason, 0, round(c.amount, 2), c.created_at
    FROM public.invoice_credit_notes c
    WHERE c.org_id = p_org_id AND c.client_id = p_client_id AND c.status = 'issued'
    UNION ALL
    SELECT p.reversed_at::date, coalesce(p.transaction_reference, p.id::text), 'reversal',
           p.reversal_reason, round(p.amount, 2), 0, p.reversed_at
    FROM public.invoice_payments p
    WHERE p.org_id = p_org_id AND p.client_id = p_client_id AND p.status = 'reversed'
  ) e
  ORDER BY e.entry_date DESC, e.created_at DESC
  LIMIT p_limit
  OFFSET GREATEST(coalesce(p_offset, 0), 0);
END;
$$;

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
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_line_count integer := 0;
  v_import_key text;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'bank rows are required';
  END IF;
  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'too many bank rows';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_import_key := md5(concat_ws('|',
      v_row->>'txn_date',
      lower(btrim(coalesce(v_row->>'reference', ''))),
      v_row->>'credit',
      v_row->>'debit',
      lower(btrim(coalesce(v_row->>'description', '')))
    ));
    INSERT INTO public.invoice_bank_lines (
      org_id, import_key, txn_date, reference, description, debit, credit
    ) VALUES (
      p_org_id,
      v_import_key,
      (v_row->>'txn_date')::date,
      nullif(btrim(coalesce(v_row->>'reference', '')), ''),
      nullif(btrim(coalesce(v_row->>'description', '')), ''),
      round(coalesce((v_row->>'debit')::numeric, 0), 2),
      round(coalesce((v_row->>'credit')::numeric, 0), 2)
    )
    ON CONFLICT (org_id, import_key) DO NOTHING;
    GET DIAGNOSTICS v_line_count = ROW_COUNT;
    IF v_line_count > 0 THEN
      v_inserted := v_inserted + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  INSERT INTO public.invoice_control_events (org_id, event_type, payload, actor_id)
  VALUES (
    p_org_id,
    'bank_import',
    jsonb_build_object('inserted', v_inserted, 'duplicates', v_skipped, 'idempotency_key', v_key),
    auth.uid()
  );
  RETURN jsonb_build_object('inserted', v_inserted, 'duplicates', v_skipped);
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
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.invoice_payments p
    WHERE p.id = p_payment_id AND p.org_id = p_org_id AND p.status = 'recorded'
  ) THEN
    RAISE EXCEPTION 'payment not found in this organization';
  END IF;
  UPDATE public.invoice_bank_lines
  SET status = 'matched', matched_payment_id = p_payment_id
  WHERE id = p_line_id AND org_id = p_org_id AND status = 'unmatched';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'bank line is not open';
  END IF;
  INSERT INTO public.invoice_control_events (org_id, event_type, payload, actor_id)
  VALUES (p_org_id, 'bank_matched', jsonb_build_object('line_id', p_line_id, 'payment_id', p_payment_id), auth.uid());
  RETURN jsonb_build_object('line_id', p_line_id, 'payment_id', p_payment_id, 'status', 'matched');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_invoice_email(
  p_org_id uuid,
  p_invoice_id uuid,
  p_recipients text[],
  p_subject text,
  p_body text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  IF p_recipients IS NULL OR cardinality(p_recipients) = 0 THEN
    RAISE EXCEPTION 'a recipient is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = p_invoice_id AND i.org_id = p_org_id AND i.status IN ('sent', 'paid')
  ) THEN
    RAISE EXCEPTION 'invoice not found in this organization';
  END IF;
  INSERT INTO public.invoice_email_events (org_id, invoice_id, recipients, subject, body, status, idempotency_key)
  VALUES (p_org_id, p_invoice_id, p_recipients, btrim(p_subject), p_body, 'recorded', btrim(p_idempotency_key))
  ON CONFLICT (org_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_existing;
  RETURN jsonb_build_object('recorded', v_existing IS NOT NULL, 'duplicate', v_existing IS NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_invoice_reminder_rule(
  p_org_id uuid,
  p_enabled boolean,
  p_days_before integer,
  p_days_after integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  INSERT INTO public.invoice_reminder_rules (org_id, enabled, days_before, days_after, updated_at)
  VALUES (p_org_id, coalesce(p_enabled, false), p_days_before, p_days_after, now())
  ON CONFLICT (org_id) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      days_before = EXCLUDED.days_before,
      days_after = EXCLUDED.days_after,
      updated_at = now();
  RETURN jsonb_build_object('enabled', coalesce(p_enabled, false));
END;
$$;

REVOKE ALL ON FUNCTION public.save_invoice_reminder_rule(uuid, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_invoice_reminder_rule(uuid, boolean, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.issue_invoice_credit_note(uuid, uuid, date, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_customer_invoice(uuid, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.customer_finance_ledger(uuid, uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_bank_statement(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.match_bank_line(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_invoice_email(uuid, uuid, text[], text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.issue_invoice_credit_note(uuid, uuid, date, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_customer_invoice(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_finance_ledger(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_bank_statement(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_bank_line(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_invoice_email(uuid, uuid, text[], text, text, text) TO authenticated;

ALTER TABLE public.invoice_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_credit_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_control_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_bank_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminder_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminder_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_finance_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_credit_notes_select_member ON public.invoice_credit_notes
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY invoice_credit_note_lines_select_member ON public.invoice_credit_note_lines
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY invoice_control_events_select_member ON public.invoice_control_events
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY invoice_bank_lines_select_member ON public.invoice_bank_lines
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY invoice_email_events_select_member ON public.invoice_email_events
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY invoice_reminder_events_select_member ON public.invoice_reminder_events
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY invoice_reminder_rules_select_member ON public.invoice_reminder_rules
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY invoice_finance_operations_select_member ON public.invoice_finance_operations
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));

REVOKE ALL ON public.invoice_credit_notes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_credit_note_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_control_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_bank_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_email_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_reminder_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_reminder_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_finance_operations FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.invoice_credit_notes TO authenticated;
GRANT SELECT ON public.invoice_credit_note_lines TO authenticated;
GRANT SELECT ON public.invoice_control_events TO authenticated;
GRANT SELECT ON public.invoice_bank_lines TO authenticated;
GRANT SELECT ON public.invoice_email_events TO authenticated;
GRANT SELECT ON public.invoice_reminder_events TO authenticated;
GRANT SELECT ON public.invoice_reminder_rules TO authenticated;
GRANT SELECT ON public.invoice_finance_operations TO authenticated;
