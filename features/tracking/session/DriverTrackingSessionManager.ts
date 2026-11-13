import { TRACKING_BROADCAST_EVENT } from '@/features/tracking/constants';
import {
  TRACKING_BROADCAST_MIN_DISPLACEMENT_M,
  TRACKING_BROADCAST_MIN_GAP_MS,
  TRACKING_BROADCAST_MIN_INTERVAL_MS,
} from '@/features/tracking/constants';
import { publishTrackingBroadcast } from '@/features/tracking/broadcast/publishTrackingBroadcast';
import { teardownTrackingPublishChannels } from '@/features/tracking/broadcast/publishTrackingBroadcast';
import { TrackingMovementFilter } from '@/features/tracking/session/trackingMovementFilter';
import type { TrackingPositionPayload } from '@/features/tracking/types/broadcast.types';

export type ActiveTrackingSession = {
  sessionId: string;
  tripId: string;
  driverId: string;
  orgId: string;
  startedAt: string;
};

/**
 * Driver-side tracking session — broadcast publisher only (no Zustand).
 * DB checkpoints remain in driverLocation.service / tracking RPC.
 */
export class DriverTrackingSessionManager {
  private session: ActiveTrackingSession | null = null;
  private readonly broadcastFilter = new TrackingMovementFilter({
    minDisplacementM: TRACKING_BROADCAST_MIN_DISPLACEMENT_M,
    minIntervalMs: TRACKING_BROADCAST_MIN_INTERVAL_MS,
    minGapMs: TRACKING_BROADCAST_MIN_GAP_MS,
  });

  get active(): ActiveTrackingSession | null {
    return this.session;
  }

  async start(args: {
    tripId: string;
    driverId: string;
    orgId: string;
    sessionId?: string;
  }): Promise<void> {
    if (this.session?.tripId === args.tripId) return;
    await this.stop();
    const sessionId =
      args.sessionId ??
      `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.session = {
      sessionId,
      tripId: args.tripId,
      driverId: args.driverId,
      orgId: args.orgId,
      startedAt: new Date().toISOString(),
    };
    this.broadcastFilter.reset();
    await publishTrackingBroadcast(args.tripId, args.orgId, TRACKING_BROADCAST_EVENT.SESSION_STARTED, {
      v: 1,
      tripId: args.tripId,
      driverId: args.driverId,
      orgId: args.orgId,
      sessionId,
      recordedAt: this.session.startedAt,
    });
  }

  async stop(): Promise<void> {
    const s = this.session;
    if (!s) return;
    this.session = null;
    this.broadcastFilter.reset();
    await publishTrackingBroadcast(s.tripId, s.orgId, TRACKING_BROADCAST_EVENT.SESSION_ENDED, {
      v: 1,
      tripId: s.tripId,
      driverId: s.driverId,
      orgId: s.orgId,
      sessionId: s.sessionId,
      recordedAt: new Date().toISOString(),
    });
    teardownTrackingPublishChannels(s.tripId, s.orgId);
  }

  /**
   * Call after a successful checkpoint write — never from raw GPS callback unless filtered.
   */
  async publishPositionIfNeeded(fix: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    recordedAt: string;
    heading?: number | null;
    speedKmh?: number | null;
  }): Promise<boolean> {
    const s = this.session;
    if (!s) return false;
    const nowMs = Date.parse(fix.recordedAt) || Date.now();
    if (
      !this.broadcastFilter.shouldPublish(
        { latitude: fix.latitude, longitude: fix.longitude, recordedAtMs: nowMs },
        nowMs,
      )
    ) {
      return false;
    }
    const payload: TrackingPositionPayload = {
      v: 1,
      tripId: s.tripId,
      driverId: s.driverId,
      orgId: s.orgId,
      sessionId: s.sessionId,
      latitude: fix.latitude,
      longitude: fix.longitude,
      accuracy: fix.accuracy,
      recordedAt: fix.recordedAt,
      heading: fix.heading ?? null,
      speedKmh: fix.speedKmh ?? null,
    };
    await publishTrackingBroadcast(
      s.tripId,
      s.orgId,
      TRACKING_BROADCAST_EVENT.POSITION,
      payload,
    );
    this.broadcastFilter.markPublished(
      { latitude: fix.latitude, longitude: fix.longitude },
      nowMs,
    );
    return true;
  }
}

/** Process-wide singleton for driver app. */
let driverSessionSingleton: DriverTrackingSessionManager | null = null;

export function getDriverTrackingSessionManager(): DriverTrackingSessionManager {
  if (!driverSessionSingleton) {
    driverSessionSingleton = new DriverTrackingSessionManager();
  }
  return driverSessionSingleton;
}
