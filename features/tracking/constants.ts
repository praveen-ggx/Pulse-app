/** Broadcast channel prefixes (isolated tracking namespace). */
export const TRACKING_CHANNEL_TRIP_PREFIX = 'tracking:trip:';
export const TRACKING_CHANNEL_FLEET_PREFIX = 'tracking:org:';
export const TRACKING_CHANNEL_FLEET_SUFFIX = ':fleet';

/**
 * Publisher throttle — do not send at raw GPS callback rate.
 * Live lane: publish when moved ≥ 50 m OR 15 s elapsed (heartbeat while parked),
 * but never more often than once per 5 s. Broadcast only — zero DB writes.
 */
export const TRACKING_BROADCAST_MIN_INTERVAL_MS = 15_000;
export const TRACKING_BROADCAST_MIN_DISPLACEMENT_M = 50;
export const TRACKING_BROADCAST_MIN_GAP_MS = 5_000;

/**
 * Driver checkpoint lane (tracking_record_checkpoint RPC): sparse trail + driver_presence.
 * Deliberately much slower than the live lane so DB load stays tiny.
 */
export const DRIVER_LIVE_CHECKPOINT_MIN_INTERVAL_MS = 120_000;
export const DRIVER_LIVE_CHECKPOINT_MIN_DISPLACEMENT_M = 500;

/** Headless/background guard: re-check trip status this often and stop when the trip is closed. */
export const DRIVER_LIVE_TRIP_STATUS_CHECK_MS = 10 * 60_000;

/** expo-task-manager task name for driver background GPS (must be defined at app entry). */
export const DRIVER_LIVE_LOCATION_TASK = 'PULSE_DRIVER_LIVE_LOCATION';

/** Checkpoint RPC movement gate (server also enforces). */
export const TRACKING_CHECKPOINT_MIN_INTERVAL_MS = 30_000;
export const TRACKING_CHECKPOINT_MIN_DISPLACEMENT_M = 50;

/** Stale marker if no position broadcast within this window. */
export const TRACKING_POSITION_STALE_MS = 90_000;

/** Reconnect reseed debounce. */
export const TRACKING_RESEED_DEBOUNCE_MS = 2_000;

/** Fleet map max markers before clustering (phase 2). */
export const FLEET_MAP_CLUSTER_THRESHOLD = 80;

export const TRACKING_BROADCAST_EVENT = {
  POSITION: 'position',
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',
  CHECKPOINT: 'checkpoint',
  RESEED: 'reseed',
  PING_REQUEST: 'ping_request',
  /** Driver → shipper: ping could not get GPS (permission / services off). */
  PING_STATUS: 'ping_status',
} as const;

/** Dispatcher waits this long for driver to respond before declaring ping timed out. */
export const TRACKING_PING_TIMEOUT_MS = 12_000;
