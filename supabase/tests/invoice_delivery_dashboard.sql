-- Finance dashboard aggregate and the invoice delivery outbox, on a real database.
-- Local only; synthetic fixtures; rolls back. No email is sent: the outbox has no
-- sender, and these functions make no network calls (checked below).
--
--   docker exec -i <db-container> psql -U postgres -d <db> -v ON_ERROR_STOP=1 < supabase/tests/invoice_delivery_dashboard.sql
--
-- Requires 20271103213000 .. 20271103235500.

\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.id(p_name text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE p_name
    WHEN 'ORG'   THEN 'f3000000-0000-4000-8000-00000000a001'
    WHEN 'ORG_B' THEN 'f3000000-0000-4000-8000-00000000b001'
    WHEN 'FIN'   THEN 'f3000000-0000-4000-8000-00000000f001'
    WHEN 'CLERK' THEN 'f3000000-0000-4000-8000-00000000c001'
    WHEN 'OUT'   THEN 'f3000000-0000-4000-8000-00000000e001'
    WHEN 'C1'    THEN 'f3000000-0000-4000-8000-0000000c1001'
    WHEN 'C2'    THEN 'f3000000-0000-4000-8000-0000000c2001'
    WHEN 'C3'    THEN 'f3000000-0000-4000-8000-0000000c3001'
    WHEN 'I_OVER'  THEN 'f3000000-0000-4000-8000-000000000101'
    WHEN 'I_CUR'   THEN 'f3000000-0000-4000-8000-000000000102'
    WHEN 'I_PAID'  THEN 'f3000000-0000-4000-8000-000000000103'
    WHEN 'I_UP'    THEN 'f3000000-0000-4000-8000-000000000104'
    WHEN 'I_OPT'   THEN 'f3000000-0000-4000-8000-000000000105'
    WHEN 'I_NOMAIL' THEN 'f3000000-0000-4000-8000-000000000106'
    WHEN 'I_DRAFT' THEN 'f3000000-0000-4000-8000-000000000107'
    WHEN 'I_CANC'  THEN 'f3000000-0000-4000-8000-000000000108'
  END)::uuid;
$$;

CREATE FUNCTION pg_temp.check(p_label text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL %: %', p_label, coalesce(p_detail, 'condition was false');
  END IF;
  RAISE NOTICE 'PASS: %', p_label;
END;
$$;

CREATE FUNCTION pg_temp.expect_error(p_label text, p_sql text, p_pattern text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_msg text;
  v_state text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE;
    IF v_msg ILIKE p_pattern OR v_state = p_pattern THEN
      RAISE NOTICE 'PASS: % [% %]', p_label, v_state, v_msg;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FAIL %: unexpected error % %', p_label, v_state, v_msg;
  END;
  RAISE EXCEPTION 'FAIL %: statement succeeded', p_label;
END;
$$;

CREATE FUNCTION pg_temp.as_user(p_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.id(p_name)::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_name), 'role', 'authenticated')::text, true);
END;
$$;

-- India date, the same "today" the functions use.
CREATE FUNCTION pg_temp.today() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  (pg_temp.id('FIN'), 'dd-finance@test.local', '{}'),
  (pg_temp.id('CLERK'), 'dd-clerk@test.local', '{}'),
  (pg_temp.id('OUT'), 'dd-outsider@test.local', '{}');
INSERT INTO public.organizations (id, name) VALUES
  (pg_temp.id('ORG'), 'DD Test Org'), (pg_temp.id('ORG_B'), 'DD Other Org');
INSERT INTO public.organization_members (organization_id, user_id, status, role) VALUES
  (pg_temp.id('ORG'), pg_temp.id('FIN'), 'active', 'owner'),
  (pg_temp.id('ORG'), pg_temp.id('CLERK'), 'active', 'member'),
  (pg_temp.id('ORG_B'), pg_temp.id('OUT'), 'active', 'owner');
INSERT INTO public.clients (id, organization_id, name, phone, email, billing_contact_email) VALUES
  (pg_temp.id('C1'), pg_temp.id('ORG'), 'DD Client One', '9000000501', 'one@client.test', 'Billing@Client.Test'),
  (pg_temp.id('C2'), pg_temp.id('ORG'), 'DD Client Opted Out', '9000000502', 'two@client.test', NULL),
  (pg_temp.id('C3'), pg_temp.id('ORG'), 'DD Client No Mail', '9000000503', NULL, NULL);
INSERT INTO public.invoices (id, org_id, invoice_number, financial_year, client_id, client_name, total_amount, status, invoice_date, due_date) VALUES
  (pg_temp.id('I_OVER'),  pg_temp.id('ORG'), 'DD-1', '2026-27', pg_temp.id('C1'), 'DD Client One', 1000, 'sent', pg_temp.today() - 52, pg_temp.today() - 7),
  (pg_temp.id('I_CUR'),   pg_temp.id('ORG'), 'DD-2', '2026-27', pg_temp.id('C1'), 'DD Client One', 500,  'sent', pg_temp.today() - 2,  pg_temp.today() + 28),
  (pg_temp.id('I_PAID'),  pg_temp.id('ORG'), 'DD-3', '2026-27', pg_temp.id('C1'), 'DD Client One', 300,  'sent', pg_temp.today() - 40, pg_temp.today() - 7),
  (pg_temp.id('I_UP'),    pg_temp.id('ORG'), 'DD-4', '2026-27', pg_temp.id('C1'), 'DD Client One', 200,  'sent', pg_temp.today() - 20, pg_temp.today() + 3),
  (pg_temp.id('I_OPT'),   pg_temp.id('ORG'), 'DD-5', '2026-27', pg_temp.id('C2'), 'DD Client Opted Out', 400, 'sent', pg_temp.today() - 30, pg_temp.today() - 7),
  (pg_temp.id('I_NOMAIL'),pg_temp.id('ORG'), 'DD-6', '2026-27', pg_temp.id('C3'), 'DD Client No Mail', 600, 'sent', pg_temp.today() - 30, pg_temp.today() + 3),
  (pg_temp.id('I_DRAFT'), pg_temp.id('ORG'), 'DRAFT/DD-7', 'DRAFT', pg_temp.id('C1'), 'DD Client One', 900, 'draft', pg_temp.today(), pg_temp.today() + 3),
  (pg_temp.id('I_CANC'),  pg_temp.id('ORG'), 'DD-8', '2026-27', pg_temp.id('C1'), 'DD Client One', 700, 'cancelled', pg_temp.today() - 10, pg_temp.today() - 7);
INSERT INTO public.invoice_reminder_rules (org_id, days_before, days_after, enabled) VALUES (pg_temp.id('ORG'), 3, 7, true);
INSERT INTO public.invoice_bank_lines (org_id, import_key, txn_date, reference, credit, debit) VALUES
  (pg_temp.id('ORG'), 'dd-1', pg_temp.today(), 'UTR-DD-X', 250, 0),
  (pg_temp.id('ORG'), 'dd-2', pg_temp.today(), 'CHG', 0, 10);

SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('FIN');

-- ===========================================================================
-- Dashboard
-- ===========================================================================
DO $$
DECLARE
  d jsonb;
  m jsonb;
  r jsonb;
BEGIN
  PERFORM public.record_invoice_payment(pg_temp.id('ORG'), pg_temp.id('C1'), pg_temp.today(), 300, 'neft', 'UTR-DD-1', NULL, NULL, NULL, 'dd-pay-paid-1',
          jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I_PAID'), 'amount', 300)));
  PERFORM public.record_customer_receipt(pg_temp.id('ORG'), pg_temp.id('C1'), pg_temp.today(), 360, 40, 'neft', 'UTR-DD-2', NULL, NULL, NULL, 'dd-pay-over-1',
          jsonb_build_array(jsonb_build_object('invoice_id', pg_temp.id('I_OVER'), 'amount', 300)));
  r := public.issue_invoice_credit_note(pg_temp.id('ORG'), pg_temp.id('I_PAID'), pg_temp.today(), 'Damage', 'no_gst',
          '[{"description":"Damage","amount":50}]', 'dd-cn-0000001');
  PERFORM public.record_customer_refund(pg_temp.id('ORG'), 'credit_note', (r->>'credit_note_id')::uuid, pg_temp.today(), 20, 'neft', NULL, NULL, 'dd-rfd-000001');

  d := public.invoice_finance_dashboard(pg_temp.id('ORG'), pg_temp.today() - 90, pg_temp.today());
  PERFORM pg_temp.check('dashboard outstanding = open invoices (draft and cancelled excluded)',
    (d->'receivables'->>'outstanding')::numeric = 700 + 500 + 200 + 400 + 600
    AND (d->'receivables'->>'open_invoices')::int = 5, d::text);
  PERFORM pg_temp.check('dashboard aging buckets by due date',
    (d->'receivables'->>'days_1_30')::numeric = 700 + 400
    AND (d->'receivables'->>'current')::numeric = 500 + 200 + 600, d->>'receivables');
  PERFORM pg_temp.check('dashboard outstanding equals org aging',
    (d->'receivables'->>'outstanding')::numeric
      = (SELECT sum(amount_outstanding) FROM public.org_receivables_aging(pg_temp.id('ORG'), 500, 0)));
  PERFORM pg_temp.check('dashboard: credit-note credit net of refunds, unapplied receipts',
    (d->'receivables'->>'credit_note_credit')::numeric = 30 AND (d->>'unapplied_receipts')::numeric = 100, d::text);
  SELECT x INTO m FROM jsonb_array_elements(d->'months') x WHERE (x->>'month')::date = date_trunc('month', pg_temp.today())::date;
  PERFORM pg_temp.check('this month: collections split bank / TDS, credit notes and refunds separate',
    (m->>'collected_bank')::numeric = 660 AND (m->>'collected_tds')::numeric = 40
    AND (m->>'credit_notes')::numeric = 50 AND (m->>'refunds')::numeric = 20 AND (m->>'receipt_count')::int = 2, m::text);
  PERFORM pg_temp.check('monthly series covers the period without gaps',
    jsonb_array_length(d->'months') = (SELECT count(*) FROM generate_series(date_trunc('month', pg_temp.today() - 90), date_trunc('month', pg_temp.today()), interval '1 month')));
  PERFORM pg_temp.check('reconciliation counts',
    (d->'bank'->>'unmatched_credits')::int = 1 AND (d->'bank'->>'unmatched_amount')::numeric = 250 AND (d->'bank'->>'debits')::int = 1, d->>'bank');
END $$;
SELECT pg_temp.expect_error('dashboard period is bounded',
  $q$SELECT public.invoice_finance_dashboard(pg_temp.id('ORG'), pg_temp.today() - 1200, pg_temp.today())$q$, '%up to three years%');
SELECT pg_temp.as_user('CLERK');
DO $$
BEGIN
  PERFORM pg_temp.check('members can read the dashboard',
    (public.invoice_finance_dashboard(pg_temp.id('ORG'), pg_temp.today() - 30, pg_temp.today())->'receivables'->>'outstanding')::numeric > 0);
END $$;
SELECT pg_temp.as_user('OUT');
SELECT pg_temp.expect_error('outsider cannot read the dashboard',
  $q$SELECT public.invoice_finance_dashboard(pg_temp.id('ORG'), pg_temp.today() - 30, pg_temp.today())$q$, '%not authorized%');

-- ===========================================================================
-- Delivery outbox
-- ===========================================================================
SELECT pg_temp.as_user('FIN');
DO $$
DECLARE
  r jsonb;
BEGIN
  PERFORM public.save_invoice_reminder_preference(pg_temp.id('ORG'), pg_temp.id('C2'), false);
  r := public.queue_invoice_email(pg_temp.id('ORG'), pg_temp.id('I_CUR'), ARRAY[' Billing@Client.Test ', 'billing@client.test'], 'Invoice DD-2', 'Please find the invoice.', 'dd-mail-00001');
  PERFORM pg_temp.check('invoice email queued once, recipients normalised',
    r->>'status' = 'queued' AND (SELECT recipients FROM public.invoice_delivery_jobs WHERE id = (r->>'job_id')::uuid) = ARRAY['billing@client.test'], r::text);
  r := public.queue_invoice_email(pg_temp.id('ORG'), pg_temp.id('I_CUR'), ARRAY['billing@client.test'], 'Invoice DD-2', 'Please find the invoice.', 'dd-mail-00001');
  PERFORM pg_temp.check('same key does not queue a second email',
    (SELECT count(*) FROM public.invoice_delivery_jobs WHERE org_id = pg_temp.id('ORG') AND kind = 'invoice_email') = 1);
END $$;
SELECT pg_temp.expect_error('invalid recipient refused',
  $q$SELECT public.queue_invoice_email(pg_temp.id('ORG'), pg_temp.id('I_CUR'), ARRAY['not-an-email'], 'x', NULL, 'dd-mail-00002')$q$, '%recipient email is not valid%');
SELECT pg_temp.expect_error('draft invoice cannot be emailed',
  $q$SELECT public.queue_invoice_email(pg_temp.id('ORG'), pg_temp.id('I_DRAFT'), ARRAY['a@b.co'], 'x', NULL, 'dd-mail-00003')$q$, '%invoice not found%');
SELECT pg_temp.expect_error('the scheduler is not callable by app users',
  $q$SELECT public.enqueue_invoice_reminders(NULL)$q$, '42501');
SELECT pg_temp.expect_error('the worker claim is not callable by app users',
  $q$SELECT * FROM public.claim_invoice_delivery_jobs(5)$q$, '42501');
SELECT pg_temp.expect_error('app users cannot write jobs directly',
  $q$UPDATE public.invoice_delivery_jobs SET status = 'sent' WHERE org_id = pg_temp.id('ORG')$q$, '42501');
SELECT pg_temp.as_user('CLERK');
SELECT pg_temp.expect_error('member without finance authority cannot change reminder preferences',
  $q$SELECT public.save_invoice_reminder_preference(pg_temp.id('ORG'), pg_temp.id('C1'), false)$q$, '%not authorized%');

RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  r jsonb;
  j public.invoice_delivery_jobs%ROWTYPE;
  v_status text;
BEGIN
  r := public.enqueue_invoice_reminders(NULL);
  PERFORM pg_temp.check('scheduler: upcoming (due in 3 days) and overdue (7 days past) for open invoices only',
    (SELECT array_agg(i.invoice_number || ':' || j2.kind || ':' || j2.status ORDER BY i.invoice_number)
     FROM public.invoice_delivery_jobs j2 JOIN public.invoices i ON i.id = j2.invoice_id
     WHERE j2.org_id = pg_temp.id('ORG') AND j2.kind LIKE 'reminder%')
      = ARRAY['DD-1:reminder_overdue:queued', 'DD-4:reminder_upcoming:queued', 'DD-6:reminder_upcoming:skipped'],
    r::text);
  PERFORM pg_temp.check('paid, cancelled, draft and opted-out invoices get no reminder; missing email is recorded as skipped',
    (r->>'queued')::int = 2 AND (r->>'skipped')::int = 1
    AND (SELECT last_error FROM public.invoice_delivery_jobs WHERE invoice_id = pg_temp.id('I_NOMAIL')) = 'customer has no billing email');
  r := public.enqueue_invoice_reminders(NULL);
  PERFORM pg_temp.check('running the scheduler again queues nothing new',
    (r->>'queued')::int = 0 AND (r->>'skipped')::int = 0
    AND (SELECT count(*) FROM public.invoice_delivery_jobs WHERE org_id = pg_temp.id('ORG')) = 4);

  SELECT * INTO j FROM public.claim_invoice_delivery_jobs(1);
  PERFORM pg_temp.check('claim takes one due job and counts the attempt', j.status = 'sending' AND j.attempts = 1);
  v_status := public.fail_invoice_delivery_job(j.id, 'smtp 451 temporary', true);
  PERFORM pg_temp.check('retryable failure is re-queued about 5 minutes later',
    v_status = 'queued' AND (SELECT next_attempt_at BETWEEN now() + interval '4 minutes' AND now() + interval '6 minutes'
                             AND last_error = 'smtp 451 temporary' FROM public.invoice_delivery_jobs WHERE id = j.id));
  PERFORM pg_temp.check('a backed-off job is not claimed early',
    NOT EXISTS (SELECT 1 FROM public.claim_invoice_delivery_jobs(10) c WHERE c.id = j.id));
  -- the other due jobs were claimed by that call; complete them to keep the test focused
  PERFORM public.complete_invoice_delivery_job(c.id, 'msg-' || c.id) FROM public.invoice_delivery_jobs c
  WHERE c.org_id = pg_temp.id('ORG') AND c.status = 'sending';
  RESET ROLE;
  UPDATE public.invoice_delivery_jobs SET next_attempt_at = now() - interval '1 second' WHERE id = j.id;
  SET LOCAL ROLE service_role;
  PERFORM 1 FROM public.claim_invoice_delivery_jobs(10);
  v_status := public.fail_invoice_delivery_job(j.id, 'smtp 451 again', true);
  PERFORM pg_temp.check('second failure backs off longer (about 10 minutes)',
    (SELECT attempts = 2 AND next_attempt_at BETWEEN now() + interval '9 minutes' AND now() + interval '11 minutes'
     FROM public.invoice_delivery_jobs WHERE id = j.id));
  RESET ROLE;
  UPDATE public.invoice_delivery_jobs SET next_attempt_at = now() - interval '1 second', max_attempts = 3 WHERE id = j.id;
  SET LOCAL ROLE service_role;
  PERFORM 1 FROM public.claim_invoice_delivery_jobs(10);
  v_status := public.fail_invoice_delivery_job(j.id, 'mailbox does not exist', true);
  PERFORM pg_temp.check('after max attempts the job stops as failed', v_status = 'failed'
    AND (SELECT status FROM public.invoice_delivery_jobs WHERE id = j.id) = 'failed');
  PERFORM pg_temp.check('sent jobs carry the provider id and time',
    (SELECT bool_and(sent_at IS NOT NULL AND provider_message_id LIKE 'msg-%') FROM public.invoice_delivery_jobs
     WHERE org_id = pg_temp.id('ORG') AND status = 'sent'));
END $$;
SELECT pg_temp.expect_error('a sent job cannot be completed twice',
  $q$SELECT public.complete_invoice_delivery_job((SELECT id FROM public.invoice_delivery_jobs WHERE org_id = pg_temp.id('ORG') AND status = 'sent' LIMIT 1), 'x')$q$,
  '%job is not being sent%');
RESET ROLE;
DO $$
BEGIN
  PERFORM pg_temp.check('no delivery function makes a network call',
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public'
                  AND p.proname IN ('enqueue_invoice_reminders', 'claim_invoice_delivery_jobs', 'complete_invoice_delivery_job',
                                    'fail_invoice_delivery_job', 'queue_invoice_email', 'save_invoice_reminder_preference')
                  AND (p.prosrc ILIKE '%net.http%' OR p.prosrc ILIKE '%http_post%')));
  PERFORM pg_temp.check('reminder history row written for each queued reminder',
    (SELECT count(*) FROM public.invoice_reminder_events WHERE org_id = pg_temp.id('ORG')) = 2);
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('FIN');
DO $$
BEGIN
  PERFORM pg_temp.check('delivery register shows status and errors to members',
    (SELECT count(*) FILTER (WHERE status = 'failed' AND last_error IS NOT NULL) = 1 AND count(*) = 4
     FROM public.invoice_delivery_register(pg_temp.id('ORG'), 50, 0)));
END $$;

ROLLBACK;
