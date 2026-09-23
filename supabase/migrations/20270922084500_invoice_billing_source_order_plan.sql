-- Additive Commerce Order → Invoice source model.
-- Must sort after issue_idempotency_key (20270922021844).
-- Historical trip invoices keep trip_ids.
-- Manual Plan: client_contracts is the current Plan source.
-- Do NOT FK plan_id to client_contracts (snapshot identity only).
-- HSN/SAC is never invented; operator must supply a 4–8 digit code.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sales_order_id uuid NULL,
  ADD COLUMN IF NOT EXISTS plan_id uuid NULL,
  ADD COLUMN IF NOT EXISTS invoice_source text NOT NULL DEFAULT 'trip',
  ADD COLUMN IF NOT EXISTS billing_period_start date NULL,
  ADD COLUMN IF NOT EXISTS billing_period_end date NULL,
  ADD COLUMN IF NOT EXISTS manual_plan_snapshot jsonb NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_sales_order_id_fkey'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_sales_order_id_fkey
      FOREIGN KEY (sales_order_id)
      REFERENCES public.sales_orders (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Drop any provisional FK that incorrectly treated client_contracts as Client Plan.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_plan_id_fkey'
  ) THEN
    ALTER TABLE public.invoices DROP CONSTRAINT invoices_plan_id_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_source_check'
  ) THEN
    ALTER TABLE public.invoices DROP CONSTRAINT invoices_invoice_source_check;
  END IF;
  ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_invoice_source_check
    CHECK (invoice_source IN ('trip', 'order', 'manual_plan'));
END $$;

COMMENT ON COLUMN public.invoices.sales_order_id IS
  'Commerce sales_orders.id when invoice_source = order. One active invoice per order.';
COMMENT ON COLUMN public.invoices.plan_id IS
  'Manual Plan identity: client_contracts.id. No FK — issued invoices stay immutable if the contract later changes.';
COMMENT ON COLUMN public.invoices.invoice_source IS
  'trip = legacy multi-trip; order = one Commerce sales_order; manual_plan = one client_contracts period.';
COMMENT ON COLUMN public.invoices.manual_plan_snapshot IS
  'Issued Manual Plan snapshot (SKU, operator HSN, rate, period). Never re-read from client_contracts after issue.';

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_per_sales_order
  ON public.invoices (sales_order_id)
  WHERE sales_order_id IS NOT NULL
    AND coalesce(status, '') NOT IN ('void', 'cancelled');

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_active_per_manual_plan_period
  ON public.invoices (org_id, plan_id, billing_period_start, billing_period_end)
  WHERE invoice_source = 'manual_plan'
    AND plan_id IS NOT NULL
    AND billing_period_start IS NOT NULL
    AND billing_period_end IS NOT NULL
    AND coalesce(status, '') NOT IN ('void', 'cancelled');

CREATE INDEX IF NOT EXISTS invoices_org_source_created_at
  ON public.invoices (org_id, invoice_source, created_at DESC);

-- Atomic Commerce order invoice issuance.
-- Billable status: Fulfilled only (matches Commerce lifecycle + isSalesOrderInvoiceable).
CREATE OR REPLACE FUNCTION public.issue_sales_order_invoice(
  p_org_id uuid,
  p_client_id uuid,
  p_client_name text,
  p_sales_order_id uuid,
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
  v_order_status text;
  v_order_customer uuid;
  v_order_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_org_id IS NULL OR p_client_id IS NULL OR p_sales_order_id IS NULL THEN
    RAISE EXCEPTION 'org, client, and sales order are required';
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
  PERFORM pg_advisory_xact_lock(872342, hashtext(p_org_id::text || ':' || p_sales_order_id::text));

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

  SELECT so.status, so.customer_id, so.organization_id
    INTO v_order_status, v_order_customer, v_order_org
  FROM public.sales_orders so
  WHERE so.id = p_sales_order_id
    AND so.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order not found.';
  END IF;
  IF v_order_org IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Sales order does not belong to this workspace.';
  END IF;
  IF v_order_customer IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Invoice client must match the sales order customer.';
  END IF;
  -- Canonical billable status: Fulfilled only.
  IF v_order_status IS DISTINCT FROM 'Fulfilled' THEN
    RAISE EXCEPTION 'Order is not billable (status %). Only Fulfilled orders can be invoiced.', v_order_status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.sales_order_id = p_sales_order_id
      AND coalesce(i.status, '') NOT IN ('void', 'cancelled')
      AND (p_draft_id IS NULL OR i.id IS DISTINCT FROM p_draft_id)
  ) THEN
    RAISE EXCEPTION 'This order already has an active invoice.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND c.organization_id = p_org_id
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Client not found in this workspace.';
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
      sales_order_id = p_sales_order_id,
      invoice_source = 'order',
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
      AND coalesce(i.status, '') = 'draft'
      AND i.sales_order_id IS NOT DISTINCT FROM p_sales_order_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Draft invoice not found or not convertible for this order.';
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
      sales_order_id,
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
      p_sales_order_id,
      'order',
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

REVOKE ALL ON FUNCTION public.issue_sales_order_invoice(
  uuid, uuid, text, uuid, numeric, numeric, numeric, numeric, numeric, numeric,
  text, date, date, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.issue_sales_order_invoice(
  uuid, uuid, text, uuid, numeric, numeric, numeric, numeric, numeric, numeric,
  text, date, date, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, text
) TO authenticated;

COMMENT ON FUNCTION public.issue_sales_order_invoice IS
  'Issue one invoice for one Fulfilled sales_orders row. Empty trip_ids. Idempotent via issue_idempotency_key. Unique active invoice per order.';

-- Manual Plan: one active invoice per org + client_contracts.id + billing period.
-- HSN/SAC must be present on every line (4–8 digits). Never invented in SQL.
CREATE OR REPLACE FUNCTION public.issue_manual_plan_invoice(
  p_org_id uuid,
  p_client_id uuid,
  p_client_name text,
  p_plan_id uuid,
  p_billing_period_start date,
  p_billing_period_end date,
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
  p_payment_terms text DEFAULT NULL,
  p_manual_plan_snapshot jsonb DEFAULT NULL
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
  v_contract_org uuid;
  v_contract_client uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_org_id IS NULL OR p_client_id IS NULL OR p_plan_id IS NULL
     OR p_billing_period_start IS NULL OR p_billing_period_end IS NULL THEN
    RAISE EXCEPTION 'org, client, plan, and billing period are required';
  END IF;

  IF p_billing_period_end < p_billing_period_start THEN
    RAISE EXCEPTION 'Billing period end must be on or after start.';
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
    RAISE EXCEPTION 'Manual plan invoice requires at least one line.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_line_items) AS elem
    WHERE coalesce(elem->>'hsn_sac', '') !~ '^[0-9]{4,8}$'
  ) THEN
    RAISE EXCEPTION 'HSN/SAC is required on every invoice line. Enter a valid 4–8 digit code — do not guess.';
  END IF;

  v_key := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  PERFORM pg_advisory_xact_lock(
    872343,
    hashtext(p_org_id::text || ':' || p_plan_id::text || ':' || p_billing_period_start::text)
  );

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

  SELECT cc.organization_id, cc.client_id
    INTO v_contract_org, v_contract_client
  FROM public.client_contracts cc
  WHERE cc.id = p_plan_id
    AND cc.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client plan not found.';
  END IF;
  IF v_contract_org IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Client plan does not belong to this workspace.';
  END IF;
  IF v_contract_client IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'Invoice client must match the client plan.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.org_id = p_org_id
      AND i.plan_id = p_plan_id
      AND i.invoice_source = 'manual_plan'
      AND i.billing_period_start IS NOT DISTINCT FROM p_billing_period_start
      AND i.billing_period_end IS NOT DISTINCT FROM p_billing_period_end
      AND coalesce(i.status, '') NOT IN ('void', 'cancelled')
      AND (p_draft_id IS NULL OR i.id IS DISTINCT FROM p_draft_id)
  ) THEN
    RAISE EXCEPTION 'This plan already has an active invoice for this billing period.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = p_client_id
      AND c.organization_id = p_org_id
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Client not found in this workspace.';
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
      plan_id = p_plan_id,
      invoice_source = 'manual_plan',
      billing_period_start = p_billing_period_start,
      billing_period_end = p_billing_period_end,
      manual_plan_snapshot = coalesce(p_manual_plan_snapshot, i.manual_plan_snapshot),
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
      AND coalesce(i.status, '') = 'draft'
      AND i.plan_id IS NOT DISTINCT FROM p_plan_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Draft invoice not found or not convertible for this plan.';
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
      plan_id,
      invoice_source,
      billing_period_start,
      billing_period_end,
      manual_plan_snapshot,
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
      p_plan_id,
      'manual_plan',
      p_billing_period_start,
      p_billing_period_end,
      p_manual_plan_snapshot,
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

REVOKE ALL ON FUNCTION public.issue_manual_plan_invoice(
  uuid, uuid, text, uuid, date, date, numeric, numeric, numeric, numeric, numeric, numeric,
  text, date, date, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.issue_manual_plan_invoice(
  uuid, uuid, text, uuid, date, date, numeric, numeric, numeric, numeric, numeric, numeric,
  text, date, date, uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, text, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.issue_manual_plan_invoice IS
  'Issue one Manual Plan invoice for one client_contracts period. HSN required on lines. Unique active invoice per org+plan+period. Idempotent via issue_idempotency_key.';
