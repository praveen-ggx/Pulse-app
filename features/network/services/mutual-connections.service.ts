/**
 * Mutual connections between viewer org and a target discover/connection org.
 *
 * Uses `get_mutual_connections` RPC (SECURITY DEFINER) so third-party
 * connection_requests for the target org are visible — direct table queries
 * are RLS-filtered to rows involving only the viewer org.
 *
 * Avatar enrichment matches Discover: merge `get_connection_partner_display_batch`
 * so org `logo_url` / owner photo still show when the mutuals RPC omits them.
 */
import { getLinkedOrgProfilesBatch } from "@/features/clients/services/clients.service";
import { runSingleflight } from "@/lib/cache/singleflight";
import { supabase } from "@/lib/supabase";
import { isSupabaseCircuitOpen } from "@/lib/supabaseHttp.util";

export type MutualConnectionRow = {
  id: string;
  name: string;
  avatar_seed: string | null;
  /** Org logo → owner profile avatar; null → initials/seed in UI. */
  avatar_url: string | null;
};

type MutualConnectionRpcRow = {
  id: string;
  name: string;
  avatar_seed: string | null;
  avatar_url: string | null;
};

function unwrapRpcRows(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data;
  const values = Object.values(record);
  if (
    values.length > 0 &&
    values.every(
      (value) =>
        value != null &&
        typeof value === "object" &&
        "id" in (value as object),
    )
  ) {
    return values;
  }
  if ("id" in record) return [record];
  return [];
}

function rowId(entry: unknown): string {
  if (entry == null || typeof entry !== "object") return "";
  const raw = (entry as { id?: unknown }).id;
  if (raw == null) return "";
  return String(raw).trim();
}

function asMutualRows(data: unknown): MutualConnectionRpcRow[] {
  const byId = new Map<string, MutualConnectionRpcRow>();
  for (const entry of unwrapRpcRows(data)) {
    const id = rowId(entry);
    if (!id || byId.has(id)) continue;
    const row = entry as Partial<MutualConnectionRpcRow>;
    byId.set(id, {
      id,
      name: typeof row.name === "string" ? row.name : "",
      avatar_seed: row.avatar_seed ?? null,
      avatar_url: row.avatar_url ?? null,
    });
  }
  return [...byId.values()];
}

async function enrichMutualsWithPartnerDisplay(
  rows: MutualConnectionRow[],
): Promise<MutualConnectionRow[]> {
  if (rows.length === 0) return rows;
  // The mutuals RPC already returns logo/owner avatar. Partner-display also
  // computes trip/rating/fleet/indent stats (~755ms mean in production) which
  // facepiles never use. Only batch orgs that still lack an avatar URL.
  const missingIds = rows
    .filter((row) => !(row.avatar_url ?? "").trim())
    .map((row) => row.id);
  if (missingIds.length === 0) return rows;
  const profiles = await getLinkedOrgProfilesBatch(missingIds);
  return rows.map((row) => {
    const profile = profiles[row.id];
    const batchUrl =
      (profile?.avatarUrl ?? "").trim() ||
      (profile?.logoUrl ?? "").trim() ||
      (profile?.ownerAvatarUrl ?? "").trim() ||
      "";
    const batchSeed =
      (profile?.avatarSeed ?? "").trim() ||
      (profile?.orgAvatarSeed ?? "").trim() ||
      "";
    return {
      ...row,
      avatar_url: (row.avatar_url ?? "").trim() || batchUrl || null,
      avatar_seed: (row.avatar_seed ?? "").trim() || batchSeed || null,
    };
  });
}

export async function getMutualConnections(
  viewerOrgId: string,
  targetOrgId: string,
): Promise<{ error: Error | null; mutuals: MutualConnectionRow[] }> {
  if (!viewerOrgId || !targetOrgId || viewerOrgId === targetOrgId) {
    return { error: null, mutuals: [] };
  }

  if (isSupabaseCircuitOpen()) {
    return { error: null, mutuals: [] };
  }

  const { data, error } = await runSingleflight(
    `get_mutual_connections:${viewerOrgId}:${targetOrgId}`,
    () =>
      supabase().rpc("get_mutual_connections", {
        p_viewer_org_id: viewerOrgId,
        p_target_org_id: targetOrgId,
      }),
  );

  if (error) {
    return { error: new Error(error.message), mutuals: [] };
  }

  const base = asMutualRows(data).map((row) => ({
    id: row.id,
    name: row.name,
    avatar_seed: row.avatar_seed ?? null,
    avatar_url: (row.avatar_url ?? "").trim() || null,
  }));

  try {
    return { error: null, mutuals: await enrichMutualsWithPartnerDisplay(base) };
  } catch {
    return { error: null, mutuals: base };
  }
}
