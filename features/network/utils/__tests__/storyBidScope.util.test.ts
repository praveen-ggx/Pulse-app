import {
  isShipperScopedStoryPost,
  STORY_BID_SCOPE_NOTE,
} from "@/features/network/utils/storyBidScope.util";

describe("isShipperScopedStoryPost", () => {
  it("requires a linked indent owned by the story shipper", () => {
    expect(
      isShipperScopedStoryPost({
        source_indent_id: "ind-1",
        organization_id: "shipper-1",
      }),
    ).toBe(true);
    expect(
      isShipperScopedStoryPost({
        source_indent_id: null,
        organization_id: "shipper-1",
      }),
    ).toBe(false);
  });

  it("states the bid never enters the Network pool", () => {
    expect(STORY_BID_SCOPE_NOTE.toLowerCase()).toContain("network pool");
    expect(STORY_BID_SCOPE_NOTE.toLowerCase()).toContain("this shipper");
  });
});
