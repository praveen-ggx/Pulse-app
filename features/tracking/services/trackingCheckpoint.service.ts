import { supabase } from '@/lib/supabase';

export type TrackingCheckpointResult = {
  error: Error | null;
  checkpointId: string | null;
  wroteCheckpoint: boolean;
};

/**
 * Sparse checkpoint + presence UPSERT (server movement gate).
 * Legacy driver_locations insert remains on client until dual-write removed.
 */
export async function recordTrackingCheckpoint(params: {
  tripId: string;
  driverId: string;
  organizationId: string;
  /** trip_tracking_sessions.id (uuid) or null — column is nullable FK. */
  sessionId: string | null;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speedKmh?: number | null;
  source?: string;
  recordedAt?: string;
}): Promise<TrackingCheckpointResult> {
  const { data, error } = await supabase().rpc('tracking_record_checkpoint', {
    p_trip_id: params.tripId,
    p_driver_id: params.driverId,
    p_org_id: params.organizationId,
    // SQL: p_session_id uuid (nullable FK); generated types mark it non-null.
    p_session_id: params.sessionId as string,
    p_latitude: params.latitude,
    p_longitude: params.longitude,
    p_accuracy: params.accuracy ?? undefined,
    p_heading: params.heading ?? undefined,
    p_speed_kmh: params.speedKmh ?? undefined,
    p_source: params.source ?? 'live',
    p_recorded_at: params.recordedAt ?? new Date().toISOString(),
  });

  if (error) {
    return { error: new Error(error.message), checkpointId: null, wroteCheckpoint: false };
  }

  const row = data as { checkpoint_id?: string; wrote?: boolean } | null;
  return {
    error: null,
    checkpointId: row?.checkpoint_id ?? null,
    wroteCheckpoint: Boolean(row?.wrote),
  };
}

/**
 * Batch sum of distance_delta_m per trip, for journey-progress metrics
 * (features/trips/domain/tripJourneyMetrics.ts). One RPC call for N trips —
 * the aggregation happens in Postgres (get_trip_checkpoint_distance_sums),
 * not by fetching raw checkpoint rows, which could number in the thousands
 * for a multi-day long-haul trip.
 */
const CHECKPOINT_DISTANCE_CHUNK = 24;

export async function getCheckpointDistanceSumsForTrips(
  tripIds: string[],
  signal?: AbortSignal,
): Promise<{ error: Error | null; distanceMByTripId: Map<string, number> }> {
  const uniqueIds = [...new Set(tripIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return { error: null, distanceMByTripId: new Map() };

  const distanceMByTripId = new Map<string, number>();
  for (let i = 0; i < uniqueIds.length; i += CHECKPOINT_DISTANCE_CHUNK) {
    if (signal?.aborted) {
      return { error: new Error('Aborted'), distanceMByTripId };
    }
    const chunk = uniqueIds.slice(i, i + CHECKPOINT_DISTANCE_CHUNK);
    const query = supabase().rpc('get_trip_checkpoint_distance_sums', {
      p_trip_ids: chunk,
    });
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    if (error) return { error: new Error(error.message), distanceMByTripId };
    for (const row of (data ?? []) as { trip_id: string; total_distance_m: number | null }[]) {
      if (row.total_distance_m != null) distanceMByTripId.set(row.trip_id, row.total_distance_m);
    }
  }
  return { error: null, distanceMByTripId };
}
