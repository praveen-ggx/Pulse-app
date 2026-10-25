/**
 * Reach campaign list uses the same indent-pool identity as Broadcast
 * (pickup × drop × vehicle). One card per lane; count is open indents on
 * that lane, not campaign rows or story posts.
 */
import {
  broadcastPoolId,
  groupBroadcastIndentsByPool,
  type BroadcastPoolIndent,
} from "@/features/network/utils/broadcastIndentPools.util";
import {
  poolKey,
  poolKeyId,
} from "@/features/network/utils/pooledOpportunity.util";
import type { ReachCampaignRow } from "@/features/reach/services/campaigns.service";

export type ReachPoolIndent = BroadcastPoolIndent;

export function reachCampaignSnapshotPoolId(campaign: ReachCampaignRow): string {
  const key = poolKey({
    pickup: campaign.snapshot_origin,
    drop: campaign.snapshot_destination,
    vehicleType: campaign.snapshot_vehicle_type,
  });
  if (key.pickup && key.drop && key.vehicleType) return poolKeyId(key);
  if (campaign.snapshot_source_indent_id) {
    return `indent:${campaign.snapshot_source_indent_id}`;
  }
  if (campaign.post_id) return `post:${campaign.post_id}`;
  return `solo:${campaign.id}`;
}

/** Prefer the live indent row so snapshot wording cannot split the lane. */
export function reachCampaignPoolId(
  campaign: ReachCampaignRow,
  indentById?: Map<string, ReachPoolIndent>,
): string {
  const indentId = campaign.snapshot_source_indent_id?.trim();
  const indent = indentId ? indentById?.get(indentId) : undefined;
  if (indent) return broadcastPoolId(indent);
  return reachCampaignSnapshotPoolId(campaign);
}

export function groupReachCampaignsByPool(
  campaigns: ReachCampaignRow[],
  indentById?: Map<string, ReachPoolIndent>,
): ReachCampaignRow[][] {
  const map = new Map<string, ReachCampaignRow[]>();
  const order: string[] = [];
  for (const campaign of campaigns) {
    const key = reachCampaignPoolId(campaign, indentById);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(campaign);
    } else {
      map.set(key, [campaign]);
      order.push(key);
    }
  }
  return order.map((key) => map.get(key)!);
}

export function indentCountForReachPool(
  campaign: ReachCampaignRow,
  openIndents: readonly ReachPoolIndent[],
  groupedCampaigns: readonly ReachCampaignRow[] = [campaign],
  indentById?: Map<string, ReachPoolIndent>,
): number {
  const lanes = groupBroadcastIndentsByPool(openIndents);
  const poolId = reachCampaignPoolId(campaign, indentById);
  const byPool = lanes.find((lane) => lane.poolId === poolId);
  if (byPool) return byPool.indentCount;

  const sourceId = campaign.snapshot_source_indent_id?.trim();
  if (sourceId) {
    const byMember = lanes.find((lane) =>
      lane.members.some((member) => member.id === sourceId),
    );
    if (byMember) return byMember.indentCount;
  }

  const fromCampaigns = new Set(
    groupedCampaigns
      .map((row) => row.snapshot_source_indent_id?.trim())
      .filter(Boolean),
  );
  return Math.max(fromCampaigns.size, 1);
}
