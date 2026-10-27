import { useQuery } from "@tanstack/react-query";
import { getTripsForOrg, type TripRow } from "@/features/trips/services/trips.service";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Trips hub trip rows for a date range (HUB_ALL_TIME_BOUNDS for "All time").
 * The default list is only the newest 400 trips, so hub counts come from this query.
 * Errors surface as `isError`; the RPC never falls back to a table scan here.
 */
export function useTripsHubDateRange(
  orgId: string | null,
  bounds: { from: string; to: string } | null,
) {
  const from = bounds?.from ?? "";
  const to = bounds?.to ?? "";
  const query = useQuery<TripRow[]>({
    queryKey: queryKeys.trips.hubDateRange(orgId ?? "", from, to),
    queryFn: async () => {
      const res = await getTripsForOrg(orgId!, { from, to });
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
