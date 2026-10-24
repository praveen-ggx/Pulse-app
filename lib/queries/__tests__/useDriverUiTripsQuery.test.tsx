import React from 'react';
import { useDriverUiTripsQuery } from '@/lib/queries/useDriverUiTripsQuery';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';

jest.mock('react-native', () => jest.requireActual('react-native'));

const mockGetTrips = jest.fn();

jest.mock('@/features/trips/services/trips.service', () => ({
  getDriverUiTripsByDriverIds: (...args: unknown[]) => mockGetTrips(...args),
}));

jest.mock('@/lib/queries/useDriverHomeDriversQuery', () => ({
  useDriverHomeDriversQuery: () => ({
    isFetched: true,
    activeLinkedDrivers: [{ id: 'drv-1' }, { id: 'drv-2' }],
    driverIdsKey: 'drv-1,drv-2',
  }),
}));

function DualConsumers() {
  useDriverUiTripsQuery('user-1');
  useDriverUiTripsQuery('user-1');
  return null;
}

describe('useDriverUiTripsQuery', () => {
  beforeEach(() => {
    mockGetTrips.mockReset();
    mockGetTrips.mockResolvedValue({ error: null, trips: [{ id: 'trip-1' }] });
  });

  it('two consumers with the same user and driver set issue one fetch', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <DualConsumers />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(mockGetTrips).toHaveBeenCalledTimes(1));
    expect(mockGetTrips).toHaveBeenCalledWith(
      ['drv-1', 'drv-2'],
      expect.objectContaining({
        limit: 80,
        offset: 0,
        exactLimit: true,
        preferStarted: true,
        excludeStatuses: expect.arrayContaining(['completed', 'cancelled', 'delivered']),
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
