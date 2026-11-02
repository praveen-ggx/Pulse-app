/**
 * Ground Ops warehouse assignment (organization_member_warehouses).
 * A Ground Ops member sees only trips whose indent belongs to an assigned
 * warehouse (RLS trips_ground_ops_select_assigned). Pending phone invites carry
 * the list as permissions.warehouseIds and accept_pending_team_invitation
 * replays it into this table.
 */
import { supabase } from "@/lib/supabase";

export type OrgWarehouseOption = {
  id: string;
  name: string;
  city: string | null;
  clientName: string | null;
  /** Owning client (null for the client-picker shape). */
  clientId?: string | null;
};

/** Every live client warehouse in the org, for the Ground Ops picker. */
export async function listOrgWarehouses(
  orgId: string,
): Promise<{ error: Error | null; warehouses: OrgWarehouseOption[] }> {
  const { data, error } = await supabase()
    .from("client_warehouses")
    .select("id, name, city, client_id, clients(name)")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) return { error: new Error(error.message), warehouses: [] };
  const rows = (data ?? []) as {
    id: string;
    name: string;
    city: string | null;
    client_id: string | null;
    clients: { name: string | null } | { name: string | null }[] | null;
  }[];
  return {
    error: null,
    warehouses: rows.map((r) => {
      const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        clientName: client?.name ?? null,
        clientId: r.client_id,
      };
    }),
  };
}

/** Every live client in the org, shaped for the Sourcing client picker. */
export async function listOrgClientOptions(
  orgId: string,
): Promise<{ error: Error | null; clients: OrgWarehouseOption[] }> {
  const { data, error } = await supabase()
    .from("clients")
    .select("id, name")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) return { error: new Error(error.message), clients: [] };
  return {
    error: null,
    clients: ((data ?? []) as { id: string; name: string | null }[]).map((r) => ({
      id: r.id,
      name: r.name?.trim() || "Unnamed client",
      city: null,
      clientName: "Clients",
    })),
  };
}

export async function getMemberWarehouseIds(
  memberId: string,
): Promise<{ error: Error | null; warehouseIds: string[] }> {
  const { data, error } = await supabase()
    .from("organization_member_warehouses")
    .select("warehouse_id")
    .eq("organization_member_id", memberId);
  if (error) return { error: new Error(error.message), warehouseIds: [] };
  return { error: null, warehouseIds: (data ?? []).map((r) => r.warehouse_id as string) };
}

/** Replace a member's warehouse set (adds missing, removes unticked). */
export async function setMemberWarehouseIds(
  memberId: string,
  warehouseIds: string[],
): Promise<{ error: Error | null }> {
  const wanted = Array.from(new Set(warehouseIds));
  const current = await getMemberWarehouseIds(memberId);
  if (current.error) return { error: current.error };

  const toRemove = current.warehouseIds.filter((id) => !wanted.includes(id));
  if (toRemove.length > 0) {
    const { error } = await supabase()
      .from("organization_member_warehouses")
      .delete()
      .eq("organization_member_id", memberId)
      .in("warehouse_id", toRemove);
    if (error) return { error: new Error(error.message) };
  }

  const toAdd = wanted.filter((id) => !current.warehouseIds.includes(id));
  if (toAdd.length > 0) {
    const { error } = await supabase()
      .from("organization_member_warehouses")
      .upsert(
        toAdd.map((warehouse_id) => ({ organization_member_id: memberId, warehouse_id })),
        { onConflict: "organization_member_id,warehouse_id", ignoreDuplicates: true },
      );
    if (error) return { error: new Error(error.message) };
  }
  return { error: null };
}
