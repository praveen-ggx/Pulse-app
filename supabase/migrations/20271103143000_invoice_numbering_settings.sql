-- Invoice sequence is a user-facing reference. invoices.id stays the platform id.
-- A number already stored on a draft is kept when the invoice is issued.
-- Changing prefix or start never rewrites invoices.invoice_number.
SET LOCAL lock_timeout = '5s';

CREATE TABLE public.invoice_numbering_settings (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix text NOT NULL DEFAULT '',
  start_number integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_numbering_settings_prefix_chk CHECK (prefix ~ '^[A-Z0-9]{0,6}$'),
  CONSTRAINT invoice_numbering_settings_start_chk CHECK (start_number >= 1)
);

COMMENT ON TABLE public.invoice_numbering_settings IS
  'User-facing invoice sequence. Does not change invoices.invoice_number on existing rows. invoices.id is the permanent id.';

ALTER TABLE public.invoice_numbering_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_numbering_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_numbering_settings TO authenticated;

CREATE POLICY "org_members_manage_invoice_numbering_settings"
  ON public.invoice_numbering_settings
  FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE OR REPLACE FUNCTION public.allocate_invoice_number(
  p_org_id uuid,
  p_financial_yr text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy text;
  v_seq bigint;
  v_prefix text;
  v_start integer;
BEGIN
  IF p_financial_yr IS NULL THEN
    IF extract(month FROM now()) >= 4 THEN
      v_fy := extract(year FROM now())::text || '-' ||
              right((extract(year FROM now())::int + 1)::text, 2);
    ELSE
      v_fy := (extract(year FROM now())::int - 1)::text || '-' ||
              right(extract(year FROM now())::text, 2);
    END IF;
  ELSE
    v_fy := p_financial_yr;
  END IF;

  SELECT NULLIF(upper(prefix), ''), GREATEST(start_number, 1)
    INTO v_prefix, v_start
  FROM public.invoice_numbering_settings
  WHERE org_id = p_org_id;
  v_prefix := COALESCE(v_prefix, 'INV');
  v_start := COALESCE(v_start, 1);

  INSERT INTO public.invoice_sequences (org_id, financial_year, last_seq)
  VALUES (p_org_id, v_fy, 0)
  ON CONFLICT (org_id, financial_year) DO NOTHING;

  UPDATE public.invoice_sequences
  SET last_seq = GREATEST(last_seq + 1, v_start)
  WHERE org_id = p_org_id
    AND financial_year = v_fy
  RETURNING last_seq INTO v_seq;

  RETURN v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 5, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_customer_invoice(
  p_org_id uuid,
  p_client_id uuid,
  p_client_name text,
  p_trip_ids uuid[],
  p_subtotal numeric,
  p_gst_rate numeric,
  p_sgst_amount numeric,
  p_cgst_amount numeric,
  p_igst_amount numeric,
  p_total_amount numeric,
  p_notes text DEFAULT NULL,
  p_invoice_date date DEFAULT CURRENT_DATE,
  p_due_date date DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_draft_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_policy text;
  v_number text;
  v_existing text;
  v_fy text;
  v_trip_count int;
  v_completed_count int;
  v_client_match int;
  v_missing_soft int;
  v_missing_hard int;
  v_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_org_id IS NULL OR p_client_id IS NULL THEN
    RAISE EXCEPTION 'org and client are required';
  END IF;

  IF p_trip_ids IS NULL OR cardinality(p_trip_ids) = 0 THEN
    RAISE EXCEPTION 'No approved trips selected for invoice issuance.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_trip_ids) AS tid GROUP BY tid HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate trip ids in invoice selection.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');

  PERFORM pg_advisory_xact_lock(872341, hashtext(p_org_id::text));

  IF v_key IS NOT NULL THEN
    SELECT i.invoice_number
      INTO v_number
    FROM public.invoices i
    WHERE i.org_id = p_org_id
      AND i.issue_idempotency_key = v_key
      AND coalesce(i.status, '') IN ('sent', 'paid');
    IF v_number IS NOT NULL THEN
      RETURN v_number;
    END IF;
  END IF;

  SELECT c.invoice_pod_policy
    INTO v_policy
  FROM public.clients c
  WHERE c.id = p_client_id
    AND c.organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found in this workspace.';
  END IF;

  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'This client has no invoicing POD policy. Set none, soft copy, or hard copy before invoicing.';
  END IF;

  IF v_policy NOT IN ('none', 'soft_copy', 'hard_copy') THEN
    RAISE EXCEPTION 'This client''s invoicing POD policy is invalid and must be reconfigured before invoicing.';
  END IF;

  SELECT
    count(*)::int,
    count(*) FILTER (
      WHERE lower(regexp_replace(trim(coalesce(t.status, '')), '[\s-]+', '_', 'g'))
        IN ('completed', 'delivered', 'done')
    )::int,
    count(*) FILTER (WHERE t.client_id IS NOT DISTINCT FROM p_client_id)::int
  INTO v_trip_count, v_completed_count, v_client_match
  FROM public.trips t
  WHERE t.id = ANY (p_trip_ids)
    AND t.organization_id = p_org_id;

  IF v_trip_count IS DISTINCT FROM cardinality(p_trip_ids) THEN
    RAISE EXCEPTION 'Some selected trips are no longer available for invoicing. Please refresh.';
  END IF;

  IF v_completed_count IS DISTINCT FROM v_trip_count THEN
    RAISE EXCEPTION 'Only completed trips can be invoiced.';
  END IF;

  IF v_client_match IS DISTINCT FROM v_trip_count THEN
    RAISE EXCEPTION 'An invoice can contain trips for only one client.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.org_id = p_org_id
      AND i.trip_ids && p_trip_ids
      AND coalesce(i.status, '') NOT IN ('void', 'cancelled')
      AND (p_draft_id IS NULL OR i.id IS DISTINCT FROM p_draft_id)
  ) THEN
    RAISE EXCEPTION 'One or more selected trips have already been invoiced.';
  END IF;

  IF v_policy = 'soft_copy' THEN
    SELECT count(*)::int
      INTO v_missing_soft
    FROM unnest(p_trip_ids) AS tid
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.trip_documents d
      WHERE d.trip_id = tid
        AND d.document_type = 'pod'
    );
    IF v_missing_soft > 0 THEN
      RAISE EXCEPTION 'Digital POD is required for this client before invoicing.';
    END IF;
  END IF;

  IF v_policy = 'hard_copy' THEN
    SELECT count(*)::int
      INTO v_missing_hard
    FROM public.trips t
    WHERE t.id = ANY (p_trip_ids)
      AND t.pod_received_at IS NULL;
    IF v_missing_hard > 0 THEN
      RAISE EXCEPTION 'Physical POD receipt is required for this client before invoicing.';
    END IF;
  END IF;

  IF p_draft_id IS NOT NULL THEN
    SELECT i.invoice_number INTO v_existing
    FROM public.invoices i
    WHERE i.id = p_draft_id
      AND i.org_id = p_org_id
      AND i.status = 'draft';
  END IF;
  IF v_existing IS NOT NULL AND btrim(v_existing) <> '' AND v_existing NOT LIKE 'DRAFT/%' THEN
    v_number := v_existing;
  ELSE
    v_number := public.allocate_invoice_number(p_org_id, NULL);
  END IF;
  IF v_number IS NULL OR btrim(v_number) = '' THEN
    RAISE EXCEPTION 'Could not allocate an invoice number. Please try again.';
  END IF;

  v_fy := split_part(v_number, '/', 2);
  IF v_fy IS NULL OR v_fy = '' THEN
    RAISE EXCEPTION 'Could not allocate an invoice number. Please try again.';
  END IF;

  IF p_draft_id IS NOT NULL THEN
    UPDATE public.invoices i
    SET
      invoice_number = v_number,
      financial_year = v_fy,
      client_id = p_client_id,
      client_name = nullif(btrim(coalesce(p_client_name, '')), ''),
      invoice_date = coalesce(p_invoice_date, CURRENT_DATE),
      due_date = p_due_date,
      trip_ids = p_trip_ids,
      subtotal = coalesce(p_subtotal, 0),
      gst_rate = coalesce(p_gst_rate, 0),
      sgst_amount = coalesce(p_sgst_amount, 0),
      cgst_amount = coalesce(p_cgst_amount, 0),
      igst_amount = coalesce(p_igst_amount, 0),
      total_amount = coalesce(p_total_amount, 0),
      notes = p_notes,
      status = 'sent',
      issue_idempotency_key = v_key,
      updated_at = now()
    WHERE i.id = p_draft_id
      AND i.org_id = p_org_id
      AND i.status = 'draft';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Draft invoice is no longer available to issue.';
    END IF;
  ELSE
    INSERT INTO public.invoices (
      org_id,
      invoice_number,
      financial_year,
      client_id,
      client_name,
      invoice_date,
      due_date,
      trip_ids,
      subtotal,
      gst_rate,
      sgst_amount,
      cgst_amount,
      igst_amount,
      total_amount,
      notes,
      status,
      pdf_storage_path,
      created_by,
      issue_idempotency_key
    ) VALUES (
      p_org_id,
      v_number,
      v_fy,
      p_client_id,
      nullif(btrim(coalesce(p_client_name, '')), ''),
      coalesce(p_invoice_date, CURRENT_DATE),
      p_due_date,
      p_trip_ids,
      coalesce(p_subtotal, 0),
      coalesce(p_gst_rate, 0),
      coalesce(p_sgst_amount, 0),
      coalesce(p_cgst_amount, 0),
      coalesce(p_igst_amount, 0),
      coalesce(p_total_amount, 0),
      p_notes,
      'sent',
      NULL,
      p_created_by,
      v_key
    );
  END IF;

  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_manual_invoice(
  p_org_id uuid,
  p_client_id uuid,
  p_client_name text,
  p_subtotal numeric,
  p_gst_rate numeric,
  p_sgst_amount numeric,
  p_cgst_amount numeric,
  p_igst_amount numeric,
  p_total_amount numeric,
  p_notes text DEFAULT NULL,
  p_invoice_date date DEFAULT CURRENT_DATE,
  p_due_date date DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_draft_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_issuer_snapshot jsonb DEFAULT NULL,
  p_client_snapshot jsonb DEFAULT NULL,
  p_line_items jsonb DEFAULT NULL,
  p_tax_snapshot jsonb DEFAULT NULL,
  p_payment_terms text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_number text;
  v_existing text;
  v_fy text;
  v_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_org_id IS NULL OR p_client_id IS NULL THEN
    RAISE EXCEPTION 'org and client are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_line_items IS NULL OR jsonb_typeof(p_line_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_line_items) < 1 THEN
    RAISE EXCEPTION 'Manual invoice requires at least one line.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_line_items) AS elem
    WHERE coalesce(elem->>'hsn_sac', '') !~ '^[0-9]{4,8}$'
  ) THEN
    RAISE EXCEPTION 'HSN/SAC is required on every invoice line. Enter a valid 4–8 digit code — do not guess.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND c.organization_id = p_org_id
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Client not found in this workspace.';
  END IF;

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  PERFORM pg_advisory_xact_lock(872344, hashtext(p_org_id::text || ':manual:' || p_client_id::text));

  IF v_key IS NOT NULL THEN
    SELECT i.invoice_number INTO v_number
    FROM public.invoices i
    WHERE i.org_id = p_org_id
      AND i.issue_idempotency_key = v_key
      AND coalesce(i.status, '') IN ('sent', 'paid');
    IF v_number IS NOT NULL THEN
      RETURN v_number;
    END IF;
  END IF;

  IF p_draft_id IS NOT NULL THEN
    SELECT i.invoice_number INTO v_existing
    FROM public.invoices i
    WHERE i.id = p_draft_id
      AND i.org_id = p_org_id
      AND i.status = 'draft';
  END IF;
  IF v_existing IS NOT NULL AND btrim(v_existing) <> '' AND v_existing NOT LIKE 'DRAFT/%' THEN
    v_number := v_existing;
  ELSE
    v_number := public.allocate_invoice_number(p_org_id, NULL);
  END IF;
  IF v_number IS NULL OR btrim(v_number) = '' THEN
    RAISE EXCEPTION 'Could not allocate an invoice number. Please try again.';
  END IF;
  v_fy := split_part(v_number, '/', 2);
  IF v_fy IS NULL OR v_fy = '' THEN
    RAISE EXCEPTION 'Could not allocate an invoice number. Please try again.';
  END IF;

  IF p_draft_id IS NOT NULL THEN
    UPDATE public.invoices i
    SET
      invoice_number = v_number,
      financial_year = v_fy,
      client_id = p_client_id,
      client_name = p_client_name,
      invoice_date = coalesce(p_invoice_date, CURRENT_DATE),
      due_date = p_due_date,
      trip_ids = '{}'::uuid[],
      sales_order_id = NULL,
      plan_id = NULL,
      invoice_source = 'manual',
      subtotal = coalesce(p_subtotal, 0),
      gst_rate = coalesce(p_gst_rate, 0),
      sgst_amount = coalesce(p_sgst_amount, 0),
      cgst_amount = coalesce(p_cgst_amount, 0),
      igst_amount = coalesce(p_igst_amount, 0),
      total_amount = coalesce(p_total_amount, 0),
      notes = p_notes,
      payment_terms = p_payment_terms,
      issuer_snapshot = coalesce(p_issuer_snapshot, i.issuer_snapshot),
      client_snapshot = coalesce(p_client_snapshot, i.client_snapshot),
      line_items = coalesce(p_line_items, i.line_items),
      tax_snapshot = coalesce(p_tax_snapshot, i.tax_snapshot),
      status = 'sent',
      issue_idempotency_key = coalesce(v_key, i.issue_idempotency_key),
      updated_at = now()
    WHERE i.id = p_draft_id
      AND i.org_id = p_org_id
      AND coalesce(i.status, '') = 'draft';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Draft invoice not found or not convertible.';
    END IF;
  ELSE
    INSERT INTO public.invoices (
      org_id,
      invoice_number,
      financial_year,
      client_id,
      client_name,
      invoice_date,
      due_date,
      trip_ids,
      invoice_source,
      subtotal,
      gst_rate,
      sgst_amount,
      cgst_amount,
      igst_amount,
      total_amount,
      notes,
      payment_terms,
      issuer_snapshot,
      client_snapshot,
      line_items,
      tax_snapshot,
      status,
      created_by,
      issue_idempotency_key
    ) VALUES (
      p_org_id,
      v_number,
      v_fy,
      p_client_id,
      p_client_name,
      coalesce(p_invoice_date, CURRENT_DATE),
      p_due_date,
      '{}'::uuid[],
      'manual',
      coalesce(p_subtotal, 0),
      coalesce(p_gst_rate, 0),
      coalesce(p_sgst_amount, 0),
      coalesce(p_cgst_amount, 0),
      coalesce(p_igst_amount, 0),
      coalesce(p_total_amount, 0),
      p_notes,
      p_payment_terms,
      p_issuer_snapshot,
      p_client_snapshot,
      p_line_items,
      p_tax_snapshot,
      'sent',
      p_created_by,
      v_key
    );
  END IF;

  RETURN v_number;
END;
$$;
