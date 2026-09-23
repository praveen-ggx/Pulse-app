/**
 * Warm Finance tab: lazy route chunk + critical TanStack queries (trips + ledger).
 * Call on tab press/hover or idle when the user is likely to open Fiscal.
 *
 * IMPORTANT: This module is statically imported from `app/_layout.tsx`.
 * It MUST NOT statically import any feature service / component or it will
 * drag that feature into the startup chunk. All feature imports inside this
 * file are lazy (`await import(...)`).
 */
import { preloadTabScreen } from '@/lib/preloadTabChunks';
import { queryKeys } from '@/lib/queryKeys';
export { scheduleIdleWork } from '@/lib/scheduleIdleWork';
import type { QueryClient } from '@tanstack/react-query';

export function preloadFinanceRouteChunk(): void {
  preloadTabScreen('finance');
}

/** Prefetch trips + ledger so phase-2 splash clears faster after the chunk loads.
 * Trips use the same query key as useTripsQuery so TanStack dedupes in-flight / cached fetches.
 */
export function prefetchFinanceQueries(
  queryClient: QueryClient,
  orgId: string,
): void {
  void queryClient.prefetchQuery({
    queryKey: queryKeys.trips.finite(orgId),
    queryFn: async () => {
      const { getTripsForOrg } = await import(
        "@/features/trips/services/trips.service"
      );
      const res = await getTripsForOrg(orgId);
      if (res.error) throw res.error;
      return res.trips;
    },
  });

  void queryClient.prefetchQuery({
    queryKey: queryKeys.transactions.finite(orgId),
    queryFn: async () => {
      const { getTransactionsByOrganization } = await import(
        '@/features/finance/services/finance.service'
      );
      const res = await getTransactionsByOrganization(orgId);
      if (res.error) throw res.error;
      return res.transactions;
    },
  });
}

export function preloadFinanceWarmup(
  queryClient: QueryClient,
  orgId: string,
): void {
  preloadFinanceRouteChunk();
  prefetchFinanceQueries(queryClient, orgId);
}
