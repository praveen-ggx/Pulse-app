import { runSingleflight } from '@/lib/cache/singleflight';
import type { InboundPartnerDisplay, InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';
import { getSignedAvatarUrl } from '@/lib/avatarUpload';
import { resolveOrgAvatarUri } from '@/features/vehicles/utils/fleetAvatar.util';
import { normalizePhoneForInviteeLookup } from '@/lib/phoneLookup';
import type { ConnectionRequestRow } from '@/features/connections/services/connectionRequests.service';
import { REGISTRY_PAGE_SIZE } from '@/lib/globalSync/registryFeed.constants';

// Lazy import: `clients.service` carries the trips/links subgraph; loading it
// at startup contaminates the dispatcher dock chunk. The only call site is
// inside `fetchInboundProtocolSnapshot`, which runs post-bootstrap.
const loadClientsService = () => import('@/features/clients/services/clients.service');

export function connectionRequestTypeLabel(row: ConnectionRequestRow): string {
  const reqClient = Boolean(row.request_shipper_client);
  const reqSupplier = Boolean(row.request_carrier_supplier);
  if (reqClient && reqSupplier) return 'CLIENT+SUPPLIER';
  if (reqClient) return 'CLIENT';
  if (reqSupplier) return 'SUPPLIER';
  return 'PARTY';
}

/** Lowercase role phrase for received invite headlines (handles merged CLIENT · SUPPLIER). */
export function inviteReceivedRolePhrase(type: string): string {
  const upper = type.toUpperCase();
  const hasClient = upper.includes('CLIENT');
  const hasSupplier = upper.includes('SUPPLIER');
  if (hasClient && hasSupplier) return 'client and supplier';
  if (hasClient) return 'client';
  if (hasSupplier) return 'supplier';
  return 'partner';
}

export type InviteHeadlineParts = {
  actionText: string;
  highlightText?: string;
  trailingText?: string;
};

export function inviteHeadlineParts(
  tab: 'received' | 'sent',
  item: Pick<InboundProtocolInviteItem, 'kind' | 'type' | 'name'>,
): InviteHeadlineParts {
  if (tab === 'sent') {
    return {
      actionText: 'awaiting response on',
      highlightText: item.name,
    };
  }
  if (item.kind === 'driver') {
    return { actionText: 'requested to join your fleet' };
  }
  const role = inviteReceivedRolePhrase(item.type);
  if (role === 'partner') {
    return { actionText: 'would like to connect with you' };
  }
  return {
    actionText: 'would like to add you as a',
    highlightText: role,
  };
}

export function partnerOrgIdForRequest(
  row: ConnectionRequestRow,
  direction: 'received' | 'sent',
): string {
  return direction === 'received'
    ? row.from_organization_id
    : row.to_organization_id;
}

/** Prefer org display name from the request row / partner profile (not contact-only). */
export function displayNameForRequest(
  row: ConnectionRequestRow,
  direction: 'received' | 'sent',
  partnerDisplay: Record<string, InboundPartnerDisplay>,
): string {
  const partnerId = partnerOrgIdForRequest(row, direction);
  const profile = partnerDisplay[partnerId];
  const rowOrgName =
    direction === 'received'
      ? (row.from_org_name ?? '').trim()
      : (row.to_org_name ?? '').trim();
  const profileOrg = (profile?.organizationName ?? '').trim();
  const contact = (profile?.contactPerson ?? '').trim();
  if (rowOrgName.length > 0) return rowOrgName;
  if (profileOrg.length > 0) return profileOrg;
  if (contact.length > 0) return contact;
  return 'Network user';
}

export function subtitleForRequest(
  row: ConnectionRequestRow,
  direction: 'received' | 'sent',
  partnerDisplay: Record<string, InboundPartnerDisplay>,
  _displayName: string,
): string | undefined {
  const partnerId = partnerOrgIdForRequest(row, direction);
  const profile = partnerDisplay[partnerId];
  const phone = (profile?.phone ?? '').trim();
  if (phone.length > 0) return phone;
  return undefined;
}

/** Strip trailing org-id suffix (e.g. "Fleet Logistics 589355" → "fleet logistics"). */
export function normalizeInviteOrgDisplayName(name: string): string {
  let n = name.trim().toLowerCase();
  n = n.replace(/\s+[0-9a-f]{6}$/i, '');
  return n.replace(/\s+/g, ' ').trim();
}

export function inviteItemDedupeKey(
  item: InboundProtocolInviteItem,
  partnerDisplay: Record<string, InboundPartnerDisplay>,
): string {
  const ownerId =
    item.partnerOwnerId ?? partnerDisplay[item.partnerOrgId]?.ownerId;
  if (ownerId) return `owner:${ownerId}`;

  const phone = normalizePhoneForInviteeLookup(
    partnerDisplay[item.partnerOrgId]?.phone ?? '',
  );
  if (phone.length >= 10) return `phone:${phone}`;

  const nameKey = normalizeInviteOrgDisplayName(item.name);
  if (nameKey.length > 0) return `name:${nameKey}`;

  return `org:${item.partnerOrgId}`;
}

export function collectPartnerOrgIds(
  received: ConnectionRequestRow[],
  sent: ConnectionRequestRow[],
  pendingOnly = true,
): string[] {
  const ids = new Set<string>();
  for (const row of received) {
    if (pendingOnly && row.status !== 'pending') continue;
    const id = partnerOrgIdForRequest(row, 'received');
    if (id) ids.add(id);
  }
  for (const row of sent) {
    if (pendingOnly && row.status !== 'pending') continue;
    const id = partnerOrgIdForRequest(row, 'sent');
    if (id) ids.add(id);
  }
  return Array.from(ids);
}

export function partnerOwnerIdByOrgFromDisplay(
  partnerDisplay: Record<string, InboundPartnerDisplay>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [orgId, profile] of Object.entries(partnerDisplay)) {
    const ownerId = (profile.ownerId ?? '').trim();
    if (ownerId) out[orgId] = ownerId;
  }
  return out;
}

async function resolvePartnerPhotoUri(raw: string): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http')) return trimmed;
  return (await getSignedAvatarUrl(trimmed)) ?? null;
}

export async function resolvePartnerAvatarUris(
  profiles: Record<string, InboundPartnerDisplay>,
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    Object.entries(profiles).map(async ([orgId, profile]) => {
      const orgName = profile.organizationName?.trim() || 'Organization';
      const logoSigned = profile.logoUrl
        ? await resolvePartnerPhotoUri(profile.logoUrl)
        : null;
      const ownerSigned = profile.ownerAvatarUrl
        ? await resolvePartnerPhotoUri(profile.ownerAvatarUrl)
        : null;
      const legacySigned = !logoSigned && !ownerSigned && profile.avatarUrl
        ? await resolvePartnerPhotoUri(profile.avatarUrl)
        : null;

      const uri = resolveOrgAvatarUri(
        orgId,
        orgName,
        logoSigned ?? legacySigned,
        profile.orgAvatarSeed ?? profile.avatarSeed ?? null,
        ownerSigned,
      );
      return [orgId, uri] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function fetchInboundProtocolSnapshot(
  _orgId: string,
  received: ConnectionRequestRow[],
  sent: ConnectionRequestRow[],
): Promise<{
  partnerDisplayByOrgId: Record<string, InboundPartnerDisplay>;
  partnerAvatarUriByOrgId: Record<string, string | null>;
  partnerOwnerIdByOrgId: Record<string, string>;
}> {
  const partnerOrgIds = collectPartnerOrgIds(received, sent, true);
  const snapshotKey = `inboundProtocol.snapshot:${_orgId}:${[...partnerOrgIds].sort().join(',')}`;
  return runSingleflight(snapshotKey, async () => {
    const { getLinkedOrgProfilesBatch } = await loadClientsService();
    const partnerDisplayByOrgId = await getLinkedOrgProfilesBatch(partnerOrgIds);
    const partnerOwnerIdByOrgId = partnerOwnerIdByOrgFromDisplay(partnerDisplayByOrgId);
    const partnerAvatarUriByOrgId = await resolvePartnerAvatarUris(partnerDisplayByOrgId);
    return { partnerDisplayByOrgId, partnerAvatarUriByOrgId, partnerOwnerIdByOrgId };
  });
}

/**
 * Collapse multiple pending invites to the same contact into one card.
 * Keys: partner owner (RPC), normalized phone, then normalized org name.
 */
export function dedupePendingInviteItemsByContact(
  items: InboundProtocolInviteItem[],
  partnerDisplay: Record<string, InboundPartnerDisplay>,
): InboundProtocolInviteItem[] {
  const groups = new Map<string, InboundProtocolInviteItem[]>();
  for (const item of items) {
    const key = inviteItemDedupeKey(item, partnerDisplay);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const merged: InboundProtocolInviteItem[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    const sorted = [...group].sort((a, b) =>
      String(b.createdAt).localeCompare(String(a.createdAt)),
    );
    const primary = sorted[0];
    const linkedRequestIds = sorted.map((it) => it.id);
    const types = [...new Set(sorted.map((it) => it.type))];
    const type = types.length > 1 ? types.join(' · ') : primary.type;
    const ownerId =
      primary.partnerOwnerId ??
      partnerDisplay[primary.partnerOrgId]?.ownerId;

    merged.push({
      ...primary,
      partnerOwnerId: ownerId ?? primary.partnerOwnerId,
      type,
      subtitle:
        primary.subtitle ??
        `${sorted.length} pending invites to the same contact`,
      linkedRequestIds,
    });
  }

  return merged.sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
}

export function mapPendingInviteItems(
  rows: ConnectionRequestRow[],
  direction: 'received' | 'sent',
  partnerDisplay: Record<string, InboundPartnerDisplay>,
  partnerAvatarUri: Record<string, string | null>,
  partnerOwnerIdByOrgId: Record<string, string>,
  limit = REGISTRY_PAGE_SIZE,
): InboundProtocolInviteItem[] {
  const mapped = rows
    .filter((r) => r.status === 'pending')
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((row) => {
      const partnerOrgId = partnerOrgIdForRequest(row, direction);
      const name = displayNameForRequest(row, direction, partnerDisplay);
      const ownerFromProfile = partnerDisplay[partnerOrgId]?.ownerId;
      const partnerProfile = partnerDisplay[partnerOrgId];
      return {
        id: row.id,
        name,
        subtitle: subtitleForRequest(row, direction, partnerDisplay, name),
        type: connectionRequestTypeLabel(row),
        partnerOrgId,
        partnerOwnerId:
          partnerOwnerIdByOrgId[partnerOrgId] ?? ownerFromProfile,
        avatarUri: partnerAvatarUri[partnerOrgId] ?? null,
        logoUrl: partnerProfile?.logoUrl ?? null,
        ownerAvatarUrl: partnerProfile?.ownerAvatarUrl ?? null,
        contactPerson: partnerProfile?.contactPerson?.trim() || null,
        senderAvatarSeed: partnerProfile?.avatarSeed?.trim() || null,
        orgAvatarSeed: partnerProfile?.orgAvatarSeed ?? partnerProfile?.avatarSeed ?? null,
        orgCreatedAt: partnerProfile?.orgCreatedAt ?? null,
        tripCount: partnerProfile?.tripCount ?? null,
        averageRating: partnerProfile?.averageRating ?? null,
        ratingCount: partnerProfile?.ratingCount ?? null,
        verificationStatus: partnerProfile?.verificationStatus ?? null,
        createdAt: row.created_at,
      };
    });

  return dedupePendingInviteItemsByContact(mapped, partnerDisplay).slice(0, limit);
}
