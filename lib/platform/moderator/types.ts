/**
 * Requests Moderator — shared types.
 * @see docs/DB_LOAD_ARCHITECTURE_REVIEW.md
 */

/** Scheduling lanes. Under saturation, `interactive` is served first and
 *  `bulk` is the first to be shed by the circuit breaker. */
export type RequestLane = 'interactive' | 'background' | 'bulk';

export const LANE_PRIORITY: Record<RequestLane, number> = {
  interactive: 0,
  background: 1,
  bulk: 2,
};

/** Moderator behaviour. `observeOnly` is the phase-2 default: measure, never govern. */
export type ModeratorConfig = {
  /** When true, nothing is queued, coalesced away, or shed — counters only. */
  observeOnly: boolean;
  /** Max concurrent in-flight DB requests per device. */
  maxConcurrent: number;
  /** Hard ceiling on queue wait. On expiry the request passes through
   *  regardless of saturation — the escape hatch against a stalled semaphore. */
  maxQueueWaitMs: number;
  /** Collapse identical in-flight GET requests into one round-trip. */
  coalesceReads: boolean;
  /** Shed background/bulk lanes when the DB reports degradation. */
  circuitBreakerEnabled: boolean;
  /** Consecutive degradation signals before the breaker opens. */
  breakerFailureThreshold: number;
  /** How long the breaker stays open before probing again. */
  breakerCooldownMs: number;
  /** Warn (dev only) on unbounded or select=* reads. */
  shapeGuardEnabled: boolean;
};

export const DEFAULT_MODERATOR_CONFIG: ModeratorConfig = {
  observeOnly: true,
  maxConcurrent: 6,
  maxQueueWaitMs: 8_000,
  coalesceReads: true,
  circuitBreakerEnabled: false,
  breakerFailureThreshold: 3,
  breakerCooldownMs: 15_000,
  // `__DEV__` is a React Native global and is absent in the plain-node `platform`
  // jest project, so read it defensively rather than referencing it directly.
  shapeGuardEnabled:
    typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production',
};

declare const __DEV__: boolean | undefined;

export type ShapeViolation = 'unbounded' | 'select-star';

export type ModeratorMetrics = {
  /** Requests admitted to the scheduler. */
  total: number;
  byLane: Record<RequestLane, number>;
  /** Requests served from an in-flight duplicate instead of a new round-trip. */
  coalesced: number;
  /** Requests that waited in the queue at all. */
  queued: number;
  /** Requests released by the maxQueueWaitMs escape hatch. */
  queueTimeouts: number;
  /** Requests dropped by an open circuit breaker. */
  shed: number;
  /** Peak simultaneous in-flight requests. */
  peakInFlight: number;
  /** Current in-flight count. */
  inFlight: number;
  /** Current queue depth. */
  queueDepth: number;
  /** p95 queue wait, ms. */
  queueWaitP95Ms: number;
  /** Times the breaker opened. */
  breakerOpens: number;
  /** Query-shape violations seen, by kind. */
  shapeViolations: Record<ShapeViolation, number>;
};
