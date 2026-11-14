import { hotMarketplaceLanes } from "@/features/network/utils/hotMarketplaceLanes.util";

describe("hot marketplace lanes", () => {
  it("keeps the lanes with the most open loads, in that order", () => {
    const hot = hotMarketplaceLanes(
      [
        { id: "small", load_count: 2 },
        { id: "top", load_count: 40 },
        { id: "mid", load_count: 9 },
      ],
      2,
    );
    expect(hot.map((lane) => lane.id)).toEqual(["top", "mid"]);
  });
});
