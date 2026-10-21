import {
  getOrgProfileSnapshot,
  snapshotFromPartnerDisplay,
  type NetworkProfileSnapshot,
} from "@/features/network/services/networkProfileSnapshot.service";
import { queryKeys } from "@/lib/queryKeys";
import {
  ensureLinkedOrgDisplayProfiles,
  linkedDisplayToOrgDisplay,
  peekLinkedOrgDisplayProfile,
} from "@/lib/queries/linkedOrgDisplayCache";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

const NETWORK_PROFILE_BOOTSTRAP_STALE_MS = 60_000;

async function fetchNetworkProfileSnapshot(
  queryClient: QueryClient,
  viewerOrgId: string,
  targetOrgId: string,
): Promise<NetworkProfileSnapshot | null> {
  const cached = await ensureLinkedOrgDisplayProfiles(
    [targetOrgId],
    queryClient,
    viewerOrgId,
  );
  const linked = cached[targetOrgId];
  const { error, snapshot } = await getOrgProfileSnapshot(
    viewerOrgId,
    targetOrgId,
    {
      partnerProfile: linked ? linkedDisplayToOrgDisplay(linked) : undefined,
    },
  );
  if (error) throw error;
  return snapshot;
}

export function peekNetworkProfileSnapshot(
  queryClient: QueryClient,
  viewerOrgId: string | null | undefined,
  targetOrgId: string | null | undefined,
): NetworkProfileSnapshot | undefined {
  const viewer = (viewerOrgId ?? "").trim();
  const target = (targetOrgId ?? "").trim();
  if (!viewer || !target) return undefined;
  const cached = queryClient.getQueryData<NetworkProfileSnapshot | null>(
    queryKeys.networkProfileSnapshot(viewer, target),
  );
  if (cached) return cached;
  const linked = peekLinkedOrgDisplayProfile(queryClient, viewer, target);
  if (!linked) return undefined;
  return snapshotFromPartnerDisplay(target, linkedDisplayToOrgDisplay(linked));
}

export function prefetchNetworkProfileSnapshot(
  queryClient: QueryClient,
  viewerOrgId: string | null | undefined,
  targetOrgId: string | null | undefined,
): Promise<void> {
  const viewer = (viewerOrgId ?? "").trim();
  const target = (targetOrgId ?? "").trim();
  if (!viewer || !target) return Promise.resolve();
  return queryClient.prefetchQuery({
    queryKey: queryKeys.networkProfileSnapshot(viewer, target),
    queryFn: () => fetchNetworkProfileSnapshot(queryClient, viewer, target),
    staleTime: NETWORK_PROFILE_BOOTSTRAP_STALE_MS,
  });
}

export function useNetworkProfileSnapshotQuery(
  viewerOrgId: string | null | undefined,
  targetOrgId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const viewer = (viewerOrgId ?? "").trim();
  const target = (targetOrgId ?? "").trim();
  return useQuery<NetworkProfileSnapshot | null, Error>({
    queryKey: queryKeys.networkProfileSnapshot(viewer, target),
    queryFn: () => fetchNetworkProfileSnapshot(queryClient, viewer, target),
    enabled: Boolean(viewer && target),
    staleTime: NETWORK_PROFILE_BOOTSTRAP_STALE_MS,
    gcTime: 5 * 60_000,
    placeholderData: () =>
      peekNetworkProfileSnapshot(queryClient, viewer, target) ?? undefined,
  });
}
