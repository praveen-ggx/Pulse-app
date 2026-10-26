import {
  isTripCompleted,
  type TripRow,
} from "@/features/trips/services/trips.service";

export type ChangeDriverHostState =
  | { status: "idle" }
  | { status: "loading"; tripId: string }
  | { status: "ready"; trip: TripRow }
  | { status: "error"; message: string };

export function interpretChangeDriverFetch(input: {
  tripId: string;
  canAssign: boolean;
  trip: TripRow | null;
  error: Error | null;
}): Extract<ChangeDriverHostState, { status: "ready" } | { status: "error" }> {
  const wanted = input.tripId.trim();
  if (!wanted) {
    return { status: "error", message: "Trip not found" };
  }
  if (input.error) {
    return {
      status: "error",
      message: input.error.message || "Could not load this trip.",
    };
  }
  if (!input.trip || input.trip.id !== wanted) {
    return { status: "error", message: "Trip not found" };
  }
  if (isTripCompleted(input.trip)) {
    return { status: "error", message: "This trip cannot be reassigned." };
  }
  if (!input.canAssign) {
    return {
      status: "error",
      message: "You do not have permission to change the driver.",
    };
  }
  return { status: "ready", trip: input.trip };
}

/** Never render a sheet whose trip id does not match the open notification. */
export function changeDriverSheetTrip(
  tripId: string | null,
  state: ChangeDriverHostState,
): TripRow | null {
  const wanted = (tripId ?? "").trim();
  if (!wanted) return null;
  if (state.status !== "ready") return null;
  if (state.trip.id !== wanted) return null;
  return state.trip;
}
