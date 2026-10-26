import type { ReachCampaignRow } from '@/features/reach/services/campaigns.service';

/**
 * Org-level Pulse Boost invariant helper: at most one draft/active campaign
 * per organization (enforced in DB/RPC). Prefer `active` over `draft` if
 * both somehow appear (should not after the org unique index).
 */
export function findOrgDraftOrActiveCampaign(
  campaigns: ReachCampaignRow[] | undefined | null,
): ReachCampaignRow | null {
  if (!campaigns?.length) return null;
  const open = campaigns.filter((c) => c.status === 'draft' || c.status === 'active');
  if (open.length === 0) return null;
  return open.find((c) => c.status === 'active') ?? open[0] ?? null;
}
