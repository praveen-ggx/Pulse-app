import { formatTrackingDateTime } from "@/features/trips/utils/formatTrackingTimestamp.util";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type { TripRow } from "@/features/trips/services/trips.service";

export type ManifestJourneyStepKey =
  | "assigned"
  | "driver_accepted"
  | "pickup"
  | "loading"
  | "in_transit"
  | "drop_off"
  | "unloading"
  | "delivered";

export type ManifestJourneyHistoryLine = {
  atIso: string;
  time: string;
  actor: string;
  action: string;
};

export type ManifestJourneyLogEntry = {
  stepKey: ManifestJourneyStepKey;
  status: string;
  location: string;
  /** GPS coordinates line shown under {@link location} when set. */
  locationCoords?: string | null;
  time: string;
  details: string;
  atIso: string | null;
  /** Oldest-first change trail for this step (who / when / what). */
  history?: ManifestJourneyHistoryLine[];
};

export type ManifestSimLogEntry = {
  status: string;
  timestamp: string;
  lat: number | null;
  lng: number | null;
  userName: string;
  /** Place name shown in the simulate dialog. */
  locationLabel?: string | null;
};

export type ManifestLocationPing = {
  recorded_at: string;
  latitude: number;
  longitude: number;
  locationName?: string | null;
};

const MANIFEST_LAST_INDEX = 5;

export const MANIFEST_PULSE_LAST_INDEX = MANIFEST_LAST_INDEX;

function formatCoordinateLabel(lat: number, lng: number): string {
  const latHem = lat >= 0 ? "N" : "S";
  const lngHem = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}°${latHem}, ${Math.abs(lng).toFixed(5)}°${lngHem}`;
}

function simEntryKey(entry: ManifestSimLogEntry): string {
  return `${entry.status}|${entry.timestamp}`;
}

function pickLatestSim(
  simLogs: ManifestSimLogEntry[],
  statuses: string[],
): ManifestSimLogEntry | null {
  const matches = simLogs.filter((e) => statuses.includes(e.status));
  return matches.length > 0 ? matches[matches.length - 1]! : null;
}

function locationFromSim(
  sim: ManifestSimLogEntry | null,
  simLocationByKey: Record<string, string>,
): string | null {
  if (!sim) return null;
  const labeled = simLocationByKey[simEntryKey(sim)]?.trim();
  if (labeled) return labeled;
  if (sim.lat != null && sim.lng != null) {
    return formatCoordinateLabel(sim.lat, sim.lng);
  }
  return null;
}

function isNearIso(
  recordedAt: string | null | undefined,
  eventIso: string | null,
  maxWindowMs: number,
): boolean {
  if (!recordedAt || !eventIso) return false;
  const a = new Date(recordedAt).getTime();
  const b = new Date(eventIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= maxWindowMs;
}

function pickPingAt(
  pings: ManifestLocationPing[],
  nearIso: string | null,
  maxWindowMs = 2 * 60 * 60 * 1000,
): ManifestLocationPing | null {
  if (!nearIso || pings.length === 0) return null;
  const target = new Date(nearIso).getTime();
  if (!Number.isFinite(target)) return null;

  let best: ManifestLocationPing | null = null;
  let bestDelta = Infinity;
  for (const ping of pings) {
    const t = new Date(ping.recorded_at).getTime();
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = ping;
    }
  }
  if (!best || bestDelta > maxWindowMs) return null;
  return best;
}

/** Prefer first driver GPS ping at/after acceptance; else nearest ping to that moment. */
function pickPingForDriverAcceptance(
  pings: ManifestLocationPing[],
  acceptedAtIso: string | null,
): ManifestLocationPing | null {
  if (!acceptedAtIso || pings.length === 0) return null;
  const target = new Date(acceptedAtIso).getTime();
  if (!Number.isFinite(target)) return null;

  const sorted = [...pings].sort(
    (a, b) =>
      new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const afterAccept = sorted.find((p) => {
    const t = new Date(p.recorded_at).getTime();
    return t >= target && t - target <= 2 * 60 * 60 * 1000;
  });
  if (afterAccept) return afterAccept;

  return pickPingAt(pings, acceptedAtIso, 30 * 60 * 1000);
}

function locationFromPing(
  pings: ManifestLocationPing[],
  nearIso: string | null,
  maxWindowMs = 2 * 60 * 60 * 1000,
): string | null {
  const best = pickPingAt(pings, nearIso, maxWindowMs);
  if (!best) return null;
  const named = (best.locationName ?? "").trim();
  if (named) return named;
  return formatCoordinateLabel(best.latitude, best.longitude);
}

function looksLikeCoordinateLabel(label: string): boolean {
  return /°\s*[NSEW]/i.test(label);
}

function formatDriverAcceptanceLocation(input: {
  ping: ManifestLocationPing | null;
  sim: ManifestSimLogEntry | null;
  simLocationByKey: Record<string, string>;
  geocodeLabel?: string | null;
  fallback: string;
}): { location: string; locationCoords: string | null; details: string } {
  let placeName: string | null = null;
  let coords: string | null = null;

  if (input.ping) {
    placeName = (input.ping.locationName ?? "").trim() || null;
    coords = formatCoordinateLabel(input.ping.latitude, input.ping.longitude);
  }

  if (input.sim) {
    const simLabel = locationFromSim(input.sim, input.simLocationByKey);
    if (simLabel) {
      if (looksLikeCoordinateLabel(simLabel)) {
        coords = coords ?? simLabel;
      } else if (!placeName) {
        placeName = simLabel;
      }
    }
    if (input.sim.lat != null && input.sim.lng != null) {
      coords = formatCoordinateLabel(input.sim.lat, input.sim.lng);
    }
  }

  if (!placeName && input.geocodeLabel?.trim()) {
    const geo = input.geocodeLabel.trim();
    if (looksLikeCoordinateLabel(geo)) {
      coords = coords ?? geo;
    } else {
      placeName = geo;
    }
  }

  if (!placeName && !coords) {
    return {
      location: input.fallback,
      locationCoords: null,
      details: "Waiting for driver GPS at acceptance.",
    };
  }

  const location = placeName
    ? `Current location · ${placeName}`
    : "Current location";

  const details = placeName
    ? coords
      ? `Driver accepted from ${placeName} (${coords}).`
      : `Driver accepted near ${placeName}.`
    : coords
      ? `Driver accepted at GPS ${coords}.`
      : "Driver confirmed acceptance on device.";

  return {
    location,
    locationCoords: coords,
    details,
  };
}

function simShownPlace(
  sim: ManifestSimLogEntry | null,
  tripPlace: string | null | undefined,
): string | null {
  const stored = sim?.locationLabel?.trim();
  if (stored) return stored;
  const place = tripPlace?.trim();
  if (sim && place) return place;
  return null;
}

function simCoords(sim: ManifestSimLogEntry | null): string | null {
  if (!sim || sim.lat == null || sim.lng == null) return null;
  return formatCoordinateLabel(sim.lat, sim.lng);
}

function resolveStepLocation(
  candidates: Array<string | null | undefined>,
  fallback: string,
): string {
  for (const c of candidates) {
    const t = (c ?? "").trim();
    if (t) return t;
  }
  return fallback;
}

/**
 * Real evidence that the driver acted on the assignment, rather than the
 * dispatcher merely setting `assigned`. Returns the acceptance instant, or
 * null when no driver-side signal exists yet.
 *
 * Evidence, strongest first:
 *  1. an explicit driver-acceptance audit row — forward-compatible only;
 *     `AssignmentEventType` has no acceptance member yet, so this never
 *     matches until the driver accept path starts writing one
 *  2. the trip having moved past `assigned` under its own steam
 *     (started_at set, or a post-assignment stage reached)
 *  3. a driver GPS ping — the app can only ping once the driver is on the trip
 *
 * Deliberately NOT evidence: `status = assigned`, which is a dispatcher
 * action, and `updated_at`, which any server-side edit bumps.
 */
export function resolveDriverAcceptanceAt(input: {
  trip: Pick<TripRow, "status" | "started_at" | "completed_at" | "updated_at">;
  assignmentAuditRows?: TripAssignmentAuditRow[];
  locationPings?: ManifestLocationPing[];
}): string | null {
  const tr = input.trip;
  const statusLc = String(tr.status ?? "").toLowerCase();
  if (statusLc === "pending_acceptance" || statusLc === "draft") return null;

  const acceptAudit = [...(input.assignmentAuditRows ?? [])]
    .filter((r) => {
      const ev = String(r.event_type ?? "").toLowerCase();
      return ev === "driver_accepted" || ev === "accepted";
    })
    .sort(
      (a, b) =>
        new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
    )[0];
  if (acceptAudit?.changed_at) return acceptAudit.changed_at;

  const movedPastAssigned = [
    "in_progress",
    "picked_up",
    "pickup",
    "loading",
    "unloading",
    "in_transit",
    "at_drop",
    "completed",
    "delivered",
    "done",
  ].includes(statusLc);
  if (movedPastAssigned || tr.started_at || tr.completed_at) {
    return tr.started_at ?? tr.updated_at ?? tr.completed_at ?? null;
  }

  const pings = input.locationPings ?? [];
  if (pings.length > 0) {
    const earliest = [...pings].sort(
      (a, b) =>
        new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    )[0];
    if (earliest?.recorded_at) return earliest.recorded_at;
  }

  return null;
}

/** Last fully completed manifest step (0–4). Matches driver control / Manifest Pulse. */
export function getManifestCurrentStepIndex(
  trip: Pick<TripRow, "status" | "completed_at" | "started_at" | "updated_at">,
  evidence?: {
    assignmentAuditRows?: TripAssignmentAuditRow[];
    locationPings?: ManifestLocationPing[];
  },
): number {
  const s = String(trip.status ?? "").toLowerCase();
  if (
    ["completed", "delivered", "done"].includes(s) ||
    !!trip.completed_at
  ) {
    return MANIFEST_LAST_INDEX;
  }
  if (s === "at_drop") return 4;
  if (s === "in_transit" || s === "dispatched" || s === "transit") return 3;
  if (["in_progress", "picked_up", "pickup"].includes(s)) return 2;
  if (s === "assigned") {
    // `assigned` alone is a dispatcher action; only advance to the acceptance
    // step once the driver has actually acted.
    return resolveDriverAcceptanceAt({
      trip,
      assignmentAuditRows: evidence?.assignmentAuditRows,
      locationPings: evidence?.locationPings,
    })
      ? 1
      : 0;
  }
  if (s === "pending_acceptance" || s === "draft") return 0;
  return 0;
}

/** Completed + current manifest steps only (no future stages). */
export function getVisibleManifestJourneyLogs(
  logs: ManifestJourneyLogEntry[],
  currentStepIndex: number,
): ManifestJourneyLogEntry[] {
  if (logs.length === 0) return [];
  const end = Math.min(
    Math.max(0, currentStepIndex) + 1,
    logs.length,
  );
  const sliced = logs.slice(0, end);
  return sliced.filter((log, index) => {
    if (log.stepKey !== "drop_off") return true;
    if (log.atIso) return true;
    return index === sliced.length - 1;
  });
}

function partyLabel(
  id: string | null | undefined,
  names: Record<string, string> | undefined,
  fallback?: string | null,
): string | null {
  const key = (id ?? "").trim();
  if (!key) return fallback?.trim() || null;
  return names?.[key]?.trim() || fallback?.trim() || null;
}

function actorLabel(input: {
  userId?: string | null;
  actorNameById?: Record<string, string>;
  currentUserId?: string | null;
  staffDisplayName?: string | null;
  fallback: string;
}): string {
  const id = (input.userId ?? "").trim();
  if (id && input.currentUserId && id === input.currentUserId) {
    return input.staffDisplayName?.trim() || "You";
  }
  if (id) {
    const named = input.actorNameById?.[id]?.trim();
    if (named) return named;
  }
  return input.fallback;
}

function assignmentHistoryLine(
  row: TripAssignmentAuditRow,
  names: {
    driverNames?: Record<string, string>;
    vehicleLabels?: Record<string, string>;
    actorNameById?: Record<string, string>;
    currentUserId?: string | null;
    staffDisplayName?: string | null;
    driverDisplayName?: string | null;
  },
): ManifestJourneyHistoryLine {
  const ev = String(row.event_type ?? "").toLowerCase();
  const driverPrev =
    partyLabel(row.driver_id_prev, names.driverNames, row.driver_name_prev);
  const driverNew = partyLabel(
    row.driver_id_new,
    names.driverNames,
    row.driver_name_new ?? names.driverDisplayName,
  );
  const vehiclePrev = partyLabel(
    row.vehicle_id_prev,
    names.vehicleLabels,
    row.vehicle_number_prev,
  );
  const vehicleNew = partyLabel(
    row.vehicle_id_new,
    names.vehicleLabels,
    row.vehicle_number_new,
  );
  const verb =
    ev === "driver_accepted" || ev === "accepted"
      ? "Driver accepted"
      : ev === "reassignment"
        ? "Reassigned"
        : ev === "completed"
          ? "Assignment completed"
          : "Assigned";
  const bits = [verb];
  if (driverPrev && driverNew && driverPrev !== driverNew) {
    bits.push(`driver ${driverPrev} → ${driverNew}`);
  } else if (driverNew) {
    bits.push(`driver ${driverNew}`);
  } else if (driverPrev) {
    bits.push(`driver ${driverPrev} removed`);
  }
  if (vehiclePrev && vehicleNew && vehiclePrev !== vehicleNew) {
    bits.push(`vehicle ${vehiclePrev} → ${vehicleNew}`);
  } else if (vehicleNew) {
    bits.push(`vehicle ${vehicleNew}`);
  } else if (vehiclePrev) {
    bits.push(`vehicle ${vehiclePrev} removed`);
  }
  const actorFallback =
    ev === "driver_accepted" || ev === "accepted"
      ? driverNew || names.driverDisplayName?.trim() || "Driver"
      : names.staffDisplayName?.trim() || "Staff";
  return {
    atIso: row.changed_at,
    time: formatTrackingDateTime(row.changed_at),
    actor: actorLabel({
      userId: row.changed_by,
      actorNameById: names.actorNameById,
      currentUserId: names.currentUserId,
      staffDisplayName: names.staffDisplayName,
      fallback: actorFallback,
    }),
    action: bits.join(" · "),
  };
}

function sortHistory(
  lines: ManifestJourneyHistoryLine[],
): ManifestJourneyHistoryLine[] {
  return [...lines].sort(
    (a, b) => new Date(a.atIso).getTime() - new Date(b.atIso).getTime(),
  );
}

export function buildManifestJourneyLogs(input: {
  trip: TripRow;
  assignmentAuditRows: TripAssignmentAuditRow[];
  driverLocationAddress?: string | null;
  driverLocation?: {
    latitude: number;
    longitude: number;
    recorded_at?: string | null;
  } | null;
  locationPings?: ManifestLocationPing[];
  simLogs?: ManifestSimLogEntry[];
  simLocationByKey?: Record<string, string>;
  locationLoadingLabel?: string;
  driverNames?: Record<string, string>;
  vehicleLabels?: Record<string, string>;
  actorNameById?: Record<string, string>;
  currentUserId?: string | null;
  staffDisplayName?: string | null;
  driverDisplayName?: string | null;
}): ManifestJourneyLogEntry[] {
  const tr = input.trip;
  const simLogs = input.simLogs ?? [];
  const simLocationByKey = input.simLocationByKey ?? {};
  const pings = input.locationPings ?? [];
  const loadingLabel = input.locationLoadingLabel ?? "Resolving driver location…";
  const audits = input.assignmentAuditRows;
  const statusLc = (tr.status ?? "").toLowerCase();

  const assignedAtIso: string | null = (() => {
    if (audits.length > 0) {
      const sorted = [...audits].sort(
        (a, b) =>
          new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
      );
      const did = tr.driver_id;
      if (did) {
        const forCurrentDriver = [...sorted]
          .reverse()
          .find((r) => r.driver_id_new === did);
        if (forCurrentDriver?.changed_at) return forCurrentDriver.changed_at;
      }
      return sorted[0]?.changed_at ?? null;
    }
    if (tr.driver_id) return tr.updated_at ?? tr.created_at ?? null;
    return null;
  })();

  const driverAcceptedAtIso: string | null = resolveDriverAcceptanceAt({
    trip: tr,
    assignmentAuditRows: audits,
    locationPings: pings,
  });

  const latestDriverLabel =
    input.driverLocationAddress?.trim() ||
    (input.driverLocation
      ? locationFromPing(
          [
            {
              recorded_at:
                input.driverLocation.recorded_at ?? new Date().toISOString(),
              latitude: input.driverLocation.latitude,
              longitude: input.driverLocation.longitude,
              locationName: null,
            },
          ],
          input.driverLocation.recorded_at ?? null,
          24 * 60 * 60 * 1000,
        )
      : null);

  const acceptPing = pickPingForDriverAcceptance(pings, driverAcceptedAtIso);
  const acceptGeocodeLabel =
    input.driverLocation &&
    isNearIso(
      input.driverLocation.recorded_at,
      driverAcceptedAtIso,
      30 * 60 * 1000,
    )
      ? input.driverLocationAddress?.trim() || null
      : null;

  const assignedSim = pickLatestSim(simLogs, ["pending_acceptance", "assigned"]);
  const pickupSim = pickLatestSim(simLogs, ["in_progress", "picked_up", "pickup"]);
  const transitSim = pickLatestSim(simLogs, ["in_transit"]);
  const dropSim = pickLatestSim(simLogs, ["at_drop"]);
  const deliveredSim = pickLatestSim(simLogs, ["completed", "delivered", "done"]);
  const pickupPlace = (tr.pickup_area ?? "").trim() || null;
  const dropPlace = (tr.drop_location ?? tr.drop_area ?? "").trim() || null;

  const steps: ManifestJourneyLogEntry[] = [
    {
      stepKey: "assigned",
      status: "Assigned",
      atIso: assignedAtIso,
      time: assignedAtIso ? formatTrackingDateTime(assignedAtIso) : "—",
      location: resolveStepLocation(
        [
          locationFromSim(assignedSim, simLocationByKey),
          locationFromPing(pings, assignedAtIso),
          tr.pickup_area,
        ],
        "Origin hub",
      ),
      details: "Trip assigned and prepared for dispatch.",
    },
    (() => {
      // No acceptance instant means no driver-side signal yet — never present
      // this step as if the driver had accepted.
      const pending = !driverAcceptedAtIso;
      const acceptLoc = pending
        ? {
            location:
              statusLc === "draft"
                ? "Assignment is still being prepared"
                : "Awaiting driver on device",
            locationCoords: null as string | null,
            details:
              statusLc === "draft"
                ? "Assignment is still being prepared."
                : "Driver has been notified; acceptance pending on device.",
          }
        : formatDriverAcceptanceLocation({
            ping: acceptPing,
            sim: assignedSim,
            simLocationByKey,
            geocodeLabel: acceptGeocodeLabel ?? latestDriverLabel,
            fallback: "Driver location pending",
          });
      return {
        stepKey: "driver_accepted" as const,
        status: pending ? "Awaiting Driver Acceptance" : "Driver Accepted",
        atIso: assignedSim?.timestamp ?? driverAcceptedAtIso,
        time:
          assignedSim?.timestamp ?? driverAcceptedAtIso
            ? formatTrackingDateTime(
                assignedSim?.timestamp ?? driverAcceptedAtIso!,
              )
            : "—",
        location:
          simShownPlace(assignedSim, pickupPlace) ?? acceptLoc.location,
        locationCoords: simCoords(assignedSim) ?? acceptLoc.locationCoords,
        details: acceptLoc.details,
      };
    })(),
    {
      stepKey: "pickup",
      status: "Pickup",
      atIso: pickupSim?.timestamp ?? tr.started_at ?? null,
      time:
        pickupSim?.timestamp ?? tr.started_at
          ? formatTrackingDateTime(pickupSim?.timestamp ?? tr.started_at!)
          : "—",
      location: resolveStepLocation(
        [
          simShownPlace(pickupSim, pickupPlace),
          pickupSim ? null : locationFromSim(pickupSim, simLocationByKey),
          pickupSim
            ? null
            : locationFromPing(pings, tr.started_at ?? null),
          pickupSim ? null : latestDriverLabel,
          tr.pickup_area,
        ],
        "Pickup point",
      ),
      locationCoords: simCoords(pickupSim),
      details: "Driver arrived at pickup.",
    },
    {
      stepKey: "in_transit",
      status: "In-Transit",
      atIso:
        transitSim?.timestamp ??
        input.driverLocation?.recorded_at ??
        tr.started_at ??
        tr.updated_at ??
        null,
      time: (() => {
        const iso =
          transitSim?.timestamp ??
          input.driverLocation?.recorded_at ??
          tr.started_at;
        return iso ? formatTrackingDateTime(iso) : "—";
      })(),
      location: resolveStepLocation(
        [
          simShownPlace(transitSim, pickupPlace),
          transitSim ? null : locationFromSim(transitSim, simLocationByKey),
          transitSim
            ? null
            : locationFromPing(pings, input.driverLocation?.recorded_at ?? tr.started_at ?? null),
          transitSim ? null : latestDriverLabel,
          transitSim
            ? null
            : input.driverLocation && !input.driverLocationAddress?.trim()
              ? loadingLabel
              : null,
          pickupPlace,
        ],
        "Route in progress",
      ),
      locationCoords: simCoords(transitSim),
      details: transitSim
        ? "Package collected and the trip is in transit."
        : latestDriverLabel
          ? `Last known position: ${latestDriverLabel}.`
          : pings.length > 0
            ? `${pings.length} GPS ping${pings.length === 1 ? "" : "s"} on this trip.`
            : "Vehicle moving towards destination.",
    },
    {
      stepKey: "drop_off",
      status: "Arrived at drop-off",
      atIso: dropSim?.timestamp ?? (statusLc === "at_drop" ? tr.updated_at ?? null : null),
      time: (() => {
        const iso =
          dropSim?.timestamp ?? (statusLc === "at_drop" ? tr.updated_at ?? null : null);
        return iso ? formatTrackingDateTime(iso) : "—";
      })(),
      location: resolveStepLocation(
        [simShownPlace(dropSim, dropPlace), dropPlace],
        "Drop-off",
      ),
      locationCoords: simCoords(dropSim),
      details: "Driver arrived at the drop-off.",
    },
    {
      stepKey: "delivered",
      status: "Delivered",
      atIso: deliveredSim?.timestamp ?? tr.completed_at ?? null,
      time:
        deliveredSim?.timestamp ?? tr.completed_at
          ? formatTrackingDateTime(deliveredSim?.timestamp ?? tr.completed_at!)
          : "—",
      location: resolveStepLocation(
        [
          simShownPlace(deliveredSim, dropPlace),
          deliveredSim ? null : locationFromPing(pings, tr.completed_at ?? null),
          tr.drop_location,
        ],
        "Destination",
      ),
      locationCoords: simCoords(deliveredSim),
      details: "Delivery completed and settlement flow closed.",
    },
  ];

  const nameCtx = {
    driverNames: input.driverNames,
    vehicleLabels: input.vehicleLabels,
    actorNameById: input.actorNameById,
    currentUserId: input.currentUserId,
    staffDisplayName: input.staffDisplayName,
    driverDisplayName: input.driverDisplayName,
  };
  const staff = input.staffDisplayName?.trim() || "Staff";
  const driver = input.driverDisplayName?.trim() || "Driver";
  const auditHistory = [...audits]
    .sort(
      (a, b) =>
        new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
    )
    .map((row) => assignmentHistoryLine(row, nameCtx));

  const simHistory = (statuses: string[]): ManifestJourneyHistoryLine[] =>
    simLogs
      .filter((e) => statuses.includes(e.status) && e.timestamp)
      .map((e) => ({
        atIso: e.timestamp,
        time: formatTrackingDateTime(e.timestamp),
        actor: e.userName?.trim() || staff,
        action: e.locationLabel?.trim()
          ? `Simulated ${e.status.replace(/_/g, " ")} · ${e.locationLabel.trim()}`
          : `Simulated ${e.status.replace(/_/g, " ")}`,
      }));

  const fallbackAssigned: ManifestJourneyHistoryLine[] =
    auditHistory.length > 0
      ? []
      : assignedAtIso
        ? [
            {
              atIso: assignedAtIso,
              time: formatTrackingDateTime(assignedAtIso),
              actor: actorLabel({
                userId: tr.assigned_by_user_id,
                actorNameById: input.actorNameById,
                currentUserId: input.currentUserId,
                staffDisplayName: input.staffDisplayName,
                fallback: staff,
              }),
              action: driver
                ? `Assigned · driver ${driver}`
                : "Assigned",
            },
          ]
        : [];

  const acceptHistoryExtra: ManifestJourneyHistoryLine[] = [];
  if (driverAcceptedAtIso && acceptPing?.recorded_at) {
    acceptHistoryExtra.push({
      atIso: acceptPing.recorded_at,
      time: formatTrackingDateTime(acceptPing.recorded_at),
      actor: driver,
      action: acceptPing.locationName?.trim()
        ? `GPS at acceptance · ${acceptPing.locationName.trim()}`
        : `GPS at acceptance · ${formatCoordinateLabel(acceptPing.latitude, acceptPing.longitude)}`,
    });
  } else if (driverAcceptedAtIso && !acceptPing) {
    acceptHistoryExtra.push({
      atIso: driverAcceptedAtIso,
      time: formatTrackingDateTime(driverAcceptedAtIso),
      actor: driver,
      action: "Accepted · driver GPS not recorded yet",
    });
  }

  const historyByStep: Record<ManifestJourneyStepKey, ManifestJourneyHistoryLine[]> = {
    assigned: sortHistory([
      ...auditHistory.filter((l) => !l.action.startsWith("Driver accepted")),
      ...fallbackAssigned,
      ...simHistory(["pending_acceptance", "assigned"]),
    ]),
    driver_accepted: sortHistory([
      ...auditHistory,
      ...fallbackAssigned,
      ...acceptHistoryExtra,
      ...simHistory(["assigned"]),
    ]),
    pickup: sortHistory([
      ...(tr.started_at
        ? [
            {
              atIso: tr.started_at,
              time: formatTrackingDateTime(tr.started_at),
              actor: driver,
              action: "Pickup started",
            },
          ]
        : []),
      ...simHistory(["in_progress", "picked_up", "pickup"]),
    ]),
    loading: [],
    in_transit: sortHistory([
      ...simHistory(["in_transit"]),
      ...(input.driverLocation?.recorded_at
        ? [
            {
              atIso: input.driverLocation.recorded_at,
              time: formatTrackingDateTime(input.driverLocation.recorded_at),
              actor: driver,
              action: latestDriverLabel
                ? `Last GPS · ${latestDriverLabel}`
                : "Last GPS update",
            },
          ]
        : []),
    ]),
    drop_off: sortHistory(simHistory(["at_drop"])),
    unloading: [],
    delivered: sortHistory([
      ...(tr.completed_at
        ? [
            {
              atIso: tr.completed_at,
              time: formatTrackingDateTime(tr.completed_at),
              actor: staff,
              action: "Marked delivered",
            },
          ]
        : []),
      ...simHistory(["completed", "delivered", "done"]),
    ]),
  };

  return steps.map((step) => ({
    ...step,
    history: historyByStep[step.stepKey] ?? [],
  }));
}

export function manifestStepIndexForLog(
  stepKey: ManifestJourneyStepKey,
): number {
  const map: Record<ManifestJourneyStepKey, number> = {
    assigned: 0,
    driver_accepted: 1,
    pickup: 2,
    loading: 2,
    in_transit: 3,
    drop_off: 4,
    unloading: 4,
    delivered: 5,
  };
  return map[stepKey];
}

export function manifestSimLogsForStepIndex(
  stepIndex: number,
  simLogs: ManifestSimLogEntry[],
): ManifestSimLogEntry[] {
  const stepStatusMap: Record<number, string[]> = {
    0: ["pending_acceptance", "assigned"],
    1: ["assigned"],
    2: ["in_progress", "picked_up", "pickup"],
    3: ["in_transit"],
    4: ["at_drop"],
    5: ["completed", "delivered", "done"],
  };
  const statuses = stepStatusMap[stepIndex] ?? [];
  return simLogs.filter((e) => statuses.includes(e.status));
}
