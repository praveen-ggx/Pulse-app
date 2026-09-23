/**
 * TanStack Query hooks for indents and related load data. Cached by orgId.
 *
 * IMPORTANT: This module is reachable from the startup graph (dock badges in
 * `DemoTabBar` call `useIndentsQuery` for the dispatcher dock count). To keep
 * the indents/direct-quotes/bids service graphs out of the startup chunk, all
 * service modules are **dynamic-imported inside queryFns**. The first call
 * incurs one extra microtask; the module is cached after that.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  INDENTS_CACHE_DOMAIN,
  getIndentsByOrganization,
  getMarketIndentsForOrganization,
  syncIndentsWithCache,
} from '@/features/indents/services/indents.service';
import type { DirectQuoteRow } from '@/features/indents/services/direct-quotes.service';
import type { IndentRow } from '@/features/indents/services/indents.service';
import { findIndentInMarketList } from '@/features/indents/utils/findIndentInList.util';
import { fetchEntityListWithFallback } from '@/lib/queries/fetchEntityListWithFallback';
import { clearDomainCacheMeta } from '@/lib/cache/cacheMetadataStore';
import { useAppQueryGate } from '@/lib/hooks/useAppQueryGate';
import { refetchOnMountIfEntityListEmpty } from '@/lib/queries/entityListQueryOptions';
import { queryKeys } from '@/lib/queryKeys';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { STALE, shouldRetryQuery } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const loadIndentsService = () =>
  import('@/features/indents/services/indents.service');

const loadDirectQuotesService = () =>
  import('@/features/indents/services/direct-quotes.service');
const loadBidsService = () => import('@/features/network/services/bids.service');

/** Full list. Use for Load Board, Create Indent when list is small. */
export function useIndentsQuery(orgId: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.indents.finite(orgId ?? ''),
    queryFn: async () => {
      // Seed the delta merge from whatever is already cached (incl. the rehydrated
      // persisted list). Typing the read as IndentRow[] keeps this cast-free.
      const existing =
        qc.getQueryData<IndentRow[]>(queryKeys.indents.finite(orgId ?? '')) ?? [];
      return fetchEntityListWithFallback<IndentRow>({
        orgId: orgId!,
        domain: INDENTS_CACHE_DOMAIN,
        cachedRows: existing,
        sync: async (id, cachedRows) => {
          const res = await syncIndentsWithCache(id, cachedRows);
          return { error: res.error, rows: res.indents };
        },
        fetchDirect: async (id) => {
          const res = await getIndentsByOrganization(id);
          return { error: res.error, rows: res.indents };
        },
      });
    },
    enabled: !!orgId,
    staleTime: STALE.moderate,
    refetchOnMount: refetchOnMountIfEntityListEmpty<IndentRow[]>(),
  });
}

/** Market-facing indents for GET LOAD / Find Work (visible to current org as integrated supplier). */
export function useMarketIndentsQuery(
  orgId: string | null,
  options?: { enabled?: boolean; urgent?: boolean },
) {
  const gateOpen = useAppQueryGate(orgId, { urgent: options?.urgent });
  const enabled = gateOpen && options?.enabled !== false;

  return useQuery({
    queryKey: queryKeys.indents.market(orgId ?? ''),
    queryFn: async () => {
      const res = await getMarketIndentsForOrganization(orgId!);
      if (res.error) throw res.error;
      return res.indents;
    },
    enabled,
    // Cross-org feed: partner shippers mutate indents outside this org's invalidation path.
    staleTime: STALE.frequent,
    refetchOnMount: refetchOnMountIfEntityListEmpty<IndentRow[]>(),
    retry: shouldRetryQuery,
    placeholderData: (previousData) => previousData,
  });
}

/** Integrated supplier org ids linked to a shipper (for cross-org market cache bust). */
export async function getIntegratedSupplierOrgIdsForShipper(
  shipperOrgId: string,
): Promise<string[]> {
  const ids = new Set<string>();

  // Shipper → supplier (Add Supplier / client_supplier).
  const { data: clientSupplier } = await supabase()
    .from('organization_relations')
    .select('to_organization_id')
    .eq('from_organization_id', shipperOrgId)
    .eq('relation_type', 'client_supplier')
    .eq('status', 'active');

  for (const row of clientSupplier ?? []) {
    const supplierOrgId = String(row.to_organization_id ?? '').trim();
    if (supplierOrgId) ids.add(supplierOrgId);
  }

  // Supplier → shipper (Add Client / supplier_client). Bond→AERO style links
  // only create this direction — skipping it leaves awardees' market cache stale.
  const { data: supplierClient } = await supabase()
    .from('organization_relations')
    .select('from_organization_id')
    .eq('to_organization_id', shipperOrgId)
    .eq('relation_type', 'supplier_client')
    .eq('status', 'active');

  for (const row of supplierClient ?? []) {
    const supplierOrgId = String(row.from_organization_id ?? '').trim();
    if (supplierOrgId) ids.add(supplierOrgId);
  }

  const { data: suppliers } = await supabase()
    .from('suppliers')
    .select('linked_organization_id')
    .eq('organization_id', shipperOrgId)
    .not('linked_organization_id', 'is', null);

  for (const row of suppliers ?? []) {
    const supplierOrgId = String(row.linked_organization_id ?? '').trim();
    if (supplierOrgId) ids.add(supplierOrgId);
  }

  return [...ids];
}

/** Live connected supplier org ids for award / Get Load — not the delta-cached CRM list. */
export function useConnectedSupplierOrgIdsQuery(orgId: string | null) {
  return useQuery<string[]>({
    queryKey: queryKeys.suppliers.connectedOrgIds(orgId ?? ""),
    queryFn: () => getIntegratedSupplierOrgIdsForShipper(orgId!),
    enabled: Boolean(orgId),
    staleTime: STALE.frequent,
  });
}

export function invalidateMarketIndentsForIntegratedSuppliers(
  qc: ReturnType<typeof useQueryClient>,
  shipperOrgId: string,
  supplierOrgIds: string[],
) {
  for (const supplierOrgId of supplierOrgIds) {
    if (!supplierOrgId || supplierOrgId === shipperOrgId) continue;
    qc.invalidateQueries({ queryKey: queryKeys.indents.market(supplierOrgId) });
    qc.invalidateQueries({ queryKey: queryKeys.indents.finite(supplierOrgId) });
    qc.invalidateQueries({ queryKey: ['q', 'indents', supplierOrgId, 'visible'] });
  }
}

/** My direct quotes for GET LOAD views (carrier side). */
export function useMyDirectQuotesQuery(
  orgId: string | null,
  options?: { urgent?: boolean; immediate?: boolean },
) {
  const gateOpen = useAppQueryGate(orgId, {
    urgent: options?.urgent,
    immediate: options?.immediate,
  });
  return useQuery<DirectQuoteRow[]>({
    queryKey: [...queryKeys.indents.finite(orgId ?? ''), 'my-direct-quotes'],
    queryFn: async () => {
      const { getMyDirectQuotes } = await loadDirectQuotesService();
      const res = await getMyDirectQuotes(orgId!);
      if (res.error) throw res.error;
      return res.quotes;
    },
    enabled: gateOpen,
    staleTime: STALE.moderate,
    refetchOnMount: refetchOnMountIfEntityListEmpty<DirectQuoteRow[]>(),
  });
}

/**
 * Single indent for detail / allocation — uses cached market list when available
 * so suppliers avoid refetching the full Find Work feed.
 */
export function useVisibleIndentQuery(
  orgId: string | null,
  indentId: string | null,
) {
  const qc = useQueryClient();
  return useQuery<IndentRow>({
    queryKey: queryKeys.indents.visible(orgId ?? '', indentId ?? ''),
    queryFn: async () => {
      const { getVisibleIndentById } = await loadIndentsService();
      const hint = qc.getQueryData<IndentRow[]>(
        queryKeys.indents.market(orgId ?? ''),
      );
      const res = await getVisibleIndentById(orgId, indentId!, {
        marketIndentsHint: hint ?? undefined,
      });
      if (res.error) throw res.error;
      if (!res.indent) throw new Error('Indent not found');
      return res.indent;
    },
    enabled: !!orgId && !!indentId,
    staleTime: STALE.moderate,
    placeholderData: () => {
      if (!orgId || !indentId) return undefined;
      const hint = qc.getQueryData<IndentRow[]>(
        queryKeys.indents.market(orgId),
      );
      if (!hint?.length) return undefined;
      const row = findIndentInMarketList(hint, indentId);
      // Skip placeholders that predate `weight` in the market RPCs: consumers
      // seed their form once from the first row they see, so a weight-less
      // placeholder would stick even after the real fetch resolves.
      if (!row || row.weight == null) return undefined;
      return row;
    },
  });
}

/** All direct quotes on a specific indent (Give Load owner side). */
export function useIndentDirectQuotesQuery(indentId: string | null) {
  // RPC is SECURITY DEFINER + GRANT to `authenticated` only; anon EXECUTE was
  // revoked (see 20260728210000_v2_audit_anon_rpc_revoke). A cached/persisted
  // query refetching on the sign-in screen fires as `anon` → "permission
  // denied for function get_direct_quotes_with_bidder_names" (GX-PULSE-W).
  // Gate on an authenticated session so it never runs while signed out.
  const { status } = useAuth();
  return useQuery<DirectQuoteRow[]>({
    queryKey: ['indents', indentId, 'direct-quotes'],
    queryFn: async () => {
      const { getDirectQuotesByIndentId } = await loadDirectQuotesService();
      const res = await getDirectQuotesByIndentId(indentId!);
      if (res.error) throw res.error;
      return res.quotes;
    },
    enabled: !!indentId && status === 'authenticated',
    staleTime: STALE.frequent,
    retry: shouldRetryQuery,
    placeholderData: (previousData) => previousData,
  });
}

/** Quote counts per indent for Hire Partner list (one query for all visible indents). */
export function useDirectQuoteCountsQuery(indentIds: string[] | null) {
  const stableKey = indentIds?.length
    ? [...indentIds].sort().join(',')
    : '';
  return useQuery<Record<string, number>>({
    queryKey: ['indents', 'quote-counts', stableKey],
    queryFn: async () => {
      const { getDirectQuoteCountsByIndentIds } = await loadDirectQuotesService();
      const res = await getDirectQuoteCountsByIndentIds(indentIds!);
      if (res.error) throw res.error;
      return res.counts;
    },
    enabled: !!indentIds?.length,
    staleTime: STALE.frequent,
  });
}

/** Unique pending offers per indent (direct_quotes ∪ Pulse bids, deduped by bidder org). */
export function useIndentOfferCountsQuery(ownerOrgId: string | null, indentIds: string[]) {
  const stableKey = indentIds.length ? [...indentIds].sort().join(',') : '';
  return useQuery<Record<string, number>>({
    queryKey: ['indents', 'offer-counts', ownerOrgId ?? '', stableKey],
    queryFn: async () => {
      const { getIndentOfferCountsForOwnerIndents } = await loadBidsService();
      const res = await getIndentOfferCountsForOwnerIndents(ownerOrgId!, indentIds);
      if (res.error) throw res.error;
      return res.counts;
    },
    enabled: !!ownerOrgId && indentIds.length > 0,
    staleTime: STALE.frequent,
  });
}

/** Paginated list for Indents tab. */
export function useIndentsInfiniteQuery(orgId: string | null, opts?: { pageSize?: number }) {
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: queryKeys.indents.infinite(orgId ?? '', pageSize),
    queryFn: async ({ pageParam = 0 }) => {
      const { getIndentsByOrganization } = await loadIndentsService();
      const res = await getIndentsByOrganization(orgId!, { limit: pageSize, offset: pageParam });
      if (res.error) throw res.error;
      return { indents: res.indents, hasMore: res.hasMore ?? false, nextOffset: pageParam + pageSize };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    initialPageParam: 0,
    enabled: !!orgId,
    staleTime: STALE.moderate,
  });
}

export function useInvalidateIndents() {
  const qc = useQueryClient();
  return (orgId: string, options?: { bustPartnerSupplierMarket?: boolean }) => {
    // Invalidation alone only re-runs the queryFn — which then takes the *delta*
    // path off the stored cursor and can miss the row we just wrote. Dropping the
    // cursor forces the next fetch to be a full sync, so a writer always sees
    // their own change (GX-PULSE-CACHE).
    void clearDomainCacheMeta(INDENTS_CACHE_DOMAIN, orgId);

    qc.invalidateQueries({ queryKey: queryKeys.indents.all(orgId) });
    qc.invalidateQueries({ queryKey: queryKeys.indents.finite(orgId) });
    qc.invalidateQueries({ queryKey: ['q', 'indents', orgId, 'infinite'] });
    qc.invalidateQueries({ queryKey: queryKeys.indents.market(orgId) });
    qc.invalidateQueries({ queryKey: ['q', 'indents', orgId, 'visible'] });

    if (!options?.bustPartnerSupplierMarket) return;

    void getIntegratedSupplierOrgIdsForShipper(orgId).then((supplierOrgIds) => {
      invalidateMarketIndentsForIntegratedSuppliers(qc, orgId, supplierOrgIds);
    });
  };
}
