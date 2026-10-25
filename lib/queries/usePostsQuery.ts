import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  getNetworkFeed,
  createPost,
  type CreatePostInput,
  type PostRow,
} from '@/features/network/services/posts.service';
import type { IndentStoryState } from '@/features/network/services/indentStoryPosts.service';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';

export function useNetworkFeedQuery(
  orgId: string | null,
  options?: { enabled?: boolean },
) {
  const { status } = useAuth();
  return useQuery({
    queryKey: queryKeys.posts.feed(orgId ?? ''),
    queryFn: async () => {
      const res = await getNetworkFeed(orgId!, 50, 0);
      if (res.error) throw res.error;
      return res.posts;
    },
    enabled: !!orgId && status === 'authenticated' && options?.enabled !== false,
    staleTime: STALE.moderate,
  });
}

export function useCreatePostMutation(orgId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) => createPost(input),
    onSuccess: () => {
      if (orgId) {
        qc.invalidateQueries({ queryKey: queryKeys.posts.all(orgId) });
      }
    },
  });
}

export function useInvalidatePosts(orgId: string | null) {
  const qc = useQueryClient();
  return () => {
    if (orgId) void qc.invalidateQueries({ queryKey: queryKeys.posts.all(orgId) });
  };
}

export function useIndentStoryStatesQuery(
  orgId: string | null,
  indentIds: string[],
) {
  const { status } = useAuth();
  const stableKey = indentIds.length ? [...indentIds].sort().join(',') : '';
  return useQuery<Record<string, IndentStoryState>>({
    queryKey: queryKeys.posts.indentStories(orgId ?? '', stableKey),
    queryFn: async () => {
      const { getIndentStoryStates } = await import(
        '@/features/network/services/indentStoryPosts.service'
      );
      const res = await getIndentStoryStates(orgId!, indentIds);
      if (res.error) throw res.error;
      return res.byIndentId;
    },
    enabled: !!orgId && status === 'authenticated' && indentIds.length > 0,
    staleTime: STALE.frequent,
  });
}

/** Live own LOAD stories (Load Center green Pulse) for Mine queue + story segments. */
export function useLiveOwnLoadStoriesQuery(
  orgId: string | null,
  options?: { enabled?: boolean },
) {
  const { status } = useAuth();
  return useQuery({
    queryKey: queryKeys.posts.liveOwnLoadStories(orgId ?? ''),
    queryFn: async () => {
      const { listLiveOwnLoadStories } = await import(
        '@/features/network/services/indentStoryPosts.service'
      );
      const res = await listLiveOwnLoadStories(orgId!);
      if (res.error) throw res.error;
      return res.posts;
    },
    enabled: !!orgId && status === 'authenticated' && options?.enabled !== false,
    staleTime: STALE.moderate,
  });
}

/**
 * After a post is deactivated/deleted: remove it from cached feed immediately, then refetch.
 * Ensures Network / Discover UI updates without waiting on background invalidation (important on web).
 */
export function useAfterPostDeleted(orgId: string | null) {
  const qc = useQueryClient();
  return useCallback(
    async (postId: string) => {
      if (!orgId) return;
      const feedKey = queryKeys.posts.feed(orgId);
      qc.setQueryData<PostRow[]>(feedKey, (old) => {
        if (!old) return old;
        return old.filter((p) => p.id !== postId);
      });
      await qc.invalidateQueries({ queryKey: queryKeys.posts.all(orgId) });
    },
    [orgId, qc],
  );
}
