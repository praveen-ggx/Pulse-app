import { useInfiniteQuery } from "@tanstack/react-query";
import {
  getHubTripKeysetPage,
  type HubKeysetBucket,
  type HubKeysetCursor,
  type TripRow,
} from "@/features/trips/services/trips.service";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

/**
 * One keyset page of the selected hub bucket or rail tile, then the next
 * matching page only when the screen asks. Counts come from that first page.
 * The walk of every historical row is not used here.
 */
export function useTripsHubDateRange(
  orgId: string | null,
  bounds: { from: string; to: string } | null,
  bucket: HubKeysetBucket = "all",
  attributed: "all" | "attributed" = "all",
) {
  const from = bounds?.from ?? "";
  const to = bounds?.to ?? "";
  const query = useInfiniteQuery({
    queryKey: [
      ...queryKeys.trips.hubDateRange(orgId ?? "", from, to),
      "keyset-page",
      bucket,
      attributed,
    ],
    initialPageParam: null as HubKeysetCursor | null,
    queryFn: async ({ pageParam }) => {
      const page = await getHubTripKeysetPage(orgId!, {
        from,
        to,
        bucket,
        attributed,
        cursor: pageParam,
        withCounts: pageParam == null,
      });
      if (page.error) throw page.error;
      return page;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(orgId && from && to),
    staleTime: STALE.frequent,
  });
  const pages = query.data?.pages ?? [];
  const trips = pages.flatMap((page) => page.trips);
  const first = pages[0];
  const total = first
    ? bucket === "all"
      ? first.total
      : (first.bucketCount ?? first.total)
    : null;
  return {
    trips,
    total,
    attributedCount: first?.attributedCount ?? null,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    isFetching: query.isFetching,
    isFetched: query.isSuccess,
    isError: query.isError,
  };
}

export type { TripRow };
