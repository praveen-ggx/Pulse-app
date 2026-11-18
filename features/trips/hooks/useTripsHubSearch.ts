import { useQuery } from "@tanstack/react-query";
import { searchTripsForOrg, type TripRow } from "@/features/trips/services/trips.service";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";

/**
 * Trips hub server search. The hub list is only the newest 400 trips, so older
 * matches come from here. Idle until the search box has 2+ characters; debounced
 * so typing does not query on every keystroke. `needle` is the query the hits
 * belong to, so callers can ignore hits from an older query.
 */
export function useTripsHubSearch(orgId: string | null, searchQuery: string) {
  const needle = useDebouncedValue(searchQuery.trim(), 300);
  const query = useQuery<{ trips: TripRow[]; capped: boolean } | TripRow[]>({
    queryKey: queryKeys.trips.hubSearch(orgId ?? "", needle),
    queryFn: async () => {
      const res = await searchTripsForOrg(orgId!, needle);
      if (res.error) throw res.error;
      return { trips: res.trips, capped: res.capped };
    },
    enabled: Boolean(orgId) && needle.length >= 2,
    staleTime: STALE.frequent,
  });
  const payload = query.data;
  const hits = Array.isArray(payload) ? payload : (payload?.trips ?? []);
  const capped = !Array.isArray(payload) && payload?.capped === true && needle.length >= 2;
  return { hits, capped, needle, isFetching: query.isFetching };
}
