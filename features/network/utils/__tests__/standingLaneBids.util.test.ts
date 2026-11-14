import {
  planStandingLaneMaterialization,
  standingLaneBidLines,
  standingLaneBidNotice,
  standingLaneKey,
  type StandingLaneSourceBid,
  type StandingLaneTarget,
} from "@/features/network/utils/standingLaneBids.util";

describe("standing lane bid preview", () => {
  const bids = [
    { bidderOrganizationId: "a", bidderOrganizationName: "Godrej", amount: 4233 },
    { bidderOrganizationId: "b", bidderOrganizationName: "  ", amount: 32000 },
  ];

  it("lists each carrier rate", () => {
    expect(standingLaneBidLines(bids)).toEqual(["Godrej · ₹4,233", "Carrier · ₹32,000"]);
  });

  it("tells the shipper the rates attach when Marketplace is on", () => {
    expect(standingLaneBidNotice(bids, true)).toBe(
      "2 carriers have already bid this lane. Sharing this load to Marketplace attaches these rates.",
    );
  });

  it("says nothing when the lane has no standing bids", () => {
    expect(standingLaneBidNotice([], false)).toBeNull();
  });

  it("separates a rate already stored on this load from rates still to attach", () => {
    expect(
      standingLaneBidNotice(
        [
          { ...bids[0], alreadyOnIndent: true },
          { ...bids[1], alreadyOnIndent: false },
        ],
        true,
      ),
    ).toBe(
      "1 carrier has already bid this lane. Sharing this load to Marketplace attaches these rates. 1 rate is already on this load.",
    );
    expect(standingLaneBidLines([{ ...bids[0], alreadyOnIndent: true }])).toEqual([
      "Already on this load · Godrej · ₹4,233",
    ]);
  });
});

function source(overrides: Partial<StandingLaneSourceBid> = {}): StandingLaneSourceBid {
  return {
    indentId: "load-1",
    shipperOrganizationId: "shipper-a",
    pickup: "Periyapalayam",
    drop: "Coimbatore",
    vehicleType: "32 Ft Mxl",
    circulation: "marketplace",
    status: "open",
    deleted: false,
    sponsored: false,
    bidderUserId: "user-carrier",
    bidderOrganizationId: "carrier",
    bidderType: "organization",
    bidStatus: "pending",
    amount: 4233,
    note: "original note",
    updatedAt: "2026-11-14T10:00:00.000Z",
    ...overrides,
  };
}

function target(overrides: Partial<StandingLaneTarget> = {}): StandingLaneTarget {
  return {
    indentId: "load-11",
    shipperOrganizationId: "shipper-b",
    pickup: "Periyapalayam",
    drop: "Coimbatore",
    vehicleType: "32 Ft Mxl",
    circulation: "both",
    status: "open",
    deleted: false,
    sponsored: false,
    existingBidderUserIds: [],
    existingBidderOrganizationIds: [],
    ...overrides,
  };
}

describe("standing lane materialization", () => {
  it("matches pickup, drop, and vehicle after the same trim and case folding as the lane key", () => {
    expect(standingLaneKey("  Periyapalayam ", "COIMBATORE", "32 Ft Mxl")).toBe(
      standingLaneKey("periyapalayam", "coimbatore", "32 ft mxl"),
    );
    expect(standingLaneKey("Periyapalayam", "", "32 Ft Mxl")).toBeNull();
  });

  it("copies the carrier rate onto the 11th matching load after bids on the first 10", () => {
    const prior = Array.from({ length: 10 }, (_, index) =>
      source({ indentId: `load-${index + 1}`, updatedAt: `2026-11-14T10:0${index}:00.000Z` }),
    );
    expect(planStandingLaneMaterialization(target(), prior)).toEqual([
      {
        bidderUserId: "user-carrier",
        bidderOrganizationId: "carrier",
        amount: 4233,
        note: "original note",
      },
    ]);
  });

  it("uses the latest pending rate when the same carrier bid the lane more than once", () => {
    const planned = planStandingLaneMaterialization(target(), [
      source({ amount: 4000, updatedAt: "2026-11-14T09:00:00.000Z" }),
      source({ indentId: "load-2", amount: 4500, updatedAt: "2026-11-14T12:00:00.000Z", note: "later" }),
    ]);
    expect(planned).toEqual([
      {
        bidderUserId: "user-carrier",
        bidderOrganizationId: "carrier",
        amount: 4500,
        note: "later",
      },
    ]);
  });

  it("attaches another shipper's matching Marketplace load and skips a different vehicle, pickup, or drop", () => {
    const planned = planStandingLaneMaterialization(target(), [
      source(),
      source({
        indentId: "other-vehicle",
        bidderUserId: "user-vehicle",
        bidderOrganizationId: "carrier-vehicle",
        vehicleType: "20 Ft",
      }),
      source({
        indentId: "other-pickup",
        bidderUserId: "user-pickup",
        bidderOrganizationId: "carrier-pickup",
        pickup: "Chennai",
      }),
      source({
        indentId: "other-drop",
        bidderUserId: "user-drop",
        bidderOrganizationId: "carrier-drop",
        drop: "Salem",
      }),
    ]);
    expect(planned.map((bid) => bid.bidderOrganizationId)).toEqual(["carrier"]);
  });

  it("excludes the shipper's own organization", () => {
    expect(
      planStandingLaneMaterialization(target({ shipperOrganizationId: "carrier" }), [source()]),
    ).toEqual([]);
  });

  it("does not copy a carrier that already has a bid, and a second pass stays empty", () => {
    const first = planStandingLaneMaterialization(target(), [source()]);
    expect(first).toHaveLength(1);
    const again = planStandingLaneMaterialization(
      target({
        existingBidderUserIds: first.map((bid) => bid.bidderUserId),
        existingBidderOrganizationIds: first.map((bid) => bid.bidderOrganizationId),
      }),
      [source()],
    );
    expect(again).toEqual([]);
  });

  it("leaves an awarded bid untouched and does not materialize onto a non-Marketplace load", () => {
    expect(
      planStandingLaneMaterialization(target(), [source({ bidStatus: "accepted", amount: 9999 })]),
    ).toEqual([]);
    expect(
      planStandingLaneMaterialization(target({ circulation: "integrated_supplier" }), [source()]),
    ).toEqual([]);
    expect(
      planStandingLaneMaterialization(target(), [source({ circulation: "integrated_supplier" })]),
    ).toEqual([]);
  });

  it("skips a closed, deleted, or sponsored source and a closed target", () => {
    expect(planStandingLaneMaterialization(target(), [source({ status: "awarded" })])).toEqual([]);
    expect(planStandingLaneMaterialization(target(), [source({ deleted: true })])).toEqual([]);
    expect(planStandingLaneMaterialization(target(), [source({ sponsored: true })])).toEqual([]);
    expect(planStandingLaneMaterialization(target({ status: "closed" }), [source()])).toEqual([]);
  });
});
