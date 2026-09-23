-- Manual Invoice: typed lines against a client. No Client Plan.
-- Additive. Does not change Commerce order or trip issue RPCs.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_source_check'
  ) THEN
    ALTER TABLE public.invoices DROP CONSTRAINT invoices_invoice_source_check;
  END IF;
  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_invoice_source_check
    CHECK (invoice_source IN ('trip', 'order', 'manual', 'manual_plan'));
END $$;

COMMENT ON COLUMN public.invoices.invoice_source IS
  'trip = Finance Pro trip invoice; order = Commerce sales_order; manual = typed client invoice; manual_plan = unused plan placeholder.';

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

  v_number := public.allocate_invoice_number(p_org_id, NULL);
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

REVOKE ALL ON FUNCTION public.issue_manual_invoice(
  uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric,
  text, date, date, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.issue_manual_invoice(
  uuid, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric,
  text, date, date, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, text
) TO authenticated;

COMMENT ON FUNCTION public.issue_manual_invoice IS
  'Issue a typed Manual Invoice against one client. No trip, order, or Client Plan required. Idempotent via issue_idempotency_key.';
