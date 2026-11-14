import { useQuery } from "@tanstack/react-query";
import { loadHubTripKeysetRange, type TripRow } from "@/features/trips/services/trips.service";
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
) {
  const from = bounds?.from ?? "";
  const to = bounds?.to ?? "";
  const query = useQuery<TripRow[]>({
    queryKey: [...queryKeys.trips.hubDateRange(orgId ?? "", from, to), "keyset"],
    queryFn: async () => {
      const res = await loadHubTripKeysetRange(orgId!, { from, to });
      if (res.error) throw res.error;
      return res.trips;
    },
    enabled: Boolean(orgId && from && to),
    staleTime: STALE.frequent,
  });
  return {
    trips: query.data ?? [],
    isFetching: query.isFetching,
    isFetched: query.isSuccess,
    isError: query.isError,
  };
}
