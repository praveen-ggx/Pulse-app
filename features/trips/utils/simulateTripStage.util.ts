import type { TripRow } from "@/features/trips/services/trips.service";
import { getTripStopCoordinate } from "@/features/trips/domain/tripStage";

export function simulateStageStopTarget(
  targetStatus: string,
): "pickup" | "drop" {
  const s = String(targetStatus ?? "").trim().toLowerCase();
  if (s === "at_drop" || s === "completed" || s === "delivered" || s === "done") {
    return "drop";
  }
  return "pickup";
}

export function resolveSimulateStageCoordinate(
  trip: Pick<
    TripRow,
    | "pickup_lat"
    | "pickup_lon"
    | "drop_lat"
    | "drop_lon"
    | "pickup_area"
    | "drop_location"
    | "drop_area"
  >,
  targetStatus: string,
  live: { lat: number | null; lng: number | null },
): { lat: number | null; lng: number | null } {
  if (
    live.lat != null &&
    live.lng != null &&
    Number.isFinite(live.lat) &&
    Number.isFinite(live.lng)
  ) {
    return { lat: live.lat, lng: live.lng };
  }
  const stop = getTripStopCoordinate(trip, simulateStageStopTarget(targetStatus));
  if (!stop) return { lat: null, lng: null };
  return { lat: stop.latitude, lng: stop.longitude };
}

export function appendBisimNote(params: {
  existingNotes: string | null | undefined;
  targetStatus: string;
  fromStatus: string;
  userName: string;
  lat: number | null;
  lng: number | null;
  /** Required for simulate — never silently fall back to wall-clock now. */
  at: string;
  locationLabel?: string | null;
}): string {
  const at = String(params.at ?? "").trim();
  if (!at) {
    throw new Error("Simulation timestamp is required");
  }
  const place = (params.locationLabel ?? "").replace(/\|/g, " ").trim();
  const simEntry = `[BISIM|${params.targetStatus}|${at}|${params.lat ?? ""}|${params.lng ?? ""}|${params.userName}|${params.fromStatus}${place ? `|${place}` : ""}]`;
  const existing = params.existingNotes?.trim() || "";
  return existing ? `${existing}\n${simEntry}` : simEntry;
}

/**
 * Force the last BISIM line for `targetStatus` to use `at`.
 * Keeps Journey Log / started_at / notes aligned when a prior line was wrong.
 */
export function ensureBisimTimestampForStatus(
  notes: string,
  targetStatus: string,
  at: string,
): string {
  const status = String(targetStatus ?? "")
    .trim()
    .toLowerCase();
  const atIso = String(at ?? "").trim();
  if (!status || !atIso || !notes.trim()) return notes;
  const lines = notes.split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("[BISIM|") || !line.endsWith("]")) continue;
    const parts = line.slice(7, -1).split("|");
    if ((parts[0] ?? "").trim().toLowerCase() !== status) continue;
    parts[1] = atIso;
    lines[i] = `[BISIM|${parts.join("|")}]`;
    return lines.join("\n");
  }
  return notes;
}

/** Local completion time shown in the simulate dialog. */
export function formatSimCompletionInput(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` for a datetime picker, in local time. */
export function toSimCompletionPickerValue(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function hour24To12(hour24: number): { hour: number; period: "AM" | "PM" } {
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 || 12;
  return { hour, period };
}

export function hour12To24(hour12: number, period: "AM" | "PM"): number {
  const base = hour12 === 12 ? 0 : hour12;
  return period === "PM" ? base + 12 : base;
}

/** Parses a picker value into an ISO timestamp. Invalid input returns null. */
export function parseSimCompletionPickerValue(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

/** Parses DD/MM/YYYY HH:mm into an ISO timestamp. Invalid input returns null. */
export function parseSimCompletionInput(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.toISOString();
}

export type ParsedBisimEntry = {
  status: string;
  timestamp: string;
  lat: number | null;
  lng: number | null;
  userName: string;
  fromStatus: string | null;
  locationLabel: string | null;
};

export type ParsedBisimRevoke = {
  fromStatus: string;
  toStatus: string;
  timestamp: string;
};

export function parseTripSimulationNotes(notes: string | null | undefined): {
  sims: ParsedBisimEntry[];
  revokes: ParsedBisimRevoke[];
} {
  const sims: ParsedBisimEntry[] = [];
  const revokes: ParsedBisimRevoke[] = [];
  if (!notes?.trim()) return { sims, revokes };
  for (const raw of notes.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[BISIM_REVOKE|") && line.endsWith("]")) {
      const [fromStatus, toStatus, timestamp] = line.slice(14, -1).split("|");
      if (fromStatus && toStatus) {
        revokes.push({
          fromStatus: fromStatus.trim().toLowerCase(),
          toStatus: toStatus.trim().toLowerCase(),
          timestamp: timestamp ?? "",
        });
      }
      continue;
    }
    if (!line.startsWith("[BISIM|") || !line.endsWith("]")) continue;
    const [status, timestamp, lat, lng, userName, fromStatus, locationLabel] =
      line.slice(7, -1).split("|");
    if (!status) continue;
    sims.push({
      status: status.trim().toLowerCase(),
      timestamp: timestamp ?? "",
      lat: parseFloat(lat) || null,
      lng: parseFloat(lng) || null,
      userName: userName || "Business",
      fromStatus: fromStatus?.trim().toLowerCase() || null,
      locationLabel: locationLabel?.trim() || null,
    });
  }
  return { sims, revokes };
}

/** Simulations still in effect after later BISIM_REVOKE lines. */
export function unrevokedBisimEntries(
  notes: string | null | undefined,
): ParsedBisimEntry[] {
  const { sims, revokes } = parseTripSimulationNotes(notes);
  const stack = [...sims];
  for (const revoke of revokes) {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i]?.status === revoke.fromStatus) {
        stack.splice(i, 1);
        break;
      }
    }
  }
  return stack;
}

export function lastBisimCoordinate(
  entries: Array<{ lat: number | null; lng: number | null }>,
): { latitude: number; longitude: number } | null {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const lat = entries[i]?.lat;
    const lng = entries[i]?.lng;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }
  }
  return null;
}

function latestIso(...candidates: Array<string | null | undefined>): string | null {
  let bestMs = -Infinity;
  let best: string | null = null;
  for (const iso of candidates) {
    if (!iso?.trim()) continue;
    const ms = new Date(iso).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms >= bestMs) {
      bestMs = ms;
      best = iso;
    }
  }
  return best;
}

function latestSimTimestamp(
  notes: string | null | undefined,
  statuses: readonly string[],
): string | null {
  const want = new Set(statuses.map((s) => s.toLowerCase()));
  let best: string | null = null;
  for (const row of unrevokedBisimEntries(notes)) {
    if (!want.has(row.status) || !row.timestamp) continue;
    best = latestIso(best, row.timestamp);
  }
  return best;
}

/**
 * Assignment instant for the Journey Log "Assigned" step.
 * Uses assignment / reassignment audit only — never `updated_at` (revoke / simulate
 * bump it to "now" and must not rewrite Assigned).
 */
export function resolveTripAssignedAtIso(
  trip: Pick<TripRow, "driver_id" | "created_at" | "updated_at">,
  audits: ReadonlyArray<{
    changed_at: string;
    driver_id_new?: string | null;
    event_type?: string | null;
  }>,
): string | null {
  const assignLike = audits.filter((row) => {
    const ev = String(row.event_type ?? "")
      .trim()
      .toLowerCase();
    // Empty event_type: legacy rows. Ignore driver_accepted / completed.
    return ev === "assignment" || ev === "reassignment" || ev === "";
  });
  if (assignLike.length > 0) {
    const sorted = [...assignLike].sort(
      (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
    );
    const driverId = trip.driver_id;
    if (driverId) {
      const forDriver = [...sorted]
        .reverse()
        .find((row) => row.driver_id_new === driverId);
      if (forDriver?.changed_at) return forDriver.changed_at;
    }
    return sorted[0]?.changed_at ?? null;
  }
  // Stable fallback only — never updated_at.
  return trip.created_at ?? null;
}

/** Next whole picker minute after `iso` (exclusive floor for later stages). */
export function bumpIsoToNextPickerMinute(
  iso: string | null | undefined,
): string | null {
  if (!iso?.trim()) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(floorDateToMinuteMs(ms) + 60_000).toISOString();
}

/**
 * Minimum completion instant for the next simulate stage.
 * Same minute as the floor is allowed; earlier is not.
 *
 * Pickup is unrestricted (past or future) — returns null.
 * In-transit and later floor to the selected Pickup instant only (not Assigned /
 * Driver Accepted), so a past pickup is not blocked by a later accept time.
 */
export function resolveSimulateStageMinAt(opts: {
  targetStatus: string;
  trip: Pick<
    TripRow,
    "created_at" | "updated_at" | "started_at" | "completed_at" | "driver_id" | "notes"
  >;
  assignmentChangedAt?: string | null;
  driverAcceptedAt?: string | null;
}): Date | null {
  const target = String(opts.targetStatus ?? "")
    .trim()
    .toLowerCase();
  const assigned = latestIso(
    opts.assignmentChangedAt,
    opts.trip.created_at,
  );
  const notes = opts.trip.notes;
  const pickupAt = latestIso(
    opts.trip.started_at,
    latestSimTimestamp(notes, ["in_progress", "picked_up", "pickup"]),
  );

  let minIso: string | null = null;
  if (target === "assigned") {
    // Driver-accept simulation — must be ≥ Assigned.
    minIso = assigned;
  } else if (target === "in_progress" || target === "picked_up") {
    // Pickup: any past or future instant — no Journey Log floor.
    return null;
  } else if (target === "in_transit") {
    // Strictly after Pickup (next picker minute).
    minIso = bumpIsoToNextPickerMinute(pickupAt);
  } else if (target === "at_drop") {
    minIso = bumpIsoToNextPickerMinute(
      latestIso(
        latestSimTimestamp(notes, ["in_transit"]),
        pickupAt,
      ),
    );
  } else if (target === "completed" || target === "delivered" || target === "done") {
    minIso = bumpIsoToNextPickerMinute(
      latestIso(
        latestSimTimestamp(notes, ["at_drop"]),
        latestSimTimestamp(notes, ["in_transit"]),
        pickupAt,
      ),
    );
  } else {
    minIso = assigned;
  }

  if (!minIso) return null;
  const ms = new Date(minIso).getTime();
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** Picker values are minute-precision; floor so :36:45 vs :36:00 still counts as same minute. */
export function floorDateToMinuteMs(ms: number): number {
  if (!Number.isFinite(ms)) return NaN;
  return Math.floor(ms / 60_000) * 60_000;
}

/** True when ISO completion is on/after min (same minute allowed). */
export function isSimCompletionAtOrAfterMin(
  completionIso: string,
  minAt: Date | null | undefined,
): boolean {
  if (!minAt) return true;
  const ms = new Date(completionIso).getTime();
  if (!Number.isFinite(ms)) return false;
  return floorDateToMinuteMs(ms) >= floorDateToMinuteMs(minAt.getTime());
}

/**
 * When the picker lands in the same minute as min but at :00, bump to min so
 * stored ISO is not earlier than the previous Journey Log stage.
 */
export function alignSimCompletionIsoToMin(
  completionIso: string,
  minAt: Date | null | undefined,
): string {
  if (!minAt) return completionIso;
  const ms = new Date(completionIso).getTime();
  if (!Number.isFinite(ms)) return completionIso;
  if (
    floorDateToMinuteMs(ms) === floorDateToMinuteMs(minAt.getTime()) &&
    ms < minAt.getTime()
  ) {
    return minAt.toISOString();
  }
  return completionIso;
}

/** Raise a picker value to min when it would be earlier. */
export function clampSimCompletionPickerValue(
  value: string,
  minAt: Date | null | undefined,
): string {
  if (!minAt) return value || toSimCompletionPickerValue();
  const parsed = parseSimCompletionPickerValue(value);
  if (
    !parsed ||
    floorDateToMinuteMs(new Date(parsed).getTime()) <
      floorDateToMinuteMs(minAt.getTime())
  ) {
    return toSimCompletionPickerValue(minAt);
  }
  return value;
}

/** Pickup stage — manual date+time with no past/future floor. */
export function isUnrestrictedPickupSimStage(
  targetStatus: string | null | undefined,
): boolean {
  const s = String(targetStatus ?? "")
    .trim()
    .toLowerCase();
  return s === "in_progress" || s === "picked_up";
}

/**
 * Stages that show the completion date+time picker.
 * Driver-accept simulation stays automatic (Assigned / Accepted unchanged).
 */
export function showsSimCompletionPicker(
  targetStatus: string | null | undefined,
): boolean {
  const s = String(targetStatus ?? "")
    .trim()
    .toLowerCase();
  return (
    s === "in_progress" ||
    s === "picked_up" ||
    s === "in_transit" ||
    s === "at_drop" ||
    s === "completed" ||
    s === "delivered" ||
    s === "done"
  );
}

/** @deprecated Use isUnrestrictedPickupSimStage / showsSimCompletionPicker. */
export function isManualSimCompletionStage(
  targetStatus: string | null | undefined,
): boolean {
  return isUnrestrictedPickupSimStage(targetStatus);
}

/**
 * Auto stage instant: wall-clock now, never earlier than the previous Journey Log stage.
 * After a future pickup, the next confirm therefore lands on the pickup instant until "now" catches up.
 */
export function resolveAutoSimCompletionIso(
  minAt: Date | null | undefined,
  now = new Date(),
): string {
  if (!minAt) return now.toISOString();
  return floorDateToMinuteMs(now.getTime()) < floorDateToMinuteMs(minAt.getTime())
    ? minAt.toISOString()
    : now.toISOString();
}
