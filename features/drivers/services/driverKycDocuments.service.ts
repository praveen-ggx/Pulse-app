/**
 * Driver KYC documents — same pattern as organizationKycDocuments.service.ts /
 * clientKycDocuments.service.ts, keyed by driver_user_id (auth.uid()) instead
 * of an org/client id, since identity documents are per-person.
 *
 * Upload/resubmit is client-driven (RLS INSERT policy for first upload;
 * driver_resubmit_kyc_document RPC for any subsequent file replacing an
 * existing row — direct UPDATE is intentionally not RLS-permitted, see the
 * migration). Approve/reject are platform-admin RPCs, not exposed here for
 * the driver-facing side — see driverKycAdmin.service.ts.
 */
import { supabase } from '@/lib/supabase';

export type DriverKycDocType = 'license' | 'aadhaar' | 'pan' | 'selfie' | 'other';
export type DriverKycStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export interface DriverKycDocument {
  id: string;
  driver_user_id: string;
  doc_type: DriverKycDocType;
  doc_label: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  is_mandatory: boolean;
  status: DriverKycStatus;
  verified_at: string | null;
  rejection_notes: string | null;
  created_at: string;
  updated_at: string;
}

const DOC_SELECT =
  'id,driver_user_id,doc_type,doc_label,storage_path,file_name,mime_type,file_size_bytes,is_mandatory,status,verified_at,rejection_notes,created_at,updated_at';

export async function listMyDriverKycDocuments(): Promise<{
  error: Error | null;
  documents: DriverKycDocument[];
}> {
  const {
    data: { user },
  } = await supabase().auth.getUser();
  if (!user) return { error: null, documents: [] };

  const { data, error } = await supabase()
    .from('driver_kyc_documents')
    .select(DOC_SELECT)
    .eq('driver_user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) return { error: new Error(error.message), documents: [] };
  return { error: null, documents: (data ?? []) as DriverKycDocument[] };
}

export type SubmitDriverKycDocumentInput = {
  doc_type: DriverKycDocType;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes?: number;
};

/**
 * Upload or resubmit a document. First submission for a doc_type is a plain
 * INSERT (RLS-permitted). Any file replacing an existing row — including
 * "fix a pending upload" and "resubmit after rejection" — goes through the
 * driver_resubmit_kyc_document RPC, which is the only way a driver's own
 * write can reset status back to 'pending' (a direct UPDATE cannot, since
 * there is no direct UPDATE policy on this table).
 */
export async function submitDriverKycDocument(
  payload: SubmitDriverKycDocumentInput,
): Promise<{ error: Error | null; document: DriverKycDocument | null }> {
  const {
    data: { user },
  } = await supabase().auth.getUser();
  if (!user) return { error: new Error('Not signed in'), document: null };

  const { data: existing, error: findErr } = await supabase()
    .from('driver_kyc_documents')
    .select('id,storage_path')
    .eq('driver_user_id', user.id)
    .eq('doc_type', payload.doc_type)
    .is('deleted_at', null)
    .maybeSingle();

  if (findErr) return { error: new Error(findErr.message), document: null };

  if (existing?.id) {
    const { data, error } = await supabase().rpc('driver_resubmit_kyc_document', {
      p_document_id: existing.id,
      p_storage_path: payload.storage_path,
      p_file_name: payload.file_name,
      p_mime_type: payload.mime_type,
      p_file_size: payload.file_size_bytes ?? null,
    });
    if (error) return { error: new Error(error.message), document: null };

    // Storage lifecycle: the old file is now unreferenced by any row — clean
    // it up client-side under the existing "drivers can delete own documents"
    // storage policy, same convention as tripDocuments.service.ts's
    // deleteTripDocument (storage.remove() alongside the row change, not a
    // DB trigger — this codebase has no storage-cleanup triggers anywhere).
    // Best-effort: the resubmit itself already succeeded, so a storage
    // cleanup failure here shouldn't surface as an upload failure to the
    // driver — it becomes an orphan for a future sweep, not a broken upload.
    const oldPath = (existing as { storage_path: string | null }).storage_path;
    if (oldPath && oldPath !== payload.storage_path) {
      await supabase().storage.from('driver-documents').remove([oldPath]);
    }

    return { error: null, document: data as DriverKycDocument };
  }

  const { data, error } = await supabase()
    .from('driver_kyc_documents')
    .insert({
      driver_user_id: user.id,
      doc_type: payload.doc_type,
      storage_path: payload.storage_path,
      file_name: payload.file_name,
      mime_type: payload.mime_type,
      file_size_bytes: payload.file_size_bytes ?? null,
      uploaded_by: user.id,
    })
    .select(DOC_SELECT)
    .single();

  if (error) return { error: new Error(error.message), document: null };
  return { error: null, document: data as DriverKycDocument };
}

export function latestDriverKycDocument(
  documents: DriverKycDocument[],
  docType: DriverKycDocType,
): DriverKycDocument | undefined {
  return documents
    .filter((d) => d.doc_type === docType)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
}

/**
 * Doc types the driver must supply before "submit for verification" unlocks.
 * Fallback only — the live set comes from driver_kyc_doc_requirements via
 * listDriverKycDocRequirements(), so changing the rule is an UPDATE rather
 * than a release. PAN is deliberately absent: it is not universal among
 * drivers (tax-filing document, many never apply for one), so requiring it
 * locked those drivers out of verification entirely.
 */
export const MANDATORY_DRIVER_KYC_DOC_TYPES: readonly DriverKycDocType[] = [
  'license',
  'aadhaar',
  'selfie',
];

/** Identity slots shared with trip / compliance vaults (not PAN / selfie). */
export const DRIVER_VAULT_KYC_DOC_TYPES: readonly DriverKycDocType[] = ['license', 'aadhaar'];

export async function listDriverVaultKycDocuments(
  driverIds: string[],
): Promise<{
  byDriverId: Map<string, DriverKycDocument[]>;
}> {
  const byDriverId = new Map<string, DriverKycDocument[]>();
  const ids = Array.from(new Set(driverIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return { byDriverId };

  const { data: driverRows, error: driverError } = await supabase()
    .from('drivers')
    .select('id, user_id')
    .in('id', ids);
  if (driverError) return { byDriverId };

  const userIdByDriverId = new Map<string, string>();
  const queryUserIds: string[] = [];
  for (const row of driverRows ?? []) {
    if (row.user_id) {
      userIdByDriverId.set(row.id, row.user_id);
      queryUserIds.push(row.user_id);
    }
  }
  for (const driverId of ids) {
    if (!userIdByDriverId.has(driverId)) queryUserIds.push(driverId);
  }
  const uniqueUserIds = Array.from(new Set(queryUserIds));
  if (uniqueUserIds.length === 0) return { byDriverId };

  const { data: kycRows, error: kycError } = await supabase()
    .from('driver_kyc_documents')
    .select(DOC_SELECT)
    .in('driver_user_id', uniqueUserIds)
    .in('doc_type', [...DRIVER_VAULT_KYC_DOC_TYPES])
    .is('deleted_at', null);
  if (kycError || !kycRows?.length) return { byDriverId };

  const driverIdByUserId = new Map<string, string>();
  for (const [driverId, userId] of userIdByDriverId) driverIdByUserId.set(userId, driverId);

  for (const row of kycRows as DriverKycDocument[]) {
    const driverId = driverIdByUserId.get(row.driver_user_id) ?? row.driver_user_id;
    const list = byDriverId.get(driverId) ?? [];
    list.push(row);
    byDriverId.set(driverId, list);
  }
  return { byDriverId };
}

export interface DriverKycDocRequirement {
  doc_type: DriverKycDocType;
  label: string;
  is_mandatory: boolean;
  sort_order: number;
}

/**
 * Removes an optional document the driver doesn't have (e.g. a wrongly
 * uploaded, then rejected, PAN). Soft delete server-side; mandatory documents
 * are refused, since those must be fixed rather than abandoned.
 */
export async function withdrawDriverKycDocument(
  documentId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc('driver_withdraw_kyc_document', {
    p_document_id: documentId,
  });
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/** Which documents are required vs optional. Falls back to the constant above. */
export async function listDriverKycDocRequirements(): Promise<DriverKycDocRequirement[]> {
  const { data, error } = await supabase()
    .from('driver_kyc_doc_requirements')
    .select('doc_type,label,is_mandatory,sort_order')
    .order('sort_order', { ascending: true });

  if (error || !data?.length) return [];
  return data as DriverKycDocRequirement[];
}

export type DriverKycReviewStatus = 'submitted' | 'approved' | 'rejected';

export interface DriverKycSubmission {
  driver_user_id: string;
  submitted_at: string;
  review_status: DriverKycReviewStatus;
  reviewed_at: string | null;
  review_notes: string | null;
}

/** Current submission for the signed-in driver, or null if never submitted. */
export async function getMyDriverKycSubmission(): Promise<{
  error: Error | null;
  submission: DriverKycSubmission | null;
}> {
  const {
    data: { user },
  } = await supabase().auth.getUser();
  if (!user) return { error: null, submission: null };

  const { data, error } = await supabase()
    .from('driver_kyc_submissions')
    .select('driver_user_id,submitted_at,review_status,reviewed_at,review_notes')
    .eq('driver_user_id', user.id)
    .maybeSingle();

  if (error) return { error: new Error(error.message), submission: null };
  return { error: null, submission: (data as DriverKycSubmission | null) ?? null };
}

/**
 * Hands the whole document set to the platform review queue. The RPC re-checks
 * completeness server-side, so a client-side gate slipping through still can't
 * queue a partial submission.
 */
export async function submitDriverKycForVerification(): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc('driver_submit_kyc_for_verification');
  if (error) return { error: new Error(error.message) };
  return { error: null };
}
