import { useInfiniteQuery } from "@tanstack/react-query";
import {
  getHubTripKeysetPage,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

type HubCursor = { createdAt: string; id: string };

/**
 * One server page of hub trips at a time. Older pages load only when the
 * screen asks. list_org_hub_trips_keyset is not walked to the end on mount.
 */
export function useTripsHubDateRange(
  orgId: string | null,
  bounds: { from: string; to: string } | null,
) {
  const from = bounds?.from ?? "";
  const to = bounds?.to ?? "";
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.trips.hubDateRange(orgId ?? "", from, to), "keyset-page"],
    queryFn: async ({ pageParam }: { pageParam: HubCursor | null }) => {
      const res = await getHubTripKeysetPage(orgId!, {
        from,
        to,
        cursor: pageParam,
        limit: 100,
      });
      if (res.error) throw res.error;
      return res;
    },
    initialPageParam: null as HubCursor | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(orgId && from && to),
    staleTime: STALE.frequent,
  });
  const trips: TripRow[] = query.data?.pages.flatMap((page) => page.trips) ?? [];
  const total = query.data?.pages[0]?.total ?? null;
  return {
    trips,
    total,
    isFetching: query.isFetching && !query.isFetchingNextPage,
    isFetched: query.isSuccess,
    isError: query.isError,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
  };
}
