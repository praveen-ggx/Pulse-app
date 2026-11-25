/**
 * Team channels — list / create / join / leave / invite (React Query).
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { PULSE_CHAT_TEAM_ENABLED } from "@/features/chat/constants/chatPlatform.flags";
import {
  archiveTeamChannel,
  createTeamChannel,
  inviteTeamChannelMembers,
  joinTeamChannel,
  leaveTeamChannel,
  listTeamChannelMembers,
  listTeamChannels,
  updateTeamChannel,
  type CreateTeamChannelInput,
  type TeamChannelListItem,
  type TeamChannelVisibility,
} from "@/features/chat/services/teamChannel.service";

import { teamChatQueryKeys } from "./useTeamConversations";

export const teamChannelQueryKeys = {
  channels: (orgId: string) => ["q", "chat-team", "channels", orgId] as const,
  members: (conversationId: string) =>
    ["q", "chat-team", "channel-members", conversationId] as const,
};

export function useTeamChannels(enabledOverride?: boolean) {
  const { profile } = useAuth();
  const org = useOptionalOrganization();
  const orgId = org?.currentOrganization?.id ?? "";
  const userId = profile?.uid ?? "";
  const enabled =
    (enabledOverride ?? PULSE_CHAT_TEAM_ENABLED) &&
    Boolean(orgId) &&
    Boolean(userId);
  const qc = useQueryClient();

  const channelsQuery = useQuery({
    queryKey: teamChannelQueryKeys.channels(orgId),
    queryFn: () => listTeamChannels(orgId),
    enabled,
    staleTime: 20_000,
    gcTime: 30 * 60_000,
  });

  const invalidate = useCallback(async () => {
    if (!orgId) return;
    await Promise.all([
      qc.invalidateQueries({
        queryKey: teamChannelQueryKeys.channels(orgId),
      }),
      qc.invalidateQueries({
        queryKey: teamChatQueryKeys.conversations(orgId, userId),
      }),
    ]);
  }, [orgId, userId, qc]);

  const createMutation = useMutation({
    mutationFn: (
      input: Omit<CreateTeamChannelInput, "organizationId">,
    ) => createTeamChannel({ ...input, organizationId: orgId }),
    onSuccess: invalidate,
  });

  const joinMutation = useMutation({
    mutationFn: (conversationId: string) => joinTeamChannel(conversationId),
    onSuccess: invalidate,
  });

  const leaveMutation = useMutation({
    mutationFn: (conversationId: string) => leaveTeamChannel(conversationId),
    onSuccess: invalidate,
  });

  const inviteMutation = useMutation({
    mutationFn: ({
      conversationId,
      memberIds,
    }: {
      conversationId: string;
      memberIds: string[];
    }) => inviteTeamChannelMembers(conversationId, memberIds),
    onSuccess: (_data, vars) => {
      invalidate();
      void qc.invalidateQueries({
        queryKey: teamChannelQueryKeys.members(vars.conversationId),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      conversationId,
      title,
      topic,
      visibility,
    }: {
      conversationId: string;
      title?: string;
      topic?: string;
      visibility?: TeamChannelVisibility;
    }) => updateTeamChannel(conversationId, { title, topic, visibility }),
    onSuccess: invalidate,
  });

  const archiveMutation = useMutation({
    mutationFn: (conversationId: string) => archiveTeamChannel(conversationId),
    onSuccess: invalidate,
  });

  const joined = useMemo(
    () => (channelsQuery.data ?? []).filter((c) => c.isMember),
    [channelsQuery.data],
  );

  const browseable = useMemo(
    () => (channelsQuery.data ?? []).filter((c) => !c.isMember),
    [channelsQuery.data],
  );

  return {
    enabled,
    orgId,
    channels: (channelsQuery.data ?? []) as TeamChannelListItem[],
    joinedChannels: joined,
    browseChannels: browseable,
    isLoading: enabled && channelsQuery.isLoading,
    isError: channelsQuery.isError,
    error: channelsQuery.error ?? null,
    refetch: invalidate,
    createChannel: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    joinChannel: joinMutation.mutateAsync,
    isJoining: joinMutation.isPending,
    leaveChannel: leaveMutation.mutateAsync,
    isLeaving: leaveMutation.isPending,
    inviteMembers: inviteMutation.mutateAsync,
    isInviting: inviteMutation.isPending,
    updateChannel: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    archiveChannel: archiveMutation.mutateAsync,
    isArchiving: archiveMutation.isPending,
  };
}

export function useTeamChannelMembers(
  conversationId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: teamChannelQueryKeys.members(conversationId ?? "_"),
    queryFn: () => listTeamChannelMembers(conversationId!),
    enabled: enabled && Boolean(conversationId),
    staleTime: 30_000,
    gcTime: 15 * 60_000,
  });
}
