// Links a just-verified phone OTP session to the driver's real, existing account.
//
// Context: existing driver accounts authenticate via email/password — phone is a
// plain text column on public.profiles/public.drivers, never a verified Supabase
// Auth identity. The first time a driver signs in via supabase.auth.verifyOtp({phone}),
// Supabase creates a brand-new, disconnected auth.users row for that phone number.
// This function finds the driver's REAL account (via get_driver_invitee_by_phone),
// attaches the confirmed phone to it with the admin API, retires the disconnected
// phone-only identity, and hands back a magic-link token the client exchanges
// (via supabase.auth.verifyOtp({email, token, type:'magiclink'})) for a real session.
//
// On every sign-in after the first, Supabase's own phone auth already resolves the
// phone to the real account directly — this function's "already linked" branch is
// a fast no-op, not a repeated migration.
//
// Security: the caller's phone is read from THEIR OWN verified JWT (phone_confirmed_at
// must be set), never from the request body — a request cannot claim an arbitrary
// phone number to link into someone else's account.
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
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 10;
const rateLimitMap = new Map<string, number[]>();
function pruneAndCheckRateLimit(ip: string): boolean {
  const now = Date.now();
  const list = rateLimitMap.get(ip) ?? [];
  const kept = list.filter((t) => now - t < RATE_LIMIT_WINDOW_MS).slice(-RATE_LIMIT_MAX_PER_IP);
  if (kept.length >= RATE_LIMIT_MAX_PER_IP) return false;
  kept.push(now);
  rateLimitMap.set(ip, kept);
  return true;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req);
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
  if (!pruneAndCheckRateLimit(ip)) {
    return jsonResponse({ error: 'Too many requests. Try again in a minute.' }, 429, req);
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) {
    return jsonResponse({ error: 'Missing authorization' }, 401, req);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 503, req);
  }
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  // Verify the caller's own JWT — this is the ONLY source of truth for "which phone
  // does this request actually control." The request body is never trusted for this.
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await anonClient.auth.getUser(bearerToken);
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401, req);
  }
  const caller = userData.user;
  if (!caller.phone || !caller.phone_confirmed_at) {
    return jsonResponse({ error: 'Phone not verified on this session' }, 400, req);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: matches, error: matchError } = await admin.rpc('get_driver_invitee_by_phone', {
    p_phone: caller.phone,
  });
  if (matchError) {
    console.warn('[link-driver-phone] lookup failed:', matchError.message);    return jsonResponse({ error: 'Lookup failed', detail: matchError.message }, 502, req);
  }
  const match = Array.isArray(matches) ? matches[0] : null;
  if (!match?.user_id || !match?.email) {
    return jsonResponse({ error: 'no_account', message: 'No driver account found for this phone number.' }, 404, req);
  }
  if (match.user_id === caller.id) {
    // Already linked — this is the steady-state path for every sign-in after the first.
    return jsonResponse({ linked: true, alreadyCurrent: true }, 200, req);
  }
  const { error: updateError } = await admin.auth.admin.updateUserById(match.user_id, {
    phone: caller.phone,
    phone_confirm: true,
  });
  if (updateError) {
    console.warn('[link-driver-phone] failed to attach phone to real account:', updateError.message);    return jsonResponse({ error: 'Linking failed', detail: updateError.message }, 502, req);
  }
  // Best-effort cleanup of the disconnected phone-only identity verifyOtp created.
  // Failure here is cleanup debt only — the phone is already correctly linked above,
  // and a retry of signInWithOtp/verifyOtp will now resolve straight to the real account.
  try {
    await admin.auth.admin.deleteUser(caller.id);
  } catch (e) {
    console.warn('[link-driver-phone] failed to delete disconnected phone identity:', e);
  }
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: match.email,
  });
  if (linkError || !linkData?.properties?.hashed_token) {
    console.warn('[link-driver-phone] generateLink failed:', linkError?.message);
    return jsonResponse(
      {
        error: 'session_pending',
        message: 'Your account was linked. Please request a new code and try again to finish signing in.',
      },
      502,
      req,
    );
  }
  return jsonResponse(
    { linked: true, email: match.email, magicLinkToken: linkData.properties.hashed_token },
    200,
    req,
  );
});
