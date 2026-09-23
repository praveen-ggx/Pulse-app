// OCR Document Congruence Verifier
//
// Downloads a verification document (address proof, GST certificate) from
// the private Supabase Storage bucket, sends it to Claude Vision for field
// extraction, then computes a fuzzy similarity score against the values the
// user typed into the form.
//
// Returned similarity scores (0–1) gate whether the job proceeds to the
// expensive external registry APIs (Pillar 1/2) or is immediately flagged.
// Threshold: score < 0.85 on GSTIN or PAN → route to manual_review.
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
// Normalise strings before comparison: lowercase, collapse whitespace, strip punctuation
function normalise(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}
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
function similarity(a: string, b: string): number {
  const na = normalise(a), nb = normalise(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}
// For GSTIN/PAN exact alphanumeric match (OCR noise: 0→O, 1→I, 5→S)
function normaliseTaxId(s: string): string {
  return (s ?? '')
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S');
}
function taxIdSimilarity(typed: string, extracted: string): number {
  const a = normaliseTaxId(typed);
  const b = normaliseTaxId(extracted);
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}
interface OcrRequest {
  org_id:           string;
  storage_path:     string;   // path in 'verification-documents' private bucket
  typed_gstin:      string;
  typed_pan:        string;
  typed_company:    string;
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseUrl    = Deno.env.get('SUPABASE_URL')              ?? '';
  const anthropicKey   = Deno.env.get('ANTHROPIC_API_KEY')         ?? '';
  if (!anthropicKey) {
    return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);
  }
  let body: OcrRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { storage_path, typed_gstin, typed_pan, typed_company } = body;
  if (!storage_path) return json({ error: 'storage_path required' }, 400);
  // ── 1. Fetch signed URL for the private document ──────────────────────────
  // Storage's /sign endpoint requires `apikey` alongside `Authorization` when
  // the project uses the new sb_secret_/sb_publishable_ key format — Bearer
  // alone returns "Invalid Compact JWS" since sb_secret_ keys aren't JWTs.
  // Encode each path segment separately — encoding the whole path (with `/`
  // as %2F) bakes the wrong path into the signed token, so the storage
  // backend later rejects the download with "InvalidSignature".
  const encodedStoragePath = storage_path.split('/').map(encodeURIComponent).join('/');
  const signedUrlRes = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/verification-documents/${encodedStoragePath}`,
    {
      method: 'POST',
      headers: {
        'apikey':        serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ expiresIn: 120 }),
    },
  );
  if (!signedUrlRes.ok) {
    const errText = await signedUrlRes.text();
    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });    }
    return json({ error: `Failed to generate signed URL for document: ${errText}` }, 500);
  }
  const { signedURL } = await signedUrlRes.json() as { signedURL: string };
  // signedURL from Storage's /sign endpoint is relative (e.g. "/object/sign/...")
  // — fetch() requires an absolute URL, so prefix with the storage base.
  const absoluteSignedUrl = signedURL.startsWith('http')
    ? signedURL
    : `${supabaseUrl}/storage/v1${signedURL}`;
  // ── 2. Download document bytes ─────────────────────────────────────────────
  const docRes = await fetch(absoluteSignedUrl);
  if (!docRes.ok) {
    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });    }
    return json({ error: 'Failed to download document from storage' }, 500);
  }
  const docBuffer = await docRes.arrayBuffer();
  const docBytes  = new Uint8Array(docBuffer);
  const base64Doc = btoa(String.fromCharCode(...docBytes));
  const contentType = docRes.headers.get('content-type') ?? 'image/jpeg';
  const isImage     = contentType.startsWith('image/');
  const isPdf       = contentType === 'application/pdf';
  if (!isImage && !isPdf) {
    return json({ error: `Unsupported document type: ${contentType}` }, 400);
  }
  // ── 3. Call Claude Vision for field extraction ────────────────────────────
  // Claude Haiku is fastest and cheapest for structured OCR tasks.
  const claudePayload = {
    model:       'claude-haiku-4-5-20251001',
    max_tokens:  512,
    messages: [{
      role:    'user',
      content: [
        {
          type: isImage ? 'image' : 'document',
          source: {
            type:       'base64',
            media_type: contentType,
            data:       base64Doc,
          },
        },
        {
          type: 'text',
          text: `Extract the following fields from this Indian document. Return ONLY a valid JSON object with these exact keys. If a field is not visible, use null.
{
  "gstin": "<15-character GSTIN or null>",
  "pan": "<10-character PAN or null>",
  "company_name": "<registered company name or null>",
  "document_type": "<'gst_certificate' | 'pan_card' | 'lease_agreement' | 'utility_bill' | 'aadhaar_card' | 'voter_id' | 'other'>"
}
Only set "gstin" if this document is a GST registration certificate. Only
set "pan" if this document is an actual PAN card. Do not extract a gstin or
pan value from any other document type (Aadhaar, voter ID, driving licence,
etc.) even if it contains a similarly-shaped number.
Return ONLY the JSON — no markdown, no explanation.`,
        },
      ],
    }],
  };
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(claudePayload),
  });
  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    return json({ error: `Claude API error: ${errText}` }, 500);
  }
  const claudeData = await claudeRes.json() as {
    content: Array<{ type: string; text: string }>;
  };
  let extractedFields: {
    gstin: string | null;
    pan: string | null;
    company_name: string | null;
    document_type: string | null;
  };
  try {
    const rawText = claudeData.content.find(c => c.type === 'text')?.text ?? '{}';
    // Strip markdown code fences if Claude adds them despite instructions
    const cleaned = rawText.replace(/```json?\n?|\n?```/g, '').trim();
    extractedFields = JSON.parse(cleaned);
  } catch {
    return json({ error: 'Failed to parse extracted fields from Claude response' }, 500);
  }
  // ── 4. Compute congruence scores ──────────────────────────────────────────
  const gstinScore   = extractedFields.gstin
    ? taxIdSimilarity(typed_gstin ?? '', extractedFields.gstin)
    : null;
  const panScore     = extractedFields.pan
    ? taxIdSimilarity(typed_pan ?? '', extractedFields.pan)
    : null;
  const companyScore = extractedFields.company_name
    ? similarity(typed_company ?? '', extractedFields.company_name)
    : null;
  // ── 5. Determine overall result ───────────────────────────────────────────
  // Hard fail: GSTIN or PAN extracted but below 85% match
  const HARD_THRESHOLD = 0.85;
  const issues: string[] = [];
  if (gstinScore !== null && gstinScore < HARD_THRESHOLD) {
    issues.push(`GSTIN_MISMATCH: typed="${typed_gstin}" doc="${extractedFields.gstin}" score=${Math.round((gstinScore ?? 0) * 100)}%`);
  }
  if (panScore !== null && panScore < HARD_THRESHOLD) {
    issues.push(`PAN_MISMATCH: typed="${typed_pan}" doc="${extractedFields.pan}" score=${Math.round((panScore ?? 0) * 100)}%`);
  }
  const passed = issues.length === 0;
  const routeToManual = !passed; // anything below threshold routes to desk, not auto-reject
  return json({
    passed,
    route_to_manual: routeToManual,
    scores: {
      gstin:   gstinScore   !== null ? Math.round(gstinScore   * 100) : null,
      pan:     panScore     !== null ? Math.round(panScore     * 100) : null,
      company: companyScore !== null ? Math.round(companyScore * 100) : null,
    },
    extracted: extractedFields,
    issues,
  });
});
