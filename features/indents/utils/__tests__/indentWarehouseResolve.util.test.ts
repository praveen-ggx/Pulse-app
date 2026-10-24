import { resolveIndentWarehouseId } from "@/features/indents/utils/indentWarehouseResolve.util";

describe("resolveIndentWarehouseId", () => {
  it("uses the lane origin warehouse when the indent is lane-based", () => {
    expect(
      resolveIndentWarehouseId({
        laneOriginWarehouseId: "wh-lane",
        pickupMatchedWarehouseId: "wh-typed",
      }),
    ).toBe("wh-lane");
  });

  it("keeps an explicit warehouse_id over lane and pickup match", () => {
    expect(
      resolveIndentWarehouseId({
        explicitWarehouseId: "wh-given",
        laneOriginWarehouseId: "wh-lane",
        pickupMatchedWarehouseId: "wh-typed",
      }),
    ).toBe("wh-given");
  });

  it("falls back to pickup-address match when the lane has no warehouse", () => {
    expect(
      resolveIndentWarehouseId({
        laneOriginWarehouseId: null,
        pickupMatchedWarehouseId: "wh-typed",
      }),
    ).toBe("wh-typed");
  });

  it("stays null for a typed pickup with no warehouse and no lane hub", () => {
    expect(
      resolveIndentWarehouseId({
        laneOriginWarehouseId: null,
        pickupMatchedWarehouseId: null,
      }),
    ).toBeNull();
  });

  it("does not invent a warehouse for a non-lane indent without a match", () => {
    expect(resolveIndentWarehouseId({})).toBeNull();
  });
});
