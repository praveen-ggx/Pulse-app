import {
  pickOpenedStorySeed,
  storyIdsForBubble,
} from "@/features/network/utils/storyReelOpen.util";

describe("storyIdsForBubble", () => {
  it("keeps only the tapped org / type / lane", () => {
    expect(
      storyIdsForBubble(
        [
          { id: "mine", organization_id: "me", type: "LOAD", is_sponsored: false },
          { id: "gogo-1", organization_id: "gogo", type: "LOAD", is_sponsored: false },
          { id: "gogo-2", organization_id: "gogo", type: "LOAD", is_sponsored: false },
          { id: "gogo-ad", organization_id: "gogo", type: "LOAD", is_sponsored: true },
        ],
        { id: "gogo-1", organization_id: "gogo", type: "LOAD", is_sponsored: false },
      ),
    ).toEqual(["gogo-1", "gogo-2"]);
  });

  it("counts every story that opens from that bubble", () => {
    expect(
      storyIdsForBubble(
        [
          { id: "godrej-1", organization_id: "godrej", type: "LOAD" },
          { id: "godrej-2", organization_id: "godrej", type: "LOAD" },
          { id: "pr-1", organization_id: "pr", type: "VEHICLE_AVAILABILITY" },
        ],
        { id: "godrej-1", organization_id: "godrej", type: "LOAD" },
      ).length,
    ).toBe(2);
  });
});

describe("pickOpenedStorySeed", () => {
  it("starts on the tapped post even when another org is first in the queue", () => {
    const mine = { id: "mine" };
    const gogo = { id: "gogo-1" };
    expect(pickOpenedStorySeed("gogo-1", [mine, gogo], [])).toEqual(gogo);
  });

  it("falls back to extras when the feed dropped the tapped id", () => {
    const live = { id: "mine-live" };
    expect(pickOpenedStorySeed("mine-live", [], [live])).toEqual(live);
  });
});
