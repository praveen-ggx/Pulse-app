import { useQuery } from "@tanstack/react-query";
import { fetchExecutionPlanClients } from "@/features/network/services/fetchExecutionPlanClientNames";
import { queryKeys } from "@/lib/queryKeys";
import { STALE, shouldRetryQuery } from "@/lib/queryClient";
import { isCommerceDataQueryEnabled } from "@/lib/suite/productLock";

export function useExecutionPlanClients(
  orgId: string | null,
  planIds: string[],
) {
  const unique = [...new Set(planIds.map((id) => id.trim()).filter(Boolean))].sort();
  const planIdsKey = unique.join(",");

  return useQuery({
    queryKey: queryKeys.indents.planClients(orgId ?? "", planIdsKey),
    queryFn: () => fetchExecutionPlanClients(orgId ?? "", unique),
    enabled: isCommerceDataQueryEnabled() && Boolean(orgId) && unique.length > 0,
    staleTime: STALE.moderate,
    retry: shouldRetryQuery,
  });
}

/** @deprecated Use useExecutionPlanClients — names are derived from unique parties. */
export function useExecutionPlanClientNames(
  orgId: string | null,
  planIds: string[],
) {
  return useExecutionPlanClients(orgId, planIds);
}
