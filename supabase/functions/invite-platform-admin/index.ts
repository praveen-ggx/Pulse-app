// S3b — Admin Console invitation, server-side.
//
// The service-role key must never be used for auth.admin.* operations from a browser-exposed
// client: analytics/'s existing service-role key IS already in the browser bundle (accepted,
// documented risk for its read/write data access), but that's a materially different exposure
// than handing out the ability to create/invite auth.users accounts, which is what
// auth.admin.inviteUserByEmail() grants. This function is the only place that credential is used
// for that specific call — it is read from this function's own environment and never appears in
// any response body or log line.
//
// Caller identity is verified from their own JWT (mirrors supabase/functions/link-driver-phone),
// never trusted from the request body. Authorization is checked twice, independently:
//   1. Here, via has_platform_permission(caller.id, 'platform_admin.manage'), before ever calling
//      the Auth Admin API -- so an unauthorized request never creates an auth.users row at all.
//   2. Again inside invite_platform_admin() itself (can_manage_platform_admins()), called with
//      the caller's own forwarded JWT so auth.uid()/granted_by resolve to the real inviter, not
//      this function's service-role identity. Belt and suspenders: the DB stays the ultimate
//      authority even if this function's own check were ever wrong.
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
// Mirrors lib/emailValidation.ts's EMAIL_REGEX/MAX_EMAIL_LENGTH exactly, so an admin sees the
// same "is this a valid email" rule everywhere in the product, not a looser one just because this
// happens to be a server-side check.
const MAX_EMAIL_LENGTH = 255;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function containsNullByte(value: string): boolean {
  return value.includes('\0');
}
function validateEmail(email: string): string | null {
  if (containsNullByte(email)) return 'Email contains invalid characters.';
  if (email.length === 0) return 'Enter an email address.';
  if (email.length > MAX_EMAIL_LENGTH) return `Email must be at most ${MAX_EMAIL_LENGTH} characters.`;
  if (!EMAIL_REGEX.test(email)) return 'Enter a valid email address (e.g. name@example.com).';
  return null;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, req);
  }
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  if (!pruneAndCheckRateLimit(ip)) {
    return jsonResponse({ error: 'Too many requests. Try again in a minute.' }, 429, req);
  }
  // No unauthenticated request can reach anything below this point -- checked before the body is
  // even parsed.
  const authHeader = req.headers.get('authorization') ?? '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!bearerToken) {
    return jsonResponse({ error: 'Missing authorization' }, 401, req);
  }
  let body: { email?: string; roleId?: string; redirectTo?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, req);
  }
  const email = (body.email ?? '').trim();
  const roleId = (body.roleId ?? '').trim();
  const redirectTo = (body.redirectTo ?? '').trim();
  const emailError = validateEmail(email);
  if (emailError) {
    return jsonResponse({ error: emailError }, 400, req);
  }
  if (!UUID_REGEX.test(roleId)) {
    return jsonResponse({ error: 'Invalid role.' }, 400, req);
  }
  // Extra hardening on top of Supabase's own project-level Redirect URLs allow-list (the actual
  // enforcement -- Supabase itself refuses to redirect anywhere not on that list, same mechanism
  // already relied on for the Google OAuth login in S3a). This only adds a same-origin check when
  // CORS_ALLOWED_ORIGIN is configured; it is a no-op otherwise, same as getCorsOrigin() above.
  if (!redirectTo) {
    return jsonResponse({ error: 'Invalid redirect.' }, 400, req);
  }
  const allowedOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN')?.trim();
  if (allowedOrigin && !redirectTo.startsWith(allowedOrigin)) {
    return jsonResponse({ error: 'Invalid redirect.' }, 400, req);
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    // Deliberately generic -- never echo which env var is missing.
    return jsonResponse({ error: 'Server configuration error' }, 503, req);
  }
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  // Verify the caller's own JWT -- the only source of truth for "who is making this request."
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await anonClient.auth.getUser(bearerToken);
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401, req);
  }
  const caller = userData.user;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  // Check #1 -- before touching auth.users at all, so an unauthorized request never creates an
  // account or sends an email.
  const { data: canManage, error: permError } = await admin.rpc('has_platform_permission', {
    p_user_id: caller.id,
    p_permission: 'platform_admin.manage',
  });
  if (permError) {
    console.warn('[invite-platform-admin] permission check failed:', permError.message);    return jsonResponse({ error: 'Could not verify permission' }, 500, req);
  }
  if (!canManage) {
    return jsonResponse({ error: 'unauthorized' }, 403, req);
  }
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo },
  );
  if (inviteError) {
    // Supabase's own message here (e.g. "User already registered") is safe to return as-is --
    // it's the same class of message the main app's own sign-up flow already surfaces.
    return jsonResponse({ error: inviteError.message }, 400, req);
  }
  const targetUserId = inviteData?.user?.id;
  if (!targetUserId) {
    return jsonResponse({ error: 'Invite succeeded but no user id was returned' }, 500, req);
  }
  // Check #2 -- the real, independent authorization boundary. Forwards the caller's own JWT so
  // auth.uid()/granted_by inside invite_platform_admin() resolve to the real inviter, not this
  // function's service-role identity.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearerToken}` } },
  });
  const { data: platformUserId, error: rpcError } = await callerClient.rpc(
    'invite_platform_admin',
    { p_target_user_id: targetUserId, p_role_id: roleId },
  );
  if (rpcError) {
    // Explicit, not silent: at this point auth.users already has a row (and, if this really was
    // a brand-new email, an invite email has already gone out) but Platform IAM never granted a
    // role -- e.g. the caller lost platform_admin.manage between check #1 and here, or roleId
    // stopped being valid. We deliberately do NOT delete the auth.users row to "clean up": if
    // this email already belonged to an existing Pulse business/driver account,
    // inviteUserByEmail returns THAT account's id, and deleting it would destroy a real person's
    // unrelated login -- a much worse outcome than a role grant that didn't take. The safe
    // recovery path is simply retrying this same invite once the underlying issue is fixed;
    // invite_platform_admin() is idempotent for an existing platform_users row (see its
    // migration comment). Logged here for operational visibility; the client-facing message
    // says so explicitly rather than returning a bare RPC error.
    console.warn(
      '[invite-platform-admin] auth.users exists but role grant failed:',
      targetUserId,
      rpcError.message,
    );    return jsonResponse(
      {
        error: `Account created/found, but the role could not be granted (${rpcError.message}). This person is not yet a platform admin -- fix the issue and invite this email again to retry.`,
      },
      400,
      req,
    );
  }
  return jsonResponse({ platformUserId }, 200, req);
});
