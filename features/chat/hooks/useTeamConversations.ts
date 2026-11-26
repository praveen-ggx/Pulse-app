/**
 * Team scope bootstrap — roster + direct conversations (React Query).
 * Cache keys include org + user. Cleared when org/user changes via key change.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { PULSE_CHAT_TEAM_ENABLED } from "@/features/chat/constants/chatPlatform.flags";
import {
  listTeamChatMembers,
  listTeamDirectConversations,
  openTeamDirectChat,
  type TeamDirectConversation,
  type TeamMemberCandidate,
} from "@/features/chat/services/teamChat.service";

export const teamChatQueryKeys = {
  members: (orgId: string, userId: string) =>
    ["q", "chat-team", "members", orgId, userId] as const,
  conversations: (orgId: string, userId: string) =>
    ["q", "chat-team", "conversations", orgId, userId] as const,
};

export function useTeamConversations(enabledOverride?: boolean) {
  const { profile } = useAuth();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? "";
  const userId = profile?.uid ?? "";
  const enabled =
    (enabledOverride ?? PULSE_CHAT_TEAM_ENABLED) && Boolean(orgId) && Boolean(userId);
  const qc = useQueryClient();

  const membersQuery = useQuery({
    queryKey: teamChatQueryKeys.members(orgId, userId),
    queryFn: () => listTeamChatMembers(orgId, userId),
    enabled,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
  });

  const conversationsQuery = useQuery({
    queryKey: teamChatQueryKeys.conversations(orgId, userId),
    queryFn: () => listTeamDirectConversations(orgId, userId),
    enabled,
    staleTime: 30_000,
    gcTime: 30 * 60_000,
  });

  const openMutation = useMutation({
    mutationFn: (peerUserId: string) => openTeamDirectChat(orgId, peerUserId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: teamChatQueryKeys.conversations(orgId, userId),
      });
    },
  });

  const membersById = useMemo(() => {
    const map = new Map<string, TeamMemberCandidate>();
    for (const m of membersQuery.data ?? []) map.set(m.userId, m);
    return map;
  }, [membersQuery.data]);

  const rows = useMemo(() => {
    const convs = conversationsQuery.data ?? [];
    return convs.map((c) => {
      const peer =
        (c.peerUserId && membersById.get(c.peerUserId)) ||
        null;
      return {
        conversation: c,
        peer,
        title: peer?.fullName ?? c.title ?? "Teammate",
      };
    });
  }, [conversationsQuery.data, membersById]);

  const invalidate = useCallback(() => {
    if (!orgId || !userId) return;
    void qc.invalidateQueries({ queryKey: teamChatQueryKeys.members(orgId, userId) });
    void qc.invalidateQueries({
      queryKey: teamChatQueryKeys.conversations(orgId, userId),
    });
  }, [orgId, userId, qc]);

  return {
    enabled,
    orgId,
    userId,
    members: (membersQuery.data ?? []) as TeamMemberCandidate[],
    conversations: (conversationsQuery.data ?? []) as TeamDirectConversation[],
    rows,
    isLoading: enabled && (membersQuery.isLoading || conversationsQuery.isLoading),
    isFetching: membersQuery.isFetching || conversationsQuery.isFetching,
    isError: membersQuery.isError || conversationsQuery.isError,
    error: membersQuery.error ?? conversationsQuery.error ?? null,
    openWithPeer: openMutation.mutateAsync,
    isOpening: openMutation.isPending,
    refetch: invalidate,
  };
}
