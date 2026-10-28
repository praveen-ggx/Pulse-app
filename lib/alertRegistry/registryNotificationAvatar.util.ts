import type { DriverRow } from "@/features/drivers/services/drivers.service";
import type { SalaryRequestWithDriverRow } from "@/features/drivers/services/salaryRequests.service";
import type {
  InboundPartnerDisplay,
  InboundProtocolInviteItem,
} from "@/lib/globalSync/inboundProtocol.types";
import type { NetworkNotificationRow } from "@/features/network/services/networkNotifications.service";
import type { GlobalOperationAlert } from "@/lib/globalSync/priorityEngine.util";
import type { ActiveTripSummary } from "@/lib/globalSync/types";
import {
  driverAvatarSeedFromId,
} from "@/lib/partyAvatarDisplay";
import type { CurrentOrganization } from "@/types/organization";

import type { RegistryNotificationAvatar } from "@/lib/alertRegistry/registryNotificationAvatar.types";

export type { RegistryNotificationAvatar };

function driverAvatarFromRow(
  driver: Pick<DriverRow, "avatar_url" | "avatar_seed"> | undefined,
  name: string,
  driverId: string,
): RegistryNotificationAvatar {
  return {
    name,
    entityType: "driver",
    avatarUrl: driver?.avatar_url ?? null,
    avatarSeed: driver?.avatar_seed?.trim() || driverAvatarSeedFromId(driverId),
    initialsColorSeed: driverId,
  };
}

function orgAvatar(
  org: CurrentOrganization | null | undefined,
  name: string,
): RegistryNotificationAvatar {
  return {
    name: org?.name?.trim() || name,
    entityType: "client",
    organizationImageUrl: org?.logo_url ?? null,
    initialsColorSeed: org?.id ?? name,
  };
}

function partnerAvatar(
  partnerOrgId: string | null | undefined,
  partnerDisplay: Record<string, InboundPartnerDisplay>,
  partnerAvatarUri: Record<string, string | null>,
  fallbackName: string,
): RegistryNotificationAvatar {
  if (!partnerOrgId) {
    return { name: fallbackName, entityType: "client", initialsColorSeed: fallbackName };
  }
  const profile = partnerDisplay[partnerOrgId];
  const resolvedUri = partnerAvatarUri[partnerOrgId];
  return {
    name: profile?.organizationName?.trim() || fallbackName,
    entityType: "client",
    organizationImageUrl:
      profile?.logoUrl ?? profile?.avatarUrl ?? resolvedUri ?? null,
    organizationAvatarSeed: profile?.orgAvatarSeed ?? profile?.avatarSeed ?? null,
    avatarUrl: profile?.ownerAvatarUrl ?? null,
    avatarSeed: profile?.avatarSeed ?? null,
    initialsColorSeed: partnerOrgId,
  };
}

function salaryDriverAvatarFields(
  req: SalaryRequestWithDriverRow,
): Pick<DriverRow, "avatar_url" | "avatar_seed"> | null {
  const driver = req.drivers;
  if (!driver) return null;
  const avatar_url =
    driver.avatar_url ?? driver.profiles?.avatar_url ?? null;
  const avatar_seed =
    driver.avatar_seed ?? driver.profiles?.avatar_seed ?? null;
  if (!avatar_url && !avatar_seed) return null;
  return { avatar_url, avatar_seed };
}

export function resolveSalaryRegistryAvatar(
  req: SalaryRequestWithDriverRow,
  driversById: Map<string, DriverRow>,
): RegistryNotificationAvatar {
  const name = req.drivers?.name?.trim() || "Driver";
  const cached = driversById.get(req.driver_id);
  const fromJoin = salaryDriverAvatarFields(req);
  const merged = cached ?? fromJoin ?? {
    avatar_url: null,
    avatar_seed: null,
  };
  return driverAvatarFromRow(merged, name, req.driver_id);
}

export function resolveOpsRegistryAvatar(
  ops: GlobalOperationAlert,
  ctx: {
    activeTrips: ActiveTripSummary[];
    driversById: Map<string, DriverRow>;
    org: CurrentOrganization | null | undefined;
    partnerDisplay: Record<string, InboundPartnerDisplay>;
    partnerAvatarUri: Record<string, string | null>;
  },
): RegistryNotificationAvatar {
  const trip = ops.trip_id
    ? ctx.activeTrips.find((t) => t.trip_id === ops.trip_id)
    : undefined;

  if (trip?.driver_id) {
    const driverName = trip.driver_display_name?.trim() || "Driver";
    return driverAvatarFromRow(
      ctx.driversById.get(trip.driver_id),
      driverName,
      trip.driver_id,
    );
  }

  return orgAvatar(ctx.org, "System");
}

/** Avatar for cross-org network notifications; keyed on the acting org. */
export function resolveNetworkRegistryAvatar(
  item: NetworkNotificationRow,
  ctx: {
    partnerDisplay: Record<string, InboundPartnerDisplay>;
    partnerAvatarUri: Record<string, string | null>;
  },
): RegistryNotificationAvatar {
  if (item.actor_org_id) {
    return partnerAvatar(
      item.actor_org_id,
      ctx.partnerDisplay,
      ctx.partnerAvatarUri,
      item.title,
    );
  }
  return {
    name: item.title?.trim() || "Partner",
    entityType: "supplier",
    initialsColorSeed: item.id,
  };
}

/** Avatar for inbound connection / driver invitation rows (notifications feed parity). */
export function resolveInboundInviteAvatar(
  item: InboundProtocolInviteItem,
): RegistryNotificationAvatar {
  const isDriver = item.kind === "driver";
  const resolvedOrgUri = (item.avatarUri ?? "").trim() || null;
  const rawLogo = (item.logoUrl ?? "").trim() || null;

  // `avatarUri` is pre-resolved in global sync (signed logo / owner photo / org seed preset).
  // Prefer it over raw `logoUrl` — storage paths block seed fallback and often fail to sign in UI.
  const organizationImageUrl = resolvedOrgUri ?? rawLogo;

  return {
    name: item.name?.trim() || "Partner",
    entityType: isDriver ? "driver" : "client",
    organizationImageUrl,
    organizationAvatarSeed: item.orgAvatarSeed ?? item.senderAvatarSeed ?? null,
    avatarUrl: isDriver
      ? (resolvedOrgUri ?? item.ownerAvatarUrl ?? null)
      : item.ownerAvatarUrl ?? null,
    avatarSeed: item.senderAvatarSeed ?? null,
    initialsColorSeed: item.partnerOrgId || item.id,
  };
}
