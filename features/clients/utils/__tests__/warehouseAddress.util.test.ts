import {
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
});
