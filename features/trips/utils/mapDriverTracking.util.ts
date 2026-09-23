/** GPS ping for map trail / last-known driver pin. */
export type MapTrailPoint = {
  latitude: number;
  longitude: number;
  recorded_at: string;
};

/** Merge trip driver_locations history with checkpoint trail (deduped, chronological). */
export function mergeMapLocationTrail(
  tripPoints: MapTrailPoint[],
  checkpoints: MapTrailPoint[],
): MapTrailPoint[] {
  const byKey = new Map<string, MapTrailPoint>();
  for (const p of [...tripPoints, ...checkpoints]) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    const key = `${p.recorded_at}|${p.latitude}|${p.longitude}`;
    byKey.set(key, p);
  }
  return [...byKey.values()].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
}

export function resolveMapTruckLocation(params: {
  tripCompleted: boolean;
  currentPosition: { latitude: number; longitude: number } | null | undefined;
  driverLocation: { latitude: number; longitude: number } | null | undefined;
  trail: MapTrailPoint[];
  /** Last business-sim pin when the driver has never pinged. */
  simulatedLocation?: { latitude: number; longitude: number } | null;
}): { latitude: number; longitude: number } | undefined {
  if (params.tripCompleted) return undefined;
  if (params.currentPosition) return params.currentPosition;
  if (
    params.driverLocation?.latitude != null &&
    params.driverLocation?.longitude != null
  ) {
    return {
      latitude: params.driverLocation.latitude,
      longitude: params.driverLocation.longitude,
    };
  }
  const last = params.trail[params.trail.length - 1];
  if (last && Number.isFinite(last.latitude) && Number.isFinite(last.longitude)) {
    return { latitude: last.latitude, longitude: last.longitude };
  }
  if (
    params.simulatedLocation &&
    Number.isFinite(params.simulatedLocation.latitude) &&
    Number.isFinite(params.simulatedLocation.longitude)
  ) {
    return params.simulatedLocation;
  }
  return undefined;
}
