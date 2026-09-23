/**
 * Requests Moderator — admission control and scheduling for client→DB reads.
 *
 * Sits BELOW TanStack Query and ABOVE supabase(). It is not a cache and does
 * not reimplement query state; it governs the *stream* of requests:
 *   1. concurrency ceiling (semaphore)   — bounds pool pressure per device
 *   2. priority lanes                    — background yields to interactive
 *   3. coalescing                        — duplicate in-flight reads collapse
 *   4. circuit breaker                   — shed background/bulk when DB degrades
 *
 * Safety: `observeOnly` (the default) counts everything and governs nothing, so
 * it can land with zero behaviour change. Every queued request also carries a
 * hard `maxQueueWaitMs` escape hatch — if the semaphore ever stalls, requests
 * pass through rather than hanging the app.
 *
 * @see docs/DB_LOAD_ARCHITECTURE_REVIEW.md
 */
import {
  DEFAULT_MODERATOR_CONFIG,
  LANE_PRIORITY,
  type ModeratorConfig,
  type ModeratorMetrics,
  type RequestLane,
  type ShapeViolation,
} from './types';

type Waiter = {
  lane: RequestLane;
  seq: number;
  enqueuedAt: number;
  release: () => void;
  settled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

let config: ModeratorConfig = { ...DEFAULT_MODERATOR_CONFIG };

let inFlight = 0;
let seqCounter = 0;
const queue: Waiter[] = [];
const inflightReads = new Map<string, Promise<Response>>();

/** Rolling window of queue waits for the p95 metric. */
const WAIT_SAMPLE_LIMIT = 200;
const waitSamples: number[] = [];

const metrics: ModeratorMetrics = {
  total: 0,
  byLane: { interactive: 0, background: 0, bulk: 0 },
  coalesced: 0,
  queued: 0,
  queueTimeouts: 0,
  shed: 0,
  peakInFlight: 0,
  inFlight: 0,
  queueDepth: 0,
  queueWaitP95Ms: 0,
  breakerOpens: 0,
  shapeViolations: { unbounded: 0, 'select-star': 0 },
};

// --- circuit breaker ---------------------------------------------------------

let consecutiveFailures = 0;
let breakerOpenedAt = 0;

/** Open when the DB has signalled degradation repeatedly and cooldown hasn't elapsed. */
function isBreakerOpen(): boolean {
  if (!config.circuitBreakerEnabled) return false;
  if (breakerOpenedAt === 0) return false;
  if (Date.now() - breakerOpenedAt >= config.breakerCooldownMs) {
    // Cooldown elapsed — half-open: let traffic through and re-evaluate.
    breakerOpenedAt = 0;
    consecutiveFailures = 0;
    return false;
  }
  return true;
}

/** Feed the breaker. `degraded` should be true for 57014 / 5xx / origin-down. */
export function recordOutcome(degraded: boolean): void {
  if (degraded) {
    consecutiveFailures += 1;
    if (
      consecutiveFailures >= config.breakerFailureThreshold &&
      breakerOpenedAt === 0
    ) {
      breakerOpenedAt = Date.now();
      metrics.breakerOpens += 1;
    }
  } else {
    consecutiveFailures = 0;
  }
}

// --- semaphore ---------------------------------------------------------------

function recordWait(ms: number): void {
  waitSamples.push(ms);
  if (waitSamples.length > WAIT_SAMPLE_LIMIT) waitSamples.shift();
  const sorted = [...waitSamples].sort((a, b) => a - b);
  metrics.queueWaitP95Ms = Math.round(
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
  );
}

/** Serve the highest-priority waiter (lane first, then FIFO within a lane). */
function pump(): void {
  while (inFlight < config.maxConcurrent && queue.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      const a = queue[i];
      const b = queue[bestIdx];
      if (
        LANE_PRIORITY[a.lane] < LANE_PRIORITY[b.lane] ||
        (LANE_PRIORITY[a.lane] === LANE_PRIORITY[b.lane] && a.seq < b.seq)
      ) {
        bestIdx = i;
      }
    }
    const waiter = queue.splice(bestIdx, 1)[0];
    metrics.queueDepth = queue.length;
    if (waiter.settled) continue;
    waiter.settled = true;
    if (waiter.timer) clearTimeout(waiter.timer);
    recordWait(Date.now() - waiter.enqueuedAt);
    waiter.release();
  }
}

function enterSlot(lane: RequestLane): Promise<void> {
  if (inFlight < config.maxConcurrent) {
    inFlight += 1;
    metrics.inFlight = inFlight;
    metrics.peakInFlight = Math.max(metrics.peakInFlight, inFlight);
    return Promise.resolve();
  }
  metrics.queued += 1;
  return new Promise<void>((resolve) => {
    const waiter: Waiter = {
      lane,
      seq: seqCounter++,
      enqueuedAt: Date.now(),
      settled: false,
      timer: null,
      release: () => {
        inFlight += 1;
        metrics.inFlight = inFlight;
        metrics.peakInFlight = Math.max(metrics.peakInFlight, inFlight);
        resolve();
      },
    };
    // Escape hatch: never let a request hang on a stalled semaphore.
    waiter.timer = setTimeout(() => {
      if (waiter.settled) return;
      waiter.settled = true;
      metrics.queueTimeouts += 1;
      recordWait(Date.now() - waiter.enqueuedAt);
      inFlight += 1;
      metrics.inFlight = inFlight;
      metrics.peakInFlight = Math.max(metrics.peakInFlight, inFlight);
      resolve();
    }, config.maxQueueWaitMs);
    queue.push(waiter);
    metrics.queueDepth = queue.length;
  });
}

function exitSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  metrics.inFlight = inFlight;
  pump();
}

// --- public API --------------------------------------------------------------

export class RequestShedError extends Error {
  readonly shed = true;
  constructor(lane: RequestLane) {
    super(`Request shed: DB degraded, ${lane} lane paused`);
    this.name = 'RequestShedError';
  }
}

/**
 * Run `fn` under moderation. In observeOnly mode this only counts.
 * `coalesceKey` (when provided and the request is a read) collapses duplicate
 * in-flight requests into a single round-trip.
 */
export async function moderate(
  lane: RequestLane,
  fn: () => Promise<Response>,
  coalesceKey?: string,
): Promise<Response> {
  metrics.total += 1;
  metrics.byLane[lane] += 1;

  if (config.observeOnly) {
    // Still track in-flight so phase 1 measures the real concurrency profile.
    inFlight += 1;
    metrics.inFlight = inFlight;
    metrics.peakInFlight = Math.max(metrics.peakInFlight, inFlight);
    try {
      return await fn();
    } finally {
      inFlight = Math.max(0, inFlight - 1);
      metrics.inFlight = inFlight;
    }
  }

  // Shed non-interactive work while the DB is degraded. Interactive always runs.
  if (lane !== 'interactive' && isBreakerOpen()) {
    metrics.shed += 1;
    throw new RequestShedError(lane);
  }

  if (config.coalesceReads && coalesceKey) {
    const existing = inflightReads.get(coalesceKey);
    if (existing) {
      metrics.coalesced += 1;
      // Clone so each caller gets an independently-readable body.
      return existing.then((res) => res.clone());
    }
  }

  const run = (async () => {
    await enterSlot(lane);
    try {
      return await fn();
    } finally {
      exitSlot();
    }
  })();

  if (config.coalesceReads && coalesceKey) {
    inflightReads.set(coalesceKey, run);
    void run.catch(() => undefined).finally(() => {
      inflightReads.delete(coalesceKey);
    });
    return run.then((res) => res.clone());
  }

  return run;
}

export function recordShapeViolation(kind: ShapeViolation): void {
  metrics.shapeViolations[kind] += 1;
}

export function configureModerator(patch: Partial<ModeratorConfig>): void {
  config = { ...config, ...patch };
  pump();
}

export function getModeratorConfig(): ModeratorConfig {
  return { ...config };
}

export function getModeratorMetrics(): ModeratorMetrics {
  return {
    ...metrics,
    byLane: { ...metrics.byLane },
    shapeViolations: { ...metrics.shapeViolations },
  };
}

/** Test-only: restore pristine state. */
export function __resetModeratorForTests(): void {
  config = { ...DEFAULT_MODERATOR_CONFIG };
  inFlight = 0;
  seqCounter = 0;
  queue.forEach((w) => w.timer && clearTimeout(w.timer));
  queue.length = 0;
  inflightReads.clear();
  waitSamples.length = 0;
  consecutiveFailures = 0;
  breakerOpenedAt = 0;
  Object.assign(metrics, {
    total: 0,
    byLane: { interactive: 0, background: 0, bulk: 0 },
    coalesced: 0,
    queued: 0,
    queueTimeouts: 0,
    shed: 0,
    peakInFlight: 0,
    inFlight: 0,
    queueDepth: 0,
    queueWaitP95Ms: 0,
    breakerOpens: 0,
    shapeViolations: { unbounded: 0, 'select-star': 0 },
  });
}
