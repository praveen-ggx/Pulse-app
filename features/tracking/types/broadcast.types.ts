/**
 * Supabase Broadcast contracts — tracking namespace only.
 * Version field `v` allows backward-compatible evolution.
 */

export type TrackingBroadcastEventName =
  | 'position'
  | 'session_started'
  | 'session_ended'
  | 'checkpoint'
  | 'reseed'
  | 'ping_request'
  | 'ping_status';

export type TrackingPositionPayload = {
  v: 1;
  tripId: string;
  driverId: string;
  orgId: string;
  sessionId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
  heading?: number | null;
  speedKmh?: number | null;
};

export type TrackingSessionPayload = {
  v: 1;
  tripId: string;
  driverId: string;
  orgId: string;
  sessionId: string;
  recordedAt: string;
};

export type TrackingCheckpointPayload = {
  v: 1;
  tripId: string;
  driverId: string;
  orgId: string;
  checkpointId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
};

export type TrackingReseedPayload = {
  v: 1;
  tripId: string;
  reason: 'reconnect' | 'visibility' | 'subscribe';
};

export type TrackingPingRequestPayload = {
  v: 1;
  tripId: string;
  requestedAt: string;
};

export type TrackingPingStatusPayload = {
  v: 1;
  tripId: string;
  status: 'gps_denied' | 'sharing';
  recordedAt: string;
};

export type FleetPositionPayload = {
  v: 1;
  orgId: string;
  driverId: string;
  tripId: string | null;
  sessionId: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
  stale?: boolean;
};

export type TrackingBroadcastPayload =
  | TrackingPositionPayload
  | TrackingSessionPayload
  | TrackingCheckpointPayload
  | TrackingReseedPayload
  | TrackingPingRequestPayload
  | TrackingPingStatusPayload
  | FleetPositionPayload;

export function isTrackingPositionPayload(
  p: TrackingBroadcastPayload,
): p is TrackingPositionPayload {
  return 'latitude' in p && 'tripId' in p && 'sessionId' in p && !('checkpointId' in p);
}

export function isTrackingPingStatusPayload(
  p: unknown,
): p is TrackingPingStatusPayload {
  if (!p || typeof p !== 'object') return false;
  const row = p as Record<string, unknown>;
  return (
    row.v === 1 &&
    typeof row.tripId === 'string' &&
    (row.status === 'gps_denied' || row.status === 'sharing') &&
    typeof row.recordedAt === 'string'
  );
}
