/**
 * Canonical linked-org display cache, scoped by viewer organization.
 * Overlapping ID sets in the same workspace share one map; the batch RPC
 * runs only for missing IDs.
 *
 * Concurrent ensures for the same viewer org fetch in parallel (keyed by the
 * missing-id set). Writes merge via functional setQueryData so a small trip-page
 * branding lookup is never stuck behind an unrelated large batch.
 */
import {
  getLinkedOrgProfilesBatch,
  type OrgDisplayProfile,
} from "@/features/clients/services/clients.service";
import { queryKeys } from "@/lib/queryKeys";
import type { QueryClient } from "@tanstack/react-query";

function pickOrgAvatarStorageRef(
  logoUrl?: string | null,
  avatarUrl?: string | null,
): string | null {
  const logo = (logoUrl ?? "").trim();
  if (logo) return logo;
  const avatar = (avatarUrl ?? "").trim();
  if (!avatar) return null;
  if (
    avatar.includes("org-logos/") ||
    avatar.startsWith("org-assets/") ||
    avatar.toLowerCase().startsWith("s3://")
  ) {
    return avatar;
  }
  return avatar;
}

export type LinkedOrgDisplayProfile = {
  avatarUrl?: string;
  avatarSeed?: string;
  organizationName?: string;
  verificationStatus?: string | null;
  logoUrl?: string;
  orgAvatarSeed?: string;
  tripCount?: number;
  averageRating?: number | null;
  ratingCount?: number;
  orgCreatedAt?: string;
  phone?: string;
  ownerSignedUpAt?: string;
  vehicleCount?: number;
  networkIndentCount?: number;
};

/** In-flight fetches keyed by `${viewerOrgId}::${sortedMissingIds}`. */
const inflightByMissingKey = new Map<
  string,
  Promise<Record<string, LinkedOrgDisplayProfile>>
>();

/** Viewer org bound by OrganizationProvider — used to drop stale writes. */
let activeViewerOrgId: string | null = null;

export function bindLinkedOrgDisplayViewerOrg(orgId: string | null): void {
  activeViewerOrgId = (orgId ?? "").trim() || null;
}

export function isLinkedOrgDisplayQueryKey(
  queryKey: readonly unknown[],
): boolean {
  return queryKey[0] === "q" && queryKey[1] === "linked-org-display";
}

export function purgeLinkedOrgDisplayQueries(qc: QueryClient): void {
  qc.removeQueries({
    predicate: (q) => isLinkedOrgDisplayQueryKey(q.queryKey),
  });
  inflightByMissingKey.clear();
}

function uniqueSortedIds(ids: readonly string[]): string[] {
  const set = new Set<string>();
  for (const raw of ids) {
    const id = raw.trim();
    if (id) set.add(id);
  }
  return Array.from(set).sort();
}

export function toLinkedOrgDisplayProfile(
  profile: OrgDisplayProfile,
): LinkedOrgDisplayProfile {
  const avatarUrl =
    pickOrgAvatarStorageRef(profile.logoUrl, profile.avatarUrl) ||
    (profile.avatarUrl ?? profile.logoUrl ?? "").trim() ||
    undefined;
  const avatarSeed =
    (profile.avatarSeed ?? profile.orgAvatarSeed ?? "").trim() || undefined;
  const logoUrl = (profile.logoUrl ?? "").trim() || undefined;
  const orgAvatarSeed = (profile.orgAvatarSeed ?? "").trim() || undefined;
  const orgCreatedAt = (profile.orgCreatedAt ?? "").trim() || undefined;
  const phone = (profile.phone ?? "").trim() || undefined;
  const ownerSignedUpAt = (profile.ownerSignedUpAt ?? "").trim() || undefined;
  return {
    avatarUrl,
    avatarSeed,
    organizationName: (profile.organizationName ?? "").trim() || undefined,
    verificationStatus: profile.verificationStatus ?? null,
    ...(logoUrl ? { logoUrl } : {}),
    ...(orgAvatarSeed ? { orgAvatarSeed } : {}),
    ...(profile.tripCount !== undefined ? { tripCount: profile.tripCount } : {}),
    ...(profile.averageRating !== undefined
      ? { averageRating: profile.averageRating }
      : {}),
    ...(profile.ratingCount !== undefined ? { ratingCount: profile.ratingCount } : {}),
    ...(orgCreatedAt ? { orgCreatedAt } : {}),
    ...(phone ? { phone } : {}),
    ...(ownerSignedUpAt ? { ownerSignedUpAt } : {}),
    ...(profile.vehicleCount !== undefined
      ? { vehicleCount: profile.vehicleCount }
      : {}),
    ...(profile.networkIndentCount !== undefined
      ? { networkIndentCount: profile.networkIndentCount }
      : {}),
  };
}

export function linkedDisplayToOrgDisplay(
  profile: LinkedOrgDisplayProfile,
): OrgDisplayProfile {
  return {
    organizationName: profile.organizationName ?? "",
    contactPerson: "",
    phone: profile.phone ?? "",
    logoUrl: profile.logoUrl,
    orgAvatarSeed: profile.orgAvatarSeed,
    avatarUrl: profile.avatarUrl,
    avatarSeed: profile.avatarSeed,
    orgCreatedAt: profile.orgCreatedAt,
    ownerSignedUpAt: profile.ownerSignedUpAt,
    tripCount: profile.tripCount,
    averageRating: profile.averageRating,
    ratingCount: profile.ratingCount,
    verificationStatus: profile.verificationStatus,
    vehicleCount: profile.vehicleCount,
    networkIndentCount: profile.networkIndentCount,
  };
}

export function peekLinkedOrgDisplayProfile(
  qc: QueryClient,
  viewerOrgId: string | null | undefined,
  targetOrgId: string | null | undefined,
): LinkedOrgDisplayProfile | undefined {
  const viewer = (viewerOrgId ?? "").trim();
  const target = (targetOrgId ?? "").trim();
  if (!viewer || !target) return undefined;
  return qc.getQueryData<Record<string, LinkedOrgDisplayProfile>>(
    canonicalKey(viewer),
  )?.[target];
}

function pickWanted(
  map: Record<string, LinkedOrgDisplayProfile>,
  wanted: string[],
): Record<string, LinkedOrgDisplayProfile> {
  const out: Record<string, LinkedOrgDisplayProfile> = {};
  for (const id of wanted) {
    const row = map[id];
    if (row) out[id] = row;
  }
  return out;
}

function canonicalKey(viewerOrgId: string) {
  return queryKeys.linkedOrgDisplayCanonical(viewerOrgId);
}

/** Merge profiles already fetched into the viewer-org canonical map. */
export function mergeLinkedOrgDisplayProfiles(
  qc: QueryClient,
  viewerOrgId: string,
  profiles: Record<string, OrgDisplayProfile | LinkedOrgDisplayProfile>,
): void {
  if (!viewerOrgId || Object.keys(profiles).length === 0) return;
  if (activeViewerOrgId !== viewerOrgId) return;
  const key = canonicalKey(viewerOrgId);
  const mapped: Record<string, LinkedOrgDisplayProfile> = {};
  for (const [id, profile] of Object.entries(profiles)) {
    if (!profile) continue;
    mapped[id] =
      "contactPerson" in profile
        ? toLinkedOrgDisplayProfile(profile as OrgDisplayProfile)
        : (profile as LinkedOrgDisplayProfile);
  }
  qc.setQueryData<Record<string, LinkedOrgDisplayProfile>>(key, (prev) => ({
    ...(prev ?? {}),
    ...mapped,
  }));
}

/**
 * Returns display profiles for `ids`, fetching only those missing from the
 * viewer-org canonical map. Identical missing-id sets share one in-flight RPC;
 * different sets run in parallel and merge into the canonical map.
 */
export async function ensureLinkedOrgDisplayProfiles(
  ids: readonly string[],
  qc: QueryClient,
  viewerOrgId: string,
): Promise<Record<string, LinkedOrgDisplayProfile>> {
  const wanted = uniqueSortedIds(ids);
  if (!viewerOrgId || wanted.length === 0) return {};

  const key = canonicalKey(viewerOrgId);
  const cached =
    qc.getQueryData<Record<string, LinkedOrgDisplayProfile>>(key) ?? {};
  const missing = wanted.filter((id) => !cached[id]);
  if (missing.length === 0) return pickWanted(cached, wanted);

  const flightKey = `${viewerOrgId}::${missing.join(",")}`;
  let flight = inflightByMissingKey.get(flightKey);
  if (!flight) {
    flight = (async () => {
      const fresh = await getLinkedOrgProfilesBatch(missing);
      const mapped: Record<string, LinkedOrgDisplayProfile> = {};
      for (const [id, profile] of Object.entries(fresh)) {
        mapped[id] = toLinkedOrgDisplayProfile(profile);
      }
      if (activeViewerOrgId === viewerOrgId) {
        qc.setQueryData<Record<string, LinkedOrgDisplayProfile>>(key, (prev) => ({
          ...(prev ?? {}),
          ...mapped,
        }));
      }
      return mapped;
    })().finally(() => {
      inflightByMissingKey.delete(flightKey);
    });
    inflightByMissingKey.set(flightKey, flight);
  }

  try {
    await flight;
  } catch {
    /* leave partial cache */
  }

  const next =
    qc.getQueryData<Record<string, LinkedOrgDisplayProfile>>(key) ?? cached;
  return pickWanted(next, wanted);
}
