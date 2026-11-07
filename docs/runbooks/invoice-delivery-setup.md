# Invoice email and reminder delivery — what exists, what is needed

**Reminders are not automated today, and no email is sent.** Migration `20271103235500_invoice_delivery_outbox.sql` adds the database side only. Nothing calls an email provider, and nothing is scheduled.

## What the database provides

| Piece | Who can call it | What it does |
|---|---|---|
| `invoice_delivery_jobs` | read: org members | One row per email: kind, recipients, subject/body, status (`queued`, `sending`, `sent`, `failed`, `skipped`, `cancelled`), attempts, next attempt, last error, provider message id. Unique per `(org, dedupe_key)`. |
| `invoice_reminder_rules` (existing) | `save_invoice_reminder_rule` (finance) | Per org: enabled, days before due, days after due. |
| `invoice_reminder_client_preferences` | `save_invoice_reminder_preference` (finance) | Per customer opt-out. |
| `queue_invoice_email(org, invoice, recipients, subject, body, key)` | finance | Queues one invoice email; the same key never queues twice. |
| `invoice_delivery_register(org, limit, offset)` | members | Delivery log with status and errors. |
| `enqueue_invoice_reminders(date)` | **service_role** | Queues reminders due that India date: an "upcoming" reminder for invoices due in `days_before` days, an "overdue" one `days_after` days past due. Only invoices with an open balance qualify (after receipts, credit notes and refunds). It respects the org rule and the customer opt-out. A customer without a billing email gets a `skipped` row with the reason. Re-running queues nothing new. |
| `claim_invoice_delivery_jobs(limit)` | **service_role** | Marks up to `limit` due jobs `sending` and returns them; `SKIP LOCKED`, so several workers are safe; reclaims jobs stuck in `sending` for 15 min. |
| `complete_invoice_delivery_job(id, provider_message_id)` | **service_role** | Marks the job sent. |
| `fail_invoice_delivery_job(id, error, retryable)` | **service_role** | Re-queues it with backoff (5, 10, 20, 40 … min, capped at 6 h) until `max_attempts` (default 5), then marks it `failed`. |

Verified locally by `supabase/tests/invoice_delivery_dashboard.sql`: idempotency, opt-out, skipped-without-email, backoff, max attempts, service-role-only worker functions, and no network calls in any delivery function.

## What is needed to actually send

1. **An approved email provider.** None is configured in this repository, and adding a paid provider needs approval. The worker only needs an HTTPS send API and a sender domain verified by that provider (SPF, DKIM).
2. **A worker**, for example a Supabase edge function `invoice-delivery-worker` running with the service role, that loops:
   `claim_invoice_delivery_jobs(20)` → for each job, send through the provider → `complete_invoice_delivery_job(id, providerMessageId)` on success, or `fail_invoice_delivery_job(id, error, retryable)` on failure. Treat 4xx responses like "invalid recipient" as non-retryable, and 5xx or timeouts as retryable.
   Secrets: the provider API key and the from-address, set as edge-function secrets, never in the repository.
3. **Schedules** (pg_cron, through the project's existing `net_http_post_if_url` pattern):
   - daily at about 09:00 IST: `select public.enqueue_invoice_reminders(null);`
   - every 5 minutes: invoke the worker.
4. **UI.** Wire the existing "Invoice delivery" card to `queue_invoice_email`; today it calls `record_invoice_email`, which only logs. Add a customer-level reminder opt-out toggle, and show `invoice_delivery_register`.
5. **Local tests must not send.** Leave the worker without a provider key locally; jobs then stay `queued`.

Until steps 1–3 are done, the honest description is: **reminders are configured, queued and logged, but not delivered.**
