import { supabase } from '@/lib/supabase';
import { moderatedFetch } from '@/lib/platform/moderator';
import type { AddressProofType, RegistrationType } from '@/types/organization';

const VERIFICATION_BUCKET = 'verification-documents';

// Mirrors the bucket + register_verification_document RPC constraints in
// 20261111000000_verification_documents_registry.sql — checked client-side
// too so the user gets an inline error instead of a failed upload/RPC call.
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
];

export type VerificationDocumentType =
  | 'gst_certificate'
  | 'pan_card'
  | 'address_proof_lease'
  | 'address_proof_utility_bill'
  | 'address_proof_other'
  | 'cin_certificate'
  | 'msme_certificate'
  | 'iec_certificate'
  | 'incorporation_certificate'
  | 'partnership_deed'
  | 'llp_agreement';

/** Tax scans must pass Gemini; constitutional docs soft-fail (register if OCR unavailable). */
const OCR_STRICT_DOCUMENT_TYPES: ReadonlySet<VerificationDocumentType> = new Set([
  'gst_certificate',
  'pan_card',
]);

export function validateDocumentFile(file: {
  mimeType: string;
  sizeBytes?: number;
}): string | null {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimeType)) {
    return 'Unsupported file type. Please upload a JPG, PNG, WEBP, HEIC, or PDF.';
  }
  if (file.sizeBytes != null && file.sizeBytes > MAX_DOCUMENT_BYTES) {
    return 'File is too large. Maximum size is 10 MB.';
  }
  return null;
}

// ─── GSTIN validation ─────────────────────────────────────────────────────────

export type GstinValidationResult =
  | { valid: true;  status: 'ACTIVE' | 'MANUAL_REVIEW'; registry_name?: string }
  | { valid: false; reason: string; message: string; registry_name?: string };

export async function validateGstin(
  gstin: string,
  declaredCompanyName: string,
): Promise<GstinValidationResult> {
  const { data: { session } } = await supabase().auth.getSession();
  const token = session?.access_token ?? '';

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  try {
    const res = await moderatedFetch(`${supabaseUrl}/functions/v1/validate-gstin`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ gstin, declared_company_name: declaredCompanyName }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { valid: false, reason: json.reason ?? 'VALIDATION_FAILED', message: json.message ?? 'GSTIN validation failed.' };
    }
    return json as GstinValidationResult;
  } catch {
    // Network error: treat as manual review, don't block the user
    return { valid: true, status: 'MANUAL_REVIEW' };
  }
}

// ─── Address proof upload ──────────────────────────────────────────────────────

export interface AddressProofFile {
  uri:      string;
  mimeType: string;
  fileName: string;
  base64?:  string;
}

async function readFileBytes(uri: string, base64?: string): Promise<Uint8Array> {
  if (base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export interface DocVerifyResult {
  passed: boolean;
  route_to_manual: boolean;
  message: string;
  score?: number;
  extracted?: {
    gstin?: string | null;
    pan?: string | null;
    cin?: string | null;
    msme?: string | null;
    iec?: string | null;
    company_name?: string | null;
    document_type?: string | null;
  };
}

export type DocVerifyTypedValues = {
  gstin?: string;
  pan?: string;
  cin?: string;
  msme?: string;
  iec?: string;
};

/** Calls gemini-doc-verify right after upload. Network/config failures
 *  return null, meaning "the check could not run" — NOT "the document
 *  passed". Callers must decide what null means for their document type:
 *  GST/PAN fail closed; structure docs soft-pass on null. */
async function verifyUploadedDocument(
  documentType: VerificationDocumentType,
  storagePath: string,
  typed?: DocVerifyTypedValues,
): Promise<DocVerifyResult | null> {
  console.log('%c[OCR] 1/4 starting', 'color:#2563eb', { documentType, storagePath, typed });

  const { data: { session } } = await supabase().auth.getSession();
  const token = session?.access_token ?? '';
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

  if (!supabaseUrl) {
    console.error('%c[OCR] ABORT: EXPO_PUBLIC_SUPABASE_URL is empty', 'color:#dc2626');
    return null;
  }
  if (!token) {
    console.warn('%c[OCR] no auth session token — request will likely 401', 'color:#d97706');
  }

  const url = `${supabaseUrl}/functions/v1/gemini-doc-verify`;
  console.log('%c[OCR] 2/4 calling edge function', 'color:#2563eb', url);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        document_type: documentType,
        storage_path: storagePath,
        typed_gstin: typed?.gstin,
        typed_pan: typed?.pan,
        typed_cin: typed?.cin,
        typed_msme: typed?.msme,
        typed_iec: typed?.iec,
      }),
    });

    console.log('%c[OCR] 3/4 HTTP response', 'color:#2563eb', res.status, res.statusText);

    if (!res.ok) {
      const bodyText = await res.text();
      console.error('%c[OCR] ABORT: non-OK response', 'color:#dc2626', res.status, bodyText);
      return null;
    }
    const result = await res.json() as DocVerifyResult;
    console.log(
      '%c[OCR] 4/4 result',
      result.passed ? 'color:#16a34a' : 'color:#d97706',
      {
        passed: result.passed,
        route_to_manual: result.route_to_manual,
        message: result.message,
        score: result.score,
        extracted: result.extracted,
      },
    );
    return result;
  } catch (e) {
    console.error('%c[OCR] ABORT: request threw', 'color:#dc2626', e);
    return null;
  }
}

export async function uploadAddressProof(
  orgId:     string,
  file:      AddressProofFile,
  proofType?: AddressProofType,
): Promise<{ path: string | null; error: Error | null; verify: DocVerifyResult | null }> {
  const bytes = await readFileBytes(file.uri, file.base64);

  const formatError = validateDocumentFile({ mimeType: file.mimeType, sizeBytes: bytes.byteLength });
  if (formatError) return { path: null, error: new Error(formatError), verify: null };

  const ext = file.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${orgId}/address_proof-${Date.now()}.${ext}`;

  const { error } = await supabase()
    .storage.from(VERIFICATION_BUCKET)
    .upload(path, bytes, { contentType: file.mimeType, upsert: true });

  if (error) return { path: null, error: new Error(error.message), verify: null };

  const documentType: VerificationDocumentType =
    proofType === 'lease' ? 'address_proof_lease'
    : proofType === 'utility_bill' ? 'address_proof_utility_bill'
    : 'address_proof_other';

  const verify = await verifyUploadedDocument(documentType, path);
  if (verify && !verify.passed) {
    await supabase().storage.from(VERIFICATION_BUCKET).remove([path]);
    return { path: null, error: new Error(verify.message), verify };
  }

  // Register in the same verification_documents table as GST/PAN uploads so
  // the admin review console's document list (which only reads this table)
  // shows the address proof alongside the other documents.
  const { error: rpcError } = await supabase().rpc('register_verification_document', {
    p_org_id:        orgId,
    p_document_type: documentType,
    p_storage_path:  path,
    p_mime_type:     file.mimeType,
    p_size_bytes:    bytes.byteLength,
  });
  if (rpcError) return { path: null, error: new Error(rpcError.message), verify };

  return { path, error: null, verify };
}

// ─── Generic verification document upload (GST cert, PAN card, …) ─────────────

export interface VerificationDocumentFile {
  uri:      string;
  mimeType: string;
  fileName: string;
  base64?:  string;
}

export async function uploadVerificationDocument(
  orgId: string,
  documentType: VerificationDocumentType,
  file: VerificationDocumentFile,
  typedValues?: DocVerifyTypedValues,
): Promise<{ path: string | null; error: Error | null; verify: DocVerifyResult | null }> {
  const bytes = await readFileBytes(file.uri, file.base64);

  const formatError = validateDocumentFile({ mimeType: file.mimeType, sizeBytes: bytes.byteLength });
  if (formatError) return { path: null, error: new Error(formatError), verify: null };

  const ext = file.fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${orgId}/${documentType}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase()
    .storage.from(VERIFICATION_BUCKET)
    .upload(path, bytes, { contentType: file.mimeType, upsert: true });

  if (uploadError) return { path: null, error: new Error(uploadError.message), verify: null };

  const verify = await verifyUploadedDocument(documentType, path, typedValues);
  const strictOcr = OCR_STRICT_DOCUMENT_TYPES.has(documentType);

  if (strictOcr) {
    if (!verify || !verify.passed) {
      await supabase().storage.from(VERIFICATION_BUCKET).remove([path]);
      return {
        path: null,
        error: new Error(
          verify?.message ?? 'Could not verify this document right now. Please try again.',
        ),
        verify,
      };
    }
  } else if (verify && !verify.passed) {
    await supabase().storage.from(VERIFICATION_BUCKET).remove([path]);
    return { path: null, error: new Error(verify.message), verify };
  }

  const { error: rpcError } = await supabase().rpc('register_verification_document', {
    p_org_id:        orgId,
    p_document_type: documentType,
    p_storage_path:  path,
    p_mime_type:      file.mimeType,
    p_size_bytes:     bytes.byteLength,
  });

  if (rpcError) return { path: null, error: new Error(rpcError.message), verify };
  return { path, error: null, verify };
}

/** Remove an uploaded-but-not-registered document (e.g. the extracted
 * PAN/GSTIN turned out to already belong to a different workspace). */
export async function removeVerificationDocumentFile(path: string): Promise<{ error: Error | null }> {
  const { error } = await supabase().storage.from(VERIFICATION_BUCKET).remove([path]);
  return { error: error ? new Error(error.message) : null };
}

export interface VerificationDocumentRecord {
  id:             string;
  document_type:  VerificationDocumentType;
  storage_path:   string;
  mime_type:      string;
  size_bytes:     number;
  status:         'UPLOADED' | 'OCR_PASSED' | 'OCR_FAILED' | 'MANUAL_REVIEW' | 'REPLACED';
  created_at:     string;
}

export async function getVerificationDocuments(
  orgId: string,
): Promise<{ documents: VerificationDocumentRecord[]; error: Error | null }> {
  const { data, error } = await supabase().rpc('get_verification_documents', { p_org_id: orgId });
  if (error) return { documents: [], error: new Error(error.message) };
  return { documents: (data ?? []) as VerificationDocumentRecord[], error: null };
}

export async function getVerificationDocumentSignedUrl(
  storagePath: string,
  ttlSeconds = 3600,
): Promise<string | null> {
  return getAddressProofSignedUrl(storagePath, ttlSeconds);
}

export async function getAddressProofSignedUrl(
  storagePath: string,
  ttlSeconds = 3600,
): Promise<string | null> {
  const { data } = await supabase()
    .storage.from(VERIFICATION_BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  return data?.signedUrl ?? null;
}

// ─── Draft saves (pre-submit, inline KYC page) ────────────────────────────────

export type VerificationDraftPayload = {
  registration_type?: RegistrationType | null;
  address_line?: string | null;
  city?: string | null;
  state?: string | null;
  address_pincode?: string | null;
  address_proof_path?: string | null;
  address_proof_type?: AddressProofType | null;
};

export async function saveVerificationDraft(
  orgId: string,
  payload: VerificationDraftPayload,
): Promise<{ error: Error | null }> {
  const patch: Record<string, unknown> = {};
  if (payload.registration_type !== undefined) {
    patch.registration_type = payload.registration_type;
  }
  if (payload.address_line !== undefined) {
    patch.address_line = payload.address_line?.trim() || null;
  }
  if (payload.city !== undefined) patch.city = payload.city?.trim() || null;
  if (payload.state !== undefined) patch.state = payload.state?.trim() || null;
  if (payload.address_pincode !== undefined) {
    const digits = payload.address_pincode?.replace(/\D/g, '') ?? '';
    patch.address_pincode = digits || null;
  }
  if (payload.address_proof_path !== undefined) {
    patch.address_proof_path = payload.address_proof_path?.trim() || null;
  }
  if (payload.address_proof_type !== undefined) {
    patch.address_proof_type = payload.address_proof_type;
  }

  if (Object.keys(patch).length === 0) return { error: null };

  const { error } = await supabase().from('organizations').update(patch).eq('id', orgId);
  return { error: error ? new Error(error.message) : null };
}

// ─── Submit for verification ───────────────────────────────────────────────────

export interface SubmitVerificationPayload {
  registration_type?:  RegistrationType;
  address_pincode?:    string;
  address_proof_path?: string;
  address_proof_type?: AddressProofType;
  gst_not_applicable?: boolean;
}

export async function submitBusinessVerification(
  orgId:   string,
  payload: SubmitVerificationPayload,
): Promise<{ ok: boolean; frozen_at: string | null; error: Error | null }> {
  const { data, error } = await supabase().rpc('submit_business_verification', {
    p_org_id:             orgId,
    p_registration_type:  payload.registration_type  ?? null,
    p_address_pincode:    payload.address_pincode     ?? null,
    p_address_proof_path: payload.address_proof_path  ?? null,
    p_address_proof_type: payload.address_proof_type  ?? null,
    p_gst_not_applicable: payload.gst_not_applicable   ?? null,
  });

  if (error) return { ok: false, frozen_at: null, error: new Error(error.message) };
  const result = data as { ok: boolean; frozen_at: string };
  return { ok: result.ok, frozen_at: result.frozen_at, error: null };
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id:               string;
  previous_status:  string | null;
  new_status:       string;
  rejection_reasons: { checklist: string[]; notes: string } | null;
  notes:            string | null;
  created_at:       string;
}

export async function getVerificationAuditLog(
  orgId: string,
): Promise<{ entries: AuditLogEntry[]; error: Error | null }> {
  const { data, error } = await supabase()
    .from('verification_audit_logs')
    .select('id, previous_status, new_status, rejection_reasons, notes, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return { entries: [], error: new Error(error.message) };
  return { entries: (data ?? []) as AuditLogEntry[], error: null };
}
