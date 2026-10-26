import {
  appendBisimNote,
  formatSimCompletionInput,
  lastBisimCoordinate,
  parseSimCompletionInput,
  hour12To24,
  hour24To12,
  parseSimCompletionPickerValue,
  toSimCompletionPickerValue,
  resolveSimulateStageCoordinate,
  simulateStageStopTarget,
  unrevokedBisimEntries,
} from "@/features/trips/utils/simulateTripStage.util";

const trip = {
  pickup_lat: 11.65,
  pickup_lon: 75.81,
  drop_lat: 15.139,
  drop_lon: 76.921,
  pickup_area: "Perambra",
  drop_location: "Ballari",
  drop_area: "Ballari",
};

describe("simulateTripStage", () => {
  it("lets revoke walk back more than one simulated step", () => {
    const notes = [
      "[BISIM|in_progress|2026-10-26T10:00:00.000Z|1|2|Ops|assigned|Pickup]",
      "[BISIM|in_transit|2026-10-26T11:00:00.000Z|1|2|Ops|in_progress|Route]",
      "[BISIM_REVOKE|in_transit|in_progress|2026-10-26T12:00:00.000Z|1|2|Ops]",
    ].join("\n");
    expect(unrevokedBisimEntries(notes).map((row) => row.status)).toEqual([
      "in_progress",
    ]);
  });

  it("uses drop coords for arrival and completion", () => {
    expect(simulateStageStopTarget("at_drop")).toBe("drop");
    expect(simulateStageStopTarget("completed")).toBe("drop");
    expect(simulateStageStopTarget("in_transit")).toBe("pickup");
  });

  it("prefers live GPS when present", () => {
    expect(
      resolveSimulateStageCoordinate(trip, "at_drop", { lat: 12.1, lng: 77.2 }),
    ).toEqual({ lat: 12.1, lng: 77.2 });
  });

  it("places the driver at drop-off when there is no ping", () => {
    expect(
      resolveSimulateStageCoordinate(trip, "at_drop", { lat: null, lng: null }),
    ).toEqual({ lat: 15.139, lng: 76.921 });
  });

  it("appends a BISIM line without dropping prior notes", () => {
    const notes = appendBisimNote({
      existingNotes: "keep me",
      targetStatus: "at_drop",
      fromStatus: "in_transit",
      userName: "Ops",
      lat: 15.139,
      lng: 76.921,
      at: "2026-09-22T10:00:00.000Z",
    });
    expect(notes).toContain("keep me");
    expect(notes).toContain("[BISIM|at_drop|2026-09-22T10:00:00.000Z|15.139|76.921|Ops|in_transit]");
  });

  it("reads the latest simulated pin", () => {
    expect(
      lastBisimCoordinate([
        { lat: 11.65, lng: 75.81 },
        { lat: null, lng: null },
        { lat: 15.139, lng: 76.921 },
      ]),
    ).toEqual({ latitude: 15.139, longitude: 76.921 });
  });

  it("accepts a manual completion time and rejects a bad one", () => {
    const parsed = parseSimCompletionInput("29/09/2026 17:30");
    expect(parsed).toBe(new Date(2026, 8, 29, 17, 30, 0, 0).toISOString());
    expect(parseSimCompletionInput("31/02/2026 10:00")).toBeNull();
    expect(parseSimCompletionInput("now")).toBeNull();
    expect(formatSimCompletionInput(new Date(2026, 8, 29, 9, 5))).toBe("29/09/2026 09:05");
    expect(toSimCompletionPickerValue(new Date(2026, 8, 29, 17, 48))).toBe("2026-09-29T17:48");
    expect(parseSimCompletionPickerValue("2026-09-29T17:48")).toBe(
      new Date(2026, 8, 29, 17, 48, 0, 0).toISOString(),
    );
    expect(parseSimCompletionPickerValue("2026-02-31T10:00")).toBeNull();
    expect(hour24To12(0)).toEqual({ hour: 12, period: "AM" });
    expect(hour24To12(20)).toEqual({ hour: 8, period: "PM" });
    expect(hour12To24(8, "PM")).toBe(20);
    expect(hour12To24(12, "AM")).toBe(0);
    const notes = appendBisimNote({
      existingNotes: "",
      targetStatus: "completed",
      fromStatus: "at_drop",
      userName: "Ops",
      lat: null,
      lng: null,
      at: parsed!,
    });
    expect(notes).toContain(parsed);
  });
});
