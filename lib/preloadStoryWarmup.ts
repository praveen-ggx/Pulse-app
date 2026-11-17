/**
 * Warm the Pulse Story row before Network or Chat paints it.
 * Lazy imports only — this module is pulled in from the tab shell.
 */
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import type { QueryClient } from "@tanstack/react-query";

export function preloadStoryStrip(queryClient: QueryClient, orgId: string): void {
  if (!orgId) return;
  void queryClient.prefetchQuery({
    queryKey: queryKeys.posts.feed(orgId),
    staleTime: STALE.moderate,
    queryFn: async () => {
      const { getNetworkFeed } = await import(
        "@/features/network/services/posts.service"
      );
      const res = await getNetworkFeed(orgId, 50, 0);
      if (res.error) throw res.error;
      return res.posts;
    },
  });
  void queryClient.prefetchQuery({
    queryKey: queryKeys.posts.liveOwnLoadStories(orgId),
    staleTime: STALE.moderate,
    queryFn: async () => {
      const { listLiveOwnLoadStories } = await import(
        "@/features/network/services/indentStoryPosts.service"
      );
      const res = await listLiveOwnLoadStories(orgId);
      if (res.error) throw res.error;
      return res.posts;
    },
  });
}
