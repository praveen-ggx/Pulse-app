/**
 * Covers Commit 3 for DriverLevelProgressionScreen — same scoping change as
 * DriverProfileScreen.realtime.test.tsx: the trips realtime subscription must use a
 * per-user registry key and a driver_id=in.(...) filter instead of the old unfiltered
 * table-wide subscription, while still sharing the channel with DriverProfileScreen
 * for the same signed-in user.
 */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import LevelProgressionScreen from '../DriverLevelProgressionScreen';
import { useAuth } from '@/contexts/AuthContext';
import * as driversService from '@/features/drivers/services/drivers.service';
import * as tripsService from '@/features/trips/services/trips.service';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';

jest.mock('react-native', () => jest.requireActual('react-native'));

jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/contexts/DriverThemeContext', () => ({
  useDriverTheme: () => ({ theme: 'light' }),
  useDriverThemeColors: () => new Proxy({}, { get: () => '#000000' }),
}));
jest.mock('@/components/driver/DriverSubScreenHeader', () => ({
  DRIVER_DETAIL_HORIZONTAL_PAD: 16,
  DriverSubScreenHeader: () => null,
  driverDetailPageBackground: () => '#ffffff',
}));
jest.mock('@/components/CenteredLoadingView', () => ({
  CenteredLoadingView: () => null,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
jest.mock('@expo/vector-icons/FontAwesome', () => 'FontAwesome');

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: () => {
      const resolved = { data: null, error: null };
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) builder[m] = jest.fn(() => builder);
      builder.maybeSingle = jest.fn(() => Promise.resolve(resolved));
      return builder;
    },
  }),
}));
jest.mock('@/lib/realtimeRegistry', () => ({ subscribeSharedPostgresChanges: jest.fn() }));
jest.mock('@/lib/queries/useDriverOperatingModeQuery', () => ({
  useDriverOperatingModeQuery: () => ({ canSeeMarketplace: false }),
}));
jest.mock('@/features/drivers/services/drivers.service', () => ({
  getLinkedDriversForCurrentUser: jest.fn(),
}));
jest.mock('@/features/trips/services/trips.service', () => ({
  getDriverUiTripsByDriverIds: jest.fn(() => Promise.resolve({ error: null, trips: [] })),
  isTripCompleted: jest.fn(() => false),
}));
jest.mock('@/features/ratings/services/ratings.service', () => ({
  getRatingsForDrivers: jest.fn(() => Promise.resolve({ byDriverId: {} })),
}));

const mockSubscribe = subscribeSharedPostgresChanges as jest.Mock;
const mockGetLinkedDrivers = driversService.getLinkedDriversForCurrentUser as jest.Mock;
const mockGetTrips = tripsService.getDriverUiTripsByDriverIds as jest.Mock;

function driverRow(id: string, orgId: string) {
  return {
    id,
    organization_id: orgId,
    user_id: 'user-1',
    name: 'Driver',
    phone: null,
    status: 'active',
    assigned_vehicle_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({
    profile: { uid: 'user-1', full_name: 'Test Driver' },
    user: { email: 'driver@example.com' },
  });
  mockGetTrips.mockResolvedValue({ error: null, trips: [] });
  mockSubscribe.mockReturnValue(jest.fn());
});

describe('DriverLevelProgressionScreen trips realtime subscription', () => {
  it('does not subscribe until driver IDs have resolved', async () => {
    const gate = deferred<{ error: null; drivers: unknown[] }>();
    mockGetLinkedDrivers.mockReturnValueOnce(gate.promise);

    render(<LevelProgressionScreen />);
    await act(async () => { await Promise.resolve(); });
    expect(mockSubscribe).not.toHaveBeenCalled();

    await act(async () => {
      gate.resolve({ error: null, drivers: [driverRow('d1', 'org-1')] });
      await gate.promise;
    });
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
  });

  it('uses the same user-specific registry key and driver_id=in.(...) filter shape as DriverProfileScreen', async () => {
    mockGetLinkedDrivers.mockResolvedValue({ error: null, drivers: [driverRow('d1', 'org-1')] });

    render(<LevelProgressionScreen />);

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
    const [key, specs] = mockSubscribe.mock.calls[0];
    expect(key).toBe('driver-app:trips:driver:user-1');
    expect(specs).toEqual([
      { event: '*', schema: 'public', table: 'trips', filter: 'driver_id=in.(d1)' },
    ]);
  });

  it('multi-driver, multi-org: filter includes every linked driver_id across all orgs', async () => {
    mockGetLinkedDrivers.mockResolvedValue({
      error: null,
      drivers: [driverRow('d1', 'org-1'), driverRow('d2', 'org-2')],
    });

    render(<LevelProgressionScreen />);

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
    expect(mockSubscribe.mock.calls[0][1][0].filter).toBe('driver_id=in.(d1,d2)');
  });

  it('re-subscribes and tears down the previous channel when the driver ID set changes', async () => {
    mockGetLinkedDrivers.mockResolvedValueOnce({ error: null, drivers: [driverRow('d1', 'org-1')] });
    const unsubFirst = jest.fn();
    mockSubscribe.mockReturnValueOnce(unsubFirst);

    const { rerender } = render(<LevelProgressionScreen />);
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
    expect(mockSubscribe.mock.calls[0][1][0].filter).toBe('driver_id=in.(d1)');

    mockGetLinkedDrivers.mockResolvedValueOnce({
      error: null,
      drivers: [driverRow('d1', 'org-1'), driverRow('d2', 'org-2')],
    });
    (useAuth as jest.Mock).mockReturnValue({
      profile: { uid: 'user-2', full_name: 'Second Driver' },
      user: { email: 'driver2@example.com' },
    });
    rerender(<LevelProgressionScreen />);

    await waitFor(() => {
      const last = mockSubscribe.mock.calls.at(-1);
      expect(last?.[0]).toBe('driver-app:trips:driver:user-2');
      expect(last?.[1][0].filter).toBe('driver_id=in.(d1,d2)');
    });
    expect(unsubFirst).toHaveBeenCalled();
  });

  it('unmount tears down the active subscription', async () => {
    mockGetLinkedDrivers.mockResolvedValue({ error: null, drivers: [driverRow('d1', 'org-1')] });
    const unsub = jest.fn();
    mockSubscribe.mockReturnValueOnce(unsub);

    const { unmount } = render(<LevelProgressionScreen />);
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));

    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('the subscription callback still triggers the existing load(false) refetch behaviour', async () => {
    mockGetLinkedDrivers.mockResolvedValue({ error: null, drivers: [driverRow('d1', 'org-1')] });

    render(<LevelProgressionScreen />);
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));

    const initialTripsCalls = mockGetTrips.mock.calls.length;
    const onEvent = mockSubscribe.mock.calls[0][2];

    await act(async () => {
      onEvent({ eventType: 'UPDATE', new: { id: 'd1' }, old: {} });
      await Promise.resolve();
    });

    await waitFor(() => expect(mockGetTrips.mock.calls.length).toBeGreaterThan(initialTripsCalls));
  });
});
