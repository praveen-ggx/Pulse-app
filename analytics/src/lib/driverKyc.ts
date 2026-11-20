// Driver KYC data access. Runs on the signed-in admin's session
// (supabaseAuth), not the service_role key: driver_kyc_documents /
// driver_kyc_submissions already grant read to holders of the
// 'driver_kyc.review' platform permission, the driver_kyc_review_queue view is
// security_invoker so it inherits those policies, and every RPC below is
// SECURITY DEFINER with its own can_review_driver_kyc() guard and auth.uid()
// attribution. See 20270306040000_kyc_admin_session_access.sql.
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';
import { resolveDocumentMime } from '@/lib/kycDocuments';

const DRIVER_DOCUMENTS_BUCKET = 'driver-documents';
const SIGNED_URL_TTL_SEC = 60 * 60; // 1 hour

export type DriverKycDocType = 'license' | 'aadhaar' | 'pan' | 'selfie' | 'bank_proof' | 'other';
export type DriverKycStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export interface DriverKycQueueRow {
  id: string;
  driver_user_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  doc_type: DriverKycDocType;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string;
  file_size_bytes: number | null;
  status: DriverKycStatus;
  rejection_notes: string | null;
  created_at: string;
  updated_at: string;
  signed_url: string;
}

/** Driver documents live in a separate storage bucket from org/client/supplier KYC. */
export async function createDriverDocumentSignedUrl(
  storagePath: string,
): Promise<{ url: string | null; error: string | null }> {
  const path = storagePath.trim();
  if (!path) return { url: null, error: 'Missing storage path' };

  const { data, error } = await supabase.storage
    .from(DRIVER_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (error) return { url: null, error: error.message };
  return { url: data?.signedUrl ?? null, error: data?.signedUrl ? null : 'Signed URL empty' };
}

/**
 * Pending-first review queue. RLS on driver_kyc_documents already restricts
 * this SELECT to callers with the `driver_kyc.review` platform permission
 * (or the driver's own rows) — no separate admin check needed here, same
 * posture as fetchKycDocumentsByOrg for organization KYC.
 */
export async function fetchDriverKycQueue(): Promise<DriverKycQueueRow[]> {
  const { data, error } = await supabase
    .from('driver_kyc_documents')
    .select(
      'id,driver_user_id,doc_type,storage_path,file_name,mime_type,file_size_bytes,status,rejection_notes,created_at,updated_at',
    )
    .is('deleted_at', null)
    .order('status', { ascending: true }) // 'pending' sorts before 'rejected'/'verified' alphabetically — acceptable default, refine with a CASE order if a stricter FIFO queue is needed
    .order('created_at', { ascending: true });

  if (error || !data?.length) return [];

  type Row = {
    id: string;
    driver_user_id: string;
    doc_type: DriverKycDocType;
    storage_path: string | null;
    file_name: string | null;
    mime_type: string | null;
    file_size_bytes: number | null;
    status: DriverKycStatus;
    rejection_notes: string | null;
    created_at: string;
    updated_at: string;
  };
  const rows = data as Row[];

  const driverIds = [...new Set(rows.map((r) => r.driver_user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,full_name,phone')
    .in('id', driverIds);
  const profileById = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; phone: string | null }[]).map(
      (p) => [p.id, p],
    ),
  );

  const paths = [...new Set(rows.map((r) => r.storage_path?.trim()).filter(Boolean))] as string[];
  const signedByPath: Record<string, string> = {};
  await Promise.all(
    paths.map(async (path) => {
      const { url } = await createDriverDocumentSignedUrl(path);
      if (url) signedByPath[path] = url;
    }),
  );

  return rows.map((row) => {
    const profile = profileById.get(row.driver_user_id);
    const path = row.storage_path?.trim() ?? '';
    return {
      id: row.id,
      driver_user_id: row.driver_user_id,
      driver_name: profile?.full_name ?? null,
      driver_phone: profile?.phone ?? null,
      doc_type: row.doc_type,
      storage_path: row.storage_path,
      file_name: row.file_name,
      mime_type: resolveDocumentMime(row.mime_type, row.file_name),
      file_size_bytes: row.file_size_bytes,
      status: row.status,
      rejection_notes: row.rejection_notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      signed_url: path ? (signedByPath[path] ?? '') : '',
    };
  });
}

export async function approveDriverKycDocument(
  documentId: string,
  notes?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_approve_driver_kyc_document', {
    p_document_id: documentId,
    p_notes: notes ?? null,
  });
  return { error: error?.message ?? null };
}

export async function rejectDriverKycDocument(
  documentId: string,
  rejectionReason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_reject_driver_kyc_document', {
    p_document_id: documentId,
    p_rejection_reason: rejectionReason,
  });
  return { error: error?.message ?? null };
}

// ── Driver-level submissions ("submit for verification" queue) ───────────────

export type DriverKycReviewStatus = 'submitted' | 'approved' | 'rejected';

export interface DriverKycSubmissionRow {
  driver_user_id: string;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  organization_name: string | null;
  submitted_at: string;
  review_status: DriverKycReviewStatus;
  reviewed_at: string | null;
  review_notes: string | null;
  /** 1 on first submission, incremented each time the driver re-submits. */
  attempt_count: number;
  /**
   * Optional documents the driver did not supply (e.g. "PAN") — a legitimate
   * end state, not a gap to chase. Null when every optional doc is present.
   */
  optional_not_provided: string | null;
  document_count: number;
  pending_count: number;
  verified_count: number;
  rejected_count: number;
  /**
   * DCO-only documents (PAN, bank proof) at 'pending' while the driver has an
   * open DCO request. > 0 puts an already-verified driver back in "Awaiting".
   */
  dco_docs_pending: number;
}

const SUBMISSION_COLUMNS =
  'driver_user_id,driver_id,driver_name,driver_phone,organization_name,submitted_at,review_status,reviewed_at,review_notes,attempt_count,optional_not_provided,document_count,pending_count,verified_count,rejected_count';

/**
 * Drivers who have pressed "submit for verification", newest first. Reads the
 * driver_kyc_review_queue view, which joins driver identity onto the raw
 * submission row — the documents table only carries driver_user_id.
 */
export async function fetchDriverKycSubmissions(): Promise<DriverKycSubmissionRow[]> {
  const withDco = await supabase
    .from('driver_kyc_review_queue')
    .select(`${SUBMISSION_COLUMNS},dco_docs_pending`)
    .order('submitted_at', { ascending: false });

  // Older schema without dco_docs_pending: fall back rather than empty the queue.
  const { data, error } = withDco.error
    ? await supabase
        .from('driver_kyc_review_queue')
        .select(SUBMISSION_COLUMNS)
        .order('submitted_at', { ascending: false })
    : withDco;

  if (error || !data?.length) return [];
  const rows = (data as Partial<DriverKycSubmissionRow>[]).map((r) => ({
    ...(r as DriverKycSubmissionRow),
    dco_docs_pending: Number(r.dco_docs_pending ?? 0),
  }));

  // The view takes name/phone from the fleet `drivers` row. A driver with no
  // fleet (e.g. a DCO) has none, so fill from their own profile via the
  // reviewer-scoped RPC (profiles RLS does not let reviewers read it directly).
  const missing = rows.filter((r) => !r.driver_name || !r.driver_phone).map((r) => r.driver_user_id);
  if (missing.length) {
    const { data: profiles } = await supabase.rpc('get_driver_kyc_reviewer_profiles', {
      p_driver_user_ids: [...new Set(missing)],
    });
    const byId = new Map(
      ((profiles ?? []) as { id: string; full_name: string | null; phone: string | null }[]).map(
        (p) => [p.id, p],
      ),
    );
    for (const r of rows) {
      const p = byId.get(r.driver_user_id);
      if (!p) continue;
      r.driver_name = r.driver_name || p.full_name;
      r.driver_phone = r.driver_phone || p.phone;
    }
  }
  return rows;
}

/** Documents belonging to one driver, with signed URLs for inline viewing. */
export async function fetchDriverKycDocumentsForDriver(
  driverUserId: string,
): Promise<DriverKycQueueRow[]> {
  const all = await fetchDriverKycQueue();
  return all.filter((d) => d.driver_user_id === driverUserId);
}

/** Records the driver-level outcome after per-document decisions are made. */
export async function reviewDriverKycSubmission(
  driverUserId: string,
  status: 'approved' | 'rejected',
  notes?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_review_driver_kyc_submission', {
    p_driver_user_id: driverUserId,
    p_status: status,
    p_notes: notes ?? null,
  });
  return { error: error?.message ?? null };
}

/**
 * Reverses a finished decision, putting the driver back in the awaiting queue.
 * Separate from reviewDriverKycSubmission because that one now refuses to touch
 * an already-decided submission — un-approving a verified driver should take a
 * deliberate action with a recorded reason, not a stray click.
 */
export async function reopenDriverKycSubmission(
  driverUserId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('driver_kyc_reopen_submission', {
    p_driver_user_id: driverUserId,
    p_reason: reason,
  });
  return { error: error?.message ?? null };
}
