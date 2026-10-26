/**
 * Single source of truth for **client / supplier / driver** avatar hierarchy:
 * linked org logo/seed → contact avatar/seed → initials (via `PartyAvatar` / `resolvePartyDisplayUri`).
 */
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import {
  isIntegratedClientRow,
  isIntegratedSupplierRow,
} from "@/features/trips/visibility/tripVisibility";
import {
  driverAvatarSeedFromId,
  partyAvatarHasRenderableOutput,
  partyInitialsFromName,
  resolvePartyDisplayUri,
  type PartyEntityType,
} from "@/lib/partyAvatarDisplay";
import { resolveAvatarPublicUrl } from "@/lib/avatarUpload";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";

export interface ResolvedPartyAvatarIdentity {
  displayName: string;
  entityType: PartyEntityType;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  isIntegrated?: boolean;
}

/** Fields on `FinancialRowData` used to render ledger party identity. */
export type FinancialRowPartyIdentityFields = {
  ledgerPartyType?: "client" | "supplier" | "driver" | "vehicle" | null;
  name?: string;
  profileImageUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  counterpartyIntegrated?: boolean | null;
  is_integrated?: boolean | null;
};

export function supplierDisplayName(s: SupplierRow): string {
  const cn = (s.company_name ?? "").trim();
  const n = (s.name ?? "").trim();
  return cn || n || "—";
}

export function resolvePartyAvatarIdentityFromClient(
  client: ClientRow,
  linkedOrgBranding?: LinkedOrgDisplay | null,
): ResolvedPartyAvatarIdentity {
  const org = linkedOrgBranding ?? undefined;
  return {
    displayName: (client.name ?? "").trim() || "—",
    entityType: "client",
    organizationImageUrl: org?.avatarUrl ?? null,
    organizationAvatarSeed: org?.avatarSeed ?? null,
    avatarUrl: resolveAvatarPublicUrl(client.avatar_url),
    avatarSeed: (client.avatar_seed ?? "").trim() || null,
    isIntegrated: isIntegratedClientRow(client),
  };
}

export function resolvePartyAvatarIdentityFromSupplier(
  supplier: SupplierRow,
  linkedOrgBranding?: LinkedOrgDisplay | null,
): ResolvedPartyAvatarIdentity {
  const org = linkedOrgBranding ?? undefined;
  return {
    displayName: supplierDisplayName(supplier),
    entityType: "supplier",
    organizationImageUrl: org?.avatarUrl ?? null,
    organizationAvatarSeed: org?.avatarSeed ?? null,
    avatarUrl: resolveAvatarPublicUrl(supplier.avatar_url),
    avatarSeed: (supplier.avatar_seed ?? "").trim() || null,
    isIntegrated: isIntegratedSupplierRow(supplier),
  };
}

export function resolvePartyAvatarIdentityFromDriver(
  driver: DriverRow | null | undefined,
  displayName: string,
  resolvedAvatarUrl?: string | null,
): ResolvedPartyAvatarIdentity {
  const name = (displayName ?? "").trim() || "—";
  const url =
    (driver?.avatar_url ?? "").trim() ||
    (resolvedAvatarUrl ?? "").trim() ||
    null;
  const driverId = (driver?.id ?? "").trim();
  const dbSeed = (driver?.avatar_seed ?? "").trim() || null;
  return {
    displayName: name,
    entityType: "driver",
    avatarUrl: url,
    avatarSeed: dbSeed || (driverId ? driverAvatarSeedFromId(driverId) : null),
    isIntegrated: false,
  };
}

export interface LedgerIdentityContext {
  clientById: Map<string, ClientRow>;
  supplierById: Map<string, SupplierRow>;
  driverById: Map<string, DriverRow>;
  linkedOrgDisplayMap: Record<string, LinkedOrgDisplay>;
  profileImages: Record<string, string>;
  driverProfileImageUrls?: Record<string, string>;
  tripPartyMap?: Record<
    string,
    {
      client_id?: string | null;
      supplier_id?: string | null;
      driver_id?: string | null;
    }
  >;
  /** Caller-provided resolved party label (matches ledger `getResolvedPartyName`). */
  partyDisplayName: string;
}

function ledgerIdentityIsRenderable(i: ResolvedPartyAvatarIdentity): boolean {
  return partyAvatarHasRenderableOutput({
    name: i.displayName,
    organizationImageUrl: i.organizationImageUrl,
    organizationAvatarSeed: i.organizationAvatarSeed,
    avatarUrl: i.avatarUrl,
    avatarSeed: i.avatarSeed,
    entityType: i.entityType,
  });
}

function deriveLedgerPartyType(
  row: LedgerRow,
  tripPartyMap: LedgerIdentityContext["tripPartyMap"],
): "client" | "supplier" | "driver" | "vehicle" {
  if (row.contact_type === "dco") return "supplier";
  const isDriverPayment =
    row.contact_type === "driver" ||
    (!row.contact_type && (row.driver_name ?? "").trim() !== "");
  let derivedPartyType = row.contact_type;
  if (!derivedPartyType && row.trip_id && tripPartyMap?.[row.trip_id]) {
    const pm = tripPartyMap[row.trip_id];
    if (row.amount_in && pm.client_id) derivedPartyType = "client";
    if (row.amount_out && pm.supplier_id) derivedPartyType = "supplier";
  }
  if (derivedPartyType === "client") return "client";
  if (derivedPartyType === "supplier") return "supplier";
  if (isDriverPayment) return "driver";
  return "vehicle";
}

/**
 * Resolver for a raw ledger row + entity maps (sync). Use everywhere ledger party avatars appear.
 */
export function resolveLedgerRowPartyIdentity(
  row: LedgerRow,
  ctx: LedgerIdentityContext,
): ResolvedPartyAvatarIdentity | null {
  const tripPartyMap = ctx.tripPartyMap;
  const ledgerPartyType = deriveLedgerPartyType(row, tripPartyMap);
  const driverUrls = ctx.driverProfileImageUrls ?? {};

  if (ledgerPartyType === "driver") {
    const driverId =
      (row.contact_id ?? "").trim() ||
      (row.trip_id && tripPartyMap?.[row.trip_id]?.driver_id
        ? String(tripPartyMap[row.trip_id]!.driver_id ?? "").trim()
        : "");
    const d = driverId ? ctx.driverById.get(driverId) : undefined;
    const contactKey = (row.contact_id ?? "").trim();
    const mergedUrl =
      (row.profileImageUrl ?? "").trim() ||
      (d?.avatar_url ?? "").trim() ||
      (driverId ? driverUrls[driverId] : "") ||
      (contactKey ? ctx.profileImages[contactKey] : "") ||
      null;
    const i = resolvePartyAvatarIdentityFromDriver(
      d ?? null,
      ctx.partyDisplayName,
      mergedUrl,
    );
    return ledgerIdentityIsRenderable(i) ? i : null;
  }

  if (ledgerPartyType === "client") {
    const counterpartyId =
      row.contact_id ??
      (row.trip_id ? tripPartyMap?.[row.trip_id]?.client_id ?? null : null);
    const id = counterpartyId ? String(counterpartyId).trim() : "";
    const client = id ? ctx.clientById.get(id) : undefined;
    if (!client) {
      const minimal: ResolvedPartyAvatarIdentity = {
        displayName: ctx.partyDisplayName,
        entityType: "client",
        isIntegrated: false,
      };
      return ledgerIdentityIsRenderable(minimal) ? minimal : null;
    }
    const oid = (client.linked_organization_id ?? "").trim();
    const branding = oid ? ctx.linkedOrgDisplayMap[oid] : undefined;
    const i = resolvePartyAvatarIdentityFromClient(client, branding);
    return ledgerIdentityIsRenderable(i) ? i : null;
  }

  if (ledgerPartyType === "supplier") {
    const counterpartyId =
      row.contact_id ??
      (row.trip_id ? tripPartyMap?.[row.trip_id]?.supplier_id ?? null : null);
    const id = counterpartyId ? String(counterpartyId).trim() : "";
    const supplier = id ? ctx.supplierById.get(id) : undefined;
    if (!supplier) {
      const minimal: ResolvedPartyAvatarIdentity = {
        displayName: ctx.partyDisplayName,
        entityType: "supplier",
        isIntegrated: false,
      };
      return ledgerIdentityIsRenderable(minimal) ? minimal : null;
    }
    const oid = (supplier.linked_organization_id ?? "").trim();
    const branding = oid ? ctx.linkedOrgDisplayMap[oid] : undefined;
    const i = resolvePartyAvatarIdentityFromSupplier(supplier, branding);
    return ledgerIdentityIsRenderable(i) ? i : null;
  }

  return null;
}

export function resolvedIdentityToEntityAvatarProps(
  id: ResolvedPartyAvatarIdentity,
): import("@/components/EntityAvatar").EntityAvatarProps {
  return {
    name: id.displayName,
    avatarUrl: id.avatarUrl,
    avatarSeed: id.avatarSeed,
    organizationImageUrl: id.organizationImageUrl,
    organizationAvatarSeed: id.organizationAvatarSeed,
    entityType: id.entityType,
    isIntegrated: id.isIntegrated ?? false,
  };
}

/** Receipt / preview modals — same avatar hierarchy as ledger list rows. */
export function resolveLedgerReceiptPartyAvatar(
  row: LedgerRow,
  ctx: LedgerIdentityContext,
): {
  name: string;
  entityType: PartyEntityType;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  isIntegrated?: boolean;
  initialsColorSeed?: string | null;
} | undefined {
  const identity = resolveLedgerRowPartyIdentity(row, ctx);
  if (!identity) return undefined;
  return {
    name: identity.displayName,
    entityType: identity.entityType,
    avatarUrl: identity.avatarUrl,
    avatarSeed: identity.avatarSeed,
    organizationImageUrl: identity.organizationImageUrl,
    organizationAvatarSeed: identity.organizationAvatarSeed,
    isIntegrated: identity.isIntegrated,
    initialsColorSeed: row.contact_id ?? row.party_name,
  };
}

/** Tooltip / accessibility: full name + role. */
export function getEntityDisplayLabel(
  id: ResolvedPartyAvatarIdentity,
  roleLabel?: string,
): string {
  const role =
    roleLabel ??
    (id.entityType === "driver"
      ? "Driver"
      : id.entityType === "supplier"
        ? "Supplier"
        : "Client");
  return `${id.displayName} · ${role}`;
}

/**
 * Unified display payload (for tooltips, tests, or non-React consumers).
 */
export function getEntityDisplayData(identity: ResolvedPartyAvatarIdentity): {
  name: string;
  imageUrl: string | null;
  fallbackInitials: string;
} {
  const imageUrl = resolvePartyDisplayUri({
    organizationImageUrl: identity.organizationImageUrl,
    organizationAvatarSeed: identity.organizationAvatarSeed,
    avatarUrl: identity.avatarUrl,
    avatarSeed: identity.avatarSeed,
    entityType: identity.entityType,
  });
  return {
    name: identity.displayName,
    imageUrl,
    fallbackInitials: partyInitialsFromName(identity.displayName),
  };
}

export function resolveFinancialRowPartyIdentity(
  data: FinancialRowPartyIdentityFields,
): ResolvedPartyAvatarIdentity | null {
  const pt = data.ledgerPartyType;
  if (!pt || pt === "vehicle") return null;
  const rawName = (data.name ?? "").trim();
  const entityType: PartyEntityType =
    pt === "driver" ? "driver" : pt === "supplier" ? "supplier" : "client";

  const identity: ResolvedPartyAvatarIdentity =
    pt === "driver"
      ? {
          displayName: rawName,
          entityType: "driver",
          avatarUrl: (data.profileImageUrl ?? "").trim() || null,
          avatarSeed: (data.avatarSeed ?? "").trim() || null,
          isIntegrated: Boolean(data.counterpartyIntegrated),
        }
      : {
          displayName: rawName,
          entityType: pt,
          organizationImageUrl: (data.organizationImageUrl ?? "").trim() || null,
          organizationAvatarSeed: (data.organizationAvatarSeed ?? "").trim() || null,
          avatarUrl: (data.profileImageUrl ?? "").trim() || null,
          avatarSeed: (data.avatarSeed ?? "").trim() || null,
          isIntegrated: Boolean(
            data.counterpartyIntegrated ?? data.is_integrated ?? false,
          ),
        };

  if (
    !partyAvatarHasRenderableOutput({
      name: rawName || "—",
      organizationImageUrl: identity.organizationImageUrl,
      organizationAvatarSeed: identity.organizationAvatarSeed,
      avatarUrl: identity.avatarUrl,
      avatarSeed: identity.avatarSeed,
      entityType,
    })
  ) {
    return null;
  }

  return identity;
}
