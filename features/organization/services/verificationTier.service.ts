import { supabase } from '@/lib/supabase';
import { moderatedFetch } from '@/lib/platform/moderator';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VerificationTier = 'TIER_0_SANDBOX' | 'TIER_1_PARTIAL' | 'TIER_2_FULL';
export type PillarStatus = 'NOT_STARTED' | 'QUEUED' | 'PROCESSING' | 'PASSED' | 'MANUAL_REVIEW' | 'FAILED';

export interface VerificationJobStatus {
  job_id:                string | null;
  status:                string | null;
  ocr_status:            PillarStatus;
  ocr_detail:            OcrDetail | null;
  pillar_1_tax_status:   PillarStatus;
  pillar_1_tax_detail:   PillarDetail | null;
  pillar_2_mca_status:   PillarStatus;
  pillar_2_mca_detail:   PillarDetail | null;
  verification_tier:     VerificationTier;
  transaction_cap_paise: number | null;
  penny_drop_status:     PillarStatus;
  biometric_status:      PillarStatus;
  completed_at:          string | null;
  attempts:              number;
}

export interface OcrDetail {
  passed:          boolean;
  route_to_manual: boolean;
  scores: { gstin: number | null; pan: number | null; company: number | null };
  issues: string[];
}

export interface PillarDetail {
  gstin?: { passed: boolean; status: string };
  pan?:   { passed: boolean; status: string };
  error?: string;
}

export interface TierCapabilities {
  tier:              VerificationTier;
  label:             string;
  can_bid:           boolean;
  can_post_trips:    boolean;
  can_join_matching: boolean;
  can_clear_escrow:  boolean;
  transaction_cap:   number | null;
  description:       string;
}

// ─── Pillar status display helpers ───────────────────────────────────────────

export function pillarLabel(status: PillarStatus): string {
  switch (status) {
    case 'PASSED':        return 'Passed';
    case 'FAILED':        return 'Failed';
    case 'MANUAL_REVIEW': return 'Under Review';
    case 'PROCESSING':    return 'Processing…';
    case 'NOT_STARTED':   return 'Not Started';
    case 'QUEUED':        return 'Queued';
    default:              return 'Unknown';
  }
}

export function isPillarComplete(status: PillarStatus): boolean {
  return status === 'PASSED' || status === 'FAILED' || status === 'MANUAL_REVIEW';
}

// ─── Get job status ───────────────────────────────────────────────────────────

export async function getVerificationJobStatus(
  orgId: string,
): Promise<{ data: VerificationJobStatus | null; error: Error | null }> {
  const { data, error } = await supabase().rpc('get_verification_job_status', {
    p_org_id: orgId,
  });

  if (error) return { data: null, error: new Error(error.message) };
  if (!data)  return { data: null, error: null };

  return { data: data as VerificationJobStatus, error: null };
}

// ─── Get tier capabilities ────────────────────────────────────────────────────

export async function getTierCapabilities(
  orgId: string,
): Promise<{ data: TierCapabilities | null; error: Error | null }> {
  const { data, error } = await supabase().rpc('get_tier_capabilities', {
    p_org_id: orgId,
  });
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as TierCapabilities, error: null };
}

// ─── Realtime subscription ───────────────────────────────────────────────────
// Subscribes to changes on both `verification_jobs` and `organizations`
// for the given org. Calls the callback on any relevant change so the UI
// can refresh without polling.

export function subscribeToVerificationUpdates(
  orgId:    string,
  onChange: () => void,
): () => void {
  // Shared ref-counted channel via the registry — same two-table UPDATE
  // invalidation, reuses one server channel and inherits lifecycle management.
  return subscribeSharedPostgresChanges(
    `verification:${orgId}`,
    [
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'verification_jobs',
        filter: `organization_id=eq.${orgId}`,
      },
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'organizations',
        filter: `id=eq.${orgId}`,
      },
    ],
    () => onChange(),
  );
}

// ─── Penny drop ──────────────────────────────────────────────────────────────

export interface BankAccountForDrop {
  account_number: string;
  ifsc_code:      string;
  account_holder: string;
}

export async function triggerPennyDrop(
  orgId:       string,
  bankAccount: BankAccountForDrop,
): Promise<{ ok: boolean; error: Error | null }> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const { data: { session } } = await supabase().auth.getSession();
  const token = session?.access_token ?? '';

  try {
    const res = await moderatedFetch(`${supabaseUrl}/functions/v1/penny-drop`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ org_id: orgId, bank_account: bankAccount }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      return { ok: false, error: new Error(err.error ?? 'Penny-drop failed') };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error('Network error') };
  }
}

// ─── Biometric result ─────────────────────────────────────────────────────────
// Called by the mobile app after HyperVerge Liveness SDK returns its result.

export async function submitBiometricResult(
  orgId:          string,
  hypervergeToken: string,  // transactionId from HyperVerge Liveness SDK
): Promise<{ ok: boolean; error: Error | null }> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const { data: { session } } = await supabase().auth.getSession();
  const token = session?.access_token ?? '';

  try {
    const res = await moderatedFetch(`${supabaseUrl}/functions/v1/biometric-verify`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ org_id: orgId, hyperverge_transaction_id: hypervergeToken }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      return { ok: false, error: new Error(err.error ?? 'Biometric verification failed') };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error('Network error') };
  }
}
