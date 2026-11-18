import { listPublishedStoriesForOrgs } from "@/features/network/services/storyStrip.service";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

/** Partner stories only. The network feed is a separate query so the row can paint first. */
export function useStoryStripPostsQuery(
  orgId: string | null,
  connectedOrgIds: readonly string[],
) {
  const { status } = useAuth();
  const idsKey = [...connectedOrgIds].map((id) => id.trim()).filter(Boolean).sort().join(",");
  return useQuery({
    queryKey: queryKeys.posts.storyStrip(orgId ?? "", idsKey),
    queryFn: async () => {
      const res = await listPublishedStoriesForOrgs(connectedOrgIds);
      if (res.error) throw res.error;
      return res.posts;
    },
    enabled: !!orgId && status === "authenticated" && idsKey.length > 0,
    staleTime: STALE.moderate,
    placeholderData: keepPreviousData,
  });
}
