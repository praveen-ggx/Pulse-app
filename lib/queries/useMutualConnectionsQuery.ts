import { getMutualConnections } from "@/features/network/services/mutual-connections.service";
import { queryKeys } from "@/lib/queryKeys";
import { isSupabaseCircuitOpen } from "@/lib/supabaseHttp.util";
import { useQuery } from "@tanstack/react-query";

export function useMutualConnectionsQuery(
  viewerOrgId: string | null | undefined,
  targetOrgId: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.mutualConnections(viewerOrgId ?? "", targetOrgId ?? ""),
    queryFn: async () => {
      if (isSupabaseCircuitOpen()) return [];
      const { error, mutuals } = await getMutualConnections(
        viewerOrgId!,
        targetOrgId!,
      );
      if (error) throw error;
      return mutuals;
    },
    enabled: Boolean(
      enabled && viewerOrgId && targetOrgId && !isSupabaseCircuitOpen(),
    ),
    staleTime: 60_000,
  });
}
