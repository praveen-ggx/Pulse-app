import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverChatConversationsQuery } from '@/features/chat/hooks/useDriverChatConversationsQuery';
import { driverChatConversationsQueryKey } from '@/features/chat/hooks/useDriverChatConversationsQuery';
import { useDriverHomeDriversQuery } from '@/lib/queries/useDriverHomeDriversQuery';
import * as tripsService from '@/features/trips/services/trips.service';
import * as chatService from '@/features/chat/services/chat.service';
import type {
  TripConversation,
  TripConversationRow,
  TripMessageRow,
} from '@/features/chat/types/chat.types';
import { notifyTripChatMessagesChanged } from '@/lib/tripChatInvalidate';
import {
  appendDriverChatMessageToCache,
  driverChatMessagesQueryKey,
  removeDriverChatMessageFromCache,
  replaceDriverChatMessageInCache,
} from '@/features/chat/utils/driverChatMessageCache.util';
import type { InfiniteData } from '@tanstack/react-query';
import type { DriverChatMessagesPage } from '@/features/chat/utils/driverChatMessageCache.util';
import { useQueryClient } from '@tanstack/react-query';
import { getLinkedDriversForCurrentUser } from '@/features/drivers/services/drivers.service';
import { getTripOperationalDisplay } from "@/features/operations/display";
import { driverConversationUnreadCount } from "@/features/chat/utils/driverChatUnread.util";

/**
 * Accepts either a full `TripRow` or a `trips_driver_view` row — the driver path
 * can only read the view (see getDriverTripById use below). The view names its
 * location columns `pickup_address` / `dropoff_address` and omits the
 * trip_code/display_trip_id family, so read both spellings and let the
 * operational-display helper fall back to trip_number.
 */
type MinimalTripSource = {
  trip_number?: string | null;
  driver_display_trip_id?: string | null;
  trip_operational_code?: string | null;
  trip_code?: string | null;
  display_trip_id?: string | null;
  pickup_area?: string | null;
  drop_location?: string | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
};

function buildMinimalDriverTripConversation(
  trip: MinimalTripSource,
  row: TripConversationRow,
): TripConversation {
  const perDriver = trip.driver_display_trip_id?.trim();
  const operational = getTripOperationalDisplay({
    trip_operational_code: trip.trip_operational_code ?? null,
    trip_code: trip.trip_code ?? null,
    display_trip_id: trip.display_trip_id ?? null,
    trip_number: trip.trip_number ?? null,
  });
  return {
    ...row,
    trip_number: operational !== "—" ? operational : perDriver || trip.trip_number || '',
    pickup_area: trip.pickup_area ?? trip.pickup_address ?? '',
    drop_location: trip.drop_location ?? trip.dropoff_address ?? '',
    messages: [],
  };
}

interface DriverChatContextType {
  conversations: TripConversation[];
  driverIds: string[];
  isLoading: boolean;
  sendMessage: (conversationId: string, organizationId: string, content: string) => Promise<void>;
  getTotalUnreadCount: () => number;
  refreshConversations: () => Promise<TripConversation[]>;
  ensureDriverTripConversation: (tripId: string) => Promise<{ convId: string; orgId: string } | null>;
}

const DriverChatContext = createContext<DriverChatContextType | undefined>(undefined);

export function useDriverChat() {
  const ctx = useContext(DriverChatContext);
  if (!ctx) throw new Error('useDriverChat must be used within a DriverChatProvider');
  return ctx;
}

/**
 * Non-throwing variant for shared chrome (e.g. DriverHeader) that may render
 * before/outside the provider — returns undefined instead of crashing.
 */
export function useOptionalDriverChat() {
  return useContext(DriverChatContext);
}

export function DriverChatProvider({
  children,
  isActive = true,
}: {
  children: ReactNode;
  isActive?: boolean;
}) {
  const { profile } = useAuth();
  const uid = (profile as { uid?: string })?.uid ?? null;
  const queryClient = useQueryClient();

  const ensureConvInFlightRef = useRef<
    Map<string, Promise<{ convId: string; orgId: string } | null>>
  >(new Map());

  const { activeLinkedDrivers, driverIdsKey } = useDriverHomeDriversQuery(isActive ? uid : null);

  const driverIds = useMemo(
    () => activeLinkedDrivers.map((d) => d.id),
    [activeLinkedDrivers],
  );

  const {
    conversations,
    isLoading,
    refreshConversations: refetchConversations,
  } = useDriverChatConversationsQuery(isActive ? driverIds : []);

  const patchConversationListPreview = useCallback(
    (conversationId: string, preview: string, at: string) => {
      if (!driverIdsKey) return;
      queryClient.setQueryData<TripConversation[]>(
        driverChatConversationsQueryKey(driverIdsKey),
        (old) =>
          (old ?? []).map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  last_message_at: at,
                  last_message_preview: preview.slice(0, 120),
                }
              : c,
          ),
      );
    },
    [driverIdsKey, queryClient],
  );

  const ensureDriverTripConversation = useCallback(
    async (tripId: string): Promise<{ convId: string; orgId: string } | null> => {
      const id = String(tripId ?? '').trim();
      if (!id || !uid) return null;

      const inflight = ensureConvInFlightRef.current.get(id);
      if (inflight) return inflight;

      const run = (async (): Promise<{ convId: string; orgId: string } | null> => {
      let resolvedDriverIds: string[] = Array.isArray(driverIds) ? driverIds : [];
      if (!resolvedDriverIds.length) {
        const { drivers } = await getLinkedDriversForCurrentUser(uid);
        resolvedDriverIds = (drivers ?? []).map((d: { id: string }) => d.id);
      }
      if (!resolvedDriverIds.length) return null;

      const cacheKey = [...resolvedDriverIds].sort().join(',');
      const cachedConv = queryClient
        .getQueryData<TripConversation[]>(driverChatConversationsQueryKey(cacheKey))
        ?.find((c) => String(c.trip_id) === id);
      if (cachedConv?.id && cachedConv.organization_id) {
        return { convId: cachedConv.id, orgId: cachedConv.organization_id };
      }

      // MUST use the driver-safe view, not getTripById. getTripById embeds
      // `indents!trips_indent_id_fkey(...)`, and a driver has no RLS read on
      // `indents` — PostgREST then drops the whole row, so the trip comes back
      // null with NO error even though the driver can read `trips` itself. That
      // made a driver's own trip look nonexistent and surfaced as
      // "Could not open chat for this trip." trips_driver_view exposes the
      // driver_id / organization_id needed here without any join.
      const { error, trip } = await tripsService.getDriverTripById(id);
      if (error || !trip?.driver_id || !trip.organization_id) return null;
      const assignedDriverId = String(trip.driver_id);
      if (!resolvedDriverIds.some((d) => String(d) === assignedDriverId)) return null;

      const partyName =
        (profile as { full_name?: string; displayName?: string })?.full_name ||
        (profile as { displayName?: string })?.displayName ||
        'Driver';

      let created: TripConversationRow;
      try {
        created = await chatService.getOrCreateConversation({
          tripId: trip.id,
          partyType: 'driver',
          partyName,
          organizationId: trip.organization_id,
          partyId: trip.driver_id,
        });
      } catch {
        return null;
      }

      const minimal = buildMinimalDriverTripConversation(trip, created);
      // Patch both the sorted-key cache (normal path) and any stale empty-key cache
      // so DriverChatScreen can find the conversation even before driverIds loads.
      queryClient.setQueryData<TripConversation[]>(
        driverChatConversationsQueryKey(cacheKey),
        (old) => {
          const list = old ?? [];
          if (list.some((c) => c.id === minimal.id)) {
            return list.map((c) => (c.id === minimal.id ? { ...c, ...minimal } : c));
          }
          return [minimal, ...list];
        },
      );

      // Optimistic cache patch above is correct — no refetch needed.  The
      // realtime subscription will patch the list if the server row diverges.
      return { convId: created.id, orgId: trip.organization_id };
      })();

      ensureConvInFlightRef.current.set(id, run);
      try {
        return await run;
      } finally {
        ensureConvInFlightRef.current.delete(id);
      }
    },
    [driverIds, profile, uid, queryClient],
  );

  const sendMessage = useCallback(
    async (conversationId: string, organizationId: string, content: string) => {
      if (!uid) return;
      const senderName =
        (profile as { full_name?: string; displayName?: string })?.full_name ||
        (profile as { displayName?: string })?.displayName ||
        'Driver';

      const optimisticMsg: TripMessageRow = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        organization_id: organizationId,
        sender_user_id: uid,
        sender_role: 'driver',
        sender_name: senderName,
        content,
        message_type: 'text',
        is_read: true,
        read_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const msgKey = driverChatMessagesQueryKey(conversationId);
      queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(msgKey, (old) =>
        appendDriverChatMessageToCache(old, optimisticMsg),
      );
      patchConversationListPreview(
        conversationId,
        content,
        optimisticMsg.created_at ?? new Date().toISOString(),
      );

      try {
        const persisted = await chatService.sendDriverChatMessage({
          conversationId,
          organizationId,
          content,
          senderName,
          senderUserId: uid,
        });
        queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(msgKey, (old) =>
          replaceDriverChatMessageInCache(old, optimisticMsg.id, persisted),
        );
        patchConversationListPreview(
          conversationId,
          content,
          persisted.created_at ?? optimisticMsg.created_at ?? new Date().toISOString(),
        );
        notifyTripChatMessagesChanged();
      } catch {
        queryClient.setQueryData<InfiniteData<DriverChatMessagesPage>>(msgKey, (old) =>
          removeDriverChatMessageFromCache(old, optimisticMsg.id),
        );
      }
    },
    [uid, profile, queryClient, patchConversationListPreview],
  );

  // No driver mark-read: `mark_conversation_read` is the dispatcher's RPC — it zeroes
  // unread_dispatcher_count and marks the driver's own messages read. A driver read
  // state needs its own column + RPC (deferred with the schema freeze).

  const getTotalUnreadCount = useCallback(
    () => conversations.reduce((sum, c) => sum + driverConversationUnreadCount(c), 0),
    [conversations],
  );

  const refreshConversations = useCallback(async () => {
    const result = await refetchConversations();
    return result.data ?? [];
  }, [refetchConversations]);

  const value = useMemo(
    (): DriverChatContextType => ({
      conversations,
      driverIds,
      isLoading,
      sendMessage,
      getTotalUnreadCount,
      refreshConversations,
      ensureDriverTripConversation,
    }),
    [
      conversations,
      driverIds,
      isLoading,
      sendMessage,
      getTotalUnreadCount,
      refreshConversations,
      ensureDriverTripConversation,
    ],
  );

  return (
    <DriverChatContext.Provider value={value}>{children}</DriverChatContext.Provider>
  );
}
