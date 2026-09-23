/// <reference path="../deno.d.ts" />
// Immediate on-upload document verification (Gemini Vision)
//
// Per-document-type prompts + evaluation for GST, PAN, address proof, and
// structure KYC docs (CIN/COI, partnership deed, LLP agreement, MSME, IEC).
import { createClient } from 'npm:@supabase/supabase-js@2';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
function normaliseTaxId(s: string): string {
  return (s ?? '')
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/5/g, 'S');
}
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
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
function taxIdSimilarity(typed: string, extracted: string): number {
  const a = normaliseTaxId(typed);
  const b = normaliseTaxId(extracted);
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}
type KycUploadDocumentType =
  | 'gst_certificate'
  | 'pan_card'
  | 'address_proof_lease'
  | 'address_proof_utility_bill'
  | 'address_proof_other'
  | 'cin_certificate'
  | 'incorporation_certificate'
  | 'partnership_deed'
  | 'llp_agreement'
  | 'msme_certificate'
  | 'iec_certificate';
interface VerifyRequest {
  document_type: KycUploadDocumentType;
  storage_path: string;
  typed_gstin?: string;
  typed_pan?: string;
  typed_cin?: string;
  typed_msme?: string;
  typed_iec?: string;
}
interface ExtractedFields {
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  msme: string | null;
  iec: string | null;
  company_name: string | null;
  document_type: string | null;
  legible: boolean;
}
const HARD_THRESHOLD = 0.85;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** Indian CIN / LLPIN — 21 alphanumeric (MCA). */
const CIN_REGEX = /^[A-Z0-9]{21}$/;
/** Udyam registration number. */
const UDYAM_REGEX = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/i;
/** IEC — 10 digits (DGFT). */
const IEC_REGEX = /^\d{10}$/;
const INCORPORATION_TYPES = new Set(['cin_certificate', 'incorporation_certificate']);
function buildPrompt(documentType: KycUploadDocumentType): string {
  const commonFooter =
    'Return ONLY the JSON object — no markdown fences, no explanation.';
  if (documentType === 'gst_certificate') {
    return `You are verifying an Indian GST registration certificate.
Extract fields. Return ONLY valid JSON:
{
  "gstin": "<15-char GSTIN or null>",
  "pan": null,
  "cin": null,
  "msme": null,
  "iec": null,
  "company_name": "<legal/trade name or null>",
  "document_type": "<'gst_certificate' | 'pan_card' | 'other' | 'unreadable'>",
  "legible": <true | false>
}
Rules:
- Set document_type to gst_certificate only if this is a GST registration certificate (GSTIN, GST letterhead / Form GST REG).
- Only set gstin from a GST certificate. Do not invent values.
${commonFooter}`;
  }
  if (documentType === 'pan_card') {
    return `You are verifying an Indian Permanent Account Number (PAN) card.
Extract fields. Return ONLY valid JSON:
{
  "gstin": null,
  "pan": "<10-char PAN or null>",
  "cin": null,
  "msme": null,
  "iec": null,
  "company_name": "<name as on card or null>",
  "document_type": "<'pan_card' | 'gst_certificate' | 'other' | 'unreadable'>",
  "legible": <true | false>
}
Rules:
- Set document_type to pan_card only for an Income Tax PAN card.
- Only set pan from a PAN card. Ignore other IDs.
${commonFooter}`;
  }
  if (
    documentType === 'address_proof_lease' ||
    documentType === 'address_proof_utility_bill' ||
    documentType === 'address_proof_other'
  ) {
    return `You are verifying Indian business address proof.
Expected class: ${documentType.replace('address_proof_', '')}.
Extract fields. Return ONLY valid JSON:
{
  "gstin": null,
  "pan": null,
  "cin": null,
  "msme": null,
  "iec": null,
  "company_name": null,
  "document_type": "<'lease_agreement' | 'utility_bill' | 'other' | 'unreadable'>",
  "legible": <true | false>
}
Rules:
- lease_agreement = rental/lease deed; utility_bill = electricity/water/gas/telecom bill;
  other = government address document (property tax, municipal, etc.).
- Do not extract tax IDs from address proofs.
${commonFooter}`;
  }
  if (INCORPORATION_TYPES.has(documentType)) {
    return `You are verifying an Indian Certificate of Incorporation / CIN document (MCA COI, SPICe+, LLP incorporation certificate, or CIN allotment letter).
Extract fields. Return ONLY valid JSON:
{
  "gstin": null,
  "pan": null,
  "cin": "<21-character CIN or LLPIN or null>",
  "msme": null,
  "iec": null,
  "company_name": "<company / LLP name or null>",
  "document_type": "<'incorporation_certificate' | 'cin_certificate' | 'other' | 'unreadable'>",
  "legible": <true | false>
}
Rules:
- CIN / LLPIN is exactly 21 alphanumeric characters (e.g. U12345MH2024PTC123456 or AAB-1234 style normalised to 21 chars without spaces/hyphens in cin).
- Prefer document_type incorporation_certificate for Certificate of Incorporation; cin_certificate if the page is mainly a CIN letter.
- Reject unrelated docs (PAN, Aadhaar, GST) as other/unreadable.
${commonFooter}`;
  }
  if (documentType === 'partnership_deed') {
    return `You are verifying an Indian partnership deed (registered or notarised).
Extract fields. Return ONLY valid JSON:
{
  "gstin": null,
  "pan": null,
  "cin": null,
  "msme": null,
  "iec": null,
  "company_name": "<firm name or null>",
  "document_type": "<'partnership_deed' | 'other' | 'unreadable'>",
  "legible": <true | false>
}
Rules:
- partnership_deed must mention partners / partnership / deed of partnership.
- Reject unrelated identity or tax cards.
${commonFooter}`;
  }
  if (documentType === 'llp_agreement') {
    return `You are verifying an Indian LLP Agreement (Limited Liability Partnership agreement).
Extract fields. Return ONLY valid JSON:
{
  "gstin": null,
  "pan": null,
  "cin": "<LLPIN if printed (21 chars) or null>",
  "msme": null,
  "iec": null,
  "company_name": "<LLP name or null>",
  "document_type": "<'llp_agreement' | 'other' | 'unreadable'>",
  "legible": <true | false>
}
Rules:
- Must look like an LLP agreement (partners, capital contribution, MCA/LLP references).
- Reject unrelated documents.
${commonFooter}`;
  }
  if (documentType === 'msme_certificate') {
    return `You are verifying an Indian Udyam / MSME registration certificate.
Extract fields. Return ONLY valid JSON:
{
  "gstin": null,
  "pan": null,
  "cin": null,
  "msme": "<Udyam number e.g. UDYAM-XX-00-0000000 or null>",
  "iec": null,
  "company_name": "<enterprise name or null>",
  "document_type": "<'msme_certificate' | 'other' | 'unreadable'>",
  "legible": <true | false>
}
Rules:
- msme must be a Udyam Registration Number when visible (UDYAM-ST-##-#######).
- Only classify as msme_certificate for Udyam/MSME certificates.
${commonFooter}`;
  }
  // iec_certificate
  return `You are verifying an Indian IEC (Importer Exporter Code) certificate / DGFT document.
Extract fields. Return ONLY valid JSON:
{
  "gstin": null,
  "pan": null,
  "cin": null,
  "msme": null,
  "iec": "<10-digit IEC or null>",
  "company_name": "<firm name or null>",
  "document_type": "<'iec_certificate' | 'other' | 'unreadable'>",
  "legible": <true | false>
}
Rules:
- IEC is exactly 10 digits. Do not confuse with phone numbers unless clearly labelled as IEC.
- Only classify as iec_certificate for DGFT / IEC allotment documents.
${commonFooter}`;
}
function emptyExtracted(partial?: Partial<ExtractedFields>): ExtractedFields {
  return {
    gstin: null,
    pan: null,
    cin: null,
    msme: null,
    iec: null,
    company_name: null,
    document_type: null,
    legible: false,
    ...partial,
  };
}
function fail(message: string, extracted: ExtractedFields) {
  return json({
    passed: false,
    route_to_manual: true,
    message,
    extracted,
  });
}
function pass(message: string, extracted: ExtractedFields, score?: number) {
  return json({
    passed: true,
    route_to_manual: false,
    message,
    ...(score != null ? { score } : {}),
    extracted,
  });
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    return await handle(req);
  } catch (e) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    return json({ error: `Unhandled error: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
async function handle(req: Request): Promise<Response> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  const geminiModel = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
  if (!geminiKey) {
    return json({ error: 'GEMINI_API_KEY not configured' }, 500);
  }
  let body: VerifyRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const {
    document_type,
    storage_path,
    typed_gstin,
    typed_pan,
    typed_cin,
    typed_msme,
    typed_iec,
  } = body;
  if (!storage_path) return json({ error: 'storage_path required' }, 400);
  if (!document_type) return json({ error: 'document_type required' }, 400);
  const encodedStoragePath = storage_path.split('/').map(encodeURIComponent).join('/');
  const signedUrlRes = await fetch(
    `${supabaseUrl}/storage/v1/object/sign/verification-documents/${encodedStoragePath}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 120 }),
    },
  );
  if (!signedUrlRes.ok) {
    const errText = await signedUrlRes.text();
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });    return json({ error: `Failed to generate signed URL for document: ${errText}` }, 500);
  }
  const { signedURL } = await signedUrlRes.json() as { signedURL: string };
  const absoluteSignedUrl = signedURL.startsWith('http')
    ? signedURL
    : `${supabaseUrl}/storage/v1${signedURL}`;
  const docRes = await fetch(absoluteSignedUrl);
  if (!docRes.ok) {
    const errText = await docRes.text();
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });    return json({
      error: `Failed to download document from storage: ${docRes.status} ${errText}`,
    }, 500);
  }
  const docBuffer = await docRes.arrayBuffer();
  const docBytes = new Uint8Array(docBuffer);
  let binary = '';
  for (let i = 0; i < docBytes.length; i++) binary += String.fromCharCode(docBytes[i]!);
  const base64Doc = btoa(binary);
  const contentType = docRes.headers.get('content-type') ?? 'image/jpeg';
  const isImage = contentType.startsWith('image/');
  const isPdf = contentType === 'application/pdf';
  if (!isImage && !isPdf) {
    return json({ error: `Unsupported document type: ${contentType}` }, 400);
  }
  const prompt = buildPrompt(document_type);
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: contentType, data: base64Doc } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );
  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return json({ error: `Gemini API error: ${errText}` }, 500);
  }
  const geminiData = await geminiRes.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  let extracted: ExtractedFields;
  try {
    const withoutFences = rawText.replace(/```json?\n?|\n?```/g, '').trim();
    const jsonMatch = withoutFences.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found in response');
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedFields>;
    extracted = emptyExtracted({
      gstin: parsed.gstin ?? null,
      pan: parsed.pan ?? null,
      cin: parsed.cin ?? null,
      msme: parsed.msme ?? null,
      iec: parsed.iec ?? null,
      company_name: parsed.company_name ?? null,
      document_type: parsed.document_type ?? null,
      legible: !!parsed.legible,
    });
  } catch {
    console.error('[gemini-doc-verify] unparseable response:', rawText);
    return json({
      passed: false,
      route_to_manual: true,
      message: 'Could not verify this document right now. Please try again.',
      extracted: emptyExtracted(),
      debug_raw_gemini_text: rawText,
    });
  }
  // ── Evaluate per declared upload type ──────────────────────────────────────
  if (document_type === 'gst_certificate') {
    if (!extracted.legible) {
      return fail(
        'Could not read a GSTIN from this document. Please upload a clear photo of your GST certificate.',
        extracted,
      );
    }
    if (extracted.document_type !== 'gst_certificate') {
      return fail("This doesn't look like a GST certificate. Please upload the correct document.", extracted);
    }
    if (!extracted.gstin) {
      return fail(
        'Could not read a GSTIN from this document. Please upload a clear photo of your GST certificate.',
        extracted,
      );
    }
    const extractedGstin = extracted.gstin.toUpperCase().replace(/\s/g, '');
    if (!GSTIN_REGEX.test(extractedGstin)) {
      return fail(
        `Extracted text (${extractedGstin}) doesn't look like a valid GSTIN. Please upload a clearer photo.`,
        extracted,
      );
    }
    const next = { ...extracted, gstin: extractedGstin };
    if (!typed_gstin?.trim()) {
      return pass(`Read GSTIN ${extractedGstin} from this document.`, next);
    }
    const score = taxIdSimilarity(typed_gstin, extractedGstin);
    const ok = score >= HARD_THRESHOLD;
    return ok
      ? pass('GST certificate matches the GSTIN you entered.', next, Math.round(score * 100))
      : fail(
        `The GSTIN on this document (${extractedGstin}) doesn't match what you entered (${typed_gstin}). Please check and re-upload.`,
        next,
      );
  }
  if (document_type === 'pan_card') {
    if (!extracted.legible) {
      return fail(
        'Could not read a PAN from this document. Please upload a clear photo of your PAN card.',
        extracted,
      );
    }
    if (extracted.document_type !== 'pan_card') {
      return fail("This doesn't look like a PAN card. Please upload the correct document.", extracted);
    }
    if (!extracted.pan) {
      return fail(
        'Could not read a PAN from this document. Please upload a clear photo of your PAN card.',
        extracted,
      );
    }
    const extractedPan = extracted.pan.toUpperCase().replace(/\s/g, '');
    if (!PAN_REGEX.test(extractedPan)) {
      return fail(
        `Extracted text (${extractedPan}) doesn't look like a valid PAN. Please upload a clearer photo.`,
        extracted,
      );
    }
    const next = { ...extracted, pan: extractedPan };
    if (!typed_pan?.trim()) {
      return pass(`Read PAN ${extractedPan} from this document.`, next);
    }
    const score = taxIdSimilarity(typed_pan, extractedPan);
    const ok = score >= HARD_THRESHOLD;
    return ok
      ? pass('PAN card matches the PAN you entered.', next, Math.round(score * 100))
      : fail(
        `The PAN on this document (${extractedPan}) doesn't match what you entered (${typed_pan}). Please check and re-upload.`,
        next,
      );
  }
  if (
    document_type === 'address_proof_lease' ||
    document_type === 'address_proof_utility_bill' ||
    document_type === 'address_proof_other'
  ) {
    const looksLikeAddressDoc =
      extracted.document_type === 'lease_agreement' ||
      extracted.document_type === 'utility_bill' ||
      extracted.document_type === 'other';
    if (!extracted.legible || !looksLikeAddressDoc) {
      return fail(
        !extracted.legible
          ? 'This document is too blurry or unclear to read. Please upload a clearer photo or scan.'
          : "This doesn't look like an address proof document. Please upload a lease agreement, utility bill, or similar.",
        extracted,
      );
    }
    return pass('Document looks readable.', extracted);
  }
  if (INCORPORATION_TYPES.has(document_type)) {
    const looksLikeCoi =
      extracted.document_type === 'incorporation_certificate' ||
      extracted.document_type === 'cin_certificate';
    if (!extracted.legible) {
      return fail(
        'Could not read this incorporation / CIN document. Please upload a clearer scan.',
        extracted,
      );
    }
    if (!looksLikeCoi) {
      return fail(
        "This doesn't look like a Certificate of Incorporation or CIN document.",
        extracted,
      );
    }
    let cin = (extracted.cin ?? '').toUpperCase().replace(/[\s\-]/g, '');
    if (cin && !CIN_REGEX.test(cin)) {
      return fail(
        `Extracted CIN (${extracted.cin}) doesn't look like a valid 21-character CIN/LLPIN. Please upload a clearer scan.`,
        extracted,
      );
    }
    if (!cin) {
      // COI can still pass without a visible CIN (rare), but prefer extraction
      return pass('Incorporation document looks readable.', { ...extracted, cin: null });
    }
    const next = { ...extracted, cin };
    if (!typed_cin?.trim()) {
      return pass(`Read CIN ${cin} from this document.`, next);
    }
    const score = taxIdSimilarity(typed_cin, cin);
    const ok = score >= HARD_THRESHOLD;
    return ok
      ? pass('Incorporation document matches the CIN you entered.', next, Math.round(score * 100))
      : fail(
        `The CIN on this document (${cin}) doesn't match what you entered (${typed_cin}). Please check and re-upload.`,
        next,
      );
  }
  if (document_type === 'partnership_deed') {
    if (!extracted.legible || extracted.document_type !== 'partnership_deed') {
      return fail(
        !extracted.legible
          ? 'This partnership deed is too unclear to read. Please upload a clearer scan.'
          : "This doesn't look like a partnership deed. Please upload the correct document.",
        extracted,
      );
    }
    return pass('Partnership deed looks readable.', extracted);
  }
  if (document_type === 'llp_agreement') {
    if (!extracted.legible || extracted.document_type !== 'llp_agreement') {
      return fail(
        !extracted.legible
          ? 'This LLP agreement is too unclear to read. Please upload a clearer scan.'
          : "This doesn't look like an LLP agreement. Please upload the correct document.",
        extracted,
      );
    }
    let cin = (extracted.cin ?? '').toUpperCase().replace(/[\s\-]/g, '');
    if (cin && !CIN_REGEX.test(cin)) cin = '';
    return pass('LLP agreement looks readable.', { ...extracted, cin: cin || null });
  }
  if (document_type === 'msme_certificate') {
    if (!extracted.legible || extracted.document_type !== 'msme_certificate') {
      return fail(
        !extracted.legible
          ? 'Could not read this Udyam / MSME certificate. Please upload a clearer scan.'
          : "This doesn't look like a Udyam / MSME certificate.",
        extracted,
      );
    }
    let msme = (extracted.msme ?? '').toUpperCase().replace(/\s+/g, '');
    if (msme && !UDYAM_REGEX.test(msme)) {
      return fail(
        `Extracted Udyam number (${extracted.msme}) doesn't look valid. Please upload a clearer certificate.`,
        extracted,
      );
    }
    const next = { ...extracted, msme: msme || null };
    if (msme && typed_msme?.trim()) {
      const score = taxIdSimilarity(typed_msme, msme);
      if (score < HARD_THRESHOLD) {
        return fail(
          `Udyam on this document (${msme}) doesn't match what you entered (${typed_msme}).`,
          next,
        );
      }
      return pass('Udyam certificate matches the number you entered.', next, Math.round(score * 100));
    }
    return pass(
      msme ? `Read Udyam ${msme} from this document.` : 'Udyam / MSME certificate looks readable.',
      next,
    );
  }
  if (document_type === 'iec_certificate') {
    if (!extracted.legible || extracted.document_type !== 'iec_certificate') {
      return fail(
        !extracted.legible
          ? 'Could not read this IEC certificate. Please upload a clearer scan.'
          : "This doesn't look like an IEC certificate.",
        extracted,
      );
    }
    let iec = (extracted.iec ?? '').replace(/\s/g, '');
    if (iec && !IEC_REGEX.test(iec)) {
      return fail(
        `Extracted IEC (${extracted.iec}) doesn't look like a valid 10-digit code.`,
        extracted,
      );
    }
    const next = { ...extracted, iec: iec || null };
    if (iec && typed_iec?.trim()) {
      const score = taxIdSimilarity(typed_iec, iec);
      if (score < HARD_THRESHOLD) {
        return fail(
          `IEC on this document (${iec}) doesn't match what you entered (${typed_iec}).`,
          next,
        );
      }
      return pass('IEC certificate matches the code you entered.', next, Math.round(score * 100));
    }
    return pass(
      iec ? `Read IEC ${iec} from this document.` : 'IEC certificate looks readable.',
      next,
    );
  }
  return fail('Unsupported document type for verification.', extracted);
}
