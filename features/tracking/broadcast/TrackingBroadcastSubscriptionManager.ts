import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { trackingTripChannelName } from '@/features/tracking/broadcast/trackingBroadcastChannels';
import { TRACKING_BROADCAST_EVENT } from '@/features/tracking/constants';
import type {
  TrackingBroadcastPayload,
  TrackingBroadcastEventName,
  TrackingPingStatusPayload,
  TrackingPositionPayload,
} from '@/features/tracking/types/broadcast.types';
import {
  isTrackingPingStatusPayload,
  isTrackingPositionPayload,
} from '@/features/tracking/types/broadcast.types';

export type TripBroadcastHandlers = {
  onPosition?: (payload: TrackingPositionPayload) => void;
  onPingStatus?: (payload: TrackingPingStatusPayload) => void;
  onReseed?: () => void;
  onSessionEnded?: () => void;
};

type Entry = {
  channel: RealtimeChannel;
  refs: number;
  handlers: Set<TripBroadcastHandlers>;
};

const tripSubscriptions = new Map<string, Entry>();

function dispatch(tripId: string, event: TrackingBroadcastEventName, payload: unknown) {
  const entry = tripSubscriptions.get(tripId);
  if (!entry) return;
  for (const h of entry.handlers) {
    try {
      if (
        event === TRACKING_BROADCAST_EVENT.POSITION &&
        payload != null &&
        typeof payload === "object" &&
        isTrackingPositionPayload(payload as TrackingBroadcastPayload)
      ) {
        h.onPosition?.(payload as TrackingPositionPayload);
      } else if (
        event === TRACKING_BROADCAST_EVENT.PING_STATUS &&
        isTrackingPingStatusPayload(payload)
      ) {
        h.onPingStatus?.(payload);
      } else if (event === TRACKING_BROADCAST_EVENT.RESEED) {
        h.onReseed?.();
      } else if (event === TRACKING_BROADCAST_EVENT.SESSION_ENDED) {
        h.onSessionEnded?.();
      }
    } catch (err) {
      console.warn('[tracking:broadcast] handler error', err);
    }
  }
}

/**
 * Ref-counted trip channel subscriber. Does not touch React state.
 */
export function subscribeTrackingTripBroadcast(
  tripId: string,
  handlers: TripBroadcastHandlers,
): () => void {
  let entry = tripSubscriptions.get(tripId);
  if (!entry) {
    const channel = supabase().channel(trackingTripChannelName(tripId), {
      config: { broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: TRACKING_BROADCAST_EVENT.POSITION }, ({ payload }) => {
        dispatch(tripId, TRACKING_BROADCAST_EVENT.POSITION, payload);
      })
      .on('broadcast', { event: TRACKING_BROADCAST_EVENT.PING_STATUS }, ({ payload }) => {
        dispatch(tripId, TRACKING_BROADCAST_EVENT.PING_STATUS, payload);
      })
      .on('broadcast', { event: TRACKING_BROADCAST_EVENT.RESEED }, () => {
        dispatch(tripId, TRACKING_BROADCAST_EVENT.RESEED, { v: 1, tripId, reason: 'reconnect' });
      })
      .on('broadcast', { event: TRACKING_BROADCAST_EVENT.SESSION_ENDED }, () => {
        dispatch(tripId, TRACKING_BROADCAST_EVENT.SESSION_ENDED, null);
      });
    void channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && __DEV__) {
        console.log('[tracking:broadcast] subscribed', tripId);
      }
    });
    entry = { channel, refs: 0, handlers: new Set() };
    tripSubscriptions.set(tripId, entry);
  }

  entry.refs += 1;
  entry.handlers.add(handlers);

  return () => {
    const e = tripSubscriptions.get(tripId);
    if (!e) return;
    e.handlers.delete(handlers);
    e.refs -= 1;
    if (e.refs <= 0 && e.handlers.size === 0) {
      void supabase().removeChannel(e.channel);
      tripSubscriptions.delete(tripId);
    }
  };
}
