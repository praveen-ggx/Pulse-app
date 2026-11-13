/**
 * Completed trip map: load the driven path ONCE (no realtime, no polling).
 * Live trips never use this — they keep the live tracking lanes.
 */
import { useQuery } from '@tanstack/react-query';
import { getTripLocationHistory } from '@/features/driver/services/driverLocation.service';
import { getRecentTripCheckpoints } from '@/features/tracking/services/tripCheckpoints.service';
import { buildCompletedTripPath } from '@/features/trips/utils/completedTripPath.util';
import type { MapTrailPoint } from '@/features/trips/utils/mapDriverTracking.util';
import { queryKeys } from '@/lib/queryKeys';

/** Generous one-time caps: a long trip at 1 checkpoint / 2 min stays well under this. */
const COMPLETED_PATH_HISTORY_LIMIT = 500;
const COMPLETED_PATH_CHECKPOINT_LIMIT = 500;
/** Keep fixes a little past completion (last ping can land just after "delivered"). */
const COMPLETED_PATH_END_GRACE_MS = 10 * 60_000;

const EMPTY: MapTrailPoint[] = [];

/**
 * Only points recorded during this trip. The history RPC falls back to the
 * driver's whole history when the trip has no pings — never draw those.
 */
export function withinTripWindow(
  points: MapTrailPoint[],
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
): MapTrailPoint[] {
  const startMs = startedAt ? new Date(startedAt).getTime() : NaN;
  const endMs = completedAt ? new Date(completedAt).getTime() : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return EMPTY;
  return points.filter((p) => {
    const t = new Date(p.recorded_at).getTime();
    return Number.isFinite(t) && t >= startMs && t <= endMs + COMPLETED_PATH_END_GRACE_MS;
  });
}

export async function fetchCompletedTripPath(
  tripId: string,
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
): Promise<MapTrailPoint[]> {
  const [history, checkpoints] = await Promise.all([
    getTripLocationHistory(tripId, COMPLETED_PATH_HISTORY_LIMIT),
    getRecentTripCheckpoints(tripId, COMPLETED_PATH_CHECKPOINT_LIMIT),
  ]);
  const gps = withinTripWindow(history.error ? EMPTY : history.points, startedAt, completedAt);
  const cps = withinTripWindow(
    checkpoints.error ? EMPTY : checkpoints.checkpoints,
    startedAt,
    completedAt,
  );
  return buildCompletedTripPath(gps, cps);
}

export function useCompletedTripPath({
  tripId,
  startedAt,
  completedAt,
  enabled,
}: {
  tripId: string | null | undefined;
  startedAt: string | null | undefined;
  completedAt: string | null | undefined;
  enabled: boolean;
}): MapTrailPoint[] {
  const id = tripId ?? '';
  const query = useQuery({
    queryKey: queryKeys.tracking.completedTripPath(id),
    queryFn: () => fetchCompletedTripPath(id, startedAt, completedAt),
    enabled: enabled && !!id && !!completedAt,
    // A completed trip's path does not change — read once per screen visit.
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  return query.data ?? EMPTY;
}
