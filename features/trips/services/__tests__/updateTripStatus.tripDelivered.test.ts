import { updateTripStatus } from '../trips.service';

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
  vehicle_id: 'veh-1',
  status: 'completed',
  started_at: '2026-07-10T08:00:00.000Z',
  completed_at: '2026-07-10T12:00:00.000Z',
};

// No source/supplier_id set — validateSupplierLinkForCompletion's internal `trips` select
// (the first call for any COMPLETED_STATUS_SET transition) short-circuits to { error: null }
// without querying suppliers/transactions.
const supplierLinkGateRow = { id: 'trip-1', source: null, supplier_id: null };

function awaitable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
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

describe('updateTripStatus — TripDelivered event', () => {
  it('publishes exactly one TripDelivered event on first completion', async () => {
    mockFrom
      .mockReturnValueOnce(awaitable({ data: supplierLinkGateRow, error: null })) // validateSupplierLinkForCompletion gate
      .mockReturnValueOnce(awaitable({ data: { status: 'in_transit', completed_at: null }, error: null })) // wasAlreadyCompleted before-fetch
      .mockReturnValueOnce(updateBuilder({ data: trip, error: null })) // the commit
      .mockReturnValueOnce(awaitable({ data: [], error: null })); // ensureAssetCompletionAutoEntries's existing-entries check

    const { error, trip: result } = await updateTripStatus('trip-1', {
      status: 'completed',
      completed_at: '2026-07-10T12:00:00.000Z',
    });

    expect(error).toBeNull();
    expect(result).not.toBeNull();
    expect(mockPublish).toHaveBeenCalledTimes(1);
    const published = mockPublish.mock.calls[0][0];
    expect(published.name).toBe('TripDelivered');
    expect(published.workspaceId).toBe('org-1');
    expect(published.payload).toEqual({
      tripId: 'trip-1',
      indentId: 'indent-1',
      driverId: 'driver-1',
      vehicleId: 'veh-1',
      deliveredAt: '2026-07-10T12:00:00.000Z',
    });
    expect(typeof published.correlationId).toBe('string');
    expect(published.correlationId.length).toBeGreaterThan(0);
  });

  it('does not publish for a non-completion status update', async () => {
    // `in_transit` is a MOVING_STATUS, so updateTripStatus first reads started_at
    // to backfill it when the caller omits it — that read consumes a `.from()`
    // before the update does. Queue both, in order.
    mockFrom
      .mockReturnValueOnce(awaitable({ data: { started_at: '2026-07-10T10:00:00.000Z' }, error: null }))
      .mockReturnValueOnce(
        updateBuilder({ data: { ...trip, status: 'in_transit', completed_at: null }, error: null }),
      );

    await updateTripStatus('trip-1', { status: 'in_transit' });

    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish on a retry where the trip was already completed (idempotent retry)', async () => {
    mockFrom
      .mockReturnValueOnce(awaitable({ data: supplierLinkGateRow, error: null })) // validateSupplierLinkForCompletion gate
      .mockReturnValueOnce(
        awaitable({ data: { status: 'completed', completed_at: trip.completed_at }, error: null }),
      ) // wasAlreadyCompleted before-fetch: already completed
      .mockReturnValueOnce(updateBuilder({ data: trip, error: null })); // the commit

    const { error, trip: result } = await updateTripStatus('trip-1', {
      status: 'completed',
      completed_at: trip.completed_at,
    });

    expect(error).toBeNull();
    expect(result).not.toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish when the commit fails', async () => {
    mockFrom
      .mockReturnValueOnce(awaitable({ data: supplierLinkGateRow, error: null }))
      .mockReturnValueOnce(awaitable({ data: { status: 'in_transit', completed_at: null }, error: null }))
      .mockReturnValueOnce(updateBuilder({ data: null, error: { message: 'db error' } }));

    const { error, trip: result } = await updateTripStatus('trip-1', {
      status: 'completed',
      completed_at: '2026-07-10T12:00:00.000Z',
    });

    expect(error).not.toBeNull();
    expect(result).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not publish when supplier-link validation blocks completion', async () => {
    // validateSupplierLinkForCompletion blocks on an AGGREGATE trip with no
    // supplier: trip_payout_mode 'market' sets requiresSupplierLink, and
    // supplier_id is empty. (`source: 'direct_quote'` alone no longer blocks —
    // that guard was deliberately relaxed so asset trips won via direct quote,
    // which legitimately have no supplier, can still be completed.)
    mockFrom.mockReturnValueOnce(
      awaitable({
        data: {
          id: 'trip-1',
          source: 'indent',
          supplier_id: null,
          trip_payout_mode: 'market',
          driver_id: null,
          vehicle_id: null,
        },
        error: null,
      }),
    );

    const { error, trip: result } = await updateTripStatus('trip-1', {
      status: 'completed',
      completed_at: '2026-07-10T12:00:00.000Z',
    });

    expect(error).not.toBeNull();
    expect(result).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
