import {
  groupReachCampaignsByPool,
  indentCountForReachPool,
  reachCampaignPoolId,
} from "@/features/reach/utils/reachCampaignPool.util";
import type { ReachCampaignRow } from "@/features/reach/services/campaigns.service";

function campaign(
  extra: Partial<ReachCampaignRow> & { id: string },
): ReachCampaignRow {
  return {
    org_id: "org",
    post_id: extra.post_id ?? `post-${extra.id}`,
    plan_id: "plan",
    status: "active",
    published_at: "2026-10-25T10:00:00Z",
    expires_at: "2026-10-26T10:00:00Z",
    completed_at: null,
    created_at: "2026-10-25T10:00:00Z",
    snapshot_post_type: "LOAD",
    snapshot_title: null,
    snapshot_origin: extra.snapshot_origin ?? "Periyapalayam, Tamil Nadu",
    snapshot_destination: extra.snapshot_destination ?? "Poonamallee, Tamil Nadu",
    snapshot_vehicle_type: extra.snapshot_vehicle_type ?? "20FT",
    snapshot_material: "Machinery parts",
    snapshot_content: null,
    snapshot_posted_at: null,
    snapshot_source_indent_id: extra.snapshot_source_indent_id ?? null,
    cancel_reason: null,
    source_deleted_at: null,
    distribution_channels: ["fleet"],
    driver_reward_enabled: false,
    reward_type: "flat",
    reward_amount: 0,
    reward_budget: 0,
    reward_reserved: 0,
    reward_paid: 0,
    reward_refunded: 0,
    ...extra,
  };
}

const indentA = {
  id: "ind-a",
  pickup_area: "Periyapalayam",
  drop_location: "Poonamallee",
  vehicle_type: "20FT",
  created_at: "2026-10-25T08:00:00Z",
};
const indentB = {
  id: "ind-b",
  pickup_area: "periyapalayam",
  drop_location: "POONAMALLEE",
  vehicle_type: "20ft",
  created_at: "2026-10-25T09:00:00Z",
};
const indentOther = {
  id: "ind-c",
  pickup_area: "Periyapalayam",
  drop_location: "Chennai",
  vehicle_type: "20FT",
  created_at: "2026-10-25T09:30:00Z",
};

describe("reachCampaignPoolId", () => {
  it("uses the indent row so snapshot city+state still joins the pool", () => {
    const row = campaign({
      id: "c1",
      snapshot_source_indent_id: "ind-a",
    });
    const map = new Map([["ind-a", indentA]]);
    expect(reachCampaignPoolId(row, map)).toBe(reachCampaignPoolId(
      campaign({
        id: "c2",
        snapshot_origin: "Periyapalayam",
        snapshot_destination: "Poonamallee",
        snapshot_source_indent_id: "ind-b",
      }),
      new Map([["ind-b", indentB]]),
    ));
  });
});

describe("groupReachCampaignsByPool", () => {
  it("collapses two campaigns on the same lane", () => {
    const map = new Map([
      ["ind-a", indentA],
      ["ind-b", indentB],
    ]);
    const groups = groupReachCampaignsByPool(
      [
        campaign({ id: "c1", snapshot_source_indent_id: "ind-a" }),
        campaign({ id: "c2", snapshot_source_indent_id: "ind-b" }),
      ],
      map,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("keeps a different drop as its own card", () => {
    const map = new Map([
      ["ind-a", indentA],
      ["ind-c", indentOther],
    ]);
    expect(
      groupReachCampaignsByPool(
        [
          campaign({ id: "c1", snapshot_source_indent_id: "ind-a" }),
          campaign({
            id: "c2",
            snapshot_source_indent_id: "ind-c",
            snapshot_destination: "Chennai",
          }),
        ],
        map,
      ),
    ).toHaveLength(2);
  });
});

describe("indentCountForReachPool", () => {
  it("counts open pool members, not the single boosted indent", () => {
    const row = campaign({
      id: "c1",
      snapshot_source_indent_id: "ind-a",
    });
    expect(
      indentCountForReachPool(row, [indentA, indentB, indentOther], [row], new Map([
        ["ind-a", indentA],
      ])),
    ).toBe(2);
  });

  it("falls back to grouped campaign indent ids when the lane is gone", () => {
    const a = campaign({ id: "c1", snapshot_source_indent_id: "ind-a" });
    const b = campaign({ id: "c2", snapshot_source_indent_id: "ind-b" });
    expect(indentCountForReachPool(a, [], [a, b])).toBe(2);
  });
});
