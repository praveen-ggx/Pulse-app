import { useQuery } from "@tanstack/react-query";
import { STALE } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { getProfile } from "@/features/auth/services/auth.service";
import { getOrganizationMembersShared } from "@/features/organization/services/members.service";
import type { OrgMember } from "@/types/organization";
import { composeResolvedIdentity } from "../selectors/identitySelectors";
import { identitiesKey } from "../utils/identityUtils";
import { trustFromVerificationState } from "../trust/trustModel";
import {
  readIdentityFromCache,
  writeIdentityToCache,
  writeManyIdentitiesToCache,
} from "../cache/identityCache";
import type { IdentityVerificationState } from "../types";

export function resolveDisplayIdentity(params: {
  userId: string;
  orgId: string | null | undefined;
  verificationState?: IdentityVerificationState | null;
}) {
  const { userId, orgId, verificationState } = params;
  return (async () => {
    const cached = readIdentityFromCache(userId);
    if (cached) {
      const overrideTrust = trustFromVerificationState(verificationState ?? null);
      return {
        ...cached,
        verificationState: verificationState ?? cached.verificationState,
        trustLevel: overrideTrust === "low" ? cached.trustLevel : overrideTrust,
      };
    }
    const [profile, membersRes] = await Promise.all([
      getProfile(userId),
      orgId
        ? getOrganizationMembersShared(orgId)
        : Promise.resolve({ members: [] as OrgMember[] }),
    ]);
    const member =
      (membersRes.members ?? []).find((m) => String(m.user_id ?? "") === userId) ?? null;
    const resolved = composeResolvedIdentity({
      userId,
      profile,
      member,
      verificationState,
    });
    writeIdentityToCache(resolved);
    return resolved;
  })();
}

export function useResolvedIdentity(params: {
  userId: string | null | undefined;
  orgId: string | null | undefined;
  verificationState?: IdentityVerificationState | null;
}) {
  const userId = String(params.userId ?? "").trim();
  const orgId = String(params.orgId ?? "").trim();
  return useQuery({
    queryKey: userId ? queryKeys.identity.one(userId) : ["q", "identity", "noop"],
    queryFn: () =>
      resolveDisplayIdentity({
        userId,
        orgId,
        verificationState: params.verificationState ?? null,
      }),
    enabled: !!userId,
    staleTime: STALE.slow,
  });
}

export function useResolvedIdentities(params: {
  userIds: string[];
  orgId: string | null | undefined;
  verificationStateByUserId?: Record<string, IdentityVerificationState | null | undefined>;
}) {
  const orgId = String(params.orgId ?? "").trim();
  const key = identitiesKey(params.userIds);
  return useQuery({
    queryKey: key ? queryKeys.identity.many(key) : ["q", "identities", "noop"],
    queryFn: async () => {
      const membersRes = orgId
        ? await getOrganizationMembersShared(orgId)
        : { members: [] as OrgMember[] };
      const uniqueIds = key ? key.split(",") : [];
      const identities = await Promise.all(
        uniqueIds.map(async (userId) => {
          const cached = readIdentityFromCache(userId);
          if (cached) {
            const verificationState =
              params.verificationStateByUserId?.[userId] ?? null;
            const overrideTrust = trustFromVerificationState(verificationState);
            return {
              ...cached,
              verificationState: verificationState ?? cached.verificationState,
              trustLevel: overrideTrust === "low" ? cached.trustLevel : overrideTrust,
            };
          }
          const profile = await getProfile(userId);
          const member =
            (membersRes.members ?? []).find((m) => String(m.user_id ?? "") === userId) ?? null;
          return composeResolvedIdentity({
            userId,
            profile,
            member,
            verificationState:
              params.verificationStateByUserId?.[userId] ?? null,
          });
        }),
      );
      writeManyIdentitiesToCache(identities);
      return identities;
    },
    enabled: !!key,
    staleTime: STALE.slow,
  });
}
