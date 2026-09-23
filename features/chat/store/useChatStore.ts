/**
 * useChatStore — Zustand store for the B2B Chat engine.
 *
 * DATA MODEL  (WhatsApp "Bootstrap & Patch"):
 *   trips[tripId] = {
 *     metadata: { status, driverName, vehicle, route, … },
 *     parties:  { client: PartyConv, supplier: PartyConv, driver: PartyConv },
 *     event_stream: TripEvent[]   ← ALL parties merged, sorted ASC
 *   }
 *
 * BOOTSTRAP (windowed DB calls):
 *   bootstrap / appendBootstrapTripPage fetch trip windows. RPC returns **conversation
 *   summaries only** (`p_include_message_bodies=false` when supported); message bodies
 *   merge into `event_stream` only after {@link ChatState.hydrateTripMessagesIfNeeded}
 *   runs on thread open. Cold start may hydrate summaries from AsyncStorage first.
 *
 * REALTIME PATCH (zero DB calls):
 *   processIncomingEvent(row, mode, opts?)  idempotent upsert; `hubListOnly` skips
 *   `event_stream` merge for non-open threads (lighter hub CPU). 500ms dedupe (message_id /
 *   transaction_id); 1s dedupe (metadata.action_id); message_type switch multiplex
 *   (ledger_update, assignment_update, document_upload, …); payload-driven patches.
 *   appendMessage(convId, msg)       idempotent upsert + optimistic delivery (outgoing).
 *   onRealtimeInsert / optimisticInsert — thin aliases for backward compatibility.
 *   onRealtimeAck(convId, msgId, patch)  patches ticks; identical ACK deduped (500ms).
 *   enqueueReadReceiptsDebounced / registerMarkMessagesSeenRpc — batched seen RPC.
 *   applySystemUpdate(tripId, patch)  merges external metadata changes.
 *
 * MULTI-PARTY TABS (0 ms, zero DB):
 *   Tab switches change selectedPartyType in the UI.  The detail panel
 *   filters event_stream by partyType or visibility_tags in memory — no store
 *   mutation needed.
 *
 * BACKWARD COMPAT:
 *   chatStore.ts re-exports shim hooks (useConversation, useTripMeta, …)
 *   that reconstruct TripConversation / TripMeta from TripEntry on the fly.
 *   Existing call sites keep compiling without changes.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { isSupabaseCircuitOpen } from '@/lib/supabaseHttp.util';
import { recordMarkMessagesSeen } from '@/lib/chatPerf';
import {
  fetchChatBootstrapPayload,
  fetchConversationHistory,
  submitAtomicFeedback,
  submitTripChatFeedback,
} from '../services/chat.service';
import {
  clearChatBootstrapSummaries,
  loadChatBootstrapSummaries,
  persistChatBootstrapSummaries,
} from '../persist/chatBootstrapPersist';
import { mergeChatLanes } from '../utils/laneMultiplexer.util';
import type {
  B2BTripState,
  ChatTripFlow,
  ConversationPartyType,
  FeedbackRequestMetadata,
  LedgerEventMetadata,
  MessageDeliveryStatus,
  TripConversation,
  TripFeedbackLaneStatus,
  TripMessageMetadata,
  TripMessageRow,
  TripMeta,
} from '../types/chat.types';
import { useGlobalSyncStore } from '@/lib/globalSync/useGlobalSyncStore';
import { mergeMessageMetadataForEventPayload } from '../utils/eventPayloadMerge.util';
import { isEventVisibleForPartyLane, isLedgerLikeMessageType } from '../utils/messagePartyVisibility';
import { computeLaneLedgerBalance, ledgerEventInvolvesOrg } from '../utils/ledgerVisibility.util';
import { dedupeTripStatusBroadcastsForLane } from '../utils/dedupeTripStatusBroadcastForLane.util';
import type { ChatLanes } from '../utils/laneMultiplexer.util';
import { recomputeLongHaulTripFieldsFromStream } from '../utils/longHaulChat.util';
import { parseSystemLogLocationData } from '../utils/locationLogPayload.util';
import { parseFeedbackRequestMetadata } from '../utils/feedbackRequestMeta';
import { isFeedbackRequestAlreadyRatedMeta } from '../utils/feedbackRequestMeta.util';
import { getActiveTripMessageConversationId } from '../realtime/activeTripMessageScope';

// ── Realtime duplicate suppression (same message_id / transaction_id flood) ──
// WAL can surface the same logical row twice in quick succession; skipping the
// second `set()` within this window avoids redundant renders and double side-effects
// (e.g. ledger balance) before `isNewId` bookkeeping runs.

const REALTIME_INSERT_DEDUPE_MS = 500;
const REALTIME_ACK_DEDUPE_MS = 500;

const lastRealtimeInsertAt = new Map<string, number>();
const lastRealtimeAckAt = new Map<string, number>();

/** Prevents duplicate concurrent `get_unified_b2b_bootstrap` RPCs (Strict Mode / remounts). */
let chatBootstrapInFlightFor: string | null = null;
let hubHistoryBootstrapInFlightFor: string | null = null;

function realtimeInsertDedupeKey(row: Partial<TripMessageRow>): string {
  const id = row.id != null ? String(row.id) : '';
  if (id) return `m:${id}`;
  const m = row.metadata as Record<string, unknown> | null | undefined;
  const ep = m?.event_payload as Record<string, unknown> | undefined;
  const txn =
    (typeof m?.transaction_id === 'string' && m.transaction_id) ||
    (typeof ep?.transaction_id === 'string' && ep.transaction_id) ||
    '';
  if (txn) return `t:${txn}`;
  return `m:${id || 'unknown'}`;
}

/** @returns true if this event should be processed (first in window). */
function consumeRealtimeInsertDedupe(row: Partial<TripMessageRow>): boolean {
  const key = realtimeInsertDedupeKey(row);
  const now = Date.now();
  const prev = lastRealtimeInsertAt.get(key);
  if (prev != null && now - prev < REALTIME_INSERT_DEDUPE_MS) return false;
  lastRealtimeInsertAt.set(key, now);
  return true;
}

function ackFingerprint(patch: Partial<TripMessageRow>): string {
  return [
    patch.is_delivered,
    patch.delivered_at,
    patch.is_read,
    patch.read_at,
    patch.reactions != null ? JSON.stringify(patch.reactions) : "",
    patch.edited_at ?? "",
  ].join('|');
}

/** @returns true if this ACK should be applied (dedupes identical patches). */
function consumeRealtimeAckDedupe(msgId: string, patch: Partial<TripMessageRow>): boolean {
  const key = `ack:${msgId}:${ackFingerprint(patch)}`;
  const now = Date.now();
  const prev = lastRealtimeAckAt.get(key);
  if (prev != null && now - prev < REALTIME_ACK_DEDUPE_MS) return false;
  lastRealtimeAckAt.set(key, now);
  return true;
}

/** Same logical action from trigger + mobile API: drop duplicate within 1s (metadata.action_id or event_payload.action_id). */
const ACTION_ID_DEDUPE_MS = 1000;
const lastActionIdAt = new Map<string, number>();

function extractActionId(row: Partial<TripMessageRow>): string | null {
  const m = mergeMessageMetadataForEventPayload(row);
  if (!m) return null;
  const ep = m.event_payload as Record<string, unknown> | undefined;
  const top =
    (typeof m.action_id === 'string' && m.action_id.trim()) ||
    (ep && typeof ep.action_id === 'string' && String(ep.action_id).trim()) ||
    '';
  return top || null;
}

function consumeActionIdDedupe(row: Partial<TripMessageRow>): boolean {
  const aid = extractActionId(row);
  if (!aid) return true;
  const key = `a:${aid}`;
  const now = Date.now();
  const prev = lastActionIdAt.get(key);
  if (prev != null && now - prev < ACTION_ID_DEDUPE_MS) return false;
  lastActionIdAt.set(key, now);
  return true;
}

const BROADCAST_DEDUPE_WINDOW_MS = 120_000;

/** Prune stale entries from module-level dedupe Maps (called by TripChatContext on interval). */
export function pruneModuleLevelDedupeState(): void {
  const now = Date.now();
  for (const [k, t] of lastRealtimeInsertAt) {
    if (now - t > 2000) lastRealtimeInsertAt.delete(k);
  }
  for (const [k, t] of lastRealtimeAckAt) {
    if (now - t > 2000) lastRealtimeAckAt.delete(k);
  }
  for (const [k, t] of lastActionIdAt) {
    if (now - t > 5000) lastActionIdAt.delete(k);
  }
}

function broadcastStatusKeyFromRow(row: Partial<TripMessageRow>): string | null {
  const m = mergeMessageMetadataForEventPayload(row);
  if (!m) return null;
  const tb = m.trip_status_broadcast;
  const isB = tb === '1' || tb === 1 || tb === true;
  if (!isB) return null;
  const st =
    (typeof m.status === 'string' && m.status.trim()) ||
    (() => {
      const ep = m.event_payload;
      if (ep && typeof ep === 'object' && !Array.isArray(ep) && typeof (ep as { new_status?: unknown }).new_status === 'string') {
        return String((ep as { new_status: string }).new_status).trim();
      }
      return '';
    })();
  return st || null;
}

/**
 * Trigger + driver "quick status" can both insert a status line; keep one bubble
 * per (conversation, broadcast status) within the dedupe window.
 */
function shouldSkipDuplicateStatusBroadcast(stream: TripEvent[], incoming: TripEvent): boolean {
  const statusKey = broadcastStatusKeyFromRow(incoming);
  if (!statusKey) return false;
  const tIncoming = new Date(incoming.created_at).getTime();
  if (!Number.isFinite(tIncoming)) return false;
  for (const e of stream) {
    if (e.id === incoming.id) continue;
    if (e.conversation_id !== incoming.conversation_id) continue;
    const sk = broadcastStatusKeyFromRow(e);
    if (sk !== statusKey) continue;
    const t = new Date(e.created_at).getTime();
    if (Number.isFinite(t) && Math.abs(tIncoming - t) <= BROADCAST_DEDUPE_WINDOW_MS) return true;
  }
  return false;
}

/** Payload-driven trip fields: `trip_state`, `event_payload`, top-level `new_status`. */
function patchEntryFromB2BTripState(ts: B2BTripState, base: TripEntry): Partial<TripEntry> {
  return {
    status:               ts.status != null ? ts.status : base.status,
    driverId:             ts.driver_id ?? base.driverId,
    supplierId:           ts.supplier_id ?? base.supplierId,
    driverDisplayName:    ts.driver_display_name ?? base.driverDisplayName,
    vehicleDisplayNumber: ts.vehicle_display_number ?? base.vehicleDisplayNumber,
    pickupArea:           ts.pickup_area ?? base.pickupArea,
    dropLocation:         ts.drop_location ?? base.dropLocation,
  };
}

function resolveTripEntryPatchesFromMessage(
  row: Partial<TripMessageRow>,
  entry: TripEntry,
): Partial<TripEntry> | null {
  const m = mergeMessageMetadataForEventPayload(row);
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;

  let patch: Partial<TripEntry> = {};
  const ts = m.trip_state as B2BTripState | undefined;
  if (ts && typeof ts === 'object') {
    patch = { ...patch, ...patchEntryFromB2BTripState(ts, { ...entry, ...patch } as TripEntry) };
  }
  const ep = m.event_payload as Record<string, unknown> | undefined;
  if (ep && typeof ep === 'object' && !Array.isArray(ep)) {
    const ets = ep.trip_state as B2BTripState | undefined;
    if (ets && typeof ets === 'object') {
      patch = { ...patch, ...patchEntryFromB2BTripState(ets, { ...entry, ...patch } as TripEntry) };
    }
    const ns = ep.new_status;
    if (typeof ns === 'string' && ns.trim()) patch.status = ns;

    const ld = ep.location_data;
    if (ld && typeof ld === 'object' && !Array.isArray(ld)) {
      const lat = Number((ld as { lat?: unknown }).lat);
      const lng = Number((ld as { lng?: unknown }).lng);
      const address_name =
        typeof (ld as { address_name?: unknown }).address_name === 'string'
          ? String((ld as { address_name: string }).address_name).trim() || null
          : null;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const tsLoc =
          typeof row.created_at === 'string' && row.created_at.trim()
            ? row.created_at
            : new Date().toISOString();
        patch = {
          ...patch,
          lastLat:             lat,
          lastLng:             lng,
          lastLocationAt:      tsLoc,
          lastLocationLabel:   address_name,
        };
      }
    }
  }
  const nsTop = m.new_status;
  if (typeof nsTop === 'string' && nsTop.trim()) patch.status = nsTop;

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Realtime multiplex: apply `message_type`-specific trip patches on top of
 * generic `event_payload` / `trip_state` resolution (Bootstrap & Patch model).
 */
function applyActiveMessageTypeMultiplex(
  row: Partial<TripMessageRow>,
  entry: TripEntry,
  updated: TripEntry,
  isNewId: boolean,
  eventCreatedAt: string | undefined,
): TripEntry {
  let next = updated;
  const mt = row.message_type ?? "text";

  const baseResolved = resolveTripEntryPatchesFromMessage(row, entry);
  if (baseResolved) {
    next = { ...next, ...baseResolved };
  }

  switch (mt) {
    case "ledger_update":
    case "ledger_event":
    case "ledger":
    case "payment":
      // Financial net is derived in tripEntryToMeta / useTripMeta from visible rows only.
      break;
    case "assignment_update": {
      const m = mergeMessageMetadataForEventPayload(row);
      const ep = (m?.event_payload ?? {}) as Record<string, unknown>;
      const patch: Partial<TripEntry> = {};
      if (typeof ep.driver_id === "string" && ep.driver_id.trim()) {
        patch.driverId = ep.driver_id.trim();
      }
      if (typeof ep.driver_display_name === "string" && ep.driver_display_name.trim()) {
        patch.driverDisplayName = ep.driver_display_name.trim();
      }
      if (typeof ep.vehicle_display_number === "string" && ep.vehicle_display_number.trim()) {
        patch.vehicleDisplayNumber = ep.vehicle_display_number.trim();
      }
      if (Object.keys(patch).length > 0) next = { ...next, ...patch };
      break;
    }
    case "document_upload":
      break;
    case "tracking": {
      const meta = row.metadata as {
        lat?: number;
        lng?: number;
        eta_minutes?: number;
        eta_label?: string;
      } | null;
      if (meta?.lat != null && meta?.lng != null) {
        next = {
          ...next,
          lastLat:        meta.lat,
          lastLng:        meta.lng,
          lastLocationAt: eventCreatedAt ?? new Date().toISOString(),
          lastEtaMinutes: meta.eta_minutes ?? null,
          lastEtaLabel:   meta.eta_label ?? null,
        };
      }
      break;
    }
    default:
      break;
  }

  return next;
}

function withLongHaulFieldsFromStream(entry: TripEntry): TripEntry {
  const lh = recomputeLongHaulTripFieldsFromStream(entry.event_stream);
  return {
    ...entry,
    trackingStatus:       lh.trackingStatus,
    longHaulRevisedEta:     lh.longHaulRevisedEta,
    longHaulHealthStatus:   lh.longHaulHealthStatus,
  };
}

/** Push last_known_location + optional odometer heartbeat into GlobalSync active_trips (no DB read). */
function syncLocationLogToGlobalActiveTrips(tripId: string, row: Partial<TripMessageRow>): void {
  const mt = row.message_type;
  if (mt !== "system_log" && mt !== "location_log") return;
  const parsed = parseSystemLogLocationData(row);
  if (!parsed) return;
  const recorded_at =
    typeof row.created_at === "string" && row.created_at.trim()
      ? row.created_at
      : parsed.recorded_at ?? new Date().toISOString();
  useGlobalSyncStore.getState().applyActiveTripLocationFromChat(tripId, {
    lat: parsed.lat,
    lng: parsed.lng,
    address_name: parsed.address_name ?? null,
    recorded_at,
  });
  if (parsed.odometer_km != null && Number.isFinite(parsed.odometer_km)) {
    useGlobalSyncStore.getState().applyActiveTripHeartbeatFromChat(tripId, {
      odometer_km: parsed.odometer_km,
      recorded_at: parsed.recorded_at ?? recorded_at,
    });
  }
}

// ── Debounced mark-seen (one RPC per visibility burst per conversation) ───────

const readFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const readPendingIds = new Map<string, Set<string>>();

let markMessagesSeenInvoker:
  | ((conversationId: string, messageIds: string[]) => void | Promise<void>)
  | null = null;

/**
 * Registers the DB flusher (typically `supabase.rpc('mark_messages_seen', …)`).
 * Call once from `TripChatProvider`; pass `null` on teardown.
 */
export function registerMarkMessagesSeenRpc(
  fn: ((conversationId: string, messageIds: string[]) => void | Promise<void>) | null,
): void {
  markMessagesSeenInvoker = fn;
}

function clearReadReceiptDebouncers(): void {
  for (const t of readFlushTimers.values()) clearTimeout(t);
  readFlushTimers.clear();
  readPendingIds.clear();
}

/**
 * Accumulates message ids and flushes one optimistic store write + one RPC after
 * `debounceMs` of quiet time (FlatList viewability → many rows, one round-trip).
 */
/** Default debounce for batched read receipts (mobile + web). */
export const READ_RECEIPT_DEBOUNCE_MS = 2000;

/** Drop pending `mark_messages_seen` debounce for one thread (e.g. full mark-read). */
export function clearReadReceiptDebouncerForConversation(conversationId: string): void {
  const t = readFlushTimers.get(conversationId);
  if (t) clearTimeout(t);
  readFlushTimers.delete(conversationId);
  readPendingIds.delete(conversationId);
}

export function enqueueReadReceiptsDebounced(
  conversationId: string,
  messageIds: string[],
  debounceMs = READ_RECEIPT_DEBOUNCE_MS,
): void {
  if (!conversationId || messageIds.length === 0) return;
  let set = readPendingIds.get(conversationId);
  if (!set) {
    set = new Set();
    readPendingIds.set(conversationId, set);
  }
  for (const id of messageIds) {
    if (id) set.add(id);
  }
  const existing = readFlushTimers.get(conversationId);
  if (existing) clearTimeout(existing);
  readFlushTimers.set(
    conversationId,
    setTimeout(() => {
      readFlushTimers.delete(conversationId);
      const pending = readPendingIds.get(conversationId);
      readPendingIds.delete(conversationId);
      if (!pending?.size) return;
      const ids = [...pending];
      useChatStore.getState().patchReadReceiptsOptimistic(conversationId, ids);
      if (markMessagesSeenInvoker) recordMarkMessagesSeen();
      void markMessagesSeenInvoker?.(conversationId, ids);
    }, debounceMs),
  );
}

// ── Event: a message enriched with its conversation's party type ──────────────

export interface TripEvent extends TripMessageRow {
  /** Denormalized from the containing conversation — used for tab filtering. */
  partyType: ConversationPartyType;
}

// ── Per-party lane (one conversation per party per trip) ──────────────────────

export interface PartyConv {
  conversationId: string;
  organizationId: string;
  partyName:      string;
  clientId:       string | null;
  supplierId:     string | null;
  driverId:       string | null;
  unreadCount:    number;
  /** Mirrors bootstrap `trip_feedback_status`; patched optimistically on submit. */
  feedbackStatus?: TripFeedbackLaneStatus;
  /** Newest-page history merged for this lane (bootstrap embed or open-thread hydrate). */
  historyWindowLoaded?: boolean;
}

// ── Single trip entry — the core data unit in the store ──────────────────────

export interface TripEntry {
  tripId:               string;
  tripNumber:           string;
  displayTripId:        string | null;
  /** Integrated indent-backed vs private employer–driver trip chat. */
  chatFlow:             ChatTripFlow;
  indentId:             string | null;
  // Mutable trip metadata — patched by B2BEventMetadata / status_change / system
  status:               string | null;
  driverDisplayName:    string | null;
  vehicleDisplayNumber: string | null;
  driverId:             string | null;
  supplierId:           string | null;
  pickupArea:           string;
  dropLocation:         string;
  createdAt:            string | null;
  // Live location — injected from 'tracking' events, never fetched
  lastLat?:             number | null;
  lastLng?:             number | null;
  lastLocationAt?:      string | null;
  lastEtaMinutes?:      number | null;
  lastEtaLabel?:        string | null;
  /** Human label from location logs (`event_payload.location_data.address_name`). */
  lastLocationLabel?:   string | null;
  /** Long-haul lane health from merged event stream (RUNNING_LATE when latest LATE log present). */
  trackingStatus:       string | null;
  longHaulRevisedEta:   string | null;
  longHaulHealthStatus: string | null;
  /** From `trips.organization_id` (bootstrap); used for debrief RPC org scope. */
  tripOrganizationId:   string | null;
  /** Display name of the trip fleet owner org (organizations.name). Populated by bootstrap. */
  tripOrganizationName: string | null;
  /** Indent / shipper org name for supplier-side Client tab when mirror trip omits indent_id. */
  indentCreatorOrganizationName: string | null;
  // Party lanes (at most one per ConversationPartyType)
  parties:              Partial<Record<ConversationPartyType, PartyConv>>;
  // Unified event stream for ALL parties, sorted ASC by created_at.
  // Messages are filtered per-tab using visibility_tags (when present) or partyType.
  event_stream:         TripEvent[];
  // Sidebar
  lastEventAt:          string | null;
  lastEventPreview:     string | null;
  totalUnread:          number;
  /** Counterparty org id for integrated trips (viewer is client → supplier lane org, and vice versa). */
  partnerOrganizationId: string | null;
  /** From `trips.source` on bootstrap (e.g. `manual`). */
  tripSource?: string | null;
  /** When true, bootstrap omitted message rows for this trip; open-thread hydration loads history. */
  skipEventStreamHydration?: boolean;
}

// ── Store shape ───────────────────────────────────────────────────────────────

interface ChatState {
  // ── Data
  trips:           Record<string, TripEntry>;
  convToTrip:      Record<string, string>;                 // convId → tripId
  convToParty:     Record<string, ConversationPartyType>;  // convId → partyType
  activeParties:   Record<string, ConversationPartyType>;  // tripId → last selected
  bootstrappedOrg: string | null;
  isLoading:       boolean;
  /** Multi-lane commercial / operational message-id maps (from `get_multi_lane_bootstrap` or client mux). */
  chatLanes:       ChatLanes | null;
  /** True when the server may return another trip window (windowed bootstrap). */
  chatBootstrapHasMoreTrips: boolean;
  /** Next `p_trip_offset` for {@link appendBootstrapTripPage}. */
  chatBootstrapNextTripOffset: number;
  isAppendingBootstrap: boolean;
  /** After {@link ensureHubHistoryBootstrap} succeeds for this org session. */
  hubHistoryBootstrapDone: boolean;

  // ── Actions
  bootstrap:                 (orgId: string) => Promise<void>;
  appendBootstrapTripPage:   (orgId: string) => Promise<void>;
  ensureHubHistoryBootstrap: (orgId: string) => Promise<void>;
  /**
   * Windowed history hydrate for lazy trips. Omit opts to fetch every lane that still
   * needs a window. Pass `conversationId` to load only the active lane (skeleton others).
   * No-op when `skipEventStreamHydration === false` (full bootstrap already merged all lanes).
   */
  hydrateTripMessagesIfNeeded: (
    tripId: string,
    opts?: { conversationId?: string },
  ) => Promise<void>;
  /** Idempotent: INSERT / echo rows merge into `event_stream` by `id` (unless `hubListOnly`). */
  processIncomingEvent: (
    row: Partial<TripMessageRow>,
    mode: 'active' | 'background',
    opts?: { hubListOnly?: boolean },
  ) => void;
  onRealtimeInsert:   (row: Partial<TripMessageRow>, mode: 'active' | 'background') => void;
  /** Idempotent upsert used for optimistic sends (and any local append). */
  appendMessage:      (convId: string, msg: TripMessageRow) => void;
  onRealtimeAck:      (convId: string, msgId: string, patch: Partial<TripMessageRow>) => void;
  /** Coalesces many `trip_messages` UPDATE Realtime events into one Zustand write (read receipts). */
  onRealtimeAckBatch: (
    items: ReadonlyArray<{ convId: string; msgId: string; patch: Partial<TripMessageRow> }>,
  ) => void;
  switchParty:        (tripId: string, partyType: ConversationPartyType) => void;
  markRead:           (convId: string) => void;
  patchMessage:       (convId: string, msgId: string, patch: Partial<TripMessageRow>) => void;
  /** Single Zustand write for many read receipts (viewability flush). */
  patchReadReceiptsOptimistic: (convId: string, messageIds: string[]) => void;
  optimisticInsert:   (convId: string, msg: TripMessageRow) => void;
  replaceOptimistic:  (convId: string, tempId: string, persisted: TripMessageRow) => void;
  removeMessage:      (convId: string, msgId: string) => void;
  upsertConversation: (conv: TripConversation) => void;
  /** Realtime `trip_conversations` row — sync sidebar unread + preview from DB denorm. */
  patchTripConversationFromRealtime: (row: Record<string, unknown>) => void;
  /**
   * Pull newest message page when denorm preview/at is ahead of `event_stream`
   * (missed INSERT / own-send race). Debounced + single-flight per conversation.
   */
  syncTripThreadIfStale: (convId: string, opts?: { force?: boolean }) => void;
  applySystemUpdate:  (tripId: string, patch: Partial<TripEntry>) => void;
  /** Optimistic feedback submission — patches message metadata locally. The caller
   *  also fires the RPC; this ensures the UI flips immediately. */
  submitFeedback:     (convId: string, msgId: string, patch: Partial<TripMessageRow>) => void;
  /**
   * One-tap smiley feedback: stamps `rating` / `submitted_*` on the message in `event_stream`
   * immediately (caller then invokes `confirm_trip_feedback` via chat.service).
   */
  submitTripFeedback: (convId: string, msgId: string, rating: number) => void;
  /**
   * Smiley debrief: optimistic patch, then `confirm_trip_feedback` (score only).
   * Non-empty `opts.comment` uses `submit_atomic_feedback` when available; missing RPC falls back to `confirm_trip_feedback`.
   */
  submitSmileyFeedback: (
    messageId: string,
    rating: number,
    opts?: { comment?: string },
  ) => Promise<{ error: string | null }>;
  /** Optimistic "Add to books" — marks all ledger rows in this conv with the same transaction_id. */
  applyLedgerBookOptimistic: (convId: string, transactionId: string) => void;
  revertLedgerBookOptimistic: (convId: string, transactionId: string) => void;
  /** Merge on-demand history load into event_stream (used by lazy-load button in detail). */
  mergeConversationHistory: (convId: string, messages: TripMessageRow[]) => boolean;
  clear:              () => void;

  // ── Derived helpers
  getActiveParty:         (tripId: string) => ConversationPartyType | undefined;
  getConversationId:      (tripId: string, partyType: ConversationPartyType) => string | null;
  getConversationByConvId:(convId: string) => TripConversation | null;
  getSortedTripEntries:   () => TripEntry[];
}

// ── Module-level helpers (pure functions) ─────────────────────────────────────

/** WhatsApp-style emoji-prefixed sidebar preview. */
export function previewText(row: Partial<TripMessageRow>): string | null {
  const body = typeof row.content === 'string' ? row.content.trim() : '';
  switch (row.message_type) {
    case 'ledger_event': case 'ledger': case 'payment': case 'ledger_update':
      return `💰 ${body || 'Payment update'}`;
    case 'assignment_update':
      return `🚚 ${body || 'Assignment update'}`;
    case 'document_upload':
      return `📄 ${body || 'Document uploaded'}`;
    case 'status_change': {
      const meta = row.metadata as { new_status?: string } | null;
      const label = meta?.new_status?.replace(/_/g, ' ').toUpperCase() ?? '';
      return `🚚 ${label || body || 'Status update'}`;
    }
    case 'system': case 'update': case 'system_log': {
      const em = mergeMessageMetadataForEventPayload(row);
      const ep = em?.event_payload as { new_status?: string } | undefined;
      const label =
        typeof ep?.new_status === 'string' ? ep.new_status.replace(/_/g, ' ').toUpperCase() : '';
      if (label) return `📋 ${label}`;
      return `📋 ${body || 'System update'}`;
    }
    case 'tracking':
    case 'location_log': {
      const em = mergeMessageMetadataForEventPayload(row);
      const ld = (em?.event_payload as { location_data?: { address_name?: string } } | undefined)
        ?.location_data?.address_name;
      const city = typeof ld === 'string' && ld.trim() ? ld.trim() : null;
      if (city) return `📍 Driver near ${city}`;
      if (body && !body.includes('UTC')) return `📍 ${body}`;
      return '📍 Driver location update';
    }
    case 'document_share':
      return `📄 ${body || 'Document shared'}`;
    case 'feedback_request': case 'feedback':
      return `⭐ ${body || 'Feedback request'}`;
    case 'image':
      return '🖼 Photo';
    default:
      return body ? body.slice(0, 120) : null;
  }
}

/** Deep-merge message metadata objects (bootstrap + Realtime + optimistic). */
export function mergeTripMessageMetadata(
  prev: TripMessageMetadata | undefined,
  next: TripMessageMetadata | undefined,
): TripMessageMetadata | undefined {
  if (next == null) return prev;
  if (prev == null) return next;
  if (
    typeof prev === "object" &&
    typeof next === "object" &&
    !Array.isArray(prev) &&
    !Array.isArray(next)
  ) {
    return { ...(prev as object), ...(next as object) } as TripMessageMetadata;
  }
  return next;
}

/**
 * Binary insert into a sorted-ASC (by created_at) stream.
 * O(log n) search + O(n) splice — avoids O(n log n) full sort + n Date allocations.
 */
function binaryInsertEvent(stream: TripEvent[], incoming: TripEvent): TripEvent[] {
  const t = Date.parse(incoming.created_at);
  let lo = 0, hi = stream.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (Date.parse(stream[mid].created_at) <= t) lo = mid + 1;
    else hi = mid;
  }
  const next = [...stream];
  next.splice(lo, 0, incoming);
  return next;
}

/**
 * Idempotent upsert: same `id` updates in place (status ticks, metadata, body)
 * instead of duplicating — safe for multi-tab Realtime and bootstrap overlap.
 */
export function upsertEventIntoStream(stream: TripEvent[], incoming: TripEvent): TripEvent[] {
  const idx = stream.findIndex((e) => e.id === incoming.id);
  if (idx === -1) {
    // Drop matching optimistic bubble when the persisted row arrives (same send).
    let inheritedClientKey: string | null = null;
    const withoutOptimistic = incoming.id && !String(incoming.id).startsWith("optimistic-")
      ? stream.filter((e) => {
          if (!String(e.id).startsWith("optimistic-")) return true;
          if (e.conversation_id !== incoming.conversation_id) return true;
          if (
            incoming.sender_user_id &&
            e.sender_user_id &&
            e.sender_user_id !== incoming.sender_user_id
          ) {
            return true;
          }
          const sameContent =
            String(e.content ?? "") === String(incoming.content ?? "");
          if (!sameContent) return true;
          const eTs = Date.parse(String(e.created_at ?? ""));
          const iTs = Date.parse(String(incoming.created_at ?? ""));
          if (!Number.isFinite(eTs) || !Number.isFinite(iTs)) {
            inheritedClientKey = e.client_key ?? e.id;
            return false;
          }
          if (Math.abs(eTs - iTs) < 60_000) {
            inheritedClientKey = e.client_key ?? e.id;
            return false;
          }
          return true;
        })
      : stream;
    const withKey: TripEvent =
      inheritedClientKey && !incoming.client_key
        ? { ...incoming, client_key: inheritedClientKey }
        : incoming;
    return binaryInsertEvent(withoutOptimistic, withKey);
  }
  const prev = stream[idx];
  const merged: TripEvent = {
    ...prev,
    ...incoming,
    partyType: incoming.partyType ?? prev.partyType,
    client_key: incoming.client_key ?? prev.client_key ?? null,
    metadata: mergeTripMessageMetadata(prev.metadata, incoming.metadata),
  };
  const next = [...stream];
  next[idx] = merged;
  // Common case: same timestamp (status tick / metadata update) — position unchanged.
  if (merged.created_at === prev.created_at) return next;
  // Rare: optimistic→persisted with different server timestamp — re-insert correctly.
  next.splice(idx, 1);
  return binaryInsertEvent(next, merged);
}

/** Merge two TripEvent arrays with per-id deep metadata merge, sorted ASC. */
function mergeEvents(local: TripEvent[], server: TripEvent[]): TripEvent[] {
  let acc = local.length === 0 ? [] : [...local];
  if (server.length === 0) return acc;
  for (const e of server) {
    acc = upsertEventIntoStream(acc, e);
  }
  return acc;
}

/** Outgoing dispatcher bubble: derive tick lane from row + ACK fields. */
export function resolveOutgoingDeliveryStatus(
  m: Partial<TripMessageRow>,
): MessageDeliveryStatus {
  if (m.delivery_status === "sending") return "sending";
  const id = m.id != null ? String(m.id) : "";
  if (id.startsWith("optimistic-")) return "sending";
  if (m.read_at) return "read";
  if (m.is_delivered) return "delivered";
  return "sent";
}

export function resolveChatFlow(
  conv: Pick<TripConversation, "conversation_type" | "indent_id">,
): ChatTripFlow {
  const hasIndent = conv.indent_id != null && String(conv.indent_id).trim() !== "";
  if (hasIndent) return "integrated_group";
  if (conv.conversation_type === "integrated_group") return "integrated_group";
  return "private_trip";
}

/** B2B counterparty lane for the viewer (never the viewer's own org when resolvable). */
export function resolveCounterpartyPartyTypeForViewer(
  entry: Pick<TripEntry, "chatFlow" | "parties" | "indentId"> | null,
  viewerOrgId: string | null,
  /** Active thread — required to disambiguate host trips where client+supplier rows share `organization_id`. */
  activePartyType?: ConversationPartyType | null,
): "client" | "supplier" | null {
  if (!entry) return null;
  const integrated =
    entry.chatFlow === "integrated_group" ||
    Boolean(entry.indentId && String(entry.indentId).trim() !== "");
  if (!integrated) return null;
  const v = String(viewerOrgId ?? "").trim();
  if (!v) return null;
  const c  = entry.parties.client?.organizationId?.trim();
  const su = entry.parties.supplier?.organizationId?.trim();
  const bothLanes = Boolean(c && su);
  const sharedHostOrg = bothLanes && c === su && v === c;
  if (sharedHostOrg) {
    if (activePartyType === "client") return "supplier";
    if (activePartyType === "supplier") return "client";
    return null;
  }
  if (c && v === c && su) return "supplier";
  if (su && v === su && c) return "client";
  return null;
}

function resolvePartnerOrganizationIdForViewer(
  entry: Pick<TripEntry, "chatFlow" | "parties" | "indentId">,
  viewerOrgId: string | null,
): string | null {
  const pt = resolveCounterpartyPartyTypeForViewer(entry, viewerOrgId);
  if (pt === "client") return entry.parties.client?.organizationId?.trim() ?? null;
  if (pt === "supplier") return entry.parties.supplier?.organizationId?.trim() ?? null;
  return null;
}

function withPartnerOrganizationStamp(entry: TripEntry, viewerOrgId: string | null): TripEntry {
  return {
    ...entry,
    partnerOrganizationId: resolvePartnerOrganizationIdForViewer(entry, viewerOrgId),
  };
}

/** Construct a blank TripEntry skeleton from the first conversation seen. */
function entryFromConv(conv: TripConversation): TripEntry {
  return {
    tripId:               conv.trip_id,
    tripNumber:           conv.trip_number,
    displayTripId:        conv.display_trip_id ?? null,
    chatFlow:             resolveChatFlow(conv),
    indentId:
      conv.indent_id != null && String(conv.indent_id).trim() !== ""
        ? String(conv.indent_id)
        : null,
    status:               conv.trip_status ?? null,
    driverDisplayName:    null,
    vehicleDisplayNumber: null,
    driverId:             conv.trip_driver_id ?? null,
    supplierId:           conv.trip_supplier_id ?? null,
    pickupArea:           conv.pickup_area,
    dropLocation:         conv.drop_location,
    createdAt:            conv.trip_created_at ?? null,
    tripOrganizationId:
      conv.trip_organization_id != null && String(conv.trip_organization_id).trim() !== ""
        ? String(conv.trip_organization_id)
        : null,
    tripOrganizationName:
      conv.trip_organization_name != null && String(conv.trip_organization_name).trim() !== ""
        ? String(conv.trip_organization_name)
        : null,
    indentCreatorOrganizationName:
      conv.indent_creator_organization_name != null &&
      String(conv.indent_creator_organization_name).trim() !== ""
        ? String(conv.indent_creator_organization_name)
        : null,
    parties:              {},
    event_stream:         [],
    lastEventAt:          conv.last_message_at,
    lastEventPreview:     conv.last_message_preview,
    totalUnread:          0,
    trackingStatus:       null,
    longHaulRevisedEta:   null,
    longHaulHealthStatus: null,
    partnerOrganizationId: null,
    tripSource:
      conv.trip_source != null && String(conv.trip_source).trim() !== ""
        ? String(conv.trip_source)
        : null,
  };
}

function partyFromConv(conv: TripConversation): PartyConv {
  return {
    conversationId: conv.id,
    organizationId: conv.organization_id,
    partyName:      conv.party_name,
    clientId:       conv.client_id,
    supplierId:     conv.supplier_id,
    driverId:       conv.driver_id,
    unreadCount:    conv.unread_dispatcher_count ?? 0,
    feedbackStatus: conv.trip_feedback_status ?? "none",
  };
}

/** Reconstruct a TripConversation from a TripEntry + one party lane. */
function convFromEntry(
  entry:     TripEntry,
  partyType: ConversationPartyType,
  party:     PartyConv,
): TripConversation {
  const convId = party.conversationId;
  return {
    id:                      convId,
    organization_id:         party.organizationId,
    trip_id:                 entry.tripId,
    party_type:              partyType,
    party_name:              party.partyName,
    client_id:               party.clientId,
    supplier_id:             party.supplierId,
    driver_id:               party.driverId,
    last_message_at:         entry.lastEventAt,
    last_message_preview:    entry.lastEventPreview,
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
    indent_id:                entry.indentId ?? null,
    conversation_type:      entry.chatFlow,
    trip_source:            entry.tripSource ?? null,
    messages: dedupeTripStatusBroadcastsForLane(
      entry.event_stream.filter((e) =>
        isEventVisibleForPartyLane(e, partyType, convId),
      ),
      convId,
    ),
  };
}

/**
 * Hub list + FAB preview lanes. private_trip defaults to driver, but surfaces lanes
 * that hold unread (e.g. client ledger toasts) so badges match visible rows.
 */
export function partyLanesForHubEntry(
  entry: Pick<TripEntry, "parties" | "chatFlow">,
): [ConversationPartyType, PartyConv][] {
  const rows = Object.entries(entry.parties).filter(
    ([, p]) => p != null,
  ) as [ConversationPartyType, PartyConv][];
  if (entry.chatFlow !== "private_trip") return rows;

  const unreadLanes = rows.filter(([, p]) => (p?.unreadCount ?? 0) > 0);
  if (unreadLanes.length > 0) return unreadLanes;

  const driverLane = rows.filter(([pt]) => pt === "driver");
  if (driverLane.length > 0) return driverLane;

  const clientLane = rows.filter(([pt]) => pt === "client");
  if (clientLane.length > 0) return clientLane;

  return rows;
}

/** FAB / tab badge total — only lanes the hub actually lists. */
export function sumHubVisibleUnread(entry: Pick<TripEntry, "parties" | "chatFlow">): number {
  return partyLanesForHubEntry(entry).reduce((s, [, p]) => s + (p?.unreadCount ?? 0), 0);
}

function inboundMessageCountsAsHubUnread(row: Partial<TripMessageRow>): boolean {
  const role = String(row.sender_role ?? "");
  if (role === "dispatcher" || role === "system") return false;
  const mt = String(row.message_type ?? "");
  if (
    mt === "ledger_event" ||
    mt === "ledger" ||
    mt === "payment" ||
    mt === "ledger_update"
  ) {
    return false;
  }
  return true;
}

/** Hub list preview path — bump lane unread when inbound row is not the open thread. */
function applyHubInboundUnread(
  entry: TripEntry,
  partyType: ConversationPartyType,
  row: Partial<TripMessageRow>,
): TripEntry {
  if (!inboundMessageCountsAsHubUnread(row)) return entry;
  const party = entry.parties[partyType];
  if (!party) return entry;
  const parties = {
    ...entry.parties,
    [partyType]: { ...party, unreadCount: party.unreadCount + 1 },
  } as TripEntry["parties"];
  return {
    ...entry,
    parties,
    totalUnread: sumHubVisibleUnread({ ...entry, parties }),
  };
}

/** Apply delivery/read patch to one message in a trip entry (pure). */
function applyAckToTripEntry(
  entry: TripEntry,
  msgId: string,
  patch: Partial<TripMessageRow>,
): TripEntry | null {
  const idx = entry.event_stream.findIndex((e) => e.id === msgId);
  if (idx === -1) return null;
  const prevEvt = entry.event_stream[idx];
  const mergedMeta = mergeTripMessageMetadata(prevEvt.metadata, patch.metadata);
  let nextEvt: TripEvent = {
    ...prevEvt,
    ...patch,
    metadata: mergedMeta,
  };
  if (nextEvt.sender_role === "dispatcher") {
    nextEvt = {
      ...nextEvt,
      delivery_status: resolveOutgoingDeliveryStatus(nextEvt),
    };
  }
  const event_stream = [...entry.event_stream];
  event_stream[idx] = nextEvt;
  return { ...entry, event_stream };
}

/** Stamp party lane rated when ACK/metadata confirms feedback was submitted (Realtime echo). */
function withPartyRatedIfFeedbackAck(
  merged: TripEntry,
  convId: string,
  msgId: string,
  convToParty: Record<string, ConversationPartyType>,
): TripEntry {
  const partyType = convToParty[convId];
  if (!partyType) return merged;
  const evt = merged.event_stream.find((e) => e.id === msgId);
  const md = evt?.metadata as Record<string, unknown> | undefined;
  if (
    !evt ||
    (evt.message_type !== "feedback_request" && evt.message_type !== "feedback") ||
    !md?.submitted_at
  ) {
    return merged;
  }
  const p = merged.parties[partyType];
  if (!p || p.feedbackStatus === "rated") return merged;
  return {
    ...merged,
    parties: {
      ...merged.parties,
      [partyType]: { ...p, feedbackStatus: "rated" },
    },
  };
}

/** Realtime INSERT for feedback_request / feedback — lane-level pending without refetch. */
function applyFeedbackLaneStatusOnIncomingRow(
  entry: TripEntry,
  partyType: ConversationPartyType,
  row: Partial<TripMessageRow>,
): TripEntry {
  const mt = row.message_type;
  if (mt !== "feedback_request" && mt !== "feedback") return entry;
  const party = entry.parties[partyType];
  if (!party) return entry;
  if (party.feedbackStatus === "rated") return entry;
  const m = row.metadata as Record<string, unknown> | undefined;
  if (m?.submitted_at || m?.rating_status === "rated") {
    return {
      ...entry,
      parties: {
        ...entry.parties,
        [partyType]: { ...party, feedbackStatus: "rated" },
      },
    };
  }
  if (party.feedbackStatus === "pending") return entry;
  return {
    ...entry,
    parties: {
      ...entry.parties,
      [partyType]: { ...party, feedbackStatus: "pending" },
    },
  };
}

const CHAT_BOOTSTRAP_TRIP_PAGE = 25;
const CHAT_BOOTSTRAP_TRIP_PAGE_MORE = 20;

const tripHydrationInFlight = new Map<string, Promise<void>>();
const tripThreadPullDebounce = new Map<string, ReturnType<typeof setTimeout>>();
const tripThreadPullInFlight = new Set<string>();
const tripThreadPullNeedsRerun = new Set<string>();
/** Suppress heal refetches after local send (avoids flicker + pool spam). */
const tripLocalSendAt = new Map<string, number>();
const TRIP_LOCAL_SEND_HEAL_SUPPRESS_MS = 15_000;
/** Hard cap concurrent windowed history pulls across all conversations. */
let tripThreadPullGlobalInFlight = 0;
const TRIP_THREAD_PULL_GLOBAL_MAX = 2;

export function noteLocalTripSend(conversationId: string): void {
  const id = (conversationId ?? "").trim();
  if (!id) return;
  tripLocalSendAt.set(id, Date.now());
}

export function isTripLocalSendHealSuppressed(conversationId: string): boolean {
  const at = tripLocalSendAt.get(conversationId);
  if (at == null) return false;
  if (Date.now() - at > TRIP_LOCAL_SEND_HEAL_SUPPRESS_MS) {
    tripLocalSendAt.delete(conversationId);
    return false;
  }
  return true;
}

/** Newest created_at in event_stream for this conversation lane (ms). */
function latestStreamAtForConversation(
  entry: TripEntry,
  convId: string,
  opts?: { includeOptimistic?: boolean },
): number {
  const includeOptimistic = opts?.includeOptimistic !== false;
  let max = 0;
  for (const e of entry.event_stream) {
    if (String(e.conversation_id ?? "") !== convId) continue;
    if (!includeOptimistic && String(e.id).startsWith("optimistic-")) continue;
    const t = Date.parse(String(e.created_at ?? ""));
    if (Number.isFinite(t) && t > max) max = t;
  }
  return max;
}

function streamHasDenormPreview(
  entry: TripEntry,
  convId: string,
  denormPreview: string | null | undefined,
): boolean {
  const want = (denormPreview ?? "").trim();
  if (!want) return false;
  for (let i = entry.event_stream.length - 1; i >= 0; i -= 1) {
    const e = entry.event_stream[i];
    if (String(e.conversation_id ?? "") !== convId) continue;
    const text = (previewText(e) ?? String(e.content ?? "")).trim();
    if (text === want || text.startsWith(want) || want.startsWith(text)) return true;
    // Only inspect the newest lane row for preview match.
    return false;
  }
  return false;
}

function tripThreadLooksStale(
  entry: TripEntry,
  convId: string,
  denormAt: string | null | undefined,
  denormPreview?: string | null,
): boolean {
  if (!denormAt) return false;
  const denormMs = Date.parse(denormAt);
  if (!Number.isFinite(denormMs)) return false;
  // Include optimistic — otherwise own-send triggers a heal refetch mid-flight
  // (denorm UPDATE lands before replaceOptimistic) and the thread flickers.
  const streamMs = latestStreamAtForConversation(entry, convId, {
    includeOptimistic: true,
  });
  if (denormMs <= streamMs + 1_500) return false;
  if (streamHasDenormPreview(entry, convId, denormPreview)) return false;
  return true;
}

function allPartyHistoryWindowsLoaded(entry: TripEntry): boolean {
  const order: ConversationPartyType[] = ["client", "supplier", "driver"];
  for (const pt of order) {
    const p = entry.parties[pt];
    if (!p?.conversationId) continue;
    if (p.historyWindowLoaded !== true) return false;
  }
  return true;
}

function mergeHistoryRowsIntoTripEntry(
  orgId: string,
  entry: TripEntry,
  partyType: ConversationPartyType,
  history: TripMessageRow[],
): TripEntry {
  const partyBefore = entry.parties[partyType];
  if (!partyBefore?.conversationId) return entry;

  const sortedHistory =
    history.length > 1
      ? [...history].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )
      : history;
  const financeSafe = sortedHistory.filter(
    (m) =>
      !isLedgerLikeMessageType(String(m.message_type ?? "")) ||
      ledgerEventInvolvesOrg(m, orgId),
  );
  const newEvts: TripEvent[] = financeSafe.map((m) => ({ ...m, partyType }));
  const event_stream = mergeEvents(entry.event_stream, newEvts);
  const parties: TripEntry["parties"] = {
    ...entry.parties,
    [partyType]: { ...partyBefore, historyWindowLoaded: true },
  };
  let next: TripEntry = {
    ...entry,
    event_stream,
    parties,
    skipEventStreamHydration: allPartyHistoryWindowsLoaded({ ...entry, parties, event_stream })
      ? false
      : (entry.skipEventStreamHydration ?? true),
  };
  next.totalUnread = sumHubVisibleUnread(next);
  if (event_stream.length > 0) {
    const last = event_stream[event_stream.length - 1];
    next.lastEventAt = last.created_at;
    next.lastEventPreview = previewText(last) ?? next.lastEventPreview;
  }
  next = withLongHaulFieldsFromStream(next);
  return withPartnerOrganizationStamp(next, orgId);
}

function clearEventStreamLazySkipIfFilled(e: TripEntry): TripEntry {
  if (!allPartyHistoryWindowsLoaded(e)) return e;
  return { ...e, skipEventStreamHydration: false };
}

function ingestBootstrapConversations(
  orgId: string,
  conversations: TripConversation[],
  base: {
    trips: Record<string, TripEntry>;
    convToTrip: Record<string, string>;
    convToParty: Record<string, ConversationPartyType>;
  },
  ingestOpts?: { summariesOnly?: boolean },
): {
  trips: Record<string, TripEntry>;
  convToTrip: Record<string, string>;
  convToParty: Record<string, ConversationPartyType>;
} {
  const trips: Record<string, TripEntry> = { ...base.trips };
  const convToTrip = { ...base.convToTrip };
  const convToParty = { ...base.convToParty };

  const summariesOnly = ingestOpts?.summariesOnly ?? true;
  const shouldMergeEvents = !summariesOnly;

  for (const conv of conversations) {
    const { trip_id: tripId, party_type: partyType } = conv;
    if (!tripId || !partyType) continue;

    if (!trips[tripId]) trips[tripId] = entryFromConv(conv);
    const entry = trips[tripId];
    if (conv.indent_id != null && String(conv.indent_id).trim() !== "") {
      entry.indentId = String(conv.indent_id);
    }
    if (
      conv.indent_creator_organization_name != null &&
      String(conv.indent_creator_organization_name).trim() !== ""
    ) {
      entry.indentCreatorOrganizationName = String(conv.indent_creator_organization_name);
    }
    if (
      conv.trip_organization_name != null &&
      String(conv.trip_organization_name).trim() !== ""
    ) {
      entry.tripOrganizationName = String(conv.trip_organization_name);
    }
    if (conv.trip_source != null && String(conv.trip_source).trim() !== "") {
      entry.tripSource = String(conv.trip_source);
    }
    entry.chatFlow = resolveChatFlow({
      conversation_type: conv.conversation_type,
      indent_id:         entry.indentId ?? conv.indent_id,
    });

    const history: TripMessageRow[] = Array.isArray(conv.messages)
      ? (conv.messages as TripMessageRow[])
      : [];
    const sortedHistory =
      history.length > 1
        ? [...history].sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          )
        : history;
    const financeSafe = sortedHistory.filter(
      (m) =>
        !isLedgerLikeMessageType(String(m.message_type ?? "")) ||
        ledgerEventInvolvesOrg(m, orgId),
    );
    const newEvts: TripEvent[] = financeSafe.map((m) => ({ ...m, partyType }));

    entry.parties[partyType] = {
      ...partyFromConv(conv),
      historyWindowLoaded: shouldMergeEvents,
    };
    const at = conv.last_message_at;
    if (
      at &&
      (!entry.lastEventAt ||
        new Date(String(at)).getTime() > new Date(String(entry.lastEventAt)).getTime())
    ) {
      entry.lastEventAt = at;
      entry.lastEventPreview = conv.last_message_preview ?? entry.lastEventPreview;
    }

    if (shouldMergeEvents) {
      entry.event_stream = mergeEvents(entry.event_stream, newEvts);
      entry.skipEventStreamHydration = false;
    } else {
      entry.skipEventStreamHydration = true;
    }

    if (conv.trip_status) entry.status = conv.trip_status;
    if (conv.trip_driver_id) entry.driverId = conv.trip_driver_id;
    if (conv.trip_supplier_id) entry.supplierId = conv.trip_supplier_id;
    if (
      conv.trip_organization_id != null &&
      String(conv.trip_organization_id).trim() !== ""
    ) {
      entry.tripOrganizationId = String(conv.trip_organization_id);
    }

    convToTrip[conv.id]  = tripId;
    convToParty[conv.id] = partyType;
  }

  for (const entry of Object.values(trips)) {
    entry.totalUnread = sumHubVisibleUnread(entry);

    if (entry.event_stream.length > 0) {
      const last             = entry.event_stream[entry.event_stream.length - 1];
      entry.lastEventAt      = last.created_at;
      entry.lastEventPreview = previewText(last) ?? entry.lastEventPreview;
    }
    const lh = recomputeLongHaulTripFieldsFromStream(entry.event_stream);
    entry.trackingStatus = lh.trackingStatus;
    entry.longHaulRevisedEta = lh.longHaulRevisedEta;
    entry.longHaulHealthStatus = lh.longHaulHealthStatus;
  }

  for (const tid of Object.keys(trips)) {
    trips[tid] = withPartnerOrganizationStamp(trips[tid], orgId);
  }

  return { trips, convToTrip, convToParty };
}

function cloneTripMessageMetadataForRevert(
  meta: TripMessageRow["metadata"],
): TripMessageRow["metadata"] {
  if (meta == null) return meta;
  try {
    return JSON.parse(JSON.stringify(meta)) as TripMessageRow["metadata"];
  } catch {
    return meta;
  }
}

/** Resolve a `feedback_request` row in the merged stream (for atomic smiley submit). */
function findTripFeedbackMessageInStore(
  trips: Record<string, TripEntry>,
  convToTrip: Record<string, string>,
  messageId: string,
): {
  convId: string;
  tripId: string;
  row: TripMessageRow;
  ratingOrganizationId: string;
} | null {
  for (const entry of Object.values(trips)) {
    const ev = entry.event_stream.find((e) => e.id === messageId);
    if (!ev) continue;
    const convId = ev.conversation_id;
    if (!convId || convToTrip[convId] !== entry.tripId) continue;
    const mt = String(ev.message_type ?? "");
    if (mt !== "feedback_request" && mt !== "feedback") continue;
    const ratingOrganizationId =
      (entry.tripOrganizationId ?? "").trim() ||
      (typeof ev.organization_id === "string" ? ev.organization_id.trim() : "") ||
      "";
    return {
      convId,
      tripId: entry.tripId,
      row: ev as TripMessageRow,
      ratingOrganizationId,
    };
  }
  return null;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => ({

    // ── Initial state ─────────────────────────────────────────────────────────

    trips:           {},
    convToTrip:      {},
    convToParty:     {},
    activeParties:   {},
    bootstrappedOrg: null,
    isLoading:       false,
    chatLanes:       null,
    chatBootstrapHasMoreTrips: false,
    chatBootstrapNextTripOffset: 0,
    isAppendingBootstrap: false,
    hubHistoryBootstrapDone: false,

    // ── bootstrap ─────────────────────────────────────────────────────────────
    // Once per org-session from TripChatContext. May seed summaries from disk, then
    // reconciles via `get_multi_lane_bootstrap` (summaries-only bodies when DB supports it).
    // Open-thread hydration loads message windows via `hydrateTripMessagesIfNeeded`.

    bootstrap: async (orgId) => {
      if (get().bootstrappedOrg === orgId) return;
      if (chatBootstrapInFlightFor === orgId) return;
      if (isSupabaseCircuitOpen()) return;

      // Set the in-flight guard synchronously, before the first `await`, so a
      // second caller (e.g. the tab-touch preloader in preloadChatWarmup.ts racing
      // TripChatContext's own mount-triggered bootstrap) can't slip past the guard
      // above while this call is still suspended on getSession() — that race fired
      // a duplicate get_multi_lane_bootstrap for the same org during the 2026-09-16
      // DB incident, when getSession() latency widened the window.
      chatBootstrapInFlightFor = orgId;

      // Abort if there is no valid session — the RPC requires auth and will 42501
      // on anon. This happens during the brief window between SIGNED_OUT and
      // SIGNED_IN when React context still holds the previous orgId/selfUid.
      const { data: { session } } = await supabase().auth.getSession();
      if (!session) {
        chatBootstrapInFlightFor = null;
        return;
      }

      let seededFromDisk = false;

      const networkPromise = fetchChatBootstrapPayload(orgId, {
        tripLimit: CHAT_BOOTSTRAP_TRIP_PAGE,
        tripOffset: 0,
        hubTripBucket: "active",
      });

      try {
        const cached = await loadChatBootstrapSummaries(orgId);
        if (cached?.length) {
          const ingested = ingestBootstrapConversations(
            orgId,
            cached,
            { trips: {}, convToTrip: {}, convToParty: {} },
            { summariesOnly: true },
          );
          set({
            trips: ingested.trips,
            convToTrip: ingested.convToTrip,
            convToParty: ingested.convToParty,
            activeParties: get().activeParties,
            isLoading: false,
            chatLanes: null,
          });
          seededFromDisk = true;
        }
      } catch {
        /* ignore */
      }

      if (!seededFromDisk) set({ isLoading: true });

      try {
        const { conversations, lanes, hasMoreTrips } = await networkPromise;

        const base = seededFromDisk
          ? {
              trips: get().trips,
              convToTrip: get().convToTrip,
              convToParty: get().convToParty,
            }
          : { trips: {}, convToTrip: {}, convToParty: {} };

        const { trips, convToTrip, convToParty } = ingestBootstrapConversations(
          orgId,
          conversations,
          base,
          { summariesOnly: true },
        );

        void persistChatBootstrapSummaries(orgId, conversations);

        set((s) => ({
          trips,
          convToTrip,
          convToParty,
          activeParties: s.activeParties,
          bootstrappedOrg: orgId,
          isLoading: false,
          chatLanes: lanes,
          chatBootstrapHasMoreTrips: hasMoreTrips,
          chatBootstrapNextTripOffset: CHAT_BOOTSTRAP_TRIP_PAGE,
          isAppendingBootstrap: false,
          hubHistoryBootstrapDone: false,
        }));
      } catch (err) {
        if (__DEV__) console.error('[useChatStore] bootstrap failed:', err);
        const code =
          typeof err === "object" && err !== null && "code" in err
            ? (err as { code?: unknown }).code
            : undefined;
        // 42501 = permission denied (no session); PGRST301 = JWT expired.
        // Don't mark bootstrapped — a valid session may arrive shortly and must
        // be able to retry. For network/other errors mark done to unblock the spinner.
        if (code === '42501' || code === 'PGRST301') {
          set({ isLoading: false });
        } else {
          set({ bootstrappedOrg: orgId, isLoading: false });
        }
      } finally {
        chatBootstrapInFlightFor = null;
      }
    },

    appendBootstrapTripPage: async (orgId) => {
      if (get().bootstrappedOrg !== orgId) return;
      if (!get().chatBootstrapHasMoreTrips) return;
      if (get().isAppendingBootstrap) return;
      set({ isAppendingBootstrap: true });
      try {
        const off = get().chatBootstrapNextTripOffset;
        const { conversations, lanes, hasMoreTrips } = await fetchChatBootstrapPayload(orgId, {
          tripLimit: CHAT_BOOTSTRAP_TRIP_PAGE_MORE,
          tripOffset: off,
          hubTripBucket: "active",
        });
        const { trips, convToTrip, convToParty } = ingestBootstrapConversations(orgId, conversations, {
          trips:       get().trips,
          convToTrip:  get().convToTrip,
          convToParty: get().convToParty,
        }, { summariesOnly: true });
        const mergedLanes = mergeChatLanes(get().chatLanes, lanes);
        set({
          trips,
          convToTrip,
          convToParty,
          chatLanes: mergedLanes,
          chatBootstrapHasMoreTrips: hasMoreTrips,
          chatBootstrapNextTripOffset: off + CHAT_BOOTSTRAP_TRIP_PAGE_MORE,
          isAppendingBootstrap: false,
        });
      } catch (err) {
        if (__DEV__) console.error("[useChatStore] appendBootstrapTripPage failed:", err);
        set({ isAppendingBootstrap: false });
      }
    },

    ensureHubHistoryBootstrap: async (orgId) => {
      if (get().bootstrappedOrg !== orgId) return;
      if (get().hubHistoryBootstrapDone) return;
      if (hubHistoryBootstrapInFlightFor === orgId) return;
      hubHistoryBootstrapInFlightFor = orgId;
      try {
        const { conversations, lanes } = await fetchChatBootstrapPayload(orgId, {
          tripLimit: 40,
          tripOffset: 0,
          hubTripBucket: "history",
        });
        const { trips, convToTrip, convToParty } = ingestBootstrapConversations(orgId, conversations, {
          trips:       get().trips,
          convToTrip:  get().convToTrip,
          convToParty: get().convToParty,
        }, { summariesOnly: true });
        const mergedLanes = mergeChatLanes(get().chatLanes, lanes);
        set({
          trips,
          convToTrip,
          convToParty,
          chatLanes: mergedLanes,
          hubHistoryBootstrapDone: true,
        });
      } catch (err) {
        if (__DEV__) console.error("[useChatStore] ensureHubHistoryBootstrap failed:", err);
        set({ hubHistoryBootstrapDone: true });
      } finally {
        hubHistoryBootstrapInFlightFor = null;
      }
    },

    hydrateTripMessagesIfNeeded: async (tripId, opts) => {
      const orgId = get().bootstrappedOrg;
      if (!orgId || !tripId) return;

      const existing = tripHydrationInFlight.get(tripId);
      if (existing) {
        await existing;
        return;
      }

      const entry0 = get().trips[tripId];
      if (!entry0) return;
      // Never short-circuit on `event_stream.length > 0` alone: lazy trips can have a partial
      // stream (e.g. one Realtime row) before `fetchConversationHistory` runs.
      if (entry0.skipEventStreamHydration !== true) return;

      const targetConvId = (opts?.conversationId ?? "").trim();

      const work = (async () => {
        try {
          let next = entry0;
          const partyOrder: ConversationPartyType[] = ["client", "supplier", "driver"];

          const resolvePartyForConv = (): ConversationPartyType | null => {
            if (!targetConvId) return null;
            for (const pt of partyOrder) {
              if (next.parties[pt]?.conversationId === targetConvId) return pt;
            }
            return null;
          };

          const singlePt = resolvePartyForConv();
          const partiesToHydrate: ConversationPartyType[] = singlePt
            ? [singlePt]
            : partyOrder;

          for (const pt of partiesToHydrate) {
            const p = next.parties[pt];
            if (!p?.conversationId) continue;
            if (p.historyWindowLoaded) continue;
            const rows = await fetchConversationHistory(p.conversationId, {
              partyType: pt,
            });
            next = mergeHistoryRowsIntoTripEntry(orgId, next, pt, rows);
          }
          set((s) => ({
            trips: { ...s.trips, [tripId]: next },
          }));
        } catch (err) {
          if (__DEV__) console.error("[useChatStore] hydrateTripMessagesIfNeeded failed:", err);
        } finally {
          tripHydrationInFlight.delete(tripId);
        }
      })();
      tripHydrationInFlight.set(tripId, work);
      await work;
    },

    // ── processIncomingEvent (idempotent Realtime / bootstrap overlap) ───────
    // Same logical INSERT from multiple tabs → single `event_stream` row; updates
    // merge metadata + trip fields without duplicate bubbles.

    processIncomingEvent: (row, mode, opts) => {
      if (!row.conversation_id || !row.id) return;
      if (__DEV__) console.log(`[CHAT:REALTIME] processIncomingEvent id=${row.id} conv=${row.conversation_id} sender=${row.sender_user_id} mode=${mode}`);
      if (!consumeActionIdDedupe(row)) return;
      if (!consumeRealtimeInsertDedupe(row)) { if (__DEV__) console.log(`[CHAT:REALTIME] dedupe-dropped id=${row.id}`); return; }
      const { trips, convToTrip, convToParty } = get();

      const tripId    = convToTrip[row.conversation_id];
      const partyType = convToParty[row.conversation_id];
      if (!tripId || !partyType) return;

      const entry = trips[tripId];
      if (!entry) return;

      if (isLedgerLikeMessageType(String(row.message_type ?? ""))) {
        const viewerOrg =
          get().bootstrappedOrg ??
          (typeof row.organization_id === "string" ? row.organization_id : null);
        if (!ledgerEventInvolvesOrg(row, viewerOrg)) return;
      }

      const baseRow = row as TripMessageRow;
      const event: TripEvent = {
        ...baseRow,
        partyType,
        delivery_status:
          baseRow.sender_role === "dispatcher"
            ? resolveOutgoingDeliveryStatus(baseRow)
            : baseRow.delivery_status,
      };
      let updated: TripEntry = { ...entry };

      // Second status-broadcast for same trip status (e.g. trigger + driver echo): merge trip only.
      if (shouldSkipDuplicateStatusBroadcast(entry.event_stream, event)) {
        const silentPatch = resolveTripEntryPatchesFromMessage(row, entry);
        const merged = clearEventStreamLazySkipIfFilled(
          withLongHaulFieldsFromStream({
            ...entry,
            ...(silentPatch ?? {}),
          } as TripEntry),
        );
        set({ trips: { ...trips, [tripId]: merged } });
        syncLocationLogToGlobalActiveTrips(tripId, row);
        return;
      }

      // Hub list / non-open thread: apply trip patches + sidebar preview without merging into `event_stream`.
      if (opts?.hubListOnly) {
        updated = applyHubInboundUnread(updated, partyType, row);
        const hubStatusPatch = resolveTripEntryPatchesFromMessage(row, entry);
        if (hubStatusPatch) {
          updated = { ...updated, ...hubStatusPatch };
        }
        if (
          row.message_type === "image" ||
          row.message_type === "document_share" ||
          row.message_type === "document_upload"
        ) {
          updated.event_stream     = upsertEventIntoStream(entry.event_stream, event);
          updated.lastEventAt      = event.created_at ?? updated.lastEventAt;
          updated.lastEventPreview = previewText(row)  ?? updated.lastEventPreview;
          syncLocationLogToGlobalActiveTrips(tripId, row);
          useGlobalSyncStore.getState().touchActiveTripClientActivity(
            tripId,
            typeof event.created_at === "string" ? event.created_at : undefined,
          );
          useGlobalSyncStore.getState().ingestTripMessageForOperationsIsland(
            tripId,
            baseRow as unknown as Record<string, unknown>,
          );
          useGlobalSyncStore.getState().ingestB2BMessageForBell(baseRow);
          set({
            trips: {
              ...trips,
              [tripId]: clearEventStreamLazySkipIfFilled(withLongHaulFieldsFromStream(updated)),
            },
          });
          return;
        }

        updated = applyActiveMessageTypeMultiplex(
          row,
          entry,
          updated,
          true,
          event.created_at,
        );
        updated = applyFeedbackLaneStatusOnIncomingRow(updated, partyType, row);
        updated.event_stream     = upsertEventIntoStream(entry.event_stream, event);
        updated.lastEventAt      = event.created_at ?? updated.lastEventAt;
        updated.lastEventPreview = previewText(row)  ?? updated.lastEventPreview;
        updated = withLongHaulFieldsFromStream(updated);
        updated = clearEventStreamLazySkipIfFilled(updated);
        syncLocationLogToGlobalActiveTrips(tripId, row);
        useGlobalSyncStore.getState().touchActiveTripClientActivity(
          tripId,
          typeof event.created_at === "string" ? event.created_at : undefined,
        );
        useGlobalSyncStore.getState().ingestTripMessageForOperationsIsland(
          tripId,
          baseRow as unknown as Record<string, unknown>,
        );
        useGlobalSyncStore.getState().ingestB2BMessageForBell(baseRow);
        set({ trips: { ...trips, [tripId]: updated } });
        return;
      }

      const isMediaInbound =
        row.message_type === "image" ||
        row.message_type === "document_share" ||
        row.message_type === "document_upload";
      const isOpenThread =
        String(row.conversation_id ?? "") ===
        String(getActiveTripMessageConversationId() ?? "");

      // Open thread always merges into event_stream (text + media), even if the
      // chat shell is briefly backgrounded — otherwise sidebar denorm updates
      // while bubbles stay stale.
      const shouldPatchEventStream = mode === "active" || isOpenThread;

      if (shouldPatchEventStream) {
        const prevIds = new Set(entry.event_stream.map((e) => e.id));
        updated.event_stream = upsertEventIntoStream(entry.event_stream, event);
        const isNewId = !prevIds.has(event.id);

        if (isMediaInbound) {
          updated.lastEventAt      = event.created_at ?? entry.lastEventAt;
          updated.lastEventPreview = previewText(row)  ?? entry.lastEventPreview;
          syncLocationLogToGlobalActiveTrips(tripId, row);
          useGlobalSyncStore.getState().touchActiveTripClientActivity(
            tripId,
            typeof event.created_at === "string" ? event.created_at : undefined,
          );
          useGlobalSyncStore.getState().ingestTripMessageForOperationsIsland(
            tripId,
            baseRow as unknown as Record<string, unknown>,
          );
          useGlobalSyncStore.getState().ingestB2BMessageForBell(baseRow);
          set({
            trips: {
              ...trips,
              [tripId]: clearEventStreamLazySkipIfFilled(withLongHaulFieldsFromStream(updated)),
            },
          });
          return;
        }

        if (mode === "active") {
          updated = applyActiveMessageTypeMultiplex(
            row,
            entry,
            updated,
            isNewId,
            event.created_at,
          );
          updated = applyFeedbackLaneStatusOnIncomingRow(updated, partyType, row);
        }
      } else {
        const party = entry.parties[partyType];
        if (party && inboundMessageCountsAsHubUnread(row)) {
          updated.parties = {
            ...entry.parties,
            [partyType]: { ...party, unreadCount: party.unreadCount + 1 },
          };
          updated.totalUnread = sumHubVisibleUnread({
            ...entry,
            parties: updated.parties,
          });
        }
      }

      updated.lastEventAt      = event.created_at ?? entry.lastEventAt;
      updated.lastEventPreview = previewText(row)  ?? entry.lastEventPreview;

      updated = withLongHaulFieldsFromStream(updated);
      updated = clearEventStreamLazySkipIfFilled(updated);

      syncLocationLogToGlobalActiveTrips(tripId, row);
      useGlobalSyncStore.getState().touchActiveTripClientActivity(
        tripId,
        typeof event.created_at === "string" ? event.created_at : undefined,
      );
      useGlobalSyncStore.getState().ingestTripMessageForOperationsIsland(
        tripId,
        baseRow as unknown as Record<string, unknown>,
      );
      useGlobalSyncStore.getState().ingestB2BMessageForBell(baseRow);
      set({ trips: { ...trips, [tripId]: updated } });
    },

    onRealtimeInsert: (row, mode) => {
      get().processIncomingEvent(row, mode);
    },

    // ── onRealtimeAck ─────────────────────────────────────────────────────────
    // Patches is_delivered / is_read ticks on an existing event.

    onRealtimeAck: (convId, msgId, patch) => {
      if (!consumeRealtimeAckDedupe(msgId, patch)) return;
      const { trips, convToTrip, convToParty } = get();
      const tripId = convToTrip[convId];
      if (!tripId) return;
      const entry = trips[tripId];
      if (!entry) return;
      let merged = applyAckToTripEntry(entry, msgId, patch);
      if (!merged) return;
      merged = withPartyRatedIfFeedbackAck(merged, convId, msgId, convToParty);
      set({ trips: { ...trips, [tripId]: merged } });
    },

    onRealtimeAckBatch: (items) => {
      if (items.length === 0) return;
      const { trips, convToTrip, convToParty } = get();
      let nextTrips: Record<string, TripEntry> | null = null;

      for (const { convId, msgId, patch } of items) {
        if (!consumeRealtimeAckDedupe(msgId, patch)) continue;
        const tripId = convToTrip[convId];
        if (!tripId) continue;
        const base = nextTrips?.[tripId] ?? trips[tripId];
        if (!base) continue;
        let merged = applyAckToTripEntry(base, msgId, patch);
        if (!merged) continue;
        merged = withPartyRatedIfFeedbackAck(merged, convId, msgId, convToParty);
        if (!nextTrips) nextTrips = { ...trips };
        nextTrips[tripId] = merged;
      }

      if (nextTrips) set({ trips: nextTrips });
    },

    // ── applySystemUpdate ─────────────────────────────────────────────────────
    // External metadata patch (SYSTEM_UPDATE Realtime events, changeTripStatus).

    applySystemUpdate: (tripId, patch) => {
      const { trips } = get();
      const entry = trips[tripId];
      if (!entry) return;
      set({ trips: { ...trips, [tripId]: { ...entry, ...patch } } });
    },

    // ── switchParty ───────────────────────────────────────────────────────────

    switchParty: (tripId, partyType) => {
      const { activeParties } = get();
      if (activeParties[tripId] === partyType) return;
      set({ activeParties: { ...activeParties, [tripId]: partyType } });
    },

    // ── markRead ──────────────────────────────────────────────────────────────
    // Zeros the unread badge for a party lane and mirrors the server-side bulk
    // mark_conversation_read onto event_stream (is_read=true for inbound rows).
    // Without the event_stream patch, useMarkSeen's viewability check still sees
    // is_read=false on these rows (only patchReadReceiptsOptimistic touched that
    // field before), so scrolling the thread right after open re-fires
    // mark_messages_seen for messages mark_conversation_read already covered —
    // two RPCs doing the same job for the same rows. No DB call here either way.

    markRead: (convId) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId    = convToTrip[convId];
      const partyType = convToParty[convId];
      if (!tripId || !partyType) return;

      const entry = trips[tripId];
      const party = entry?.parties[partyType];
      if (!party || party.unreadCount === 0) return;

      const updatedParty = { ...party, unreadCount: 0 };
      const updatedParties = { ...entry.parties, [partyType]: updatedParty };
      const readAt = new Date().toISOString();
      const event_stream = entry.event_stream.map((e) => {
        if (e.conversation_id !== convId) return e;
        if (e.sender_role === "dispatcher") return e;
        if (e.is_read) return e;
        return { ...e, is_read: true, read_at: e.read_at ?? readAt };
      });
      set({
        trips: {
          ...trips,
          [tripId]: {
            ...entry,
            parties:     updatedParties,
            event_stream,
            totalUnread: sumHubVisibleUnread({ ...entry, parties: updatedParties }),
          },
        },
      });
    },

    // ── patchMessage (seen ticks from useMarkSeen) ────────────────────────────

    patchMessage: (convId, msgId, patch) => {
      get().onRealtimeAck(convId, msgId, patch);
    },

    patchReadReceiptsOptimistic: (convId, messageIds) => {
      if (messageIds.length === 0) return;
      const { trips, convToTrip } = get();
      const tripId = convToTrip[convId];
      if (!tripId) return;
      const entry = trips[tripId];
      if (!entry) return;

      const readAt = new Date().toISOString();
      const mark: Partial<TripMessageRow> = { is_read: true, read_at: readAt };
      const idSet = new Set(messageIds);
      let changed = false;
      const event_stream = entry.event_stream.map((e) => {
        if (!idSet.has(e.id)) return e;
        changed = true;
        const merged: TripEvent = { ...e, ...mark };
        if (merged.sender_role === "dispatcher") {
          merged.delivery_status = resolveOutgoingDeliveryStatus(merged);
        }
        return merged;
      });
      if (!changed) return;
      set({ trips: { ...trips, [tripId]: { ...entry, event_stream } } });
    },

    // ── submitFeedback (optimistic — caller also fires the RPC) ──────────────

    submitFeedback: (convId, msgId, patch) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId = convToTrip[convId];
      if (!tripId || !convToParty[convId]) return;
      const entry = trips[tripId];
      if (!entry) return;
      const prevEvt = entry.event_stream.find((e) => e.id === msgId);
      const mergedMeta = mergeTripMessageMetadata(prevEvt?.metadata, {
        ...(typeof patch.metadata === "object" && patch.metadata != null
          ? (patch.metadata as object)
          : {}),
        rating_status: "rated",
      } as TripMessageMetadata);
      let merged = applyAckToTripEntry(entry, msgId, { ...patch, metadata: mergedMeta });
      if (!merged) return;
      merged = withPartyRatedIfFeedbackAck(merged, convId, msgId, convToParty);
      set({ trips: { ...trips, [tripId]: merged } });
    },

    submitTripFeedback: (convId, msgId, rating) => {
      const { trips, convToTrip } = get();
      const tripId = convToTrip[convId];
      if (!tripId) return;
      const entry = trips[tripId];
      if (!entry) return;
      const row = entry.event_stream.find((e) => e.id === msgId);
      if (!row) return;
      const meta = parseFeedbackRequestMetadata(row);
      if (!meta) return;
      const score = Math.min(5, Math.max(1, Math.floor(rating)));
      const now = new Date().toISOString();
      const optimistic: FeedbackRequestMetadata = {
        ...meta,
        submitted_at:    now,
        submitted_score: score,
        rating:          score,
        submitted_tags:  [],
      };
      get().submitFeedback(convId, msgId, { metadata: optimistic });
    },

    submitSmileyFeedback: async (messageId, rating, opts) => {
      const { trips, convToTrip } = get();
      const found = findTripFeedbackMessageInStore(trips, convToTrip, messageId);
      if (!found) return { error: "Message not found" };
      const { convId, tripId, row, ratingOrganizationId } = found;
      const preMeta = parseFeedbackRequestMetadata(row);
      if (!preMeta) return { error: "Invalid feedback message" };
      if (isFeedbackRequestAlreadyRatedMeta(preMeta)) return { error: null };
      const prevMetaSnapshot = cloneTripMessageMetadataForRevert(row.metadata);

      const score = Math.min(5, Math.max(1, Math.floor(rating)));
      const commentTrimmed = (opts?.comment ?? "").trim();
      get().submitTripFeedback(convId, messageId, score);

      const messageForRpc: TripMessageRow = {
        ...row,
        conversation_id: convId,
      };

      const revertPartyFeedbackPending = () => {
        get().patchMessage(convId, messageId, { metadata: prevMetaSnapshot });
        set((s) => {
          const tid = s.convToTrip[convId];
          const pt = s.convToParty[convId];
          if (!tid || !pt) return s;
          const ent = s.trips[tid];
          const party = ent?.parties[pt];
          if (!ent || !party) return s;
          return {
            trips: {
              ...s.trips,
              [tid]: {
                ...ent,
                parties: {
                  ...ent.parties,
                  [pt]: { ...party, feedbackStatus: "pending" },
                },
              },
            },
          };
        });
      };

      const applyConfirmTripResult = (submittedAt: string | null) => {
        const confirmed: FeedbackRequestMetadata = {
          ...preMeta,
          submitted_at:    submittedAt ?? new Date().toISOString(),
          submitted_score: score,
          rating:          score,
          submitted_tags:  [],
        };
        get().submitFeedback(convId, messageId, { metadata: confirmed });
      };

      const runConfirmTripFeedback = async (): Promise<{ error: string | null }> => {
        const { error: rpcErr, submittedAt } = await submitTripChatFeedback({
          ratingOrganizationId,
          tripId,
          message: messageForRpc,
          score,
          tags: [],
        });
        if (rpcErr) {
          const msg = rpcErr.message;
          if (/already_submitted|feedback already submitted/i.test(msg)) {
            return { error: null };
          }
          revertPartyFeedbackPending();
          return { error: msg };
        }
        applyConfirmTripResult(submittedAt);
        return { error: null };
      };

      const atomicRpcLikelyMissing = (msg: string) =>
        /submit_atomic_feedback|function .* does not exist|could not find function|42883/i.test(msg);

      try {
        if (commentTrimmed) {
          const orgId =
            ratingOrganizationId.trim() ||
            (get().bootstrappedOrg ?? "").trim();
          if (!orgId) {
            revertPartyFeedbackPending();
            return { error: "Missing organization context for debrief comment." };
          }
          try {
            const r = await submitAtomicFeedback({
              organizationId: orgId,
              tripId,
              message: messageForRpc,
              score,
              tags: [],
              comment: commentTrimmed,
            });
            if (r.alreadySubmitted) {
              applyConfirmTripResult(r.submittedAt);
              return { error: null };
            }
            const confirmed: FeedbackRequestMetadata = {
              ...preMeta,
              submitted_at:    r.submittedAt,
              submitted_score: r.submittedScore,
              rating:          r.submittedScore,
              submitted_tags:  r.submittedTags,
            };
            get().submitFeedback(convId, messageId, { metadata: confirmed });
            return { error: null };
          } catch (atomicErr) {
            const amsg =
              atomicErr instanceof Error ? atomicErr.message : String(atomicErr);
            if (atomicRpcLikelyMissing(amsg)) {
              return runConfirmTripFeedback();
            }
            revertPartyFeedbackPending();
            return { error: amsg };
          }
        }

        return runConfirmTripFeedback();
      } catch (e) {
        revertPartyFeedbackPending();
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },

    applyLedgerBookOptimistic: (convId, transactionId) => {
      const tid = transactionId.trim();
      if (!tid) return;
      const { trips, convToTrip } = get();
      const tripId = convToTrip[convId];
      if (!tripId) return;
      const entry = trips[tripId];
      if (!entry?.event_stream.length) return;
      const ackAt = new Date().toISOString();
      let changed = false;
      const event_stream = entry.event_stream.map((e) => {
        if (e.conversation_id !== convId) return e;
        if (!isLedgerLikeMessageType(String(e.message_type ?? ""))) return e;
        const m = e.metadata as LedgerEventMetadata | undefined;
        if (m?.transaction_id !== tid) return e;
        changed = true;
        const mergedMeta = mergeTripMessageMetadata(m, {
          is_booked: true,
          acknowledged_at: ackAt,
        } as TripMessageMetadata);
        return { ...e, metadata: mergedMeta };
      });
      if (!changed) return;
      set({ trips: { ...trips, [tripId]: { ...entry, event_stream } } });
    },

    revertLedgerBookOptimistic: (convId, transactionId) => {
      const tid = transactionId.trim();
      if (!tid) return;
      const { trips, convToTrip } = get();
      const tripId = convToTrip[convId];
      if (!tripId) return;
      const entry = trips[tripId];
      if (!entry?.event_stream.length) return;
      let changed = false;
      const event_stream = entry.event_stream.map((e) => {
        if (e.conversation_id !== convId) return e;
        if (!isLedgerLikeMessageType(String(e.message_type ?? ""))) return e;
        const m = e.metadata as LedgerEventMetadata | undefined;
        if (m?.transaction_id !== tid) return e;
        changed = true;
        const mergedMeta = mergeTripMessageMetadata(m, {
          is_booked: false,
          acknowledged_at: null,
        } as TripMessageMetadata);
        return { ...e, metadata: mergedMeta };
      });
      if (!changed) return;
      set({ trips: { ...trips, [tripId]: { ...entry, event_stream } } });
    },

    // ── mergeConversationHistory ──────────────────────────────────────────────

    mergeConversationHistory: (convId, messages) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId    = convToTrip[convId];
      const partyType = convToParty[convId];
      if (!tripId || !partyType) {
        if (__DEV__ && messages.length > 0) {
          console.warn("[mergeConversationHistory] missing conv map — merge skipped", {
            convId,
            hasTripId: Boolean(tripId),
            hasPartyType: Boolean(partyType),
          });
        }
        return false;
      }
      const entry = trips[tripId];
      if (!entry) return false;
      const viewerOrg =
        get().bootstrappedOrg ?? entry.parties[partyType]?.organizationId ?? "";
      const newEvts: TripEvent[] = messages
        .filter(
          (m) =>
            !isLedgerLikeMessageType(String(m.message_type ?? "")) ||
            ledgerEventInvolvesOrg(m, viewerOrg),
        )
        .map((m) => ({ ...m, partyType }));
      const party = entry.parties[partyType];
      const parties =
        party && messages.length > 0
          ? { ...entry.parties, [partyType]: { ...party, historyWindowLoaded: true } }
          : entry.parties;
      const MAX_EVENT_STREAM_SIZE = 500;
      const rawStream = mergeEvents(entry.event_stream, newEvts);
      const cappedStream =
        rawStream.length > MAX_EVENT_STREAM_SIZE
          ? rawStream.slice(-MAX_EVENT_STREAM_SIZE)
          : rawStream;

      let lastEventAt = entry.lastEventAt;
      let lastEventPreview = entry.lastEventPreview;
      for (let i = cappedStream.length - 1; i >= 0; i -= 1) {
        const e = cappedStream[i];
        if (String(e.conversation_id ?? "") !== convId) continue;
        lastEventAt = e.created_at ?? lastEventAt;
        lastEventPreview = previewText(e) ?? lastEventPreview;
        break;
      }

      const merged = clearEventStreamLazySkipIfFilled(
        withLongHaulFieldsFromStream({
          ...entry,
          parties,
          event_stream: cappedStream,
          lastEventAt,
          lastEventPreview,
        }),
      );
      set({
        trips: {
          ...trips,
          [tripId]: merged,
        },
      });
      return true;
    },

    // ── Optimistic send ───────────────────────────────────────────────────────

    appendMessage: (convId, msg) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId    = convToTrip[convId];
      const partyType = convToParty[convId];
      if (!tripId || !partyType) return;

      const entry = trips[tripId];
      if (!entry) return;

      if (isLedgerLikeMessageType(String(msg.message_type ?? ""))) {
        const viewerOrg =
          get().bootstrappedOrg ?? entry.parties[partyType]?.organizationId ?? "";
        if (!ledgerEventInvolvesOrg(msg, viewerOrg)) return;
      }

      let row: TripMessageRow = { ...msg };
      if (row.sender_role === "dispatcher") {
        row = {
          ...row,
          delivery_status:
            row.delivery_status ??
            (String(row.id).startsWith("optimistic-") ? "sending" : resolveOutgoingDeliveryStatus(row)),
        };
      }
      // Stable list key for optimistic rows.
      if (String(row.id).startsWith("optimistic-") && !row.client_key) {
        row = { ...row, client_key: row.id };
      }

      const event: TripEvent = { ...row, partyType };
      const event_stream = upsertEventIntoStream(entry.event_stream, event);
      const merged = clearEventStreamLazySkipIfFilled(
        withLongHaulFieldsFromStream({
          ...entry,
          event_stream,
          lastEventAt:      msg.created_at,
          lastEventPreview: previewText(msg) ?? entry.lastEventPreview,
        }),
      );
      set({
        trips: {
          ...trips,
          [tripId]: merged,
        },
      });
      syncLocationLogToGlobalActiveTrips(tripId, msg);
      useGlobalSyncStore.getState().touchActiveTripClientActivity(
        tripId,
        typeof msg.created_at === "string" ? msg.created_at : undefined,
      );
      useGlobalSyncStore.getState().ingestTripMessageForOperationsIsland(
        tripId,
        msg as unknown as Record<string, unknown>,
      );
    },

    optimisticInsert: (convId, msg) => {
      if (__DEV__) console.log(`[CHAT:SEND] optimisticInsert conv=${convId} id=${msg.id} content="${String(msg.content ?? "").slice(0, 40)}"`);
      get().appendMessage(convId, msg);
    },

    replaceOptimistic: (convId, tempId, persisted) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId    = convToTrip[convId];
      const partyType = convToParty[convId];
      if (!tripId || !partyType) return;

      const entry = trips[tripId];
      if (!entry) return;

      const persistedRow: TripMessageRow =
        persisted.sender_role === "dispatcher"
          ? {
              ...persisted,
              delivery_status: resolveOutgoingDeliveryStatus(persisted),
            }
          : persisted;

      if (__DEV__) console.log(`[CHAT:SEND] replaceOptimistic conv=${convId} tempId=${tempId} realId=${persisted.id}`);

      const idx = entry.event_stream.findIndex((e) => e.id === tempId);
      let nextStream: TripEvent[];
      if (idx >= 0) {
        // In-place swap: keep index + client_key + local created_at so FlatList
        // does not remount or reorder (no flicker).
        const prev = entry.event_stream[idx]!;
        const next = entry.event_stream.slice();
        next[idx] = {
          ...persistedRow,
          partyType,
          client_key: prev.client_key ?? tempId,
          created_at: prev.created_at,
        };
        nextStream = next;
      } else {
        nextStream = upsertEventIntoStream(entry.event_stream, {
          ...persistedRow,
          partyType,
          client_key: tempId,
        });
      }
      set({
        trips: {
          ...trips,
          [tripId]: withLongHaulFieldsFromStream({
            ...entry,
            event_stream: nextStream,
            lastEventAt:      persistedRow.created_at ?? entry.lastEventAt,
            lastEventPreview: previewText(persistedRow) ?? entry.lastEventPreview,
          }),
        },
      });
      syncLocationLogToGlobalActiveTrips(tripId, persistedRow);
      useGlobalSyncStore.getState().ingestTripMessageForOperationsIsland(
        tripId,
        persistedRow as unknown as Record<string, unknown>,
      );
    },

    removeMessage: (convId, msgId) => {
      if (__DEV__) console.warn(`[CHAT:SEND] removeMessage conv=${convId} id=${msgId} — RPC failed or returned no data`);
      const { trips, convToTrip } = get();
      const tripId = convToTrip[convId];
      if (!tripId) return;
      const entry = trips[tripId];
      if (!entry) return;
      set({
        trips: {
          ...trips,
          [tripId]: withLongHaulFieldsFromStream({
            ...entry,
            event_stream: entry.event_stream.filter((e) => e.id !== msgId),
          }),
        },
      });
    },

    patchTripConversationFromRealtime: (raw) => {
      const convId = typeof raw.id === "string" ? raw.id : null;
      const tripId = typeof raw.trip_id === "string" ? raw.trip_id : null;
      const partyRaw = typeof raw.party_type === "string" ? raw.party_type : "";
      if (
        !convId ||
        !tripId ||
        (partyRaw !== "client" && partyRaw !== "supplier" && partyRaw !== "driver")
      ) {
        return;
      }
      const partyType = partyRaw as ConversationPartyType;
      const { trips, convToTrip, convToParty } = get();
      const mappedTrip = convToTrip[convId];
      if (mappedTrip && mappedTrip !== tripId) return;
      const entry = trips[tripId];
      if (!entry) return;
      const party = entry.parties[partyType];
      if (!party || party.conversationId !== convId) return;

      const unreadCount =
        typeof raw.unread_dispatcher_count === "number"
          ? raw.unread_dispatcher_count
          : party.unreadCount;

      const nextParty: PartyConv = { ...party, unreadCount };
      const parties: TripEntry["parties"] = {
        ...entry.parties,
        [partyType]: nextParty,
      };

      let next: TripEntry = {
        ...entry,
        parties,
        totalUnread: sumHubVisibleUnread({ ...entry, parties }),
      };

      const lmAt =
        raw.last_message_at != null && String(raw.last_message_at).trim() !== ""
          ? String(raw.last_message_at)
          : null;
      const lmPrev =
        raw.last_message_preview != null && String(raw.last_message_preview).trim() !== ""
          ? String(raw.last_message_preview)
          : null;

      if (
        lmAt &&
        (!next.lastEventAt || new Date(lmAt).getTime() > new Date(String(next.lastEventAt)).getTime())
      ) {
        next.lastEventAt = lmAt;
      }
      if (lmPrev) {
        next.lastEventPreview = lmPrev;
      }

      const viewerOrg = get().bootstrappedOrg ?? entry.tripOrganizationId ?? null;
      next = withPartnerOrganizationStamp(next, viewerOrg);

      set({
        trips: { ...trips, [tripId]: next },
        convToTrip: { ...convToTrip, [convId]: tripId },
        convToParty: { ...convToParty, [convId]: partyType },
      });

      // Sidebar denorm can land without a trip_messages INSERT. Heal only
      // non-open threads — the open lane gets INSERT realtime (no history RPC).
      const activeCid = getActiveTripMessageConversationId();
      if (activeCid && activeCid === convId) return;
      if (isTripLocalSendHealSuppressed(convId)) return;
      if (
        tripThreadLooksStale(
          next,
          convId,
          lmAt ?? next.lastEventAt,
          lmPrev ?? next.lastEventPreview,
        )
      ) {
        get().syncTripThreadIfStale(convId);
      }
    },

    syncTripThreadIfStale: (convId, opts) => {
      const id = (convId ?? "").trim();
      if (!id) return;
      const force = opts?.force === true;
      // Own send / open-thread INSERT path — never heal-refetch.
      if (isTripLocalSendHealSuppressed(id)) return;
      const activeCid = getActiveTripMessageConversationId();
      if (!force && activeCid && activeCid === id) return;
      const { trips, convToTrip } = get();
      const tripId = convToTrip[id];
      const entry = tripId ? trips[tripId] : null;
      if (!entry) return;
      if (!force && !tripThreadLooksStale(entry, id, entry.lastEventAt, entry.lastEventPreview)) {
        return;
      }

      const existingTimer = tripThreadPullDebounce.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      tripThreadPullDebounce.set(
        id,
        setTimeout(() => {
          tripThreadPullDebounce.delete(id);
          if (isTripLocalSendHealSuppressed(id)) return;
          const liveActive = getActiveTripMessageConversationId();
          if (liveActive && liveActive === id) return;
          if (tripThreadPullInFlight.has(id)) {
            tripThreadPullNeedsRerun.add(id);
            return;
          }
          if (tripThreadPullGlobalInFlight >= TRIP_THREAD_PULL_GLOBAL_MAX) {
            tripThreadPullNeedsRerun.add(id);
            return;
          }
          tripThreadPullInFlight.add(id);
          tripThreadPullGlobalInFlight += 1;
          const partyType = get().convToParty[id];
          void fetchConversationHistory(id, {
            partyType: partyType ?? null,
          })
            .then((rows) => {
              if (rows.length > 0) {
                get().mergeConversationHistory(id, rows);
              }
            })
            .catch(() => {
              // non-critical — denorm preview already updated
            })
            .finally(() => {
              tripThreadPullInFlight.delete(id);
              tripThreadPullGlobalInFlight = Math.max(0, tripThreadPullGlobalInFlight - 1);
              if (tripThreadPullNeedsRerun.has(id)) {
                tripThreadPullNeedsRerun.delete(id);
                if (
                  !isTripLocalSendHealSuppressed(id) &&
                  getActiveTripMessageConversationId() !== id
                ) {
                  get().syncTripThreadIfStale(id);
                }
              }
            });
        }, 280),
      );
    },

    // ── upsertConversation ────────────────────────────────────────────────────
    // Used by queue-and-fetch recovery and initiateConversation.

    upsertConversation: (conv) => {
      const { trips, convToTrip, convToParty } = get();
      const { trip_id: tripId, party_type: partyType } = conv;

      const viewerOrg = get().bootstrappedOrg ?? conv.organization_id;
      const newEvts: TripEvent[] = conv.messages
        .filter(
          (m) =>
            !isLedgerLikeMessageType(String(m.message_type ?? "")) ||
            ledgerEventInvolvesOrg(m, viewerOrg),
        )
        .map((m) => ({ ...m, partyType }));
      const existing = trips[tripId];
      let entry: TripEntry = existing
        ? { ...existing }
        : entryFromConv(conv);

      entry.parties = {
        ...entry.parties,
        [partyType]: {
          ...partyFromConv(conv),
          historyWindowLoaded: Array.isArray(conv.messages) && conv.messages.length > 0,
        },
      };
      entry.event_stream = mergeEvents(entry.event_stream, newEvts);

      if (conv.trip_status)      entry.status     = conv.trip_status;
      if (conv.trip_driver_id)   entry.driverId   = conv.trip_driver_id;
      if (conv.trip_supplier_id) entry.supplierId = conv.trip_supplier_id;
      if (conv.trip_organization_id != null &&
        String(conv.trip_organization_id).trim() !== ""
      ) {
        entry.tripOrganizationId = String(conv.trip_organization_id);
      }
      if (conv.indent_id != null && String(conv.indent_id).trim() !== "") {
        entry.indentId = String(conv.indent_id);
      }
      if (conv.trip_source != null && String(conv.trip_source).trim() !== "") {
        entry.tripSource = String(conv.trip_source);
      }
      entry.chatFlow = resolveChatFlow({
        conversation_type: conv.conversation_type,
        indent_id:         entry.indentId ?? conv.indent_id,
      });

      entry.totalUnread = sumHubVisibleUnread(entry);

      const last = entry.event_stream[entry.event_stream.length - 1];
      if (last) {
        entry.lastEventAt      = last.created_at;
        entry.lastEventPreview = previewText(last) ?? entry.lastEventPreview;
      }

      let finalized = withLongHaulFieldsFromStream(entry);
      finalized = withPartnerOrganizationStamp(finalized, viewerOrg);

      set({
        trips:       { ...trips,       [tripId]:  finalized      },
        convToTrip:  { ...convToTrip,  [conv.id]: tripId     },
        convToParty: { ...convToParty, [conv.id]: partyType  },
      });
    },

    // ── clear (logout / org switch) ───────────────────────────────────────────

    clear: () => {
      lastRealtimeInsertAt.clear();
      lastRealtimeAckAt.clear();
      lastActionIdAt.clear();
      clearReadReceiptDebouncers();
      hubHistoryBootstrapInFlightFor = null;
      void clearChatBootstrapSummaries();
      set({
        trips:           {},
        convToTrip:      {},
        convToParty:     {},
        activeParties:   {},
        bootstrappedOrg: null,
        isLoading:       false,
        chatLanes:       null,
        chatBootstrapHasMoreTrips: false,
        chatBootstrapNextTripOffset: 0,
        isAppendingBootstrap: false,
        hubHistoryBootstrapDone: false,
      });
    },

    // ── Derived helpers ───────────────────────────────────────────────────────

    getActiveParty: (tripId) => get().activeParties[tripId],

    getConversationId: (tripId, partyType) =>
      get().trips[tripId]?.parties[partyType]?.conversationId ?? null,

    /** Reconstruct a TripConversation from the store (backward compat shim). */
    getConversationByConvId: (convId) => {
      const { trips, convToTrip, convToParty } = get();
      const tripId    = convToTrip[convId];
      const partyType = convToParty[convId];
      if (!tripId || !partyType) return null;
      const entry = trips[tripId];
      if (!entry) return null;
      const party = entry.parties[partyType];
      if (!party) return null;
      return convFromEntry(entry, partyType, party);
    },

    /** Sorted for sidebar display: unread-first, then most-recent-event first. */
    getSortedTripEntries: () =>
      Object.values(get().trips).sort((a, b) => {
        const au = a.totalUnread > 0 ? 0 : 1;
        const bu = b.totalUnread > 0 ? 0 : 1;
        if (au !== bu) return au - bu;
        // Date.parse avoids allocating Date objects on every comparison.
        const ta = a.lastEventAt ? Date.parse(a.lastEventAt) : 0;
        const tb = b.lastEventAt ? Date.parse(b.lastEventAt) : 0;
        return tb - ta;
      }),
  })),
);

// ── Selector: TripMeta from TripEntry (backward compat) ──────────────────────

export function tripEntryToMeta(
  entry: TripEntry,
  opts?: {
    viewerOrgId?:         string | null;
    partyType?:           ConversationPartyType | null;
    laneConversationId?: string | null;
  } | null,
): TripMeta {
  const viewerOrgId = opts?.viewerOrgId?.trim() || null;
  const payment_balance =
    viewerOrgId != null
      ? computeLaneLedgerBalance(
          entry.event_stream,
          viewerOrgId,
          opts?.partyType ?? null,
          opts?.laneConversationId ?? null,
        )
      : null;
  return {
    trip_id:          entry.tripId,
    trip_number:      entry.tripNumber,
    display_trip_id:  entry.displayTripId,
    trip_status:      entry.status,
    pickup_area:      entry.pickupArea,
    drop_location:    entry.dropLocation,
    trip_driver_id:   entry.driverId,
    trip_supplier_id: entry.supplierId,
    trip_created_at:  entry.createdAt,
    last_lat:         entry.lastLat,
    last_lng:         entry.lastLng,
    last_location_at: entry.lastLocationAt,
    last_eta_minutes: entry.lastEtaMinutes,
    last_eta_label:   entry.lastEtaLabel,
    last_location_label: entry.lastLocationLabel ?? null,
    payment_balance,
  };
}
