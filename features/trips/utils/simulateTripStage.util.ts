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
  // `at` = picker selection (stage clock). editedAt = when this save happened.
  const editedAt = new Date().toISOString();
  const simEntry = `[BISIM|${params.targetStatus}|${at}|${params.lat ?? ""}|${params.lng ?? ""}|${params.userName}|${params.fromStatus}|${place}|${editedAt}]`;
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
  /** Wall-clock of the save. Absent on lines written before this was recorded. */
  editedAt: string | null;
};

export type ParsedBisimRevoke = {
  fromStatus: string;
  toStatus: string;
  timestamp: string;
  /** Person who revoked, stored on the note. Empty when an older line omitted it. */
  userName: string;
};

/** Last field is the save clock when it is an ISO timestamp and the line has a location slot. */
function splitBisimFields(body: string): {
  status: string;
  timestamp: string;
  lat: string;
  lng: string;
  userName: string;
  fromStatus: string;
  locationLabel: string;
  editedAt: string | null;
} {
  const parts = body.split("|");
  let editedAt: string | null = null;
  const last = (parts[parts.length - 1] ?? "").trim();
  if (parts.length >= 8 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(last)) {
    editedAt = last;
    parts.pop();
  }
  const [status, timestamp, lat, lng, userName, fromStatus, ...locationParts] = parts;
  return {
    status: status ?? "",
    timestamp: timestamp ?? "",
    lat: lat ?? "",
    lng: lng ?? "",
    userName: userName ?? "",
    fromStatus: fromStatus ?? "",
    locationLabel: locationParts.join("|").trim(),
    editedAt,
  };
}

type SimulationNoteEvent =
  | { kind: "sim"; entry: ParsedBisimEntry }
  | { kind: "revoke"; entry: ParsedBisimRevoke; silent?: boolean };

function parseRevokeLine(
  line: string,
  prefix: "[BISIM_REVOKE|" | "[BISIM_SUPERSEDE|",
): ParsedBisimRevoke | null {
  if (!line.startsWith(prefix) || !line.endsWith("]")) return null;
  const parts = line.slice(prefix.length, -1).split("|");
  const fromStatus = parts[0];
  const toStatus = parts[1];
  const timestamp = parts[2];
  // [PREFIX|from|to|iso|lat|lng|userName] — name may itself contain |.
  const userName = parts.slice(5).join("|").trim();
  if (!fromStatus || !toStatus) return null;
  return {
    fromStatus: fromStatus.trim().toLowerCase(),
    toStatus: toStatus.trim().toLowerCase(),
    timestamp: timestamp ?? "",
    userName,
  };
}

/** BISIM, BISIM_REVOKE, and silent BISIM_SUPERSEDE lines in file order. */
function parseTripSimulationEvents(
  notes: string | null | undefined,
): SimulationNoteEvent[] {
  if (!notes?.trim()) return [];
  const events: SimulationNoteEvent[] = [];
  for (const raw of notes.split("\n")) {
    const line = raw.trim();
    const revoke = parseRevokeLine(line, "[BISIM_REVOKE|");
    if (revoke) {
      events.push({ kind: "revoke", entry: revoke });
      continue;
    }
    // Internal clear before re-simulate — updates the live stack, not Activity Log.
    const supersede = parseRevokeLine(line, "[BISIM_SUPERSEDE|");
    if (supersede) {
      events.push({ kind: "revoke", entry: supersede, silent: true });
      continue;
    }
    if (!line.startsWith("[BISIM|") || !line.endsWith("]")) continue;
    const parsed = splitBisimFields(line.slice(7, -1));
    if (!parsed.status) continue;
    events.push({
      kind: "sim",
      entry: {
        status: parsed.status.trim().toLowerCase(),
        timestamp: parsed.timestamp,
        lat: parseFloat(parsed.lat) || null,
        lng: parseFloat(parsed.lng) || null,
        userName: parsed.userName || "Business",
        fromStatus: parsed.fromStatus?.trim().toLowerCase() || null,
        locationLabel: parsed.locationLabel?.trim() || null,
        editedAt: parsed.editedAt,
      },
    });
  }
  return events;
}

export function parseTripSimulationNotes(notes: string | null | undefined): {
  sims: ParsedBisimEntry[];
  revokes: ParsedBisimRevoke[];
} {
  const sims: ParsedBisimEntry[] = [];
  const revokes: ParsedBisimRevoke[] = [];
  for (const event of parseTripSimulationEvents(notes)) {
    if (event.kind === "sim") {
      sims.push(event.entry);
      continue;
    }
    // Silent supersedes are not user-facing Activity Log revokes.
    if (!event.silent) revokes.push(event.entry);
  }
  return { sims, revokes };
}

/**
 * Simulations still in effect.
 * A revoke cancels the latest sim of that stage written *before* the revoke.
 * A sim appended after the revoke is a new save and stays in effect.
 */
export function unrevokedBisimEntries(
  notes: string | null | undefined,
): ParsedBisimEntry[] {
  const stack: ParsedBisimEntry[] = [];
  for (const event of parseTripSimulationEvents(notes)) {
    if (event.kind === "sim") {
      stack.push(event.entry);
      continue;
    }
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i]?.status === event.entry.fromStatus) {
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

const PICKUP_SIM_STATUSES = new Set(["in_progress", "picked_up", "pickup"]);

/**
 * Last still-active simulation for these statuses, in the order it was saved.
 * A newly saved earlier time must beat an older line that is later on the clock.
 */
function latestSimTimestamp(
  notes: string | null | undefined,
  statuses: readonly string[],
): string | null {
  const want = new Set(statuses.map((s) => s.toLowerCase()));
  let last: string | null = null;
  for (const row of unrevokedBisimEntries(notes)) {
    if (!want.has(row.status) || !row.timestamp?.trim()) continue;
    if (!Number.isFinite(new Date(row.timestamp).getTime())) continue;
    last = row.timestamp;
  }
  return last;
}

/**
 * Pickup BISIM written after the latest revoke. That line is the Pickup the
 * user just saved; a stale `started_at` from before the revoke must not win.
 */
function pickupBisimSavedAfterLastRevoke(
  notes: string | null | undefined,
): string | null {
  const lines = String(notes ?? "").split("\n");
  let lastRevokeIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (
      (line.startsWith("[BISIM_REVOKE|") || line.startsWith("[BISIM_SUPERSEDE|")) &&
      line.endsWith("]")
    ) {
      lastRevokeIndex = index;
    }
  }
  if (lastRevokeIndex < 0) return null;
  let saved: string | null = null;
  for (let index = lastRevokeIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line.startsWith("[BISIM|") || !line.endsWith("]")) continue;
    const parts = line.slice(7, -1).split("|");
    const status = (parts[0] ?? "").trim().toLowerCase();
    const timestamp = (parts[1] ?? "").trim();
    if (!PICKUP_SIM_STATUSES.has(status) || !timestamp) continue;
    if (!Number.isFinite(new Date(timestamp).getTime())) continue;
    saved = timestamp;
  }
  return saved;
}

/**
 * True when Revoke Last returned the trip to Pickup and that Pickup time has
 * not been saved again. The next Simulate re-records Pickup; the one after
 * advances to In Transit using this new time.
 */
export function pickupRevisionPendingAfterRevoke(
  notes: string | null | undefined,
  status: string | null | undefined,
): boolean {
  const current = String(status ?? "").trim().toLowerCase();
  if (!PICKUP_SIM_STATUSES.has(current)) return false;
  const lines = String(notes ?? "").split("\n");
  let lastRevokeIndex = -1;
  let lastRevokeTo = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line.startsWith("[BISIM_REVOKE|") || !line.endsWith("]")) continue;
    lastRevokeIndex = index;
    lastRevokeTo = line.slice(14, -1).split("|")[1]?.trim().toLowerCase() ?? "";
  }
  if (lastRevokeIndex < 0 || !PICKUP_SIM_STATUSES.has(lastRevokeTo)) return false;
  return pickupBisimSavedAfterLastRevoke(notes) == null;
}

type ActiveBisimLine = { index: number; status: string };

/** BISIM lines still in effect, in file order, after BISIM_REVOKE. */
function activeBisimLines(notes: string): ActiveBisimLine[] {
  const stack: ActiveBisimLine[] = [];
  const lines = notes.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (
      (line.startsWith("[BISIM_REVOKE|") || line.startsWith("[BISIM_SUPERSEDE|")) &&
      line.endsWith("]")
    ) {
      const prefixLen = line.startsWith("[BISIM_SUPERSEDE|") ? 17 : 14;
      const fromStatus = line.slice(prefixLen, -1).split("|")[0]?.trim().toLowerCase();
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]?.status === fromStatus) {
          stack.splice(i, 1);
          break;
        }
      }
      continue;
    }
    if (!line.startsWith("[BISIM|") || !line.endsWith("]")) continue;
    const status = line.slice(7, -1).split("|")[0]?.trim().toLowerCase();
    if (!status) continue;
    stack.push({ index, status });
  }
  return stack;
}

function rewriteBisimLineTimestamp(line: string, atIso: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("[BISIM|") || !trimmed.endsWith("]")) return line;
  const parts = trimmed.slice(7, -1).split("|");
  parts[1] = atIso;
  return line.replace(trimmed, `[BISIM|${parts.join("|")}]`);
}

/**
 * Revoke every still-active BISIM whose status is in `statuses`.
 * Call before appending a new simulation so one save leaves one live entry
 * for that stage (a re-save no longer stacks duplicate badges).
 */
export function clearUnrevokedBisimStatuses(
  notes: string | null | undefined,
  statuses: readonly string[],
  params: {
    userName: string;
    toStatus: string;
    at?: string;
    lat?: number | null;
    lng?: number | null;
  },
): string {
  const want = new Set(
    statuses.map((status) => String(status ?? "").trim().toLowerCase()).filter(Boolean),
  );
  if (want.size === 0) return String(notes ?? "");
  let next = String(notes ?? "");
  const at = String(params.at ?? new Date().toISOString()).trim();
  const lat = params.lat ?? "";
  const lng = params.lng ?? "";
  const userName = params.userName || "Business";
  const toStatus = String(params.toStatus ?? "").trim().toLowerCase() || "assigned";

  for (;;) {
    const live = unrevokedBisimEntries(next);
    let match: ParsedBisimEntry | null = null;
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const row = live[i];
      if (row && want.has(row.status)) {
        match = row;
        break;
      }
    }
    if (!match) break;
    // Silent supersede — clears the live stack without an Activity Log revoke row.
    const revokeEntry = `[BISIM_SUPERSEDE|${match.status}|${toStatus}|${at}|${lat}|${lng}|${userName}]`;
    const trimmed = next.trim();
    next = trimmed ? `${trimmed}\n${revokeEntry}` : revokeEntry;
  }
  return next;
}

/**
 * Point every still-active BISIM line for these statuses at `at`.
 * Revoked lines keep their original timestamps.
 * Used when Pickup is chosen again so an older, later line cannot outrank it.
 */
export function alignUnrevokedBisimTimestamps(
  notes: string,
  statuses: readonly string[],
  at: string,
): string {
  const atIso = String(at ?? "").trim();
  if (!atIso || !notes.trim()) return notes;
  const want = new Set(statuses.map((status) => status.toLowerCase()));
  const indexes = new Set(
    activeBisimLines(notes)
      .filter((line) => want.has(line.status))
      .map((line) => line.index),
  );
  if (indexes.size === 0) return notes;
  const lines = notes.split("\n");
  for (const index of indexes) {
    const current = lines[index];
    if (current == null) continue;
    lines[index] = rewriteBisimLineTimestamp(current, atIso);
  }
  return lines.join("\n");
}

/**
 * Pickup instant the Journey Log and the next-stage picker use.
 * A Pickup BISIM saved after the latest revoke is the latest Pickup, even when
 * `started_at` still holds the previous value. With no Pickup line after the
 * revoke, `started_at` wins over an older BISIM that is later on the clock.
 */
export function resolvePickupReferenceIso(
  trip: Pick<TripRow, "started_at" | "notes">,
): string | null {
  const revisedAfterRevoke = pickupBisimSavedAfterLastRevoke(trip.notes);
  if (revisedAfterRevoke) return revisedAfterRevoke;
  const started = trip.started_at?.trim();
  if (started && Number.isFinite(new Date(started).getTime())) return started;
  return latestSimTimestamp(trip.notes, ["in_progress", "picked_up", "pickup"]);
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
 * Pickup has no floor (any past time) — returns null. No stage may be later
 * than now (see isSimCompletionInFuture).
 * In-transit floors to the next picker minute after the latest saved Pickup.
 * A revoked In Transit time is not a reference. Later stages chain from the
 * last saved previous stage, and never earlier than that Pickup instant.
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
  const pickupAt = resolvePickupReferenceIso(opts.trip);

  let minIso: string | null = null;
  if (target === "assigned") {
    // Driver-accept simulation — must be ≥ Assigned.
    minIso = assigned;
  } else if (target === "in_progress" || target === "picked_up") {
    // Pickup: any past instant — no Journey Log floor (future blocked separately).
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

export const SIM_FUTURE_TIME_MESSAGE =
  "Stage time can't be in the future. Pick the current time or earlier.";

/** Stage times cannot be later than the current minute (past stays open). */
export function isSimCompletionInFuture(
  completionIso: string,
  now: Date = new Date(),
): boolean {
  const ms = new Date(completionIso).getTime();
  if (!Number.isFinite(ms)) return false;
  return floorDateToMinuteMs(ms) > floorDateToMinuteMs(now.getTime());
}

/** Lower a picker value to `now` when it would be in the future. */
export function capSimCompletionPickerValueAtNow(
  value: string,
  now: Date = new Date(),
): string {
  const parsed = parseSimCompletionPickerValue(value);
  if (!parsed || isSimCompletionInFuture(parsed, now)) {
    return toSimCompletionPickerValue(now);
  }
  return value;
}

const SIM_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local "dd Mon yyyy, hh:mm AM" for stage messages. */
export function formatSimStageTime(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const { hour, period } = hour24To12(at.getHours());
  return `${pad(at.getDate())} ${SIM_MONTHS[at.getMonth()]} ${at.getFullYear()}, ${pad(hour)}:${pad(at.getMinutes())} ${period}`;
}

export type SimStageFloorWarning = {
  /** Journey Log name of the previous stage that is saved in the future. */
  stage: string;
  at: Date;
  message: string;
};

/**
 * A previous stage saved in the future (before the no-future rule) leaves no
 * valid time for the next stage: it must be "not before the previous stage"
 * and "not in the future". Names that stage so it can be corrected first.
 * Recomputed from the trip, so it clears once the stage is corrected.
 */
export function resolveSimStageFloorWarning(opts: {
  targetStatus: string;
  trip: Pick<
    TripRow,
    "created_at" | "updated_at" | "started_at" | "completed_at" | "driver_id" | "notes"
  >;
  assignmentChangedAt?: string | null;
  driverAcceptedAt?: string | null;
  groundOps?: boolean;
  now?: Date;
}): SimStageFloorWarning | null {
  const target = String(opts.targetStatus ?? "").trim().toLowerCase();
  if (!showsSimCompletionPicker(target) || isUnrestrictedPickupSimStage(target)) {
    return null;
  }
  const minAt = resolveSimulateStageMinAt(opts);
  const now = opts.now ?? new Date();
  if (!minAt || floorDateToMinuteMs(minAt.getTime()) <= floorDateToMinuteMs(now.getTime())) {
    return null;
  }
  const notes = opts.trip.notes;
  const pickupAt = resolvePickupReferenceIso(opts.trip);
  const inTransitAt = latestSimTimestamp(notes, ["in_transit"]);
  const atDropAt = latestSimTimestamp(notes, ["at_drop"]);
  // Same sources as resolveSimulateStageMinAt; the latest one is the floor.
  const candidates: Array<[string, string | null | undefined]> =
    target === "in_transit"
      ? [["Reached Pickup", pickupAt]]
      : target === "at_drop"
        ? [["In Transit", inTransitAt], ["Reached Pickup", pickupAt]]
        : [["At Drop", atDropAt], ["In Transit", inTransitAt], ["Reached Pickup", pickupAt]];
  let stage = "The previous stage";
  let best = -Infinity;
  for (const [name, iso] of candidates) {
    const ms = iso ? new Date(iso).getTime() : NaN;
    if (Number.isFinite(ms) && ms > best) {
      best = ms;
      stage = name;
    }
  }
  const how = opts.groundOps
    ? `Ask Trip Ops to correct ${stage}`
    : `Use Revoke Last to correct ${stage}`;
  return {
    stage,
    at: minAt,
    message: `${stage} is saved in the future (${formatSimStageTime(minAt)}). ${how}, then try again.`,
  };
}

/** Pickup stage — manual date+time with no floor; never later than now. */
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

/** Statuses that mean the trip is delivered. Revoke Last from these is owner/admin only. */
const DELIVERED_STAGE_STATUSES = new Set(["completed", "delivered", "done"]);

export function revokeLastFromDeliveredRequiresOwner(
  status: string | null | undefined,
): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return DELIVERED_STAGE_STATUSES.has(s);
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
