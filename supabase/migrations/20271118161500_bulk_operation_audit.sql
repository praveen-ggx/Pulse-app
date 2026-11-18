-- Shared Bulk Operations audit and execution boundary.
-- Confirmation stores the server snapshot. Each payment row is applied by
-- bulk_payment_field_apply_next, which updates the payment and writes its
-- applied event in the same transaction. Authenticated users can read history.
-- They cannot insert or mutate these tables, and they cannot update a payment
-- through a general-purpose bulk write.
-- Not applied to any remote database until an explicit release apply.

SET LOCAL lock_timeout = '5s';

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.bulk_operation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id),
  adapter_id text NOT NULL,
  template_id text NOT NULL,
  template_version text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('import', 'update', 'field_update')),
  status text NOT NULL CHECK (status IN ('confirmed', 'executing', 'completed', 'partial', 'failed')),
  idempotency_key text NOT NULL,
  file_name text NOT NULL,
  file_sha256 text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_bytes integer NOT NULL CHECK (file_bytes >= 0),
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_selection jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_surface text NOT NULL CHECK (length(btrim(review_surface)) > 0),
  execute_surface text NOT NULL CHECK (length(btrim(execute_surface)) > 0),
  uploaded_by uuid NOT NULL REFERENCES auth.users (id),
  confirmed_by uuid NOT NULL REFERENCES auth.users (id),
  execution_owner uuid NOT NULL REFERENCES auth.users (id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  execution_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bulk_operation_batches_idem UNIQUE (organization_id, idempotency_key),
  CONSTRAINT bulk_operation_batches_id_org UNIQUE (id, organization_id)
);

CREATE INDEX bulk_operation_batches_org_created
  ON public.bulk_operation_batches (organization_id, created_at DESC, id DESC);

CREATE TABLE public.bulk_operation_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  row_index integer NOT NULL CHECK (row_index > 0),
  match_key text,
  record_id text,
  before_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposed_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_values jsonb,
  status text NOT NULL CHECK (status IN (
    'ready', 'applied', 'already_applied', 'stale', 'failed', 'rejected', 'corrected'
  )),
  message text,
  CONSTRAINT bulk_operation_rows_batch_row UNIQUE (batch_id, row_index),
  CONSTRAINT bulk_operation_rows_id_batch_org UNIQUE (id, batch_id, organization_id),
  CONSTRAINT bulk_operation_rows_batch_org_fkey
    FOREIGN KEY (batch_id, organization_id)
    REFERENCES public.bulk_operation_batches (id, organization_id)
);

CREATE INDEX bulk_operation_rows_ready
  ON public.bulk_operation_rows (batch_id, row_index)
  WHERE status = 'ready';

CREATE TABLE public.bulk_operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  row_id uuid,
  organization_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'confirmed', 'claimed', 'applied', 'already_applied', 'stale', 'failed', 'rejected', 'finished', 'corrected'
  )),
  actor_id uuid NOT NULL REFERENCES auth.users (id),
  corrects_event_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bulk_operation_events_batch_org_fkey
    FOREIGN KEY (batch_id, organization_id)
    REFERENCES public.bulk_operation_batches (id, organization_id),
  CONSTRAINT bulk_operation_events_row_fkey
    FOREIGN KEY (row_id, batch_id, organization_id)
    REFERENCES public.bulk_operation_rows (id, batch_id, organization_id),
  CONSTRAINT bulk_operation_events_corrects_fkey
    FOREIGN KEY (corrects_event_id)
    REFERENCES public.bulk_operation_events (id)
);

CREATE INDEX bulk_operation_events_batch
  ON public.bulk_operation_events (batch_id, created_at, id);

COMMENT ON COLUMN public.bulk_operation_batches.execution_owner IS
  'Only this user may continue the batch. There is no automatic takeover. An administrator reassigns the owner in a controlled session; that does not rewrite applied payments.';

ALTER TABLE public.bulk_operation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_operation_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_operation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY bulk_operation_batches_select ON public.bulk_operation_batches
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND (
      public.has_member_surface(organization_id, review_surface)
      OR public.has_member_surface(organization_id, execute_surface)
    )
  );

CREATE POLICY bulk_operation_rows_select ON public.bulk_operation_rows
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1
        FROM public.bulk_operation_batches b
       WHERE b.id = bulk_operation_rows.batch_id
         AND b.organization_id = bulk_operation_rows.organization_id
         AND (
           public.has_member_surface(b.organization_id, b.review_surface)
           OR public.has_member_surface(b.organization_id, b.execute_surface)
         )
    )
  );

CREATE POLICY bulk_operation_events_select ON public.bulk_operation_events
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1
        FROM public.bulk_operation_batches b
       WHERE b.id = bulk_operation_events.batch_id
         AND b.organization_id = bulk_operation_events.organization_id
         AND (
           public.has_member_surface(b.organization_id, b.review_surface)
           OR public.has_member_surface(b.organization_id, b.execute_surface)
         )
    )
  );

CREATE OR REPLACE FUNCTION public.bulk_operation_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'bulk operation events are append-only';
END;
$$;

CREATE TRIGGER bulk_operation_events_no_update
  BEFORE UPDATE OR DELETE ON public.bulk_operation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.bulk_operation_events_immutable();

CREATE OR REPLACE FUNCTION public.bulk_operation_batch_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.uploaded_by IS DISTINCT FROM auth.uid()
     OR NEW.confirmed_by IS DISTINCT FROM auth.uid()
     OR NEW.execution_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'actor columns must be the signed-in user';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
    OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
    OR NEW.execution_owner IS DISTINCT FROM OLD.execution_owner
    OR NEW.review_surface IS DISTINCT FROM OLD.review_surface
    OR NEW.execute_surface IS DISTINCT FROM OLD.execute_surface
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.file_sha256 IS DISTINCT FROM OLD.file_sha256
  ) THEN
    RAISE EXCEPTION 'batch identity columns are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bulk_operation_batches_guard
  BEFORE INSERT OR UPDATE ON public.bulk_operation_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.bulk_operation_batch_guard();

CREATE OR REPLACE FUNCTION public.bulk_operation_event_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.actor_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'actor columns must be the signed-in user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bulk_operation_events_actor
  BEFORE INSERT ON public.bulk_operation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.bulk_operation_event_actor();

CREATE OR REPLACE FUNCTION public.bulk_sha256(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_hash text;
BEGIN
  BEGIN
    EXECUTE 'SELECT encode(extensions.digest(convert_to($1, ''UTF8''), ''sha256''), ''hex'')'
      INTO v_hash
      USING p_text;
  EXCEPTION
    WHEN undefined_function OR invalid_schema_name THEN
      EXECUTE 'SELECT encode(public.digest(convert_to($1, ''UTF8''), ''sha256''), ''hex'')'
        INTO v_hash
        USING p_text;
  END;
  RETURN v_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_ledger_segment(p_description text, p_label text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_body text;
  v_part text;
  v_idx integer;
BEGIN
  v_body := coalesce(p_description, '');
  v_idx := position('[[QMETA:' in v_body);
  IF v_idx > 0 THEN
    v_body := substring(v_body from 1 for v_idx - 1);
  END IF;
  FOREACH v_part IN ARRAY regexp_split_to_array(v_body, '\|') LOOP
    v_part := btrim(v_part);
    IF v_part ILIKE (p_label || ':%') THEN
      RETURN btrim(substring(v_part from char_length(p_label) + 2));
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_ledger_replace_segment(
  p_description text,
  p_label text,
  p_value text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_raw text := coalesce(p_description, '');
  v_meta text := '';
  v_body text;
  v_idx integer;
  v_parts text[] := ARRAY[]::text[];
  v_part text;
  v_anchor integer := 0;
  v_pos integer := 0;
  v_mode integer := 0;
  v_utr integer := 0;
BEGIN
  v_idx := position('[[QMETA:' in v_raw);
  IF v_idx > 0 THEN
    v_body := btrim(substring(v_raw from 1 for v_idx - 1));
    v_meta := btrim(substring(v_raw from v_idx));
  ELSE
    v_body := btrim(v_raw);
  END IF;
  FOREACH v_part IN ARRAY regexp_split_to_array(v_body, '\|') LOOP
    v_part := btrim(v_part);
    IF v_part = '' OR v_part ILIKE (p_label || ':%') THEN
      CONTINUE;
    END IF;
    v_parts := array_append(v_parts, v_part);
  END LOOP;
  IF coalesce(array_length(v_parts, 1), 0) = 0 THEN
    v_parts := ARRAY['ENTRY'];
  END IF;
  FOREACH v_part IN ARRAY v_parts LOOP
    v_pos := v_pos + 1;
    IF v_part ILIKE 'Mode:%' THEN
      v_mode := v_pos;
    ELSIF v_part ILIKE 'UTR:%' THEN
      v_utr := v_pos;
    END IF;
  END LOOP;
  IF p_label ILIKE 'Request ID' THEN
    v_anchor := greatest(v_utr, v_mode);
  ELSE
    v_anchor := v_mode;
  END IF;
  IF v_anchor = 0 THEN
    v_anchor := 1;
  END IF;
  v_parts := v_parts[1:v_anchor] || ARRAY[p_label || ': ' || p_value] || v_parts[v_anchor + 1:coalesce(array_length(v_parts, 1), 0)];
  IF v_meta = '' THEN
    RETURN array_to_string(v_parts, ' | ');
  END IF;
  RETURN array_to_string(v_parts, ' | ') || ' ' || v_meta;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_ledger_confirm_date(p_description text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_raw text := btrim(coalesce(p_description, ''));
  v_idx integer := position('[[QMETA:' in v_raw);
  v_body text;
  v_meta text;
  v_json text;
  v_parsed jsonb;
BEGIN
  IF v_idx > 0 THEN
    v_body := btrim(substring(v_raw from 1 for v_idx - 1));
    v_meta := btrim(substring(v_raw from v_idx));
    v_json := regexp_replace(substring(v_meta from char_length('[[QMETA:') + 1), '\]\]\s*$', '');
    BEGIN
      v_parsed := v_json::jsonb;
    EXCEPTION WHEN others THEN
      v_parsed := '{}'::jsonb;
    END;
  ELSE
    v_body := v_raw;
    v_parsed := '{}'::jsonb;
  END IF;
  v_meta := '[[QMETA:' || (v_parsed || jsonb_build_object('compliance_txn_date_set', true))::text || ']]';
  IF v_body = '' THEN
    RETURN v_meta;
  END IF;
  RETURN v_body || ' ' || v_meta;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_require_member(p_organization_id uuid, p_surface text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Batch not found.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_member_surface(p_organization_id, p_surface) THEN
    RAISE EXCEPTION 'Compliance finance manage access is required.' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
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
    IF v_key NOT IN ('utr', 'requestId', 'transactionDate') THEN
      RAISE EXCEPTION 'Only UTR, request ID and transaction date can be updated.';
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
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_payment_snapshot(p_transaction_id uuid)
RETURNS TABLE (
  transaction_id uuid,
  organization_id uuid,
  trip_id uuid,
  ledger_category text,
  utr text,
  request_id text,
  txn_date date,
  amount numeric,
  mode text,
  description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    t.id,
    t.organization_id,
    t.trip_id,
    t.ledger_category,
    upper(regexp_replace(coalesce(t.payment_reference, public.bulk_ledger_segment(t.description, 'UTR'), ''), '\s', '', 'g')),
    coalesce(public.bulk_ledger_segment(t.description, 'Request ID'), ''),
    t.transaction_date,
    t.amount_out,
    coalesce(public.bulk_ledger_segment(t.description, 'Mode'), ''),
    t.description
  FROM public.transactions t
  WHERE t.id = p_transaction_id;
$$;

CREATE OR REPLACE FUNCTION public.bulk_payment_read_locked(p_transaction_id uuid)
RETURNS TABLE (
  transaction_id uuid,
  organization_id uuid,
  trip_id uuid,
  ledger_category text,
  utr text,
  request_id text,
  txn_date date,
  amount numeric,
  mode text,
  description text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.organization_id,
    t.trip_id,
    t.ledger_category,
    upper(regexp_replace(coalesce(t.payment_reference, public.bulk_ledger_segment(t.description, 'UTR'), ''), '\s', '', 'g')),
    coalesce(public.bulk_ledger_segment(t.description, 'Request ID'), ''),
    t.transaction_date,
    t.amount_out,
    coalesce(public.bulk_ledger_segment(t.description, 'Mode'), ''),
    t.description
  FROM public.transactions t
  WHERE t.id = p_transaction_id
  FOR UPDATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_payment_amount_text(p_amount numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_amount IS NULL THEN NULL
    ELSE trim(to_char(p_amount, 'FM999999999990.009999'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_operation_insert_event(
  p_batch_id uuid,
  p_row_id uuid,
  p_organization_id uuid,
  p_event_type text,
  p_corrects_event_id uuid,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.bulk_operation_events (
    batch_id, row_id, organization_id, event_type, actor_id, corrects_event_id, payload
  ) VALUES (
    p_batch_id, p_row_id, p_organization_id, p_event_type, auth.uid(), p_corrects_event_id, coalesce(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_payment_field_finalize(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org uuid;
  v_applied integer;
  v_failed integer;
  v_status text;
BEGIN
  SELECT organization_id INTO v_org
    FROM public.bulk_operation_batches
   WHERE id = p_batch_id
   FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.bulk_operation_rows
     WHERE batch_id = p_batch_id AND status = 'ready'
  ) THEN
    RETURN 'executing';
  END IF;
  SELECT
    count(*) FILTER (WHERE status IN ('applied', 'already_applied', 'corrected'))::integer,
    count(*) FILTER (WHERE status IN ('failed', 'stale', 'rejected'))::integer
    INTO v_applied, v_failed
    FROM public.bulk_operation_rows
   WHERE batch_id = p_batch_id;
  v_status := CASE
    WHEN v_failed = 0 THEN 'completed'
    WHEN v_applied = 0 THEN 'failed'
    ELSE 'partial'
  END;
  UPDATE public.bulk_operation_batches
     SET status = v_status,
         summary = summary || jsonb_build_object('outcomes', jsonb_build_object('applied', v_applied, 'failed', v_failed))
   WHERE id = p_batch_id
     AND status = 'executing';
  IF FOUND THEN
    PERFORM public.bulk_operation_insert_event(p_batch_id, NULL, v_org, 'finished', NULL, jsonb_build_object('status', v_status));
  END IF;
  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_payment_field_update_allowed(
  p_trip_id uuid,
  p_category text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_category = 'compliance_advance' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.trips
       WHERE id = p_trip_id AND compliance_verified_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'compliance must be verified before this payment can be edited';
    END IF;
  ELSIF p_category = 'compliance_balance' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.trips
       WHERE id = p_trip_id AND pod_received_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'hard-copy POD must be received before this payment can be edited';
    END IF;
  ELSE
    RAISE EXCEPTION 'Choose advance or balance.';
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
         transaction_date = CASE WHEN v_date IS NULL THEN transaction_date ELSE v_date END
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
         applied_values = jsonb_strip_nulls(jsonb_build_object('utr', v_utr, 'requestId', v_request, 'transactionDate', v_date)),
         message = 'Updated.'
   WHERE id = p_row_id;
  PERFORM public.bulk_operation_insert_event(
    v_row.batch_id, v_row.id, v_row.organization_id, 'applied', NULL,
    jsonb_build_object('rowIndex', v_row.row_index, 'utr', v_utr, 'requestId', v_request, 'transactionDate', v_date)
  );
  RETURN v_outcome;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_operation_row_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'bulk operation rows are kept for audit';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.before_values IS DISTINCT FROM OLD.before_values
     OR NEW.proposed_values IS DISTINCT FROM OLD.proposed_values
     OR NEW.record_id IS DISTINCT FROM OLD.record_id
     OR NEW.row_index IS DISTINCT FROM OLD.row_index THEN
    RAISE EXCEPTION 'row snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bulk_operation_rows_guard
  BEFORE UPDATE OR DELETE ON public.bulk_operation_rows
  FOR EACH ROW
  EXECUTE FUNCTION public.bulk_operation_row_guard();

CREATE OR REPLACE FUNCTION public.bulk_operation_batch_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'bulk operation batches are kept for audit';
END;
$$;

CREATE TRIGGER bulk_operation_batches_no_delete
  BEFORE DELETE ON public.bulk_operation_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.bulk_operation_batch_no_delete();

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
    IF v_field NOT IN ('utr', 'requestId', 'transactionDate') THEN
      RAISE EXCEPTION 'Only UTR, request ID and transaction date can be updated.';
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

CREATE OR REPLACE FUNCTION public.bulk_payment_field_apply_next(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_batch public.bulk_operation_batches%ROWTYPE;
  v_row_id uuid;
  v_row_index integer;
  v_outcome text;
  v_error text;
  v_status text;
BEGIN
  SELECT * INTO v_batch FROM public.bulk_operation_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found.' USING ERRCODE = '42501';
  END IF;
  PERFORM public.bulk_require_member(v_batch.organization_id, v_batch.execute_surface);
  IF v_batch.status IN ('completed', 'partial', 'failed') THEN
    RETURN jsonb_build_object('done', true, 'replayed', true, 'batchStatus', v_batch.status, 'outcome', NULL);
  END IF;
  IF v_batch.status <> 'executing' OR v_batch.execution_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This file is already being updated.' USING ERRCODE = '42501';
  END IF;

  SELECT id, row_index INTO v_row_id, v_row_index
    FROM public.bulk_operation_rows
   WHERE batch_id = p_batch_id AND status = 'ready'
   ORDER BY row_index
   LIMIT 1
   FOR UPDATE;
  IF v_row_id IS NULL THEN
    v_status := public.bulk_payment_field_finalize(p_batch_id);
    RETURN jsonb_build_object('done', true, 'replayed', false, 'batchStatus', v_status, 'outcome', NULL);
  END IF;

  BEGIN
    v_outcome := public.bulk_payment_commit_row(v_row_id);
    v_error := NULL;
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_outcome := 'failed';
  END;
  IF v_error IS NOT NULL THEN
    UPDATE public.bulk_operation_rows
       SET status = 'failed', message = v_error
     WHERE id = v_row_id AND status = 'ready';
    PERFORM public.bulk_operation_insert_event(
      p_batch_id, v_row_id, v_batch.organization_id, 'failed', NULL,
      jsonb_build_object('rowIndex', v_row_index, 'message', v_error)
    );
  END IF;
  v_status := public.bulk_payment_field_finalize(p_batch_id);
  RETURN jsonb_build_object(
    'done', v_status <> 'executing',
    'replayed', false,
    'batchStatus', v_status,
    'rowId', v_row_id,
    'rowIndex', v_row_index,
    'outcome', v_outcome
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
BEGIN
  IF p_field NOT IN ('utr', 'requestId', 'transactionDate') THEN
    RAISE EXCEPTION 'Only UTR, request ID and transaction date can be updated.';
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
  SELECT * INTO v_live FROM public.bulk_payment_read_locked((v_row.record_id)::uuid);
  IF NOT FOUND
     OR v_live.organization_id IS DISTINCT FROM (v_row.before_values->>'organizationId')::uuid
     OR v_live.trip_id IS DISTINCT FROM NULLIF(v_row.before_values->>'tripId', '')::uuid
     OR v_live.ledger_category IS DISTINCT FROM v_row.before_values->>'ledgerCategory'
     OR v_live.amount IS DISTINCT FROM NULLIF(v_row.before_values->>'amount', '')::numeric
     OR v_live.mode IS DISTINCT FROM coalesce(v_row.before_values->>'mode', '') THEN
    RAISE EXCEPTION 'Amount, mode, organisation or trip no longer match the confirmed payment.';
  END IF;
  PERFORM public.bulk_payment_field_update_allowed(v_live.trip_id, v_live.ledger_category);

  v_description := v_live.description;
  IF p_field = 'utr' THEN
    IF upper(v_live.mode) = 'CASH' THEN
      RAISE EXCEPTION 'Cash payments don''t carry a UTR.';
    END IF;
    v_description := public.bulk_ledger_replace_segment(v_description, 'UTR', v_norm.utr);
  ELSIF p_field = 'requestId' THEN
    v_description := public.bulk_ledger_replace_segment(v_description, 'Request ID', v_norm.request_id);
  ELSE
    v_description := public.bulk_ledger_confirm_date(v_description);
  END IF;

  UPDATE public.transactions
     SET description = v_description,
         payment_reference = CASE WHEN p_field = 'utr' THEN v_norm.utr ELSE payment_reference END,
         transaction_date = CASE WHEN p_field = 'transactionDate' THEN v_norm.txn_date ELSE transaction_date END
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
    jsonb_build_object('field', p_field, 'value', p_value)
  );
  UPDATE public.bulk_operation_rows
     SET status = 'corrected', message = 'Corrected after the original batch.'
   WHERE id = p_row_id;
  RETURN jsonb_build_object('eventId', v_event_id, 'correctsEventId', p_corrects_event_id);
END;
$$;

REVOKE ALL ON TABLE public.bulk_operation_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bulk_operation_rows FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.bulk_operation_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.bulk_operation_batches TO authenticated;
GRANT SELECT ON public.bulk_operation_rows TO authenticated;
GRANT SELECT ON public.bulk_operation_events TO authenticated;

REVOKE ALL ON FUNCTION public.bulk_sha256(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_ledger_segment(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_ledger_replace_segment(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_ledger_confirm_date(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_require_member(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_payment_normalize_fields(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_payment_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_payment_read_locked(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_payment_amount_text(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_operation_insert_event(uuid, uuid, uuid, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_payment_field_finalize(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_payment_field_update_allowed(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_payment_commit_row(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_operation_events_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_operation_batch_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_operation_event_actor() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_operation_row_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_operation_batch_no_delete() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.bulk_payment_field_submit(uuid, text, text, text, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_payment_field_apply_next(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_payment_field_correct(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_payment_field_submit(uuid, text, text, text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_payment_field_apply_next(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_payment_field_correct(uuid, uuid, text, text, uuid) TO authenticated;
