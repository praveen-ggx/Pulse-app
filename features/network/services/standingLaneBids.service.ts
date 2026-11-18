import { supabase } from "@/lib/supabase";

import type { StandingLaneBid } from "@/features/network/utils/standingLaneBids.util";

export async function previewStandingLaneBids(
  pickup: string,
  drop: string,
  vehicleType: string,
  indentId?: string | null,
): Promise<{ error: Error | null; bids: StandingLaneBid[] }> {
  const { data, error } = await supabase().rpc("preview_standing_lane_bids", {
    p_pickup: pickup,
    p_drop: drop,
    p_vehicle_type: vehicleType,
    p_indent_id: indentId ?? undefined,
  });
  if (error) return { error: new Error(error.message), bids: [] };
  const bids = (data ?? []).map((row) => ({
    bidderOrganizationId: row.bidder_organization_id,
    bidderOrganizationName: row.bidder_organization_name,
    amount: Number(row.amount),
    alreadyOnIndent: row.already_on_indent,
  }));
  return { error: null, bids };
}

export type MarketplaceLaneRateCommit = {
  commitId: string;
  /** Pending bids at this rate that now count toward the lane rate. */
  linked: number;
  /** Open loads on the lane that received the rate now. */
  attached: number;
  vehicleLimit: number;
  validUntil: string;
};

/** Carrier opt-in: keep this Marketplace rate on every open and future load on the lane. */
export async function commitMarketplaceLaneRate(input: {
  orgId: string;
  pickup: string;
  drop: string;
  vehicleType: string;
  amount: number;
  vehicleLimit: number;
  validUntilIso: string;
}): Promise<{ error: Error | null; commit: MarketplaceLaneRateCommit | null }> {
  const { data, error } = await supabase().rpc("commit_marketplace_lane_rate", {
    p_org_id: input.orgId,
    p_pickup: input.pickup,
    p_drop: input.drop,
    p_vehicle_type: input.vehicleType,
    p_amount: input.amount,
    p_vehicle_limit: input.vehicleLimit,
    p_valid_until: input.validUntilIso,
  });
  if (error) return { error: new Error(error.message), commit: null };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    error: null,
    commit: {
      commitId: String(row.commit_id ?? ""),
      linked: Number(row.linked ?? 0),
      attached: Number(row.attached ?? 0),
      vehicleLimit: Number(row.vehicle_limit ?? input.vehicleLimit),
      validUntil: String(row.valid_until ?? input.validUntilIso),
    },
  };
}

export async function withdrawMarketplaceLaneRate(
  commitId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase().rpc("withdraw_marketplace_lane_rate", {
    p_commit_id: commitId,
  });
  return { error: error ? new Error(error.message) : null };
}
