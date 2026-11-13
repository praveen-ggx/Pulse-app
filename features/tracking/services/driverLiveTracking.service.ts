/**
 * Driver live tracking controller (plain module, no React state).
 *
 * Three-lane design — this module owns lanes 1 and 2 only:
 *   Lane 1  LIVE        every ≥50 m or 15 s (min gap 5 s) → Supabase Realtime Broadcast.
 *                       Zero database writes.
 *   Lane 2  CHECKPOINT  every 2 min or 500 m → tracking_record_checkpoint RPC
 *                       (trip_location_checkpoints + driver_presence; server re-gates 50 m / 30 s).
 *   Lane 3  HISTORY     the existing 12-ping driver_locations loop — untouched, lives in
 *                       useAdaptiveTripLocationPingLoop.
 *
 * GPS sources:
 *   - Foreground: watchPositionAsync while the app is open.
 *   - Background: expo-location + expo-task-manager task (Android foreground service with a
 *     "trip tracking" notification) so tracking continues with the screen off. Only started
 *     when the driver granted "Allow all the time"; otherwise foreground-only (no regression).
 *
 * The active trip context is persisted so a headless background task (app process restarted by
 * the OS) can keep publishing; it re-checks trip status every 10 min and stops itself when the
 * trip is closed.
 */
import { AppState, Platform, type NativeEventSubscription } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocationObject } from 'expo-location';
import { supabase } from '@/lib/supabase';
import {
  startForegroundPositionWatch,
  type ForegroundPositionWatchHandle,
} from '@/lib/safeForegroundPositionWatch';
import {
  DRIVER_LIVE_CHECKPOINT_MIN_DISPLACEMENT_M,
  DRIVER_LIVE_CHECKPOINT_MIN_INTERVAL_MS,
  DRIVER_LIVE_LOCATION_TASK,
  DRIVER_LIVE_TRIP_STATUS_CHECK_MS,
} from '@/features/tracking/constants';
import { getDriverTrackingSessionManager } from '@/features/tracking/session/DriverTrackingSessionManager';
import { TrackingMovementFilter } from '@/features/tracking/session/trackingMovementFilter';
import { recordTrackingCheckpoint } from '@/features/tracking/services/trackingCheckpoint.service';

export type DriverLiveTrackingContext = {
  tripId: string;
  driverId: string;
  orgId: string;
};

type PersistedContext = DriverLiveTrackingContext & { startedAt: string };

const STORAGE_KEY = 'pulse.driverLiveTracking.v1';
/** Ignore very poor fixes (cell-tower / indoor) so the dispatcher marker does not jump around. */
const MAX_ACCEPTED_ACCURACY_M = 150;
/** Delay before a release (screen unmount / trip briefly null during refetch) actually stops. */
const RELEASE_STOP_DELAY_MS = 5_000;
const CLOSED_TRIP_STATUSES = new Set([
  'completed',
  'delivered',
  'done',
  'cancelled',
  'canceled',
  'closed',
  'rejected',
]);

let ctx: PersistedContext | null = null;
/** Trip the hooks asked for (set synchronously, before async start completes). */
let target: DriverLiveTrackingContext | null = null;
let holders = 0;
let generation = 0;
let fgWatch: ForegroundPositionWatchHandle | null = null;
let appStateSub: NativeEventSubscription | null = null;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let checkpointInFlight = false;
let lastTripStatusCheckAt = 0;
let checkpointErrorLogged = false;

const checkpointFilter = new TrackingMovementFilter({
  minDisplacementM: DRIVER_LIVE_CHECKPOINT_MIN_DISPLACEMENT_M,
  minIntervalMs: DRIVER_LIVE_CHECKPOINT_MIN_INTERVAL_MS,
});

function sameContext(a: DriverLiveTrackingContext | null, b: DriverLiveTrackingContext): boolean {
  return !!a && a.tripId === b.tripId && a.driverId === b.driverId && a.orgId === b.orgId;
}

async function persistContext(next: PersistedContext | null): Promise<void> {
  try {
    if (next) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — headless restore just won't work; foreground tracking unaffected.
  }
}

async function loadPersistedContext(): Promise<PersistedContext | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedContext>;
    if (!parsed?.tripId || !parsed.driverId || !parsed.orgId) return null;
    return {
      tripId: parsed.tripId,
      driverId: parsed.driverId,
      orgId: parsed.orgId,
      startedAt: parsed.startedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function backgroundSupported(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

async function hasStartedBackgroundUpdates(): Promise<boolean> {
  if (!backgroundSupported()) return false;
  try {
    const Location = await import('expo-location');
    return await Location.hasStartedLocationUpdatesAsync(DRIVER_LIVE_LOCATION_TASK);
  } catch {
    return false;
  }
}

/**
 * Start the background GPS task if (a) a trip is being tracked, (b) the driver granted
 * "Allow all the time", (c) the app is in the foreground (Android 12+ forbids starting a
 * foreground service from the background). Safe to call repeatedly.
 */
export async function ensureDriverBackgroundUpdates(): Promise<boolean> {
  if (!ctx || !backgroundSupported()) return false;
  if (AppState?.currentState !== 'active') return false;
  try {
    const Location = await import('expo-location');
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') return false;
    if (await hasStartedBackgroundUpdates()) return true;
    await Location.startLocationUpdatesAsync(DRIVER_LIVE_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15_000,
      distanceInterval: 50,
      deferredUpdatesInterval: 15_000,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Pulse · trip in progress',
        notificationBody: 'Sharing your live location with the office for this trip.',
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch (e) {
    console.warn('[driverLiveTracking] background start failed', e);
    return false;
  }
}

async function stopBackgroundUpdates(): Promise<void> {
  if (!backgroundSupported()) return;
  try {
    if (!(await hasStartedBackgroundUpdates())) return;
    const Location = await import('expo-location');
    await Location.stopLocationUpdatesAsync(DRIVER_LIVE_LOCATION_TASK);
  } catch {
    // Task not registered / already stopped.
  }
}

async function startForegroundWatch(gen: number): Promise<void> {
  if (fgWatch) return;
  try {
    const Location = await import('expo-location');
    const handle = await startForegroundPositionWatch(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5_000,
        distanceInterval: 20,
      },
      (loc) => {
        void handleDriverLocationFix(loc);
      },
    );
    if (gen !== generation || !ctx) {
      handle?.remove();
      return;
    }
    fgWatch = handle;
  } catch {
    // Permission missing / GPS off — background task (if any) still runs.
  }
}

function stopForegroundWatch(): void {
  fgWatch?.remove();
  fgWatch = null;
}

function attachAppStateListener(gen: number): void {
  appStateSub?.remove();
  appStateSub = null;
  try {
    appStateSub = AppState.addEventListener('change', (state) => {
      if (gen !== generation || !ctx) return;
      if (state === 'active') {
        // Driver may have just granted "Allow all the time" in system settings.
        void ensureDriverBackgroundUpdates();
        void startForegroundWatch(gen);
      }
    });
  } catch {
    // AppState unavailable (tests / exotic runtimes) — tracking still works without it.
  }
}

async function startFor(next: DriverLiveTrackingContext): Promise<void> {
  const gen = ++generation;
  ctx = { ...next, startedAt: new Date().toISOString() };
  checkpointFilter.reset();
  checkpointErrorLogged = false;
  lastTripStatusCheckAt = Date.now();
  await persistContext(ctx);
  if (gen !== generation) return;
  await getDriverTrackingSessionManager().start(next);
  if (gen !== generation) return;
  attachAppStateListener(gen);
  await startForegroundWatch(gen);
  if (gen !== generation) return;
  await ensureDriverBackgroundUpdates();
}

/** Tear down GPS sources + broadcast session for the current context (keeps target/holders). */
async function teardown(): Promise<void> {
  generation += 1;
  ctx = null;
  stopForegroundWatch();
  appStateSub?.remove();
  appStateSub = null;
  checkpointFilter.reset();
  await persistContext(null);
  await stopBackgroundUpdates();
  await getDriverTrackingSessionManager().stop();
}

/** Stop everything (foreground watch, background task, broadcast session). Idempotent. */
export async function stopDriverLiveTracking(): Promise<void> {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  target = null;
  holders = 0;
  await teardown();
}

/**
 * Ref-counted start: several driver screens may mount the hook for the same trip.
 * Returns a release function; tracking stops 5 s after the last holder releases
 * (absorbs remounts and brief "trip = null" refetch gaps).
 */
export function acquireDriverLiveTracking(next: DriverLiveTrackingContext): () => void {
  if (releaseTimer) {
    clearTimeout(releaseTimer);
    releaseTimer = null;
  }
  if (!sameContext(target, next)) {
    target = { ...next };
    holders = 0;
    void (async () => {
      if (ctx) await teardown();
      if (sameContext(target, next)) await startFor(next);
    })();
  } else if (ctx) {
    // Same trip (e.g. after app restart): make sure GPS sources are running.
    const gen = generation;
    void startForegroundWatch(gen);
    void ensureDriverBackgroundUpdates();
  }
  holders += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders > 0) return;
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      if (holders === 0 && sameContext(target, next)) void stopDriverLiveTracking();
    }, RELEASE_STOP_DELAY_MS);
  };
}

async function maybeStopIfTripClosed(): Promise<void> {
  if (!ctx) return;
  const now = Date.now();
  if (now - lastTripStatusCheckAt < DRIVER_LIVE_TRIP_STATUS_CHECK_MS) return;
  lastTripStatusCheckAt = now;
  const tripId = ctx.tripId;
  try {
    const { data, error } = await supabase()
      .from('trips')
      .select('status')
      .eq('id', tripId)
      .maybeSingle();
    if (error) return; // network / transient — keep tracking
    const status = String((data as { status?: string } | null)?.status ?? '').toLowerCase();
    const closed = CLOSED_TRIP_STATUSES.has(status);
    // Row no longer visible (unassigned) only counts when no screen is holding tracking open.
    const goneWhileHeadless = !data && holders === 0;
    if ((closed || goneWhileHeadless) && ctx?.tripId === tripId) {
      await stopDriverLiveTracking();
    }
  } catch {
    // ignore
  }
}

function maybeWriteCheckpoint(
  current: PersistedContext,
  fix: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    heading: number | null;
    speedKmh: number | null;
    recordedAt: string;
    tsMs: number;
  },
): void {
  if (checkpointInFlight) return;
  if (
    !checkpointFilter.shouldPublish(
      { latitude: fix.latitude, longitude: fix.longitude },
      fix.tsMs,
    )
  ) {
    return;
  }
  checkpointInFlight = true;
  // Mark first so a slow/failed RPC can never cause a retry storm; next attempt waits a full window.
  checkpointFilter.markPublished({ latitude: fix.latitude, longitude: fix.longitude }, fix.tsMs);
  void recordTrackingCheckpoint({
    tripId: current.tripId,
    driverId: current.driverId,
    organizationId: current.orgId,
    sessionId: null,
    latitude: fix.latitude,
    longitude: fix.longitude,
    accuracy: fix.accuracy,
    heading: fix.heading,
    speedKmh: fix.speedKmh,
    source: 'live',
    recordedAt: fix.recordedAt,
  })
    .then(({ error }) => {
      if (error && !checkpointErrorLogged) {
        checkpointErrorLogged = true;
        console.warn('[driverLiveTracking] checkpoint rpc:', error.message);
      }
    })
    .finally(() => {
      checkpointInFlight = false;
    });
}

/** Single entry point for every GPS fix (foreground watch or background task). */
export async function handleDriverLocationFix(loc: LocationObject): Promise<void> {
  if (!ctx) {
    // Headless background task after the OS restarted the process.
    const restored = await loadPersistedContext();
    if (!restored) {
      await stopBackgroundUpdates();
      return;
    }
    if (!ctx) {
      ctx = restored;
      if (!target) target = { tripId: restored.tripId, driverId: restored.driverId, orgId: restored.orgId };
      lastTripStatusCheckAt = 0; // verify the trip is still open right away
    }
  }
  const current = ctx;
  if (!current) return;

  const { latitude, longitude } = loc.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const accuracy = loc.coords.accuracy ?? null;
  if (accuracy != null && accuracy > MAX_ACCEPTED_ACCURACY_M) return;

  const tsMs = Number.isFinite(loc.timestamp) && loc.timestamp > 0 ? loc.timestamp : Date.now();
  const recordedAt = new Date(tsMs).toISOString();
  const heading =
    loc.coords.heading != null && Number.isFinite(loc.coords.heading) && loc.coords.heading >= 0
      ? loc.coords.heading
      : null;
  const speedKmh =
    loc.coords.speed != null && Number.isFinite(loc.coords.speed) && loc.coords.speed >= 0
      ? loc.coords.speed * 3.6
      : null;

  const mgr = getDriverTrackingSessionManager();
  try {
    if (mgr.active?.tripId !== current.tripId) {
      await mgr.start(current);
    }
    await mgr.publishPositionIfNeeded({
      latitude,
      longitude,
      accuracy,
      recordedAt,
      heading,
      speedKmh,
    });
  } catch {
    // Realtime hiccup — next fix retries; never throw into the GPS callback.
  }

  maybeWriteCheckpoint(current, { latitude, longitude, accuracy, heading, speedKmh, recordedAt, tsMs });
  void maybeStopIfTripClosed();
}

/** Background task entry: only the newest fix in a batch matters for live position. */
export async function handleDriverBackgroundLocations(locations: LocationObject[]): Promise<void> {
  if (!locations?.length) return;
  let latest = locations[0];
  for (const l of locations) {
    if ((l?.timestamp ?? 0) > (latest?.timestamp ?? 0)) latest = l;
  }
  if (latest) await handleDriverLocationFix(latest);
}

/** Test/debug: current tracked trip (null when idle). */
export function getDriverLiveTrackingTripId(): string | null {
  return ctx?.tripId ?? null;
}
