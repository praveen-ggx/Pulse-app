/**
 * Client-side movement gate for broadcast / checkpoint publish.
 * OR semantics: publish when displaced ≥ minM OR elapsed ≥ minMs (not raw GPS rate).
 */

export type MovementFix = {
  latitude: number;
  longitude: number;
  recordedAtMs?: number;
};

export type MovementFilterConfig = {
  minDisplacementM: number;
  minIntervalMs: number;
  /** Hard floor between publishes, even when displacement qualifies. Default 0 (off). */
  minGapMs?: number;
};

export class TrackingMovementFilter {
  private last: MovementFix | null = null;
  private lastSentAtMs = 0;

  constructor(private readonly config: MovementFilterConfig) {}

  reset(): void {
    this.last = null;
    this.lastSentAtMs = 0;
  }

  shouldPublish(fix: MovementFix, nowMs = Date.now()): boolean {
    if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) {
      return false;
    }
    const elapsed = nowMs - this.lastSentAtMs;
    if (!this.last) {
      return true;
    }
    if (elapsed < (this.config.minGapMs ?? 0)) return false;
    const dist = haversineM(
      this.last.latitude,
      this.last.longitude,
      fix.latitude,
      fix.longitude,
    );
    if (dist >= this.config.minDisplacementM) return true;
    if (elapsed >= this.config.minIntervalMs) return true;
    return false;
  }

  markPublished(fix: MovementFix, nowMs = Date.now()): void {
    this.last = { latitude: fix.latitude, longitude: fix.longitude };
    this.lastSentAtMs = nowMs;
  }
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
