import { TRACKING_POSITION_STALE_MS } from '@/features/tracking/constants';
import type { TrackingPositionPayload } from '@/features/tracking/types/broadcast.types';

export type TripMapPoint = {
  latitude: number;
  longitude: number;
  recordedAt: string;
  stale: boolean;
};

type Listener = (point: TripMapPoint | null) => void;

/**
 * Mutable trip map state — **not** React/Zustand. Map managers subscribe imperatively.
 */
export class TripTrackingMapStore {
  private point: TripMapPoint | null = null;
  private listeners = new Set<Listener>();
  private staleTimer: ReturnType<typeof setTimeout> | null = null;

  get latest(): TripMapPoint | null {
    return this.point;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.point);
    return () => this.listeners.delete(listener);
  }

  applyBroadcast(payload: TrackingPositionPayload): void {
    this.setPoint({
      latitude: payload.latitude,
      longitude: payload.longitude,
      recordedAt: payload.recordedAt,
      stale: false,
    });
  }

  applySeed(latitude: number, longitude: number, recordedAt: string): void {
    // A DB seed must never move the marker back behind a newer live broadcast point.
    const cur = this.point;
    if (cur) {
      const curMs = Date.parse(cur.recordedAt);
      const nextMs = Date.parse(recordedAt);
      if (Number.isFinite(curMs) && Number.isFinite(nextMs) && nextMs < curMs) return;
    }
    this.setPoint({ latitude, longitude, recordedAt, stale: false });
  }

  clear(): void {
    this.setPoint(null);
  }

  private setPoint(next: TripMapPoint | null): void {
    this.point = next;
    if (this.staleTimer) clearTimeout(this.staleTimer);
    if (next) {
      this.staleTimer = setTimeout(() => {
        if (!this.point) return;
        this.point = { ...this.point, stale: true };
        this.emit();
      }, TRACKING_POSITION_STALE_MS);
    }
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) {
      try {
        l(this.point);
      } catch (e) {
        console.warn('[TripTrackingMapStore] listener failed', e);
      }
    }
  }
}

const stores = new Map<string, TripTrackingMapStore>();

export function getTripTrackingMapStore(tripId: string): TripTrackingMapStore {
  let s = stores.get(tripId);
  if (!s) {
    s = new TripTrackingMapStore();
    stores.set(tripId, s);
  }
  return s;
}

export function releaseTripTrackingMapStore(tripId: string): void {
  const s = stores.get(tripId);
  s?.clear();
  stores.delete(tripId);
}
