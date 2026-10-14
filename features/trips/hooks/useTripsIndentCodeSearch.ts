import { useQuery } from "@tanstack/react-query";
import {
  searchIndentsByCodeForTrips,
  type IndentRow,
} from "@/features/indents/services/indents.service";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { STALE } from "@/lib/queryClient";

/**
 * Trips toolbar code lookup. Idle until the search box has text.
 * Debounced so typing does not query on every keystroke; the in-memory
 * filter still runs on the live query.
 */
export function useTripsIndentCodeSearch(
  orgId: string | null,
  searchQuery: string,
) {
  const needle = useDebouncedValue(searchQuery.trim(), 300);
  return useQuery<IndentRow[]>({
    queryKey: ["q", "trips", orgId ?? "", "indent-code-search", needle],
    queryFn: async () => {
      const res = await searchIndentsByCodeForTrips(orgId!, needle);
      if (res.error) throw res.error;
      return res.indents;
    },
    enabled: Boolean(orgId) && needle.length > 0,
    staleTime: STALE.frequent,
  });
}
