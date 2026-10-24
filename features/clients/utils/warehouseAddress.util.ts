/**
 * Warehouse address line used as pickup text (Create trip / indent pickup
 * picker) and the reverse lookup that links a saved indent to its warehouse.
 */
import type { ClientWarehouse } from "@/features/clients/services/clientWarehouses.service";

type AddressFields = Pick<ClientWarehouse, "name" | "address" | "city" | "state" | "pincode">;

export function joinAddressParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" · ");
}

export function warehouseAddressLine(wh: AddressFields): string {
  return joinAddressParts([
    wh.name,
    wh.address,
    joinAddressParts([wh.city, wh.state]).replace(/ · /g, ", ") || null,
    wh.pincode,
  ]);
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The warehouse whose suggested pickup text the user kept, or null when the
 * pickup was typed / edited. Ground Ops trip visibility keys off this link
 * (indents.warehouse_id), so only an exact match counts.
 */
export function warehouseIdForPickup(
  pickup: string | null | undefined,
  warehouses: readonly (AddressFields & { id: string })[],
): string | null {
  if (!pickup?.trim()) return null;
  const target = norm(pickup);
  const hits = warehouses.filter((wh) => {
    const line = warehouseAddressLine(wh);
    return line !== "" && norm(line) === target;
  });
  // Two warehouses with the same address line: never pick one arbitrarily.
  return hits.length === 1 ? hits[0]!.id : null;
}

export type IndentWarehouseLane = {
  client_id: string | null;
  origin_warehouse_id: string | null;
};

/**
 * The client warehouse an indent belongs to (indents.warehouse_id), or null.
 * `warehouses` are the indent client's warehouses; anything outside them is
 * rejected, so a warehouse of another client is never linked.
 *
 * 1. The explicitly chosen warehouse.
 * 2. The saved lane's pickup warehouse, when the lane is the same client's.
 * 3. A pickup that is exactly one warehouse's suggested address line.
 * No city / partial / approximate matching.
 */
export function resolveIndentWarehouseId(input: {
  clientId: string | null | undefined;
  warehouses: readonly (AddressFields & { id: string; client_id?: string | null })[];
  explicitWarehouseId?: string | null;
  lane?: IndentWarehouseLane | null;
  pickup?: string | null;
}): string | null {
  const { clientId, explicitWarehouseId, lane, pickup } = input;
  if (!clientId) return null;
  const own = input.warehouses.filter((wh) => wh.client_id == null || wh.client_id === clientId);
  const isOwn = (id: string | null | undefined) => Boolean(id && own.some((wh) => wh.id === id));

  if (isOwn(explicitWarehouseId)) return explicitWarehouseId!;
  if (lane && lane.client_id === clientId && isOwn(lane.origin_warehouse_id)) {
    return lane.origin_warehouse_id!;
  }
  return warehouseIdForPickup(pickup, own);
}

/**
 * Create-indent hint when the pickup will not link to any of the client's
 * warehouses (Ground Ops of those warehouses would not see the trip). Typing a
 * pickup stays allowed; null when there is nothing to warn about or the
 * selected lane's details are not loaded yet.
 */
export function pickupWarehouseLinkWarning(input: {
  clientId: string | null | undefined;
  clientName?: string | null;
  warehouses: readonly (AddressFields & { id: string; client_id?: string | null })[];
  laneSelected: boolean;
  lane: IndentWarehouseLane | null | undefined;
  pickup: string | null | undefined;
}): string | null {
  const { clientId, warehouses, laneSelected, lane, pickup } = input;
  if (!clientId || warehouses.length === 0 || !pickup?.trim()) return null;
  if (laneSelected && !lane) return null;
  if (resolveIndentWarehouseId({ clientId, warehouses, lane, pickup })) return null;
  const client = input.clientName?.trim() || "this client";
  return laneSelected
    ? `This lane has no pickup warehouse, so the trip won't be linked to any of ${client}'s warehouses and their Ground Ops won't see it. Set the lane's pickup warehouse in the client's lanes to fix this.`
    : `This pickup isn't one of ${client}'s saved warehouses, so the trip won't be linked to a warehouse and their Ground Ops won't see it. If it is a warehouse pickup, choose it from the pickup suggestions.`;
}

/**
 * Why a lane cannot be saved with this pickup warehouse, or null when it can.
 * Every lane needs one of its client's warehouses: indents from the lane link
 * to it, and Ground Ops visibility keys off that link. Adhoc indents are not
 * lanes and stay free to use a typed pickup.
 */
export function laneWarehouseError(input: {
  warehouseId: string | null | undefined;
  clientWarehouseIds: readonly string[];
}): string | null {
  if (input.clientWarehouseIds.length === 0) {
    return "Add a warehouse for this client first. Every lane needs a pickup warehouse so Ground Ops can see its trips.";
  }
  if (!input.warehouseId) {
    return "Choose the pickup warehouse. Every lane needs one so Ground Ops can see its trips.";
  }
  if (!input.clientWarehouseIds.includes(input.warehouseId)) {
    return "That pickup warehouse is not one of this client's warehouses. Choose one of the client's warehouses.";
  }
  return null;
}
