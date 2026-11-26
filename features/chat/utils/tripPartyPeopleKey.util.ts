import type { TripConversation } from "@/features/chat/types/chat.types";

function normalizePartyLabelKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable people-strip / recommendation key for a trip conversation party. */
export function tripPartyPeopleKey(
  conv: Pick<
    TripConversation,
    "party_type" | "party_name" | "client_id" | "supplier_id" | "driver_id"
  >,
): string {
  const clientId = (conv.client_id ?? "").trim();
  if (conv.party_type === "client" && clientId) return `client:${clientId}`;

  const supplierId = (conv.supplier_id ?? "").trim();
  if (conv.party_type === "supplier" && supplierId) return `supplier:${supplierId}`;

  const driverId = (conv.driver_id ?? "").trim();
  if (conv.party_type === "driver" && driverId) return `driver:${driverId}`;

  const name = normalizePartyLabelKey(conv.party_name);
  return `${conv.party_type}:${name || "unknown"}`;
}

export function conversationDriverId(
  conv: Pick<TripConversation, "driver_id" | "trip_driver_id">,
  composeDriverId?: string | null,
): string {
  return String(
    composeDriverId ?? conv.driver_id ?? conv.trip_driver_id ?? "",
  ).trim();
}

export function conversationMatchesPartyPeopleKey(
  conv: Pick<
    TripConversation,
    "party_type" | "party_name" | "client_id" | "supplier_id" | "driver_id" | "trip_driver_id"
  >,
  partyKey: string | null | undefined,
  opts?: { composeDriverId?: string | null },
): boolean {
  const key = (partyKey ?? "").trim();
  if (!key) return false;
  // ON TRIP strip keys are `driver:<uuid>` — match the assigned driver only.
  if (key.startsWith("driver:")) {
    const driverId = key.slice("driver:".length).trim();
    if (!driverId) return false;
    if (conv.party_type !== "driver") return false;
    return conversationDriverId(conv, opts?.composeDriverId) === driverId;
  }
  return tripPartyPeopleKey(conv) === key;
}

type ComposeDriverLookup =
  | Map<string, string | null | undefined>
  | Record<string, string | null | undefined>
  | undefined;

function lookupComposeDriverId(
  tripId: string,
  lookup: ComposeDriverLookup,
): string | null {
  if (!lookup) return null;
  if (lookup instanceof Map) {
    return String(lookup.get(tripId) ?? "").trim() || null;
  }
  return String(lookup[tripId] ?? "").trim() || null;
}

/**
 * When a people-strip driver is selected, show ONLY that driver's trips.
 * (Previously "recommended + rest" left every other driver visible.)
 */
export function filterConversationsToPartyFocus(
  conversations: TripConversation[],
  partyKey: string | null | undefined,
  options: {
    tripStatus: (conv: TripConversation) => string | null | undefined;
    isTerminal: (status: string | null | undefined) => boolean;
    composeDriverIdByTripId?: ComposeDriverLookup;
  },
): TripConversation[] {
  const compare = (a: TripConversation, b: TripConversation) =>
    tripConversationActivitySort(a, b, options.tripStatus, options.isTerminal);
  const key = (partyKey ?? "").trim();
  if (!key) return [...conversations].sort(compare);

  return conversations
    .filter((conv) =>
      conversationMatchesPartyPeopleKey(conv, key, {
        composeDriverId: lookupComposeDriverId(
          conv.trip_id,
          options.composeDriverIdByTripId,
        ),
      }),
    )
    .sort(compare);
}

/**
 * Active scope: a driver operates one trip at a time.
 * Keep the single most-recent conversation per assigned driver.
 * History should NOT call this — multiple past trips are expected.
 */
export function dedupeActiveConversationsByDriver(
  conversations: TripConversation[],
  composeDriverIdByTripId?: ComposeDriverLookup,
): TripConversation[] {
  const seenDrivers = new Set<string>();
  const out: TripConversation[] = [];
  for (const conv of conversations) {
    const driverId = conversationDriverId(
      conv,
      lookupComposeDriverId(conv.trip_id, composeDriverIdByTripId),
    );
    if (!driverId) {
      out.push(conv);
      continue;
    }
    if (seenDrivers.has(driverId)) continue;
    seenDrivers.add(driverId);
    out.push(conv);
  }
  return out;
}

const tripConversationActivitySort = (
  a: TripConversation,
  b: TripConversation,
  tripStatus: (conv: TripConversation) => string | null | undefined,
  isTerminal: (status: string | null | undefined) => boolean,
): number => {
  const aTerminal = isTerminal(tripStatus(a)) ? 1 : 0;
  const bTerminal = isTerminal(tripStatus(b)) ? 1 : 0;
  if (aTerminal !== bTerminal) return aTerminal - bTerminal;

  const aUnread = (a.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
  const bUnread = (b.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
  if (aUnread !== bUnread) return aUnread - bUnread;

  return (
    new Date(b.last_message_at ?? 0).getTime() -
    new Date(a.last_message_at ?? 0).getTime()
  );
};

export function pickRecommendedTripConversation(
  conversations: TripConversation[],
): TripConversation | null {
  if (conversations.length === 0) return null;
  return [...conversations].sort((a, b) => {
    // Assigned-driver communication wins over client/supplier lanes.
    const aDriver = a.party_type === "driver" ? 0 : 1;
    const bDriver = b.party_type === "driver" ? 0 : 1;
    if (aDriver !== bDriver) return aDriver - bDriver;

    const aUnread = (a.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
    const bUnread = (b.unread_dispatcher_count ?? 0) > 0 ? 0 : 1;
    if (aUnread !== bUnread) return aUnread - bUnread;
    return (
      new Date(b.last_message_at ?? 0).getTime() -
      new Date(a.last_message_at ?? 0).getTime()
    );
  })[0]!;
}

/**
 * Prefer last-opened party, else the assigned driver lane, else activity sort.
 * Trip chat defaults to driver communication when a driver is assigned.
 */
export function pickPreferredTripConversation(
  conversations: TripConversation[],
  opts?: { storedParty?: TripConversation["party_type"] | null },
): TripConversation | null {
  if (conversations.length === 0) return null;
  const stored = opts?.storedParty ?? null;
  if (stored) {
    const hit = conversations.find((c) => c.party_type === stored);
    if (hit) return hit;
  }
  const driverLane = conversations.find((c) => c.party_type === "driver");
  if (driverLane) return driverLane;
  return pickRecommendedTripConversation(conversations);
}

export function partitionTripConversationsByPartyFocus(
  conversations: TripConversation[],
  partyKey: string | null | undefined,
  options: {
    tripStatus: (conv: TripConversation) => string | null | undefined;
    isTerminal: (status: string | null | undefined) => boolean;
    composeDriverIdByTripId?: ComposeDriverLookup;
    /** When true (default), focused party hides other drivers entirely. */
    hideNonMatching?: boolean;
  },
): { recommended: TripConversation[]; rest: TripConversation[] } {
  const compare = (a: TripConversation, b: TripConversation) =>
    tripConversationActivitySort(a, b, options.tripStatus, options.isTerminal);

  const key = (partyKey ?? "").trim();
  if (!key) {
    return { recommended: [], rest: [...conversations].sort(compare) };
  }

  const recommended: TripConversation[] = [];
  const rest: TripConversation[] = [];
  for (const conv of conversations) {
    const matched = conversationMatchesPartyPeopleKey(conv, key, {
      composeDriverId: lookupComposeDriverId(
        conv.trip_id,
        options.composeDriverIdByTripId,
      ),
    });
    if (matched) recommended.push(conv);
    else rest.push(conv);
  }
  recommended.sort(compare);
  if (options.hideNonMatching !== false) {
    return { recommended, rest: [] };
  }
  rest.sort(compare);
  return { recommended, rest };
}

export type MobileTripInboxRow =
  | {
      kind: "party_recommended_header";
      id: string;
      partyName: string;
      count: number;
    }
  | { kind: "party_recommended_divider"; id: string }
  | { kind: "conversation"; id: string; conversation: TripConversation };

export function buildMobileTripInboxRows(
  conversations: TripConversation[],
  partyKey: string | null | undefined,
  partyDisplayName: string | null | undefined,
  options: {
    tripStatus: (conv: TripConversation) => string | null | undefined;
    isTerminal: (status: string | null | undefined) => boolean;
    composeDriverIdByTripId?: ComposeDriverLookup;
  },
): MobileTripInboxRow[] {
  const key = (partyKey ?? "").trim();
  const { recommended, rest } = partitionTripConversationsByPartyFocus(
    conversations,
    partyKey,
    { ...options, hideNonMatching: true },
  );

  // No focus → flat list. Focus with no matches → empty (don't show other drivers).
  if (!key) {
    return rest.map((conversation) => ({
      kind: "conversation" as const,
      id: conversation.id,
      conversation,
    }));
  }

  if (recommended.length === 0) return [];

  const partyName = (partyDisplayName ?? "").trim() || "Driver";
  return [
    {
      kind: "party_recommended_header",
      id: `party-header:${partyKey}`,
      partyName,
      count: recommended.length,
    },
    ...recommended.map((conversation) => ({
      kind: "conversation" as const,
      id: conversation.id,
      conversation,
    })),
  ];
}
