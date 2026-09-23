// A8.7 — creates a Razorpay order for a Marketplace platform-fee payment and
// records the pending attempt via initiate_marketplace_fee_payment_order().
//
// Security: the fee amount is ALWAYS read server-side from
// market_bids.platform_fee_amount (frozen at award, per A8.6.2) — the
// request body only ever supplies which bid is being paid for, never an
// amount. The caller's own JWT is forwarded to Postgres (not swapped for
// service_role) so auth.uid() resolves correctly inside
// initiate_marketplace_fee_payment_order's "caller must be the bidder"
// check, and so the market_bids SELECT below is RLS-scoped to the caller's
// own bid, same "forward the real JWT, verify server-side" pattern as
// link-driver-phone.
//
// Razorpay's API key SECRET never leaves this function; the returned
// key_id is Razorpay's public identifier, safe to hand to the client for
// checkout.


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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) {
    return jsonResponse({ error: 'Missing authorization' }, 401, req);
  }

  let bidId: string | undefined;
  try {
    const body = await req.json();
    bidId = typeof body?.bidId === 'string' ? body.bidId : undefined;
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400, req);
  }
  if (!bidId) {
    return jsonResponse({ error: 'bidId is required' }, 400, req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
  const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
  if (!supabaseUrl || !anonKey || !razorpayKeyId || !razorpayKeySecret) {
    return jsonResponse({ error: 'Server configuration error' }, 503, req);
  }

  const { createClient } = await import('npm:@supabase/supabase-js@2');

  // Forwards the caller's own JWT — every call below runs AS the caller,
  // not as service_role, so RLS and auth.uid()-based checks apply exactly
  // as they would from the app itself.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(bearerToken);
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401, req);
  }

  const { data: bid, error: bidError } = await userClient
    .from('market_bids')
    .select('id, status, fee_payment_status, platform_fee_amount, bidder_user_id')
    .eq('id', bidId)
    .maybeSingle();
  if (bidError) {
    console.warn('[razorpay-create-order] bid lookup failed:', bidError.message);
    return jsonResponse({ error: 'Lookup failed', detail: bidError.message }, 502, req);
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

  // Idempotency (amendment, pre-E2E review): if a checkout is already in
  // flight for this bid, hand back that SAME order instead of creating a
  // second Razorpay order — avoids duplicate live orders from a double
  // tap/retry/network hiccup, and avoids the cancel-and-recreate churn in
  // initiate_marketplace_fee_payment_order for the common case.
  const { data: existingPending, error: existingError } = await userClient
    .from('marketplace_fee_payments')
    .select('provider_order_id, amount, provider')
    .eq('market_bid_id', bidId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) {
    console.warn('[razorpay-create-order] existing-payment lookup failed:', existingError.message);
  } else if (existingPending?.provider_order_id) {
    return jsonResponse(
      { orderId: existingPending.provider_order_id, amount: existingPending.amount ?? feeAmount, currency: 'INR', keyId: razorpayKeyId },
      200,
      req,
    );
  }

  // Server-to-server call to Razorpay — amount is Razorpay's own paise unit.
  const orderResp = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
    },
    body: JSON.stringify({
      amount: Math.round(feeAmount * 100),
      currency: 'INR',
      receipt: bidId,
      notes: { market_bid_id: bidId },
    }),
  });
  if (!orderResp.ok) {
    const detail = await orderResp.text();
    console.warn('[razorpay-create-order] Razorpay order creation failed:', orderResp.status, detail);
    return jsonResponse({ error: 'provider_error', message: 'Could not create payment order' }, 502, req);
  }
  const order = await orderResp.json();
  const orderId = order?.id as string | undefined;
  if (!orderId) {
    return jsonResponse({ error: 'provider_error', message: 'Payment order response missing id' }, 502, req);
  }

  const { data: initResult, error: initError } = await userClient.rpc('initiate_marketplace_fee_payment_order', {
    p_bid_id: bidId,
    p_provider_order_id: orderId,
    p_provider: 'razorpay',
  });
  if (initError) {
    console.warn('[razorpay-create-order] initiate_marketplace_fee_payment_order failed:', initError.message);
    return jsonResponse({ error: 'invalid_state', message: initError.message }, 409, req);
  }

  return jsonResponse(
    {
      orderId,
      amount: (initResult as { amount?: number } | null)?.amount ?? feeAmount,
      currency: 'INR',
      keyId: razorpayKeyId,
    },
    200,
    req,
  );
});
