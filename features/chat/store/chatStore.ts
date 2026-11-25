/**
 * chatStore — compatibility shim over useChatStore (Zustand).
 *
 * All existing imports continue to compile unchanged.  New code should import
 * directly from useChatStore.
 *
 * The `chatStore` object delegates every mutation to useChatStore.getState().
 * The React hooks (useConversations, useConversation, …) subscribe to the
 * Zustand store via useSyncExternalStore so they remain tearing-free in
 * React 18 concurrent mode.
 *
 * SNAPSHOT CACHE
 *   _buildSnapshot() rebuilds the flat TripConversation[] only when the `trips`
 *   reference changes (Zustand uses immutable spread updates, so any mutation
 *   produces a new reference).  Between mutations, useSyncExternalStore receives
 *   the same array reference → React skips re-render.
 *
 * DISPATCH MAPPING
 *   ChatRealtimeEvent.SYSTEM_UPDATE carries Partial<TripMeta> with snake_case
 *   keys.  The shim translates to TripEntry camelCase before forwarding to
 *   applySystemUpdate.
 */

import { useSyncExternalStore, useRef } from 'react';
import {
  useChatStore,
  tripEntryToMeta,
  previewText,
  partyLanesForHubEntry,
  sumHubVisibleUnread,
  type TripEntry,
  type PartyConv,
} from './useChatStore';
import type {
  ChatRealtimeEvent,
  ConversationPartyType,
  TripConversation,
  TripMessageRow,
  TripMeta,
} from '../types/chat.types';
import { isEventVisibleForPartyLane } from '../utils/messagePartyVisibility';
import { dedupeTripStatusBroadcastsForLane } from '../utils/dedupeTripStatusBroadcastForLane.util';

// ── Snapshot cache ────────────────────────────────────────────────────────────

let _snapshotCache: TripConversation[] | null = null;
let _tripsSnapshot: Record<string, TripEntry> | null = null;

function _buildSnapshot(): TripConversation[] {
  const { trips } = useChatStore.getState();
  if (trips === _tripsSnapshot && _snapshotCache !== null) return _snapshotCache;
  _tripsSnapshot = trips;

  const result: TripConversation[] = [];
  for (const entry of Object.values(trips)) {
    for (const [pt, party] of partyLanesForHubEntry(entry)) {
      result.push(_convFromEntry(entry, pt, party));
    }
  }
  result.sort(_prioritySort);
  _snapshotCache = result;
  return result;
}

// Invalidate snapshot only when `trips` reference changes (immutable spread ensures
// any trip mutation produces a new reference).  ACK-only mutations (isLoading,
// bootstrappedOrg, etc.) that leave `trips` unchanged skip the rebuild entirely —
// useSyncExternalStore returns the same array reference and React skips re-render.
useChatStore.subscribe((newState, oldState) => {
  if (newState.trips !== oldState.trips) _snapshotCache = null;
});

function _convFromEntry(
  entry:     TripEntry,
  partyType: ConversationPartyType,
  party:     PartyConv,
): TripConversation {
  // Party-scoped messages: visibility_tags-aware filter (zero DB calls).
  // If a message carries visibility_tags, only show it when the current party's
  // convId or partyType is listed.  Legacy messages (no visibility_tags) fall
  // back to partyType equality — identical to the pre-unified-bootstrap behaviour.
  const convId = party.conversationId;
  const messages = dedupeTripStatusBroadcastsForLane(
    entry.event_stream.filter(e =>
      isEventVisibleForPartyLane(e, partyType, convId),
    ),
    convId,
  );

  // Prefer lane history for preview; when denorm is ahead (missed INSERT), use
  // trip_conversations last_* so sidebar matches DB until the heal pull lands.
  const lastLaneMsg = messages[messages.length - 1] ?? null;
  const laneAtMs = lastLaneMsg?.created_at
    ? Date.parse(lastLaneMsg.created_at)
    : 0;
  const denormAtMs = entry.lastEventAt ? Date.parse(entry.lastEventAt) : 0;
  const denormAhead =
    Number.isFinite(denormAtMs) &&
    denormAtMs > (Number.isFinite(laneAtMs) ? laneAtMs : 0) + 1_500;

  const lastPreview = denormAhead
    ? (entry.lastEventPreview ??
      (lastLaneMsg ? previewText(lastLaneMsg) : null))
    : (lastLaneMsg ? previewText(lastLaneMsg) : null) ?? entry.lastEventPreview;

  const lastAt = denormAhead
    ? (entry.lastEventAt ?? lastLaneMsg?.created_at ?? null)
    : (lastLaneMsg?.created_at ?? entry.lastEventAt);

  return {
    id:                      party.conversationId,
    organization_id:         party.organizationId,
    trip_id:                 entry.tripId,
    party_type:              partyType,
    party_name:              party.partyName,
    client_id:               party.clientId,
    supplier_id:             party.supplierId,
    driver_id:               party.driverId,
    last_message_at:         lastAt,
    last_message_preview:    lastPreview,
    unread_dispatcher_count: party.unreadCount,
    created_at:              entry.createdAt ?? '',
    updated_at:              '',
    trip_number:             entry.tripNumber,
    display_trip_id:         entry.displayTripId,
    trip_status:             entry.status,
    trip_driver_id:          entry.driverId,
    trip_supplier_id:        entry.supplierId,
    trip_created_at:         entry.createdAt,
    pickup_area:             entry.pickupArea,
    drop_location:           entry.dropLocation,
    trip_feedback_status:   party.feedbackStatus ?? "none",
    trip_organization_id:   entry.tripOrganizationId ?? null,
    trip_organization_name: entry.tripOrganizationName ?? null,
    indent_creator_organization_name: entry.indentCreatorOrganizationName ?? null,
    indent_id:               entry.indentId ?? null,
    conversation_type:     entry.chatFlow,
    trip_source:             entry.tripSource ?? null,
    messages,
  };
}

function _prioritySort(a: TripConversation, b: TripConversation): number {
  const au = (a.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
  const bu = (b.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
  if (au !== bu) return au - bu;
  const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
  const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
  return tb - ta;
}

// Map Partial<TripMeta> (snake_case) → Partial<TripEntry> (camelCase)
function _metaPatchToEntryPatch(p: Partial<TripMeta>): Partial<TripEntry> {
  const patch: Partial<TripEntry> = {};
  if (p.trip_status      !== undefined) patch.status        = p.trip_status;
  if (p.trip_driver_id   !== undefined) patch.driverId      = p.trip_driver_id;
  if (p.trip_supplier_id !== undefined) patch.supplierId    = p.trip_supplier_id;
  if (p.pickup_area      !== undefined) patch.pickupArea    = p.pickup_area;
  if (p.drop_location    !== undefined) patch.dropLocation  = p.drop_location;
  if (p.last_lat         !== undefined) patch.lastLat       = p.last_lat;
  if (p.last_lng         !== undefined) patch.lastLng       = p.last_lng;
  if (p.last_location_at !== undefined) patch.lastLocationAt = p.last_location_at;
  if (p.last_eta_minutes !== undefined) patch.lastEtaMinutes = p.last_eta_minutes;
  if (p.last_eta_label   !== undefined) patch.lastEtaLabel  = p.last_eta_label;
  if (p.last_location_label !== undefined) patch.lastLocationLabel = p.last_location_label;
  return patch;
}

// ── chatStore: compatibility object ──────────────────────────────────────────

export const chatStore = {
  // useSyncExternalStore-compatible subscribe
  subscribe: (listener: () => void): (() => void) =>
    useChatStore.subscribe(() => listener()),

  getSnapshot: _buildSnapshot,

  dispatch(event: ChatRealtimeEvent): void {
    const s = useChatStore.getState();
    if (event.type === 'NEW_MESSAGE') {
      s.onRealtimeInsert(event.row, event.mode);
    } else if (event.type === 'ACK_UPDATE') {
      s.onRealtimeAck(event.conversationId, event.messageId, event.patch);
    } else if (event.type === 'SYSTEM_UPDATE') {
      s.applySystemUpdate(event.tripId, _metaPatchToEntryPatch(event.patch));
    }
  },

  setConversations(convs: TripConversation[]): void {
    const s = useChatStore.getState();
    for (const conv of convs) s.upsertConversation(conv);
  },

  upsertConversation: (conv: TripConversation): void =>
    useChatStore.getState().upsertConversation(conv),

  getConversation: (id: string): TripConversation | undefined =>
    useChatStore.getState().getConversationByConvId(id) ?? undefined,

  hasConversation: (id: string): boolean =>
    !!useChatStore.getState().convToTrip[id],

  getTripMeta: (tripId: string): TripMeta | undefined => {
    const s = useChatStore.getState();
    const entry = s.trips[tripId];
    return entry
      ? tripEntryToMeta(entry, { viewerOrgId: s.bootstrappedOrg })
      : undefined;
  },

  getConversationsByTripId: (tripId: string): TripConversation[] => {
    const s = useChatStore.getState();
    const entry = s.trips[tripId];
    if (!entry) return [];
    return (Object.entries(entry.parties) as [ConversationPartyType, PartyConv][])
      .map(([pt, party]) => _convFromEntry(entry, pt, party));
  },

  getTripThread: (tripId: string, partyType: ConversationPartyType): TripConversation | null => {
    const entry = useChatStore.getState().trips[tripId];
    if (!entry) return null;
    const party = entry.parties[partyType];
    return party ? _convFromEntry(entry, partyType, party) : null;
  },

  getTripView: (tripId: string): {
    meta: TripMeta | null;
    threads: Record<ConversationPartyType, TripConversation | null>;
  } => {
    const s = useChatStore.getState();
    const entry = s.trips[tripId];
    return {
      meta: entry
        ? tripEntryToMeta(entry, { viewerOrgId: s.bootstrappedOrg })
        : null,
      threads: {
        client:   entry?.parties.client   ? _convFromEntry(entry, 'client',   entry.parties.client)   : null,
        supplier: entry?.parties.supplier ? _convFromEntry(entry, 'supplier', entry.parties.supplier) : null,
        driver:   entry?.parties.driver   ? _convFromEntry(entry, 'driver',   entry.parties.driver)   : null,
      },
    };
  },

  getActivePartyType: (tripId: string): ConversationPartyType | undefined =>
    useChatStore.getState().activeParties[tripId],

  getActiveConversationForTrip: (tripId: string): TripConversation | undefined => {
    const s = useChatStore.getState();
    const entry = s.trips[tripId];
    if (!entry) return undefined;
    const partyType = s.activeParties[tripId];
    const entries = Object.entries(entry.parties) as [ConversationPartyType, PartyConv][];
    if (entries.length === 0) return undefined;
    const [resolvedType, resolvedParty] =
      partyType && entry.parties[partyType]
        ? [partyType, entry.parties[partyType]!]
        : entries[0];
    return _convFromEntry(entry, resolvedType, resolvedParty);
  },

  applyTripMetaUpdate: (tripId: string, patch: Partial<TripMeta>): void =>
    useChatStore.getState().applySystemUpdate(tripId, _metaPatchToEntryPatch(patch)),

  switchParty: (tripId: string, partyType: ConversationPartyType): void =>
    useChatStore.getState().switchParty(tripId, partyType),

  markRead: (convId: string): void =>
    useChatStore.getState().markRead(convId),

  patchMessage: (convId: string, msgId: string, patch: Partial<TripMessageRow>): void =>
    useChatStore.getState().patchMessage(convId, msgId, patch),

  applyLedgerBookOptimistic: (convId: string, transactionId: string): void =>
    useChatStore.getState().applyLedgerBookOptimistic(convId, transactionId),

  revertLedgerBookOptimistic: (convId: string, transactionId: string): void =>
    useChatStore.getState().revertLedgerBookOptimistic(convId, transactionId),

  patchReadReceiptsOptimistic: (convId: string, messageIds: string[]): void =>
    useChatStore.getState().patchReadReceiptsOptimistic(convId, messageIds),

  submitFeedback: (convId: string, msgId: string, patch: Partial<TripMessageRow>): void =>
    useChatStore.getState().submitFeedback(convId, msgId, patch),

  submitTripFeedback: (convId: string, msgId: string, rating: number): void =>
    useChatStore.getState().submitTripFeedback(convId, msgId, rating),

  submitSmileyFeedback: (
    messageId: string,
    rating: number,
    opts?: { comment?: string },
  ): Promise<{ error: string | null }> =>
    useChatStore.getState().submitSmileyFeedback(messageId, rating, opts),

  appendMessage: (convId: string, msg: TripMessageRow): void =>
    useChatStore.getState().appendMessage(convId, msg),

  processIncomingEvent: (
    row: Partial<TripMessageRow>,
    mode: "active" | "background",
    opts?: { hubListOnly?: boolean },
  ): void => useChatStore.getState().processIncomingEvent(row, mode, opts),

  optimisticInsert: (convId: string, msg: TripMessageRow): void =>
    useChatStore.getState().optimisticInsert(convId, msg),

  replaceOptimistic: (convId: string, tempId: string, persisted: TripMessageRow): void =>
    useChatStore.getState().replaceOptimistic(convId, tempId, persisted),

  removeMessage: (convId: string, msgId: string): void =>
    useChatStore.getState().removeMessage(convId, msgId),

  mergeConversationHistory: (convId: string, messages: TripMessageRow[]): boolean =>
    useChatStore.getState().mergeConversationHistory(convId, messages),

  hydrateTripMessagesIfNeeded: (
    tripId: string,
    opts?: { conversationId?: string },
  ): Promise<void> =>
    useChatStore.getState().hydrateTripMessagesIfNeeded(tripId, opts),

  shouldFetchOpenThreadHistory: (conversationId: string): boolean =>
    useChatStore.getState().shouldFetchOpenThreadHistory(conversationId),

  prefetchConversationWindows: (conversationIds: readonly string[]): void =>
    useChatStore.getState().prefetchConversationWindows(conversationIds),

  clear: (): void => useChatStore.getState().clear(),
} as const;

// ── React hooks ───────────────────────────────────────────────────────────────

const _subscribe = (cb: () => void) => useChatStore.subscribe(() => cb());

/** All conversations — re-renders on any store mutation. */
export function useConversations(): TripConversation[] {
  return useSyncExternalStore(_subscribe, _buildSnapshot, () => []);
}

/**
 * Single conversation by id.
 * Re-renders only when the containing TripEntry reference changes — not on
 * mutations to unrelated trips.
 */
export function useConversation(id: string | null): TripConversation | null {
  const prevRef = useRef<{
    id:         string | null;
    entryRef:   TripEntry | null;
    partyRef:   PartyConv | null;
    streamLen:  number;
    streamTail: string | null;
    conv:       TripConversation | null;
  }>({ id: null, entryRef: null, partyRef: null, streamLen: 0, streamTail: null, conv: null });

  return useSyncExternalStore(
    _subscribe,
    () => {
      if (!id) return null;
      const s         = useChatStore.getState();
      const tripId    = s.convToTrip[id];
      const partyType = s.convToParty[id];
      if (!tripId || !partyType) return null;
      const entry = s.trips[tripId];
      const party = entry?.parties[partyType];
      if (!entry || !party) return null;

      const streamLen = entry.event_stream.length;
      const streamTail =
        streamLen > 0 ? entry.event_stream[streamLen - 1]?.id ?? null : null;
      const prev = prevRef.current;
      if (
        entry === prev.entryRef &&
        party === prev.partyRef &&
        id === prev.id &&
        streamLen === prev.streamLen &&
        streamTail === prev.streamTail &&
        prev.conv
      ) {
        return prev.conv;
      }
      const conv = _convFromEntry(entry, partyType as ConversationPartyType, party);
      prevRef.current = {
        id,
        entryRef: entry,
        partyRef: party,
        streamLen,
        streamTail,
        conv,
      };
      return conv;
    },
    () => null,
  );
}

/** All conversations for a single trip (client + supplier + driver lanes). */
export function useConversationsByTrip(tripId: string | null): TripConversation[] {
  const prevRef = useRef<TripConversation[]>([]);
  return useSyncExternalStore(
    _subscribe,
    () => {
      if (!tripId) return prevRef.current.length === 0 ? prevRef.current : (prevRef.current = []);
      const s     = useChatStore.getState();
      const entry = s.trips[tripId];
      if (!entry) return prevRef.current.length === 0 ? prevRef.current : (prevRef.current = []);
      const next = partyLanesForHubEntry(entry).map(([pt, party]) =>
        _convFromEntry(entry, pt, party),
      );
      const prev = prevRef.current;
      if (next.length === prev.length && next.every((c, i) => c.id === prev[i]?.id)) return prev;
      prevRef.current = next;
      return next;
    },
    () => [],
  );
}

/** Trip metadata snapshot; `payment_balance` is lane-scoped to the active party tab. */
export function useTripMeta(
  tripId: string | null,
  viewerOrgId: string | null,
  lane: { partyType: ConversationPartyType; conversationId: string } | null,
): TripMeta | null {
  const prevRef = useRef<{
    entryRef: TripEntry | null;
    laneKey:  string;
    meta:     TripMeta | null;
  }>({
    entryRef: null,
    laneKey:  "",
    meta:     null,
  });
  return useSyncExternalStore(
    _subscribe,
    () => {
      const entry = tripId ? useChatStore.getState().trips[tripId] ?? null : null;
      const laneKey = `${viewerOrgId ?? ""}|${lane?.partyType ?? ""}|${lane?.conversationId ?? ""}`;
      if (
        entry === prevRef.current.entryRef &&
        laneKey === prevRef.current.laneKey &&
        prevRef.current.meta
      ) {
        return prevRef.current.meta;
      }
      const meta = entry
        ? tripEntryToMeta(entry, {
            viewerOrgId,
            partyType:           lane?.partyType ?? null,
            laneConversationId:  lane?.conversationId ?? null,
          })
        : null;
      prevRef.current = { entryRef: entry, laneKey, meta };
      return meta;
    },
    () => null,
  );
}

/** Total unread badge count across all trip conversations. */
export function useTotalUnreadCount(): number {
  const prevRef = useRef(0);
  return useSyncExternalStore(
    _subscribe,
    () => {
      const next = Object.values(useChatStore.getState().trips).reduce(
        (s, entry) => s + sumHubVisibleUnread(entry),
        0,
      );
      if (next === prevRef.current) return prevRef.current;
      prevRef.current = next;
      return next;
    },
    () => 0,
  );
}

/** Active party type for a trip — set by switchParty on every tab press. */
export function useActivePartyType(tripId: string | null): ConversationPartyType | null {
  const prevRef = useRef<ConversationPartyType | null>(null);
  return useSyncExternalStore(
    _subscribe,
    () => {
      const next = tripId ? (useChatStore.getState().activeParties[tripId] ?? null) : null;
      if (next === prevRef.current) return prevRef.current;
      prevRef.current = next;
      return next;
    },
    () => null,
  );
}

type TripView = { meta: TripMeta | null; threads: Record<ConversationPartyType, TripConversation | null> };
const EMPTY_TRIP_VIEW: TripView = {
  meta:    null,
  threads: { client: null, supplier: null, driver: null },
};

/** Reactive composite trip view — threads keyed by party_type for O(1) tab switches. */
export function useTripView(tripId: string | null): TripView {
  const prevRef = useRef<TripView>(EMPTY_TRIP_VIEW);
  return useSyncExternalStore(
    _subscribe,
    () => {
      if (!tripId) return EMPTY_TRIP_VIEW;
      const next = chatStore.getTripView(tripId);
      const prev = prevRef.current;
      if (
        next.meta              === prev.meta &&
        next.threads.client   === prev.threads.client &&
        next.threads.supplier === prev.threads.supplier &&
        next.threads.driver   === prev.threads.driver
      ) return prev;
      prevRef.current = next;
      return next;
    },
    () => EMPTY_TRIP_VIEW,
  );
}

/** The conversation for the currently active party of a trip. */
export function useActiveTripConversation(tripId: string | null): TripConversation | null {
  const prevRef = useRef<TripConversation | null>(null);
  return useSyncExternalStore(
    _subscribe,
    () => {
      const next = tripId ? (chatStore.getActiveConversationForTrip(tripId) ?? null) : null;
      if (next?.id === prevRef.current?.id && next === prevRef.current) return prevRef.current;
      prevRef.current = next;
      return next;
    },
    () => null,
  );
}
