-- Credit-note GST breakup, customer credit and refunds.
--
-- Credit notes
--   * tax is derived on the server from the invoice (single GST rate, CGST+SGST or
--     IGST, the same half-up paise rounding as the invoice engine); a caller-sent
--     component must match it exactly
--   * ceilings: total credit <= issued invoice total; taxable and every tax
--     component <= what the invoice still carries after earlier GST credit notes;
--     the credit that closes the taxable value takes the remaining tax exactly
--   * "without GST" (commercial) credit notes keep the earlier behaviour: value only
--   * a credit note may now be issued on a paid invoice; the part above the open
--     balance becomes customer credit. It is not applied to other invoices.
-- Refunds
--   * money returned to the customer, from either the unapplied part of a receipt
--     or the customer credit created by a credit note on that invoice
--   * never more than the refundable balance; immutable; corrected only by an
--     explicit reversal; numbered RFD/<FY>/<seq>
--   * invoice settlement = confirmed allocations + issued credit notes
--     - refunds of credit-note credit on that invoice
--   * a receipt with recorded refunds cannot be reversed until they are reversed
-- Nothing existing is rewritten: earlier credit notes are marked 'legacy'.

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Credit notes: GST components
-- ---------------------------------------------------------------------------

ALTER TABLE public.invoice_credit_notes
  ADD COLUMN tax_treatment text NOT NULL DEFAULT 'legacy',
  ADD COLUMN supply_type text,
  ADD COLUMN gst_rate numeric(6,3),
  ADD COLUMN cgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN sgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN igst_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN taxable_amount numeric(14,2) GENERATED ALWAYS AS (amount - tax_amount) STORED;

-- New rows always state their treatment.
ALTER TABLE public.invoice_credit_notes ALTER COLUMN tax_treatment DROP DEFAULT;

ALTER TABLE public.invoice_credit_notes
  ADD CONSTRAINT invoice_credit_notes_tax_treatment_check
    CHECK (tax_treatment IN ('gst', 'no_gst', 'legacy')),
  ADD CONSTRAINT invoice_credit_notes_gst_breakup_check CHECK (
    (tax_treatment = 'gst'
      AND supply_type IN ('intra', 'inter')
      AND gst_rate > 0
      AND cgst_amount >= 0 AND sgst_amount >= 0 AND igst_amount >= 0
      AND tax_amount = cgst_amount + sgst_amount + igst_amount
      AND ((supply_type = 'intra' AND igst_amount = 0)
        OR (supply_type = 'inter' AND cgst_amount = 0 AND sgst_amount = 0)))
    OR (tax_treatment = 'no_gst'
      AND supply_type IS NULL AND gst_rate IS NULL
      AND tax_amount = 0 AND cgst_amount = 0 AND sgst_amount = 0 AND igst_amount = 0)
    OR (tax_treatment = 'legacy'
      AND cgst_amount = 0 AND sgst_amount = 0 AND igst_amount = 0)
  );

COMMENT ON COLUMN public.invoice_credit_notes.tax_treatment IS
  'gst: tax derived from the invoice (components stored). no_gst: value-only commercial credit. legacy: issued before 20271103234500, no breakup.';

ALTER TABLE public.invoice_credit_note_lines
  ADD COLUMN cgst_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
  ADD COLUMN sgst_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
  ADD COLUMN igst_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (igst_amount >= 0);

-- ---------------------------------------------------------------------------
-- Refunds
-- ---------------------------------------------------------------------------

CREATE TABLE public.invoice_refund_sequences (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  financial_year text NOT NULL,
  last_seq integer NOT NULL,
  PRIMARY KEY (org_id, financial_year)
);
ALTER TABLE public.invoice_refund_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_refund_sequences FROM PUBLIC, anon, authenticated;

CREATE TABLE public.invoice_customer_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  refund_number text NOT NULL,
  refund_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  source_type text NOT NULL,
  payment_id uuid REFERENCES public.invoice_payments(id),
  credit_note_id uuid REFERENCES public.invoice_credit_notes(id),
  invoice_id uuid REFERENCES public.invoices(id),
  refund_mode text NOT NULL,
  transaction_reference text,
  notes text,
  status text NOT NULL DEFAULT 'recorded',
  idempotency_key text NOT NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id),
  reversal_reason text,
  CONSTRAINT invoice_customer_refunds_amount_check CHECK (amount > 0 AND amount < 10000000000000),
  CONSTRAINT invoice_customer_refunds_mode_check CHECK (
    refund_mode IN ('bank', 'upi', 'cash', 'cheque', 'neft', 'rtgs', 'imps', 'other')
  ),
  CONSTRAINT invoice_customer_refunds_status_check CHECK (status IN ('recorded', 'reversed')),
  CONSTRAINT invoice_customer_refunds_source_check CHECK (
    (source_type = 'payment' AND payment_id IS NOT NULL AND credit_note_id IS NULL AND invoice_id IS NULL)
    OR (source_type = 'credit_note' AND credit_note_id IS NOT NULL AND invoice_id IS NOT NULL AND payment_id IS NULL)
  ),
  CONSTRAINT invoice_customer_refunds_reversal_check CHECK (
    (status = 'recorded' AND reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL)
    OR (status = 'reversed' AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL)
  ),
  CONSTRAINT invoice_customer_refunds_number_unique UNIQUE (org_id, refund_number),
  CONSTRAINT invoice_customer_refunds_idempotency UNIQUE (org_id, idempotency_key)
);

COMMENT ON TABLE public.invoice_customer_refunds IS
  'Money returned to a customer from an unapplied receipt or from credit-note customer credit. Immutable; status moves recorded -> reversed.';

CREATE INDEX invoice_customer_refunds_payment
  ON public.invoice_customer_refunds (org_id, payment_id) INCLUDE (amount)
  WHERE status = 'recorded' AND source_type = 'payment';
CREATE INDEX invoice_customer_refunds_invoice
  ON public.invoice_customer_refunds (org_id, invoice_id) INCLUDE (amount)
  WHERE status = 'recorded' AND source_type = 'credit_note';
CREATE INDEX invoice_customer_refunds_note
  ON public.invoice_customer_refunds (org_id, credit_note_id) INCLUDE (amount)
  WHERE status = 'recorded' AND source_type = 'credit_note';
CREATE INDEX invoice_customer_refunds_client_date
  ON public.invoice_customer_refunds (org_id, client_id, refund_date, id);
CREATE INDEX invoice_customer_refunds_org_date
  ON public.invoice_customer_refunds (org_id, refund_date DESC, id);

CREATE OR REPLACE FUNCTION public.invoice_customer_refunds_assign_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fy text := public.indian_financial_year(NEW.refund_date);
  v_seq integer;
BEGIN
  INSERT INTO public.invoice_refund_sequences AS s (org_id, financial_year, last_seq)
  VALUES (NEW.org_id, v_fy, 1)
  ON CONFLICT (org_id, financial_year)
  DO UPDATE SET last_seq = s.last_seq + 1
  RETURNING last_seq INTO v_seq;
  NEW.refund_number := 'RFD/' || v_fy || '/' || lpad(v_seq::text, 5, '0');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invoice_customer_refunds_assign_number() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.invoice_customer_refunds_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(current_setting('pulse.invoice_payment_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'refunds are changed only by finance operations';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'refunds cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.status = 'recorded' AND NEW.status = 'reversed')
       OR (to_jsonb(NEW) - ARRAY['status', 'reversed_at', 'reversed_by', 'reversal_reason'])
          IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'reversed_at', 'reversed_by', 'reversal_reason'])
    THEN
      RAISE EXCEPTION 'a refund is immutable; reverse it instead';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.invoice_customer_refunds_guard() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER invoice_customer_refunds_assign_number
  BEFORE INSERT ON public.invoice_customer_refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_customer_refunds_assign_number();

CREATE TRIGGER invoice_customer_refunds_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_customer_refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_customer_refunds_guard();

ALTER TABLE public.invoice_customer_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_customer_refunds_select_member ON public.invoice_customer_refunds
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
REVOKE ALL ON public.invoice_customer_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invoice_customer_refunds TO authenticated;

-- ---------------------------------------------------------------------------
-- Settlement helpers (internal)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invoice_payment_refunded_amount(p_org_id uuid, p_payment_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT round(coalesce(sum(r.amount), 0), 2)
  FROM public.invoice_customer_refunds r
  WHERE r.org_id = p_org_id
    AND r.payment_id = p_payment_id
    AND r.source_type = 'payment'
    AND r.status = 'recorded';
$$;
REVOKE ALL ON FUNCTION public.invoice_payment_refunded_amount(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Refunds of credit-note customer credit on one invoice.
CREATE OR REPLACE FUNCTION public.invoice_credit_refunded_amount(p_org_id uuid, p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT round(coalesce(sum(r.amount), 0), 2)
  FROM public.invoice_customer_refunds r
  WHERE r.org_id = p_org_id
    AND r.invoice_id = p_invoice_id
    AND r.source_type = 'credit_note'
    AND r.status = 'recorded';
$$;
REVOKE ALL ON FUNCTION public.invoice_credit_refunded_amount(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Credit notes with a server-derived GST breakup
-- ---------------------------------------------------------------------------
-- p_tax_treatment:
--   'gst'    lines carry taxable_amount; CGST+SGST or IGST at the invoice rate.
--            Optional cgst_amount / sgst_amount / igst_amount / tax_amount on a line
--            are checked against the server figures and rejected on any difference.
--   'no_gst' lines carry amount; no tax (value-only commercial credit).
CREATE OR REPLACE FUNCTION public.issue_invoice_credit_note(
  p_org_id uuid,
  p_invoice_id uuid,
  p_credit_date date,
  p_reason text,
  p_tax_treatment text,
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
  v_reason text;
  v_treatment text := lower(btrim(coalesce(p_tax_treatment, '')));
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_date date;
  v_line jsonb;
  v_raw numeric;
  v_value numeric;
  v_n integer;
  v_i integer := 0;
  v_inv_cgst numeric;
  v_inv_sgst numeric;
  v_inv_igst numeric;
  v_inv_tax numeric;
  v_inv_base numeric;
  v_supply text;
  v_rate numeric;
  v_rates numeric[];
  v_prior_total numeric;
  v_prior_taxable numeric;
  v_prior_cgst numeric;
  v_prior_sgst numeric;
  v_prior_igst numeric;
  v_prior_legacy_taxed integer;
  v_prior_count integer;
  v_taxables numeric[] := '{}';
  v_amounts numeric[] := '{}';
  v_descs text[] := '{}';
  v_total_taxable numeric := 0;
  v_total numeric := 0;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_igst numeric := 0;
  v_cum numeric := 0;
  v_l_cgst numeric[] := '{}';
  v_l_sgst numeric[] := '{}';
  v_l_igst numeric[] := '{}';
  v_c numeric;
  v_s numeric;
  v_g numeric;
  v_acc_c numeric := 0;
  v_acc_s numeric := 0;
  v_acc_g numeric := 0;
  v_received numeric;
  v_credit_refunded numeric;
  v_open_before numeric;
  v_customer_credit numeric;
  v_note_id uuid;
  v_number text;
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
  IF v_treatment NOT IN ('gst', 'no_gst') THEN
    RAISE EXCEPTION 'choose a credit note with GST or without GST';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'credit note lines are required';
  END IF;
  v_n := jsonb_array_length(p_lines);
  IF v_n > 50 THEN
    RAISE EXCEPTION 'a credit note has at most 50 lines';
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

  v_date := coalesce(p_credit_date, v_today);
  IF v_date > v_today + 1 THEN
    RAISE EXCEPTION 'credit note date cannot be in the future';
  END IF;
  IF v_invoice.invoice_date IS NOT NULL AND v_date < v_invoice.invoice_date THEN
    RAISE EXCEPTION 'credit note date cannot be before the invoice date';
  END IF;

  -- Lines: description and one positive money value with at most two decimals.
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION 'credit line must be an object';
    END IF;
    IF nullif(btrim(coalesce(v_line->>'description', '')), '') IS NULL THEN
      RAISE EXCEPTION 'credit line description is required';
    END IF;
    BEGIN
      v_raw := CASE WHEN v_treatment = 'gst'
                    THEN (v_line->>'taxable_amount')::numeric
                    ELSE (v_line->>'amount')::numeric END;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'credit line amount must be positive';
    END;
    IF v_raw IS NULL AND v_treatment = 'gst' THEN
      RAISE EXCEPTION 'GST credit lines take a taxable amount';
    END IF;
    IF v_raw IS NULL OR v_raw <= 0 THEN
      RAISE EXCEPTION 'credit line amount must be positive';
    END IF;
    IF v_raw <> round(v_raw, 2) THEN
      RAISE EXCEPTION 'amounts have at most two decimals';
    END IF;
    IF v_treatment = 'no_gst' AND (
      coalesce(nullif(v_line->>'tax_amount', '')::numeric, 0) <> 0
      OR coalesce(nullif(v_line->>'cgst_amount', '')::numeric, 0) <> 0
      OR coalesce(nullif(v_line->>'sgst_amount', '')::numeric, 0) <> 0
      OR coalesce(nullif(v_line->>'igst_amount', '')::numeric, 0) <> 0
    ) THEN
      RAISE EXCEPTION 'a credit note without GST cannot carry tax';
    END IF;
    v_descs := array_append(v_descs, left(btrim(v_line->>'description'), 500));
    v_taxables := array_append(v_taxables, v_raw);
    v_total_taxable := v_total_taxable + v_raw;
  END LOOP;

  SELECT coalesce(sum(c.amount), 0),
         coalesce(sum(c.taxable_amount) FILTER (WHERE c.tax_treatment = 'gst'), 0),
         coalesce(sum(c.cgst_amount), 0),
         coalesce(sum(c.sgst_amount), 0),
         coalesce(sum(c.igst_amount), 0),
         count(*) FILTER (WHERE c.tax_treatment = 'legacy' AND c.tax_amount > 0)
    INTO v_prior_total, v_prior_taxable, v_prior_cgst, v_prior_sgst, v_prior_igst, v_prior_legacy_taxed
  FROM public.invoice_credit_notes c
  WHERE c.org_id = p_org_id AND c.invoice_id = p_invoice_id AND c.status = 'issued';

  IF v_treatment = 'gst' THEN
    v_inv_cgst := round(coalesce(v_invoice.cgst_amount, 0), 2);
    v_inv_sgst := round(coalesce(v_invoice.sgst_amount, 0), 2);
    v_inv_igst := round(coalesce(v_invoice.igst_amount, 0), 2);
    v_inv_tax := v_inv_cgst + v_inv_sgst + v_inv_igst;
    IF v_inv_tax <= 0 THEN
      RAISE EXCEPTION 'this invoice carries no GST; issue the credit note without GST';
    END IF;
    IF v_inv_igst > 0 AND (v_inv_cgst > 0 OR v_inv_sgst > 0) THEN
      RAISE EXCEPTION 'invoice GST mixes IGST with CGST/SGST and cannot be credited automatically';
    END IF;
    v_supply := CASE WHEN v_inv_igst > 0 THEN 'inter' ELSE 'intra' END;
    IF v_invoice.tax_snapshot ? 'supply_type'
       AND v_invoice.tax_snapshot->>'supply_type' IN ('intra', 'inter')
       AND v_invoice.tax_snapshot->>'supply_type' <> v_supply THEN
      RAISE EXCEPTION 'invoice GST amounts do not match its supply type';
    END IF;
    v_rate := v_invoice.gst_rate;
    IF v_rate IS NULL OR v_rate <= 0 OR v_rate > 40 THEN
      RAISE EXCEPTION 'invoice GST rate is unavailable';
    END IF;
    SELECT array_agg(DISTINCT round((e->>'tax_rate')::numeric, 3))
      INTO v_rates
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_invoice.line_items) = 'array' THEN v_invoice.line_items ELSE '[]'::jsonb END
    ) e
    WHERE coalesce(e->>'tax_rate', '') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$';
    IF cardinality(coalesce(v_rates, '{}')) > 1 THEN
      RAISE EXCEPTION 'invoice has more than one GST rate; GST credit notes support single-rate invoices only';
    END IF;
    IF cardinality(coalesce(v_rates, '{}')) = 1 AND v_rates[1] <> round(v_rate, 3) THEN
      RAISE EXCEPTION 'invoice line GST rate does not match the invoice rate';
    END IF;
    IF v_prior_legacy_taxed > 0 THEN
      RAISE EXCEPTION 'invoice has an earlier credit note without a GST breakup';
    END IF;
    v_inv_base := round(coalesce(v_invoice.subtotal, v_invoice.total_amount - v_inv_tax), 2);
    -- The invoice's own tax must be the rate applied to its taxable value (within
    -- rounding); otherwise the tax structure is not derivable.
    IF abs(v_inv_tax - round(v_inv_base * v_rate / 100, 2)) > 1.00 THEN
      RAISE EXCEPTION 'invoice tax does not match its GST rate';
    END IF;

    IF v_total_taxable > round(v_inv_base - v_prior_taxable, 2) THEN
      RAISE EXCEPTION 'credit exceeds the invoice taxable value';
    END IF;
    IF v_total_taxable = round(v_inv_base - v_prior_taxable, 2) THEN
      -- Closing credit: take exactly the tax the invoice still carries.
      v_cgst := round(v_inv_cgst - v_prior_cgst, 2);
      v_sgst := round(v_inv_sgst - v_prior_sgst, 2);
      v_igst := round(v_inv_igst - v_prior_igst, 2);
    ELSIF v_supply = 'intra' THEN
      v_cgst := round(v_total_taxable * v_rate / 200, 2);
      v_sgst := round(v_total_taxable * v_rate / 200, 2);
    ELSE
      v_igst := round(v_total_taxable * v_rate / 100, 2);
    END IF;
    IF v_cgst < 0 OR v_sgst < 0 OR v_igst < 0
       OR v_cgst > round(v_inv_cgst - v_prior_cgst, 2)
       OR v_sgst > round(v_inv_sgst - v_prior_sgst, 2)
       OR v_igst > round(v_inv_igst - v_prior_igst, 2) THEN
      RAISE EXCEPTION 'credit exceeds the invoice tax';
    END IF;

    -- Split each component across lines by cumulative rounding; the last line
    -- takes the remainder so lines sum to the header exactly.
    FOR v_i IN 1..v_n LOOP
      IF v_i < v_n THEN
        v_c := round((v_cum + v_taxables[v_i]) * v_rate / 200, 2) - round(v_cum * v_rate / 200, 2);
        v_g := round((v_cum + v_taxables[v_i]) * v_rate / 100, 2) - round(v_cum * v_rate / 100, 2);
        IF v_supply = 'intra' THEN
          v_s := v_c;
          v_g := 0;
        ELSE
          v_c := 0;
          v_s := 0;
        END IF;
      ELSE
        v_c := v_cgst - v_acc_c;
        v_s := v_sgst - v_acc_s;
        v_g := v_igst - v_acc_g;
      END IF;
      IF v_c < 0 OR v_s < 0 OR v_g < 0 THEN
        RAISE EXCEPTION 'credit tax cannot be split across these lines; credit it as one line';
      END IF;
      v_cum := v_cum + v_taxables[v_i];
      v_acc_c := v_acc_c + v_c;
      v_acc_s := v_acc_s + v_s;
      v_acc_g := v_acc_g + v_g;
      v_l_cgst := array_append(v_l_cgst, v_c);
      v_l_sgst := array_append(v_l_sgst, v_s);
      v_l_igst := array_append(v_l_igst, v_g);
      v_amounts := array_append(v_amounts, v_taxables[v_i] + v_c + v_s + v_g);

      -- Caller-sent figures must equal the server's.
      v_line := p_lines->(v_i - 1);
      IF (v_line ? 'cgst_amount' AND round(coalesce(nullif(v_line->>'cgst_amount', '')::numeric, 0), 2) <> v_c)
         OR (v_line ? 'sgst_amount' AND round(coalesce(nullif(v_line->>'sgst_amount', '')::numeric, 0), 2) <> v_s)
         OR (v_line ? 'igst_amount' AND round(coalesce(nullif(v_line->>'igst_amount', '')::numeric, 0), 2) <> v_g)
         OR (v_line ? 'tax_amount' AND round(coalesce(nullif(v_line->>'tax_amount', '')::numeric, 0), 2) <> v_c + v_s + v_g)
      THEN
        RAISE EXCEPTION 'tax components do not match the invoice GST (line %)', v_i;
      END IF;
    END LOOP;
    v_total := v_total_taxable + v_cgst + v_sgst + v_igst;
  ELSE
    v_amounts := v_taxables;
    v_total := v_total_taxable;
    FOR v_i IN 1..v_n LOOP
      v_l_cgst := array_append(v_l_cgst, 0::numeric);
      v_l_sgst := array_append(v_l_sgst, 0::numeric);
      v_l_igst := array_append(v_l_igst, 0::numeric);
    END LOOP;
  END IF;

  IF round(v_total, 2) > round(v_invoice.total_amount - v_prior_total, 2) THEN
    RAISE EXCEPTION 'credit exceeds remaining invoice value';
  END IF;

  -- Part of the credit above what the customer still owes becomes customer credit.
  SELECT coalesce(sum(a.amount), 0) INTO v_received
  FROM public.invoice_payment_allocations a
  WHERE a.org_id = p_org_id AND a.invoice_id = p_invoice_id AND a.status = 'confirmed';
  v_credit_refunded := public.invoice_credit_refunded_amount(p_org_id, p_invoice_id);
  v_open_before := greatest(round(v_invoice.total_amount - v_received - v_prior_total + v_credit_refunded, 2), 0);
  v_customer_credit := greatest(round(v_total - v_open_before, 2), 0);

  SELECT count(*) INTO v_prior_count
  FROM public.invoice_credit_notes
  WHERE org_id = p_org_id AND invoice_id = p_invoice_id;
  v_number := 'CN/' || v_invoice.invoice_number || '/' || lpad((v_prior_count + 1)::text, 2, '0');

  PERFORM public.invoice_payment_open_write();
  INSERT INTO public.invoice_credit_notes (
    org_id, client_id, invoice_id, credit_number, credit_date, reason, amount, tax_amount,
    issued_by, tax_treatment, supply_type, gst_rate, cgst_amount, sgst_amount, igst_amount
  ) VALUES (
    p_org_id, v_invoice.client_id, p_invoice_id, v_number, v_date, v_reason,
    round(v_total, 2), round(v_cgst + v_sgst + v_igst, 2), auth.uid(), v_treatment,
    CASE WHEN v_treatment = 'gst' THEN v_supply END,
    CASE WHEN v_treatment = 'gst' THEN v_rate END,
    v_cgst, v_sgst, v_igst
  ) RETURNING id INTO v_note_id;

  FOR v_i IN 1..v_n LOOP
    INSERT INTO public.invoice_credit_note_lines (
      credit_note_id, org_id, description, amount, tax_amount, cgst_amount, sgst_amount, igst_amount
    ) VALUES (
      v_note_id, p_org_id, v_descs[v_i], v_amounts[v_i],
      v_l_cgst[v_i] + v_l_sgst[v_i] + v_l_igst[v_i], v_l_cgst[v_i], v_l_sgst[v_i], v_l_igst[v_i]
    );
  END LOOP;

  INSERT INTO public.invoice_control_events (org_id, invoice_id, event_type, reason, payload, actor_id)
  VALUES (p_org_id, p_invoice_id, 'credit_issued', v_reason,
          jsonb_build_object('credit_note_id', v_note_id, 'credit_number', v_number,
                             'amount', round(v_total, 2), 'tax_amount', round(v_cgst + v_sgst + v_igst, 2),
                             'tax_treatment', v_treatment, 'customer_credit', v_customer_credit),
          auth.uid());

  v_existing := jsonb_build_object(
    'credit_note_id', v_note_id,
    'credit_number', v_number,
    'amount', round(v_total, 2),
    'taxable_amount', round(v_total_taxable, 2),
    'tax_amount', round(v_cgst + v_sgst + v_igst, 2),
    'cgst_amount', v_cgst,
    'sgst_amount', v_sgst,
    'igst_amount', v_igst,
    'tax_treatment', v_treatment,
    'supply_type', CASE WHEN v_treatment = 'gst' THEN v_supply END,
    'gst_rate', CASE WHEN v_treatment = 'gst' THEN v_rate END,
    'customer_credit', v_customer_credit,
    'replayed', false
  );
  INSERT INTO public.invoice_finance_operations (org_id, operation, idempotency_key, result)
  VALUES (p_org_id, 'credit', v_key, v_existing);
  RETURN v_existing;
END;
$$;

-- Earlier signature, kept for clients built before this migration: value-only
-- credit. Tax can no longer be sent by the caller.
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
BEGIN
  IF jsonb_typeof(p_lines) = 'array' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) e
    WHERE jsonb_typeof(e) = 'object'
      AND coalesce(nullif(e->>'tax_amount', ''), '0') !~ '^\s*0*(\.0*)?\s*$'
  ) THEN
    RAISE EXCEPTION 'credit note tax is calculated from the invoice; issue a GST credit note';
  END IF;
  RETURN public.issue_invoice_credit_note(
    p_org_id, p_invoice_id, p_credit_date, p_reason, 'no_gst', p_lines, p_idempotency_key
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Refunds
-- ---------------------------------------------------------------------------

-- Refundable now from one source. Receipt: the unapplied part, capped at the cash
-- actually received (TDS is not cash). Credit note: the customer credit it created
-- on its invoice, i.e. what that invoice is settled above its total.
CREATE OR REPLACE FUNCTION public.invoice_refundable_amount(
  p_org_id uuid,
  p_source_type text,
  p_source_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.invoice_payments%ROWTYPE;
  v_note public.invoice_credit_notes%ROWTYPE;
  v_total numeric;
  v_status text;
  v_allocated numeric;
  v_refunded numeric;
  v_excess numeric;
  v_note_left numeric;
BEGIN
  IF p_source_type = 'payment' THEN
    SELECT * INTO v_payment FROM public.invoice_payments
    WHERE id = p_source_id AND org_id = p_org_id;
    IF NOT FOUND OR v_payment.status <> 'recorded' OR v_payment.payment_mode = 'tds'
       OR v_payment.client_id IS NULL THEN
      RETURN 0;
    END IF;
    SELECT coalesce(sum(a.amount), 0) INTO v_allocated
    FROM public.invoice_payment_allocations a
    WHERE a.org_id = p_org_id AND a.payment_id = p_source_id AND a.status = 'confirmed';
    v_refunded := public.invoice_payment_refunded_amount(p_org_id, p_source_id);
    RETURN greatest(round(least(
      v_payment.amount - v_allocated - v_refunded,
      v_payment.amount - v_payment.tds_amount - v_refunded
    ), 2), 0);
  ELSIF p_source_type = 'credit_note' THEN
    SELECT * INTO v_note FROM public.invoice_credit_notes
    WHERE id = p_source_id AND org_id = p_org_id;
    IF NOT FOUND OR v_note.status <> 'issued' THEN
      RETURN 0;
    END IF;
    SELECT i.total_amount, i.status INTO v_total, v_status
    FROM public.invoices i WHERE i.id = v_note.invoice_id AND i.org_id = p_org_id;
    IF v_status IS NULL OR v_status NOT IN ('sent', 'paid') THEN
      RETURN 0;
    END IF;
    SELECT coalesce(sum(a.amount), 0) INTO v_allocated
    FROM public.invoice_payment_allocations a
    WHERE a.org_id = p_org_id AND a.invoice_id = v_note.invoice_id AND a.status = 'confirmed';
    v_excess := v_allocated
      + public.invoice_credited_amount(p_org_id, v_note.invoice_id)
      - public.invoice_credit_refunded_amount(p_org_id, v_note.invoice_id)
      - v_total;
    SELECT v_note.amount - coalesce(sum(r.amount), 0) INTO v_note_left
    FROM public.invoice_customer_refunds r
    WHERE r.org_id = p_org_id AND r.credit_note_id = p_source_id
      AND r.source_type = 'credit_note' AND r.status = 'recorded';
    RETURN greatest(round(least(v_excess, v_note_left), 2), 0);
  END IF;
  RETURN 0;
END;
$$;
REVOKE ALL ON FUNCTION public.invoice_refundable_amount(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_customer_refund(
  p_org_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_refund_date date,
  p_amount numeric,
  p_refund_mode text,
  p_transaction_reference text,
  p_notes text,
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
  v_type text := lower(btrim(coalesce(p_source_type, '')));
  v_mode text := lower(btrim(coalesce(p_refund_mode, '')));
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_date date;
  v_amount numeric;
  v_payment public.invoice_payments%ROWTYPE;
  v_note public.invoice_credit_notes%ROWTYPE;
  v_client uuid;
  v_invoice_id uuid;
  v_source_date date;
  v_source_number text;
  v_refundable numeric;
  v_refund_id uuid;
  v_number text;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  PERFORM pg_advisory_xact_lock(872342, hashtext(p_org_id::text));

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 128 THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  SELECT result INTO v_existing
  FROM public.invoice_finance_operations
  WHERE org_id = p_org_id AND operation = 'refund' AND idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'refund amount must be positive with at most two decimals';
  END IF;
  v_amount := round(p_amount, 2);
  IF v_mode NOT IN ('bank', 'upi', 'cash', 'cheque', 'neft', 'rtgs', 'imps', 'other') THEN
    RAISE EXCEPTION 'choose how the refund was paid';
  END IF;
  v_date := coalesce(p_refund_date, v_today);
  IF v_date > v_today + 1 THEN
    RAISE EXCEPTION 'refund date cannot be in the future';
  END IF;

  IF v_type = 'payment' THEN
    SELECT * INTO v_payment FROM public.invoice_payments
    WHERE id = p_source_id AND org_id = p_org_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'receipt not found in this organization';
    END IF;
    IF v_payment.status <> 'recorded' THEN
      RAISE EXCEPTION 'a reversed receipt cannot be refunded';
    END IF;
    IF v_payment.payment_mode = 'tds' THEN
      RAISE EXCEPTION 'TDS is not cash and cannot be refunded';
    END IF;
    IF v_payment.client_id IS NULL THEN
      RAISE EXCEPTION 'receipt has no customer';
    END IF;
    v_client := v_payment.client_id;
    v_source_date := v_payment.payment_date;
    v_source_number := v_payment.receipt_number;
  ELSIF v_type = 'credit_note' THEN
    SELECT * INTO v_note FROM public.invoice_credit_notes
    WHERE id = p_source_id AND org_id = p_org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'credit note not found in this organization';
    END IF;
    IF v_note.status <> 'issued' THEN
      RAISE EXCEPTION 'credit note is not issued';
    END IF;
    PERFORM 1 FROM public.invoices i
    WHERE i.id = v_note.invoice_id AND i.org_id = p_org_id
    FOR UPDATE;
    v_client := v_note.client_id;
    v_invoice_id := v_note.invoice_id;
    v_source_date := v_note.credit_date;
    v_source_number := v_note.credit_number;
  ELSE
    RAISE EXCEPTION 'refund source must be a receipt or a credit note';
  END IF;

  IF v_date < v_source_date THEN
    RAISE EXCEPTION 'refund date cannot be before the receipt or credit note date';
  END IF;

  v_refundable := public.invoice_refundable_amount(p_org_id, v_type, p_source_id);
  IF v_refundable <= 0 THEN
    RAISE EXCEPTION 'nothing is refundable from this source';
  END IF;
  IF v_amount > v_refundable THEN
    RAISE EXCEPTION 'refund exceeds the refundable balance of %', to_char(v_refundable, 'FM999999999990.00');
  END IF;

  PERFORM public.invoice_payment_open_write();
  INSERT INTO public.invoice_customer_refunds (
    org_id, client_id, refund_number, refund_date, amount, source_type, payment_id,
    credit_note_id, invoice_id, refund_mode, transaction_reference, notes,
    idempotency_key, recorded_by
  ) VALUES (
    p_org_id, v_client, '', v_date, v_amount, v_type,
    CASE WHEN v_type = 'payment' THEN p_source_id END,
    CASE WHEN v_type = 'credit_note' THEN p_source_id END,
    v_invoice_id, v_mode,
    nullif(left(btrim(coalesce(p_transaction_reference, '')), 200), ''),
    nullif(left(btrim(coalesce(p_notes, '')), 2000), ''),
    v_key, auth.uid()
  ) RETURNING id, refund_number INTO v_refund_id, v_number;

  INSERT INTO public.invoice_control_events (org_id, invoice_id, event_type, reason, payload, actor_id)
  VALUES (p_org_id, v_invoice_id, 'refund_recorded', NULL,
          jsonb_build_object('refund_id', v_refund_id, 'refund_number', v_number, 'amount', v_amount,
                             'source_type', v_type, 'source_id', p_source_id, 'source_number', v_source_number),
          auth.uid());

  v_existing := jsonb_build_object(
    'refund_id', v_refund_id,
    'refund_number', v_number,
    'amount', v_amount,
    'source_type', v_type,
    'source_id', p_source_id,
    'refundable_after', round(v_refundable - v_amount, 2),
    'replayed', false
  );
  INSERT INTO public.invoice_finance_operations (org_id, operation, idempotency_key, result)
  VALUES (p_org_id, 'refund', v_key, v_existing);
  RETURN v_existing;
END;
$$;

-- A refund that did not go through (bounced transfer, entered in error) is
-- reversed, never deleted. Its amount becomes refundable again.
CREATE OR REPLACE FUNCTION public.reverse_customer_refund(
  p_org_id uuid,
  p_refund_id uuid,
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
  v_reason text;
  v_refund public.invoice_customer_refunds%ROWTYPE;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  PERFORM pg_advisory_xact_lock(872342, hashtext(p_org_id::text));
  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  IF v_key IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 128 THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  SELECT result INTO v_existing
  FROM public.invoice_finance_operations
  WHERE org_id = p_org_id AND operation = 'refund_reverse' AND idempotency_key = v_key;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing || jsonb_build_object('replayed', true);
  END IF;
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reversal reason is required';
  END IF;

  SELECT * INTO v_refund FROM public.invoice_customer_refunds
  WHERE id = p_refund_id AND org_id = p_org_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund not found in this organization';
  END IF;
  IF v_refund.status = 'reversed' THEN
    RAISE EXCEPTION 'refund is already reversed';
  END IF;

  PERFORM public.invoice_payment_open_write();
  UPDATE public.invoice_customer_refunds
  SET status = 'reversed', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = left(v_reason, 2000)
  WHERE id = v_refund.id;

  INSERT INTO public.invoice_control_events (org_id, invoice_id, event_type, reason, payload, actor_id)
  VALUES (p_org_id, v_refund.invoice_id, 'refund_reversed', v_reason,
          jsonb_build_object('refund_id', v_refund.id, 'refund_number', v_refund.refund_number,
                             'amount', v_refund.amount),
          auth.uid());

  v_existing := jsonb_build_object('refund_id', v_refund.id, 'refund_number', v_refund.refund_number,
                                   'status', 'reversed', 'replayed', false);
  INSERT INTO public.invoice_finance_operations (org_id, operation, idempotency_key, result)
  VALUES (p_org_id, 'refund_reverse', v_key, v_existing);
  RETURN v_existing;
END;
$$;

-- Everything that can be refunded for one customer now. Bounded. Set-based; the
-- figures equal invoice_refundable_amount, which still guards every refund.
CREATE OR REPLACE FUNCTION public.customer_refundable_sources(
  p_org_id uuid,
  p_client_id uuid
)
RETURNS TABLE (
  source_type text,
  source_id uuid,
  source_number text,
  source_date date,
  invoice_id uuid,
  invoice_number text,
  source_amount numeric,
  refunded numeric,
  refundable numeric
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
  RETURN QUERY
  WITH pay AS (
    SELECT p.id, p.receipt_number, p.payment_date, p.amount, p.tds_amount,
           coalesce(al.allocated, 0) AS allocated, coalesce(rf.refunded, 0) AS refunded
    FROM public.invoice_payments p
    LEFT JOIN LATERAL (
      SELECT sum(a.amount) AS allocated FROM public.invoice_payment_allocations a
      WHERE a.org_id = p.org_id AND a.payment_id = p.id AND a.status = 'confirmed'
    ) al ON true
    LEFT JOIN LATERAL (
      SELECT sum(r.amount) AS refunded FROM public.invoice_customer_refunds r
      WHERE r.org_id = p.org_id AND r.payment_id = p.id AND r.status = 'recorded' AND r.source_type = 'payment'
    ) rf ON true
    WHERE p.org_id = p_org_id AND p.client_id = p_client_id AND p.status = 'recorded' AND p.payment_mode <> 'tds'
  ),
  credited_invoices AS (
    SELECT DISTINCT c.invoice_id
    FROM public.invoice_credit_notes c
    WHERE c.org_id = p_org_id AND c.client_id = p_client_id AND c.status = 'issued'
  ),
  excess AS (
    SELECT i.id AS invoice_id, i.invoice_number,
           coalesce((SELECT sum(a.amount) FROM public.invoice_payment_allocations a
                     WHERE a.org_id = p_org_id AND a.invoice_id = i.id AND a.status = 'confirmed'), 0)
           + coalesce((SELECT sum(c.amount) FROM public.invoice_credit_notes c
                       WHERE c.org_id = p_org_id AND c.invoice_id = i.id AND c.status = 'issued'), 0)
           - coalesce((SELECT sum(r.amount) FROM public.invoice_customer_refunds r
                       WHERE r.org_id = p_org_id AND r.invoice_id = i.id AND r.status = 'recorded'
                         AND r.source_type = 'credit_note'), 0)
           - i.total_amount AS amount
    FROM credited_invoices ci
    JOIN public.invoices i ON i.id = ci.invoice_id AND i.org_id = p_org_id AND i.status IN ('sent', 'paid')
  ),
  notes AS (
    SELECT c.id, c.credit_number, c.credit_date, c.invoice_id, e.invoice_number, c.amount, e.amount AS invoice_excess,
           coalesce((SELECT sum(r.amount) FROM public.invoice_customer_refunds r
                     WHERE r.org_id = p_org_id AND r.credit_note_id = c.id
                       AND r.source_type = 'credit_note' AND r.status = 'recorded'), 0) AS refunded
    FROM excess e
    JOIN public.invoice_credit_notes c
      ON c.invoice_id = e.invoice_id AND c.org_id = p_org_id AND c.status = 'issued'
    WHERE e.amount > 0
  )
  SELECT s.* FROM (
    SELECT 'payment'::text, pay.id, pay.receipt_number, pay.payment_date, NULL::uuid, NULL::text,
           round(pay.amount, 2), round(pay.refunded, 2),
           greatest(round(least(pay.amount - pay.allocated - pay.refunded,
                                pay.amount - pay.tds_amount - pay.refunded), 2), 0)
    FROM pay
    WHERE pay.amount - pay.allocated - pay.refunded > 0
    UNION ALL
    SELECT 'credit_note'::text, notes.id, notes.credit_number, notes.credit_date, notes.invoice_id, notes.invoice_number,
           round(notes.amount, 2), round(notes.refunded, 2),
           greatest(round(least(notes.invoice_excess, notes.amount - notes.refunded), 2), 0)
    FROM notes
  ) s (source_type, source_id, source_number, source_date, invoice_id, invoice_number, source_amount, refunded, refundable)
  WHERE s.refundable > 0
  ORDER BY s.source_date, s.source_number
  LIMIT 200;
END;
$$;

-- One customer's position: open receivables, credit held for them, refunds paid.
-- ledger_balance (Dr positive) = open_receivables - unapplied_receipts - credit_note_credit.
CREATE OR REPLACE FUNCTION public.customer_credit_balance(
  p_org_id uuid,
  p_client_id uuid
)
RETURNS TABLE (
  open_receivables numeric,
  unapplied_receipts numeric,
  credit_note_credit numeric,
  customer_credit numeric,
  refunds_recorded numeric,
  refundable_now numeric,
  ledger_balance numeric
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
  RETURN QUERY
  WITH inv AS (
    SELECT round(i.total_amount, 2)
           - coalesce(paid.received, 0) - coalesce(cn.credited, 0) + coalesce(rf.refunded, 0) AS net
    FROM public.invoices i
    LEFT JOIN LATERAL (
      SELECT sum(a.amount) AS received FROM public.invoice_payment_allocations a
      WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'
    ) paid ON true
    LEFT JOIN LATERAL (
      SELECT sum(c.amount) AS credited FROM public.invoice_credit_notes c
      WHERE c.org_id = i.org_id AND c.invoice_id = i.id AND c.status = 'issued'
    ) cn ON true
    LEFT JOIN LATERAL (
      SELECT sum(r.amount) AS refunded FROM public.invoice_customer_refunds r
      WHERE r.org_id = i.org_id AND r.invoice_id = i.id AND r.status = 'recorded' AND r.source_type = 'credit_note'
    ) rf ON true
    WHERE i.org_id = p_org_id AND i.client_id = p_client_id AND i.status IN ('sent', 'paid')
  ),
  pay AS (
    SELECT p.amount - coalesce(al.allocated, 0) - coalesce(rf.refunded, 0) AS unapplied,
           CASE WHEN p.payment_mode = 'tds' THEN 0
                ELSE greatest(least(p.amount - coalesce(al.allocated, 0), p.amount - p.tds_amount) - coalesce(rf.refunded, 0), 0)
           END AS refundable
    FROM public.invoice_payments p
    LEFT JOIN LATERAL (
      SELECT sum(a.amount) AS allocated FROM public.invoice_payment_allocations a
      WHERE a.org_id = p.org_id AND a.payment_id = p.id AND a.status = 'confirmed'
    ) al ON true
    LEFT JOIN LATERAL (
      SELECT sum(r.amount) AS refunded FROM public.invoice_customer_refunds r
      WHERE r.org_id = p.org_id AND r.payment_id = p.id AND r.status = 'recorded' AND r.source_type = 'payment'
    ) rf ON true
    WHERE p.org_id = p_org_id AND p.client_id = p_client_id AND p.status = 'recorded'
  ),
  t AS (
    SELECT
      (SELECT coalesce(sum(greatest(inv.net, 0)), 0) FROM inv) AS open_amt,
      (SELECT coalesce(sum(greatest(-inv.net, 0)), 0) FROM inv) AS cn_credit,
      (SELECT coalesce(sum(pay.unapplied), 0) FROM pay) AS unapplied,
      (SELECT coalesce(sum(pay.refundable), 0) FROM pay) AS pay_refundable,
      (SELECT coalesce(sum(r.amount), 0) FROM public.invoice_customer_refunds r
        WHERE r.org_id = p_org_id AND r.client_id = p_client_id AND r.status = 'recorded') AS refunds
  )
  SELECT round(t.open_amt, 2), round(t.unapplied, 2), round(t.cn_credit, 2),
         round(t.unapplied + t.cn_credit, 2), round(t.refunds, 2),
         round(t.pay_refundable + t.cn_credit, 2),
         round(t.open_amt - t.unapplied - t.cn_credit, 2)
  FROM t;
END;
$$;

-- Refunds, newest first. Bounded page.
CREATE OR REPLACE FUNCTION public.invoice_refund_register(
  p_org_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  refund_id uuid,
  refund_number text,
  refund_date date,
  client_id uuid,
  client_name text,
  amount numeric,
  source_type text,
  source_number text,
  invoice_number text,
  refund_mode text,
  transaction_reference text,
  notes text,
  status text,
  reversal_reason text,
  recorded_by text,
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
  WITH page AS (
    SELECT r.*, count(*) OVER () AS total_count
    FROM public.invoice_customer_refunds r
    WHERE r.org_id = p_org_id
      AND (p_client_id IS NULL OR r.client_id = p_client_id)
      AND (p_from IS NULL OR r.refund_date >= p_from)
      AND (p_to IS NULL OR r.refund_date <= p_to)
    ORDER BY r.refund_date DESC, r.created_at DESC, r.id DESC
    LIMIT p_limit
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT page.id, page.refund_number, page.refund_date, page.client_id,
         coalesce(nullif(btrim(coalesce(cl.legal_name, '')), ''), cl.name),
         round(page.amount, 2), page.source_type,
         coalesce(p.receipt_number, c.credit_number), i.invoice_number,
         page.refund_mode, page.transaction_reference, page.notes, page.status, page.reversal_reason,
         coalesce(nullif(btrim(coalesce(pr.full_name, '')), ''), pr.email),
         page.created_at, page.total_count
  FROM page
  LEFT JOIN public.clients cl ON cl.id = page.client_id AND cl.organization_id = p_org_id
  LEFT JOIN public.invoice_payments p ON p.id = page.payment_id AND p.org_id = p_org_id
  LEFT JOIN public.invoice_credit_notes c ON c.id = page.credit_note_id AND c.org_id = p_org_id
  LEFT JOIN public.invoices i ON i.id = page.invoice_id AND i.org_id = p_org_id
  LEFT JOIN public.profiles pr ON pr.id = page.recorded_by
  ORDER BY page.refund_date DESC, page.created_at DESC, page.id DESC;
END;
$$;

-- ---------------------------------------------------------------------------
-- Existing functions gaining the refund term (bodies otherwise unchanged)
-- ---------------------------------------------------------------------------

-- 20271103231500 body. Receipt balance also subtracts its refunds; invoice limit
-- subtracts refunds of credit-note credit.
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

  IF round(v_used + public.invoice_payment_refunded_amount(p_org_id, p_payment_id) + v_sum, 2) > v_payment.amount THEN
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

    v_credited := public.invoice_credited_amount(p_org_id, v_invoice.id)
      - public.invoice_credit_refunded_amount(p_org_id, v_invoice.id);

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

-- 20271103213000 body. A receipt with recorded refunds cannot be reversed: the
-- refunds are reversed first, so a bounced receipt never leaves a refund unfunded.
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

  IF EXISTS (
    SELECT 1 FROM public.invoice_customer_refunds r
    WHERE r.org_id = p_org_id AND r.payment_id = v_payment.id AND r.status = 'recorded'
  ) THEN
    RAISE EXCEPTION 'this receipt has refunds; reverse the refunds first';
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

-- 20271103231500 body. A retried link (same idempotency key) now returns the
-- original receipt instead of failing with "already linked".
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
  v_replay jsonb;
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
  SELECT o.result INTO v_replay
  FROM public.invoice_payment_operations o
  JOIN public.invoice_payments p ON p.id = o.payment_id AND p.org_id = o.org_id
  WHERE o.org_id = p_org_id
    AND o.operation = 'record'
    AND o.idempotency_key = nullif(btrim(coalesce(p_idempotency_key, '')), '')
    AND p.source_transaction_id = p_transaction_id;
  IF v_replay IS NOT NULL THEN
    RETURN v_replay || jsonb_build_object('replayed', true);
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

-- 20271103231500 body plus amount_refunded and customer_credit.
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
  amount_credited numeric,
  amount_refunded numeric,
  customer_credit numeric
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
    CASE WHEN s.cancelled THEN 0::numeric ELSE greatest(round(s.total - s.received - s.credited + s.refunded, 2), 0) END,
    CASE
      WHEN s.cancelled THEN 'cancelled'
      WHEN s.received + s.credited - s.refunded <= 0 AND s.total > 0 THEN 'unpaid'
      WHEN s.received + s.credited - s.refunded > s.total THEN 'overpaid'
      WHEN s.received + s.credited - s.refunded < s.total THEN 'partially_paid'
      ELSE 'paid'
    END,
    s.last_date,
    s.last_ref,
    s.credited,
    s.refunded,
    CASE WHEN s.cancelled THEN 0::numeric ELSE greatest(round(s.received + s.credited - s.refunded - s.total, 2), 0) END
  FROM (
    SELECT
      i.id,
      round(i.total_amount, 2) AS total,
      round(coalesce(paid.received, 0), 2) AS received,
      round(coalesce(cn.credited, 0), 2) AS credited,
      round(coalesce(rf.refunded, 0), 2) AS refunded,
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
      SELECT sum(r.amount) AS refunded
      FROM public.invoice_customer_refunds r
      WHERE r.org_id = i.org_id AND r.invoice_id = i.id AND r.status = 'recorded' AND r.source_type = 'credit_note'
    ) rf ON true
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

-- 20271103231500 body; open amount adds back refunds of credit-note credit.
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
      round(coalesce(cn.credited, 0), 2) AS credited,
      round(coalesce(rf.refunded, 0), 2) AS refunded
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
      SELECT sum(r.amount) AS refunded
      FROM public.invoice_customer_refunds r
      WHERE r.org_id = i.org_id AND r.invoice_id = i.id AND r.status = 'recorded' AND r.source_type = 'credit_note'
    ) rf ON true
    WHERE i.org_id = p_org_id
      AND i.client_id IS NOT NULL
      AND i.status IN ('sent', 'paid')
  ),
  open_rows AS (
    SELECT issued.*, greatest(issued.total - issued.received - issued.credited + issued.refunded, 0) AS open_amount,
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

-- 20271103231500 body; open amount adds back refunds of credit-note credit.
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
      round(coalesce(cn.credited, 0), 2) AS credited,
      round(coalesce(rf.refunded, 0), 2) AS refunded
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
      SELECT sum(r.amount) AS refunded
      FROM public.invoice_customer_refunds r
      WHERE r.org_id = i.org_id AND r.invoice_id = i.id AND r.status = 'recorded' AND r.source_type = 'credit_note'
    ) rf ON true
    WHERE i.org_id = p_org_id
      AND i.client_id = p_client_id
      AND i.status IN ('sent', 'paid')
  ),
  open_rows AS (
    SELECT issued.*, greatest(issued.total - issued.received - issued.credited + issued.refunded, 0) AS open_amount,
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

-- 20271103231500 body; open filter and outstanding add back credit-note refunds.
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
          ), 0) - coalesce((
            SELECT sum(r.amount) FROM public.invoice_customer_refunds r
            WHERE r.org_id = p_org_id AND r.invoice_id = i.id AND r.status = 'recorded' AND r.source_type = 'credit_note'
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
         ELSE greatest(round(page.total - coalesce(paid.received, 0) - coalesce(cn.credited, 0) + coalesce(rf.refunded, 0), 2), 0) END,
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
  LEFT JOIN LATERAL (
    SELECT sum(r.amount) AS refunded
    FROM public.invoice_customer_refunds r
    WHERE r.org_id = p_org_id AND r.invoice_id = page.id AND r.status = 'recorded' AND r.source_type = 'credit_note'
  ) rf ON true
  ORDER BY page.rn;
END;
$$;

-- 20271103231500 body plus refunded; unallocated subtracts refunds.
DROP FUNCTION public.invoice_payment_register(uuid, uuid, date, date, text, integer, integer);
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
  refunded numeric,
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
    CASE WHEN page.status = 'reversed' THEN 0::numeric ELSE round(page.amount - coalesce(al.allocated, 0) - coalesce(rfd.refunded, 0), 2) END,
    page.payment_mode, page.transaction_reference, page.status,
    bl.id,
    round(coalesce(rfd.refunded, 0), 2),
    page.total_count
  FROM page
  LEFT JOIN public.clients c ON c.id = page.client_id AND c.organization_id = p_org_id
  LEFT JOIN LATERAL (
    SELECT sum(a.amount) AS allocated
    FROM public.invoice_payment_allocations a
    WHERE a.org_id = p_org_id AND a.payment_id = page.id AND a.status = 'confirmed'
  ) al ON true
  LEFT JOIN LATERAL (
    SELECT sum(r.amount) AS refunded
    FROM public.invoice_customer_refunds r
    WHERE r.org_id = p_org_id AND r.payment_id = page.id AND r.status = 'recorded' AND r.source_type = 'payment'
  ) rfd ON true
  LEFT JOIN LATERAL (
    SELECT b.id FROM public.invoice_bank_lines b
    WHERE b.org_id = p_org_id AND b.matched_payment_id = page.id AND b.status = 'matched'
    LIMIT 1
  ) bl ON true
  ORDER BY page.payment_date DESC, page.created_at DESC, page.id DESC;
END;
$$;

-- 20271103231500 body plus refund (debit) and refund reversal (credit) rows.
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
    UNION ALL
    -- Money returned to the customer. A reversed refund keeps its row and gets a credit row.
    SELECT 'refund:' || r.id::text, r.refund_date, 35, 'refund', r.refund_number,
           r.transaction_reference,
           'Refund · ' || r.refund_mode || ' · ' || CASE WHEN r.source_type = 'payment'
             THEN 'from receipt ' || coalesce(p.receipt_number, '')
             ELSE 'of credit note ' || coalesce(c.credit_number, '') END,
           r.invoice_id, r.payment_id, r.credit_note_id,
           round(r.amount, 2), 0::numeric, r.created_at
    FROM public.invoice_customer_refunds r
    LEFT JOIN public.invoice_payments p ON p.id = r.payment_id AND p.org_id = p_org_id
    LEFT JOIN public.invoice_credit_notes c ON c.id = r.credit_note_id AND c.org_id = p_org_id
    WHERE r.org_id = p_org_id
      AND r.client_id = p_client_id
    UNION ALL
    SELECT 'refund_reversal:' || r.id::text, (r.reversed_at AT TIME ZONE 'Asia/Kolkata')::date, 55,
           'refund_reversal', r.refund_number, r.transaction_reference,
           coalesce(r.reversal_reason, 'Refund reversed'), r.invoice_id, r.payment_id, r.credit_note_id,
           0::numeric, round(r.amount, 2), r.reversed_at
    FROM public.invoice_customer_refunds r
    WHERE r.org_id = p_org_id
      AND r.client_id = p_client_id
      AND r.status = 'reversed'
      AND r.reversed_at IS NOT NULL
  )
  SELECT e.*, sum(e.debit - e.credit) OVER (
           ORDER BY e.entry_date, e.sort_rank, e.created_at, e.entry_key
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS running_balance
  FROM entries e;
$$;
REVOKE ALL ON FUNCTION public.customer_ledger_rows(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 20271103231500 body plus refunds; unallocated subtracts them.
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
  v_refunded numeric;
  v_refunds jsonb;
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

  SELECT coalesce(sum(r.amount) FILTER (WHERE r.status = 'recorded'), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'refund_number', r.refund_number, 'refund_date', r.refund_date,
           'amount', round(r.amount, 2), 'status', r.status, 'refund_mode', r.refund_mode
         ) ORDER BY r.refund_date, r.created_at), '[]'::jsonb)
    INTO v_refunded, v_refunds
  FROM public.invoice_customer_refunds r
  WHERE r.org_id = p_org_id AND r.payment_id = v_payment.id AND r.source_type = 'payment';

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
    'unallocated', CASE WHEN v_payment.status = 'reversed' THEN 0 ELSE round(v_payment.amount - v_allocated - v_refunded, 2) END,
    'refunded', round(v_refunded, 2),
    'refunds', v_refunds,
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

-- 20271103231500 body plus the GST breakup and refunds of each credit note.
DROP FUNCTION public.invoice_credit_note_register(uuid, uuid, integer, integer);
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
  tax_treatment text,
  supply_type text,
  gst_rate numeric,
  taxable_amount numeric,
  cgst_amount numeric,
  sgst_amount numeric,
  igst_amount numeric,
  refunded numeric,
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
         page.tax_treatment, page.supply_type, page.gst_rate, round(page.taxable_amount, 2),
         round(page.cgst_amount, 2), round(page.sgst_amount, 2), round(page.igst_amount, 2),
         round(coalesce((
           SELECT sum(r.amount) FROM public.invoice_customer_refunds r
           WHERE r.org_id = p_org_id AND r.credit_note_id = page.id
             AND r.source_type = 'credit_note' AND r.status = 'recorded'
         ), 0), 2),
         page.invoice_id, i.invoice_number, i.invoice_date, round(i.total_amount, 2),
         page.client_id, coalesce(nullif(btrim(coalesce(cl.legal_name, '')), ''), cl.name),
         coalesce(nullif(btrim(coalesce(pr.full_name, '')), ''), pr.email),
         page.created_at,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object('description', l.description, 'amount', round(l.amount, 2), 'tax_amount', round(l.tax_amount, 2), 'cgst_amount', round(l.cgst_amount, 2), 'sgst_amount', round(l.sgst_amount, 2), 'igst_amount', round(l.igst_amount, 2)) ORDER BY l.id)
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

-- 20271103231500 body; refund events show their refund number.
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
           coalesce(e.payload->>'refund_number', e.payload->>'credit_number', e.payload->>'credit_note_id') AS ref, e.reason, e.actor_id
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

DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.issue_invoice_credit_note(uuid, uuid, date, text, text, jsonb, text)',
    'public.issue_invoice_credit_note(uuid, uuid, date, text, jsonb, text)',
    'public.record_customer_refund(uuid, text, uuid, date, numeric, text, text, text, text)',
    'public.reverse_customer_refund(uuid, uuid, text, text)',
    'public.customer_refundable_sources(uuid, uuid)',
    'public.customer_credit_balance(uuid, uuid)',
    'public.invoice_refund_register(uuid, uuid, date, date, integer, integer)',
    'public.invoice_payment_summaries(uuid, uuid[])',
    'public.invoice_payment_register(uuid, uuid, date, date, text, integer, integer)',
    'public.invoice_credit_note_register(uuid, uuid, integer, integer)',
    'public.org_receivables_aging(uuid, integer, integer)',
    'public.customer_invoice_receivables(uuid, uuid)',
    'public.invoice_register(uuid, uuid, date, date, integer, integer, boolean)',
    'public.invoice_payment_receipt(uuid, uuid)',
    'public.invoice_finance_history(uuid, uuid)',
    'public.reverse_invoice_payment(uuid, uuid, text, text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
  END LOOP;
END;
$$;

-- Internal: called only inside the security-definer RPCs.
REVOKE ALL ON FUNCTION public.invoice_refundable_amount(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_payment_refunded_amount(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_credit_refunded_amount(uuid, uuid) FROM PUBLIC, anon, authenticated;
