import {
  OTHER_LOCATIONS,
  groupLocationOptions,
  locationPlace,
} from "@/features/network/utils/marketplaceLocationGroups.util";

describe("locationPlace", () => {
  it("takes the state from the trailing part and drops it from the place", () => {
    expect(locationPlace("Pune, Maharashtra")).toEqual({ place: "Pune", state: "Maharashtra", region: "West" });
    expect(locationPlace("Chennai warehouse, CHennai, Tamil nadu")).toEqual({
      place: "Chennai Warehouse",
      state: "Tamil Nadu",
      region: "South",
    });
  });

  it("maps NCR to Delhi and resolves bare cities and misspellings", () => {
    expect(locationPlace("Delhi, NCR")).toMatchObject({ place: "Delhi", state: "Delhi", region: "North" });
    expect(locationPlace("Delhi")).toMatchObject({ place: "Delhi", state: "Delhi" });
    expect(locationPlace("Banglore")).toMatchObject({ place: "Bengaluru", state: "Karnataka" });
    expect(locationPlace("Bengaluru, Bangalore")).toMatchObject({ place: "Bengaluru", state: "Karnataka" });
    expect(locationPlace("Bombay, Maharashtra")).toMatchObject({ place: "Mumbai", state: "Maharashtra" });
    expect(locationPlace("Bhopal")).toMatchObject({ state: "Madhya Pradesh", region: "West" });
  });

  it("leaves unknown places without a state", () => {
    expect(locationPlace("Yard 7")).toEqual({ place: "Yard 7", state: null, region: null });
  });
});

describe("groupLocationOptions", () => {
  const options = [
    { label: "Delhi", count: 1 },
    { label: "Delhi, NCR", count: 2 },
    { label: "Pune, Maharashtra", count: 1 },
    { label: "Mumbai, Maharashtra", count: 4 },
    { label: "Nagpur", count: 1 },
    { label: "Chennai, Tamil Nadu", count: 3 },
    { label: "Yard 7", count: 9 },
  ];

  it("groups by state, busiest first, with unresolved places last", () => {
    const groups = groupLocationOptions(options);
    expect(groups.map((g) => [g.state, g.total])).toEqual([
      ["Maharashtra", 6],
      ["Delhi", 3],
      ["Tamil Nadu", 3],
      [OTHER_LOCATIONS, 9],
    ]);
    expect(groups[0].items.map((i) => i.place)).toEqual(["Mumbai", "Nagpur", "Pune"]);
  });

  it("shows one chip per place, carrying every pool label behind it", () => {
    const delhi = groupLocationOptions(options).find((g) => g.state === "Delhi");
    expect(delhi?.items).toHaveLength(1);
    expect(delhi?.items[0]).toMatchObject({
      place: "Delhi",
      label: "Delhi, NCR",
      count: 3,
      labels: ["Delhi", "Delhi, NCR"],
    });

    const karnataka = groupLocationOptions([
      { label: "Banglore", count: 2 },
      { label: "Bengaluru, Bangalore", count: 5 },
    ]);
    expect(karnataka[0].items).toHaveLength(1);
    expect(karnataka[0].items[0]).toMatchObject({ place: "Bengaluru", label: "Bengaluru, Bangalore", count: 7 });
  });

  it("keeps look-alikes apart, under their full labels, for single-value pickers", () => {
    const groups = groupLocationOptions(
      [
        { label: "Bangalore", count: 2 },
        { label: "Bengaluru, Bangalore", count: 1 },
      ],
      "",
      { mergeSamePlace: false },
    );
    expect(groups[0].items.map((i) => [i.place, i.labels])).toEqual([
      ["Bangalore", ["Bangalore"]],
      ["Bengaluru, Bangalore", ["Bengaluru, Bangalore"]],
    ]);
  });

  it("tags the busiest places as hot after merging, never single-load ones", () => {
    const hot = groupLocationOptions(options)
      .flatMap((g) => g.items)
      .filter((i) => i.hot)
      .map((i) => i.place);
    expect(hot.sort()).toEqual(["Chennai", "Delhi", "Mumbai", "Yard 7"]);
    expect(groupLocationOptions([{ label: "Surat", count: 1 }])[0].items[0].hot).toBe(false);
  });

  it("matches a search on state or region name", () => {
    expect(groupLocationOptions(options, "maharashtra").map((g) => g.state)).toEqual(["Maharashtra"]);
    expect(groupLocationOptions(options, "south").map((g) => g.state)).toEqual(["Tamil Nadu"]);
  });
});
