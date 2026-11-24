-- Record a confirmed bulk payment post in the same update log as field updates.
-- The payment itself is already posted. This function only stores the outcome.
-- Not applied to any remote database until an explicit release apply.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.bulk_payment_post_record(
  p_organization_id uuid,
  p_category text,
  p_file_name text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid;
  v_file_hash text;
  v_key text;
  v_batch_id uuid;
  v_item jsonb;
  v_status text;
  v_message text;
  v_trip_id uuid;
  v_row_id uuid;
  v_applied integer := 0;
  v_failed integer := 0;
  v_reason text := NULL;
BEGIN
  IF p_category NOT IN ('compliance_advance', 'compliance_balance') THEN
    RAISE EXCEPTION 'Choose advance or balance.';
  END IF;
  IF btrim(coalesce(p_file_name, '')) = '' THEN
    RAISE EXCEPTION 'Choose a file before confirming.';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'The file has no rows to confirm.';
  END IF;
  v_uid := public.bulk_require_member(p_organization_id, 'trip_compliance.finance.manage');
  v_file_hash := public.bulk_sha256(p_file_name || E'\n' || p_rows::text);
  v_key := public.bulk_sha256(v_file_hash || E'\n' || clock_timestamp()::text);

  INSERT INTO public.bulk_operation_batches (
    organization_id, adapter_id, template_id, template_version, operation, status,
    idempotency_key, file_name, file_sha256, file_bytes, mapping, field_selection, summary,
    review_surface, execute_surface, uploaded_by, confirmed_by, execution_owner,
    execution_started_at
  ) VALUES (
    p_organization_id, 'compliance-payment-post', 'compliance-payment-post', '1',
    'import', 'executing', v_key, p_file_name, v_file_hash,
    octet_length(convert_to(p_rows::text, 'UTF8')), '{}'::jsonb, '[]'::jsonb,
    jsonb_build_object('category', p_category, 'kind', 'post'),
    'trip_compliance.finance.view', 'trip_compliance.finance.manage',
    v_uid, v_uid, v_uid, now()
  )
  RETURNING id INTO v_batch_id;

  PERFORM public.bulk_operation_insert_event(
    v_batch_id, NULL, p_organization_id, 'confirmed', NULL,
    jsonb_build_object('fileName', p_file_name, 'kind', 'post')
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_status := CASE WHEN v_item->>'status' = 'applied' THEN 'applied' ELSE 'failed' END;
    v_message := coalesce(nullif(btrim(v_item->>'message'), ''), CASE WHEN v_status = 'applied' THEN 'Posted.' ELSE 'Not posted.' END);
    v_trip_id := NULLIF(v_item->>'recordId', '')::uuid;
    IF v_status = 'applied' AND NOT EXISTS (
      SELECT 1 FROM public.trips
       WHERE id = v_trip_id
         AND organization_id = p_organization_id
         AND deleted_at IS NULL
    ) THEN
      v_status := 'failed';
      v_message := 'This trip is not in this workspace.';
    END IF;
    IF v_status = 'applied' THEN
      v_applied := v_applied + 1;
    ELSE
      v_failed := v_failed + 1;
      v_reason := v_message;
    END IF;

    INSERT INTO public.bulk_operation_rows (
      batch_id, organization_id, row_index, match_key, record_id, before_values, proposed_values, applied_values, status, message
    ) VALUES (
      v_batch_id, p_organization_id, (v_item->>'rowIndex')::integer,
      coalesce(nullif(v_item->>'matchKey', ''), v_item->>'recordId'),
      v_trip_id::text,
      '{}'::jsonb,
      jsonb_strip_nulls(jsonb_build_object(
        'amount', v_item->>'amount',
        'mode', v_item->>'mode',
        'transactionDate', v_item->>'date',
        'utr', v_item->>'utr'
      )),
      CASE WHEN v_status = 'applied' THEN jsonb_strip_nulls(jsonb_build_object(
        'amount', v_item->>'amount',
        'mode', v_item->>'mode',
        'transactionDate', v_item->>'date',
        'utr', v_item->>'utr'
      )) ELSE NULL END,
      v_status,
      v_message
    )
    RETURNING id INTO v_row_id;

    PERFORM public.bulk_operation_insert_event(
      v_batch_id, v_row_id, p_organization_id,
      CASE WHEN v_status = 'applied' THEN 'applied' ELSE 'failed' END,
      NULL,
      jsonb_build_object('rowIndex', (v_item->>'rowIndex')::integer, 'status', v_status, 'message', v_message)
    );
  END LOOP;

  UPDATE public.bulk_operation_batches
     SET status = CASE
           WHEN v_failed = 0 THEN 'completed'
           WHEN v_applied = 0 THEN 'failed'
           ELSE 'partial'
         END,
         summary = summary || jsonb_build_object(
           'posted', v_applied,
           'failed', v_failed,
           'kind', 'post'
         ) || CASE
           WHEN v_failed = 1 AND v_reason IS NOT NULL THEN jsonb_build_object('reason', v_reason)
           ELSE '{}'::jsonb
         END
   WHERE id = v_batch_id
     AND status = 'executing'
  RETURNING status INTO v_status;

  PERFORM public.bulk_operation_insert_event(
    v_batch_id, NULL, p_organization_id, 'finished', NULL,
    jsonb_build_object('status', v_status, 'posted', v_applied, 'failed', v_failed)
  );

  RETURN jsonb_build_object('batchId', v_batch_id, 'status', v_status, 'posted', v_applied, 'failed', v_failed);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_payment_post_record(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_payment_post_record(uuid, text, text, jsonb) TO authenticated;
