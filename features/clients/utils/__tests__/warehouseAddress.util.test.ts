import {
  laneWarehouseError,
  pickupWarehouseLinkWarning,
  resolveIndentWarehouseId,
  warehouseAddressLine,
  warehouseIdForPickup,
} from "@/features/clients/utils/warehouseAddress.util";

const WH = [
  { id: "w1", name: "Jeedimetla", address: "Plot 4, IDA", city: "Hyderabad", state: "Telangana", pincode: "500055" },
  { id: "w2", name: "Rajpura", address: null, city: "Rajpura", state: "Punjab", pincode: null },
];

describe("warehouseIdForPickup", () => {
  it("links the warehouse whose suggested pickup text was kept", () => {
    expect(warehouseIdForPickup(warehouseAddressLine(WH[0]), WH)).toBe("w1");
  });

  it("ignores spacing / case differences", () => {
    expect(warehouseIdForPickup(`  ${warehouseAddressLine(WH[1]).toUpperCase()} `, WH)).toBe("w2");
  });

  it("returns null for a typed or edited pickup", () => {
    expect(warehouseIdForPickup("Jeedimetla, Hyderabad", WH)).toBeNull();
    expect(warehouseIdForPickup("", WH)).toBeNull();
  });

  it("returns null when two warehouses share the same address line", () => {
    const dup = [WH[1], { ...WH[1], id: "w3" }];
    expect(warehouseIdForPickup(warehouseAddressLine(WH[1]), dup)).toBeNull();
  });
});

const OWN = WH.map((w) => ({ ...w, client_id: "c1" }));
const OTHER = { id: "x1", client_id: "c2", name: "Rajpura", address: null, city: "Rajpura", state: "Punjab", pincode: null };

describe("resolveIndentWarehouseId", () => {
  it("uses an explicit warehouse of the client first", () => {
    expect(
      resolveIndentWarehouseId({
        clientId: "c1",
        warehouses: OWN,
        explicitWarehouseId: "w2",
        lane: { client_id: "c1", origin_warehouse_id: "w1" },
      }),
    ).toBe("w2");
  });

  it("rejects an explicit warehouse of another client", () => {
    expect(
      resolveIndentWarehouseId({ clientId: "c1", warehouses: [...OWN, OTHER], explicitWarehouseId: "x1" }),
    ).toBeNull();
  });

  it("uses the lane's pickup warehouse", () => {
    expect(
      resolveIndentWarehouseId({ clientId: "c1", warehouses: OWN, lane: { client_id: "c1", origin_warehouse_id: "w2" }, pickup: "Rajpura, Punjab" }),
    ).toBe("w2");
  });

  it("does not link a lane without a warehouse or a lane of another client", () => {
    expect(
      resolveIndentWarehouseId({ clientId: "c1", warehouses: OWN, lane: { client_id: "c1", origin_warehouse_id: null }, pickup: "Rajpura, Punjab" }),
    ).toBeNull();
    expect(
      resolveIndentWarehouseId({ clientId: "c1", warehouses: [...OWN, OTHER], lane: { client_id: "c2", origin_warehouse_id: "x1" } }),
    ).toBeNull();
    expect(
      resolveIndentWarehouseId({ clientId: "c1", warehouses: [...OWN, OTHER], lane: { client_id: "c1", origin_warehouse_id: "x1" } }),
    ).toBeNull();
  });

  it("links only an exact, unique warehouse address — no city or partial matching", () => {
    expect(resolveIndentWarehouseId({ clientId: "c1", warehouses: OWN, pickup: warehouseAddressLine(WH[0]) })).toBe("w1");
    expect(resolveIndentWarehouseId({ clientId: "c1", warehouses: OWN, pickup: "Rajpura" })).toBeNull();
    expect(resolveIndentWarehouseId({ clientId: "c1", warehouses: OWN, pickup: "Rajpura, Punjab" })).toBeNull();
    expect(resolveIndentWarehouseId({ clientId: "c1", warehouses: OWN, pickup: "Arupukottai, Tamil Nadu" })).toBeNull();
  });

  it("never links another client's warehouse by address", () => {
    expect(resolveIndentWarehouseId({ clientId: "c1", warehouses: [OTHER], pickup: warehouseAddressLine(OTHER) })).toBeNull();
  });

  it("returns null without a client or for a client with no warehouses", () => {
    expect(resolveIndentWarehouseId({ clientId: null, warehouses: OWN, pickup: warehouseAddressLine(WH[0]) })).toBeNull();
    expect(resolveIndentWarehouseId({ clientId: "c1", warehouses: [], pickup: "Rajpura" })).toBeNull();
  });
});

describe("pickupWarehouseLinkWarning", () => {
  const base = { clientId: "c1", clientName: "Apollo", warehouses: OWN, laneSelected: false, lane: null };

  it("warns for a typed pickup that links to no warehouse, but does not block it", () => {
    expect(pickupWarehouseLinkWarning({ ...base, pickup: "Arupukottai, Tamil Nadu" })).toMatch(/isn't one of Apollo's saved warehouses/);
  });

  it("stays quiet for a picked warehouse suggestion or a lane with a warehouse", () => {
    expect(pickupWarehouseLinkWarning({ ...base, pickup: warehouseAddressLine(WH[0]) })).toBeNull();
    expect(
      pickupWarehouseLinkWarning({ ...base, laneSelected: true, lane: { client_id: "c1", origin_warehouse_id: "w1" }, pickup: "Jeedimetla, Hyderabad" }),
    ).toBeNull();
  });

  it("explains a selected lane that has no pickup warehouse", () => {
    expect(
      pickupWarehouseLinkWarning({ ...base, laneSelected: true, lane: { client_id: "c1", origin_warehouse_id: null }, pickup: "Perambra, Kerala" }),
    ).toMatch(/lane has no pickup warehouse/);
  });

  it("stays quiet without a client, without client warehouses, with an empty pickup, or before lane details load", () => {
    expect(pickupWarehouseLinkWarning({ ...base, clientId: null, pickup: "X" })).toBeNull();
    expect(pickupWarehouseLinkWarning({ ...base, warehouses: [], pickup: "X" })).toBeNull();
    expect(pickupWarehouseLinkWarning({ ...base, pickup: "  " })).toBeNull();
    expect(pickupWarehouseLinkWarning({ ...base, laneSelected: true, lane: null, pickup: "X" })).toBeNull();
  });
});

describe("laneWarehouseError", () => {
  const ids = ["w1", "w2"];

  it("allows one of the client's warehouses", () => {
    expect(laneWarehouseError({ warehouseId: "w2", clientWarehouseIds: ids })).toBeNull();
  });

  it("blocks a lane without a warehouse (Custom pickup)", () => {
    expect(laneWarehouseError({ warehouseId: null, clientWarehouseIds: ids })).toMatch(/Choose the pickup warehouse/);
  });

  it("blocks another client's or an unknown warehouse", () => {
    expect(laneWarehouseError({ warehouseId: "x1", clientWarehouseIds: ids })).toMatch(/not one of this client's warehouses/);
  });

  it("asks for a warehouse first when the client has none", () => {
    expect(laneWarehouseError({ warehouseId: null, clientWarehouseIds: [] })).toMatch(/Add a warehouse for this client first/);
    expect(laneWarehouseError({ warehouseId: "w1", clientWarehouseIds: [] })).toMatch(/Add a warehouse for this client first/);
  });
});
