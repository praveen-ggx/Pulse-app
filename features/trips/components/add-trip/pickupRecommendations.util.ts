/**
 * Pickup recommendations for Create Trip route step.
 * Sources: client address, client_warehouses, and (integrated) linked-org offices/warehouses.
 */
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { ClientWarehouse } from "@/features/clients/services/clientWarehouses.service";
import {
  joinAddressParts,
  warehouseAddressLine,
} from "@/features/clients/utils/warehouseAddress.util";
import type {
  OrganizationLocationType,
  OrganizationWorkspaceLocation,
} from "@/features/organization/services/organizationLocations.service";

export type PickupLocationKind = "office" | "warehouse";

export type PickupRecommendation = {
  id: string;
  title: string;
  /** Short type label shown as a pill (e.g. Registered office). */
  typeLabel: string;
  /** Full address line used as pickup text. */
  address: string;
  kind: PickupLocationKind;
  lat: number | null;
  lon: number | null;
  verified?: boolean;
};

const OFFICE_TYPES = new Set<OrganizationLocationType>([
  "registered_office",
  "branch_office",
  "primary_hub",
  "regional_office",
  "other",
]);

const WAREHOUSE_TYPES = new Set<OrganizationLocationType>([
  "warehouse",
  "dispatch_center",
]);

const TYPE_LABELS: Record<OrganizationLocationType, string> = {
  registered_office: "Registered office",
  branch_office: "Branch office",
  primary_hub: "Primary hub",
  regional_office: "Regional office",
  dispatch_center: "Dispatch center",
  warehouse: "Warehouse",
  other: "Office",
};

const joinParts = joinAddressParts;

function orgLocationAddressLine(loc: OrganizationWorkspaceLocation): string {
  return joinParts([
    loc.name,
    loc.address_line,
    joinParts([loc.city, loc.state]).replace(/ · /g, ", ") || null,
  ]);
}

function coordsOrNull(
  lat: number | null | undefined,
  lon: number | null | undefined,
): { lat: number | null; lon: number | null } {
  const ok =
    lat != null &&
    lon != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lon);
  return ok ? { lat: lat as number, lon: lon as number } : { lat: null, lon: null };
}

function isOrgLocationType(value: string): value is OrganizationLocationType {
  return value in TYPE_LABELS;
}

export function buildPickupRecommendations(
  client: ClientRow | null | undefined,
  warehouses: readonly ClientWarehouse[],
  orgLocations: readonly OrganizationWorkspaceLocation[] = [],
): PickupRecommendation[] {
  const out: PickupRecommendation[] = [];
  const seen = new Set<string>();

  const pushUnique = (rec: PickupRecommendation) => {
    const key = rec.address.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(rec);
  };

  // Linked-org offices first (integrated clients).
  for (const loc of orgLocations) {
    const type = isOrgLocationType(loc.location_type)
      ? loc.location_type
      : "other";
    if (!OFFICE_TYPES.has(type)) continue;
    const address = orgLocationAddressLine(loc);
    if (!address.trim()) continue;
    pushUnique({
      id: `org:${loc.id}`,
      title: loc.name?.trim() || TYPE_LABELS[type],
      typeLabel: TYPE_LABELS[type],
      address,
      kind: "office",
      lat: null,
      lon: null,
      verified: loc.is_verified,
    });
  }

  // Client HQ / registered / billing as office fallback.
  const defaultAddr = client?.address?.trim();
  if (defaultAddr) {
    pushUnique({
      id: `default:${client!.id}`,
      title: client!.name?.trim() || "Client office",
      typeLabel: "Default location",
      address: defaultAddr,
      kind: "office",
      lat: null,
      lon: null,
    });
  }

  // Linked-org warehouses / dispatch centers.
  for (const loc of orgLocations) {
    const type = isOrgLocationType(loc.location_type)
      ? loc.location_type
      : "other";
    if (!WAREHOUSE_TYPES.has(type)) continue;
    const address = orgLocationAddressLine(loc);
    if (!address.trim()) continue;
    pushUnique({
      id: `org:${loc.id}`,
      title: loc.name?.trim() || TYPE_LABELS[type],
      typeLabel: TYPE_LABELS[type],
      address,
      kind: "warehouse",
      lat: null,
      lon: null,
      verified: loc.is_verified,
    });
  }

  // Client warehouses (workspace-owned for this client).
  for (const wh of warehouses) {
    const address = warehouseAddressLine(wh);
    if (!address.trim()) continue;
    const { lat, lon } = coordsOrNull(wh.latitude, wh.longitude);
    pushUnique({
      id: `wh:${wh.id}`,
      title: wh.name?.trim() || "Warehouse",
      typeLabel: "Warehouse",
      address,
      kind: "warehouse",
      lat,
      lon,
    });
  }

  return out;
}

export function groupPickupRecommendations(
  recs: readonly PickupRecommendation[],
): { offices: PickupRecommendation[]; warehouses: PickupRecommendation[] } {
  return {
    offices: recs.filter((r) => r.kind === "office"),
    warehouses: recs.filter((r) => r.kind === "warehouse"),
  };
}

/** Prefer office (registered/default) then first warehouse when auto-filling. */
export function preferredPickupRecommendation(
  recs: readonly PickupRecommendation[],
): PickupRecommendation | null {
  return (
    recs.find((r) => r.kind === "office" && r.typeLabel === "Registered office") ??
    recs.find((r) => r.kind === "office") ??
    recs.find((r) => r.kind === "warehouse") ??
    null
  );
}
