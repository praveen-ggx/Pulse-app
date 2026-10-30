import { groundOpsPickupMovedTo } from "@/features/trips/utils/groundOpsPickupStale.util";

describe("groundOpsPickupMovedTo", () => {
  it("reads the status a stale pickup step lost to (prod P0001 messages)", () => {
    expect(groundOpsPickupMovedTo("Cannot mark reached-pickup from status in_progress")).toBe("in_progress");
    expect(groundOpsPickupMovedTo("Cannot mark reached-pickup from status in_transit")).toBe("in_transit");
    expect(groundOpsPickupMovedTo("Cannot mark loaded/departed from status delivered")).toBe("delivered");
  });

  it("leaves other failures to the dialog's error text", () => {
    expect(groundOpsPickupMovedTo("This trip is not at one of your assigned warehouses")).toBeNull();
    expect(groundOpsPickupMovedTo("missing_mandatory_documents")).toBeNull();
    expect(groundOpsPickupMovedTo("")).toBeNull();
  });
});
