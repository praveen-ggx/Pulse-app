import type { ClientRow } from "@/features/clients/services/clients.service";
import { setInitialClientForDetail } from "@/features/clients/initialClientForDetail";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import { setInitialDriverForDetail } from "@/features/drivers/initialDriverForDetail";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { setInitialSupplierForDetail } from "@/features/suppliers/initialSupplierForDetail";
import { ROUTES } from "@/lib/routes";

/** Connections hub stores driver rows as `driver-{uuid}`. */
export function connectedDriverEntityId(connectionId: string): string {
  return connectionId.startsWith("driver-")
    ? connectionId.slice("driver-".length)
    : connectionId;
}

/** Finance ledger detail route for a hub connection (client / supplier / driver). */
export function connectedOrgLedgerDetailRoute(item: ConnectedOrg): string {
  if (item.role === "CLIENT") {
    return ROUTES.clientDetail(item.id, "cash");
  }
  if (item.role === "SUPPLIER") {
    return ROUTES.supplierDetail(item.id, "cash");
  }
  return ROUTES.driverDetail(connectedDriverEntityId(item.id), "ledger");
}

function clientSeedFromConnection(item: ConnectedOrg, orgId: string): ClientRow {
  return {
    id: item.id,
    organization_id: orgId,
    name: item.name,
    contact_person: null,
    phone: item.phone ?? "",
    email: null,
    address: null,
    gstin: null,
    pan_number: null,
    status: "active",
    created_at: "",
    updated_at: "",
    is_integrated: item.is_integrated,
    linked_organization_id: item.linked_organization_id ?? null,
    avatar_url: item.avatar_url ?? null,
    avatar_seed: item.avatar_seed ?? null,
  };
}

function supplierSeedFromConnection(item: ConnectedOrg, orgId: string): SupplierRow {
  return {
    id: item.id,
    organization_id: orgId,
    name: item.name,
    contact: null,
    company_name: item.name,
    contact_person: null,
    phone: item.phone ?? null,
    email: null,
    address: null,
    gstin: null,
    pan_number: null,
    cin: null,
    msme_number: null,
    tan_number: null,
    iec_number: null,
    is_active: true,
    is_verified: Boolean(item.is_kyc_verified),
    created_at: "",
    updated_at: "",
    is_integrated: item.is_integrated,
    linked_organization_id: item.linked_organization_id ?? null,
    avatar_url: item.avatar_url ?? null,
    avatar_seed: item.avatar_seed ?? null,
  };
}

function driverSeedFromConnection(item: ConnectedOrg, orgId: string): DriverRow {
  const id = connectedDriverEntityId(item.id);
  return {
    id,
    organization_id: orgId,
    user_id: null,
    name: item.name,
    phone: item.phone ?? null,
    status: "active",
    assigned_vehicle_id: null,
    created_at: "",
    updated_at: "",
    avatar_url: item.avatar_url ?? null,
    avatar_seed: item.avatar_seed ?? null,
  };
}

/**
 * Seed Finance detail first paint from the Network connection row / finite cache.
 * Does not write into get_*_detail_bundle caches.
 */
export function seedFinanceDetailFromNetworkConnection(input: {
  item: ConnectedOrg;
  orgId: string;
  clients: ClientRow[];
  suppliers: SupplierRow[];
  drivers: DriverRow[];
}): void {
  const { item, orgId, clients, suppliers, drivers } = input;
  if (item.role === "CLIENT") {
    const cached = clients.find((row) => row.id === item.id);
    setInitialClientForDetail(cached ?? clientSeedFromConnection(item, orgId));
    return;
  }
  if (item.role === "SUPPLIER") {
    const cached = suppliers.find((row) => row.id === item.id);
    setInitialSupplierForDetail(cached ?? supplierSeedFromConnection(item, orgId));
    return;
  }
  const driverId = connectedDriverEntityId(item.id);
  const cached = drivers.find((row) => row.id === driverId);
  setInitialDriverForDetail(cached ?? driverSeedFromConnection(item, orgId));
}
