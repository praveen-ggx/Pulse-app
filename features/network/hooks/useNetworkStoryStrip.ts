import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import {
  useConnectionRequestsReceivedQuery,
  useConnectionRequestsSentQuery,
} from "@/lib/queries/useNetworkQueries";
import { useStoryStripPostsQuery } from "@/features/network/hooks/useStoryStripPostsQuery";
import {
  collectApprovedNetworkOrgIds,
  collectStoryStripAudienceOrgIds,
  selectStoryStripPosts,
} from "@/features/network/utils/storyStrip.util";
import { groupStoriesByLane } from "@/features/network/utils/storyLaneGroup.util";
import { useRecordSponsoredImpressions } from "@/features/reach/hooks/useRecordSponsoredImpressions";
import { useMemo } from "react";

/**
 * One story-row source for Network, Pulse Business Chat, and any other strip.
 * Same audience + Boost rules as `selectStoryStripPosts`.
 */
export function useNetworkStoryStrip(
  orgId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false && Boolean(orgId);
  const receivedQ = useConnectionRequestsReceivedQuery(enabled ? orgId! : null);
  const sentQ = useConnectionRequestsSentQuery(enabled ? orgId! : null);
  const clientsQ = useClientsQuery(enabled ? orgId! : null);

  const networkOrgIds = useMemo(
    () =>
      collectApprovedNetworkOrgIds(orgId, [
        ...(receivedQ.data ?? []),
        ...(sentQ.data ?? []),
      ]),
    [orgId, receivedQ.data, sentQ.data],
  );
  const clientOrgIds = useMemo(() => {
    const ids = new Set<string>();
    for (const client of (clientsQ.data ?? []) as Array<{
      linked_organization_id?: string | null;
      is_integrated?: boolean;
    }>) {
      const linked = client.linked_organization_id?.trim();
      if (!linked) continue;
      if (client.is_integrated === false) continue;
      ids.add(linked);
    }
    return ids;
  }, [clientsQ.data]);

  const connectedOrgIds = useMemo(
    () => collectStoryStripAudienceOrgIds(networkOrgIds, clientOrgIds),
    [clientOrgIds, networkOrgIds],
  );
  const connectionsReady =
    !receivedQ.isPending && !sentQ.isPending && !clientsQ.isPending;
  const connectedIds = useMemo(() => [...connectedOrgIds], [connectedOrgIds]);
  const stripQ = useStoryStripPostsQuery(enabled ? orgId! : null, connectedIds);

  const rawPosts = stripQ.data ?? [];
  const posts = useMemo(
    () =>
      selectStoryStripPosts(rawPosts, orgId, connectedOrgIds, {
        connectionsReady,
      }),
    [connectedOrgIds, connectionsReady, orgId, rawPosts],
  );
  const indentCountByPostId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const group of groupStoriesByLane(rawPosts)) {
      const id = (group.post.id ?? "").trim();
      if (id) map[id] = Math.max(1, group.indentCount);
    }
    return map;
  }, [rawPosts]);

  useRecordSponsoredImpressions(posts, orgId);

  return {
    posts,
    indentCountByPostId,
    isLoading: stripQ.isLoading && posts.length === 0,
    connectedOrgIds,
    connectionsReady,
  };
}
