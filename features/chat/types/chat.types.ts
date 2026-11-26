export type ConversationPartyType = "client" | "supplier" | "driver";

/** B2B integrated indent+trip (3-party) vs employer–driver private trip chat. */
export type ChatTripFlow = "integrated_group" | "private_trip";
export type MessageSenderRole = "dispatcher" | "client" | "supplier" | "driver" | "system";

/** WhatsApp-style local delivery / read state (outgoing bubbles + optimistic sends). */
export type MessageDeliveryStatus = "sending" | "sent" | "delivered" | "read";
export type MessageType =
  | "text"
  | "chat"           // alias for text — standard dispatcher/party message bubble
  | "update"
  | "question"
  | "challenge"
  | "system"
  | "system_log"     // alias for system — operational log (e.g. "Vehicle Assigned")
  | "ledger_event"
  | "ledger"         // alias for ledger_event — from submit_business_event
  | "payment"        // alias for ledger_event — from execute_b2b_update / external callers
  /** Payload-only balance patch (trigger / Edge Function); same memory rules as ledger_event. */
  | "ledger_update"
  /** Driver / vehicle assignment snapshot in event_payload (no extra trip fetch). */
  | "assignment_update"
  /** Document attached to trip thread; same visibility as document_share. */
  | "document_upload"
  | "document_share"
  | "feedback_request"
  | "feedback"       // alias for feedback_request
  | "image"          // inline image (storage path in metadata.storage_path)
  | "status_change"  // trip lifecycle event (metadata: StatusChangeMetadata)
  | "tracking"       // live location/ETA push (metadata: TrackingMetadata)
  /** Driver long-haul checkpoint written to trip_messages (operational lane only). */
  | "location_log";

// ── Ledger event metadata ─────────────────────────────────────────────────────

export interface LedgerEventMetadata {
  /** Privacy shield: ledger UI only for these party lanes (never driver). */
  visible_to?: ("client" | "supplier")[];
  transaction_id: string;
  amount: number;
  flow: "in" | "out";
  category: string;
  payment_mode: string;
  reference_number?: string | null;
  notes?: string | null;
  sender_org_id: string;
  sender_org_name: string;
  receiver_org_id: string;
  receiver_org_name: string;
  /** Set when the org books this row via confirm_to_accounting_books (or optimistic UI). */
  is_booked?: boolean;
  acknowledged_at?: string | null;
  disputed?: boolean;
}

// ── Document share metadata ───────────────────────────────────────────────────

export interface DocumentShareMetadata {
  document_type: string;
  storage_path: string;
  document_name: string;
  /** From trip_documents.mime_type — improves image preview when file_name has no extension. */
  mime_type?: string | null;
  entity_type: "trip" | "vehicle" | "driver";
  entity_id: string;
}

// ── Status-change event metadata ─────────────────────────────────────────────

/** Emitted by change_trip_status_with_notification RPC (`message_type = status_change`). */
export interface StatusChangeMetadata {
  event_type:       'status_change';
  previous_status:  string;
  new_status:       string;
  changed_by?:      string | null;
  changed_by_name?: string | null;
  changed_at:       string;
}

// ── Image message metadata ────────────────────────────────────────────────────

/** Sent when a dispatcher shares an image directly (`message_type = image`). */
export interface ImageMessageMetadata {
  storage_path:   string;
  mime_type?:     string | null;
  original_name?: string | null;
  size_bytes?:    number | null;
}

// ── Tracking / live-location event ───────────────────────────────────────────

/**
 * Emitted by the driver app via submit_business_event when a location push is
 * requested (`message_type = 'tracking'`).  The store extracts lat/lng/eta and
 * writes them into TripMeta so the dispatcher sees live ETA without a DB fetch.
 */
export interface TrackingMetadata {
  lat:           number;
  lng:           number;
  accuracy?:     number | null;
  heading?:      number | null;
  speed_kmh?:    number | null;
  eta_minutes?:  number | null;
  eta_label?:    string | null;
  address_hint?: string | null;
}

// ── B2B event metadata (process_b2b_event) ───────────────────────────────────

/**
 * Full trip state embedded in every message produced by process_b2b_event.
 * The frontend extracts this and writes it into TripMeta — no follow-up fetch.
 */
export interface B2BTripState {
  id:                     string;
  trip_number:            string;
  display_trip_id:        string | null;
  status:                 string;
  driver_id:              string | null;
  vehicle_id:             string | null;
  supplier_id:            string | null;
  client_id:              string | null;
  driver_display_name:    string | null;
  vehicle_display_number: string | null;
  pickup_area:            string;
  drop_location:          string;
  pickup_date:            string | null;
  payment_status:         string | null;
  updated_at:             string;
}

/** Message metadata shape produced by process_b2b_event. */
export interface B2BEventMetadata {
  event_type:       string;
  previous_status:  string;
  new_status:       string;
  changed_by?:      string | null;
  changed_by_name?: string | null;
  changed_at:       string;
  trip_state:       B2BTripState;
  [key: string]:    unknown;
}

// ── Message visibility (tab routing) ─────────────────────────────────────────

/**
 * Per-message-type visibility rules.
 * Keys present = restricted to listed party types.
 * Keys absent  = visible in all tabs (client, supplier, driver).
 *
 * Rules:
 *   ledger / ledger_event  → financial tabs only (client, supplier); each row is
 *                            still filtered to its own conversation_id in the store
 *   feedback_request       → financial tabs only (client, supplier)
 *   tracking               → driver tab (dispatcher can see via driver conv)
 *   everything else        → unrestricted
 */
export const MESSAGE_VISIBILITY: Partial<Record<MessageType, ConversationPartyType[]>> = {
  ledger_event:     ['client', 'supplier'],
  ledger:           ['client', 'supplier'],
  payment:          ['client', 'supplier'],
  ledger_update:    ['client', 'supplier'],
  feedback_request: ['client', 'supplier'],
  feedback:         ['client', 'supplier'],
  document_upload:  ['client', 'supplier', 'driver'],
  assignment_update: ['client', 'supplier', 'driver'],
};

/**
 * Returns true if a message of the given type should be rendered in the
 * given party tab.  Used by renderMessage as a pure memory filter —
 * zero DB calls when switching between Driver / Client / Supplier tabs.
 */
export function isMessageVisibleInTab(
  messageType: MessageType,
  partyType:   ConversationPartyType,
): boolean {
  const allowed = MESSAGE_VISIBILITY[messageType];
  if (!allowed) return true;
  return allowed.includes(partyType);
}

// ── Feedback request ──────────────────────────────────────────────────────────

/** In-chat debrief card after trip completion (`message_type = feedback_request`). */
export interface FeedbackRequestMetadata {
  feedback_version?: number;
  rated_party_type: "client" | "supplier" | "driver";
  rated_id: string;
  rated_display_name?: string;
  /**
   * Optional stamp from DB trigger / backfill — if set (1–5), treat as already rated at bootstrap.
   */
  rating?: number;
  /** Set after successful submit (merged into row). */
  submitted_at?: string;
  submitted_score?: number;
  submitted_tags?: string[];
  /** Optimistic: hide rating prompt immediately after submit. */
  rating_status?: "rated";
}

export type TripMessageMetadata =
  | B2BEventMetadata
  | LedgerEventMetadata
  | DocumentShareMetadata
  | FeedbackRequestMetadata
  | StatusChangeMetadata
  | ImageMessageMetadata
  | TrackingMetadata
  | Record<string, unknown>
  | null;

// ── Store-level trip metadata snapshot ───────────────────────────────────────

/**
 * Lightweight trip metadata kept in chatStore.tripMetaMap.
 * Updated in-place by SYSTEM_UPDATE Realtime events and the optimistic
 * changeTripStatus handler — no DB re-fetch required.
 */
export interface TripMeta {
  trip_id:          string;
  trip_number:      string;
  display_trip_id:  string | null;
  trip_status:      string | null;
  pickup_area:      string;
  drop_location:    string;
  trip_driver_id:   string | null;
  trip_supplier_id: string | null;
  trip_created_at:  string | null;
  /** Live location — injected in-memory from 'tracking' messages; no DB fetch. */
  last_lat?:         number | null;
  last_lng?:         number | null;
  last_location_at?: string | null;
  last_eta_minutes?: number | null;
  last_eta_label?:   string | null;
  /** From `system_log` `event_payload.location_data.address_name` (cycle / heartbeat). */
  last_location_label?: string | null;
  /** Running payment balance accumulated from ledger_event messages. No DB fetch. */
  payment_balance?:  number | null;
}

// ── Realtime event discriminated union ───────────────────────────────────────

/**
 * All Realtime events that the chat store can receive.
 * TripChatContext classifies raw Supabase payloads into one of these types
 * and calls chatStore.dispatch(event).
 *
 * NEW_MESSAGE   — trip_messages INSERT (text, image, system, status_change, …)
 * SYSTEM_UPDATE — trip metadata changed without a new message (e.g. external trip edit)
 * ACK_UPDATE    — trip_messages UPDATE: is_delivered / is_read tick changed
 */
export type ChatRealtimeEvent =
  | { type: 'NEW_MESSAGE';   row: Partial<TripMessageRow>; mode: 'active' | 'background' }
  | { type: 'SYSTEM_UPDATE'; tripId: string; patch: Partial<TripMeta> }
  | { type: 'ACK_UPDATE';    conversationId: string; messageId: string; patch: Partial<TripMessageRow> };

/** Per conversation lane — from `get_initial_chat_state` / unified bootstrap. */
export type TripFeedbackLaneStatus = 'none' | 'pending' | 'rated';

// ── Trip conversation ─────────────────────────────────────────────────────────

export interface TripConversationRow {
  /** From unified bootstrap: `integrated_group` if trip has indent; else private employer–driver. */
  conversation_type?: ChatTripFlow;
  id: string;
  organization_id: string;
  /** Trip owner fleet org (`trips.organization_id`); may differ from `organization_id` on mirrored lanes. */
  trip_organization_id?: string | null;
  /** Display name of the trip fleet owner org (organizations.name). Populated by bootstrap. */
  trip_organization_name?: string | null;
  /** Shipper / indent owner org name (same trip_number peer with indent, or this trip's indent). Supplier Client tab. */
  indent_creator_organization_name?: string | null;
  trip_id: string;
  /** From `trips.indent_id` at bootstrap — commercial lane key for ledger isolation. */
  indent_id?: string | null;
  /** From `indents.status` when trip.indent_id is set (unified bootstrap). */
  indent_status?: string | null;
  party_type: ConversationPartyType;
  party_name: string;
  client_id: string | null;
  supplier_id: string | null;
  driver_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_dispatcher_count: number;
  created_at: string;
  updated_at: string;
  /** Bootstrap-only: whether this lane still needs a trip-chat debrief rating. */
  trip_feedback_status?: TripFeedbackLaneStatus;
  /** From `trips.source` when present on bootstrap rows. */
  trip_source?: string | null;
}

export interface TripMessageRow {
  id: string;
  conversation_id: string;
  organization_id: string;
  sender_user_id: string | null;
  sender_role: MessageSenderRole;
  sender_name: string;
  content: string;
  message_type: MessageType;
  metadata?: TripMessageMetadata;
  /** Optional DB column / Realtime field — merged with `metadata.event_payload` for trip patches. */
  event_payload?: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  sender_avatar_seed?: string | null;
  is_delivered?: boolean;
  delivered_at?: string | null;
  /**
   * Client-side delivery lane for ticks (sending → sent → delivered → read).
   * Derived from Realtime ACKs + optimistic send; not required on every row.
   */
  delivery_status?: MessageDeliveryStatus;
  /**
   * Stable FlatList row key across optimistic → persisted id swap (client-only).
   * Prevents remount flicker on send.
   */
  client_key?: string | null;
  /**
   * Party routing tags — conversation IDs (or party_type strings) that should
   * receive this message. Populated by process_b2b_event / get_unified_b2b_bootstrap.
   * Ledger rows: prefer a single originating conversation id (not all fin lanes).
   * Absence means: visible only in the originating conversation's tab (legacy).
   */
  visibility_tags?: string[] | null;
  /** Set when the sender edits the message content after sending. */
  edited_at?: string | null;
  /** Soft-delete: true means the message was retracted by the sender. */
  is_deleted?: boolean;
  /** Emoji reactions: { "👍": ["user-id-1"], "❤️": ["user-id-2"] } */
  reactions?: Record<string, string[]> | null;
  reply_to_id?: string | null;
  reply_to_preview?: Record<string, unknown> | null;
}

export interface TripConversation extends TripConversationRow {
  trip_number: string;
  display_trip_id?: string | null;
  trip_status?: string | null;
  /** From `trips.driver_id` embed — used for hub "UNASSIGNED" when no driver on trip. */
  trip_driver_id?: string | null;
  /** From `trips.supplier_id` embed — aggregate / integrated trips only. */
  trip_supplier_id?: string | null;
  /** From `trips.created_at` embed — trip date for hub / detail chrome. */
  trip_created_at?: string | null;
  /** From `trips.pickup_date` — scheduled trip date. */
  pickup_date?: string | null;
  pickup_area: string;
  drop_location: string;
  messages: TripMessageRow[];
  /**
   * Client-only: who wrote the current inbox preview. Used so the driver
   * inbound toast ignores the driver’s own sends.
   */
  last_message_sender_role?: MessageSenderRole | null;
  /**
   * Driver inbox peer branding (shipper / fleet org). Filled by
   * `getConversationsByDriverIds` — drivers cannot read `organizations` RLS.
   */
  peer_logo_url?: string | null;
  peer_avatar_seed?: string | null;
}

// ── Network (org-to-org) chat ─────────────────────────────────────────────────────

export interface NetworkConversationRow {
  id: string;
  org_a_id: string;
  org_b_id: string;
  org_a_name: string;
  org_b_name: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count_a: number;
  unread_count_b: number;
  created_at: string;
  updated_at: string;
}

export interface NetworkMessageRow {
  id: string;
  conversation_id: string;
  sender_org_id: string;
  sender_user_id: string | null;
  sender_name: string;
  content: string;
  is_read_by_other: boolean;
  read_at: string | null;
  created_at: string;
  /** Extensible payload (e.g. reply_to_story for WhatsApp-style story quotes). */
  metadata?: Record<string, unknown> | null;
}

export interface NetworkConversation extends NetworkConversationRow {
  partner_org_id: string;
  partner_name: string;
  partner_logo_url?: string | null;
  partner_avatar_seed?: string | null;
  unread_count: number;
  messages: NetworkMessageRow[];
}

export interface NetworkPartner {
  org_id: string;
  name: string;
  /** Linked org relationship — client or supplier (network DMs). */
  party_type: "client" | "supplier";
  logo_url?: string | null;
  avatar_seed?: string | null;
}

// ── Shareable document item ───────────────────────────────────────────────────

export interface ShareableDocument {
  key: string;
  label: string;
  storage_path: string;
  entity_type: "vehicle" | "driver";
  entity_id: string;
}
