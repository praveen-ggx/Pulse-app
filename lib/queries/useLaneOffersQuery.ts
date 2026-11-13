import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  LANE_OFFERS_PAGE_SIZE,
  listLaneOffersForIndent,
  listMyLaneBidInvites,
  type LaneBidInvitesCursor,
  type LaneOffersCursor,
} from '@/features/network/services/laneOffers.service';
import { STALE } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';

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
  return useInfiniteQuery({
    queryKey: queryKeys.laneOffers.myInvites(pageSize),
    initialPageParam: null as LaneBidInvitesCursor | null,
    queryFn: async ({ pageParam }) => {
      const res = await listMyLaneBidInvites({ limit: pageSize, cursor: pageParam });
      if (res.error) throw res.error;
      return res.page!;
    },
    getNextPageParam: (last) => (last.has_more ? last.next_cursor : null),
    enabled: options.enabled !== false,
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
    },
    [queryClient],
  );
}
