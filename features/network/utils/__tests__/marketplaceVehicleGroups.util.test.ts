import {
  groupVehicleOptions,
  vehicleCategoryKey,
} from "@/features/network/utils/marketplaceVehicleGroups.util";

describe("vehicle picker groups", () => {
  it.each([
    ["Closed Container", "container"],
    ["32 FT MXL 18 MT", "multiAxle"],
    ["32 FOOT MXL", "multiAxle"],
    ["Open 16 Wheeler", "open"],
    ["Open Body Truck", "open"],
    ["10 FT", "light"],
    ["17 FT", "medium"],
    ["Taurus 17ft", "medium"],
    ["7 MT", "medium"],
    ["24 MT", "heavy"],
    ["Truck", "other"],
  ])("puts %s in %s", (label, key) => {
    expect(vehicleCategoryKey(label)).toBe(key);
  });

  it("orders sections and sorts each by size", () => {
    const groups = groupVehicleOptions([
      { label: "Truck", count: 1 },
      { label: "17 FT", count: 1 },
      { label: "10 FT", count: 1 },
      { label: "7 MT", count: 3 },
      { label: "Closed Container", count: 1 },
    ]);
    expect(groups.map((g) => g.state)).toEqual(["Light trucks", "Medium trucks", "Containers", "Other vehicles"]);
    expect(groups[1].items.map((i) => i.label)).toEqual(["7 MT", "17 FT"]);
    expect(groups[1].items[0].hot).toBe(true);
  });

  it("matches the query against the category too", () => {
    const groups = groupVehicleOptions(
      [
        { label: "Closed Container", count: 1 },
        { label: "10 FT", count: 1 },
      ],
      "closed body",
    );
    expect(groups.map((g) => g.state)).toEqual(["Containers"]);
  });
});
