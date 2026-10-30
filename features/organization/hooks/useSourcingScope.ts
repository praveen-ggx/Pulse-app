/**
 * The signed-in Sourcing member's scope (assigned clients + warehouses and the
 * org indents they cover). `active` is false for every other role, and the
 * filters then let everything through. While a Sourcing scope is loading or
 * failed, nothing is in scope (fail closed).
 *
 * App-side only — see sourcingScope.util.ts.
 */
import { useOptionalActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import { useOptionalAuth } from "@/contexts/AuthContext";
import {
  indentInSourcingScope,
  sourcingClientIdsFromPermissions,
  sourcingScopeIsEmpty,
  tripInSourcingScope,
  type SourcingScope,
} from "@/features/organization/utils/sourcingScope.util";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

const PAGE = 1000;

/**
 * Query data is plain arrays: the query cache is persisted to storage, and a
 * Set comes back from JSON as `{}` (crashed trip detail with `set.has`).
 */
type SourcingScopeData = { clientIds: string[]; warehouseIds: string[]; indentIds: string[] };

const EMPTY_SCOPE_DATA: SourcingScopeData = { clientIds: [], warehouseIds: [], indentIds: [] };

const asIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Rebuild Sets from (possibly rehydrated) query data; any bad shape → empty. */
function toScope(data: SourcingScopeData | null | undefined): SourcingScope {
  return {
    clientIds: new Set(asIds(data?.clientIds)),
    warehouseIds: new Set(asIds(data?.warehouseIds)),
    indentIds: new Set(asIds(data?.indentIds)),
  };
}

async function loadSourcingScope(orgId: string): Promise<SourcingScopeData> {
  // Read the signed-in user from the session so screens rendered outside
  // AuthProvider (and their tests) can still call this hook.
  const { data: session } = await supabase().auth.getSession();
  const userId = session.session?.user?.id ?? null;
  if (!userId) return EMPTY_SCOPE_DATA;
  const { data: member, error: memberError } = await supabase()
    .from("organization_members")
    .select("id, permissions")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (memberError) throw new Error(memberError.message);
  if (!member) return EMPTY_SCOPE_DATA;

  // org_member_warehouses_self_select lets a member read their own rows.
  const { data: whRows, error: whError } = await supabase()
    .from("organization_member_warehouses")
    .select("warehouse_id")
    .eq("organization_member_id", member.id as string);
  if (whError) throw new Error(whError.message);

  const clientIds = sourcingClientIdsFromPermissions(member.permissions);
  const warehouseIds = (whRows ?? []).map((r) => r.warehouse_id as string);
  const scope: SourcingScopeData = { clientIds, warehouseIds, indentIds: [] };
  if (clientIds.length === 0 && warehouseIds.length === 0) return scope;

  const ors: string[] = [];
  if (clientIds.length > 0) ors.push(`client_id.in.(${clientIds.join(",")})`);
  if (warehouseIds.length > 0) ors.push(`warehouse_id.in.(${warehouseIds.join(",")})`);
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase()
      .from("indents")
      .select("id")
      .eq("organization_id", orgId)
      .or(ors.join(","))
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) scope.indentIds.push(row.id as string);
    if (!data || data.length < PAGE) break;
  }
  return scope;
}

export function useSourcingScope(orgId: string | null) {
  const memberPlatformRole = useOptionalActiveWorkspace()?.memberPlatformRole ?? null;
  const active = memberPlatformRole === "sourcing";
  // Keyed per user so a second login on the same browser never reuses a scope.
  const userId = useOptionalAuth()?.user?.uid ?? null;

  const query = useQuery({
    // v2: arrays, not Sets — never rehydrate the old (broken) cached shape.
    queryKey: ["sourcing-scope-v2", orgId, userId],
    enabled: active && !!orgId,
    // An owner re-scopes from another device — re-check when screens open.
    staleTime: 60_000,
    refetchOnMount: "always",
    queryFn: () => loadSourcingScope(orgId as string),
  });

  const scope = useMemo(() => (active ? toScope(query.data) : null), [active, query.data]);

  const filterIndents = useCallback(
    <T extends { id: string; client_id?: string | null; warehouse_id?: string | null }>(
      rows: T[],
    ): T[] => (scope ? rows.filter((r) => indentInSourcingScope(scope, r)) : rows),
    [scope],
  );
  const filterTrips = useCallback(
    <T extends { indent_id?: string | null; source_indent_id?: string | null; client_id?: string | null }>(
      rows: T[],
    ): T[] => (scope ? rows.filter((r) => tripInSourcingScope(scope, r)) : rows),
    [scope],
  );

  return useMemo(
    () => ({
      active,
      isLoading: active && query.isLoading,
      /** Sourcing member with no client or warehouse assigned yet. */
      missingScope: active && query.isSuccess && !!scope && sourcingScopeIsEmpty(scope),
      scope,
      filterIndents,
      filterTrips,
    }),
    [active, query.isLoading, query.isSuccess, scope, filterIndents, filterTrips],
  );
}
