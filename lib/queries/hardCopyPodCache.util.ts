/**
 * Patch cached trip rows so every list/detail that already holds this trip
 * shows the same hard-copy POD columns. Only the matching trip id is touched.
 */
export type HardCopyPodColumnPatch = {
  pod_received_at?: string | null;
  pod_hard_copy_courier?: string | null;
  pod_hard_copy_awb_number?: string | null;
  pod_hard_copy_received_by?: string | null;
};

function isTripLike(value: Record<string, unknown>, tripId: string): boolean {
  if (value.id !== tripId) return false;
  return (
    "pod_received_at" in value ||
    "pickup_area" in value ||
    "trip_number" in value ||
    "display_trip_id" in value
  );
}

export type HardCopyPodColumnSource = {
  status: "PENDING" | "IN_TRANSIT" | "RECEIVED";
  receivedAt: string | null;
  courier: string | null;
  awbNumber: string | null;
  receivedBy: string | null;
};

/** Copy the shared POD record onto a trip row. Same id, no other fields change. */
export function applyHardCopyPodColumnsToTrip<T extends object>(
  tripIn: T,
  state: HardCopyPodColumnSource | null | undefined,
): T {
  const trip = tripIn as T & Record<string, unknown>;
  if (!state) return tripIn;
  const patch: HardCopyPodColumnPatch = {
    pod_hard_copy_courier: state.courier,
    pod_hard_copy_awb_number: state.awbNumber,
    pod_hard_copy_received_by: state.receivedBy,
  };
  if (state.status === "RECEIVED") {
    patch.pod_received_at =
      state.receivedAt ??
      (typeof trip.pod_received_at === "string" ? trip.pod_received_at : null) ??
      new Date().toISOString();
  } else if (state.status === "PENDING" || state.status === "IN_TRANSIT") {
    patch.pod_received_at = null;
  }
  const unchanged =
    trip.pod_received_at === patch.pod_received_at &&
    trip.pod_hard_copy_courier === patch.pod_hard_copy_courier &&
    trip.pod_hard_copy_awb_number === patch.pod_hard_copy_awb_number &&
    trip.pod_hard_copy_received_by === patch.pod_hard_copy_received_by;
  return unchanged ? tripIn : ({ ...trip, ...patch } as T);
}

function definedPatch(patch: HardCopyPodColumnPatch): HardCopyPodColumnPatch {
  const next: HardCopyPodColumnPatch = {};
  if ("pod_received_at" in patch) next.pod_received_at = patch.pod_received_at;
  if ("pod_hard_copy_courier" in patch) {
    next.pod_hard_copy_courier = patch.pod_hard_copy_courier;
  }
  if ("pod_hard_copy_awb_number" in patch) {
    next.pod_hard_copy_awb_number = patch.pod_hard_copy_awb_number;
  }
  if ("pod_hard_copy_received_by" in patch) {
    next.pod_hard_copy_received_by = patch.pod_hard_copy_received_by;
  }
  return next;
}

/**
 * Walk list, infinite-page, and bundle caches. Returns the same reference
 * when this trip is not present so unchanged queries do not rerender.
 */
export function patchCachedTripPod(
  data: unknown,
  tripId: string,
  patch: HardCopyPodColumnPatch,
): unknown {
  const id = tripId.trim();
  if (!id) return data;
  return patchNode(data, id, definedPatch(patch));
}

function patchNode(
  data: unknown,
  tripId: string,
  patch: HardCopyPodColumnPatch,
): unknown {
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((item) => {
      const patched = patchNode(item, tripId, patch);
      if (patched !== item) changed = true;
      return patched;
    });
    return changed ? next : data;
  }
  if (!data || typeof data !== "object") return data;

  const rec = data as Record<string, unknown>;
  if (isTripLike(rec, tripId)) {
    return { ...rec, ...patch };
  }

  let changed = false;
  const next: Record<string, unknown> = { ...rec };
  for (const key of ["trip", "trips", "pages"] as const) {
    if (!(key in rec)) continue;
    const patched = patchNode(rec[key], tripId, patch);
    if (patched !== rec[key]) {
      next[key] = patched;
      changed = true;
    }
  }
  return changed ? next : data;
}

export type HardCopyPodSummaryPatch = {
  received: boolean;
  receivedAt: string | null;
  courier: string | null;
  awbNumber: string | null;
  receivedBy: string | null;
  ibond?: boolean;
};

/**
 * Compliance cards store POD on `hardCopyPod`, not only on the nested trip.
 * Update that summary for the one trip id.
 */
export function patchCachedCompliancePod(
  data: unknown,
  tripId: string,
  summary: HardCopyPodSummaryPatch,
): unknown {
  const id = tripId.trim();
  if (!id) return data;
  return patchComplianceNode(data, id, summary);
}

function patchComplianceNode(
  data: unknown,
  tripId: string,
  summary: HardCopyPodSummaryPatch,
): unknown {
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((item) => {
      const patched = patchComplianceNode(item, tripId, summary);
      if (patched !== item) changed = true;
      return patched;
    });
    return changed ? next : data;
  }
  if (!data || typeof data !== "object") return data;
  const rec = data as Record<string, unknown>;
  const trip = rec.trip;
  const tripIdOnRow =
    trip && typeof trip === "object"
      ? String((trip as { id?: unknown }).id ?? "")
      : "";
  const podSource: HardCopyPodColumnSource = {
    status: summary.received ? "RECEIVED" : summary.courier || summary.awbNumber ? "IN_TRANSIT" : "PENDING",
    receivedAt: summary.receivedAt,
    courier: summary.courier,
    awbNumber: summary.awbNumber,
    receivedBy: summary.receivedBy,
  };
  if (rec.hardCopyPod && tripIdOnRow === tripId) {
    const nextTrip = applyHardCopyPodColumnsToTrip(trip as Record<string, unknown>, podSource);
    const previousPod = rec.hardCopyPod as Record<string, unknown>;
    return {
      ...rec,
      trip: nextTrip,
      hardCopyPod: { ...previousPod, ...summary },
    };
  }
  // Compliance pipeline input row (`{ trip, flags, … }`): POD "received" and the
  // stage derive from `flags.pod_received_at`, so patch flags alongside the trip.
  // Recognised by shape only — `lib` must not import feature types.
  if (tripIdOnRow === tripId && !("hardCopyPod" in rec) && "flags" in rec) {
    const flags = rec.flags;
    if (flags !== null && typeof flags !== "object") return data;
    const nextTrip = applyHardCopyPodColumnsToTrip(trip as Record<string, unknown>, podSource);
    const current = (flags ?? {}) as Record<string, unknown>;
    const nextFlags = {
      ...current,
      pod_received_at: (nextTrip.pod_received_at as string | null | undefined) ?? null,
      pod_hard_copy_courier: summary.courier,
      pod_hard_copy_awb_number: summary.awbNumber,
      pod_hard_copy_received_by: summary.receivedBy,
      ...(summary.ibond ? { pod_ibond: true } : {}),
    };
    const flagsUnchanged =
      flags !== null &&
      current.pod_received_at === nextFlags.pod_received_at &&
      current.pod_hard_copy_courier === nextFlags.pod_hard_copy_courier &&
      current.pod_hard_copy_awb_number === nextFlags.pod_hard_copy_awb_number &&
      current.pod_hard_copy_received_by === nextFlags.pod_hard_copy_received_by &&
      current.pod_ibond === nextFlags.pod_ibond;
    if (flagsUnchanged && nextTrip === trip) return data;
    return { ...rec, trip: nextTrip, flags: flagsUnchanged ? flags : nextFlags };
  }
  let changed = false;
  const next: Record<string, unknown> = { ...rec };
  for (const key of ["summaries", "pages", "data"] as const) {
    if (!(key in rec)) continue;
    const patched = patchComplianceNode(rec[key], tripId, summary);
    if (patched !== rec[key]) {
      next[key] = patched;
      changed = true;
    }
  }
  return changed ? next : data;
}
