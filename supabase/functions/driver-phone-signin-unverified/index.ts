import {
  exchangeMagicLinkForSession,
  generateDriverMagicLinkToken,
} from '../_shared/driverSessionExchange.ts';
// TEMPORARY / INSECURE: signs a driver in from a phone number alone, with NO real
// OTP verification — Supabase's SMS provider is not configured yet ("Unsupported
// phone provider"), so there is currently no way to prove phone possession. This
// function exists only so the driver app can ship a phone-first sign-in UI before
// that's live. It resolves the phone to the matching driver's email itself (never
// trusts a client-supplied email — a caller could otherwise request a magic link
// for ANY account, not just the phone-matched driver) and returns a magic-link
// token for that email.
//
// Replace call sites with sendDriverPhoneOtp/verifyDriverPhoneOtp
// (features/auth/services/auth.service.ts, backed by link-driver-phone/index.ts,
// which requires a real Supabase-verified phone session) once the SMS provider is
// enabled, then delete this function.
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
/** Normalize to 10 digits (matches get_email_by_phone's own normalization). */
function toTenDigits(phone: string): string | null {
  const trimmed = (phone ?? '').trim();
  if (trimmed.length === 0) return null;
  const digits = trimmed.replace(/\s+/g, '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) return digits.slice(-10);
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length === 0 ? null : digits;
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
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, req);
  }
  const normalized = toTenDigits(body?.phone != null ? String(body.phone) : '');
  if (!normalized || normalized.length !== 10) {
    return jsonResponse({ error: 'Invalid phone' }, 400, req);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 503, req);
  }
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const anon = anonKey
    ? createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
    : null;
  // Resolve email server-side from the phone — the request never supplies an email.
  const { data: emailRpc, error: rpcError } = await admin.rpc('get_email_by_phone', {
    p_phone: normalized,
  });
  if (rpcError) {
    console.warn('[driver-phone-signin-unverified] lookup failed:', rpcError.message);    return jsonResponse({ error: 'Lookup failed', detail: rpcError.message }, 502, req);
  }
  const email = typeof emailRpc === 'string' ? emailRpc.trim() : '';
  if (!email) {
    return jsonResponse({ error: 'no_account', message: 'No driver account found for this phone number.' }, 404, req);
  }
  const session = await exchangeMagicLinkForSession(
    admin,
    email,
    'driver-phone-signin-unverified',
    anon ? { verifyClient: anon } : undefined,
  );
  if (session) {
    return jsonResponse({ email, session }, 200, req);
  }
  const magicLinkToken = await generateDriverMagicLinkToken(
    admin,
    email,
    'driver-phone-signin-unverified',
  );
  if (magicLinkToken) {
    return jsonResponse({ email, magicLinkToken }, 200, req);
  }
  return jsonResponse(
    { error: 'Could not complete sign in', message: 'Sign-in session could not be created.' },
    502,
    req,
  );
});
