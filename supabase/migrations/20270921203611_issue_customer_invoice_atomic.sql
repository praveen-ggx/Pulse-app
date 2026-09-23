-- Atomic customer invoice issuance: validate + allocate number + insert
-- invoices (+ trip_ids allocation) in one transaction.
-- Workflow events stay client-side, after this function commits.
-- NULL clients.invoice_pod_policy is unconfigured (not a workspace/device default).

COMMENT ON COLUMN public.clients.invoice_pod_policy IS
  'Client-level invoice POD requirement. NULL = unconfigured (invoicing blocked until none | soft_copy | hard_copy is set). Does not inherit browser or workspace AsyncStorage.';

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
  p_created_by uuid DEFAULT NULL
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
  v_fy text;
  v_trip_count int;
  v_completed_count int;
  v_client_match int;
  v_missing_soft int;
  v_missing_hard int;
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

  PERFORM pg_advisory_xact_lock(872341, hashtext(p_org_id::text));

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

  v_number := public.allocate_invoice_number(p_org_id, NULL);
  IF v_number IS NULL OR btrim(v_number) = '' THEN
    RAISE EXCEPTION 'Could not allocate an invoice number. Please try again.';
  END IF;

  v_fy := split_part(v_number, '/', 2);
  IF v_fy IS NULL OR v_fy = '' THEN
    RAISE EXCEPTION 'Could not allocate an invoice number. Please try again.';
  END IF;

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
    created_by
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
    p_created_by
  );

  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_customer_invoice(
  uuid, uuid, text, uuid[], numeric, numeric, numeric, numeric, numeric, numeric, text, date, date, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.issue_customer_invoice(
  uuid, uuid, text, uuid[], numeric, numeric, numeric, numeric, numeric, numeric, text, date, date, uuid
) TO authenticated;

COMMENT ON FUNCTION public.issue_customer_invoice(
  uuid, uuid, text, uuid[], numeric, numeric, numeric, numeric, numeric, numeric, text, date, date, uuid
) IS
  'Atomically validates eligibility, allocates invoice_sequences, and inserts public.invoices.trip_ids. Does not write trip_workflow_events.';
