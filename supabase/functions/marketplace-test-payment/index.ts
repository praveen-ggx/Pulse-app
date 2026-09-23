// A10.2 — PILOT/TEST ONLY payment-provider simulator for the Marketplace
// platform fee. Lets the A10 pilot exercise the real
// required -> pending -> paid/failed -> trip state machine without
// Razorpay credentials, WITHOUT adding a second confirmation authority:
// every state transition still goes through the existing, unmodified
// initiate_marketplace_fee_payment_order() / confirm_marketplace_fee_payment()
// RPCs -- exactly the same functions Razorpay itself uses.
//
// HARD GATE: refuses every request unless MARKETPLACE_TEST_PAYMENTS_ENABLED
// is exactly 'true' in this function's own environment. This is a
// server-side check, not a UI toggle -- removing the frontend button is
// not the only protection. Remove this whole function once the pilot's
// temporary payment methods are retired.
//
// Deliberately narrow interface -- the frontend can never say "confirm
// ₹X for bid Y": it can only say "create a <cash|test_online> attempt for
// bid X" or "simulate <paid|failed> for my current attempt on bid X". The
// server always derives the bidder (from the verified JWT), the bid, the
// current payment attempt, and its frozen amount from the database --
// never from client input. Same "forward the real JWT, verify server-side"
// pattern as razorpay-create-order; the final confirm call uses
// service_role only because confirm_marketplace_fee_payment() itself
// requires it (same as razorpay-webhook).
import { createClient as createClientDirect } from 'npm:@supabase/supabase-js@2';
const ALLOWED_PROVIDERS = ['cash', 'test_online'] as const;
type AllowedProvider = (typeof ALLOWED_PROVIDERS)[number];
const corsAllowHeaders = 'authorization, x-client-info, apikey, content-type';
function getCorsOrigin(req: Request): string {
  const allowed = Deno.env.get('CORS_ALLOWED_ORIGIN')?.trim();
  if (!allowed) return '*';
  const origin = req.headers.get('Origin');
  if (origin && origin === allowed) return origin;
  return 'null';
}
function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(req),
    'Access-Control-Allow-Headers': corsAllowHeaders,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function jsonResponse(body: object, status: number, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}
/** Fresh, globally-unique id per attempt/confirmation -- provider_order_id,
 * provider_payment_id, and provider_event_id are all unique-where-not-null
 * across the WHOLE marketplace_fee_payments table (including cancelled/
 * failed rows), so a deterministic id (e.g. `${provider}_${bidId}`) would
 * collide on any retry. Never reuse one of these across attempts. */
function freshId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req);
  }
  if (Deno.env.get('MARKETPLACE_TEST_PAYMENTS_ENABLED') !== 'true') {
    return jsonResponse({ error: 'disabled', message: 'Pilot test payments are not enabled' }, 403, req);
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) {
    return jsonResponse({ error: 'Missing authorization' }, 401, req);
  }
  let action: string | undefined;
  let bidId: string | undefined;
  let provider: string | undefined;
  let outcome: string | undefined;
  try {
    const body = await req.json();
    action = typeof body?.action === 'string' ? body.action : undefined;
    bidId = typeof body?.bidId === 'string' ? body.bidId : undefined;
    provider = typeof body?.provider === 'string' ? body.provider : undefined;
    outcome = typeof body?.outcome === 'string' ? body.outcome : undefined;
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400, req);
  }
  if (!bidId) {
    return jsonResponse({ error: 'bidId is required' }, 400, req);
  }
  if (action !== 'create' && action !== 'simulate') {
    return jsonResponse({ error: 'invalid_action', message: 'action must be "create" or "simulate"' }, 400, req);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 503, req);
  }
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  // Forwards the caller's own JWT -- every lookup below runs AS the caller,
  // RLS-scoped, exactly as razorpay-create-order does.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(bearerToken);
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401, req);
  }
  if (action === 'create') {
    if (!provider || !ALLOWED_PROVIDERS.includes(provider as AllowedProvider)) {
      return jsonResponse({ error: 'invalid_provider', message: `provider must be one of: ${ALLOWED_PROVIDERS.join(', ')}` }, 400, req);
    }
    const { data: bid, error: bidError } = await userClient
      .from('market_bids')
      .select('id, status, fee_payment_status, platform_fee_amount')
      .eq('id', bidId)
      .maybeSingle();
    if (bidError) {
      console.warn('[marketplace-test-payment] bid lookup failed:', bidError.message);
      const admin = createClientDirect(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });      return jsonResponse({ error: 'Lookup failed', detail: bidError.message }, 502, req);
    }
    if (!bid) {
      // RLS-scoped SELECT: either the bid doesn't exist, or it isn't this caller's own.
      return jsonResponse({ error: 'not_found', message: 'Bid not found' }, 404, req);
    }
    if (bid.status !== 'accepted') {
      return jsonResponse({ error: 'invalid_state', message: `Bid is not an accepted award (current: ${bid.status})` }, 409, req);
    }
    if (!['required', 'failed', 'pending'].includes(bid.fee_payment_status)) {
      return jsonResponse(
        { error: 'invalid_state', message: `Nothing to pay (fee_payment_status: ${bid.fee_payment_status})` },
        409,
        req,
      );
    }
    const feeAmount = Number(bid.platform_fee_amount ?? 0);
    if (!(feeAmount > 0)) {
      return jsonResponse({ error: 'invalid_fee', message: 'No positive platform fee to collect for this bid' }, 409, req);
    }
    const orderId = freshId(`${provider}_order`);
    const { data: initResult, error: initError } = await userClient.rpc('initiate_marketplace_fee_payment_order', {
      p_bid_id: bidId,
      p_provider_order_id: orderId,
      p_provider: provider,
    });
    if (initError) {
      console.warn('[marketplace-test-payment] initiate_marketplace_fee_payment_order failed:', initError.message);
      const admin = createClientDirect(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });      return jsonResponse({ error: 'invalid_state', message: initError.message }, 409, req);
    }
    return jsonResponse(
      { orderId, amount: (initResult as { amount?: number } | null)?.amount ?? feeAmount, currency: 'INR', provider },
      200,
      req,
    );
  }
  // action === 'simulate' -- the frontend only ever says "simulate <outcome>
  // for my current attempt on this bid". Everything else (which attempt,
  // which provider, the frozen amount) is derived here, never supplied.
  if (outcome !== 'paid' && outcome !== 'failed') {
    return jsonResponse({ error: 'invalid_outcome', message: 'outcome must be "paid" or "failed"' }, 400, req);
  }
  const { data: payment, error: paymentError } = await userClient
    .from('marketplace_fee_payments')
    .select('id, market_bid_id, provider, provider_order_id, amount, status')
    .eq('market_bid_id', bidId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) {
    console.warn('[marketplace-test-payment] payment lookup failed:', paymentError.message);
    return jsonResponse({ error: 'Lookup failed', detail: paymentError.message }, 502, req);
  }
  if (!payment) {
    // RLS-scoped SELECT: no pending attempt exists, or it isn't this caller's own.
    return jsonResponse({ error: 'not_found', message: 'No active payment attempt to simulate for this bid' }, 404, req);
  }
  if (!payment.provider || !ALLOWED_PROVIDERS.includes(payment.provider as AllowedProvider)) {
    // Defensive: never let this endpoint touch a real (e.g. razorpay) attempt.
    return jsonResponse({ error: 'not_a_test_payment', message: 'This attempt was not created by the pilot test provider' }, 409, req);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('confirm_marketplace_fee_payment', {
    p_provider_order_id: payment.provider_order_id,
    p_provider_payment_id: freshId(`${payment.provider}_payment`),
    p_provider_event_id: freshId(`${payment.provider}_event`),
    p_provider_amount: payment.amount, // frozen amount from the row itself -- never recomputed, never client-supplied
    p_provider: payment.provider,
    p_outcome: outcome,
    p_failure_reason: outcome === 'failed' ? 'Simulated failure (A10.2 pilot test payment)' : null,
    p_expected_market_bid_id: bidId,
  });
  if (error) {
    const knownNonRetryable = /^(not_found|amount_mismatch|bid_mismatch|payment_id_reused|invalid_outcome):/;
    if (knownNonRetryable.test(error.message)) {
      console.warn('[marketplace-test-payment] confirm rejected:', error.message);
      return jsonResponse({ error: 'confirmation_rejected', message: error.message }, 409, req);
    }
    console.error('[marketplace-test-payment] confirm_marketplace_fee_payment failed unexpectedly:', error.message);
    return jsonResponse({ error: 'confirmation_failed', detail: error.message }, 500, req);
  }
  return jsonResponse({ ok: true, result: data }, 200, req);
});
