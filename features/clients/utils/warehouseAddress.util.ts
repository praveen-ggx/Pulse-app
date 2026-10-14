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
  const hit = warehouses.find((wh) => {
    const line = warehouseAddressLine(wh);
    return line !== "" && norm(line) === target;
  });
  return hit?.id ?? null;
}
