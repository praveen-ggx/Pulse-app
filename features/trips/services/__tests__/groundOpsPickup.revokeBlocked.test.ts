import { revokeGroundOpsPickupStatus } from "@/features/trips/services/groundOpsPickup.service";

describe("revokeGroundOpsPickupStatus", () => {
  it("refuses undo for Ground Ops without calling the revoke RPC", async () => {
    const result = await revokeGroundOpsPickupStatus("any-trip-id");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cannot undo or revoke/i);
  });
});
