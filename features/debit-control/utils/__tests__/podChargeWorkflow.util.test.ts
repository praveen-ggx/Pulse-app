import {
  resolvePodChargeWorkflow,
  workflowEventPostedMs,
} from "@/features/debit-control/utils/podChargeWorkflow.util";

describe("podChargeWorkflow", () => {
  it("prefers payload posted_at over created_at", () => {
    expect(
      workflowEventPostedMs({
        createdAt: "2026-10-01T00:00:00.000Z",
        payload: { posted_at: "2026-10-25T10:00:00.000Z" },
      }),
    ).toBe(Date.parse("2026-10-25T10:00:00.000Z"));
  });

  it("treats a later revalidate as an open rework, not a saved settlement", () => {
    expect(
      resolvePodChargeWorkflow({
        validatedAtMs: Date.parse("2026-10-20T00:00:00.000Z"),
        revalidateAtMs: Date.parse("2026-10-25T00:00:00.000Z"),
      }),
    ).toEqual({ chargesSaved: false, revalidateRequested: true, settlementReleased: false });
  });

  it("returns the trip to settlement after a newer validate", () => {
    expect(
      resolvePodChargeWorkflow({
        validatedAtMs: Date.parse("2026-10-26T00:00:00.000Z"),
        revalidateAtMs: Date.parse("2026-10-25T00:00:00.000Z"),
      }),
    ).toEqual({ chargesSaved: true, revalidateRequested: false, settlementReleased: false });
  });

  it("clears saved and reverify when POD not found is the latest event", () => {
    expect(
      resolvePodChargeWorkflow({
        validatedAtMs: Date.parse("2026-10-26T00:00:00.000Z"),
        revalidateAtMs: Date.parse("2026-10-25T00:00:00.000Z"),
        notFoundAtMs: Date.parse("2026-10-27T00:00:00.000Z"),
      }),
    ).toEqual({ chargesSaved: false, revalidateRequested: false, settlementReleased: false });
  });

  it("keeps a later settlement release after CN / DN are posted", () => {
    expect(
      resolvePodChargeWorkflow({
        validatedAtMs: Date.parse("2026-10-20T00:00:00.000Z"),
        revalidateAtMs: Date.parse("2026-10-19T00:00:00.000Z"),
        settlementReleasedAtMs: Date.parse("2026-10-25T00:00:00.000Z"),
      }),
    ).toEqual({ chargesSaved: true, revalidateRequested: false, settlementReleased: true });
  });
});
