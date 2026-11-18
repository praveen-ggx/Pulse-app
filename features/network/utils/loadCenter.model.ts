/**
 * Load Center — pure domain model.
 * No React, no hooks. Safe to import from any context.
 */

import Theme from "@/constants/Theme";
import { resolveCommercialPricing } from "@/features/marketplace/domain/commercialPricing";
import { formatINR } from "@/lib/format";

export type LoadSubTab = "GIVE_LOAD" | "GET_LOAD" | "AWARDED";

/**
 * How LoadCenterView paints itself.
 * `standalone` = full Load Center chrome (`/pulse-loads`).
 * `trips` = indent cards only, inside the Trips lifecycle body.
 */
export type LoadCenterPresentation = "standalone" | "trips";

export function loadCenterShowsStandaloneChrome(
  presentation: LoadCenterPresentation | undefined,
): boolean {
  return presentation !== "trips";
}

/** Give Load: card pill when at least one supplier bid exists (still open market). */
export const GIVE_LOAD_RECEIVING_BIDS_STATUS = "receiving bids";

/** @deprecated Use GIVE_LOAD_RECEIVING_BIDS_STATUS — kept for older call sites. */
export const GIVE_LOAD_QUOTE_RECEIVED_STATUS = GIVE_LOAD_RECEIVING_BIDS_STATUS;

export function getLoadCenterStatusTabLabel(
  loadSubTab: LoadSubTab,
  tabId: StatusFilterTab,
  defaultLabel: string,
): string {
  if (loadSubTab === "GIVE_LOAD" && tabId === "OPEN") return "My loads";
  if (loadSubTab === "GIVE_LOAD" && tabId === "QUOTED") return "Receiving Bids";
  if (loadSubTab === "GET_LOAD" && tabId === "OPEN") return "Network Loads";
  if (loadSubTab === "GET_LOAD" && tabId === "QUOTED") return "My Bids";
  if (loadSubTab === "GET_LOAD" && tabId === "AWARDED") return "Bids Won";
  return defaultLabel;
}

export function giveLoadBidReceivedDisplayStatus(
  indentStatus: string,
  bidCount: number,
): string {
  const status = indentStatus.toLowerCase();
  const terminalForQuotePill =
    status === "awarded" || statusMatchesFilter(status, "DONE");
  if (!terminalForQuotePill && bidCount > 0) {
    return GIVE_LOAD_RECEIVING_BIDS_STATUS;
  }
  if (status === "quoted") {
    // Legacy compatibility only.
    // No new indents enter 'quoted' after migration 20270128103100.
    return GIVE_LOAD_RECEIVING_BIDS_STATUS;
  }
  return status;
}

/**
 * Same DB row, different business situations: "just published, nobody's
 * looked yet" and "actively being competed for" both sit at status='open'
 * (or its legacy siblings) — the difference is purely bid_count, derived
 * here, never written back to the database.
 */
export function giveLoadStatusPillLabel(
  indentStatus: string,
  bidCount: number,
): string {
  const derived = giveLoadBidReceivedDisplayStatus(indentStatus, bidCount);
  if (derived === GIVE_LOAD_RECEIVING_BIDS_STATUS) return "Receiving Bids";
  if (statusMatchesFilter(derived, "OPEN")) return "My loads";
  if (derived === "awarded") return "Awarded";
  if (statusMatchesFilter(derived, "DONE")) return "Completed";
  return derived.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Marketplace lifecycle tabs (product labels).
 * Internal filter ids stay OPEN|QUOTED|AWARDED|DONE for query-key / URL compatibility.
 * Product UI never says "Quoted" — Give Load uses My loads / Receiving Bids;
 * Get Load uses Open Market / My Bids / Bids Won.
 *
 * `status='quoted'` is a deprecated DB value, not an active business state.
 * Legacy compatibility only. No new indents enter 'quoted' after migration
 * 20270128103100 (trigger dropped + backfill). Keep accepting it in OPEN so
 * any residual row still appears as open-for-bidding.
 */
export type StatusFilterTab = "OPEN" | "QUOTED" | "AWARDED" | "DONE";

/** Done tab sub-filters (Find Work / Claimed / Give Load). */
export type DoneSubTab = "REJECTED" | "CONVERTED";

export const DONE_SUB_TABS: { id: DoneSubTab; label: string }[] = [
  { id: "REJECTED", label: "Rejected" },
  { id: "CONVERTED", label: "Converted to trips" },
];

export const STATUS_TABS: {
  id: StatusFilterTab;
  label: string;
  statuses: string[];
}[] = [
  {
    id: "OPEN",
    label: "Network Loads",
    statuses: [
      "open",
      "pending",
      "broadcast",
      "draft",
      // Legacy compatibility only — no new rows after 20270128103100.
      "quoted",
    ],
  },
  {
    id: "QUOTED",
    label: "Receiving Bids",
    // Not a DB status filter. Give Load: bid count > 0. Get Load: my quote exists.
    // Empty on purpose — do not match indent.status === 'quoted' here.
    statuses: [],
  },
  { id: "AWARDED", label: "Awarded", statuses: ["awarded"] },
  {
    id: "DONE",
    label: "Done",
    statuses: ["completed", "cancelled", "closed", "expired"],
  },
];

export function statusMatchesFilter(
  status: string,
  filter: StatusFilterTab,
): boolean {
  const s = status.toLowerCase();
  const tab = STATUS_TABS.find((t) => t.id === filter);
  return tab?.statuses.includes(s) ?? false;
}

/** How a Get Load opportunity reached the viewer. */
export type GetLoadSourceTag = "network" | "market_ad";

/**
 * Get Load / Find Work visibility. Unset target matches createIndent default.
 * `marketplace` and `both` are open-market circulation, not partner-only.
 */
export function isGetLoadMarketCirculation(
  circulationTarget: string | null | undefined,
): boolean {
  const target = (circulationTarget || "integrated_supplier").toLowerCase();
  return (
    target === "integrated_supplier" ||
    target === "both" ||
    target === "marketplace"
  );
}

/**
 * Network = shipper is an integrated client (partner link).
 * Market (through ad) = otherwise — typically Reach/story bid without a client link
 * (see mergeQuotedIndentsForSupplier).
 */
export function resolveGetLoadSourceTag(
  shipperOrganizationId: string | null | undefined,
  connectedClientOrgIds: ReadonlySet<string>,
): GetLoadSourceTag {
  const id = (shipperOrganizationId ?? "").trim();
  if (id && connectedClientOrgIds.has(id)) return "network";
  return "market_ad";
}

function quoteCounterAmountInr(
  existingQuote:
    | { counter_amount?: number | null }
    | null
    | undefined,
): number | null {
  const n = Number(existingQuote?.counter_amount ?? 0);
  return n > 0 ? n : null;
}

/** Mobile GET LOAD Done outcomes — tag + copy for lost / cancelled / declined. */
export type GetLoadDoneOutcomeKind =
  | "converted"
  | "cancelled"
  | "expired"
  | "lost"
  | "declined";

export type GetLoadDoneOutcome = {
  kind: GetLoadDoneOutcomeKind;
  /** Feeds status chip resolver (lowercase). */
  statusLabel: string;
  /** Under party name. */
  channelLabel: string;
  /** Footer / ticket caption. */
  footerLabel: string;
  /** Ticket kicker pill. */
  kicker: string;
  /** False when Rebid / bid actions must stay off. */
  interactive: boolean;
};

/**
 * Classify a Get Load Done card from indent status + our quote.
 * - Declined bid → Rejected
 * - We won (+ trip / completed) → Converted
 * - Awarded elsewhere / closed → Lost
 * - Shipper cancelled → Cancelled
 */
export function resolveGetLoadDoneOutcome(
  load: { status?: string | null },
  existingQuote:
    | {
        status?: string | null;
      }
    | null
    | undefined,
  hasTrip: boolean,
  awardedToMe = false,
): GetLoadDoneOutcome {
  const indentStatus = (load.status || "").trim().toLowerCase();
  const quoteStatus = (existingQuote?.status || "").trim().toLowerCase();
  const wonByMe = awardedToMe || quoteStatus === "accepted";

  if (
    hasTrip ||
    (wonByMe && (indentStatus === "completed" || indentStatus === "closed"))
  ) {
    return {
      kind: "converted",
      statusLabel: "converted",
      channelLabel: "Won · converted to trip",
      footerLabel: "On books",
      kicker: "CONVERTED",
      interactive: false,
    };
  }

  if (indentStatus === "cancelled") {
    return {
      kind: "cancelled",
      statusLabel: "cancelled",
      channelLabel: "Indent cancelled",
      footerLabel: "Indent cancelled",
      kicker: "CANCELLED",
      interactive: false,
    };
  }

  if (indentStatus === "expired") {
    return {
      kind: "expired",
      statusLabel: "expired",
      channelLabel: "Opportunity expired",
      footerLabel: "No longer open",
      kicker: "EXPIRED",
      interactive: false,
    };
  }

  /**
   * Shipper awarded elsewhere / closed the market / completed without our win.
   * Prefer LOST over REJECTED so the card explains allocation, not just quote state.
   */
  if (
    indentStatus === "completed" ||
    indentStatus === "closed" ||
    indentStatus === "awarded"
  ) {
    return {
      kind: "lost",
      statusLabel: "lost",
      channelLabel: "Awarded to another bidder",
      footerLabel: "Allocated to another bidder",
      kicker: "LOST",
      interactive: false,
    };
  }

  if (quoteStatus === "rejected") {
    return {
      kind: "declined",
      statusLabel: "rejected",
      channelLabel: "Bid declined",
      footerLabel: "Quote rejected",
      kicker: "REJECTED",
      interactive: false,
    };
  }

  return {
    kind: "lost",
    statusLabel: "lost",
    channelLabel: "Opportunity closed",
    footerLabel: "No longer open for bids",
    kicker: "LOST",
    interactive: false,
  };
}

/** Mobile GET LOAD card labels — Done tab uses outcome status, not live quote state. */
export function resolveGetLoadMobileCardLabels(
  statusFilterTab: StatusFilterTab,
  _doneSubTab: DoneSubTab,
  load: { id: string; status?: string | null; load_type?: string | null },
  existingQuote:
    | {
        status?: string | null;
        amount?: number | null;
        counter_amount?: number | null;
      }
    | undefined,
  indentIdsWithTrip: ReadonlySet<string>,
  awardedToMe = false,
): { statusLabel: string; rightFooter: string } {
  const quoteStatus = (existingQuote?.status ?? "").toLowerCase();
  const loadTypeDetail = (load.load_type || "—").toUpperCase();
  const hasTrip = indentIdsWithTrip.has(load.id);
  const counterInr = quoteCounterAmountInr(existingQuote);

  if (statusFilterTab === "DONE") {
    const outcome = resolveGetLoadDoneOutcome(
      load,
      existingQuote,
      hasTrip,
      awardedToMe,
    );
    return {
      statusLabel: outcome.statusLabel,
      rightFooter: outcome.footerLabel,
    };
  }

  const isPending = quoteStatus === "pending";
  const isRejected = quoteStatus === "rejected";
  const isAccepted = quoteStatus === "accepted";
  const isCountered = isPending && counterInr != null;
  const statusLabel = isAccepted
    ? "bids won"
    : isRejected
      ? "rejected"
      : isCountered
        ? "countered"
        : isPending
          ? "receiving bids"
          : "open market";
  const rightFooter = isCountered
    ? `Counter ${formatINR(counterInr)}`
    : isPending
      ? `Your bid ${formatINR(Number(existingQuote?.amount ?? 0))}`
      : isAccepted
        ? "Bids won"
        : loadTypeDetail;

  return { statusLabel, rightFooter };
}

/** GET LOAD hub ticket — target rate vs your quote in the card stub. */
export type LoadCenterTicketCommerce = {
  kicker: string;
  amountInr: number | null;
  targetRateInr?: number | null;
  /** Label above the secondary amount (default Target). */
  referenceLabel?: string | null;
  quoteStatus?: string | null;
  /** Shown when there is no numeric hero (bids, load type, done outcome). */
  rightCaption?: string | null;
  /**
   * Winning vendor org name, AWARDED tickets only. Resolved from the
   * assigned supplier org (CRM / org display) with a session fallback
   * from the award modal.
   */
  awardedByName?: string | null;
};

/**
 * Accepted Marketplace bid amount per indent (winning bids only). Used when the
 * supplier has no direct quote row for an indent they were awarded through a
 * Marketplace bid.
 */
export function acceptedMarketBidAmountByIndentId(
  bids: ReadonlyArray<{ indent_id: string; amount: number; status: string }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const bid of bids) {
    if ((bid.status || "").toLowerCase() !== "accepted") continue;
    const amount = Number(bid.amount ?? 0);
    if (Number.isFinite(amount) && amount > 0) out.set(bid.indent_id, amount);
  }
  return out;
}

export function resolveGetLoadTicketCommerce(
  statusFilterTab: StatusFilterTab,
  _doneSubTab: DoneSubTab,
  load: {
    id: string;
    status?: string | null;
    supplier_target?: number | null;
    supplier_rate_basis?: string | null;
    /** indents.weight in KG — expands a per-MT supplier_target. */
    weight?: number | null;
  },
  existingQuote:
    | {
        status?: string | null;
        amount?: number | null;
        counter_amount?: number | null;
      }
    | undefined,
  indentIdsWithTrip: ReadonlySet<string>,
  awardedToMe = false,
  /** Accepted Marketplace bid amount for this indent, when awarded via a market bid. */
  awardedMarketBidInr: number | null = null,
): LoadCenterTicketCommerce {
  // supplier_target may be a ₹/MT unit rate; resolveCommercialPricing turns
  // it into the trip total the card and the bid sheet both need.
  const targetRateInr =
    resolveCommercialPricing({
      supplierTarget: load.supplier_target,
      saleRateBasis: load.supplier_rate_basis,
      weightKg: load.weight,
      bidCount: 0,
    }).displayPrice ?? 0;
  const quoteStatus = (existingQuote?.status ?? "").toLowerCase();
  const quoteAmount = Number(existingQuote?.amount ?? 0);
  const hasQuote = quoteAmount > 0;
  const counterInr = quoteCounterAmountInr(existingQuote);
  const hasTrip = indentIdsWithTrip.has(load.id);

  if (statusFilterTab === "DONE") {
    const outcome = resolveGetLoadDoneOutcome(
      load,
      existingQuote,
      hasTrip,
      awardedToMe,
    );
    return {
      kicker: outcome.kicker,
      amountInr: null,
      rightCaption: outcome.footerLabel,
    };
  }

  // Awarded through a Marketplace bid: there is no direct quote row for the
  // winner, so show the accepted bid amount instead of the target rate.
  if (awardedToMe && awardedMarketBidInr != null && awardedMarketBidInr > 0) {
    return {
      kicker: "BIDS WON",
      amountInr: awardedMarketBidInr,
      rightCaption: "Bids won",
    };
  }

  if (quoteStatus === "pending" && counterInr != null) {
    return {
      kicker: "COUNTER OFFER",
      amountInr: counterInr,
      targetRateInr: hasQuote ? quoteAmount : targetRateInr > 0 ? targetRateInr : null,
      referenceLabel: hasQuote ? "Your bid" : "Target",
      quoteStatus: "countered",
    };
  }

  if (quoteStatus === "pending" && hasQuote) {
    return {
      kicker: "YOUR BID",
      amountInr: quoteAmount,
      targetRateInr: targetRateInr > 0 ? targetRateInr : null,
      referenceLabel: "Target",
      quoteStatus,
    };
  }
  if (quoteStatus === "accepted") {
    return {
      kicker: "BIDS WON",
      amountInr: hasQuote ? quoteAmount : null,
      rightCaption: "Bids won",
      quoteStatus,
    };
  }
  if (quoteStatus === "rejected") {
    return {
      kicker: "TARGET RATE",
      amountInr: targetRateInr > 0 ? targetRateInr : null,
      rightCaption: "Declined",
      quoteStatus,
    };
  }

  return {
    kicker: "TARGET RATE",
    amountInr: targetRateInr > 0 ? targetRateInr : null,
    rightCaption: targetRateInr > 0 ? null : "Open freight",
  };
}

/**
 * GIVE LOAD hub ticket — your own indents.
 *
 * Hero is the awarded amount once a supplier is picked, otherwise the target
 * rate you set. The client rate sits underneath as the reference line so the
 * buy price and the sell price are readable together on the card.
 */
export function resolveGiveLoadTicketCommerce(
  statusFilterTab: StatusFilterTab,
  load: {
    client_price?: number | null;
    supplier_target?: number | null;
    supplier_rate_basis?: string | null;
    /** indents.weight in KG — expands a per-MT supplier_target. */
    weight?: number | null;
  },
  options: {
    isDone: boolean;
    isDraft: boolean;
    awardedAmountInr: number | null;
    isAwarded: boolean;
    bidCount: number;
    loadTypeDetail: string;
    awardedByName?: string | null;
  },
): LoadCenterTicketCommerce {
  const positive = (value: unknown): number | null => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const targetRateInr = positive(
    resolveCommercialPricing({
      supplierTarget: load.supplier_target,
      saleRateBasis: load.supplier_rate_basis,
      weightKg: load.weight,
      bidCount: 0,
    }).displayPrice,
  );
  const clientRateInr = positive(load.client_price);
  const awardedInr = positive(options.awardedAmountInr);

  if (options.isDone || statusFilterTab === "DONE") {
    return {
      kicker: "COMPLETED",
      amountInr: null,
      rightCaption: "On books",
    };
  }

  if (options.isAwarded && awardedInr != null) {
    return {
      kicker: "AWARDED",
      amountInr: awardedInr,
      targetRateInr: clientRateInr,
      referenceLabel: "Client rate",
      awardedByName: options.awardedByName?.trim() || null,
    };
  }

  const bidCaption =
    options.bidCount > 0
      ? `${options.bidCount} bid${options.bidCount === 1 ? "" : "s"}`
      : null;

  if (targetRateInr != null) {
    return {
      kicker: options.isDraft ? "DRAFT TARGET" : "TARGET RATE",
      amountInr: targetRateInr,
      targetRateInr: clientRateInr,
      referenceLabel: "Client rate",
      rightCaption: bidCaption,
    };
  }

  if (clientRateInr != null) {
    return {
      kicker: "CLIENT RATE",
      amountInr: clientRateInr,
      rightCaption: bidCaption,
    };
  }

  return {
    kicker: "TARGET RATE",
    amountInr: null,
    rightCaption: bidCaption ?? options.loadTypeDetail,
  };
}

/** Give Load mobile card status on Done → show completed when a trip exists. */
export function resolveGiveLoadMobileDisplayStatus(
  statusFilterTab: StatusFilterTab,
  indentStatus: string,
  bidCount: number,
  indentIdsWithTrip: ReadonlySet<string>,
  indentId: string,
): string {
  const status = indentStatus.toLowerCase();
  if (statusFilterTab === "DONE") {
    if (indentIdsWithTrip.has(indentId) || status === "completed") {
      return "completed";
    }
    return status;
  }
  return giveLoadBidReceivedDisplayStatus(status, bidCount);
}

/** Hide GET LOAD row state pill when the active status chip already matches (see GET LOAD cards). */
export function shouldHideGetLoadStatePill(
  filter: StatusFilterTab,
  stateLabel: string,
  quoteAccepted: boolean,
): boolean {
  if (filter === "OPEN" && (stateLabel === "OPEN" || stateLabel === "OPEN MARKET"))
    return true;
  if (
    filter === "QUOTED" &&
    (stateLabel === "QUOTED" ||
      stateLabel === "RECEIVING BIDS" ||
      stateLabel === "MY BIDS")
  )
    return true;
  if (filter === "AWARDED" && quoteAccepted) return true;
  return false;
}

/** Status pill colors for Hire Partner cards (Tesla palette, no indigo). */
export function giveLoadStatusPillStyles(status: string): {
  pill: object;
  text: object;
} {
  const s = (status || "").toLowerCase();
  if (s === "awarded") {
    return {
      pill: {
        backgroundColor: Theme.positive,
        borderWidth: 1,
        borderColor: Theme.darkGreen,
      },
      text: { color: Theme.textOnPrimary },
    };
  }
  if (s === "in transit" || s === "in_transit") {
    return {
      pill: {
        backgroundColor: Theme.primary,
        borderWidth: 1,
        borderColor: Theme.primary,
      },
      text: { color: Theme.textOnPrimary },
    };
  }
  if (s === "delivered" || ["completed", "closed", "cancelled", "expired"].includes(s)) {
    return {
      pill: {
        backgroundColor: Theme.surfaceGray,
        borderWidth: 1,
        borderColor: Theme.borderMedium,
      },
      text: { color: Theme.textSecondary },
    };
  }
  // Legacy compatibility only: status='quoted' shares Receiving Bids pill styles.
  // No new indents enter 'quoted' after migration 20270128103100.
  if (
    s === "quoted" ||
    s === GIVE_LOAD_RECEIVING_BIDS_STATUS ||
    s === "receiving bids"
  ) {
    return {
      pill: {
        backgroundColor: Theme.screenBackground,
        borderWidth: 1,
        borderColor: Theme.textPrimaryDark,
      },
      text: { color: Theme.textPrimaryDark },
    };
  }
  return {
    pill: {
      backgroundColor: Theme.tripHubUnassignedPillBg,
      borderWidth: 1,
      borderColor: Theme.textPrimaryDark,
    },
    text: { color: Theme.textPrimaryDark },
  };
}

/** True once the indent has left the pre-trip lifecycle (converted or terminated). */
export function isIndentStageDone(indentStatus: string): boolean {
  return statusMatchesFilter(indentStatus, "DONE");
}

/**
 * Boundary between the INDENT stage and the rest of the trip lifecycle
 * (INDENT → UNASSIGNED → ASSIGNED → ... → DELIVERED — one continuous
 * lifecycle, not a separate flow). An indent sits at the INDENT stage only
 * while it (a) hasn't reached a terminal status and (b) has no trip
 * allocated to it yet. The moment allocation happens it leaves INDENT and
 * is represented by its trip instead, landing on UNASSIGNED (or further
 * along, if the same conversion also carried a driver). Allocation is read
 * from the existing `trips.indent_id` relationship (passed in as
 * `indentIdsWithTrip`, built from whatever trips list the caller already
 * has) — the same relationship `create_trip_from_assigned_indent`
 * establishes; no new status/column/table.
 *
 * Deliberately NOT based on driver assignment — an indent with no driver is
 * not the same thing as a trip with no driver (existing Trip "Unassigned"
 * semantics are untouched and must not be confused with this).
 */
export function isIndentUnallocated(
  indent: { id: string; status: string },
  indentIdsWithTrip: ReadonlySet<string>,
): boolean {
  return !isIndentStageDone(indent.status) && !indentIdsWithTrip.has(indent.id);
}

/**
 * Restricts a list of indents to exactly the given id set. Used so a
 * rendered list can be made to match an externally-derived membership set
 * (e.g. Trips → INDENT's `unallocatedIndents`) instead of re-deriving
 * membership with a second, independently-maintained filter that could
 * drift out of sync with the one powering the count.
 */
export function restrictIndentsToIds<T extends { id: string }>(
  indents: T[],
  ids: ReadonlySet<string>,
): T[] {
  return indents.filter((i) => ids.has(i.id));
}

export function formatIndentCardDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d
      .toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      .toUpperCase();
  } catch {
    return "—";
  }
}
