/**
 * TanStack Query hooks for trips. Cached by orgId; Realtime invalidates on DB change.
 * See docs/PAGINATION_AND_CACHE_ANALYSIS.md.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTripsByOrganization,
  getTripsForOrg,
  getTripPartyCountsForOrg,
  getOrgTripCounts,
  getOrgHubMetrics,
  getOrgHubCountSource,
  getShipperDisplayNamesForSupplierTrips,
  updateTripStatus,
  type TripRow,
  type TripPartyCounts,
  type OrgTripCounts,
} from '@/features/trips/services/trips.service';
import type { OrgHubCountSource } from '@/features/trips/utils/hubExactCounts.util';
import {
  hubMetricsForExactRail,
  type OrgHubMetrics,
} from '@/features/trips/utils/orgHubMetrics.util';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { isStartupComplete, markStartupPhase } from '@/lib/startupMetrics';
import { useAuth } from '@/contexts/AuthContext';
import { useAppQueryGate } from '@/lib/hooks/useAppQueryGate';

/** Full list (no pagination). Use for Trips tab. Includes trips where org is owner or supplier on a shared load trip. */
export function useTripsQuery(orgId: string | null) {
  const { status } = useAuth();
  const bootQuietOpen = useAppQueryGate(orgId);
  return useQuery<TripRow[], Error>({
    queryKey: queryKeys.trips.finite(orgId ?? ''),
    queryFn: async () => {
      const res = await getTripsForOrg(orgId!);
      if (res.error) throw res.error;
      if (!isStartupComplete()) markStartupPhase('trips_query_done');
      return res.trips;
    },
    enabled: !!orgId && status !== 'restoring' && bootQuietOpen,
    staleTime: STALE.realtime,
    refetchOnMount: refetchOnMountIfEntityListEmpty<TripRow[]>(),
  });
}

/**
 * Compliance queue catalog: same rows as useTripsQuery plus older trips still open in
 * the Compliance workflow, which the newest-400 list would drop. Lives under the trips
 * key prefix so trip realtime invalidation refreshes it too.
 */
export function useComplianceTripCatalogQuery(orgId: string | null) {
  const { status } = useAuth();
  const bootQuietOpen = useAppQueryGate(orgId);
  return useQuery<TripRow[], Error>({
    queryKey: queryKeys.trips.compliance(orgId ?? ''),
    queryFn: async () => {
      const res = await getTripsForOrg(orgId!, { includeComplianceBacklog: true });
      if (res.error) throw res.error;
      return res.trips;
    },
    enabled: !!orgId && status !== 'restoring' && bootQuietOpen,
    staleTime: STALE.realtime,
    refetchOnMount: refetchOnMountIfEntityListEmpty<TripRow[]>(),
  });
}

/** Exact owned-trip totals for profile / hub tiles — not the newest-400 catalog. */
export function useOrgTripCountsQuery(orgId: string | null) {
  const { status } = useAuth();
  const bootQuietOpen = useAppQueryGate(orgId);
  return useQuery<OrgTripCounts, Error>({
    queryKey: queryKeys.trips.orgCounts(orgId ?? ''),
    queryFn: async () => {
      const res = await getOrgTripCounts(orgId!);
      if (res.error) throw res.error;
      return res.counts;
    },
    enabled: !!orgId && status !== 'restoring' && bootQuietOpen,
    staleTime: STALE.moderate,
  });
}

/** Exact hub rail / Failed / profile counts — never a paginated catalog. */
export function useOrgHubMetricsQuery(orgId: string | null) {
  const { status } = useAuth();
  const bootQuietOpen = useAppQueryGate(orgId);
  return useQuery<OrgHubMetrics | null, Error>({
    queryKey: queryKeys.trips.hubCounts(orgId ?? ''),
    queryFn: async () => {
      const res = await getOrgHubMetrics(orgId!);
      if (res.error) throw res.error;
      return hubMetricsForExactRail(res);
    },
    enabled: !!orgId && status !== 'restoring' && bootQuietOpen,
    staleTime: STALE.moderate,
  });
}

/** Every owned trip/indent fact for hub rail counts — not the newest-400 catalog. */
export function useOrgHubCountSourceQuery(orgId: string | null) {
  const { status } = useAuth();
  const bootQuietOpen = useAppQueryGate(orgId);
  return useQuery<OrgHubCountSource, Error>({
    queryKey: queryKeys.trips.hubCountSource(orgId ?? ''),
    queryFn: async () => {
      const res = await getOrgHubCountSource(orgId!);
      if (res.error) throw res.error;
      return res.source;
    },
    enabled: !!orgId && status !== 'restoring' && bootQuietOpen,
    staleTime: STALE.moderate,
  });
}

/** Per-party trip counts for Network cards — not the full trip catalog. */
export function useTripPartyCountsQuery(orgId: string | null) {
  const { status } = useAuth();
  const bootQuietOpen = useAppQueryGate(orgId);
  return useQuery<TripPartyCounts, Error>({
    queryKey: queryKeys.trips.partyCounts(orgId ?? ''),
    queryFn: async () => {
      const res = await getTripPartyCountsForOrg(orgId!);
      if (res.error) throw res.error;
      return res.counts;
    },
    enabled: !!orgId && status !== 'restoring' && bootQuietOpen,
    staleTime: STALE.moderate,
  });
}

/** Map trip_id -> shipper display name for trips where current org is the supplier (Trips Control: show "Mukunt" not "Mukunt's client"). */
export function useShipperDisplayNamesQuery(orgId: string | null) {
  const { status } = useAuth();
  return useQuery({
    queryKey: queryKeys.trips.shipperNamesForSupplier(orgId ?? ''),
    queryFn: async () => {
      const res = await getShipperDisplayNamesForSupplierTrips(orgId!);
      if (res.error) throw res.error;
      return res.shipperNameByTripId;
    },
    enabled: !!orgId && status === 'authenticated',
    staleTime: STALE.moderate,
  });
}

/** Infinite list: first page on mount, load more on fetchNextPage. */
export function useTripsInfiniteQuery(orgId: string | null, opts?: { pageSize?: number }) {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: queryKeys.trips.infinite(orgId ?? '', pageSize),
    queryFn: async ({ pageParam = 0 }) => {
      const res = await getTripsByOrganization(orgId!, { limit: pageSize, offset: pageParam });
      if (res.error) throw res.error;
      return { trips: res.trips, hasMore: res.hasMore ?? false, nextOffset: pageParam + pageSize };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    initialPageParam: 0,
    enabled: !!orgId,
    staleTime: STALE.realtime,
  });
}

export function useTripDetailQuery(tripId: string | null) {
  return useQuery({
    queryKey: queryKeys.trips.detail(tripId ?? ''),
    queryFn: async () => {
      const { getTripById } = await import('@/features/trips/services/trips.service');
      const res = await getTripById(tripId!);
      if (res.error) throw res.error;
      return res.trip;
    },
    enabled: !!tripId,
    staleTime: STALE.realtime,
  });
}

/**
 * Optimistic trip status mutation.
 * Instantly updates the detail + list caches; rolls back on error.
 */
export function useTripStatusMutation(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, data }: { tripId: string; data: import('@/features/trips/services/trips.service').UpdateTripStatusData }) => {
      const res = await updateTripStatus(tripId, data);
      if (res.error) throw res.error;
      return res.trip;
    },
    onMutate: async ({ tripId, data }) => {
      await qc.cancelQueries({ queryKey: queryKeys.trips.detail(tripId) });
      if (orgId) await qc.cancelQueries({ queryKey: queryKeys.trips.finite(orgId) });

      const prevDetail = qc.getQueryData(queryKeys.trips.detail(tripId));
      const prevList = orgId ? qc.getQueryData(queryKeys.trips.finite(orgId)) : undefined;

      // Optimistically update detail cache
      qc.setQueryData(queryKeys.trips.detail(tripId), (old: Record<string, unknown> | undefined) =>
        old ? { ...old, ...data } : old,
      );

      // Optimistically update list cache
      if (orgId) {
        qc.setQueriesData(
            { queryKey: queryKeys.trips.finite(orgId) },
          (old: unknown) => {
            if (!Array.isArray(old)) return old;
            return old.map((t: { id: string }) => (t.id === tripId ? { ...t, ...data } : t));
          },
        );
      }

      return { prevDetail, prevList, tripId, orgId };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.prevDetail !== undefined) {
        qc.setQueryData(queryKeys.trips.detail(ctx.tripId), ctx.prevDetail);
      }
      if (ctx.orgId && ctx.prevList !== undefined) {
        qc.setQueryData(queryKeys.trips.finite(ctx.orgId), ctx.prevList);
      }
    },
    onSettled: (_data, _err, { tripId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
      if (orgId) qc.invalidateQueries({ queryKey: queryKeys.trips.finite(orgId) });
      qc.invalidateQueries({ queryKey: queryKeys.trips.assignmentAuditRoot });
      qc.invalidateQueries({
        queryKey: ["q", "trips", "assignment-audit-history", tripId],
      });
    },
  });
}

/** Full assignment/reassignment history for one trip (Pulse chat timeline). */
export function useTripAssignmentAuditHistoryQuery(tripId: string | null) {
  return useQuery({
    queryKey: ["q", "trips", "assignment-audit-history", tripId ?? ""],
    queryFn: async () => {
      const { getTripAssignmentAuditHistory } = await import(
        "@/features/trips/services/trip-assignment-audit.service"
      );
      const res = await getTripAssignmentAuditHistory(tripId!, 30);
      if (res.error) throw res.error;
      return res.rows;
    },
    enabled: Boolean(tripId?.trim()),
    staleTime: 60_000,
  });
}

/** Assignment audit for given trip ids (Private vs Shared). */
export function useAssignmentAuditQuery(tripIds: string[]) {
  const sorted = [...tripIds].sort();
  const key = sorted.join(',');
  return useQuery({
    queryKey: queryKeys.trips.assignmentAudit(key),
    queryFn: async () => {
      const { getLatestAssignmentAuditByTripIds } = await import(
        '@/features/trips/services/trip-assignment-audit.service'
      );
      const res = await getLatestAssignmentAuditByTripIds(tripIds);
      if (res.error) throw res.error;
      return res.byTripId;
    },
    enabled: tripIds.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useInvalidateTrips() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.trips.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.trips.finite(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.trips.partyCounts(orgId) });
    qc.invalidateQueries({ queryKey: ['q', 'trips', orgId, 'infinite'] });
    qc.invalidateQueries({ queryKey: queryKeys.trips.assignmentAuditRoot });
    qc.invalidateQueries({ queryKey: ["q", "trips", "assignment-audit-history"] });
  };
}
