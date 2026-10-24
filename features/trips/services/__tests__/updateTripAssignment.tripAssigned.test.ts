import { updateTripAssignment } from '../trips.service';
import { TRIP_REASSIGN_STALE_ERROR } from '@/features/trips/utils/tripReassignConflict.util';

const mockFrom = jest.fn();
const mockPublish = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ from: mockFrom }),
}));

jest.mock('@/lib/platform/events/InProcessEventBus', () => ({
  getPlatformEventBus: () => ({ publish: mockPublish }),
}));

const trip = {
  id: 'trip-1',
  organization_id: 'org-1',
  indent_id: 'indent-1',
  driver_id: 'driver-1',
  vehicle_id: null,
  status: 'assigned',
  completed_at: null,
  started_at: null,
};

/**
 * Thenable query builder — every chain method returns the same builder, and the
 * builder itself resolves like a promise (`await q` after any number of chained
 * calls, matching how getDriverOngoingTrip/getVehicleOngoingTrip call `.neq()`
 * *after* `.limit()` and then await the whole chain).
 */
function awaitable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    not: jest.fn(() => builder),
    neq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (v: typeof result) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function updateBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    update: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    select: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateTripAssignment — TripAssigned event', () => {
  it('publishes exactly one TripAssigned event on a successful driver assignment', async () => {
    mockFrom
      .mockReturnValueOnce(awaitable({ data: trip, error: null })) // trip gate select
      .mockReturnValueOnce(awaitable({ data: [], error: null })) // getDriverOngoingTrip — no conflict
      .mockReturnValueOnce(updateBuilder({ data: trip, error: null })); // the commit

    const { error, trip: result } = await updateTripAssignment('trip-1', { driver_id: 'driver-1' });

    expect(error).toBeNull();
    expect(result).not.toBeNull();
    expect(mockPublish).toHaveBeenCalledTimes(1);
    const published = mockPublish.mock.calls[0][0];
    expect(published.name).toBe('TripAssigned');
    expect(published.workspaceId).toBe('org-1');
    expect(published.payload).toEqual({
      tripId: 'trip-1',
      indentId: 'indent-1',
      driverId: 'driver-1',
      vehicleId: null,
    });
    expect(typeof published.correlationId).toBe('string');
    expect(published.correlationId.length).toBeGreaterThan(0);
  });

  it('does not publish when the commit fails (e.g. driver already on an ongoing trip)', async () => {
    mockFrom
      .mockReturnValueOnce(awaitable({ data: trip, error: null })) // trip gate select
      .mockReturnValueOnce(
        awaitable({
          data: [{ id: 'other-trip', trip_number: 'T2', trip_code: null, status: 'in_transit', started_at: null }],
          error: null,
        }),
      ); // getDriverOngoingTrip — conflict found

    const { error, trip: result } = await updateTripAssignment('trip-1', { driver_id: 'driver-1' });

    expect(error).not.toBeNull();
    expect(result).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish when a stale-expectedUpdatedAt retry is rejected (idempotent retry)', async () => {
    mockFrom
      .mockReturnValueOnce(awaitable({ data: trip, error: null })) // trip gate select
      .mockReturnValueOnce(awaitable({ data: [], error: null })) // getDriverOngoingTrip — no conflict
      .mockReturnValueOnce(updateBuilder({ data: null, error: null })); // stale optimistic-concurrency check: no row matched

    const { error, trip: result } = await updateTripAssignment(
      'trip-1',
      { driver_id: 'driver-1' },
      { expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
    );

    expect(error?.message).toBe(TRIP_REASSIGN_STALE_ERROR);
    expect(result).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('persists a trip-local driver_display_name without changing driver_id', async () => {
    const update = updateBuilder({
      data: { ...trip, driver_display_name: 'On this trip' },
      error: null,
    });
    mockFrom
      .mockReturnValueOnce(awaitable({ data: trip, error: null }))
      .mockReturnValueOnce(update);

    const { error, trip: result } = await updateTripAssignment('trip-1', {
      driver_display_name: 'On this trip',
    });

    expect(error).toBeNull();
    expect(result?.driver_display_name).toBe('On this trip');
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ driver_display_name: 'On this trip' }),
    );
    expect(update.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ driver_id: expect.anything() }),
    );
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish for a vehicle-only update with no driver_id', async () => {
    mockFrom
      .mockReturnValueOnce(awaitable({ data: trip, error: null })) // trip gate select
      .mockReturnValueOnce(awaitable({ data: [], error: null })) // getVehicleOngoingTrip — no conflict
      .mockReturnValueOnce(updateBuilder({ data: { ...trip, vehicle_id: 'veh-1' }, error: null }));

    await updateTripAssignment('trip-1', { vehicle_id: 'veh-1' });

    expect(mockPublish).not.toHaveBeenCalled();
  });
});
