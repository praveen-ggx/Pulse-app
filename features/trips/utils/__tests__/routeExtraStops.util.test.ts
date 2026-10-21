import {
  EMPTY_ROUTE_EXTRA_STOP_SUMMARY,
  extraStopChipLabel,
  extraStopPaidLabel,
  uniqueViaStopLocations,
  viaStopLocationsByParentId,
  viaStopLocationsForMemberIds,
  freightWithExtraStops,
  newRouteExtraStopDraft,
  parseStopCharge,
  routeExtraStopDraftIncomplete,
  routeExtraStopDraftsFromRows,
  routeExtraStopInputs,
  summarizeRouteExtraStops,
} from "@/features/trips/utils/routeExtraStops.util";

const inr = (n: number) => `₹${n}`;

describe("routeExtraStops.util", () => {
  it("parses charges leniently and ignores junk", () => {
    expect(parseStopCharge("1,500")).toBe(1500);
    expect(parseStopCharge("₹ 250.555")).toBe(250.56);
    expect(parseStopCharge("")).toBe(0);
    expect(parseStopCharge("-")).toBe(0);
  });

  it("drops rows without a location and keeps order", () => {
    const a = { ...newRouteExtraStopDraft(), location: " Hosur ", clientCharge: "500", supplierCharge: "300" };
    const empty = { ...newRouteExtraStopDraft(), clientCharge: "999" };
    const b = { ...newRouteExtraStopDraft(), location: "Krishnagiri", lat: 12.5, lon: 78.2 };
    const inputs = routeExtraStopInputs([a, empty, b]);
    expect(inputs).toEqual([
      { location: "Hosur", latitude: null, longitude: null, clientCharge: 500, supplierCharge: 300 },
      { location: "Krishnagiri", latitude: 12.5, longitude: 78.2, clientCharge: 0, supplierCharge: 0 },
    ]);
    expect(routeExtraStopDraftIncomplete(empty)).toBe(true);
    expect(routeExtraStopDraftIncomplete(a)).toBe(false);
  });

  it("adds stop charges to both sides of the freight", () => {
    const summary = summarizeRouteExtraStops([
      { clientCharge: 500, supplierCharge: 300 },
      { clientCharge: 700, supplierCharge: 400 },
    ]);
    expect(summary).toEqual({ count: 2, clientCharge: 1200, supplierCharge: 700 });
    expect(freightWithExtraStops({ client: 40000, supplier: 35000 }, summary)).toEqual({
      client: 41200,
      supplier: 35700,
    });
  });

  it("leaves an unset (0) freight side at 0", () => {
    const summary = { count: 1, clientCharge: 500, supplierCharge: 300 };
    expect(freightWithExtraStops({ client: 40000, supplier: 0 }, summary)).toEqual({
      client: 40500,
      supplier: 0,
    });
  });

  it("labels the chip and the extra paid per viewer side", () => {
    const summary = { count: 2, clientCharge: 1200, supplierCharge: 700 };
    expect(extraStopChipLabel(1)).toBe("+1 stop");
    expect(extraStopChipLabel(2)).toBe("+2 stops");
    expect(extraStopChipLabel(0)).toBeNull();
    expect(extraStopPaidLabel(summary, "client", inr)).toBe("incl. ₹1200 extra paid");
    expect(extraStopPaidLabel(summary, "supplier", inr)).toBe("incl. ₹700 extra paid");
    expect(extraStopPaidLabel({ ...summary, supplierCharge: 0 }, "supplier", inr)).toBeNull();
    expect(extraStopPaidLabel(EMPTY_ROUTE_EXTRA_STOP_SUMMARY, "client", inr)).toBeNull();
  });

  it("lists unique via stop places in sequence for the bidder", () => {
    expect(
      uniqueViaStopLocations([
        { location: " Krishnagiri ", sequence: 2 },
        { location: "Hosur", sequence: 1 },
        { location: "hosur", sequence: 3 },
        { location: "  ", sequence: 0 },
      ]),
    ).toEqual(["Hosur", "Krishnagiri"]);
    const byIndent = viaStopLocationsByParentId(
      [
        { location: "Hosur", sequence: 1, indent_id: "a" },
        { location: "Salem", sequence: 1, indent_id: "b" },
        { location: "Hosur", sequence: 2, indent_id: "b" },
      ],
      "indent_id",
    );
    expect(viaStopLocationsForMemberIds(["a", "b"], byIndent)).toEqual([
      "Hosur",
      "Salem",
    ]);
  });

  it("rebuilds editor rows from saved stops", () => {
    const drafts = routeExtraStopDraftsFromRows([
      { location: "Hosur", latitude: 12.7, longitude: 77.8, client_charge: 500, supplier_charge: 0 },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      location: "Hosur",
      lat: 12.7,
      lon: 77.8,
      clientCharge: "500",
      supplierCharge: "",
    });
    expect(routeExtraStopInputs(drafts)[0].clientCharge).toBe(500);
  });
});
