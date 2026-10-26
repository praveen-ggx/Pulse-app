import { listStoryStripPosts } from "@/features/network/services/storyStrip.service";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { STALE } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

export function useStoryStripPostsQuery(
  orgId: string | null,
  connectedOrgIds: readonly string[],
) {
  const { status } = useAuth();
  const idsKey = [...connectedOrgIds].map((id) => id.trim()).filter(Boolean).sort().join(",");
  return useQuery({
    queryKey: queryKeys.posts.storyStrip(orgId ?? "", idsKey),
    queryFn: async () => {
      const res = await listStoryStripPosts(orgId!, connectedOrgIds);
      if (res.error) throw res.error;
      return res.posts;
    },
    enabled: !!orgId && status === "authenticated",
    staleTime: STALE.moderate,
  });
}
