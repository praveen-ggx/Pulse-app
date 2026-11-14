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
