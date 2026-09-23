import {
  appendBisimNote,
  lastBisimCoordinate,
  resolveSimulateStageCoordinate,
  simulateStageStopTarget,
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
});
