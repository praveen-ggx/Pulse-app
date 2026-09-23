/**
 * Covers Commit 3: DriverProfileScreen's trips realtime subscription must be scoped
 * to this signed-in user's own driver_id(s) via a per-user registry key, instead of
 * the old unfiltered table-wide subscription shared by every driver on the platform.
 *
 * Full-mount test (this screen has no extracted/shared hook to unit-test in isolation —
 * deliberately, per scope) — heavy dependency surface is mocked following this repo's
 * existing pattern in app/__tests__/sign-in.test.tsx.
 */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DriverProfileScreen from '../DriverProfileScreen';
import { useAuth } from '@/contexts/AuthContext';
import * as driversService from '@/features/drivers/services/drivers.service';
import * as tripsService from '@/features/trips/services/trips.service';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';

// Required in this project's Jest setup for any test that renders RN host components —
// without it, RNTL's own host-component-name detection fails before anything mounts
// (see app/__tests__/sign-in.test.tsx for the same pattern).
jest.mock('react-native', () => jest.requireActual('react-native'));

jest.mock('@/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ locale: 'en', localeOptions: [{ value: 'en', label: 'English' }] }),
}));
jest.mock('@/contexts/DriverAvatarContext', () => ({
  useDriverAvatar: () => ({ avatarSeed: null, setAvatarSeed: jest.fn(), setPreviewUri: jest.fn() }),
}));
jest.mock('@/contexts/DriverThemeContext', () => ({
  useDriverTheme: () => ({ theme: 'light' }),
  // Proxy: any color property this screen reads resolves to a harmless string.
  useDriverThemeColors: () => new Proxy({}, { get: () => '#000000' }),
}));
jest.mock('@/lib/useAvatar', () => ({
  useAvatar: () => ({ imageSource: null, initials: 'P', initialsColor: '#000000' }),
}));
jest.mock('@/features/auth/components/EditProfileModal', () => ({
  EditProfileModal: () => null,
}));
// Rendered by the screen; unmocked it resolves to undefined and React throws
// "Element type is invalid" before any subscription effect runs.
jest.mock('@/features/experience/components/MilestoneHowToModal', () => ({
  MilestoneHowToModal: () => null,
}));
jest.mock('@/lib/queries/useDcoStatusQuery', () => ({
  useDcoStatusQuery: () => ({ data: null, isLoading: false }),
}));
jest.mock('@/lib/queries/useDriverFleetOwnerQuery', () => ({
  useDriverFleetOwnerQuery: () => ({ isFleetOwner: false }),
}));
jest.mock('@/features/vehicles/services/vehicles.service', () => ({
  getVehicleById: jest.fn(() => Promise.resolve({ error: null, vehicle: null })),
}));
jest.mock('@/features/ratings/services/ratings.service', () => ({
  getRatingsForDriver: jest.fn(() => Promise.resolve({ error: null, ratings: [] })),
  averageScore: jest.fn(() => 0),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: () => {
      const resolved = { data: null, error: null, count: 0 };
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
        builder[m] = jest.fn(() => builder);
      }
      builder.maybeSingle = jest.fn(() => Promise.resolve(resolved));
      builder.then = (resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolved).then(resolve);
      return builder;
    },
  }),
}));

jest.mock('@/lib/realtimeRegistry', () => ({
  subscribeSharedPostgresChanges: jest.fn(),
}));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@react-navigation/native', () => ({ useFocusEffect: jest.fn() }));
// Proxy instead of a hand-maintained list: any icon the screen imports resolves
// to a harmless host component. A literal map silently returns undefined for a
// newly-added icon, which React then rejects with "Element type is invalid" —
// that is what previously broke this suite when `Gavel` was added to the screen.
jest.mock('lucide-react-native', () => new Proxy({}, {
  get: (_t, prop) => (prop === '__esModule' ? false : 'Icon'),
}));

jest.mock('@/features/drivers/services/drivers.service', () => ({
  getLinkedDriversForCurrentUser: jest.fn(),
}));
jest.mock('@/features/trips/services/trips.service', () => ({
  getDriverUiTripsByDriverIds: jest.fn(() => Promise.resolve({ error: null, trips: [] })),
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

/**
 * The screen (via useDriverDcoProfile) calls useQuery, so it needs a
 * QueryClientProvider — without one React Query throws "No QueryClient set"
 * during render and none of the subscription assertions below are ever reached.
 * Retries are off so a failing queryFn surfaces immediately instead of backing off.
 */
function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<DriverProfileScreen />, { wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({
    user: { email: 'driver@example.com' },
    profile: { uid: 'user-1', full_name: 'Test Driver' },
    signOut: jest.fn(),
    refreshSession: jest.fn(),
    patchProfile: jest.fn(),
  });
  mockGetTrips.mockResolvedValue({ error: null, trips: [] });
  mockSubscribe.mockReturnValue(jest.fn()); // each call returns its own unsubscribe fn
});

describe('DriverProfileScreen trips realtime subscription', () => {
  it('does not subscribe until driver IDs have resolved', async () => {
    const gate = deferred<{ error: null; drivers: unknown[] }>();
    mockGetLinkedDrivers.mockReturnValueOnce(gate.promise);

    renderScreen();
    await act(async () => { await Promise.resolve(); });

    expect(mockSubscribe).not.toHaveBeenCalled();

    await act(async () => {
      gate.resolve({ error: null, drivers: [driverRow('d1', 'org-1')] });
      await gate.promise;
    });

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
  });

  it('uses a user-specific registry key and a driver_id=in.(...) filter', async () => {
    mockGetLinkedDrivers.mockResolvedValue({ error: null, drivers: [driverRow('d1', 'org-1')] });

    renderScreen();

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
      drivers: [driverRow('d1', 'org-1'), driverRow('d2', 'org-2'), driverRow('d3', 'org-3')],
    });

    renderScreen();

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
    const [, specs] = mockSubscribe.mock.calls[0];
    expect(specs[0].filter).toBe('driver_id=in.(d1,d2,d3)');
  });

  it('re-subscribes (and cleans up the previous subscription) when the driver ID set changes', async () => {
    mockGetLinkedDrivers.mockResolvedValueOnce({ error: null, drivers: [driverRow('d1', 'org-1')] });
    const unsubFirst = jest.fn();
    mockSubscribe.mockReturnValueOnce(unsubFirst);

    const { rerender } = renderScreen();
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
    expect(mockSubscribe.mock.calls[0][1][0].filter).toBe('driver_id=in.(d1)');
    expect(unsubFirst).not.toHaveBeenCalled();

    // A different signed-in user (e.g. account switch) resolves a different driver set.
    mockGetLinkedDrivers.mockResolvedValueOnce({
      error: null,
      drivers: [driverRow('d1', 'org-1'), driverRow('d2', 'org-2')],
    });
    (useAuth as jest.Mock).mockReturnValue({
      user: { email: 'driver2@example.com' },
      profile: { uid: 'user-2', full_name: 'Second Driver' },
      signOut: jest.fn(),
      refreshSession: jest.fn(),
      patchProfile: jest.fn(),
    });
    rerender(<DriverProfileScreen />);

    // profile.uid changes synchronously (re-firing the effect immediately with the still-
    // stale driverIds from user-1), then driverIds itself updates once the async
    // getLinkedDriversForCurrentUser('user-2') call resolves, firing it again — so this
    // settles over 2+ calls, not necessarily exactly 2. Wait for the final, correct state.
    await waitFor(() => {
      const last = mockSubscribe.mock.calls.at(-1);
      expect(last?.[0]).toBe('driver-app:trips:driver:user-2');
      expect(last?.[1][0].filter).toBe('driver_id=in.(d1,d2)');
    });
    expect(mockSubscribe.mock.calls.length).toBeGreaterThan(1); // re-subscription did occur
    expect(unsubFirst).toHaveBeenCalled(); // user-1's channel was torn down
  });

  it('unmount tears down the active subscription', async () => {
    mockGetLinkedDrivers.mockResolvedValue({ error: null, drivers: [driverRow('d1', 'org-1')] });
    const unsub = jest.fn();
    mockSubscribe.mockReturnValueOnce(unsub);

    const { unmount } = renderScreen();
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));

    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('the subscription callback still triggers the existing loadTrips() refetch behaviour', async () => {
    mockGetLinkedDrivers.mockResolvedValue({ error: null, drivers: [driverRow('d1', 'org-1')] });

    renderScreen();
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
