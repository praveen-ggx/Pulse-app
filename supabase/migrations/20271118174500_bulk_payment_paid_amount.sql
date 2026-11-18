-- Paid amount joins UTR, request ID and transaction date as a bulk payment field.
-- The write is still amount_out on the posted compliance row. Mode is not changed.
-- Not applied to any remote database until an explicit release apply.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.bulk_payment_amount_allowed(p_trip_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_price numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Paid amount must be greater than zero.' USING ERRCODE = '22023';
  END IF;
  SELECT client_price INTO v_price FROM public.trips WHERE id = p_trip_id;
  IF v_price IS NOT NULL AND v_price > 0 AND p_amount > v_price THEN
    RAISE EXCEPTION 'Paid amount exceeds the trip value.' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_payment_normalize_fields(
  p_selection jsonb,
  p_proposed jsonb,
  OUT utr text,
  OUT request_id text,
  OUT txn_date date,
  OUT touch_utr boolean,
  OUT touch_request boolean,
  OUT touch_date boolean
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_key text;
  v_text text;
BEGIN
  IF jsonb_typeof(p_selection) IS DISTINCT FROM 'array' OR jsonb_array_length(p_selection) = 0 THEN
    RAISE EXCEPTION 'Choose at least one payment field.';
  END IF;
  FOR v_key IN SELECT jsonb_array_elements_text(p_selection) LOOP
    IF v_key NOT IN ('utr', 'requestId', 'transactionDate', 'amount') THEN
      RAISE EXCEPTION 'Only UTR, request ID, transaction date and paid amount can be updated.';
    END IF;
  END LOOP;
  touch_utr := p_selection ? 'utr';
  touch_request := p_selection ? 'requestId';
  touch_date := p_selection ? 'transactionDate';
  IF touch_utr THEN
    v_text := upper(regexp_replace(coalesce(p_proposed->>'utr', ''), '\s', '', 'g'));
    IF v_text !~ '^[A-Z0-9/-]{6,40}$' THEN
      RAISE EXCEPTION 'UTR must be 6 to 40 letters, numbers, - or /.' USING ERRCODE = '22023';
    END IF;
    utr := v_text;
  END IF;
  IF touch_request THEN
    v_text := upper(regexp_replace(coalesce(p_proposed->>'requestId', ''), '\s', '', 'g'));
    IF v_text !~ '^[A-Z0-9/_-]{3,40}$' THEN
      RAISE EXCEPTION 'Request ID must be 3 to 40 letters, numbers, -, / or _.' USING ERRCODE = '22023';
    END IF;
    request_id := v_text;
  END IF;
  IF touch_date THEN
    v_text := btrim(coalesce(p_proposed->>'transactionDate', ''));
    IF v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Transaction date must be YYYY-MM-DD.' USING ERRCODE = '22023';
    END IF;
    txn_date := v_text::date;
    IF to_char(txn_date, 'YYYY-MM-DD') IS DISTINCT FROM v_text THEN
      RAISE EXCEPTION 'Transaction date must be YYYY-MM-DD.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_selection ? 'amount' THEN
    v_text := btrim(coalesce(p_proposed->>'amount', ''));
    IF v_text !~ '^[0-9]+(\.[0-9]{1,2})?$' OR v_text::numeric <= 0 THEN
      RAISE EXCEPTION 'Paid amount must be a number greater than zero, with up to 2 decimals.' USING ERRCODE = '22023';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_payment_commit_row(p_row_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.bulk_operation_rows%ROWTYPE;
  v_live record;
  v_description text;
  v_utr text;
  v_request text;
  v_date date;
  v_amount numeric;
  v_updated uuid;
  v_outcome text;
BEGIN
  SELECT * INTO v_row FROM public.bulk_operation_rows WHERE id = p_row_id FOR UPDATE;
  IF NOT FOUND OR v_row.status <> 'ready' THEN
    RETURN 'skipped';
  END IF;
  IF v_row.record_id IS NULL OR v_row.before_values->>'tripId' IS NULL OR v_row.before_values->>'tripId' = '' THEN
    UPDATE public.bulk_operation_rows
       SET status = 'failed', message = 'The payment has no trip.'
     WHERE id = p_row_id;
    PERFORM public.bulk_operation_insert_event(
      v_row.batch_id, v_row.id, v_row.organization_id, 'failed', NULL,
      jsonb_build_object('reason', 'missing_trip', 'rowIndex', v_row.row_index)
    );
    RETURN 'failed';
  END IF;

  SELECT * INTO v_live FROM public.bulk_payment_read_locked((v_row.record_id)::uuid);
  IF NOT FOUND THEN
    UPDATE public.bulk_operation_rows
       SET status = 'failed', message = 'Payment no longer exists.'
     WHERE id = p_row_id;
    PERFORM public.bulk_operation_insert_event(
      v_row.batch_id, v_row.id, v_row.organization_id, 'failed', NULL,
      jsonb_build_object('reason', 'missing_payment', 'rowIndex', v_row.row_index)
    );
    RETURN 'failed';
  END IF;

  IF v_live.organization_id IS DISTINCT FROM (v_row.before_values->>'organizationId')::uuid
     OR v_live.trip_id IS DISTINCT FROM NULLIF(v_row.before_values->>'tripId', '')::uuid
     OR v_live.ledger_category IS DISTINCT FROM v_row.before_values->>'ledgerCategory'
     OR v_live.utr IS DISTINCT FROM coalesce(v_row.before_values->>'utr', '')
     OR v_live.request_id IS DISTINCT FROM coalesce(v_row.before_values->>'requestId', '')
     OR v_live.txn_date IS DISTINCT FROM NULLIF(v_row.before_values->>'transactionDate', '')::date
     OR v_live.amount IS DISTINCT FROM NULLIF(v_row.before_values->>'amount', '')::numeric
     OR v_live.mode IS DISTINCT FROM coalesce(v_row.before_values->>'mode', '') THEN
    UPDATE public.bulk_operation_rows
       SET status = 'stale', message = 'The payment changed after confirmation.'
     WHERE id = p_row_id;
    PERFORM public.bulk_operation_insert_event(
      v_row.batch_id, v_row.id, v_row.organization_id, 'stale', NULL,
      jsonb_build_object('reason', 'stale', 'rowIndex', v_row.row_index)
    );
    RETURN 'stale';
  END IF;

  v_utr := CASE WHEN v_row.proposed_values ? 'utr' THEN v_row.proposed_values->>'utr' ELSE NULL END;
  v_request := CASE WHEN v_row.proposed_values ? 'requestId' THEN v_row.proposed_values->>'requestId' ELSE NULL END;
  v_date := CASE WHEN v_row.proposed_values ? 'transactionDate' THEN (v_row.proposed_values->>'transactionDate')::date ELSE NULL END;
  v_amount := CASE WHEN v_row.proposed_values ? 'amount' THEN (v_row.proposed_values->>'amount')::numeric ELSE NULL END;

  PERFORM public.bulk_payment_field_update_allowed(v_live.trip_id, v_live.ledger_category);

  IF v_utr IS NOT NULL AND upper(v_live.mode) = 'CASH' THEN
    UPDATE public.bulk_operation_rows
       SET status = 'rejected', message = 'Cash payments don''t carry a UTR.'
     WHERE id = p_row_id;
    PERFORM public.bulk_operation_insert_event(
      v_row.batch_id, v_row.id, v_row.organization_id, 'rejected', NULL,
      jsonb_build_object('reason', 'cash', 'rowIndex', v_row.row_index)
    );
    RETURN 'rejected';
  END IF;

  IF v_amount IS NOT NULL THEN
    BEGIN
      PERFORM public.bulk_payment_amount_allowed(v_live.trip_id, v_amount);
    EXCEPTION WHEN SQLSTATE '22023' THEN
      UPDATE public.bulk_operation_rows
         SET status = 'rejected', message = SQLERRM
       WHERE id = p_row_id;
      PERFORM public.bulk_operation_insert_event(
        v_row.batch_id, v_row.id, v_row.organization_id, 'rejected', NULL,
        jsonb_build_object('reason', 'amount', 'rowIndex', v_row.row_index, 'message', SQLERRM)
      );
      RETURN 'rejected';
    END;
  END IF;

  v_description := v_live.description;
  IF v_utr IS NOT NULL THEN
    v_description := public.bulk_ledger_replace_segment(v_description, 'UTR', v_utr);
  END IF;
  IF v_request IS NOT NULL THEN
    v_description := public.bulk_ledger_replace_segment(v_description, 'Request ID', v_request);
  END IF;
  IF v_date IS NOT NULL THEN
    v_description := public.bulk_ledger_confirm_date(v_description);
  END IF;

  UPDATE public.transactions
     SET description = v_description,
         payment_reference = CASE WHEN v_utr IS NULL THEN payment_reference ELSE v_utr END,
         transaction_date = CASE WHEN v_date IS NULL THEN transaction_date ELSE v_date END,
         amount_out = CASE WHEN v_amount IS NULL THEN amount_out ELSE v_amount END
   WHERE id = v_live.transaction_id
     AND organization_id IS NOT DISTINCT FROM v_live.organization_id
     AND trip_id IS NOT DISTINCT FROM v_live.trip_id
     AND amount_out IS NOT DISTINCT FROM v_live.amount
     AND ledger_category IS NOT DISTINCT FROM v_live.ledger_category
     AND transaction_date IS NOT DISTINCT FROM v_live.txn_date
     AND upper(regexp_replace(coalesce(payment_reference, public.bulk_ledger_segment(description, 'UTR'), ''), '\s', '', 'g'))
         IS NOT DISTINCT FROM v_live.utr
     AND coalesce(public.bulk_ledger_segment(description, 'Request ID'), '') IS NOT DISTINCT FROM v_live.request_id
     AND coalesce(public.bulk_ledger_segment(description, 'Mode'), '') IS NOT DISTINCT FROM v_live.mode
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    UPDATE public.bulk_operation_rows
       SET status = 'stale', message = 'The payment changed after confirmation.'
     WHERE id = p_row_id;
    PERFORM public.bulk_operation_insert_event(
      v_row.batch_id, v_row.id, v_row.organization_id, 'stale', NULL,
      jsonb_build_object('reason', 'stale', 'rowIndex', v_row.row_index)
    );
    RETURN 'stale';
  END IF;

  v_outcome := 'applied';
  UPDATE public.bulk_operation_rows
     SET status = 'applied',
         applied_values = jsonb_strip_nulls(jsonb_build_object(
           'utr', v_utr,
           'requestId', v_request,
           'transactionDate', v_date,
           'amount', CASE WHEN v_amount IS NULL THEN NULL ELSE public.bulk_payment_amount_text(v_amount) END
         )),
         message = 'Updated.'
   WHERE id = p_row_id;
  PERFORM public.bulk_operation_insert_event(
    v_row.batch_id, v_row.id, v_row.organization_id, 'applied', NULL,
    jsonb_build_object(
      'rowIndex', v_row.row_index,
      'utr', v_utr,
      'requestId', v_request,
      'transactionDate', v_date,
      'amount', CASE WHEN v_amount IS NULL THEN NULL ELSE public.bulk_payment_amount_text(v_amount) END
    )
  );
  RETURN v_outcome;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_payment_field_submit(
  p_organization_id uuid,
  p_category text,
  p_file_name text,
  p_file_text text,
  p_mapping jsonb,
  p_selection jsonb,
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
  v_selection_text text;
  v_key text;
  v_batch_id uuid;
  v_existing public.bulk_operation_batches%ROWTYPE;
  v_item jsonb;
  v_record_id uuid;
  v_live record;
  v_before jsonb;
  v_proposed jsonb := '{}'::jsonb;
  v_status text;
  v_message text;
  v_ready integer := 0;
  v_constraint text;
  v_field text;
  v_row_id uuid;
  v_found boolean;
  v_amount text;
BEGIN
  IF p_category NOT IN ('compliance_advance', 'compliance_balance') THEN
    RAISE EXCEPTION 'Choose advance or balance.';
  END IF;
  IF btrim(coalesce(p_file_name, '')) = '' OR p_file_text IS NULL THEN
    RAISE EXCEPTION 'Choose a file before confirming.';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'The file has no rows to confirm.';
  END IF;
  IF jsonb_typeof(p_selection) IS DISTINCT FROM 'array' OR jsonb_array_length(p_selection) = 0 THEN
    RAISE EXCEPTION 'Choose at least one payment field.';
  END IF;
  FOR v_field IN SELECT jsonb_array_elements_text(p_selection) LOOP
    IF v_field NOT IN ('utr', 'requestId', 'transactionDate', 'amount') THEN
      RAISE EXCEPTION 'Only UTR, request ID, transaction date and paid amount can be updated.';
    END IF;
  END LOOP;
  v_uid := public.bulk_require_member(p_organization_id, 'trip_compliance.finance.manage');
  v_file_hash := public.bulk_sha256(p_file_text);
  SELECT string_agg(value, ',' ORDER BY value)
    INTO v_selection_text
    FROM jsonb_array_elements_text(p_selection) AS value;
  v_key := public.bulk_sha256(
    p_organization_id::text || E'\n' || p_category || E'\n' || v_selection_text || E'\n' ||
    coalesce(p_mapping, '{}'::jsonb)::text || E'\n' || v_file_hash
  );

  BEGIN
    INSERT INTO public.bulk_operation_batches (
      organization_id, adapter_id, template_id, template_version, operation, status,
      idempotency_key, file_name, file_sha256, file_bytes, mapping, field_selection, summary,
      review_surface, execute_surface, uploaded_by, confirmed_by, execution_owner,
      execution_started_at
    ) VALUES (
      p_organization_id, 'compliance-payment-field-update', 'compliance-payment-field-update', '1',
      'field_update', 'executing', v_key, p_file_name, v_file_hash,
      octet_length(convert_to(p_file_text, 'UTF8')), coalesce(p_mapping, '{}'::jsonb), p_selection,
      jsonb_build_object('category', p_category),
      'trip_compliance.finance.view', 'trip_compliance.finance.manage',
      v_uid, v_uid, v_uid, now()
    )
    RETURNING id INTO v_batch_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'bulk_operation_batches_idem' THEN
      RAISE;
    END IF;
    SELECT * INTO v_existing
      FROM public.bulk_operation_batches
     WHERE organization_id = p_organization_id AND idempotency_key = v_key;
    IF v_existing.status IN ('completed', 'partial', 'failed') OR v_existing.execution_owner IS DISTINCT FROM v_uid THEN
      RETURN jsonb_build_object(
        'batchId', v_existing.id,
        'status', v_existing.status,
        'replayed', v_existing.status IN ('completed', 'partial', 'failed'),
        'inProgress', v_existing.status = 'executing' AND v_existing.execution_owner IS DISTINCT FROM v_uid,
        'resume', false,
        'fileSha256', v_existing.file_sha256
      );
    END IF;
    RETURN jsonb_build_object(
      'batchId', v_existing.id,
      'status', v_existing.status,
      'replayed', false,
      'inProgress', false,
      'resume', true,
      'fileSha256', v_existing.file_sha256
    );
  END;

  PERFORM public.bulk_operation_insert_event(
    v_batch_id, NULL, p_organization_id, 'confirmed', NULL,
    jsonb_build_object('fileName', p_file_name, 'fileSha256', v_file_hash, 'selection', p_selection, 'mapping', p_mapping)
  );
  PERFORM public.bulk_operation_insert_event(
    v_batch_id, NULL, p_organization_id, 'claimed', NULL,
    jsonb_build_object('executionOwner', v_uid)
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_status := 'rejected';
    v_message := 'The row could not be matched to a payment.';
    v_proposed := '{}'::jsonb;
    v_before := '{}'::jsonb;
    v_record_id := NULLIF(v_item->>'recordId', '')::uuid;
    v_found := false;
    IF v_record_id IS NOT NULL THEN
      SELECT * INTO v_live FROM public.bulk_payment_snapshot(v_record_id);
      v_found := FOUND;
    END IF;
    IF v_found
       AND v_live.organization_id = p_organization_id
       AND v_live.ledger_category = p_category THEN
      v_before := jsonb_build_object(
        'transactionId', v_live.transaction_id,
        'organizationId', v_live.organization_id,
        'tripId', v_live.trip_id,
        'ledgerCategory', v_live.ledger_category,
        'utr', v_live.utr,
        'requestId', v_live.request_id,
        'transactionDate', to_char(v_live.txn_date, 'YYYY-MM-DD'),
        'amount', public.bulk_payment_amount_text(v_live.amount),
        'mode', v_live.mode
      );
      IF v_live.trip_id IS NULL THEN
        v_status := 'failed';
        v_message := 'The payment has no trip.';
      ELSE
        BEGIN
          PERFORM public.bulk_payment_normalize_fields(p_selection, coalesce(v_item->'proposed', '{}'::jsonb));
          v_proposed := '{}'::jsonb;
          IF p_selection ? 'utr'
             AND upper(regexp_replace(coalesce(v_item->'proposed'->>'utr', ''), '\s', '', 'g')) IS DISTINCT FROM v_live.utr THEN
            v_proposed := v_proposed || jsonb_build_object(
              'utr', upper(regexp_replace(v_item->'proposed'->>'utr', '\s', '', 'g'))
            );
          END IF;
          IF p_selection ? 'requestId'
             AND upper(regexp_replace(coalesce(v_item->'proposed'->>'requestId', ''), '\s', '', 'g')) IS DISTINCT FROM v_live.request_id THEN
            v_proposed := v_proposed || jsonb_build_object(
              'requestId', upper(regexp_replace(v_item->'proposed'->>'requestId', '\s', '', 'g'))
            );
          END IF;
          IF p_selection ? 'transactionDate'
             AND (v_item->'proposed'->>'transactionDate')::date IS DISTINCT FROM v_live.txn_date THEN
            v_proposed := v_proposed || jsonb_build_object('transactionDate', v_item->'proposed'->>'transactionDate');
          END IF;
          IF p_selection ? 'amount' THEN
            v_amount := public.bulk_payment_amount_text(btrim(v_item->'proposed'->>'amount')::numeric);
            IF v_amount IS DISTINCT FROM public.bulk_payment_amount_text(v_live.amount) THEN
              PERFORM public.bulk_payment_amount_allowed(v_live.trip_id, v_amount::numeric);
              v_proposed := v_proposed || jsonb_build_object('amount', v_amount);
            END IF;
          END IF;
          IF v_proposed = '{}'::jsonb THEN
            v_status := 'already_applied';
            v_message := 'Already matches the posted payment.';
          ELSE
            v_status := 'ready';
            v_message := 'Confirmed. Waiting for the database to apply this row.';
            v_ready := v_ready + 1;
          END IF;
        EXCEPTION WHEN SQLSTATE '22023' THEN
          v_status := 'rejected';
          v_message := SQLERRM;
          v_proposed := '{}'::jsonb;
        END;
      END IF;
    END IF;

    INSERT INTO public.bulk_operation_rows (
      batch_id, organization_id, row_index, match_key, record_id, before_values, proposed_values, status, message
    ) VALUES (
      v_batch_id, p_organization_id, (v_item->>'rowIndex')::integer,
      COALESCE(v_before->>'tripId', v_item->>'recordId'),
      v_record_id::text, v_before, v_proposed, v_status, v_message
    )
    RETURNING id INTO v_row_id;
    IF v_status <> 'ready' THEN
      PERFORM public.bulk_operation_insert_event(
        v_batch_id, v_row_id, p_organization_id,
        CASE v_status WHEN 'already_applied' THEN 'already_applied' WHEN 'failed' THEN 'failed' ELSE 'rejected' END,
        NULL,
        jsonb_build_object('rowIndex', (v_item->>'rowIndex')::integer, 'status', v_status, 'message', v_message)
      );
    END IF;
  END LOOP;

  IF v_ready = 0 THEN
    PERFORM public.bulk_payment_field_finalize(v_batch_id);
  END IF;
  SELECT status INTO v_status FROM public.bulk_operation_batches WHERE id = v_batch_id;
  RETURN jsonb_build_object(
    'batchId', v_batch_id,
    'status', v_status,
    'replayed', false,
    'inProgress', false,
    'resume', false,
    'fileSha256', v_file_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_payment_field_correct(
  p_batch_id uuid,
  p_row_id uuid,
  p_field text,
  p_value text,
  p_corrects_event_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_batch public.bulk_operation_batches%ROWTYPE;
  v_row public.bulk_operation_rows%ROWTYPE;
  v_event public.bulk_operation_events%ROWTYPE;
  v_live record;
  v_norm record;
  v_description text;
  v_updated uuid;
  v_event_id uuid;
  v_amount text;
  v_expected_amount numeric;
BEGIN
  IF p_field NOT IN ('utr', 'requestId', 'transactionDate', 'amount') THEN
    RAISE EXCEPTION 'Only UTR, request ID, transaction date and paid amount can be updated.';
  END IF;
  SELECT * INTO v_batch FROM public.bulk_operation_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.bulk_require_member(v_batch.organization_id, v_batch.execute_surface);
  SELECT * INTO v_row FROM public.bulk_operation_rows WHERE id = p_row_id AND batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_event FROM public.bulk_operation_events WHERE id = p_corrects_event_id;
  IF NOT FOUND OR v_event.batch_id IS DISTINCT FROM p_batch_id OR v_event.row_id IS DISTINCT FROM p_row_id THEN
    RAISE EXCEPTION 'A correction must point at an event for this row.';
  END IF;
  SELECT * INTO v_norm
    FROM public.bulk_payment_normalize_fields(
      jsonb_build_array(p_field),
      jsonb_build_object(p_field, p_value)
    );
  v_amount := CASE
    WHEN p_field = 'amount' THEN public.bulk_payment_amount_text(btrim(p_value)::numeric)
    ELSE NULL
  END;
  SELECT * INTO v_live FROM public.bulk_payment_read_locked((v_row.record_id)::uuid);
  v_expected_amount := COALESCE(
    NULLIF(v_row.applied_values->>'amount', '')::numeric,
    NULLIF(v_row.before_values->>'amount', '')::numeric
  );
  IF NOT FOUND
     OR v_live.organization_id IS DISTINCT FROM (v_row.before_values->>'organizationId')::uuid
     OR v_live.trip_id IS DISTINCT FROM NULLIF(v_row.before_values->>'tripId', '')::uuid
     OR v_live.ledger_category IS DISTINCT FROM v_row.before_values->>'ledgerCategory'
     OR v_live.amount IS DISTINCT FROM v_expected_amount
     OR v_live.mode IS DISTINCT FROM coalesce(v_row.before_values->>'mode', '') THEN
    RAISE EXCEPTION 'Amount, mode, organisation or trip no longer match the confirmed payment.';
  END IF;
  PERFORM public.bulk_payment_field_update_allowed(v_live.trip_id, v_live.ledger_category);
  IF p_field = 'amount' THEN
    PERFORM public.bulk_payment_amount_allowed(v_live.trip_id, v_amount::numeric);
  END IF;

  v_description := v_live.description;
  IF p_field = 'utr' THEN
    IF upper(v_live.mode) = 'CASH' THEN
      RAISE EXCEPTION 'Cash payments don''t carry a UTR.';
    END IF;
    v_description := public.bulk_ledger_replace_segment(v_description, 'UTR', v_norm.utr);
  ELSIF p_field = 'requestId' THEN
    v_description := public.bulk_ledger_replace_segment(v_description, 'Request ID', v_norm.request_id);
  ELSIF p_field = 'transactionDate' THEN
    v_description := public.bulk_ledger_confirm_date(v_description);
  END IF;

  UPDATE public.transactions
     SET description = v_description,
         payment_reference = CASE WHEN p_field = 'utr' THEN v_norm.utr ELSE payment_reference END,
         transaction_date = CASE WHEN p_field = 'transactionDate' THEN v_norm.txn_date ELSE transaction_date END,
         amount_out = CASE WHEN p_field = 'amount' THEN v_amount::numeric ELSE amount_out END
   WHERE id = v_live.transaction_id
     AND organization_id IS NOT DISTINCT FROM v_live.organization_id
     AND trip_id IS NOT DISTINCT FROM v_live.trip_id
     AND amount_out IS NOT DISTINCT FROM v_live.amount
     AND ledger_category IS NOT DISTINCT FROM v_live.ledger_category
     AND coalesce(public.bulk_ledger_segment(description, 'Mode'), '') IS NOT DISTINCT FROM v_live.mode
  RETURNING id INTO v_updated;
  IF v_updated IS NULL THEN
    RAISE EXCEPTION 'Amount, mode, organisation or trip no longer match the confirmed payment.';
  END IF;

  v_event_id := public.bulk_operation_insert_event(
    p_batch_id, p_row_id, v_batch.organization_id, 'corrected', p_corrects_event_id,
    jsonb_build_object('field', p_field, 'value', CASE WHEN p_field = 'amount' THEN v_amount ELSE p_value END)
  );
  UPDATE public.bulk_operation_rows
     SET status = 'corrected',
         applied_values = COALESCE(applied_values, '{}'::jsonb) || CASE
           WHEN p_field = 'amount' THEN jsonb_build_object('amount', v_amount)
           ELSE '{}'::jsonb
         END,
         message = 'Corrected after the original batch.'
   WHERE id = p_row_id;
  RETURN jsonb_build_object('eventId', v_event_id, 'correctsEventId', p_corrects_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_payment_amount_allowed(uuid, numeric) FROM PUBLIC;
