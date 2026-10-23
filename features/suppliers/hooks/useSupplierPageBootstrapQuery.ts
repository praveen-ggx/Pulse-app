import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  querySupplierPageBootstrap,
  type SupplierPageBootstrap,
} from "@/features/suppliers/services/supplierPageBootstrap.service";
import { queryKeys } from "@/lib/queryKeys";
import { shouldRetryQuery } from "@/lib/queryClient";

export function prefetchSupplierPageBootstrap(
  queryClient: QueryClient,
  orgId: string | null | undefined,
  supplierId: string | null | undefined,
): Promise<void> {
  const org = (orgId ?? "").trim();
  const id = (supplierId ?? "").trim();
  if (!org || !id) return Promise.resolve();
  return queryClient.prefetchQuery({
    queryKey: queryKeys.suppliers.pageBootstrap(org, id),
    queryFn: () => querySupplierPageBootstrap(org, id),
    staleTime: 60_000,
  });
}

export function useSupplierPageBootstrapQuery(
  orgId: string | null,
  supplierId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.suppliers.pageBootstrap(orgId ?? "", supplierId ?? ""),
    queryFn: async () => {
      if (!orgId || !supplierId) return null;
      return querySupplierPageBootstrap(orgId, supplierId);
    },
    enabled: Boolean(orgId && supplierId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: shouldRetryQuery,
  });
}

export type { SupplierPageBootstrap };
