import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useOptionalAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import {
  LANE_OFFERS_PAGE_SIZE,
  listLaneOffersForIndent,
  listMyLaneBidInvites,
  listMyNetworkQuotes,
  type LaneBidInvitesCursor,
  type LaneOffersCursor,
} from '@/features/network/services/laneOffers.service';
import { STALE } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';

function useLaneOfferViewer() {
  const userId = useOptionalAuth()?.user?.uid ?? '';
  const orgId = useOptionalOrganization()?.currentOrganization?.id ?? '';
  return { userId, orgId, ready: userId.length > 0 && orgId.length > 0 };
}

/** Keyset pages of lane offers for one indent; every page is reachable via fetchNextPage. */
export function useLaneOffersForIndentQuery(
  indentId: string | null,
  options: { enabled?: boolean; pageSize?: number } = {},
) {
  const pageSize = options.pageSize ?? LANE_OFFERS_PAGE_SIZE;
  return useInfiniteQuery({
    queryKey: queryKeys.laneOffers.forIndent(indentId ?? '', pageSize),
    initialPageParam: null as LaneOffersCursor | null,
    queryFn: async ({ pageParam }) => {
      const res = await listLaneOffersForIndent(indentId!, { limit: pageSize, cursor: pageParam });
      if (res.error) throw res.error;
      return res.page!;
    },
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
    enabled: !!indentId && options.enabled !== false,
    staleTime: STALE.moderate,
  });
}

export function useMyLaneBidInvitesQuery(options: { enabled?: boolean; pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? LANE_OFFERS_PAGE_SIZE;
  const viewer = useLaneOfferViewer();
  return useInfiniteQuery({
    queryKey: queryKeys.laneOffers.myInvites(viewer.userId, viewer.orgId, pageSize),
    initialPageParam: null as LaneBidInvitesCursor | null,
    queryFn: async ({ pageParam }) => {
      const res = await listMyLaneBidInvites({ limit: pageSize, cursor: pageParam });
      if (res.error) throw res.error;
      return res.page!;
    },
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
    enabled: viewer.ready && options.enabled !== false,
    staleTime: STALE.moderate,
  });
}

/** Pending and awarded network quotes for the signed-in carrier's workspace. */
export function useMyNetworkQuotesQuery(options: { enabled?: boolean } = {}) {
  const viewer = useLaneOfferViewer();
  return useQuery({
    queryKey: queryKeys.laneOffers.myNetworkQuotes(viewer.userId, viewer.orgId),
    queryFn: async () => {
      const res = await listMyNetworkQuotes(viewer.orgId);
      if (res.error) throw res.error;
      return res.quotes;
    },
    enabled: viewer.ready && options.enabled !== false,
    staleTime: STALE.moderate,
  });
}

/** After an invite, attach, or Marketplace switch: lane lists and the indent's own offers. */
export function useInvalidateLaneOffers() {
  const queryClient = useQueryClient();
  return useCallback(
    (indentId?: string | null) => {
      if (indentId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.laneOffers.forIndentAll(indentId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.bids.marketForIndent(indentId) });
        void queryClient.invalidateQueries({ queryKey: ['indents', indentId, 'direct-quotes'] });
      } else {
        void queryClient.invalidateQueries({ queryKey: queryKeys.laneOffers.all() });
      }
      // Accepting a rate request writes a marketplace bid or a network quote.
      // Both lists are keyed apart from the invite inbox.
      void queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey.includes('my-direct-quotes'),
      });
      void queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'q' &&
          query.queryKey[1] === 'find-loads' &&
          query.queryKey.includes('my-bids'),
      });
    },
    [queryClient],
  );
}
