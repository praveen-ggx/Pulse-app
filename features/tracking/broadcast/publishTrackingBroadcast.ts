import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { trackingFleetChannelName, trackingTripChannelName } from '@/features/tracking/broadcast/trackingBroadcastChannels';
import { TRACKING_BROADCAST_EVENT } from '@/features/tracking/constants';
import type {
  FleetPositionPayload,
  TrackingBroadcastEventName,
  TrackingBroadcastPayload,
} from '@/features/tracking/types/broadcast.types';

type CachedChannel = { channel: RealtimeChannel; lastUsedAt: number };

const tripChannels = new Map<string, CachedChannel>();
const fleetChannels = new Map<string, CachedChannel>();

// Idle eviction: publish channels are reused across many GPS pings, but were
// never closed once a trip/session went quiet (leak — they lived for the whole
// app session). Close any channel untouched for IDLE_MS. Reuse/send behavior for
// active channels is unchanged; a later ping just re-creates the channel.
const IDLE_MS = 5 * 60_000;

function evictIdle(map: Map<string, CachedChannel>, now: number): void {
  for (const [key, entry] of map) {
    if (now - entry.lastUsedAt > IDLE_MS) {
      void supabase().removeChannel(entry.channel);
      map.delete(key);
    }
  }
}

function getOrCreateTripChannel(tripId: string): RealtimeChannel {
  const now = Date.now();
  evictIdle(tripChannels, now);
  const existing = tripChannels.get(tripId);
  if (existing) {
    existing.lastUsedAt = now;
    return existing.channel;
  }
  const channel = supabase().channel(trackingTripChannelName(tripId), {
    config: { broadcast: { self: false, ack: false } },
  });
  void channel.subscribe();
  tripChannels.set(tripId, { channel, lastUsedAt: now });
  return channel;
}

function getOrCreateFleetChannel(orgId: string): RealtimeChannel {
  const now = Date.now();
  evictIdle(fleetChannels, now);
  const existing = fleetChannels.get(orgId);
  if (existing) {
    existing.lastUsedAt = now;
    return existing.channel;
  }
  const channel = supabase().channel(trackingFleetChannelName(orgId), {
    config: { broadcast: { self: false, ack: false } },
  });
  void channel.subscribe();
  fleetChannels.set(orgId, { channel, lastUsedAt: now });
  return channel;
}

export async function publishTrackingBroadcast(
  tripId: string,
  orgId: string,
  event: TrackingBroadcastEventName,
  payload: TrackingBroadcastPayload,
): Promise<void> {
  const tripCh = getOrCreateTripChannel(tripId);
  await tripCh.send({ type: 'broadcast', event, payload });

  if ('driverId' in payload && payload.v === 1) {
    const fleetPayload = toFleetPayload(payload, orgId);
    if (fleetPayload) {
      const fleetCh = getOrCreateFleetChannel(orgId);
      await fleetCh.send({ type: 'broadcast', event, payload: fleetPayload });
    }
  }
}

function toFleetPayload(
  payload: TrackingBroadcastPayload,
  orgId: string,
): FleetPositionPayload | null {
  if (!('latitude' in payload) || !('driverId' in payload)) return null;
  if ('checkpointId' in payload) return null;
  return {
    v: 1,
    orgId,
    driverId: payload.driverId,
    tripId: 'tripId' in payload ? payload.tripId : null,
    sessionId: 'sessionId' in payload ? payload.sessionId : null,
    latitude: payload.latitude,
    longitude: payload.longitude,
    accuracy: 'accuracy' in payload ? payload.accuracy : null,
    recordedAt: payload.recordedAt,
  };
}

/**
 * Dispatcher → Driver: request an immediate GPS fix.
 * Driver app listens for 'ping_request' and responds with a 'position' event.
 */
export async function publishPingRequest(tripId: string): Promise<void> {
  const ch = getOrCreateTripChannel(tripId);
  await ch.send({
    type: 'broadcast',
    event: TRACKING_BROADCAST_EVENT.PING_REQUEST,
    payload: { v: 1, tripId, requestedAt: new Date().toISOString() },
  });
}

/** Driver → shipper: ping outcome when a position cannot be sent (e.g. GPS off). */
export async function publishPingStatus(
  tripId: string,
  status: 'gps_denied' | 'sharing',
): Promise<void> {
  const ch = getOrCreateTripChannel(tripId);
  await ch.send({
    type: 'broadcast',
    event: TRACKING_BROADCAST_EVENT.PING_STATUS,
    payload: {
      v: 1,
      tripId,
      status,
      recordedAt: new Date().toISOString(),
    },
  });
}

export function teardownTrackingPublishChannels(tripId?: string, orgId?: string): void {
  if (tripId) {
    const entry = tripChannels.get(tripId);
    if (entry) void supabase().removeChannel(entry.channel);
    tripChannels.delete(tripId);
  }
  if (orgId) {
    const entry = fleetChannels.get(orgId);
    if (entry) void supabase().removeChannel(entry.channel);
    fleetChannels.delete(orgId);
  }
}
