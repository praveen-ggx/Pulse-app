// A8.7 — Razorpay webhook receiver for Marketplace platform-fee payments.
//
// Public, unauthenticated endpoint (verify_jwt = false in config.toml,
// same pattern already used by check-user-by-phone/driver-phone-signin-
// unverified) — Razorpay calls this directly, with no Supabase JWT. Its
// own signature is the only trust boundary.
//
// HARD SECURITY RULE: read the raw body, verify the HMAC-SHA256 signature,
// and ONLY THEN parse the body or touch the database. No DB lookup, no
// business logic, runs before signature verification succeeds.
//
// This function contains no business logic itself — it verifies the
// request is genuinely from Razorpay, extracts the handful of fields
// confirm_marketplace_fee_payment() needs, and calls that RPC as
// service_role. The RPC remains the single authority for the state
// transition, exactly as designed in A8.6.2/A8.7.

import { createClient } from 'npm:@supabase/supabase-js@2';

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyRazorpaySignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computed = toHex(digest);
  return timingSafeEqual(computed, signatureHeader);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 503);
  }

  // Step 1: raw body, unparsed. Do not call req.json() before the
  // signature check below — Razorpay signs the exact raw bytes, and
  // parsing-then-reserializing would break verification.
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';

  // Step 2 + 3: verify BEFORE anything else executes. On mismatch, stop
  // here — no parsing, no database call, nothing else runs.
  const validSignature = signature.length > 0 && (await verifyRazorpaySignature(rawBody, signature, webhookSecret));
  if (!validSignature) {
    console.warn('[razorpay-webhook] signature verification failed');
    return jsonResponse({ error: 'invalid_signature' }, 400);
  }

  // Step 4: only now parse.
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'invalid_payload' }, 400);
  }

  const eventType = typeof payload.event === 'string' ? payload.event : '';
  const eventId = req.headers.get('x-razorpay-event-id') ?? (payload.id as string | undefined) ?? '';
  // deno-lint-ignore no-explicit-any
  const p = payload as any;
  // payload.payment.entity is present on payment.captured, payment.failed,
  // AND order.paid (Razorpay docs: "once a payment is captured, the order
  // is marked paid" -- both events carry the same payment entity).
  // payload.order.entity is reliably present only on order.paid.
  const paymentEntity = p?.payload?.payment?.entity as
    | { order_id?: string; id?: string; amount?: number; error_description?: string; notes?: Record<string, unknown> }
    | undefined;
  const orderEntity = p?.payload?.order?.entity as { receipt?: string } | undefined;

  // order.paid handled alongside payment.captured -- both map to the same
  // "paid" outcome. Safe to process both even for the same underlying
  // payment: each carries its own event id (deduped one layer up in
  // confirm_marketplace_fee_payment), and a second confirmation of an
  // already-paid row is that function's own no-op idempotency case.
  if (eventType !== 'payment.captured' && eventType !== 'payment.failed' && eventType !== 'order.paid') {
    // Not an event this integration acts on -- acknowledge and move on.
    return jsonResponse({ ok: true, note: 'ignored_event_type' }, 200);
  }
  if (!paymentEntity?.order_id || !paymentEntity?.id || !eventId) {
    console.warn('[razorpay-webhook] malformed payload, missing order/payment/event id');
    return jsonResponse({ error: 'malformed_payload' }, 400);
  }

  const outcome = eventType === 'payment.failed' ? 'failed' : 'paid';
  const providerAmount = typeof paymentEntity.amount === 'number' ? paymentEntity.amount / 100 : null;

  // Best-effort provider-order <-> Pulse-bid cross-check (amendment, pre-
  // E2E review): market_bid_id was set as both the order's `receipt` and
  // its `notes.market_bid_id` at creation (razorpay-create-order). Not
  // every event payload reliably carries the order entity (only order.paid
  // does), so this is nullable/best-effort -- confirm_marketplace_fee_payment
  // only enforces it when non-null.
  const notesHint = typeof paymentEntity.notes?.market_bid_id === 'string' ? paymentEntity.notes.market_bid_id : null;
  const receiptHint = typeof orderEntity?.receipt === 'string' ? orderEntity.receipt : null;
  const bidIdHint = [notesHint, receiptHint].find((v) => v && UUID_RE.test(v)) ?? null;

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data, error } = await admin.rpc('confirm_marketplace_fee_payment', {
    p_provider_order_id: paymentEntity.order_id,
    p_provider_payment_id: paymentEntity.id,
    p_provider_event_id: eventId,
    p_provider_amount: providerAmount,
    p_provider: 'razorpay',
    p_outcome: outcome,
    p_failure_reason: outcome === 'failed' ? (paymentEntity.error_description ?? null) : null,
    p_expected_market_bid_id: bidIdHint,
  });

  if (error) {
    // Distinguish "Razorpay sent us a validly-signed event we can't or
    // won't act on" (not_found/amount_mismatch/bid_mismatch/payment_id_reused
    // -- known, named, non-transient outcomes from confirm_marketplace_fee_payment
    // itself) from a genuine unexpected failure. The former must NOT return
    // 500: Razorpay retries non-2xx webhooks, and none of these conditions
    // resolve themselves on retry -- an unmapped/stale order stays unmapped,
    // a real amount mismatch stays a mismatch. Returning 500 for these would
    // turn an expected, already-logged anomaly into an endless retry loop.
    // Acknowledge with 200 + a rejected/no-op body, log for audit, and let a
    // genuine DB/service failure (anything NOT matching one of these known
    // prefixes) fall through to 500 so Razorpay's retry is actually useful.
    const knownNonRetryable = /^(not_found|amount_mismatch|bid_mismatch|payment_id_reused):/;
    if (knownNonRetryable.test(error.message)) {
      console.warn('[razorpay-webhook] rejected (no-op, not retried):', error.message);
      return jsonResponse({ ok: true, rejected: true, reason: error.message }, 200);
    }
    console.error('[razorpay-webhook] confirm_marketplace_fee_payment failed unexpectedly:', error.message);
    return jsonResponse({ error: 'confirmation_failed', detail: error.message }, 500);
  }

  return jsonResponse({ ok: true, result: data }, 200);
});
