/**
 * DCO (driver-cum-owner / independent owner-operator) status — driver-side.
 * Backend: supabase/migrations/20270310200000_dco_schema_foundation.sql,
 * 20270310210000_dco_eligibility_and_admin_rpcs.sql.
 */
import { supabase } from '@/lib/supabase';

/**
 * DOCS_APPROVED: admin approved, but the driver is still in a fleet. It becomes
 * APPROVED automatically once they leave (20271127101550). Not a DCO yet.
 */
export type DcoStatus =
  | 'NONE'
  | 'PENDING'
  | 'DOCS_APPROVED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

export type DcoProfile = {
  userId: string;
  status: DcoStatus;
  requestedAt: string;
  reviewedAt: string | null;
  decisionReason: string | null;
};

type DbRow = {
  user_id: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  decision_reason: string | null;
};

function mapRow(row: DbRow): DcoProfile {
  const status: DcoStatus =
    row.status === 'PENDING' ||
    row.status === 'DOCS_APPROVED' ||
    row.status === 'APPROVED' ||
    row.status === 'REJECTED' ||
    row.status === 'SUSPENDED'
      ? row.status
      : 'NONE';
  return {
    userId: row.user_id,
    status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    decisionReason: row.decision_reason,
  };
}

/** Absence of a row means NONE — this person has never requested DCO status. */
export async function getMyDcoProfile(
  userId: string,
): Promise<{ error: Error | null; profile: DcoProfile | null }> {
  if (!userId) return { error: null, profile: null };
  const { data, error } = await supabase()
    .from('dco_profiles')
    .select('user_id, status, requested_at, reviewed_at, decision_reason')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { error: new Error(error.message), profile: null };
  if (!data) return { error: null, profile: null };
  return { error: null, profile: mapRow(data as DbRow) };
}

/**
 * Self-service request (RPC). Creates a PENDING row on first call, or
 * re-requests after a REJECTED decision. Fails server-side for a
 * PENDING/APPROVED/SUSPENDED row, or a non-driver-role profile.
 */
export async function requestDcoStatus(): Promise<{
  error: Error | null;
  profile: DcoProfile | null;
}> {
  const { data, error } = await supabase().rpc('request_dco_status');
  if (error) {
    return { error: new Error(error.message), profile: null };
  }
  if (!data) {
    return { error: new Error('No DCO profile returned'), profile: null };
  }
  return { error: null, profile: mapRow(data as DbRow) };
}

/**
 * Safety net for DOCS_APPROVED: activates DCO status if the caller is no longer
 * in any fleet (the server normally does this the moment they leave).
 * Returns the caller's DCO status after the check.
 */
export async function activateMyDco(): Promise<{
  error: Error | null;
  status: DcoStatus | null;
}> {
  const { data, error } = await supabase().rpc('activate_my_dco' as never);
  if (error) return { error: new Error(error.message), status: null };
  const raw = typeof data === 'string' ? data : '';
  const status = mapRow({
    user_id: '',
    status: raw,
    requested_at: '',
    reviewed_at: null,
    decision_reason: null,
  }).status;
  return { error: null, status };
}
