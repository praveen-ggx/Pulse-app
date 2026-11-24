/**
 * Driver live tracking: throttles (DB safety) + map store seed guard.
 */
import { TrackingMovementFilter } from '@/features/tracking/session/trackingMovementFilter';
import { TripTrackingMapStore } from '@/features/tracking/map/TripTrackingMapStore';

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
}));

const mockPublish = jest.fn().mockResolvedValue(true);
const mockStart = jest.fn().mockResolvedValue(undefined);
const mockStop = jest.fn().mockResolvedValue(undefined);
let mockActive: { tripId: string } | null = null;

jest.mock('@/features/tracking/session/DriverTrackingSessionManager', () => ({
  getDriverTrackingSessionManager: () => ({
    get active() {
      return mockActive;
    },
    start: (...args: unknown[]) => {
      mockActive = { tripId: (args[0] as { tripId: string }).tripId };
      return mockStart(...args);
    },
    stop: (...args: unknown[]) => {
      mockActive = null;
      return mockStop(...args);
    },
    publishPositionIfNeeded: (...args: unknown[]) => mockPublish(...args),
  }),
}));

const mockCheckpoint = jest.fn().mockResolvedValue({ error: null, checkpointId: 'c', wroteCheckpoint: true });
jest.mock('@/features/tracking/services/trackingCheckpoint.service', () => ({
  recordTrackingCheckpoint: (...args: unknown[]) => mockCheckpoint(...args),
}));

let mockTripStatus = 'in_transit';
jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { status: mockTripStatus }, error: null }),
        }),
      }),
    }),
  }),
}));

jest.mock('@/lib/safeForegroundPositionWatch', () => ({
  startForegroundPositionWatch: jest.fn().mockResolvedValue({ remove: jest.fn() }),
}));

jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  ActivityType: { AutomotiveNavigation: 2 },
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  hasStartedLocationUpdatesAsync: jest.fn().mockResolvedValue(false),
  startLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
  stopLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
}), { virtual: false });

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
      setItem: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve();
      }),
      removeItem: jest.fn((k: string) => {
        store.delete(k);
        return Promise.resolve();
      }),
    },
  };
});

// eslint-disable-next-line import/first -- must load after jest.mock
import * as svc from '@/features/tracking/services/driverLiveTracking.service';

const flush = () => new Promise((r) => setImmediate(r));

function fix(lat: number, lon: number, ts: number, accuracy = 10) {
  return { coords: { latitude: lat, longitude: lon, accuracy, heading: 90, speed: 10 }, timestamp: ts };
}

describe('TrackingMovementFilter minGapMs', () => {
  it('blocks publishes closer than the gap even when displaced', () => {
    const f = new TrackingMovementFilter({ minDisplacementM: 50, minIntervalMs: 15_000, minGapMs: 5_000 });
    expect(f.shouldPublish({ latitude: 12, longitude: 77 }, 0)).toBe(true);
    f.markPublished({ latitude: 12, longitude: 77 }, 0);
    // ~1.1 km away but only 2 s later → blocked
    expect(f.shouldPublish({ latitude: 12.01, longitude: 77 }, 2_000)).toBe(false);
    expect(f.shouldPublish({ latitude: 12.01, longitude: 77 }, 5_000)).toBe(true);
    // parked: no displacement → heartbeat after 15 s
    f.markPublished({ latitude: 12.01, longitude: 77 }, 5_000);
    expect(f.shouldPublish({ latitude: 12.01, longitude: 77 }, 10_000)).toBe(false);
    expect(f.shouldPublish({ latitude: 12.01, longitude: 77 }, 20_000)).toBe(true);
  });

  it('default config (no minGapMs) keeps old behaviour', () => {
    const f = new TrackingMovementFilter({ minDisplacementM: 50, minIntervalMs: 30_000 });
    f.markPublished({ latitude: 12, longitude: 77 }, 0);
    expect(f.shouldPublish({ latitude: 12.01, longitude: 77 }, 100)).toBe(true);
  });
});

describe('TripTrackingMapStore.applySeed', () => {
  it('never moves the marker back behind a newer live point', () => {
    const s = new TripTrackingMapStore();
    s.applyBroadcast({
      v: 1, tripId: 't', driverId: 'd', orgId: 'o', sessionId: 's',
      latitude: 13, longitude: 80, accuracy: 5, recordedAt: '2026-11-13T10:05:00.000Z',
    } as never);
    s.applySeed(12, 77, '2026-11-13T09:30:00.000Z');
    expect(s.latest?.latitude).toBe(13);
    s.applySeed(14, 81, '2026-11-13T10:06:00.000Z');
    expect(s.latest?.latitude).toBe(14);
    s.clear();
  });
});

describe('driverLiveTracking.service', () => {
  beforeEach(async () => {
    await svc.stopDriverLiveTracking();
    jest.clearAllMocks();
    mockTripStatus = 'in_transit';
  });

  it('starts a broadcast session and publishes every fix (session filter decides cadence)', async () => {
    const release = svc.acquireDriverLiveTracking({ tripId: 't1', driverId: 'd1', orgId: 'o1' });
    await flush();
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(svc.getDriverLiveTrackingTripId()).toBe('t1');

    await svc.handleDriverLocationFix(fix(12, 77, 1_000_000));
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish.mock.calls[0][0]).toMatchObject({ latitude: 12, longitude: 77, heading: 90, speedKmh: 36 });
    release();
  });

  it('drops very inaccurate fixes', async () => {
    svc.acquireDriverLiveTracking({ tripId: 't1', driverId: 'd1', orgId: 'o1' });
    await flush();
    await svc.handleDriverLocationFix(fix(12, 77, 1_000_000, 900));
    expect(mockPublish).not.toHaveBeenCalled();
    expect(mockCheckpoint).not.toHaveBeenCalled();
  });

  it('writes DB checkpoints at most every 2 min unless moved 500 m (DB safety)', async () => {
    svc.acquireDriverLiveTracking({ tripId: 't1', driverId: 'd1', orgId: 'o1' });
    await flush();
    const t0 = 1_000_000;
    await svc.handleDriverLocationFix(fix(12, 77, t0));
    await flush();
    // 40 fixes, 15 s apart, ~30 m apart each (≈1.2 km total over 10 min)
    for (let i = 1; i <= 40; i += 1) {
      await svc.handleDriverLocationFix(fix(12 + i * 0.00027, 77, t0 + i * 15_000));
      await flush();
    }
    expect(mockPublish).toHaveBeenCalledTimes(41); // live lane sees every fix
    // checkpoint lane: first fix + every ~500 m / 2 min → a handful, not 41
    expect(mockCheckpoint.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(mockCheckpoint.mock.calls.length).toBeLessThanOrEqual(6);
    expect(mockCheckpoint.mock.calls[0][0]).toMatchObject({ tripId: 't1', sessionId: null, source: 'live' });
  });

  it('stops by itself when the trip is closed (headless guard)', async () => {
    svc.acquireDriverLiveTracking({ tripId: 't1', driverId: 'd1', orgId: 'o1' });
    await flush();
    mockTripStatus = 'completed';
    // > 10 min later triggers the status check
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60_000;
    try {
      await svc.handleDriverLocationFix(fix(12, 77, Date.now()));
      await flush();
      await flush();
    } finally {
      Date.now = realNow;
    }
    expect(svc.getDriverLiveTrackingTripId()).toBeNull();
    expect(mockStop).toHaveBeenCalled();
  });

  it('release stops tracking after the debounce; re-acquire inside it keeps tracking', async () => {
    jest.useFakeTimers();
    try {
      const r1 = svc.acquireDriverLiveTracking({ tripId: 't1', driverId: 'd1', orgId: 'o1' });
      await Promise.resolve();
      r1();
      jest.advanceTimersByTime(2_000);
      const r2 = svc.acquireDriverLiveTracking({ tripId: 't1', driverId: 'd1', orgId: 'o1' });
      jest.advanceTimersByTime(10_000);
      expect(svc.getDriverLiveTrackingTripId()).toBe('t1');
      r2();
      jest.advanceTimersByTime(6_000);
    } finally {
      jest.useRealTimers();
    }
    await flush();
    await flush();
    expect(svc.getDriverLiveTrackingTripId()).toBeNull();
  });
});
