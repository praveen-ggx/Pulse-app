import type { ClientRow } from "@/features/clients/services/clients.service";
import type { IndentRow } from "@/features/indents";
import type { LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";

export type IndentCardAvatarProps = {
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  initialsColorSeed: string;
  /** Name used for PartyAvatar initials — not the card title when they differ. */
  partyName: string;
};

function normalizePartyName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

/** Commerce merge writes `"{n} merged orders"` — not a CRM client. */
export function isSyntheticMergedOrdersClientName(
  name: string | null | undefined,
): boolean {
  return /^\d+\s+merged orders?$/i.test((name ?? "").trim());
}

export function uniqueClientNameFromCustomers(
  names: readonly (string | null | undefined)[],
): string | null {
  const unique = [
    ...new Set(names.map((n) => (n ?? "").trim()).filter(Boolean)),
  ];
  return unique[0] ?? null;
}

/** Title for `{n} merged orders` cards: real CRM name when the plan has one customer. */
export function resolveMergedOrderCardTitle(
  storedName: string | null | undefined,
  parties: readonly { id: string; name: string }[],
  clientById?: Map<string, Pick<ClientRow, "name">>,
): string {
  const stored = (storedName ?? "").trim() || "—";
  if (!isSyntheticMergedOrdersClientName(stored)) return stored;
  const names = parties.map((party) => {
    const crm = clientById?.get(party.id)?.name;
    return (crm ?? party.name ?? "").trim();
  });
  const unique = uniqueClientNameFromCustomers(names);
  if (parties.length === 1 && unique) return unique;
  return stored;
}

export type GiveLoadOwnOrgAvatar = {
  id?: string | null;
  name?: string | null;
  logoUrl?: string | null;
};

export type GiveLoadTripAvatarSource = {
  client_id?: string | null;
  client_name?: string | null;
};

export type IndentCardClientFace = {
  id: string;
  name: string;
  avatar_seed?: string | null;
  avatar_url?: string | null;
};

function linkedOrgAvatarFields(
  linkedOrgId: string | null | undefined,
  linkedMap: Record<string, LinkedOrgDisplay> | undefined,
): {
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
} {
  const id = (linkedOrgId ?? "").trim();
  if (!id || !linkedMap) return {};
  const o = linkedMap[id];
  if (!o) return {};
  return {
    organizationImageUrl: o.avatarUrl ?? null,
    organizationAvatarSeed: o.avatarSeed ?? null,
  };
}

/**
 * Indents persist `client_name` only (no `client_id` column). Prefer id when
 * present on the row, else match CRM clients by name (case-insensitive).
 */
export function resolveGiveLoadClient(
  // Widened from Pick<IndentRow, ...>: IndentRow types `client_name` as a plain
  // string, but callers legitimately pass null (e.g. a synthetic client, or a
  // trip with no client set). The body already normalizes null safely.
  load: { client_id?: string | null; client_name?: string | null },
  clientById: Map<string, ClientRow>,
): ClientRow | undefined {
  const clientId = String(load.client_id ?? "").trim();
  if (clientId) {
    const byId = clientById.get(clientId);
    if (byId) return byId;
  }
  const wanted = normalizePartyName(load.client_name);
  if (!wanted) return undefined;
  for (const client of clientById.values()) {
    if (normalizePartyName(client.name) === wanted) return client;
  }
  return undefined;
}

/** Same photo/logo stack as trip hub cards: linked-org logo, else CRM avatar. */
export function tripStyleClientFace(
  client: Pick<
    ClientRow,
    "id" | "name" | "avatar_url" | "avatar_seed" | "linked_organization_id"
  >,
  linkedOrgMap: Record<string, LinkedOrgDisplay> | undefined,
): IndentCardClientFace {
  const orgFields = linkedOrgAvatarFields(
    client.linked_organization_id,
    linkedOrgMap,
  );
  const orgUrl = (orgFields.organizationImageUrl ?? "").trim();
  const contactUrl = (client.avatar_url ?? "").trim();
  return {
    id: client.id,
    name: (client.name ?? "").trim() || "Client",
    avatar_url: orgUrl || contactUrl || null,
    avatar_seed:
      (orgFields.organizationAvatarSeed ?? "").trim() ||
      (client.avatar_seed ?? "").trim() ||
      null,
  };
}

export function indentClientFacesFromParties(
  parties: readonly { id: string; name: string }[],
  clientById: Map<string, ClientRow>,
  linkedOrgMap: Record<string, LinkedOrgDisplay> | undefined,
): IndentCardClientFace[] {
  const seen = new Set<string>();
  const faces: IndentCardClientFace[] = [];
  for (const party of parties) {
    const id = (party.id ?? "").trim();
    const name = (party.name ?? "").trim();
    const key = id || normalizePartyName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const crm = id ? clientById.get(id) : undefined;
    const byName =
      crm ??
      (name
        ? resolveGiveLoadClient(
            { client_id: null, client_name: name },
            clientById,
          )
        : undefined);
    if (byName) {
      faces.push(tripStyleClientFace(byName, linkedOrgMap));
      continue;
    }
    faces.push({
      id: id || `name:${key}`,
      name: name || "Client",
      avatar_url: null,
      avatar_seed: null,
    });
  }
  return faces;
}

/** Give load: show the indent's client photo / linked org logo. */
export function giveLoadIndentAvatarProps(
  load: IndentRow,
  clientById: Map<string, ClientRow>,
  linkedOrgMap: Record<string, LinkedOrgDisplay> | undefined,
  ownOrg?: GiveLoadOwnOrgAvatar,
  trip?: GiveLoadTripAvatarSource | null,
): IndentCardAvatarProps {
  const syntheticClient = isSyntheticMergedOrdersClientName(load.client_name);
  const indentClient = syntheticClient
    ? undefined
    : resolveGiveLoadClient(load, clientById);
  const client =
    indentClient ??
    resolveGiveLoadClient(
      {
        client_id: trip?.client_id ?? null,
        client_name: syntheticClient ? null : (trip?.client_name ?? null),
      },
      clientById,
    );

  if (client) {
    const orgFields = linkedOrgAvatarFields(
      client.linked_organization_id,
      linkedOrgMap,
    );
    const clientAvatarUrl = (client.avatar_url ?? "").trim() || null;
    const clientAvatarSeed = (client.avatar_seed ?? "").trim() || null;
    /**
     * Profiles RPC puts org logo on `client.avatar_url`. Prefer linked-org batch
     * when present; otherwise use the client profile photo as org mark so cards
     * don't fall back to initials when `client_id` was never stored on the indent.
     */
    const organizationImageUrl =
      (orgFields.organizationImageUrl ?? "").trim() || clientAvatarUrl;
    const organizationAvatarSeed =
      (orgFields.organizationAvatarSeed ?? "").trim() || clientAvatarSeed;
    const partyName = (client.name ?? load.client_name ?? "").trim() || "Client";

    return {
      avatarUrl: clientAvatarUrl,
      avatarSeed: clientAvatarSeed,
      organizationImageUrl,
      organizationAvatarSeed,
      initialsColorSeed: client.id
        ? `client-entity:${client.id}`
        : `indent:${load.id}`,
      partyName,
    };
  }

  const ownId = (ownOrg?.id ?? load.organization_id ?? "").trim();
  const ownFields = linkedOrgAvatarFields(ownId, linkedOrgMap);
  const ownLogo =
    (ownFields.organizationImageUrl ?? "").trim() ||
    (ownOrg?.logoUrl ?? "").trim() ||
    null;
  const ownSeed = (ownFields.organizationAvatarSeed ?? "").trim() || null;
  const partyName = (ownOrg?.name ?? "").trim() || "My load";

  return {
    avatarUrl: null,
    avatarSeed: null,
    organizationImageUrl: ownLogo,
    organizationAvatarSeed: ownSeed,
    initialsColorSeed: ownId ? `org:${ownId}` : `indent:${load.id}`,
    partyName,
  };
}

/** Find work / market load: show the posting organization's logo. */
export function marketLoadIndentAvatarProps(
  load: IndentRow,
  creatorOrgMap: Record<string, LinkedOrgDisplay> | undefined,
): IndentCardAvatarProps {
  const orgId = (load.organization_id ?? "").trim();
  const org = orgId && creatorOrgMap ? creatorOrgMap[orgId] : undefined;
  return {
    avatarUrl: null,
    avatarSeed: null,
    organizationImageUrl: (org?.avatarUrl ?? "").trim() || null,
    organizationAvatarSeed: (org?.avatarSeed ?? "").trim() || null,
    initialsColorSeed: orgId ? `org:${orgId}` : `indent:${load.id}`,
    partyName: (org as { organizationName?: string } | undefined)?.organizationName?.trim() || "Shipper",
  };
}

/**
 * Find loads / opportunity story cards — same hierarchy as Get Load hub:
 * batch partner display (logo → owner avatar → seed) with feed fields as
 * optimistic fallback until the batch resolves.
 */
export function opportunityPostAvatarProps(
  post: {
    id: string;
    organization_id?: string | null;
    org_avatar_url?: string | null;
    org_avatar_seed?: string | null;
  },
  creatorOrgMap: Record<string, LinkedOrgDisplay> | undefined,
): IndentCardAvatarProps {
  const orgId = (post.organization_id ?? "").trim();
  const org = orgId && creatorOrgMap ? creatorOrgMap[orgId] : undefined;
  const batchUrl = (org?.avatarUrl ?? "").trim() || null;
  const batchSeed = (org?.avatarSeed ?? "").trim() || null;
  const feedUrl = (post.org_avatar_url ?? "").trim() || null;
  const feedSeed = (post.org_avatar_seed ?? "").trim() || null;
  return {
    avatarUrl: null,
    avatarSeed: null,
    organizationImageUrl: batchUrl || feedUrl,
    organizationAvatarSeed: batchSeed || feedSeed,
    initialsColorSeed: orgId ? `org:${orgId}` : `post:${post.id}`,
    partyName:
      (org as { organizationName?: string } | undefined)?.organizationName?.trim() ||
      "Organization",
  };
}
