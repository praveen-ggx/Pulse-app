import { useLinkedOrgDisplayMap } from "@/lib/queries/useLinkedOrgDisplayQuery";
import { useMemo } from "react";

export type LinkedOrgDisplay = {
  avatarUrl?: string;
  avatarSeed?: string;
  logoUrl?: string;
  organizationName?: string;
};

const EMPTY_ORG_IDS: readonly string[] = [];

/**
 * Fetches display profiles (avatar URL + seed) for all linked org IDs found in
 * the given client and supplier lists, plus any `extraOrgIds`. Results share the
 * canonical linked-org cache.
 */
export function useLinkedOrgProfileMap(
  clients: readonly { linked_organization_id?: string | null }[],
  suppliers: readonly { linked_organization_id?: string | null }[],
  extraOrgIds: readonly string[] = EMPTY_ORG_IDS,
): Record<string, LinkedOrgDisplay> {
  const ids = useMemo(() => {
    const set = new Set<string>();
    for (const raw of extraOrgIds) {
      const id = raw.trim();
      if (id) set.add(id);
    }
    for (const c of clients) {
      const id = (c.linked_organization_id ?? "").trim();
      if (id) set.add(id);
    }
    for (const s of suppliers) {
      const id = (s.linked_organization_id ?? "").trim();
      if (id) set.add(id);
    }
    return Array.from(set).sort();
  }, [clients, suppliers, extraOrgIds]);

  const profiles = useLinkedOrgDisplayMap(ids);
  return useMemo(() => {
    const result: Record<string, LinkedOrgDisplay> = {};
    for (const [oid, profile] of Object.entries(profiles)) {
      const organizationName = profile.organizationName?.trim();
      result[oid] = {
        avatarUrl: profile.avatarUrl,
        avatarSeed: profile.avatarSeed,
        ...(profile.logoUrl ? { logoUrl: profile.logoUrl } : {}),
        ...(organizationName ? { organizationName } : {}),
      };
    }
    return result;
  }, [profiles]);
}
