import {
  hubItemListIndex,
  hubPageForIndex,
  hubVisibleCountForIndex,
} from "../hubLastOpenedVisibility.util";

describe("hubLastOpenedVisibility", () => {
  it("finds a trip after indent cards on the ALL rail", () => {
    expect(
      hubItemListIndex({
        id: "t2",
        indentIds: ["i1", "i2"],
        tripIds: ["t1", "t2", "t3"],
        includeIndents: true,
        includeTrips: true,
      }),
    ).toBe(3);
  });

  it("finds an indent on the indent rail", () => {
    expect(
      hubItemListIndex({
        id: "i2",
        indentIds: ["i1", "i2"],
        tripIds: ["t1"],
        includeIndents: true,
        includeTrips: false,
      }),
    ).toBe(1);
  });

  it("returns -1 when the ticket is not on this rail", () => {
    expect(
      hubItemListIndex({
        id: "t9",
        indentIds: ["i1"],
        tripIds: ["t1"],
        includeIndents: false,
        includeTrips: true,
      }),
    ).toBe(-1);
  });

  it("maps an index onto the page that contains it", () => {
    expect(hubPageForIndex(0, 12)).toBe(0);
    expect(hubPageForIndex(12, 12)).toBe(1);
    expect(hubPageForIndex(-1, 12)).toBe(0);
  });

  it("expands the mobile batch so the opened card is mounted", () => {
    expect(hubVisibleCountForIndex(18, 8)).toBe(19);
    expect(hubVisibleCountForIndex(-1, 8)).toBe(8);
  });
});
