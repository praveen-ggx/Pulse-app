import {
  collapseStoriesByLane,
  groupStoriesByLane,
  indentCountForStory,
  laneMembersForPost,
  storyLaneKey,
} from "@/features/network/utils/storyLaneGroup.util";

const ORG = "org-a";

function load(
  id: string,
  indent: string,
  created: string,
  extra?: { origin?: string; dest?: string; vehicle?: string },
) {
  return {
    id,
    organization_id: ORG,
    type: "LOAD" as const,
    origin: extra?.origin ?? "Periyapalayam",
    destination: extra?.dest ?? "Poonamallee",
    vehicle_type: extra?.vehicle ?? "20FT",
    source_indent_id: indent,
    created_at: created,
    is_sponsored: false,
  };
}

describe("storyLaneKey", () => {
  it("matches Network pool identity (case-folded lane)", () => {
    expect(
      storyLaneKey(load("p1", "i1", "2026-10-25T10:00:00Z")),
    ).toBe(
      storyLaneKey(
        load("p2", "i2", "2026-10-25T11:00:00Z", {
          origin: "periyapalayam",
          dest: "POONAMALLEE",
          vehicle: "20ft",
        }),
      ),
    );
  });

  it("keeps a different vehicle as its own lane", () => {
    expect(
      storyLaneKey(load("p1", "i1", "2026-10-25T10:00:00Z")),
    ).not.toBe(
      storyLaneKey(
        load("p2", "i2", "2026-10-25T10:00:00Z", { vehicle: "32FT" }),
      ),
    );
  });
});

describe("groupStoriesByLane", () => {
  it("collapses same-lane indent stories to one card and counts indents", () => {
    const grouped = groupStoriesByLane([
      load("old", "ind-1", "2026-10-25T08:00:00Z"),
      load("new", "ind-2", "2026-10-25T12:00:00Z"),
      load("twin", "ind-1", "2026-10-25T09:00:00Z"),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.post.id).toBe("new");
    expect(grouped[0]?.indentCount).toBe(2);
    expect(grouped[0]?.indentIds).toEqual(["ind-2", "ind-1"]);
  });

  it("keeps two lanes as two stories", () => {
    const posts = [
      load("a", "i1", "2026-10-25T12:00:00Z"),
      load("b", "i2", "2026-10-25T11:00:00Z", { dest: "Chennai" }),
    ];
    expect(collapseStoriesByLane(posts)).toHaveLength(2);
    expect(indentCountForStory(posts, "a")).toBe(1);
  });

  it("lists every indent and post on the same lane", () => {
    const posts = [
      load("new", "ind-2", "2026-10-25T12:00:00Z"),
      load("old", "ind-1", "2026-10-25T08:00:00Z"),
      load("other", "ind-9", "2026-10-25T09:00:00Z", { dest: "Chennai" }),
    ];
    const lane = laneMembersForPost(posts, "new");
    expect(lane.postIds.sort()).toEqual(["new", "old"]);
    expect(lane.indentIds.sort()).toEqual(["ind-1", "ind-2"]);
  });
});
