import {
  changeDriverSheetTrip,
  interpretChangeDriverFetch,
} from "@/features/trips/components/reassign/changeDriverPopupHost.util";
import type { TripRow } from "@/features/trips/services/trips.service";

function trip(overrides: Partial<TripRow> & Pick<TripRow, "id">): TripRow {
  return {
    organization_id: "org-1",
    status: "assigned",
    ...overrides,
  } as TripRow;
}

describe("interpretChangeDriverFetch", () => {
  it("returns ready for an assignable open trip", () => {
    const row = trip({ id: "trip-025", driver_id: "drv-1" });
    expect(
      interpretChangeDriverFetch({
        tripId: "trip-025",
        canAssign: true,
        trip: row,
        error: null,
      }),
    ).toEqual({ status: "ready", trip: row });
  });

  it("blocks unauthorized users from a ready sheet", () => {
    expect(
      interpretChangeDriverFetch({
        tripId: "trip-025",
        canAssign: false,
        trip: trip({ id: "trip-025" }),
        error: null,
      }),
    ).toEqual({
      status: "error",
      message: "You do not have permission to change the driver.",
    });
  });

  it("blocks completed trips", () => {
    expect(
      interpretChangeDriverFetch({
        tripId: "trip-025",
        canAssign: true,
        trip: trip({ id: "trip-025", status: "completed" }),
        error: null,
      }).status,
    ).toBe("error");
  });

  it("surfaces not found and fetch errors", () => {
    expect(
      interpretChangeDriverFetch({
        tripId: "trip-025",
        canAssign: true,
        trip: null,
        error: null,
      }).message,
    ).toBe("Trip not found");
    expect(
      interpretChangeDriverFetch({
        tripId: "trip-025",
        canAssign: true,
        trip: null,
        error: new Error("timeout"),
      }).message,
    ).toBe("timeout");
  });

  it("rejects a row that does not match the open trip id", () => {
    expect(
      interpretChangeDriverFetch({
        tripId: "trip-025",
        canAssign: true,
        trip: trip({ id: "trip-other" }),
        error: null,
      }).message,
    ).toBe("Trip not found");
  });
});

describe("changeDriverSheetTrip", () => {
  const ready = {
    status: "ready" as const,
    trip: trip({ id: "trip-025" }),
  };

  it("hides the sheet while idle, loading, or mismatched", () => {
    expect(changeDriverSheetTrip(null, ready)).toBeNull();
    expect(
      changeDriverSheetTrip("trip-025", { status: "loading", tripId: "trip-025" }),
    ).toBeNull();
    expect(changeDriverSheetTrip("trip-b", ready)).toBeNull();
  });

  it("only returns the trip that matches the open notification", () => {
    expect(changeDriverSheetTrip("trip-025", ready)?.id).toBe("trip-025");
  });
});
