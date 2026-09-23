/**
 * TanStack Query hooks for clients. Cached by orgId.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getClientsByOrganization,
  syncClientsWithCache,
  type ClientRow,
} from '@/features/clients/services/clients.service';
import { fetchEntityListWithFallback } from '@/lib/queries/fetchEntityListWithFallback';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
import { queryKeys } from '@/lib/queryKeys';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { STALE } from '@/lib/queryClient';

/** Full list (no pagination). Use for dropdowns, Finance entities. */
export function useClientsQuery(orgId: string | null) {
  const qc = useQueryClient();
  return useQuery<ClientRow[], Error>({
    queryKey: queryKeys.clients.finite(orgId ?? ''),
    queryFn: async () => {
      const existing =
        (qc.getQueryData(queryKeys.clients.finite(orgId ?? '')) as
          | ClientRow[]
          | undefined) ?? [];
      return fetchEntityListWithFallback<ClientRow>({
        orgId: orgId!,
        domain: 'clients',
        cachedRows: existing,
        sync: async (id, cachedRows) => {
          const res = await syncClientsWithCache(id, cachedRows);
          return { error: res.error, rows: res.clients };
        },
        fetchDirect: async (id) => {
          const res = await getClientsByOrganization(id);
          return { error: res.error, rows: res.clients };
        },
      });
    },
    enabled: !!orgId,
    // Near-static lookup data: invalidated by mutations and by realtime, so a
    // longer stale window costs no freshness and removes a background refetch
    // from every screen that renders alongside the hot list.
    // @see docs/DB_LOAD_ARCHITECTURE_REVIEW.md
    staleTime: STALE.slow,
    refetchOnMount: refetchOnMountIfEntityListEmpty<ClientRow[]>(),
  });
}

/** Paginated list for Customers tab. */
export function useClientsInfiniteQuery(orgId: string | null, opts?: { pageSize?: number }) {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: queryKeys.clients.infinite(orgId ?? '', pageSize),
    queryFn: async ({ pageParam = 0 }) => {
      const res = await getClientsByOrganization(orgId!, { limit: pageSize, offset: pageParam });
      if (res.error) throw res.error;
      return { clients: res.clients, hasMore: res.hasMore ?? false, nextOffset: pageParam + pageSize };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    initialPageParam: 0,
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useInvalidateClients() {
  const qc = useQueryClient();
  return (orgId: string) => {
    qc.invalidateQueries({ queryKey: queryKeys.clients.all(orgId) });
  };
}
