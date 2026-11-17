/**
 * On-demand route warm-up only. Do NOT fire many dynamic imports at once —
 * each tab/stack screen is ~3k modules and parallel preloads OOM Metro in dev.
 */
import { preloadChatRoute } from '@/lib/preloadChatWarmup';
import { preloadFinanceWarmup } from '@/lib/preloadFinanceWarmup';
import {
  preloadPulseLoadsChunk,
  preloadTabScreen,
} from '@/lib/preloadTabChunks';
import { scheduleIdleWork } from '@/lib/scheduleIdleWork';
import { STALE } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import type { QueryClient } from '@tanstack/react-query';

export type { PreloadableTab } from '@/lib/preloadTabChunks';
export { preloadTabScreen } from '@/lib/preloadTabChunks';

/** Map bookmarkable tab routes to lazy chunk preload keys. */
export function preloadTabForRoute(route: string, orgId?: string | null): void {
  if (route === '/(tabs)/finance') preloadTabScreen('finance');
  else if (route === '/(tabs)/trips') {
    preloadTabScreen('trips');
    preloadChatRoute(orgId, { bootstrap: false });
  } else if (route === '/(tabs)/network' || route.includes('/network/hub')) {
    preloadTabScreen('network');
    preloadChatRoute(orgId, { bootstrap: false });
  }
}

/**
 * After auth boot, warm the fiscal chunk (and last visited tab) during idle time.
 * Never preloads all tabs — avoids Metro OOM in dev.
 */
export function scheduleDispatcherTabPreloads(
  lastTabRoute?: string,
  opts?: {
    queryClient?: QueryClient;
    orgId?: string | null;
    /**
     * Warm the finance data set (trips + transactions RPCs). Default false:
     * sign-in must not fire get_trips_for_org + transactions.select(*) in
     * parallel with Auth (2026-09-22). Pass true only from an explicit Fiscal tap.
     */
    warmFinanceData?: boolean;
  },
): void {
  const run = () => {
    // Idle preloads of large lazy chunks race with Fast Refresh in dev and
    // surface as "Requiring unknown module NNNN" on the next navigation.
    const orgId = opts?.orgId ?? null;
    const warmFinanceData = opts?.warmFinanceData ?? false;
    if (__DEV__) {
      if (lastTabRoute) preloadTabForRoute(lastTabRoute, orgId);
      return;
    }
    if (warmFinanceData) {
      if (opts?.queryClient && orgId) {
        preloadFinanceWarmup(opts.queryClient, orgId);
      } else {
        preloadTabScreen('finance');
      }
    }
    if (lastTabRoute) preloadTabForRoute(lastTabRoute, orgId);
  };
  scheduleIdleWork(run);
}

export function preloadPulseLoadsRoute(): void {
  preloadPulseLoadsChunk();
}

/** Compliance catalog, started on press so the queue can paint from cache. */
export function preloadComplianceData(queryClient: QueryClient, orgId: string): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.trips.compliance(orgId),
    staleTime: STALE.realtime,
    queryFn: async () => {
      const { getTripsForOrg } = await import('@/features/trips/services/trips.service');
      const res = await getTripsForOrg(orgId, { includeComplianceBacklog: true });
      if (res.error) throw res.error;
      return res.trips;
    },
  });
}

/** Invoice desk trips, same key as useInvoicingExecuteTripsQuery. */
export function preloadInvoiceData(queryClient: QueryClient, orgId: string): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.invoicing.trips(orgId),
    staleTime: 300_000,
    queryFn: async () => {
      const { fetchInvoicingTrips } = await import(
        '@/features/invoicing/services/invoicing.service'
      );
      const { error, trips } = await fetchInvoicingTrips(orgId);
      if (error) throw error;
      return trips;
    },
  });
}

/** Marketplace lane list and this org's bids, same keys as Find Loads. */
export function preloadMarketplaceData(queryClient: QueryClient, orgId: string): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.findLoadsForOrg.searchLanes(orgId),
    staleTime: STALE.moderate,
    queryFn: async () => {
      const { listMarketplaceSearchLanes } = await import(
        '@/features/network/services/findLoadsForOrg.service'
      );
      const { error, lanes } = await listMarketplaceSearchLanes(orgId);
      if (error && lanes.length === 0) throw error;
      return lanes;
    },
  });
  void queryClient.prefetchQuery({
    queryKey: queryKeys.findLoadsForOrg.myBids(orgId),
    staleTime: STALE.frequent,
    queryFn: async () => {
      const { listMyOrgMarketBids } = await import(
        '@/features/network/services/findLoadsForOrg.service'
      );
      return listMyOrgMarketBids(orgId);
    },
  });
}

/** @deprecated Bulk preload caused Metro heap OOM; use {@link preloadTabScreen} or navigate. */
export function preloadTabsScreens(): void {
  // Intentionally empty — kept so older call sites do not break.
}

/** @deprecated Bulk preload caused Metro heap OOM. */
export function preloadDispatcherStackRoutes(): void {
  // Intentionally empty.
}

/** @deprecated Bulk preload caused Metro heap OOM. */
export function preloadDispatcherNavigationGraph(): void {
  // Intentionally empty.
}

/**
 * Reserved for future route warm-up. Intentionally a no-op: a direct
 * `import(TripDetailScreen)` duplicates the lazy route in `app/trip/[id]/index.tsx`
 * and breaks Metro HMR ("unknown module" / importedAll errors in dev).
 */
export function preloadTripDetailScreen(_tripId?: string): void {
  // Navigation loads the screen via expo-router + React.lazy on the route module.
}
