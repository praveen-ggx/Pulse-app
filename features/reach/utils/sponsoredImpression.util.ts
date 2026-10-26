type SponsoredImpressionPost = {
  organization_id?: string | null;
  is_sponsored?: boolean | null;
  reach_campaign_id?: string | null;
};

const recordedThisSession = new Set<string>();

export function sponsoredImpressionKey(campaignId: string, orgId: string): string {
  return `${campaignId}:${orgId}`;
}

/** First surface to show this campaign to this org wins the session slot. */
export function takeSponsoredImpressionSlot(campaignId: string, orgId: string): boolean {
  const key = sponsoredImpressionKey(campaignId, orgId);
  if (recordedThisSession.has(key)) return false;
  recordedThisSession.add(key);
  return true;
}

export function collectSponsoredCampaignIds(
  posts: readonly SponsoredImpressionPost[],
  viewerOrgId?: string | null,
): string[] {
  const viewer = (viewerOrgId ?? "").trim();
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const post of posts) {
    const campaignId = (post.reach_campaign_id ?? "").trim();
    if (!campaignId || seen.has(campaignId)) continue;
    if (post.is_sponsored === false) continue;
    const author = (post.organization_id ?? "").trim();
    if (viewer && author && author === viewer) continue;
    seen.add(campaignId);
    ids.push(campaignId);
  }
  return ids;
}
