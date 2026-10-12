/**
 * Ground Ops see only trips from warehouses assigned to them (RLS
 * `trips_ground_ops_select_assigned`). With none assigned, every trip list is
 * empty with no explanation — this tells screens to say so instead.
 */
import { useActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

export function useGroundOpsWarehouseGap(): { missingWarehouse: boolean; isLoading: boolean } {
  const { memberPlatformRole } = useActiveWorkspace();
  const { user } = useAuth();
  const orgId = useOptionalOrganization()?.currentOrganization?.id ?? null;
  const userId = user?.uid ?? null;
  const enabled = memberPlatformRole === "ground_ops" && !!orgId && !!userId;

  const { data, isLoading } = useQuery({
    queryKey: ["member-warehouse-count", orgId, userId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      // org_member_warehouses_self_select lets a member read their own rows.
      const { count, error } = await supabase()
        .from("organization_member_warehouses")
        .select("warehouse_id, organization_members!inner(user_id, organization_id)", {
          count: "exact",
          head: true,
        })
        .eq("organization_members.user_id", userId as string)
        .eq("organization_members.organization_id", orgId as string);
      if (error) throw error;
      return count ?? 0;
    },
  });

  return {
    missingWarehouse: enabled && data === 0,
    isLoading: enabled && isLoading,
  };
}
