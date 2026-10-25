import {
  collectSponsoredCampaignIds,
  takeSponsoredImpressionSlot,
} from "@/features/reach/utils/sponsoredImpression.util";

describe("sponsoredImpression.util", () => {
  it("collects unique sponsored campaign ids", () => {
    expect(
      collectSponsoredCampaignIds([
        { is_sponsored: true, reach_campaign_id: "c1" },
        { is_sponsored: false, reach_campaign_id: "c2" },
        {
          is_sponsored: true,
          reach_campaign_id: "own",
          organization_id: "viewer",
        },
        { is_sponsored: true, reach_campaign_id: "c1" },
        { is_sponsored: true, reach_campaign_id: " c3 " },
      ], "viewer"),
    ).toEqual(["c1", "c3"]);
  });

  it("gives one session slot per campaign and org", () => {
    expect(takeSponsoredImpressionSlot("camp-a", "org-1")).toBe(true);
    expect(takeSponsoredImpressionSlot("camp-a", "org-1")).toBe(false);
    expect(takeSponsoredImpressionSlot("camp-a", "org-2")).toBe(true);
  });
});
