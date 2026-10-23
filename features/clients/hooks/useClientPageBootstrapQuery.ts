import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  fetchClientPageBootstrap,
  type ClientPageBootstrap,
} from "@/features/clients/services/clientPageBootstrap.service";
import { queryKeys } from "@/lib/queryKeys";
import { shouldRetryQuery } from "@/lib/queryClient";

/** Keep the scoped fallback bundle. Never cache `null` just because the RPC is missing. */
export async function queryClientPageBootstrap(
  orgId: string,
  clientId: string,
): Promise<ClientPageBootstrap | null> {
  const res = await fetchClientPageBootstrap(orgId, clientId);
  if (res.error) throw res.error;
  return res.bundle;
}

export function prefetchClientPageBootstrap(
  queryClient: QueryClient,
  orgId: string | null | undefined,
  clientId: string | null | undefined,
): Promise<void> {
  const org = (orgId ?? "").trim();
  const id = (clientId ?? "").trim();
  if (!org || !id) return Promise.resolve();
  return queryClient.prefetchQuery({
    queryKey: queryKeys.clients.pageBootstrap(org, id),
    queryFn: () => queryClientPageBootstrap(org, id),
    staleTime: 60_000,
  });
}

export function useClientPageBootstrapQuery(
  orgId: string | null,
  clientId: string | null,
) {
  return useQuery({
    queryKey: queryKeys.clients.pageBootstrap(orgId ?? "", clientId ?? ""),
    queryFn: async () => {
      if (!orgId || !clientId) return null;
      return queryClientPageBootstrap(orgId, clientId);
    },
    enabled: Boolean(orgId && clientId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: shouldRetryQuery,
  });
}

export type { ClientPageBootstrap };
