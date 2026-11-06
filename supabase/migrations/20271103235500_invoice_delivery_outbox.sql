-- Invoice email / reminder delivery outbox. DATABASE SIDE ONLY.
--
-- Nothing here sends email and nothing is scheduled. A worker (edge function or
-- job) that talks to an approved email provider is still required; see
-- docs/runbooks/invoice-delivery-setup.md. Until then jobs stay 'queued'.
--
--   * one row per delivery, unique per (org, dedupe_key): a retried request or a
--     second scheduler run never queues the same email twice
--   * reminders follow invoice_reminder_rules (org) and the per-customer
--     preference below; only invoices with an open balance are reminded
--   * worker contract (service_role only): claim -> complete | fail; failures
--     retry with bounded exponential backoff, then stop as 'failed'
--   * every state change is kept on the row (attempts, last_error, timestamps)

SET LOCAL lock_timeout = '5s';

CREATE TABLE public.invoice_reminder_client_preferences (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  reminders_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, client_id)
);

CREATE TABLE public.invoice_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  kind text NOT NULL CHECK (kind IN ('invoice_email', 'statement_email', 'reminder_upcoming', 'reminder_overdue')),
  invoice_id uuid REFERENCES public.invoices(id),
  client_id uuid REFERENCES public.clients(id),
  recipients text[] NOT NULL,
  subject text NOT NULL,
  body text,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_delivery_jobs_once UNIQUE (org_id, dedupe_key),
  CONSTRAINT invoice_delivery_jobs_recipients CHECK (cardinality(recipients) BETWEEN 0 AND 20),
  CONSTRAINT invoice_delivery_jobs_sent CHECK (status <> 'sent' OR sent_at IS NOT NULL)
);

CREATE INDEX invoice_delivery_jobs_due
  ON public.invoice_delivery_jobs (next_attempt_at)
  WHERE status = 'queued';
CREATE INDEX invoice_delivery_jobs_org_created
  ON public.invoice_delivery_jobs (org_id, created_at DESC, id);

ALTER TABLE public.invoice_reminder_client_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_delivery_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_reminder_client_preferences_select_member ON public.invoice_reminder_client_preferences
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY invoice_delivery_jobs_select_member ON public.invoice_delivery_jobs
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
REVOKE ALL ON public.invoice_reminder_client_preferences FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.invoice_delivery_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.invoice_reminder_client_preferences TO authenticated;
GRANT SELECT ON public.invoice_delivery_jobs TO authenticated;

-- ---------------------------------------------------------------------------
-- Finance users
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_invoice_reminder_preference(
  p_org_id uuid,
  p_client_id uuid,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  IF p_client_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.organization_id = p_org_id
  ) THEN
    RAISE EXCEPTION 'client not found in this organization';
  END IF;
  INSERT INTO public.invoice_reminder_client_preferences (org_id, client_id, reminders_enabled, updated_by, updated_at)
  VALUES (p_org_id, p_client_id, coalesce(p_enabled, true), auth.uid(), now())
  ON CONFLICT (org_id, client_id) DO UPDATE
  SET reminders_enabled = EXCLUDED.reminders_enabled, updated_by = EXCLUDED.updated_by, updated_at = now();
  RETURN jsonb_build_object('client_id', p_client_id, 'reminders_enabled', coalesce(p_enabled, true));
END;
$$;

-- Queue one invoice email. Same key -> same job.
CREATE OR REPLACE FUNCTION public.queue_invoice_email(
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
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_recipients text[];
  v_invoice public.invoices%ROWTYPE;
  v_job public.invoice_delivery_jobs%ROWTYPE;
BEGIN
  PERFORM public.assert_invoice_payment_authority(p_org_id);
  IF v_key IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 128 THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  SELECT array_agg(DISTINCT lower(btrim(r))) INTO v_recipients
  FROM unnest(coalesce(p_recipients, '{}'::text[])) r
  WHERE btrim(r) <> '';
  IF v_recipients IS NULL OR cardinality(v_recipients) = 0 THEN
    RAISE EXCEPTION 'a recipient is required';
  END IF;
  IF cardinality(v_recipients) > 20 OR EXISTS (
    SELECT 1 FROM unnest(v_recipients) r WHERE r !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ) THEN
    RAISE EXCEPTION 'recipient email is not valid';
  END IF;
  IF nullif(btrim(coalesce(p_subject, '')), '') IS NULL THEN
    RAISE EXCEPTION 'subject is required';
  END IF;
  SELECT * INTO v_invoice FROM public.invoices i
  WHERE i.id = p_invoice_id AND i.org_id = p_org_id AND i.status IN ('sent', 'paid');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice not found in this organization';
  END IF;

  INSERT INTO public.invoice_delivery_jobs (org_id, kind, invoice_id, client_id, recipients, subject, body, dedupe_key, created_by)
  VALUES (p_org_id, 'invoice_email', v_invoice.id, v_invoice.client_id, v_recipients, left(btrim(p_subject), 300),
          left(p_body, 20000), 'invoice_email:' || v_key, auth.uid())
  ON CONFLICT (org_id, dedupe_key) DO NOTHING;
  SELECT * INTO v_job FROM public.invoice_delivery_jobs
  WHERE org_id = p_org_id AND dedupe_key = 'invoice_email:' || v_key;
  RETURN jsonb_build_object('job_id', v_job.id, 'status', v_job.status,
                            'duplicate', v_job.created_at < statement_timestamp());
END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_delivery_register(
  p_org_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  job_id uuid,
  kind text,
  invoice_number text,
  client_name text,
  recipients text[],
  subject text,
  status text,
  attempts integer,
  next_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
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
  SELECT j.id, j.kind, i.invoice_number,
         coalesce(nullif(btrim(coalesce(c.legal_name, '')), ''), c.name),
         j.recipients, j.subject, j.status, j.attempts, j.next_attempt_at, j.last_error, j.sent_at, j.created_at,
         count(*) OVER ()
  FROM public.invoice_delivery_jobs j
  LEFT JOIN public.invoices i ON i.id = j.invoice_id AND i.org_id = p_org_id
  LEFT JOIN public.clients c ON c.id = j.client_id AND c.organization_id = p_org_id
  WHERE j.org_id = p_org_id
  ORDER BY j.created_at DESC, j.id DESC
  LIMIT p_limit
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- Scheduler and worker (service_role only)
-- ---------------------------------------------------------------------------

-- Queue reminders due on p_today (India date). Idempotent: one reminder per
-- invoice, kind and due date. Invoices without a billing email are recorded as
-- 'skipped' with the reason, so the gap is visible instead of silent.
CREATE OR REPLACE FUNCTION public.enqueue_invoice_reminders(p_today date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := coalesce(p_today, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_queued integer := 0;
  v_skipped integer := 0;
  v_row record;
  v_email text;
  v_id uuid;
BEGIN
  FOR v_row IN
    SELECT i.id AS invoice_id, i.org_id, i.client_id, i.invoice_number, i.due_date, i.total_amount,
           CASE WHEN i.due_date = v_today + r.days_before THEN 'reminder_upcoming' ELSE 'reminder_overdue' END AS kind,
           round(i.total_amount
             - coalesce((SELECT sum(a.amount) FROM public.invoice_payment_allocations a
                         WHERE a.org_id = i.org_id AND a.invoice_id = i.id AND a.status = 'confirmed'), 0)
             - coalesce((SELECT sum(c.amount) FROM public.invoice_credit_notes c
                         WHERE c.org_id = i.org_id AND c.invoice_id = i.id AND c.status = 'issued'), 0)
             + coalesce((SELECT sum(rf.amount) FROM public.invoice_customer_refunds rf
                         WHERE rf.org_id = i.org_id AND rf.invoice_id = i.id AND rf.status = 'recorded'
                           AND rf.source_type = 'credit_note'), 0), 2) AS outstanding,
           coalesce(nullif(btrim(coalesce(cl.billing_contact_email, '')), ''), nullif(btrim(coalesce(cl.email, '')), '')) AS email
    FROM public.invoice_reminder_rules r
    JOIN public.invoices i ON i.org_id = r.org_id
    JOIN public.clients cl ON cl.id = i.client_id AND cl.organization_id = i.org_id
    LEFT JOIN public.invoice_reminder_client_preferences pref
      ON pref.org_id = i.org_id AND pref.client_id = i.client_id
    WHERE r.enabled
      AND i.status IN ('sent', 'paid')
      AND i.due_date IS NOT NULL
      AND (i.due_date = v_today + r.days_before OR i.due_date = v_today - r.days_after)
      AND coalesce(pref.reminders_enabled, true)
  LOOP
    CONTINUE WHEN v_row.outstanding <= 0;
    v_email := CASE WHEN v_row.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN lower(v_row.email) END;
    INSERT INTO public.invoice_delivery_jobs (
      org_id, kind, invoice_id, client_id, recipients, subject, body, dedupe_key, status, last_error
    ) VALUES (
      v_row.org_id, v_row.kind, v_row.invoice_id, v_row.client_id,
      CASE WHEN v_email IS NULL THEN '{}'::text[] ELSE ARRAY[v_email] END,
      CASE WHEN v_row.kind = 'reminder_upcoming'
        THEN 'Payment due ' || to_char(v_row.due_date, 'DD Mon YYYY') || ' for invoice ' || v_row.invoice_number
        ELSE 'Payment overdue for invoice ' || v_row.invoice_number END,
      'Outstanding: INR ' || to_char(v_row.outstanding, 'FM999999999990.00') || '. Due date: ' || to_char(v_row.due_date, 'DD Mon YYYY') || '.',
      v_row.kind || ':' || v_row.invoice_id::text || ':' || v_row.due_date::text,
      CASE WHEN v_email IS NULL THEN 'skipped' ELSE 'queued' END,
      CASE WHEN v_email IS NULL THEN 'customer has no billing email' END
    )
    ON CONFLICT (org_id, dedupe_key) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      IF v_email IS NULL THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_queued := v_queued + 1;
        INSERT INTO public.invoice_reminder_events (org_id, invoice_id, kind)
        VALUES (v_row.org_id, v_row.invoice_id, CASE WHEN v_row.kind = 'reminder_upcoming' THEN 'upcoming' ELSE 'overdue' END);
      END IF;
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN jsonb_build_object('date', v_today, 'queued', v_queued, 'skipped', v_skipped);
END;
$$;

-- Take up to p_limit due jobs for sending. A job left in 'sending' for 15 minutes
-- (worker crashed) is taken again. SKIP LOCKED lets several workers run safely.
CREATE OR REPLACE FUNCTION public.claim_invoice_delivery_jobs(p_limit integer DEFAULT 20)
RETURNS SETOF public.invoice_delivery_jobs
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'claim between 1 and 100 jobs';
  END IF;
  RETURN QUERY
  UPDATE public.invoice_delivery_jobs j
  SET status = 'sending', attempts = j.attempts + 1, locked_at = now(), updated_at = now()
  WHERE j.id IN (
    SELECT q.id FROM public.invoice_delivery_jobs q
    WHERE (q.status = 'queued' AND q.next_attempt_at <= now())
       OR (q.status = 'sending' AND q.locked_at < now() - interval '15 minutes')
    ORDER BY q.next_attempt_at, q.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_invoice_delivery_job(p_job_id uuid, p_provider_message_id text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.invoice_delivery_jobs
  SET status = 'sent', sent_at = now(), locked_at = NULL, last_error = NULL,
      provider_message_id = left(p_provider_message_id, 200), updated_at = now()
  WHERE id = p_job_id AND status = 'sending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job is not being sent';
  END IF;
END;
$$;

-- Retry after 5, 10, 20, 40 ... minutes, capped at 6 hours; stop at max_attempts.
CREATE OR REPLACE FUNCTION public.fail_invoice_delivery_job(p_job_id uuid, p_error text, p_retryable boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.invoice_delivery_jobs%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO v_job FROM public.invoice_delivery_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'sending' THEN
    RAISE EXCEPTION 'job is not being sent';
  END IF;
  v_status := CASE WHEN coalesce(p_retryable, true) AND v_job.attempts < v_job.max_attempts THEN 'queued' ELSE 'failed' END;
  UPDATE public.invoice_delivery_jobs
  SET status = v_status,
      locked_at = NULL,
      last_error = left(coalesce(p_error, 'unknown error'), 2000),
      next_attempt_at = CASE WHEN v_status = 'queued'
        THEN now() + least(interval '5 minutes' * power(2, greatest(v_job.attempts - 1, 0)), interval '6 hours')
        ELSE v_job.next_attempt_at END,
      updated_at = now()
  WHERE id = p_job_id;
  RETURN v_status;
END;
$$;

DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.save_invoice_reminder_preference(uuid, uuid, boolean)',
    'public.queue_invoice_email(uuid, uuid, text[], text, text, text)',
    'public.invoice_delivery_register(uuid, integer, integer)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
  END LOOP;
  FOREACH v_sig IN ARRAY ARRAY[
    'public.enqueue_invoice_reminders(date)',
    'public.claim_invoice_delivery_jobs(integer)',
    'public.complete_invoice_delivery_job(uuid, text)',
    'public.fail_invoice_delivery_job(uuid, text, boolean)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END;
$$;
