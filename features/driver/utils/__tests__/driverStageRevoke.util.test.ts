import { previousStageTarget } from "@/features/driver/utils/driverStageRevoke.util";

describe("driver stage revoke targets", () => {
  it("offers no driver revoke from a completed trip (reopen is office-only)", () => {
    expect(previousStageTarget("completed")).toBeNull();
  });

  it("keeps one-step-back targets before completion", () => {
    expect(previousStageTarget("reached")).toMatchObject({ step: "transit", status: "in_transit" });
    expect(previousStageTarget("transit")).toMatchObject({ step: "lr", status: "in_progress", lr: "enter" });
    expect(previousStageTarget("lr")).toMatchObject({ step: "pickup", status: null, lr: "clear" });
    expect(previousStageTarget("pickup")).toMatchObject({ step: "accepted", status: "assigned" });
    expect(previousStageTarget("accepted")).toBeNull();
  });
});
