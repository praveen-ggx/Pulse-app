/**
 * TanStack Query hooks for organization member management.
 */
import { useEffect, useMemo } from 'react';
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
import { managerDepartmentOf, type ManagerDepartment } from '@/lib/memberSurfaces';

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
 * Display variant for panels that remount often (Hub / Goals / Performance):
 * shares the useOrgMembersQuery cache but skips the refetch on every mount.
 * It still listens for membership changes on the shared, ref-counted
 * `org-team` channel, so the roster refreshes when members actually change
 * rather than only when the 30-minute staleTime runs out.
 */
export function useOrgMembersData(orgId: string | null) {
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
    // Team screens that own the roster keep refetchOnMount: 'always' via useOrgMembersQuery.
    refetchOnMount: false,
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

/**
 * The signed-in member's department when they hold the Department manager
 * flag (and are not owner / admin, who already manage everyone); else null.
 * App-side gate for Team access only — set_member_surfaces_as_manager and
 * set_member_scope_as_manager re-check every manager write on the server.
 */
export function useViewerManagerDepartment(
  orgId: string | null,
  userId: string | null,
): ManagerDepartment | null {
  const { data } = useOrgMembersData(orgId);
  return useMemo(() => {
    if (!userId) return null;
    const me = (data?.members ?? []).find((m) => m.user_id === userId && m.status === 'active');
    return managerDepartmentOf(me);
  }, [data, userId]);
}
