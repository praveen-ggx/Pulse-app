/**
 * Resolve party avatars for DCO receivables — same stack as Finance clients:
 * linked org logo → client photo/seed → org partner display → offline role icon.
 */
import {
  getClientDetails,
  getLinkedOrgProfile,
  getLinkedOrgProfilesBatch,
  type ClientRow,
  type OrgDisplayProfile,
} from "@/features/clients/services/clients.service";
import {
  type DriverPartyReceivable,
  MARKETPLACE_PARTY_ID,
  partyAvatarLookup,
  shipperPartyIdForTrip,
  tripsForDriverParty,
} from "@/features/drivers/utils/driverPartyReceivables.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import { resolvePartyAvatarIdentityFromClient } from "@/lib/entityIdentity";
import { pickPartyOrganizationImageUrl } from "@/lib/media/partyOrganizationImage.util";
import {
  memoDriverClientDetails,
  memoDriverLinkedOrgProfile,
} from "@/features/drivers/utils/driverPartyAvatarCache.util";

function cachedClientDetails(clientId: string): ReturnType<typeof getClientDetails> {
  return memoDriverClientDetails(clientId, () => getClientDetails(clientId));
}

function cachedLinkedOrgProfile(orgId: string): ReturnType<typeof getLinkedOrgProfile> {
  return memoDriverLinkedOrgProfile(orgId, () => getLinkedOrgProfile(orgId));
}

export {
  bindDriverPartyAvatarUser,
  bindDriverPartyAvatarWorkspace,
  clearDriverPartyAvatarCache,
  clearDriverPartyAvatarCacheForTests,
} from "@/features/drivers/utils/driverPartyAvatarCache.util";

export type DriverPartyAvatarFields = {
  avatarUrl: string | null;
  avatarSeed: string | null;
  organizationImageUrl: string | null;
  organizationAvatarSeed: string | null;
  isIntegrated: boolean;
};

export const EMPTY_DRIVER_PARTY_AVATAR: DriverPartyAvatarFields = {
  avatarUrl: null,
  avatarSeed: null,
  organizationImageUrl: null,
  organizationAvatarSeed: null,
  isIntegrated: false,
};

function fieldsFromOrgProfile(
  profile: OrgDisplayProfile | null | undefined,
): DriverPartyAvatarFields | null {
  if (!profile) return null;
  return {
    avatarUrl: null,
    avatarSeed: null,
    organizationImageUrl: pickPartyOrganizationImageUrl({
      logoUrl: profile.logoUrl,
      organizationImageUrl: profile.avatarUrl,
    }),
    organizationAvatarSeed:
      (profile.orgAvatarSeed ?? profile.avatarSeed ?? "").trim() || null,
    isIntegrated: true,
  };
}

function fieldsFromClient(
  client: ClientRow,
  orgById: Record<string, OrgDisplayProfile>,
): DriverPartyAvatarFields {
  const linkedOrgId = (client.linked_organization_id ?? "").trim();
  const fromBatch = linkedOrgId ? orgById[linkedOrgId] : undefined;
  const linked = fromBatch
    ? {
        avatarUrl:
          pickPartyOrganizationImageUrl({
            logoUrl: fromBatch.logoUrl,
            organizationImageUrl: fromBatch.avatarUrl,
          }) ?? undefined,
        avatarSeed:
          (fromBatch.orgAvatarSeed ?? fromBatch.avatarSeed ?? "").trim() || undefined,
      }
    : null;
  const identity = resolvePartyAvatarIdentityFromClient(client, linked);
  return {
    avatarUrl: identity.avatarUrl ?? null,
    avatarSeed: identity.avatarSeed ?? null,
    organizationImageUrl: identity.organizationImageUrl ?? null,
    organizationAvatarSeed: identity.organizationAvatarSeed ?? null,
    isIntegrated: identity.isIntegrated === true,
  };
}

async function fieldsFromOrgId(
  orgId: string | null,
  orgById: Record<string, OrgDisplayProfile>,
): Promise<DriverPartyAvatarFields> {
  if (!orgId) return EMPTY_DRIVER_PARTY_AVATAR;
  const fromBatch = fieldsFromOrgProfile(orgById[orgId]);
  if (fromBatch) return fromBatch;
  const { profile } = await cachedLinkedOrgProfile(orgId);
  if (!profile) return EMPTY_DRIVER_PARTY_AVATAR;
  return {
    avatarUrl: null,
    avatarSeed: null,
    organizationImageUrl: pickPartyOrganizationImageUrl({
      organizationImageUrl: profile.avatarUrl,
    }),
    organizationAvatarSeed: (profile.avatarSeed ?? "").trim() || null,
    isIntegrated: true,
  };
}

/** Same avatar stack as the Self receivables list, keyed by client id. */
export async function resolveClientPartyAvatarMap(
  clients: ClientRow[],
): Promise<Record<string, DriverPartyAvatarFields>> {
  const orgIds = [
    ...new Set(
      clients
        .map((client) => (client.linked_organization_id ?? "").trim())
        .filter((id): id is string => !!id),
    ),
  ];
  const orgById = orgIds.length ? await getLinkedOrgProfilesBatch(orgIds) : {};
  const out: Record<string, DriverPartyAvatarFields> = {};
  for (const client of clients) {
    out[client.id] = fieldsFromClient(client, orgById);
  }
  return out;
}

export async function resolveDriverPartyAvatar(
  partyId: string,
  trips: TripRow[],
): Promise<DriverPartyAvatarFields> {
  if (!partyId || partyId === MARKETPLACE_PARTY_ID) return EMPTY_DRIVER_PARTY_AVATAR;
  const { clientId, orgId } = partyAvatarLookup(partyId, trips);
  const seedOrgIds = [orgId].filter(Boolean) as string[];
  const orgById = seedOrgIds.length ? await getLinkedOrgProfilesBatch(seedOrgIds) : {};

  if (clientId) {
    const { client } = await cachedClientDetails(clientId);
    if (client) {
      const linkedOrgId = (client.linked_organization_id ?? "").trim();
      if (linkedOrgId && !orgById[linkedOrgId]) {
        Object.assign(orgById, await getLinkedOrgProfilesBatch([linkedOrgId]));
      }
      if (linkedOrgId && !orgById[linkedOrgId]) {
        const { profile } = await cachedLinkedOrgProfile(linkedOrgId);
        if (profile) {
          return {
            ...fieldsFromClient(client, {}),
            organizationImageUrl: pickPartyOrganizationImageUrl({
              organizationImageUrl: profile.avatarUrl,
            }),
            organizationAvatarSeed: (profile.avatarSeed ?? "").trim() || null,
            isIntegrated: true,
          };
        }
      }
      return fieldsFromClient(client, orgById);
    }
  }

  return fieldsFromOrgId(orgId, orgById);
}

export async function resolveDriverPartyAvatarMap(
  rows: DriverPartyReceivable[],
  trips: TripRow[],
  receivedByTripId: Record<string, number>,
  isFleetDispatched: (trip: TripRow) => boolean,
): Promise<Record<string, DriverPartyAvatarFields>> {
  const lookups = rows
    .filter((row) => row.kind !== "marketplace")
    .map((row) => {
      const partyTrips = tripsForDriverParty(
        trips,
        receivedByTripId,
        isFleetDispatched,
        row.id,
      ).map((line) => line.trip);
      return { id: row.id, ...partyAvatarLookup(row.id, partyTrips) };
    });

  const clientIds = [
    ...new Set(lookups.map((item) => item.clientId).filter((id): id is string => !!id)),
  ];
  const clients = await Promise.all(
    clientIds.map(async (clientId) => {
      const { client } = await cachedClientDetails(clientId);
      return [clientId, client] as const;
    }),
  );
  const clientById = new Map(clients);

  const orgIds = [
    ...new Set(
      [
        ...lookups.map((item) => item.orgId),
        ...clients.map(([, client]) => (client?.linked_organization_id ?? "").trim() || null),
      ].filter((id): id is string => !!id),
    ),
  ];
  const orgById = orgIds.length ? await getLinkedOrgProfilesBatch(orgIds) : {};

  const out: Record<string, DriverPartyAvatarFields> = {};
  await Promise.all(
    lookups.map(async (item) => {
      const client = item.clientId ? clientById.get(item.clientId) : undefined;
      if (client) {
        out[item.id] = fieldsFromClient(client, orgById);
        return;
      }
      out[item.id] = await fieldsFromOrgId(item.orgId, orgById);
    }),
  );
  return out;
}

/** Per-trip counterparty avatar (Marketplace rows show the shipper, not Pulse). */
export async function resolveDriverTripCounterpartyAvatarMap(
  trips: TripRow[],
): Promise<Record<string, DriverPartyAvatarFields>> {
  const uniqueParties = new Map<string, TripRow>();
  for (const trip of trips) {
    const partyId = shipperPartyIdForTrip(trip);
    if (!uniqueParties.has(partyId)) uniqueParties.set(partyId, trip);
  }

  const lookups = [...uniqueParties.entries()].map(([id, trip]) => ({
    id,
    ...partyAvatarLookup(id, [trip]),
  }));

  const clientIds = [
    ...new Set(lookups.map((item) => item.clientId).filter((id): id is string => !!id)),
  ];
  const clients = await Promise.all(
    clientIds.map(async (clientId) => {
      const { client } = await cachedClientDetails(clientId);
      return [clientId, client] as const;
    }),
  );
  const clientById = new Map(clients);
  const orgIds = [
    ...new Set(
      [
        ...lookups.map((item) => item.orgId),
        ...clients.map(([, client]) => (client?.linked_organization_id ?? "").trim() || null),
      ].filter((id): id is string => !!id),
    ),
  ];
  const orgById = orgIds.length ? await getLinkedOrgProfilesBatch(orgIds) : {};

  const byParty: Record<string, DriverPartyAvatarFields> = {};
  await Promise.all(
    lookups.map(async (item) => {
      const client = item.clientId ? clientById.get(item.clientId) : undefined;
      if (client) {
        byParty[item.id] = fieldsFromClient(client, orgById);
        return;
      }
      byParty[item.id] = await fieldsFromOrgId(item.orgId, orgById);
    }),
  );

  const out: Record<string, DriverPartyAvatarFields> = {};
  for (const trip of trips) {
    out[trip.id] = byParty[shipperPartyIdForTrip(trip)] ?? EMPTY_DRIVER_PARTY_AVATAR;
  }
  return out;
}
