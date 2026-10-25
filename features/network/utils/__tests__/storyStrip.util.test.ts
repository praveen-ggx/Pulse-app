import {
  collectApprovedNetworkOrgIds,
  collectStoryStripAudienceOrgIds,
  isPublishedPoolRouteStory,
  mergeStoryStripSources,
  selectStoryStripPosts,
  storyOrgPreviewLabel,
} from "@/features/network/utils/storyStrip.util";

const ME = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PARTNER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BOOSTER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("collectStoryStripAudienceOrgIds", () => {
  it("includes network invites and linked clients (Godrej), not only invites", () => {
    expect(
      collectStoryStripAudienceOrgIds(new Set([PARTNER]), new Set([BOOSTER])),
    ).toEqual(new Set([PARTNER, BOOSTER]));
  });
});

describe("collectApprovedNetworkOrgIds", () => {
  it("collects the other org on approved sent and received rows", () => {
    expect(
      collectApprovedNetworkOrgIds(ME, [
        {
          status: "approved",
          from_organization_id: ME,
          to_organization_id: PARTNER,
        },
        {
          status: "pending",
          from_organization_id: BOOSTER,
          to_organization_id: ME,
        },
        {
          status: "APPROVED",
          from_organization_id: BOOSTER,
          to_organization_id: ME,
        },
      ]),
    ).toEqual(new Set([PARTNER, BOOSTER]));
  });
});

describe("isPublishedPoolRouteStory", () => {
  it("keeps indent-linked LOAD stories that are still active", () => {
    expect(
      isPublishedPoolRouteStory({
        type: "LOAD",
        is_active: true,
        source_indent_id: "indent-1",
      }),
    ).toBe(true);
  });

  it("drops LOAD posts that are not pool-route (no indent)", () => {
    expect(
      isPublishedPoolRouteStory({
        type: "LOAD",
        is_active: true,
        source_indent_id: null,
      }),
    ).toBe(false);
  });
});

describe("selectStoryStripPosts", () => {
  const rows = [
    {
      id: "mine",
      organization_id: ME,
      type: "LOAD",
      is_sponsored: false,
      is_active: true,
      source_indent_id: "i-mine",
      created_at: "2026-10-25T10:00:00Z",
    },
    {
      id: "pool",
      organization_id: PARTNER,
      type: "LOAD",
      is_sponsored: false,
      is_active: true,
      source_indent_id: "i-pool",
      created_at: "2026-10-25T09:00:00Z",
    },
    {
      id: "ad",
      organization_id: BOOSTER,
      type: "LOAD",
      is_sponsored: true,
      is_active: true,
      source_indent_id: "i-ad",
      created_at: "2026-10-25T08:00:00Z",
    },
    {
      id: "reach-client",
      organization_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      type: "LOAD",
      is_sponsored: true,
      is_active: true,
      source_indent_id: "i-reach",
      created_at: "2026-10-25T07:00:00Z",
    },
  ];

  it("shows network-connected pool stories and their Boost ads, not Mine", () => {
    const selected = selectStoryStripPosts(
      rows,
      ME,
      new Set([PARTNER, BOOSTER]),
    );
    expect(selected.map((p) => p.id)).toEqual(["ad", "reach-client", "pool"]);
  });

  it("keeps plan-targeted Boost ads from orgs outside the network book", () => {
    const selected = selectStoryStripPosts(rows, ME, new Set([PARTNER]));
    expect(selected.map((p) => p.id)).toEqual(["ad", "reach-client", "pool"]);
  });

  it("still shows Boost ads before the network book is ready", () => {
    const selected = selectStoryStripPosts(rows, ME, new Set(), {
      connectionsReady: false,
    });
    expect(selected.map((p) => p.id)).toEqual(["ad", "reach-client"]);
  });
});

describe("storyOrgPreviewLabel", () => {
  it("uses the organization name under the story circle", () => {
    expect(storyOrgPreviewLabel({ org_name: "  Containeer Pvt Ltd  " })).toBe(
      "Containeer Pvt Ltd",
    );
    expect(storyOrgPreviewLabel({ org_name: "" })).toBe("");
  });
});

describe("mergeStoryStripSources", () => {
  it("keeps a connected story and overlays the Boost flag from the feed", () => {
    const merged = mergeStoryStripSources(
      [
        {
          id: "pool",
          is_sponsored: true,
          reach_campaign_id: "camp-1",
        },
      ],
      [
        {
          id: "pool",
          is_sponsored: false,
          reach_campaign_id: null,
        },
        {
          id: "other",
          is_sponsored: false,
          reach_campaign_id: null,
        },
      ],
    );
    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pool",
          is_sponsored: true,
          reach_campaign_id: "camp-1",
        }),
        expect.objectContaining({ id: "other", is_sponsored: false }),
      ]),
    );
  });
});
