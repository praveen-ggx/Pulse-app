import { recordReachEvent } from "@/features/reach/services/events.service";
import {
  collectSponsoredCampaignIds,
  takeSponsoredImpressionSlot,
} from "@/features/reach/utils/sponsoredImpression.util";
import { useEffect } from "react";

/**
 * Count a Reach impression when a sponsored story is actually rendered —
 * Story reel, Get Load ads, or any other commercial surface. Shared session
 * dedupe so two surfaces on the same page do not double-count.
 */
export function useRecordSponsoredImpressions(
  posts: ReadonlyArray<{
    organization_id?: string | null;
    is_sponsored?: boolean | null;
    reach_campaign_id?: string | null;
  }>,
  orgId: string | null | undefined,
): void {
  const campaignKey = collectSponsoredCampaignIds(posts, orgId).join(",");

  useEffect(() => {
    const viewerOrgId = (orgId ?? "").trim();
    if (!viewerOrgId || !campaignKey) return;
    for (const campaignId of campaignKey.split(",")) {
      if (!takeSponsoredImpressionSlot(campaignId, viewerOrgId)) continue;
      void recordReachEvent(campaignId, "impression", viewerOrgId);
    }
  }, [campaignKey, orgId]);
}
