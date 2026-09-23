import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/lib/supabase";
import type { ProductId } from "@/lib/productRegistry";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { STALE, shouldRetryQuery } from '@/lib/queryClient';

export interface OrgProductActivation {
  product_id: ProductId;
  status: "inactive" | "trial" | "active" | "suspended" | "cancelled";
  activated_at: string | null;
  trial_ends_at: string | null;
  expires_at: string | null;
  billing_cycle: string | null;
  seats: number | null;
}

export interface OrgWaitlistEntry {
  product_id: ProductId;
  status: "pending" | "invited" | "activated";
  created_at: string;
}

function isMissingWorkspaceProductsSchema(error: { code?: string; message?: string }): boolean {
  const message = String(error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("workspace_products") ||
    message.includes("product_waitlist") ||
    message.includes("does not exist")
  );
}

export function useWorkspaceProductsQuery() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";

  return useQuery({
    queryKey: queryKeys.workspace.products(orgId),
    queryFn: async (): Promise<OrgProductActivation[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase()
        .from("workspace_products")
        .select(
          "product_id, status, activated_at, trial_ends_at, expires_at, billing_cycle, seats",
        )
        .eq("org_id", orgId);
      if (error) {
        if (isMissingWorkspaceProductsSchema(error)) return [];
        throw new Error(error.message);
      }
      return (data ?? []) as OrgProductActivation[];
    },
    enabled: !!orgId,
    staleTime: STALE.slow,
    refetchOnMount: false,
    retry: shouldRetryQuery,
  });
}

export function useWorkspaceWaitlistQuery() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? "";

  return useQuery({
    queryKey: queryKeys.workspace.waitlist(orgId),
    queryFn: async (): Promise<OrgWaitlistEntry[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase()
        .from("product_waitlist")
        .select("product_id, status, created_at")
        .eq("org_id", orgId);
      if (error) {
        if (isMissingWorkspaceProductsSchema(error)) return [];
        throw new Error(error.message);
      }
      return (data ?? []) as OrgWaitlistEntry[];
    },
    enabled: !!orgId,
    staleTime: 120_000,
    retry: shouldRetryQuery,
  });
}

/**
 * Directly activate/deactivate a workspace product. Reuses the existing
 * `workspace_products` table and its `org_admins_manage_products` RLS policy
 * (owner/admin write access) — no RPC needed, this is a plain upsert.
 */
export function useSetWorkspaceProductStatusMutation() {
  const { currentOrganization } = useOrganization();
  const qc = useQueryClient();
  const orgId = currentOrganization?.id ?? "";

  return useMutation({
    mutationFn: async ({
      productId,
      status,
    }: {
      productId: ProductId;
      status: "active" | "inactive";
    }) => {
      if (!orgId) throw new Error("No active organization");
      const { error } = await supabase()
        .from("workspace_products")
        .upsert(
          {
            org_id: orgId,
            product_id: productId,
            status,
            activated_at: status === "active" ? new Date().toISOString() : null,
          },
          { onConflict: "org_id,product_id" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      if (!orgId) return;
      void qc.invalidateQueries({ queryKey: queryKeys.workspace.products(orgId) });
    },
  });
}

export function useJoinWaitlistMutation() {
  const { currentOrganization } = useOrganization();
  const qc = useQueryClient();
  const orgId = currentOrganization?.id ?? "";

  return useMutation({
    mutationFn: async ({
      productId,
      email,
      fleetSize,
      useCase,
    }: {
      productId: ProductId;
      email: string;
      fleetSize?: string;
      useCase?: string;
    }) => {
      const { data, error } = await supabase().rpc("join_product_waitlist", {
        p_product_id: productId,
        p_org_id: orgId,
        p_email: email,
        p_fleet_size: fleetSize ?? null,
        p_use_case: useCase ?? null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      if (!orgId) return;
      void qc.invalidateQueries({ queryKey: queryKeys.workspace.waitlist(orgId) });
    },
  });
}
