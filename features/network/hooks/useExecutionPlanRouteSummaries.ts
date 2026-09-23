import { useQuery } from "@tanstack/react-query";
import { fetchExecutionPlanRouteSummaries } from "@/features/network/services/fetchExecutionPlanRouteSummaries";
import { queryKeys } from "@/lib/queryKeys";
import { STALE, shouldRetryQuery } from "@/lib/queryClient";
import { isCommerceDataQueryEnabled } from "@/lib/suite/productLock";

export function useExecutionPlanRouteSummaries(
  orgId: string | null,
  planIds: string[],
) {
  const unique = [...new Set(planIds.map((id) => id.trim()).filter(Boolean))].sort();
  const planIdsKey = unique.join(",");

  return useQuery({
    queryKey: queryKeys.indents.planRoutes(orgId ?? "", planIdsKey),
    queryFn: ({ signal }) => fetchExecutionPlanRouteSummaries(unique, signal),
    enabled: isCommerceDataQueryEnabled() && Boolean(orgId) && unique.length > 0,
    staleTime: STALE.moderate,
    retry: shouldRetryQuery,
  });
}
