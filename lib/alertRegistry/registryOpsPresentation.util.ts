import type { ClientRow } from "@/features/clients/services/clients.service";
import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import type { InboundPartnerDisplay } from "@/lib/globalSync/inboundProtocol.types";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import type { ActiveTripRecentEvent, ActiveTripSummary } from "@/lib/globalSync/types";
import type { PartyEntityType } from "@/lib/partyAvatarDisplay";
import type { CurrentOrganization } from "@/types/organization";

import {
  type RegistryNotificationAvatar,
  resolveOpsRegistryAvatar,
} from "@/lib/alertRegistry/registryNotificationAvatar.util";

export type RegistryPartyLookup = {
  activeTrips: ActiveTripSummary[];
  driversById: Map<string, DriverRow>;
  clientsById: Map<string, ClientRow>;
  suppliersById: Map<string, SupplierRow>;
  org: CurrentOrganization | null | undefined;
  partnerDisplay: Record<string, InboundPartnerDisplay>;
  partnerAvatarUri: Record<string, string | null>;
};

export type OpsRegistryCardPresentation = {
  avatar: RegistryNotificationAvatar;
  actorName: string;
  actionText: string;
  highlightText?: string;
  trailingText?: string;
  detail?: string;
};

function readMeta(event: ActiveTripRecentEvent | null): Record<string, unknown> | null {
  if (!event?.metadata || typeof event.metadata !== "object" || Array.isArray(event.metadata)) {
    return null;
  }
  return event.metadata as Record<string, unknown>;
}

export function findOpsSourceEvent(
  ops: GlobalOperationAlert,
  activeTrips: ActiveTripSummary[],
): ActiveTripRecentEvent | null {
  if (!ops.trip_id || !ops.id.startsWith("ev:")) return null;
  const prefix = `ev:${ops.trip_id}:`;
  if (!ops.id.startsWith(prefix)) return null;
  const eventId = ops.id.slice(prefix.length);
  const trip = activeTrips.find((t) => t.trip_id === ops.trip_id);
  return trip?.recent_events?.find((e) => e.id === eventId) ?? null;
}

function findOpsTrip(
  ops: GlobalOperationAlert,
  activeTrips: ActiveTripSummary[],
): ActiveTripSummary | undefined {
  return ops.trip_id
    ? activeTrips.find((t) => t.trip_id === ops.trip_id)
    : undefined;
}

function driverFallbackSeed(driverId: string): string {
  const value = (driverId ?? "").trim() || "driver";
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash + value.charCodeAt(i)) % 10;
  }
  return `driver-${hash + 1}`;
}

function partyAvatarFromClient(
  client: ClientRow,
  name: string,
): RegistryNotificationAvatar {
  return {
    name,
    entityType: "client",
    avatarUrl: client.avatar_url ?? null,
    avatarSeed: client.avatar_seed ?? null,
    organizationImageUrl: client.avatar_url ?? null,
    initialsColorSeed: client.id,
  };
}

function partyAvatarFromSupplier(
  supplier: SupplierRow,
  name: string,
): RegistryNotificationAvatar {
  const label =
    name ||
    supplier.company_name?.trim() ||
    supplier.name?.trim() ||
    "Supplier";
  return {
    name: label,
    entityType: "supplier",
    avatarUrl: supplier.avatar_url ?? null,
    avatarSeed: supplier.avatar_seed ?? null,
    organizationImageUrl: supplier.avatar_url ?? null,
    initialsColorSeed: supplier.id,
  };
}

function partyAvatarFromDriver(
  driver: Pick<DriverRow, "avatar_url" | "avatar_seed"> | undefined,
  name: string,
  driverId: string,
): RegistryNotificationAvatar {
  return {
    name,
    entityType: "driver",
    avatarUrl: driver?.avatar_url ?? null,
    avatarSeed: driver?.avatar_seed?.trim() || driverFallbackSeed(driverId),
    initialsColorSeed: driverId,
  };
}

function partnerAvatarFromOrgId(
  partnerOrgId: string | null | undefined,
  fallbackName: string,
  entityType: PartyEntityType,
  ctx: RegistryPartyLookup,
): RegistryNotificationAvatar {
  if (!partnerOrgId) {
    return { name: fallbackName, entityType, initialsColorSeed: fallbackName };
  }
  const profile = ctx.partnerDisplay[partnerOrgId];
  const resolvedUri = ctx.partnerAvatarUri[partnerOrgId];
  return {
    name: profile?.organizationName?.trim() || fallbackName,
    entityType,
    organizationImageUrl:
      profile?.logoUrl ?? profile?.avatarUrl ?? resolvedUri ?? null,
    organizationAvatarSeed: profile?.orgAvatarSeed ?? profile?.avatarSeed ?? null,
    avatarUrl: profile?.ownerAvatarUrl ?? null,
    avatarSeed: profile?.avatarSeed ?? null,
    initialsColorSeed: partnerOrgId,
  };
}

function formatOpsAmount(amount: number | null | undefined): string | undefined {
  if (amount == null || !Number.isFinite(Number(amount))) return undefined;
  return `₹${Math.abs(Number(amount)).toLocaleString("en-IN")}`;
}

function buildPaymentPresentation(
  ops: GlobalOperationAlert,
  ctx: RegistryPartyLookup,
  event: ActiveTripRecentEvent | null,
): OpsRegistryCardPresentation {
  const trip = findOpsTrip(ops, ctx.activeTrips);
  const meta = readMeta(event);
  const flow = String(meta?.flow ?? "").toLowerCase();
  const tripLabel = ops.trip_number ?? trip?.display_trip_id ?? trip?.trip_number ?? "trip";
  const amountLabel = formatOpsAmount(ops.amount ?? Number(meta?.amount ?? NaN));

  if (flow === "out") {
    const receiverOrgId =
      typeof meta?.receiver_org_id === "string" ? meta.receiver_org_id : null;
    const receiverName = String(meta?.receiver_org_name ?? "").trim();
    const supplier =
      trip?.supplier_id != null ? ctx.suppliersById.get(trip.supplier_id) : undefined;
    const supplierName =
      supplier?.company_name?.trim() ||
      supplier?.name?.trim() ||
      receiverName ||
      "Supplier";
    const avatar =
      supplier != null
        ? partyAvatarFromSupplier(supplier, supplierName)
        : partnerAvatarFromOrgId(receiverOrgId, supplierName, "supplier", ctx);

    return {
      avatar,
      actorName: supplierName,
      actionText: "received",
      highlightText: amountLabel,
      trailingText: `on ${tripLabel}`,
      detail: event?.content?.trim() || ops.subtitle?.trim() || undefined,
    };
  }

  const client =
    trip?.client_id != null ? ctx.clientsById.get(trip.client_id) : undefined;
  const clientName =
    client?.name?.trim() || client?.contact_person?.trim() || "Client";
  const avatar =
    client != null
      ? partyAvatarFromClient(client, clientName)
      : { name: clientName, entityType: "client" as const, initialsColorSeed: trip?.client_id };

  return {
    avatar,
    actorName: clientName,
    actionText: "paid",
    highlightText: amountLabel,
    trailingText: `on ${tripLabel}`,
    detail: event?.content?.trim() || ops.subtitle?.trim() || undefined,
  };
}

function buildUnassignedPresentation(
  ops: GlobalOperationAlert,
  ctx: RegistryPartyLookup,
): OpsRegistryCardPresentation {
  const trip = findOpsTrip(ops, ctx.activeTrips);
  const tripLabel = ops.trip_number ?? trip?.display_trip_id ?? trip?.trip_number ?? "trip";
  const client =
    trip?.client_id != null ? ctx.clientsById.get(trip.client_id) : undefined;
  const clientName =
    client?.name?.trim() || client?.contact_person?.trim() || tripLabel;
  const avatar =
    client != null
      ? partyAvatarFromClient(client, clientName)
      : resolveOpsRegistryAvatar(ops, ctx);

  return {
    avatar,
    actorName: tripLabel,
    actionText: "needs a driver change for",
    highlightText: clientName,
    detail: ops.subtitle?.trim() || `${tripLabel} · Change driver to continue`,
  };
}

function buildDriverOpsPresentation(
  ops: GlobalOperationAlert,
  ctx: RegistryPartyLookup,
): OpsRegistryCardPresentation {
  const trip = findOpsTrip(ops, ctx.activeTrips);
  const tripLabel = ops.trip_number ?? trip?.display_trip_id ?? trip?.trip_number ?? "trip";
  const driverId = trip?.driver_id ?? null;
  const driverName = trip?.driver_display_name?.trim() || "Driver";
  const avatar =
    driverId != null
      ? partyAvatarFromDriver(ctx.driversById.get(driverId), driverName, driverId)
      : resolveOpsRegistryAvatar(ops, ctx);

  if (ops.category === "vehicle_idle") {
    return {
      avatar,
      actorName: driverName,
      actionText: "is idle on",
      highlightText: tripLabel,
      detail: ops.subtitle?.trim() || undefined,
    };
  }

  if (ops.category === "late_log") {
    return {
      avatar,
      actorName: driverName,
      actionText: "is behind schedule on",
      highlightText: tripLabel,
      detail: ops.subtitle?.trim() || undefined,
    };
  }

  return {
    avatar: resolveOpsRegistryAvatar(ops, ctx),
    actorName: ctx.org?.name?.trim() || "Operations",
    actionText: "flagged",
    highlightText: tripLabel,
    trailingText: "on",
    detail: ops.subtitle?.trim() || undefined,
  };
}

export function buildOpsRegistryCardPresentation(
  ops: GlobalOperationAlert,
  ctx: RegistryPartyLookup,
): OpsRegistryCardPresentation {
  const event = findOpsSourceEvent(ops, ctx.activeTrips);

  if (ops.category === "payment_received") {
    return buildPaymentPresentation(ops, ctx, event);
  }

  if (ops.category === "unassigned_trip") {
    return buildUnassignedPresentation(ops, ctx);
  }

  if (
    ops.category === "late_log" ||
    ops.category === "vehicle_idle" ||
    (tripHasDriver(ops, ctx) && ops.trip_id)
  ) {
    return buildDriverOpsPresentation(ops, ctx);
  }

  return {
    avatar: resolveOpsRegistryAvatar(ops, ctx),
    actorName: ctx.org?.name?.trim() || "System",
    actionText: "flagged",
    highlightText: ops.trip_number ?? "trip",
    trailingText: "on",
    detail: ops.subtitle?.trim() || undefined,
  };
}

function tripHasDriver(ops: GlobalOperationAlert, ctx: RegistryPartyLookup): boolean {
  const trip = findOpsTrip(ops, ctx.activeTrips);
  return Boolean(trip?.driver_id);
}

export function opsRegistryActionLabel(ops: GlobalOperationAlert): string {
  if (ops.category === "payment_received") return "View payment";
  if (ops.category === "unassigned_trip") return "Change driver";
  if (ops.category === "late_log") return "View trip";
  if (ops.category === "vehicle_idle") return "View trip";
  return "View trip";
}
