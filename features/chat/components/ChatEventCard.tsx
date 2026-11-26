import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AlertTriangle,
  CheckCircle,
  Truck,
  MapPin,
  Navigation,
  XCircle,
  Clock,
  Send,
  Package,
  Undo2,
} from "lucide-react-native";
import {
  CHAT_ACCENT,
  CHAT_ACCENT_SOFT,
  CHAT_TEXT_MUTED,
  CHAT_TEXT_PRIMARY,
  CHAT_TEXT_SECONDARY,
} from "@/features/chat/chatTheme";
import { CHAT_MOBILE } from "@/features/chat/chatMobileLayout";
import { formatElegantPartyName } from "@/features/chat/utils/partyDisplay";
import Theme from "@/constants/Theme";
import {
  partyInitialsFromName,
} from "@/lib/partyAvatarDisplay";
import type { LedgerEventMetadata, TripMessageRow } from "../types/chat.types";
import { ChatPaymentEventIcon } from "./ChatPaymentEventIcon";
import {
  resolveDriverSwapAvatars,
  resolveSystemUpdateDriverAvatar,
  type DriverSwapPair,
  type SystemUpdateDriverContext,
} from "../utils/chatAvatar.util";
import { ChatPartyAvatar } from "./ChatPartyAvatar";
import { ChatDriverSwapAvatar } from "./shared/ChatDriverSwapAvatar";
import { ChatDriverSwapPreviewCopy } from "./shared/ChatDriverSwapPreviewCopy";
import type { ResolvedPartyAvatarIdentity } from "@/lib/entityIdentity";
import { ledgerEventInvolvesOrg } from "../utils/ledgerVisibility.util";
import {
  getLedgerBookPendingSnapshot,
  subscribeLedgerBookPending,
} from "@/lib/ledgerBookPendingStore";

// ── System event card (trip status changes) ───────────────────────────────────

type StatusIconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const STATUS_ICON_MAP: Record<
  string,
  {
    Icon: StatusIconComponent;
    color: string;
    bg: string;
    /** Short label for meta line (matches payment card middle segment). */
    sheetLabel: string;
    /** Bold right column (payment “amount” slot). */
    rightWord: string;
    rightColor: string;
  }
> = {
  assigned: {
    Icon: Truck,
    color: CHAT_ACCENT,
    bg: CHAT_ACCENT_SOFT,
    sheetLabel: "Assigned",
    rightWord: "NEW",
    rightColor: Theme.primary,
  },
  in_progress: {
    Icon: Send,
    color: "#5c6bc0",
    bg: "#e8eaf6",
    sheetLabel: "In progress",
    rightWord: "ACTIVE",
    rightColor: "#4D3636",
  },
  picked_up: {
    Icon: MapPin,
    color: "#f59e0b",
    bg: "#fffbeb",
    sheetLabel: "Pickup",
    rightWord: "LOAD",
    rightColor: "#b45309",
  },
  in_transit: {
    Icon: Truck,
    color: "#06b6d4",
    bg: "#ecfeff",
    sheetLabel: "In transit",
    rightWord: "LEG",
    rightColor: "#0e7490",
  },
  at_drop: {
    Icon: MapPin,
    color: "#10b981",
    bg: "#ecfdf5",
    sheetLabel: "At drop",
    rightWord: "DROP",
    rightColor: "#047857",
  },
  completed: {
    Icon: CheckCircle,
    color: "#22c55e",
    bg: "#f0fdf4",
    sheetLabel: "Completed",
    rightWord: "DONE",
    rightColor: "#047857",
  },
  cancelled: {
    Icon: XCircle,
    color: "#ef4444",
    bg: "#fef2f2",
    sheetLabel: "Cancelled",
    rightWord: "VOID",
    rightColor: "#be123c",
  },
  revoked: {
    Icon: Undo2,
    color: Theme.warning,
    bg: Theme.warningMuted,
    sheetLabel: "Rolled back",
    rightWord: "UNDO",
    rightColor: Theme.warning,
  },
  pending: {
    Icon: Clock,
    color: "#94a3b8",
    bg: "#f1f5f9",
    sheetLabel: "Pending",
    rightWord: "WAIT",
    rightColor: "#64748b",
  },
  started: {
    Icon: Send,
    color: "#5c6bc0",
    bg: "#e8eaf6",
    sheetLabel: "Started",
    rightWord: "START",
    rightColor: "#4D3636",
  },
  delivered: {
    Icon: Package,
    color: "#10b981",
    bg: "#ecfdf5",
    sheetLabel: "Delivered",
    rightWord: "POD",
    rightColor: "#047857",
  },
  default: {
    Icon: Clock,
    color: "#94a3b8",
    bg: "#f8fafc",
    sheetLabel: "Update",
    rightWord: "INFO",
    rightColor: "#475569",
  },
};

function inferStatusFromContent(content: string): keyof typeof STATUS_ICON_MAP {
  const c = content.toLowerCase();
  if (c.includes("stage revoked") || c.includes("stepped back")) return "revoked";
  if (c.includes("accepted") || c.includes("heading to pickup")) return "in_progress";
  if (c.includes("pickup point") || c.includes("reached the pickup")) return "picked_up";
  if (c.includes("in transit") || c.includes("departed")) return "in_transit";
  if (c.includes("reached the destination")) return "at_drop";
  if (c.includes("completed")) return "completed";
  if (c.includes("cancelled")) return "cancelled";
  if (c.includes("assigned")) return "assigned";
  if (c.includes("changed") || c.includes("reassigned") || c.includes("unassigned"))
    return "assigned";
  return "default";
}

export function getStatusEventSheetVisuals(statusKey: string) {
  const row = STATUS_ICON_MAP[statusKey as keyof typeof STATUS_ICON_MAP];
  return row ?? STATUS_ICON_MAP.default;
}

// ── Ledger event card (payment / adjustment) ──────────────────────────────────

interface LedgerCardProps {
  message: TripMessageRow;
  currentOrgId: string;
  /** Chat thread party (linked client/supplier name) — fills missing receiver on cash-in rows. */
  conversationPartyName?: string | null;
  onAddToBook: (message: TripMessageRow) => void;
  onDispute: (message: TripMessageRow) => void;
  /** Driver / embedded views: show the card UI without add-to-book or dispute actions. */
  readOnly?: boolean;
  /** Integrated indent commercial lane only — hides Add to book / Dispute row when false. */
  hideLedgerActions?: boolean;
}

/**
 * Full metadata usually includes sender/receiver org names. Older/test RPC payloads often omit them;
 * we still persist human-readable `content` from chatLedgerBridge — parse that and use conv party name.
 */
function resolvedLedgerOrgLine(
  meta: LedgerEventMetadata,
  content: string,
  conversationPartyName?: string | null,
): string {
  let sender = (meta.sender_org_name ?? "").trim();
  let receiver = (meta.receiver_org_name ?? "").trim();
  const flow = meta.flow === "out" ? "out" : "in";
  const c = (content ?? "").trim();
  const party = (conversationPartyName ?? "").trim();

  if (!sender || !receiver) {
    if (flow === "in") {
      const needle = " received ";
      const i = c.indexOf(needle);
      if (i > 0) {
        const fromContent = c.slice(0, i).trim();
        if (!sender && fromContent) sender = fromContent;
      }
      // Cash-in line does not encode counterparty org; use whom this conversation is with.
      if (!receiver && party) receiver = party;
    } else {
      const paidIdx = c.indexOf(" paid ");
      const toIdx = c.indexOf(" to ");
      const dotIdx = c.indexOf(" · ");
      if (paidIdx > 0 && toIdx > paidIdx && dotIdx > toIdx) {
        if (!sender) sender = c.slice(0, paidIdx).trim();
        if (!receiver) receiver = c.slice(toIdx + 4, dotIdx).trim();
      }
      if (!receiver && party) receiver = party;
    }
  }

  const left = sender || "—";
  const right = receiver || "—";
  return `${left} → ${right}`;
}

function splitOrgLine(orgLine: string): { from: string; to: string } {
  const trimmed = (orgLine ?? "").trim();
  const arrow = trimmed.split(/\s*→\s*/);
  if (arrow.length >= 2) {
    return {
      from: arrow[0]?.trim() || "—",
      to: arrow.slice(1).join(" → ").trim() || "—",
    };
  }
  return { from: trimmed || "—", to: "" };
}

export function formatTripEventSheetDate(iso: string): string {
  try {
    return new Date(iso)
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .toUpperCase();
  } catch {
    return "";
  }
}

/** Route ribbon above system-update cards — e.g. `MUMBAI → HYDERABAD · TODAY`. */
export function buildChatRouteContextLabel(
  pickupArea?: string | null,
  dropLocation?: string | null,
  createdAt?: string | null,
): string | null {
  const pickup = String(pickupArea ?? "").trim();
  const drop = String(dropLocation ?? "").trim();
  if (!pickup || !drop) return null;
  const route = `${pickup} → ${drop}`.toUpperCase();
  let dayLabel = "TODAY";
  if (createdAt) {
    try {
      const eventDay = new Date(createdAt);
      const now = new Date();
      if (eventDay.toDateString() !== now.toDateString()) {
        dayLabel = eventDay
          .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
          .toUpperCase();
      }
    } catch {
      /* keep TODAY */
    }
  }
  return `${route} · ${dayLabel}`;
}

export function ChatLedgerEventCard({
  message,
  currentOrgId,
  conversationPartyName,
  onAddToBook,
  onDispute,
  readOnly = false,
  hideLedgerActions = false,
  isMobile = false,
}: LedgerCardProps & { isMobile?: boolean }) {
  const addingToBook = useSyncExternalStore(
    subscribeLedgerBookPending,
    () => getLedgerBookPendingSnapshot().has(message.id),
    () => false,
  );

  if (!ledgerEventInvolvesOrg(message, currentOrgId)) return null;
  const meta = message.metadata as LedgerEventMetadata | null;
  if (!meta) return null;

  const isReceiver =
    String(meta.receiver_org_id ?? "").trim() === String(currentOrgId ?? "").trim();
  const isSender =
    String(meta.sender_org_id ?? "").trim() === String(currentOrgId ?? "").trim();
  if (!isReceiver && !isSender) return null;

  const directionLabel =
    isReceiver && !isSender
      ? "Incoming payment"
      : isSender && !isReceiver
        ? "Outgoing payment"
        : "Transfer";

  const paymentModeLabel = String(meta.payment_mode ?? "Cash").trim() || "Cash";
  const safeAmount = Number(meta.amount ?? 0);
  const flow: "in" | "out" = meta.flow === "out" ? "out" : "in";

  const amountLabel = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(safeAmount) ? safeAmount : 0);

  const flowPrefix = flow === "in" ? "+" : "−";
  const isAcknowledged = !!meta.acknowledged_at || !!meta.is_booked;
  const isDisputed = !!meta.disputed;

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const orgLine = resolvedLedgerOrgLine(meta, message.content, conversationPartyName);
  const { from: fromParty, to: toParty } = splitOrgLine(orgLine);

  const titleParty = flow === "in" ? fromParty : toParty;
  const titleDisplay = formatElegantPartyName(titleParty);
  const dateUpper = formatTripEventSheetDate(message.created_at);
  const metaMid = [paymentModeLabel, meta.category].filter(Boolean).join(" · ") || "—";
  const routeLine = `${formatElegantPartyName(fromParty) ?? fromParty} → ${formatElegantPartyName(toParty) ?? toParty}`;

  const isCredit = flow === "in";
  const amountColor = isCredit ? "#047857" : "#BE123C";
  const iconSize = 28;

  const avatarEl = (
    <View style={[s.ledgerIconWrap, isMobile && s.ledgerIconWrapMobile]}>
      <ChatPaymentEventIcon
        flow={flow}
        paymentMode={paymentModeLabel}
        isAcknowledged={isAcknowledged}
        isDisputed={isDisputed}
        size={iconSize}
      />
    </View>
  );

  const bodyEl = (
    <View style={s.ledgerBody}>
      {titleDisplay ? (
        <Text
          style={[s.ledgerTitle, isMobile && s.ledgerTitleMobile]}
          numberOfLines={isMobile ? 3 : 1}
        >
          {titleDisplay}
        </Text>
      ) : null}
      <Text
        style={[s.ledgerMeta, isMobile && s.ledgerMetaMobile]}
        numberOfLines={isMobile ? 3 : 1}
      >
        {directionLabel}
        {" · "}
        {dateUpper}
        {" · "}
        {metaMid}
      </Text>
      <Text
        style={[s.ledgerRoute, isMobile && s.ledgerRouteMobile]}
        numberOfLines={isMobile ? 2 : 1}
      >
        {routeLine}
      </Text>
    </View>
  );

  return (
    <View style={[s.ledgerWrap, isMobile && s.ledgerWrapMobile]}>
      <View style={[s.ledgerCard, isMobile && s.ledgerCardMobile]}>
        {isMobile ? (
          <>
            <View style={s.ledgerTopRowMobile}>
              {avatarEl}
              {bodyEl}
            </View>
            <View style={s.ledgerFooterMobile}>
              <Text
                style={[s.ledgerAmountMobile, { color: amountColor }]}
                numberOfLines={1}
              >
                {flowPrefix}
                {amountLabel}
              </Text>
              <Text style={s.ledgerTimeMobile} numberOfLines={1}>
                {displayTime}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={s.ledgerDesktopTop}>
              {avatarEl}
              {bodyEl}
            </View>
            <View style={s.ledgerFooterMobile}>
              <Text style={[s.ledgerAmountMobile, { color: amountColor }]} numberOfLines={1}>
                {flowPrefix}
                {amountLabel}
              </Text>
              <Text style={s.ledgerTimeMobile} numberOfLines={1}>
                {displayTime}
              </Text>
            </View>
          </>
        )}
      </View>

      {meta.notes ? (
        <Text style={s.ledgerNotesBelow} numberOfLines={2}>
          {meta.notes}
        </Text>
      ) : null}

      {isAcknowledged ? (
        <View style={s.ledgerFooterStatus}>
          <CheckCircle size={11} color="#059669" />
          <Text style={s.ledgerFooterStatusText}>Added to book</Text>
        </View>
      ) : isDisputed ? (
        <View style={s.ledgerFooterStatus}>
          <AlertTriangle size={11} color="#d97706" />
          <Text style={[s.ledgerFooterStatusText, { color: "#b45309" }]}>Dispute raised</Text>
        </View>
      ) : !readOnly && !hideLedgerActions && isReceiver && !isSender ? (
        <View style={s.ledgerActions}>
          <TouchableOpacity
            style={s.ledgerAddBtn}
            onPress={() => onAddToBook(message)}
            disabled={addingToBook}
            activeOpacity={0.8}
          >
            {addingToBook ? (
              <LoadingIndicator size="small" color="#fff" />
            ) : (
              <Text style={s.ledgerAddBtnText}>Add to book</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={s.ledgerDisputeBtn}
            onPress={() => onDispute(message)}
            disabled={addingToBook}
            activeOpacity={0.8}
          >
            <Text style={s.ledgerDisputeBtnText}>Dispute</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Ledger row — same footprint as system updates (payment-style sheet)
  ledgerWrap: {
    alignSelf: "center",
    maxWidth: "85%",
    marginVertical: 4,
  },
  ledgerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4E6EF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: "#181C32",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  ledgerIconWrap: {
    flexShrink: 0,
    marginTop: 1,
  },
  ledgerIconWrapMobile: {
    marginTop: 0,
  },
  ledgerDesktopTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  ledgerBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    justifyContent: "center",
    paddingVertical: 0,
    paddingTop: 1,
  },
  ledgerTitle: {
    fontSize: 11,
    fontWeight: "500",
    color: "#181C32",
    letterSpacing: -0.1,
    lineHeight: 14,
  },
  ledgerMeta: {
    fontSize: 10,
    fontWeight: "400",
    color: "#78829D",
    letterSpacing: -0.02,
    lineHeight: 13,
  },
  ledgerRoute: {
    fontSize: 9,
    fontWeight: "400",
    color: "#A1A5B7",
    letterSpacing: 0,
    lineHeight: 12,
  },
  ledgerNotesBelow: {
    marginTop: 5,
    fontSize: 10,
    color: "#78829D",
    lineHeight: 13,
    fontWeight: "400",
    paddingHorizontal: 2,
  },
  ledgerFooterStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4E6EF",
    alignSelf: "flex-start",
  },
  ledgerFooterStatusText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#047857",
  },
  ledgerActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  ledgerAddBtn: {
    flex: 1,
    backgroundColor: CHAT_ACCENT,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  ledgerAddBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.buttonPrimaryText,
  },
  ledgerDisputeBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fbbf24",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 34,
  },
  ledgerDisputeBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#b45309",
  },
  ledgerWrapMobile: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    marginVertical: CHAT_MOBILE.eventCardGap / 2,
  },
  ledgerCardMobile: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderColor: "#E4E6EF",
    shadowOpacity: 0.03,
    shadowRadius: 5,
    gap: 0,
  },
  ledgerTopRowMobile: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  ledgerTitleMobile: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: "#181C32",
    letterSpacing: -0.1,
  },
  ledgerMetaMobile: {
    fontSize: 10,
    lineHeight: 13,
    color: "#78829D",
    fontWeight: "400",
    letterSpacing: -0.02,
  },
  ledgerRouteMobile: {
    fontSize: 9,
    lineHeight: 12,
    color: "#A1A5B7",
    fontWeight: "400",
    letterSpacing: 0,
  },
  ledgerFooterMobile: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E4E6EF",
    gap: 8,
  },
  ledgerAmountMobile: {
    fontSize: 11,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.15,
    flexShrink: 1,
  },
  ledgerTimeMobile: {
    fontSize: 9,
    fontWeight: "400",
    color: "#A1A5B7",
    flexShrink: 0,
    letterSpacing: 0,
  },

  /** Metronic-style system alert — avatar, kicker, body, footer pill + time. */
  alertWrap: {
    alignSelf: "center",
    width: "auto",
    maxWidth: 520,
    minWidth: 0,
    marginVertical: 5,
  },
  alertCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E9EDEF",
    paddingHorizontal: 11,
    paddingVertical: 9,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.055,
    shadowRadius: 6,
    elevation: 1,
    position: "relative",
    overflow: "hidden",
  },
  alertAccentRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 2.5,
    opacity: 0.82,
  },
  alertCornerDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.95,
  },
  alertTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  alertTopRowDriverSwap: {
    alignItems: "center",
    gap: 10,
  },
  alertAvatarShell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(91, 94, 244, 0.28)",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#5b5ef4",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 1,
    overflow: "visible",
  },
  alertAvatarPingRing: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
  },
  alertAvatarEventBadge: {
    position: "absolute",
    left: -3,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Theme.cardWhite,
    zIndex: 2,
  },
  alertAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CHAT_ACCENT_SOFT,
    flexShrink: 0,
  },
  alertAvatarPresence: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
    borderColor: Theme.cardWhite,
    backgroundColor: CHAT_ACCENT,
  },
  alertAvatarText: {
    fontSize: 10,
    fontWeight: "700",
    color: CHAT_TEXT_PRIMARY,
    letterSpacing: 0.15,
  },
  alertBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  alertSimpleBody: {
    flexShrink: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingVertical: 2,
  },
  alertSimpleBodyLocation: {
    gap: 0,
    paddingVertical: 1,
  },
  alertCardLocation: {
    paddingVertical: 8,
  },
  alertCardDriverSwap: {
    paddingVertical: 10,
  },
  alertDriverSwapAvatarSlot: {
    width: 94,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  alertSimpleMessage: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "400",
    color: CHAT_TEXT_SECONDARY,
  },
  alertLocationTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: CHAT_TEXT_PRIMARY,
    letterSpacing: -0.15,
  },
  alertLocationMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    minWidth: 0,
  },
  alertLocationPlace: {
    flex: 1,
    minWidth: 0,
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "400",
    color: CHAT_TEXT_SECONDARY,
    letterSpacing: -0.05,
  },
  alertLocationPlaceSpacer: {
    flex: 1,
    minWidth: 0,
  },
  alertLocationTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  alertLocationTimeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "500",
    color: CHAT_TEXT_MUTED,
    letterSpacing: -0.05,
  },
  alertHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  alertHeaderStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  alertHeaderStatusText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  alertHeaderMetaPill: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  alertKicker: {
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: CHAT_ACCENT,
  },
  alertTitle: {
    fontSize: CHAT_MOBILE.eventTitleSize,
    lineHeight: CHAT_MOBILE.eventTitleLine,
    fontWeight: "500",
    color: CHAT_TEXT_PRIMARY,
    marginTop: 1,
  },
  alertMeta: {
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "500",
    color: CHAT_TEXT_MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.38,
    marginTop: 0,
  },
  alertMessageBox: {
    marginTop: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E9EDEF",
    borderRadius: 8,
    backgroundColor: "#FAFBFC",
    paddingHorizontal: 8,
    paddingVertical: 6.5,
  },
  alertMessageText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: CHAT_TEXT_PRIMARY,
  },
  alertFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E9EDEF",
    gap: 8,
  },
  alertPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: Theme.cardWhite,
  },
  alertPillDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  alertPillText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  alertTime: {
    fontSize: 10,
    fontWeight: "600",
    color: CHAT_TEXT_MUTED,
    flexShrink: 0,
    letterSpacing: 0.1,
  },
});

export type TripProgressEventKind = "location" | "tracking" | "status" | "default";

type StatusEventVisual = {
  Icon: StatusIconComponent;
  color: string;
  bg: string;
};

function TripEventAvatarCluster({
  identity,
  avatarSeedFallback,
  eventKind = "default",
  statusVisual = null,
  simulated = false,
  accentColor,
}: {
  identity: ResolvedPartyAvatarIdentity | null;
  avatarSeedFallback: string;
  eventKind?: TripProgressEventKind;
  statusVisual?: StatusEventVisual | null;
  simulated?: boolean;
  accentColor: string;
}) {
  const avatarSize = 28;
  const dotPulse = useRef(new Animated.Value(0)).current;
  const ringPulse = useRef(new Animated.Value(0)).current;
  const iconPop = useRef(new Animated.Value(0)).current;
  const trackSpin = useRef(new Animated.Value(0)).current;

  const resolvedIdentity = identity
    ? {
        ...identity,
        avatarSeed: identity.avatarSeed ?? avatarSeedFallback,
      }
    : null;

  const locationAccent = simulated ? "#D97706" : "#059669";
  const dotColor =
    eventKind === "location"
      ? locationAccent
      : eventKind === "tracking"
        ? CHAT_ACCENT
        : statusVisual?.color || accentColor || CHAT_ACCENT;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, {
          toValue: 1,
          duration: eventKind === "location" ? 900 : 680,
          useNativeDriver: true,
        }),
        Animated.timing(dotPulse, {
          toValue: 0,
          duration: eventKind === "location" ? 900 : 680,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dotPulse, eventKind]);

  useEffect(() => {
    if (eventKind !== "location" && eventKind !== "tracking") return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, {
          toValue: 1,
          duration: eventKind === "location" ? 1600 : 2200,
          useNativeDriver: true,
        }),
        Animated.timing(ringPulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ringPulse, eventKind]);

  useEffect(() => {
    Animated.spring(iconPop, {
      toValue: 1,
      speed: 18,
      bounciness: eventKind === "status" ? 6 : 3,
      useNativeDriver: true,
    }).start();
  }, [iconPop, eventKind]);

  useEffect(() => {
    if (eventKind !== "tracking") return;
    const loop = Animated.loop(
      Animated.timing(trackSpin, {
        toValue: 1,
        duration: 3200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [trackSpin, eventKind]);

  const BadgeIcon =
    eventKind === "location"
      ? MapPin
      : eventKind === "tracking"
        ? Navigation
        : statusVisual?.Icon ?? null;
  const badgeBg =
    eventKind === "location"
      ? simulated
        ? "#FEF3C7"
        : "#D1FAE5"
      : eventKind === "tracking"
        ? CHAT_ACCENT_SOFT
        : statusVisual?.bg ?? CHAT_ACCENT_SOFT;
  const badgeIconColor =
    eventKind === "location"
      ? locationAccent
      : eventKind === "tracking"
        ? CHAT_ACCENT
        : statusVisual?.color ?? CHAT_ACCENT;

  return (
    <View style={s.alertAvatarShell}>
      {eventKind === "location" || eventKind === "tracking" ? (
        <Animated.View
          pointerEvents="none"
          style={[
            s.alertAvatarPingRing,
            {
              borderColor:
                eventKind === "location" ? locationAccent : CHAT_ACCENT,
              opacity: ringPulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.42, 0],
              }),
              transform: [
                {
                  scale: ringPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.55],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      {resolvedIdentity ? (
        <View style={[s.alertAvatar, { overflow: "hidden" }]}>
          <ChatPartyAvatar identity={resolvedIdentity} size={avatarSize} />
        </View>
      ) : (
        <View style={s.alertAvatar}>
          <Text style={s.alertAvatarText}>
            {partyInitialsFromName(avatarSeedFallback)}
          </Text>
        </View>
      )}
      {BadgeIcon ? (
        <Animated.View
          style={[
            s.alertAvatarEventBadge,
            { backgroundColor: badgeBg },
            {
              opacity: iconPop,
              transform: [
                {
                  scale: iconPop.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.72, 1],
                  }),
                },
                ...(eventKind === "tracking"
                  ? [
                      {
                        rotate: trackSpin.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0deg", "360deg"],
                        }),
                      },
                    ]
                  : []),
              ],
            },
          ]}
        >
          <BadgeIcon size={10} color={badgeIconColor} strokeWidth={2.4} />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[
          s.alertAvatarPresence,
          {
            backgroundColor: dotColor,
            opacity: dotPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.82, 1],
            }),
            transform: [
              {
                scale: dotPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.14],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

export interface TripProgressEventCardProps {
  avatarSeed: string;
  /** When set, renders driver/party photo instead of initials from `avatarSeed`. */
  avatarIdentity?: ResolvedPartyAvatarIdentity | null;
  /** Old → new driver avatars with swap animation (assignment updates). */
  driverSwap?: DriverSwapPair | null;
  /** @deprecated Status tint no longer applied to avatar; kept for call-site compat. */
  avatarDotColor?: string;
  eventKind?: TripProgressEventKind;
  statusVisual?: StatusEventVisual | null;
  simulated?: boolean;
  kicker?: string;
  title: string;
  metaLine: string;
  /** Secondary line — place + city on location cards. */
  subLine?: string | null;
  /** GPS capture clock (location cards) — shown with time icon. */
  captureClock?: string | null;
  rightPrimary: string;
  rightPrimaryColor: string;
  time: string;
  /** @deprecated Route ribbon removed; kept for call-site compat. */
  routeContext?: string | null;
  /** @deprecated Single alert layout on all breakpoints. */
  isMobile?: boolean;
}

/** System update card — compact, aligned with update stream UI. */
export function TripProgressEventCard({
  avatarSeed,
  avatarIdentity = null,
  driverSwap = null,
  avatarDotColor,
  eventKind = "default",
  statusVisual = null,
  simulated = false,
  rightPrimaryColor,
  title,
  subLine = null,
  captureClock = null,
}: TripProgressEventCardProps) {
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const avatarEl = driverSwap ? (
    <ChatDriverSwapAvatar swap={driverSwap} />
  ) : (
    <TripEventAvatarCluster
      identity={avatarIdentity}
      avatarSeedFallback={avatarSeed}
      eventKind={eventKind}
      statusVisual={statusVisual}
      simulated={simulated}
      accentColor={avatarDotColor || rightPrimaryColor || CHAT_ACCENT}
    />
  );

  return (
    <Animated.View
      style={[
        s.alertWrap,
        {
          opacity: entrance,
          transform: [
            {
              translateY: entrance.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View
        style={[
          s.alertCard,
          eventKind === "location" && s.alertCardLocation,
          driverSwap && s.alertCardDriverSwap,
        ]}
      >
        <View style={[s.alertTopRow, driverSwap && s.alertTopRowDriverSwap]}>
          <View style={driverSwap ? s.alertDriverSwapAvatarSlot : undefined}>
            {avatarEl}
          </View>
          <View
            style={[
              s.alertSimpleBody,
              eventKind === "location" && s.alertSimpleBodyLocation,
            ]}
          >
            {eventKind === "location" ? (
              <>
                <Text style={s.alertLocationTitle} numberOfLines={1}>
                  {title}
                </Text>
                {subLine || captureClock ? (
                  <View style={s.alertLocationMetaRow}>
                    {subLine ? (
                      <Text style={s.alertLocationPlace} numberOfLines={1}>
                        {subLine}
                      </Text>
                    ) : (
                      <View style={s.alertLocationPlaceSpacer} />
                    )}
                    {captureClock ? (
                      <View
                        style={s.alertLocationTime}
                        accessibilityLabel={`Captured at ${captureClock}`}
                      >
                        <Clock
                          size={10}
                          color={CHAT_TEXT_MUTED}
                          strokeWidth={2.2}
                        />
                        <Text style={s.alertLocationTimeText} numberOfLines={1}>
                          {captureClock}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : driverSwap ? (
              <ChatDriverSwapPreviewCopy
                text={title}
                style={s.alertSimpleMessage}
                numberOfLines={3}
              />
            ) : (
              <Text style={s.alertSimpleMessage} numberOfLines={3}>
                {title}
              </Text>
            )}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function systemSheetAvatarSeed(content: string): string {
  const vehicle = (content ?? "").match(
    /\b([A-Z]{2}\s?\d{1,2}\s?[A-Z]{1,3}\s?\d{3,4})\b/i,
  );
  if (vehicle?.[1]) return vehicle[1].replace(/\s+/g, " ").trim();
  const m = (content ?? "").match(/\b(TRP[-A-Z0-9]+)\b/i);
  if (m?.[1]) return m[1].toUpperCase();
  const trip = (content ?? "").match(/\b([A-Z]{2,4}\d{2,6})\b/);
  if (trip?.[1]) return trip[1].toUpperCase();
  return "Trip update";
}

export function ChatSystemEventCard({
  message,
  composeTrip,
  driverProfiles,
}: {
  message: TripMessageRow;
  /** @deprecated Single alert layout on all breakpoints. */
  isMobile?: boolean;
  /** @deprecated Route ribbon removed from alert cards. */
  routeContext?: string | null;
  composeTrip?: SystemUpdateDriverContext["composeTrip"];
  driverProfiles?: SystemUpdateDriverContext["driverProfiles"];
}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- avoid cycle with revoke card
  const { isStageRevokeChatMessage } = require("../utils/stageRevokeChat.util") as {
    isStageRevokeChatMessage: (m: TripMessageRow) => boolean;
  };
  if (isStageRevokeChatMessage(message)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ChatStageRevokeCard } = require("./ChatStageRevokeCard");
    return (
      <ChatStageRevokeCard message={message} composeTrip={composeTrip} />
    );
  }

  const statusKey = inferStatusFromContent(message.content);
  const cfg = STATUS_ICON_MAP[statusKey] ?? STATUS_ICON_MAP.default;
  const dateUpper = formatTripEventSheetDate(message.created_at);

  let displayTime = message.created_at;
  try {
    displayTime = new Date(message.created_at).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    // keep raw
  }

  const driverCtx = { composeTrip, driverProfiles };
  const driverSwap = resolveDriverSwapAvatars(message, driverCtx);
  const driverAvatar = driverSwap
    ? null
    : resolveSystemUpdateDriverAvatar(message, driverCtx);
  const seed =
    driverSwap?.next.displayName?.trim() ||
    driverAvatar?.displayName?.trim() ||
    composeTrip?.driver_display_name?.trim() ||
    systemSheetAvatarSeed(message.content);

  return (
    <TripProgressEventCard
      avatarSeed={seed}
      avatarIdentity={driverAvatar}
      driverSwap={driverSwap}
      eventKind="status"
      statusVisual={cfg}
      kicker="SYSTEM UPDATE"
      title={message.content.trim() || "Trip update"}
      metaLine={`${dateUpper} · ${cfg.sheetLabel.toUpperCase()}`}
      rightPrimary={cfg.rightWord}
      rightPrimaryColor={cfg.rightColor}
      time={displayTime}
    />
  );
}
