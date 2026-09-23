// Check if a phone is already registered (profiles table). Used before sign-up to redirect
// existing users to sign-in with email prefilled. Optional intent `driver_signin` exchanges
// a magic link server-side and returns session tokens for the TEMPORARY unverified driver path.
// No auth required; rate-limited by IP.
import {
  exchangeMagicLinkForSession,
  generateDriverMagicLinkToken,
} from '../_shared/driverSessionExchange.ts';
import { createClient as createClientDirect } from 'npm:@supabase/supabase-js@2';
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
/** Normalize to 10 digits (matches get_invitee_by_phone: digits only, 91 prefix → last 10). */
function toTenDigits(phone: string): string | null {
  const trimmed = (phone ?? '').trim();
  if (trimmed.length === 0) return null;
  const digits = trimmed.replace(/\s+/g, '').replace(/\D/g, '');
  if (digits.length >= 12 && digits.startsWith('91')) return digits.slice(-10);
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length === 0 ? null : digits;
}
/** Mask email for display (e.g. ni***@gmail.com). */
function maskEmail(email: string): string {
  const trimmed = (email ?? '').trim();
  if (trimmed.length === 0) return '';
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  if (local.length <= 2) return local[0] + '***' + domain;
  return local.slice(0, 2) + '***' + domain;
}
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 30;
const DRIVER_SIGNIN_RATE_LIMIT_MAX_PER_IP = 10;
const rateLimitMap = new Map<string, number[]>();
const driverSigninRateLimitMap = new Map<string, number[]>();
function pruneAndCheckRateLimit(
  ip: string,
  map: Map<string, number[]>,
  maxPerWindow: number,
): boolean {
  const now = Date.now();
  const list = map.get(ip) ?? [];
  const kept = list.filter((t) => now - t < RATE_LIMIT_WINDOW_MS).slice(-maxPerWindow);
  if (kept.length >= maxPerWindow) return false;
  kept.push(now);
  map.set(ip, kept);
  return true;
}
async function createSupabaseAdmin(): Promise<ReturnType<
  typeof import('npm:@supabase/supabase-js@2').createClient
> | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return null;
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}
async function createSupabaseAnon(): Promise<ReturnType<
  typeof import('npm:@supabase/supabase-js@2').createClient
> | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return null;
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  return createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
}
async function lookupEmailByPhone(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseAdmin>>>,
  normalized: string,
): Promise<string | null> {
  const { data: emailRpc, error: rpcError } = await supabase.rpc('get_email_by_phone', {
    p_phone: normalized,
  });
  if (rpcError) {
    // Fail closed. Previously this fell back to a `.limit(10_000)` full scan of
    // `profiles` scanned in JS — on a public endpoint that turned an RPC-availability
    // problem into a heavy repeated-read load problem exactly when the DB was
    // already stressed. The indexed RPC is the only lookup path; if it is down we
    // surface a controlled error rather than table-scanning.
    console.warn('[check-user-by-phone] get_email_by_phone RPC failed:', rpcError.message);
    throw new Error('lookup_unavailable');
  }
  if (emailRpc != null && typeof emailRpc === 'string' && emailRpc.trim() !== '') {
    return emailRpc.trim();
  }
  return null;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req);
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown';
  let body: { phone?: string; intent?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, req);
  }
  const intent = body?.intent === 'driver_signin' ? 'driver_signin' : 'exists_check';
  const rateLimitOk =
    intent === 'driver_signin'
      ? pruneAndCheckRateLimit(ip, driverSigninRateLimitMap, DRIVER_SIGNIN_RATE_LIMIT_MAX_PER_IP)
      : pruneAndCheckRateLimit(ip, rateLimitMap, RATE_LIMIT_MAX_PER_IP);
  if (!rateLimitOk) {
    return jsonResponse({ error: 'Too many requests. Try again in a minute.' }, 429, req);
  }
  const rawPhone = body?.phone != null ? String(body.phone) : '';
  const normalized = toTenDigits(rawPhone);
  if (!normalized || normalized.length !== 10) {
    return jsonResponse(
      { error: 'Invalid phone', detail: 'Provide a 10-digit number or +91 followed by 10 digits.' },
      400,
      req
    );
  }
  const supabase = await createSupabaseAdmin();
  if (!supabase) {
    return jsonResponse({ error: 'Server configuration error' }, 503, req);
  }
  let email: string | null;
  try {
    email = await lookupEmailByPhone(supabase, normalized);
  } catch (e) {
    // Lookup infrastructure (indexed RPC) is unavailable — fail closed with a
    // controlled 503 instead of degrading into an expensive fallback scan.
    const msg = e instanceof Error ? e.message : 'lookup_error';
    const admin = await createClientDirect(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });    return jsonResponse(
      { error: 'lookup_unavailable', message: 'Phone lookup is temporarily unavailable. Please retry.', detail: msg },
      503,
      req,
    );
  }
  if (intent === 'driver_signin') {
    if (!email) {
      return jsonResponse(
        { error: 'no_account', message: 'No driver account found for this phone number.' },
        404,
        req,
      );
    }
    const anon = await createSupabaseAnon();
    const session = await exchangeMagicLinkForSession(
      supabase,
      email,
      'check-user-by-phone',
      anon ? { verifyClient: anon } : undefined,
    );
    if (session) {
      return jsonResponse({ email, session }, 200, req);
    }
    // Fallback: let the client exchange the hashed token (same pattern as link-driver-phone).
    const magicLinkToken = await generateDriverMagicLinkToken(
      supabase,
      email,
      'check-user-by-phone',
    );
    if (magicLinkToken) {
      return jsonResponse({ email, magicLinkToken }, 200, req);
    }
    return jsonResponse(
      { error: 'Could not complete sign in', message: 'Sign-in session could not be created.' },
      502,
      req,
    );
  }
  if (email) {
    return jsonResponse(
      { exists: true, email, masked_email: maskEmail(email) },
      200,
      req,
    );
  }
  return jsonResponse({ exists: false }, 200, req);
});
