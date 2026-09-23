// GSTIN pre-validation gateway.
// Called before the mobile app freezes the profile (submit_business_verification).
// Checks the GST public registry: status must be ACTIVE and declared name must
// fuzzy-match the registry legal name (to block typoed / falsified names).
// On API timeout/error → returns MANUAL_REVIEW so operations are never blocked.
import { createClient } from 'npm:@supabase/supabase-js@2';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
/** Levenshtein distance (capped at 2× maxDist for early exit). */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}
function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshtein(na, nb) / maxLen;
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: { gstin?: string; declared_company_name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const gstin = (body.gstin ?? '').trim().toUpperCase();
  const declaredName = (body.declared_company_name ?? '').trim();
  // Basic format check: 15-char GSTIN pattern before hitting external API
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  if (!gstinRegex.test(gstin)) {
    return json({ valid: false, reason: 'INVALID_FORMAT', message: 'GSTIN must be 15 characters in the standard format.' }, 400);
  }
  const apiKey = Deno.env.get('GST_API_KEY');
  if (!apiKey) {
    // No API key configured: route to manual review, don't block the user
    return json({ valid: true, status: 'MANUAL_REVIEW', message: 'GST API not configured. Routed to manual review.' });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } }) : null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const gstRes = await fetch(
      `https://api.gst.gov.in/public/api/v1/search?gstin=${gstin}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (!gstRes.ok) {
      if (supabase) {      }
      return json({ valid: true, status: 'MANUAL_REVIEW', message: 'GST API returned an error. Routed to manual review.' });
    }
    const gstData = await gstRes.json();
    // Check 1: entity must be ACTIVE
    if (gstData.sts !== 'Active') {
      return json({
        valid: false,
        reason: 'GSTIN_INACTIVE',
        message: `GSTIN registration is ${gstData.sts ?? 'unknown'}. Only active registrations are accepted.`,
      }, 400);
    }
    // Check 2: fuzzy name match (similarity > 0.60 threshold)
    const legalName: string = gstData.lgnm ?? gstData.tradeNam ?? '';
    if (declaredName && legalName) {
      const similarity = nameSimilarity(legalName, declaredName);
      if (similarity < 0.60) {
        return json({
          valid: false,
          reason: 'NAME_MISMATCH',
          message: `Company name does not match the GST registry. Registry shows: "${legalName}".`,
          registry_name: legalName,
          similarity: Math.round(similarity * 100),
        }, 400);
      }
    }
    return json({
      valid:         true,
      status:        'ACTIVE',
      registry_name: legalName,
      gstin_type:    gstData.dty ?? null,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      if (supabase) {      }
      return json({ valid: true, status: 'MANUAL_REVIEW', message: 'GST API timed out. Routed to manual review.' });
    }
    return json({ valid: true, status: 'MANUAL_REVIEW', message: 'GST API unreachable. Routed to manual review.' });
  }
});
