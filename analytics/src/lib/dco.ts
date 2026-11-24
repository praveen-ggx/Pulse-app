// DCO (driver-cum-owner / independent owner-operator) approval-lifecycle
// data access. Runs on the signed-in admin's session (supabaseAuth): RLS on
// dco_profiles already restricts SELECT to the person themselves or holders
// of the 'dco.review' platform permission, and every RPC below is
// SECURITY DEFINER with its own can_review_dco() guard and auth.uid()
// attribution. See supabase/migrations/20270310200000_dco_schema_foundation.sql
// and 20270310210000_dco_eligibility_and_admin_rpcs.sql.
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';

export type DcoProfileStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

/** Driver-level KYC review status (driver_kyc_submissions); 'none' = never submitted. */
export type DcoKycStatus = 'none' | 'submitted' | 'approved' | 'rejected';

export interface DcoReviewRow {
  user_id: string;
  status: DcoProfileStatus;
  requested_at: string;
  reviewed_at: string | null;
  decision_reason: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_email: string | null;
  /** DCO approval requires this to be 'approved' (enforced by platform_approve_dco). */
  kyc_review_status: DcoKycStatus;
  /** DCO-only documents (PAN, bank proof) not yet verified; null when all verified. */
  dco_docs_unverified: string | null;
}

type DbRow = {
  user_id: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  decision_reason: string | null;
};

type QueueRow = DbRow & {
  driver_name: string | null;
  driver_phone: string | null;
  driver_email: string | null;
  kyc_review_status?: string | null;
  dco_docs_unverified?: string | null;
};

function asKycStatus(status: string | null | undefined): DcoKycStatus {
  return (['submitted', 'approved', 'rejected'].includes(status ?? '')
    ? status
    : 'none') as DcoKycStatus;
}

function asStatus(status: string): DcoProfileStatus {
  return (['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].includes(status)
    ? status
    : 'PENDING') as DcoProfileStatus;
}

function toReviewRow(row: QueueRow): DcoReviewRow {
  return {
    user_id: row.user_id,
    status: asStatus(row.status),
    requested_at: row.requested_at,
    reviewed_at: row.reviewed_at,
    decision_reason: row.decision_reason,
    driver_name: row.driver_name,
    driver_phone: row.driver_phone,
    driver_email: row.driver_email,
    kyc_review_status: asKycStatus(row.kyc_review_status),
    // Unknown (fallback path without the RPC) is treated as outstanding.
    dco_docs_unverified:
      row.dco_docs_unverified === undefined ? 'unknown' : row.dco_docs_unverified,
  };
}

/**
 * Every dco_profiles row this reviewer can see, newest request first.
 * Identity comes from list_dco_review_queue (SECURITY DEFINER) because
 * profiles RLS does not grant dco.review SELECT on other users. Falls
 * back to a profiles join if the RPC is not deployed yet.
 */
export async function fetchDcoProfiles(): Promise<DcoReviewRow[]> {
  const queued = await supabase.rpc('list_dco_review_queue');
  if (!queued.error && queued.data) {
    return (queued.data as QueueRow[]).map(toReviewRow);
  }

  const { data, error } = await supabase
    .from('dco_profiles')
    .select('user_id,status,requested_at,reviewed_at,decision_reason')
    .order('requested_at', { ascending: false });

  if (error || !data?.length) return [];
  const rows = data as DbRow[];

  const uids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,full_name,phone,email')
    .in('id', uids);
  const profileById = new Map(
    (
      (profiles ?? []) as {
        id: string;
        full_name: string | null;
        phone: string | null;
        email: string | null;
      }[]
    ).map((p) => [p.id, p]),
  );

  return rows.map((row) => {
    const profile = profileById.get(row.user_id);
    return toReviewRow({
      ...row,
      driver_name: profile?.full_name ?? null,
      driver_phone: profile?.phone ?? null,
      driver_email: profile?.email ?? null,
    });
  });
}

export async function approveDco(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_approve_dco', { p_user_id: userId });
  return { error: error?.message ?? null };
}

export async function rejectDco(
  userId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_reject_dco', {
    p_user_id: userId,
    p_reason: reason,
  });
  return { error: error?.message ?? null };
}

export async function suspendDco(
  userId: string,
  reason: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_suspend_dco', {
    p_user_id: userId,
    p_reason: reason,
  });
  return { error: error?.message ?? null };
}

export async function reinstateDco(userId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('platform_reinstate_dco', { p_user_id: userId });
  return { error: error?.message ?? null };
}
