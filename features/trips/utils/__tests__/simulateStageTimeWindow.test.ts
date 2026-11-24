/**
 * Journey Log / Ground Ops simulate: stage times may be any past time but never
 * later than now, and each stage is never earlier than the previous one
 * (release prod-2026-11-23 review, nihas V1.0.84).
 */
import {
  capSimCompletionPickerValueAtNow,
  clampSimCompletionPickerValue,
  isSimCompletionAtOrAfterMin,
  isSimCompletionInFuture,
  isUnrestrictedPickupSimStage,
  parseSimCompletionPickerValue,
  resolveSimulateStageMinAt,
  resolveSimStageFloorWarning,
  SIM_FUTURE_TIME_MESSAGE,
  toSimCompletionPickerValue,
} from "../simulateTripStage.util";

const NOW = new Date(2026, 10, 24, 15, 30, 20); // 24 Nov 2026 15:30:20 local

describe("no stage time in the future", () => {
  it("allows the current minute and any past time", () => {
    expect(isSimCompletionInFuture(new Date(2026, 10, 24, 15, 30, 59).toISOString(), NOW)).toBe(false);
    expect(isSimCompletionInFuture(new Date(2026, 8, 1, 9, 0).toISOString(), NOW)).toBe(false);
    expect(isSimCompletionInFuture(new Date(2020, 0, 1).toISOString(), NOW)).toBe(false);
  });

  it("blocks the next minute and later", () => {
    expect(isSimCompletionInFuture(new Date(2026, 10, 24, 15, 31).toISOString(), NOW)).toBe(true);
    expect(isSimCompletionInFuture(new Date(2026, 10, 25, 9, 0).toISOString(), NOW)).toBe(true);
    expect(SIM_FUTURE_TIME_MESSAGE).toMatch(/can't be in the future/);
  });

  it("caps a future picker value (e.g. a saved future pickup being revised) at now", () => {
    expect(capSimCompletionPickerValueAtNow("2026-11-30T10:00", NOW)).toBe(toSimCompletionPickerValue(NOW));
    expect(capSimCompletionPickerValueAtNow("2026-11-01T10:00", NOW)).toBe("2026-11-01T10:00");
  });
});

describe("stages in order", () => {
  const pickup = "2026-11-10T04:30:00.000Z";
  const trip = {
    created_at: "2026-11-20T00:00:00.000Z",
    updated_at: null,
    started_at: pickup,
    completed_at: null,
    driver_id: null,
    notes: `[BISIM|in_progress|${pickup}|||A|assigned||x]`,
  } as never;

  it("Reached Pickup has no floor, even before the trip was created", () => {
    expect(isUnrestrictedPickupSimStage("in_progress")).toBe(true);
    expect(resolveSimulateStageMinAt({ targetStatus: "in_progress", trip })).toBeNull();
  });

  it("Start Trip cannot be before Pickup", () => {
    const min = resolveSimulateStageMinAt({ targetStatus: "in_transit", trip });
    expect(min).not.toBeNull();
    expect(isSimCompletionAtOrAfterMin("2026-11-10T04:29:00.000Z", min)).toBe(false);
    expect(isSimCompletionAtOrAfterMin("2026-11-10T04:31:00.000Z", min)).toBe(true);
  });

  it("At Drop cannot be before In Transit", () => {
    const withTransit = {
      ...(trip as object),
      notes: `[BISIM|in_progress|${pickup}|||A|assigned||x]\n[BISIM|in_transit|2026-11-11T04:30:00.000Z|||A|in_progress||y]`,
    } as never;
    const min = resolveSimulateStageMinAt({ targetStatus: "at_drop", trip: withTransit });
    expect(isSimCompletionAtOrAfterMin("2026-11-11T04:00:00.000Z", min)).toBe(false);
    expect(isSimCompletionAtOrAfterMin("2026-11-11T05:00:00.000Z", min)).toBe(true);
  });

  it("the floor clamp still raises a too-early value to the previous stage", () => {
    const min = new Date(parseSimCompletionPickerValue("2026-11-10T10:00")!);
    expect(clampSimCompletionPickerValue("2026-11-09T10:00", min)).toBe("2026-11-10T10:00");
  });
});

describe("previous stage saved in the future: named, blocks Confirm, clears after correction", () => {
  const FUTURE = "2026-11-26T04:30:00.000Z";
  const PAST = "2026-11-10T04:30:00.000Z";
  const base = { created_at: PAST, updated_at: null, completed_at: null, driver_id: null };
  const bisim = (status: string, at: string) => `[BISIM|${status}|${at}|||A|x||y]`;

  it("Start Trip after a future Reached Pickup names Reached Pickup", () => {
    const trip = { ...base, started_at: FUTURE, notes: bisim("in_progress", FUTURE) } as never;
    const w = resolveSimStageFloorWarning({ targetStatus: "in_transit", trip, now: NOW });
    expect(w?.stage).toBe("Reached Pickup");
    expect(w?.message).toMatch(/^Reached Pickup is saved in the future \(\d{2} Nov 2026, \d{2}:\d{2} (AM|PM)\)\. Use Revoke Last to correct Reached Pickup, then try again\.$/);
  });

  it("Ground Ops are told to ask Trip Ops (they cannot revoke)", () => {
    const trip = { ...base, started_at: FUTURE, notes: bisim("in_progress", FUTURE) } as never;
    const w = resolveSimStageFloorWarning({ targetStatus: "in_transit", trip, groundOps: true, now: NOW });
    expect(w?.message).toContain("Ask Trip Ops to correct Reached Pickup");
  });

  it("At Drop after a future In Transit names In Transit, not Pickup", () => {
    const trip = {
      ...base,
      started_at: PAST,
      notes: `${bisim("in_progress", PAST)}\n${bisim("in_transit", FUTURE)}`,
    } as never;
    expect(resolveSimStageFloorWarning({ targetStatus: "at_drop", trip, now: NOW })?.stage).toBe("In Transit");
  });

  it("Delivered after a future At Drop names At Drop", () => {
    const trip = {
      ...base,
      started_at: PAST,
      notes: `${bisim("in_progress", PAST)}\n${bisim("in_transit", PAST)}\n${bisim("at_drop", FUTURE)}`,
    } as never;
    expect(resolveSimStageFloorWarning({ targetStatus: "completed", trip, now: NOW })?.stage).toBe("At Drop");
  });

  it("clears once the stage is corrected, so the user can retry", () => {
    const corrected = { ...base, started_at: PAST, notes: bisim("in_progress", PAST) } as never;
    expect(resolveSimStageFloorWarning({ targetStatus: "in_transit", trip: corrected, now: NOW })).toBeNull();
  });

  it("never applies to Reached Pickup itself or when the previous stage is in the past", () => {
    const trip = { ...base, started_at: FUTURE, notes: bisim("in_progress", FUTURE) } as never;
    expect(resolveSimStageFloorWarning({ targetStatus: "in_progress", trip, now: NOW })).toBeNull();
    const pastTrip = { ...base, started_at: PAST, notes: bisim("in_progress", PAST) } as never;
    expect(resolveSimStageFloorWarning({ targetStatus: "at_drop", trip: pastTrip, now: NOW })).toBeNull();
  });
});
