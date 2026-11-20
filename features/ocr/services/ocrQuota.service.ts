import { supabase } from "@/lib/supabase";

export type OcrQuotaStatus = {
  allowed: boolean;
  used: number;
  limit: number | null;
  tier: string;
  reason?: string | null;
};

export class OcrQuotaExceededError extends Error {
  readonly quota: OcrQuotaStatus;

  constructor(quota: OcrQuotaStatus) {
    super(
      quota.limit != null
        ? `Monthly scan limit reached (${quota.used}/${quota.limit}). Upgrade for more Pulse Scans.`
        : "Monthly scan limit reached.",
    );
    this.name = "OcrQuotaExceededError";
    this.quota = quota;
  }
}

export async function checkOcrScanQuota(organizationId: string): Promise<OcrQuotaStatus> {
  const { data, error } = await supabase().rpc("check_ocr_scan_quota", {
    p_org_id: organizationId,
  });
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown> | null;
  return {
    allowed: Boolean(row?.allowed),
    used: Number(row?.used ?? 0),
    limit: row?.limit != null ? Number(row.limit) : null,
    tier: String(row?.tier ?? "pulse_core"),
    reason: row?.reason != null ? String(row.reason) : null,
  };
}

/**
 * Soft gate for Pulse Scan enqueue.
 * Enforcement is off for now so scans are not blocked by the monthly limit SCAN NOTICE.
 * Flip to true to restore hard quota blocking without other call-site changes.
 */
const OCR_QUOTA_ENFORCEMENT_ENABLED = false;

export async function assertOcrScanQuota(organizationId: string): Promise<OcrQuotaStatus> {
  const quota = await checkOcrScanQuota(organizationId);
  if (OCR_QUOTA_ENFORCEMENT_ENABLED && !quota.allowed) {
    throw new OcrQuotaExceededError(quota);
  }
  return quota;
}
