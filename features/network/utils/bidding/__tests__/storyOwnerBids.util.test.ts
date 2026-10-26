import {
  buildStoryOwnerBidRows,
  formatStoryBidSubmittedAt,
  latestStoryOwnerBid,
  type StoryOwnerBidRow,
} from "@/features/network/utils/bidding/storyOwnerBids.util";

function row(
  key: string,
  createdAt: string,
  amount = 1000,
): StoryOwnerBidRow {
  return {
    key,
    channel: "pulse_story",
    channelLabel: "Pulse story",
    identifier: key,
    bidderOrgId: "org-b",
    bidderName: "Bidder",
    amount,
    status: "pending",
    note: null,
    createdAt,
    bidId: key,
    quoteId: null,
  };
}

describe("latestStoryOwnerBid", () => {
  it("picks the newest submitted-at bid and keeps history intact", () => {
    const older = row("old", "2026-10-25T08:00:00.000Z", 4000);
    const newer = row("new", "2026-10-25T10:15:00.000Z", 4200);
    const rows = buildStoryOwnerBidRows(
      [
        {
          id: "old",
          post_id: "p1",
          bidder_organization_id: "org-b",
          bidder_org_name: "Bidder",
          bidder_org_logo_url: null,
          bidder_org_avatar_seed: null,
          bidder_user_id: "u1",
          amount: 4000,
          note: null,
          status: "pending",
          created_at: older.createdAt,
          updated_at: older.createdAt,
        },
        {
          id: "new",
          post_id: "p2",
          bidder_organization_id: "org-c",
          bidder_org_name: "Later",
          bidder_org_logo_url: null,
          bidder_org_avatar_seed: null,
          bidder_user_id: "u2",
          amount: 4200,
          note: null,
          status: "pending",
          created_at: newer.createdAt,
          updated_at: newer.createdAt,
        },
      ],
      [],
    );
    expect(rows).toHaveLength(2);
    expect(latestStoryOwnerBid(rows)?.key).toBe("story-new");
    expect(latestStoryOwnerBid(rows)?.amount).toBe(4200);
  });
});

describe("formatStoryBidSubmittedAt", () => {
  it("returns a readable submitted-at stamp", () => {
    const label = formatStoryBidSubmittedAt("2026-10-25T16:11:00.000Z");
    expect(label).toMatch(/2026/);
    expect(label).toMatch(/Oct/i);
  });
});
