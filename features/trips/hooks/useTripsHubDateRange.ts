import { useQuery } from "@tanstack/react-query";
import {
  getHubTripKeysetPage,
  loadHubTripKeysetRange,
  type TripRow,
} from "@/features/trips/services/trips.service";
import type { HubServerTripCounts } from "@/features/trips/utils/hubTripListCounts.util";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Trips hub trip rows for a date range (HUB_ALL_TIME_BOUNDS for "All time").
 * Pages come from list_org_hub_trips_keyset. A short walk is an error.
 * The newest-400 catalog is not a fallback.
 */
export function useTripsHubDateRange(
  orgId: string | null,
  bounds: { from: string; to: string } | null,
  bucket: "active" | "history" | "all" = "all",
  attributed: "all" | "attributed" = "all",
) {
  const from = bounds?.from ?? "";
  const to = bounds?.to ?? "";
  const enabled = Boolean(orgId && from && to);
  const rangeKey = queryKeys.trips.hubDateRange(orgId ?? "", from, to);
  // One counted page. The list walk below does not block this total.
  // The key includes attribution so a pill change cannot reuse the previous total.
  const countsQuery = useQuery<HubServerTripCounts>({
    queryKey: [...rangeKey, "server-counts", attributed],
    queryFn: async () => {
      const page = await getHubTripKeysetPage(orgId!, {
        from,
        to,
        bucket: "all",
        limit: 1,
        withCounts: true,
        attributed,
      });
      if (page.error || page.total == null) {
        throw page.error ?? new Error("Hub trip count is unavailable.");
      }
      return {
        total: page.total,
        active: page.activeCount,
        history: page.historyCount,
        cancelled: page.cancelledCount,
      };
    },
    enabled,
    staleTime: STALE.frequent,
  });
  const query = useQuery<TripRow[]>({
    queryKey: [...rangeKey, "keyset", bucket, attributed],
    queryFn: async () => {
      const res = await loadHubTripKeysetRange(orgId!, { from, to, bucket, attributed });
      if (res.error) throw res.error;
      return res.trips;
    },
    enabled,
    staleTime: STALE.frequent,
  });
  return {
    trips: query.data ?? [],
    isFetching: query.isFetching,
    isFetched: query.isSuccess,
    isError: query.isError,
    counts: countsQuery.data ?? null,
  };
}
