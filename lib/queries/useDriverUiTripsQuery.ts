/**
 * Shared driver-app trip list (getDriverUiTripsByDriverIds).
 * Home and DriverTripOpsProvider must use this key so identical inputs share one request.
 *
 * Poll while the app is active so a fresh dispatcher assignment reaches the
 * accept popup without waiting for a manual refresh.
 */
import { hasIncomingAssignableTrips } from '@/features/driver/utils/driverIncomingAssignment.util';
import { driverDashboardOpenTripQuery } from '@/features/trips/domain/driverDashboardTripList';
import type { TripRow } from '@/features/trips/services/trips.service';
import * as tripsService from '@/features/trips/services/trips.service';
import { useAppStateIsActive } from '@/lib/hooks/useAppStateIsActive';
import { useDriverHomeDriversQuery } from '@/lib/queries/useDriverHomeDriversQuery';
import { queryKeys } from '@/lib/queryKeys';
import {
  infrastructureRetryDelay,
  infrastructureShouldRetry,
} from '@/lib/queryRetry';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

const STALE_MS = 15_000;
const GC_MS = 5 * 60_000;
const EMPTY_TRIPS: TripRow[] = [];
const POLL_WITH_INCOMING_MS = 15_000;
const POLL_IDLE_MS = 45_000;

export function driverUiTripsQueryKey(userId: string, driverIdsKey = '') {
  return queryKeys.driverApp.uiTrips(userId, driverIdsKey);
}

export function useDriverUiTripsQuery(userId: string | null, enabled = true) {
  const uid = userId ?? '';
  const appActive = useAppStateIsActive();
  const linked = useDriverHomeDriversQuery(userId);
  const driverIds = useMemo(
    () => linked.activeLinkedDrivers.map((d) => d.id),
    [linked.activeLinkedDrivers],
  );

  const query = useQuery({
    queryKey: driverUiTripsQueryKey(uid, linked.driverIdsKey),
    queryFn: async ({ signal }) => {
      if (driverIds.length === 0) return [] as TripRow[];
      const knownOrganizationIds = linked.activeLinkedDrivers.every((driver) =>
        String(driver.organization_id ?? '').trim(),
      )
        ? linked.activeLinkedDrivers.map((driver) => driver.organization_id)
        : undefined;
      const res = await tripsService.getDriverUiTripsByDriverIds(driverIds, {
        ...driverDashboardOpenTripQuery(knownOrganizationIds),
        signal,
      });
      if (signal.aborted) {
        const aborted = new Error('Aborted');
        aborted.name = 'AbortError';
        throw aborted;
      }
      if (res.error) throw res.error;
      return res.trips ?? [];
    },
    enabled: enabled && !!uid && linked.isFetched && driverIds.length > 0,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: infrastructureShouldRetry,
    retryDelay: infrastructureRetryDelay,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (q) => {
      if (!appActive) return false;
      if (q.state.status === 'error') return false;
      return hasIncomingAssignableTrips(q.state.data)
        ? POLL_WITH_INCOMING_MS
        : POLL_IDLE_MS;
    },
  });

  const noLinkedDrivers = linked.isFetched && driverIds.length === 0;

  return {
    ...query,
    trips: noLinkedDrivers ? EMPTY_TRIPS : (query.data ?? EMPTY_TRIPS),
    driverIdsKey: linked.driverIdsKey,
    linkedFetched: linked.isFetched,
    hasLinkedDrivers: driverIds.length > 0,
  };
}

export function useInvalidateDriverUiTrips() {
  const qc = useQueryClient();
  return (userId: string) => {
    void qc.invalidateQueries({ queryKey: driverUiTripsQueryKey(userId) });
  };
}
