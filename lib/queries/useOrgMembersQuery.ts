/**
 * TanStack Query hooks for organization member management.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMyTeamInvites,
  getOrgTeamRoster,
  invalidateSharedOrganizationMembers,
  subscribeToOrgTeamRoster,
} from '@/features/organization/services/members.service';
import type { OrgTeamRoster } from '@/types/organization';
import { queryKeys } from '@/lib/queryKeys';
import { STALE } from '@/lib/queryClient';

const EMPTY_ROSTER: OrgTeamRoster = { members: [], pendingPhoneInvites: [] };

export function useOrgMembersQuery(orgId: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.orgMembers.all(orgId ?? ''),
    queryFn: async () => {
      const res = await getOrgTeamRoster(orgId!);
      if (res.error) throw res.error;
      return res.roster;
    },
    enabled: !!orgId,
    staleTime: STALE.slow,
    // Roster reflects who currently has access — a persisted cache entry
    // rehydrated from AsyncStorage can be "fresh" by staleTime's clock but
    // wrong by now (e.g. an invite accepted after the cached fetch). Always
    // refetch on mount/reconnect so pending/active status never renders stale.
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
  });

  useEffect(() => {
    if (!orgId) return;
    return subscribeToOrgTeamRoster(orgId, () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.orgMembers.all(orgId),
      });
    });
  }, [orgId, queryClient]);

  return query;
}

/**
 * Read-only variant: shares the same query cache as useOrgMembersQuery but does
 * NOT open a realtime channel. Use when another mounted component already owns
 * the org-team subscription (Supabase rejects a second postgres_changes callback
 * on the same channel name).
 */
export function useOrgMembersData(orgId: string | null) {
  return useQuery({
    queryKey: queryKeys.orgMembers.all(orgId ?? ''),
    queryFn: async () => {
      const res = await getOrgTeamRoster(orgId!);
      if (res.error) throw res.error;
      return res.roster;
    },
    enabled: !!orgId,
    staleTime: STALE.slow,
    // Hub / Goals / Performance remounts share this key. Team screens that
    // own the roster keep refetchOnMount: 'always' via useOrgMembersQuery.
    refetchOnMount: false,
    refetchOnReconnect: 'always',
  });
}

export function useMyTeamInvitesQuery() {
  return useQuery({
    queryKey: queryKeys.teamInvites.mine(),
    queryFn: async () => {
      const res = await getMyTeamInvites();
      if (res.error) throw res.error;
      return res.invites;
    },
    staleTime: STALE.moderate,
  });
}

export function useInvalidateOrgMembers(orgId: string | null) {
  const qc = useQueryClient();
  return () => {
    if (!orgId) return;
    invalidateSharedOrganizationMembers(orgId);
    qc.invalidateQueries({ queryKey: queryKeys.orgMembers.all(orgId) });
  };
}

export function useInvalidateTeamInvites() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.teamInvites.mine() });
  };
}

export { EMPTY_ROSTER };
