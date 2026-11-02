/**
 * Wallet → Earnings tab: month picker, optional fleet filter,
 * earned vs received for trips completed in that month (not cash-in dates).
 */
import { NativeHtmlWebView } from "@/components/NativeHtmlWebView";
import { DriverCapturePaymentButton } from "@/features/drivers/components/DriverCapturePaymentButton";
import { DriverCollectFromSheet } from "@/features/drivers/components/DriverCollectFromSheet";
import {
  driverBodySecondary,
  driverUIBold,
  driverUIExtraBold,
  driverUISemiBold,
  DriverFontFamily,
} from "@/constants/DriverTypography";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { buildTripClaimWhatsappMessage } from "@/features/driver/utils/driverCommunication.util";
import {
  buildBulkEarningsPaymentFollowUpHtml,
  buildEarningsPaymentFollowUpHtml,
} from "@/features/driver/utils/driverPaymentRequestPreviewHtml.util";
import { tripNeedsPartyTag } from "@/features/drivers/utils/driverPartyReceivables.util";
import type { TripRow } from "@/features/trips/services/trips.service";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Filter,
  IndianRupee,
  MessageCircle,
  Route,
  Square,
  Tag,
  X,
} from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type WalletEarningsFleetOption = {
  orgId: string;
  orgName: string;
};

export type WalletEarningsTripMeta = {
  displayId: string;
  fleetName: string;
  from: string;
  to: string;
  statusLabel: string;
  tripDate: string;
  /** ISO timestamp of latest Pulse payment reminder for this trip, if any. */
  lastReminderAt: string | null;
};

type DayTripLine = {
  id: string;
  organizationId: string;
  route: string;
  earned: number;
  received: number;
  pending: number;
  spent: number;
  needsTag: boolean;
  meta: WalletEarningsTripMeta;
};

type FollowUpTarget = DayTripLine & {
  driverName?: string | null;
  driverPhone?: string | null;
};

type DayBucket = {
  dayKey: string;
  label: string;
  earned: number;
  received: number;
  spent: number;
  tripCount: number;
  trips: DayTripLine[];
};

function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(key: string): { year: number; monthIndex: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, monthIndex: (m || 1) - 1 };
}

function shiftMonth(key: string, delta: number): string {
  const { year, monthIndex } = parseMonthKey(key);
  const d = new Date(year, monthIndex + delta, 1);
  return monthKeyFromDate(d);
}

function formatMonthLabel(key: string): string {
  const { year, monthIndex } = parseMonthKey(key);
  const month = new Date(year, monthIndex, 1).toLocaleDateString("en-IN", {
    month: "long",
  });
  return `${month} ${year}`;
}

function tripDate(trip: TripRow): Date | null {
  const raw =
    trip.completed_at ?? trip.pickup_date ?? trip.updated_at ?? trip.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function dayKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(dayKey: string): string {
  const [y, m, day] = dayKey.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, day || 1);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  ) {
    return "Today";
  }
  if (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  ) {
    return "Yesterday";
  }
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
}

function formatDayNum(dayKey: string): string {
  const parts = dayKey.split("-");
  return parts[2] ?? "";
}

function routeEnds(
  route: string,
  from: string,
  to: string,
): { from: string; to: string } | { single: string } {
  const a = from.trim();
  const b = to.trim();
  if (a && b && a.toLowerCase() !== b.toLowerCase()) return { from: a, to: b };
  if (a && !b) return { single: a };
  if (b && !a) return { single: b };
  const parts = route.split(/\s*→\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2 && parts[0].toLowerCase() !== parts[1].toLowerCase()) {
    return { from: parts[0], to: parts[1] };
  }
  return { single: (a || b || route || "Trip").trim() };
}

const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function reminderCooldown(lastReminderAt: string | null | undefined): {
  blocked: boolean;
  remainingMs: number;
  label: string | null;
} {
  if (!lastReminderAt) {
    return { blocked: false, remainingMs: 0, label: null };
  }
  const at = new Date(lastReminderAt).getTime();
  if (!Number.isFinite(at)) {
    return { blocked: false, remainingMs: 0, label: null };
  }
  const remainingMs = at + REMINDER_COOLDOWN_MS - Date.now();
  if (remainingMs <= 0) {
    return { blocked: false, remainingMs: 0, label: null };
  }
  const totalMin = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const label =
    hours > 0
      ? `Try again in ${hours}h ${mins > 0 ? `${mins}m` : ""}`.trim()
      : `Try again in ${mins}m`;
  return { blocked: true, remainingMs, label };
}

type Props = {
  completedTrips: TripRow[];
  fleets: WalletEarningsFleetOption[];
  tripEarnings: (trip: TripRow) => number;
  /** True only when real agreed payout terms exist. Trips without this are excluded entirely — not shown as ₹0. */
  hasAgreedPayoutTerms: (trip: TripRow) => boolean;
  receivedByTripId: Record<string, number>;
  tripMeta: (trip: TripRow) => WalletEarningsTripMeta;
  driverName?: string | null;
  driverPhone?: string | null;
  pulseLoadingTripId?: string | null;
  pdfSharingTripId?: string | null;
  onSendPulseReminder: (tripId: string) => Promise<{
    ok: boolean;
    paymentRequestId?: string | null;
    lastReminderAt?: string | null;
    errorMessage?: string;
  }>;
  onSendBulkPulseReminder: (tripIds: string[]) => Promise<{
    ok: boolean;
    paymentRequestId?: string | null;
    lastReminderAt?: string | null;
    errorMessage?: string;
  }>;
  /** Share the follow-up HTML as a PDF (system share sheet → WhatsApp). */
  onSharePaymentPdf: (input: {
    tripId: string;
    html: string;
    message: string;
  }) => Promise<void>;
  colors: {
    text: string;
    textMuted: string;
    surface: string;
    background: string;
    border: string;
    borderSubtle: string;
    emerald: string;
    surfaceElevated: string;
  };
  isDark: boolean;
  /** Fuel / toll / other spend on the driver's trips (DCO). */
  tripExpenses?: { tripId: string; amount: number; kind?: string }[];
  /** Show spent + margin on the month hero (DCO trip costs). */
  showMonthPnl?: boolean;
  /** Employer-dispatched trips must not show Tag. */
  isFleetDispatched?: (trip: TripRow) => boolean;
};

export const DriverWalletEarningsPanel = memo(function DriverWalletEarningsPanel({
  completedTrips,
  fleets,
  tripEarnings,
  hasAgreedPayoutTerms,
  receivedByTripId,
  tripMeta,
  driverName = null,
  driverPhone = null,
  pulseLoadingTripId = null,
  pdfSharingTripId = null,
  onSendPulseReminder,
  onSendBulkPulseReminder,
  onSharePaymentPdf,
  colors,
  isDark,
  tripExpenses = [],
  showMonthPnl = false,
  isFleetDispatched,
}: Props) {
  const insets = useSafeAreaInsets();
  const [tagTrip, setTagTrip] = useState<TripRow | null>(null);
  const [monthKey, setMonthKey] = useState(() => monthKeyFromDate(new Date()));
  const [fleetOrgId, setFleetOrgId] = useState<string>("all");
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [dueOnly, setDueOnly] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectHint, setSelectHint] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<FollowUpTarget | null>(null);
  const [bulkLines, setBulkLines] = useState<DayTripLine[] | null>(null);
  const [localReminderAt, setLocalReminderAt] = useState<string | null>(null);
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null);
  const [pulseError, setPulseError] = useState<string | null>(null);
  const [showSentConfirm, setShowSentConfirm] = useState(false);
  const [bulkPulseBusy, setBulkPulseBusy] = useState(false);

  const showFleetFilter = fleets.length > 0;
  const canGoNext = monthKey < monthKeyFromDate(new Date());
  const activeFleetName =
    fleetOrgId === "all"
      ? null
      : fleets.find((f) => String(f.orgId) === fleetOrgId)?.orgName ?? null;

  const scopedTrips = useMemo(() => {
    return completedTrips.filter((trip) => {
      // Aggregate/direct-shipper trips with no agreed payout terms never
      // belong in the earnings breakdown — excluded entirely, not shown as ₹0.
      if (!hasAgreedPayoutTerms(trip)) return false;
      const d = tripDate(trip);
      if (!d || monthKeyFromDate(d) !== monthKey) return false;
      if (fleetOrgId === "all") return true;
      return String(trip.organization_id ?? "") === fleetOrgId;
    });
  }, [completedTrips, monthKey, fleetOrgId, hasAgreedPayoutTerms]);

  const earnedTotal = useMemo(
    () => Math.round(scopedTrips.reduce((sum, t) => sum + tripEarnings(t), 0)),
    [scopedTrips, tripEarnings],
  );

  const receivedTotal = useMemo(
    () =>
      Math.round(
        scopedTrips.reduce((sum, t) => sum + (receivedByTripId[t.id] ?? 0), 0),
      ),
    [scopedTrips, receivedByTripId],
  );

  const pendingTotal = Math.max(0, earnedTotal - receivedTotal);
  const collectedPct =
    earnedTotal > 0 ? Math.min(100, Math.round((receivedTotal / earnedTotal) * 100)) : 0;

  const monthPnl = useMemo(() => {
    const scopedIds = new Set(scopedTrips.map((t) => String(t.id)));
    let spent = 0;
    let fuel = 0;
    let toll = 0;
    let other = 0;
    for (const row of tripExpenses) {
      if (!scopedIds.has(String(row.tripId))) continue;
      const amt = Math.max(0, Math.round(Number(row.amount) || 0));
      spent += amt;
      const kind = String(row.kind ?? "").toLowerCase();
      if (kind === "fuel") fuel += amt;
      else if (kind === "toll") toll += amt;
      else other += amt;
    }
    const margin = Math.round(earnedTotal - spent);
    const denom = earnedTotal > 0 ? earnedTotal : spent > 0 ? spent : 1;
    const spentShare = Math.min(100, Math.round((spent / denom) * 100));
    const marginPct =
      earnedTotal > 0 ? Math.round((margin / earnedTotal) * 100) : spent > 0 ? 0 : 100;
    return {
      spent,
      fuel,
      toll,
      other,
      margin,
      spentShare,
      marginShare: Math.max(0, 100 - spentShare),
      marginPct,
      isLoss: margin < 0,
    };
  }, [scopedTrips, tripExpenses, earnedTotal]);

  const spentByTripId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of tripExpenses) {
      const id = String(row.tripId ?? "");
      if (!id) continue;
      map[id] = (map[id] ?? 0) + Math.max(0, Math.round(Number(row.amount) || 0));
    }
    return map;
  }, [tripExpenses]);

  const dayBuckets = useMemo(() => {
    const map = new Map<string, DayBucket>();
    for (const trip of scopedTrips) {
      const d = tripDate(trip);
      if (!d) continue;
      const key = dayKeyFromDate(d);
      const earned = Math.round(tripEarnings(trip));
      const received = Math.round(receivedByTripId[trip.id] ?? 0);
      const spent = Math.round(spentByTripId[String(trip.id)] ?? 0);
      const pending = Math.max(0, earned - received);
      const needsTag =
        showMonthPnl && tripNeedsPartyTag(trip, isFleetDispatched?.(trip) === true);
      const meta = tripMeta(trip);
      const route =
        [meta.from.trim(), meta.to.trim()].filter(Boolean).join(" → ") ||
        [trip.pickup_area?.trim(), trip.drop_location?.trim()].filter(Boolean).join(" → ") ||
        "Trip";
      const prev =
        map.get(key) ??
        ({
          dayKey: key,
          label: formatDayLabel(key),
          earned: 0,
          received: 0,
          spent: 0,
          tripCount: 0,
          trips: [],
        } satisfies DayBucket);
      prev.earned += earned;
      prev.received += received;
      prev.spent += spent;
      prev.tripCount += 1;
      prev.trips.push({
        id: String(trip.id),
        organizationId: String(trip.organization_id ?? ""),
        route,
        earned,
        received,
        pending,
        spent,
        needsTag,
        meta,
      });
      map.set(key, prev);
    }
    return Array.from(map.values())
      .map((b) => ({
        ...b,
        earned: Math.round(b.earned),
        received: Math.round(b.received),
        spent: Math.round(b.spent),
      }))
      .sort((a, b) => (a.dayKey < b.dayKey ? 1 : -1));
  }, [
    scopedTrips,
    tripEarnings,
    receivedByTripId,
    tripMeta,
    spentByTripId,
    showMonthPnl,
    isFleetDispatched,
  ]);

  const displayDayBuckets = useMemo(() => {
    if (!dueOnly && !selectMode) return dayBuckets;
    return dayBuckets
      .map((day) => {
        const trips = day.trips.filter((t) => t.pending > 0);
        if (trips.length === 0) return null;
        const earned = trips.reduce((s, t) => s + t.earned, 0);
        const received = trips.reduce((s, t) => s + t.received, 0);
        const spent = trips.reduce((s, t) => s + t.spent, 0);
        return {
          ...day,
          trips,
          tripCount: trips.length,
          earned,
          received,
          spent,
        };
      })
      .filter((d): d is DayBucket => Boolean(d));
  }, [dayBuckets, dueOnly, selectMode]);

  const selectableDueTrips = useMemo(() => {
    const lines: DayTripLine[] = [];
    for (const day of dayBuckets) {
      for (const t of day.trips) {
        if (t.pending > 0 && !reminderCooldown(t.meta.lastReminderAt).blocked) {
          lines.push(t);
        }
      }
    }
    return lines;
  }, [dayBuckets]);

  const selectedLines = useMemo(() => {
    const set = new Set(selectedIds.map(String));
    const lines: DayTripLine[] = [];
    for (const day of dayBuckets) {
      for (const t of day.trips) {
        if (set.has(String(t.id))) lines.push(t);
      }
    }
    return lines;
  }, [dayBuckets, selectedIds]);

  const selectedDueTotal = useMemo(
    () => selectedLines.reduce((s, t) => s + t.pending, 0),
    [selectedLines],
  );

  const followUpWhatsAppMessage = useMemo(() => {
    if (!followUp) return "";
    return buildTripClaimWhatsappMessage({
      fleetName: followUp.meta.fleetName,
      tripId: followUp.meta.displayId,
      amount: followUp.pending > 0 ? followUp.pending : followUp.earned,
      status: followUp.meta.statusLabel,
      from: followUp.meta.from,
      to: followUp.meta.to,
      tripDate: followUp.meta.tripDate,
      driverName: followUp.driverName ?? driverName,
      driverPhone: followUp.driverPhone ?? driverPhone,
    });
  }, [followUp, driverName, driverPhone]);

  const effectiveLastReminderAt =
    localReminderAt ??
    (bulkLines ? null : followUp?.meta.lastReminderAt) ??
    null;
  const cooldown = reminderCooldown(effectiveLastReminderAt);
  const pulseAlreadySentRecently = cooldown.blocked;

  const followUpHtml = useMemo(() => {
    if (!followUp) return "";
    const amount = followUp.pending > 0 ? followUp.pending : followUp.earned;
    return buildEarningsPaymentFollowUpHtml({
      fleetName: followUp.meta.fleetName,
      displayId: followUp.meta.displayId,
      amount,
      from: followUp.meta.from,
      to: followUp.meta.to,
      status: followUp.meta.statusLabel,
      tripDate: followUp.meta.tripDate,
      driverName: followUp.driverName ?? driverName,
      driverPhone: followUp.driverPhone ?? driverPhone,
      paymentRequestId,
    });
  }, [followUp, driverName, driverPhone, paymentRequestId]);

  const bulkHtml = useMemo(() => {
    if (!bulkLines || bulkLines.length === 0) return "";
    const fleetName = bulkLines[0]?.meta.fleetName ?? "Fleet";
    return buildBulkEarningsPaymentFollowUpHtml({
      fleetName,
      trips: bulkLines.map((t) => ({
        displayId: t.meta.displayId,
        from: t.meta.from,
        to: t.meta.to,
        tripDate: t.meta.tripDate,
        amount: t.pending > 0 ? t.pending : t.earned,
      })),
      driverName,
      driverPhone,
      paymentRequestId,
    });
  }, [bulkLines, driverName, driverPhone, paymentRequestId]);

  const activePreviewHtml = bulkLines ? bulkHtml : followUpHtml;
  const isBulkPreview = Boolean(bulkLines && bulkLines.length > 0);

  const openFollowUp = (line: DayTripLine) => {
    if (selectMode) return;
    setBulkLines(null);
    setPulseError(null);
    setLocalReminderAt(line.meta.lastReminderAt);
    setPaymentRequestId(null);
    setShowSentConfirm(false);
    setFollowUp({
      ...line,
      driverName,
      driverPhone,
    });
  };

  const closeFollowUp = () => {
    setFollowUp(null);
    setBulkLines(null);
    setPulseError(null);
    setLocalReminderAt(null);
    setPaymentRequestId(null);
    setShowSentConfirm(false);
    setBulkPulseBusy(false);
  };

  const toggleSelectMode = (next: boolean) => {
    setSelectMode(next);
    setSelectHint(null);
    setSelectedIds([]);
    if (next) {
      setDueOnly(true);
      const firstDue = dayBuckets.find((d) => d.trips.some((t) => t.pending > 0));
      if (firstDue) setExpandedDayKey(firstDue.dayKey);
    }
  };

  const toggleSelected = (line: DayTripLine) => {
    const id = String(line.id ?? "");
    if (!id || line.pending <= 0) {
      setSelectHint("This trip can’t be selected.");
      return;
    }
    if (reminderCooldown(line.meta.lastReminderAt).blocked) {
      setSelectHint("This trip already had a Pulse reminder in the last 24 hours.");
      return;
    }

    const orgId = String(line.organizationId ?? "").trim();
    const fleetKey = orgId || line.meta.fleetName.trim().toLowerCase() || "unknown";

    const prev = selectedIds;
    if (prev.includes(id)) {
      setSelectedIds(prev.filter((x) => x !== id));
      setSelectHint(null);
      return;
    }

    if (prev.length > 0) {
      let firstFleetKey = "";
      outer: for (const day of dayBuckets) {
        for (const t of day.trips) {
          if (String(t.id) === String(prev[0])) {
            const firstOrg = String(t.organizationId ?? "").trim();
            firstFleetKey =
              firstOrg || t.meta.fleetName.trim().toLowerCase() || "unknown";
            break outer;
          }
        }
      }
      if (firstFleetKey && fleetKey && firstFleetKey !== fleetKey) {
        setSelectHint("Select trips from the same fleet only.");
        return;
      }
    }

    setSelectedIds([...prev, id]);
    setSelectHint(null);
  };

  const selectAllDueSameFleet = () => {
    const pool = selectableDueTrips;
    if (pool.length === 0) {
      setSelectHint("No due trips available to select.");
      return;
    }
    const seed = selectedLines[0] ?? pool[0];
    const seedOrg = String(seed.organizationId ?? "").trim();
    const seedFleet =
      seedOrg || seed.meta.fleetName.trim().toLowerCase() || "unknown";
    const same = pool.filter((t) => {
      const org = String(t.organizationId ?? "").trim();
      const key = org || t.meta.fleetName.trim().toLowerCase() || "unknown";
      return key === seedFleet;
    });
    setSelectedIds(same.map((t) => String(t.id)));
    setSelectHint(
      same.length < pool.length
        ? `Selected ${same.length} due trips from one fleet.`
        : null,
    );
  };

  const openBulkFollowUp = () => {
    if (selectedLines.length === 0) return;
    setFollowUp(null);
    setPulseError(null);
    setPaymentRequestId(null);
    setShowSentConfirm(false);
    setLocalReminderAt(null);
    setBulkLines(selectedLines);
  };

  const handleSendPulse = async () => {
    if (isBulkPreview && bulkLines) {
      if (cooldown.blocked) {
        setPulseError(
          cooldown.label
            ? `Reminder already sent. ${cooldown.label}.`
            : "Reminder already sent. Try again after 24 hours.",
        );
        return;
      }
      setPulseError(null);
      setBulkPulseBusy(true);
      try {
        const result = await onSendBulkPulseReminder(bulkLines.map((t) => t.id));
        if (!result.ok) {
          setPulseError(result.errorMessage ?? "Could not send Pulse reminder.");
          return;
        }
        const at = result.lastReminderAt ?? new Date().toISOString();
        setLocalReminderAt(at);
        if (result.paymentRequestId) setPaymentRequestId(result.paymentRequestId);
        setSelectedIds([]);
        setShowSentConfirm(true);
      } finally {
        setBulkPulseBusy(false);
      }
      return;
    }

    if (!followUp) return;
    if (cooldown.blocked) {
      setPulseError(
        cooldown.label
          ? `Reminder already sent. ${cooldown.label}.`
          : "Reminder already sent. Try again after 24 hours.",
      );
      return;
    }
    setPulseError(null);
    const result = await onSendPulseReminder(followUp.id);
    if (!result.ok) {
      setPulseError(result.errorMessage ?? "Could not send Pulse reminder.");
      return;
    }
    const at = result.lastReminderAt ?? new Date().toISOString();
    setLocalReminderAt(at);
    if (result.paymentRequestId) setPaymentRequestId(result.paymentRequestId);
    setShowSentConfirm(true);
  };

  const handleSharePdf = async () => {
    if (!activePreviewHtml) return;
    setPulseError(null);
    try {
      await onSharePaymentPdf({
        tripId: isBulkPreview ? "bulk" : followUp?.id ?? "trip",
        html: activePreviewHtml,
        message: followUpWhatsAppMessage,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not share payment PDF.";
      setPulseError(msg);
    }
  };

  const cardBorder = isDark ? colors.borderSubtle : "rgba(226,232,240,0.95)";
  const cardShadow = isDark ? "#000" : "rgba(15,23,42,0.08)";
  const isPulseBusy =
    bulkPulseBusy ||
    Boolean(
      (followUp && pulseLoadingTripId === followUp.id) ||
        (bulkLines &&
          bulkLines.some((t) => pulseLoadingTripId === t.id)),
    );
  const isPdfBusy = Boolean(pdfSharingTripId === "bulk" || (followUp && pdfSharingTripId === followUp.id));
  const previewOpen = Boolean(followUp || (bulkLines && bulkLines.length > 0));

  return (
    <View style={[styles.root, { paddingHorizontal: Layout.screenPaddingHorizontal }]}>
      {/* Month control */}
      <View
        style={[
          styles.monthCard,
          {
            backgroundColor: isDark ? colors.surfaceElevated : colors.surface,
            borderColor: cardBorder,
            shadowColor: cardShadow,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            setExpandedDayKey(null);
            setSelectedIds([]);
            setSelectHint(null);
            setMonthKey((k) => shiftMonth(k, -1));
          }}
          style={[
            styles.monthNavBtn,
            { backgroundColor: isDark ? "rgba(4,120,87,0.16)" : Theme.driverEmeraldMuted },
          ]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <ChevronLeft size={16} color={colors.emerald} strokeWidth={2.4} />
        </Pressable>

        <View style={styles.monthCenter}>
          <View style={styles.monthEyebrow}>
            <CalendarDays size={11} color={colors.emerald} strokeWidth={2.4} />
            <Text style={[styles.monthEyebrowText, { color: colors.emerald }]}>Period</Text>
          </View>
          <Text style={[styles.monthLabel, { color: colors.text }]} numberOfLines={1}>
            {formatMonthLabel(monthKey)}
          </Text>
          <Text style={[styles.monthHint, { color: colors.textMuted }]} numberOfLines={1}>
            {activeFleetName ? activeFleetName : "All fleets · completed trips"}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            if (!canGoNext) return;
            setExpandedDayKey(null);
            setSelectedIds([]);
            setSelectHint(null);
            setMonthKey((k) => shiftMonth(k, 1));
          }}
          style={[
            styles.monthNavBtn,
            { backgroundColor: isDark ? "rgba(4,120,87,0.16)" : Theme.driverEmeraldMuted },
            !canGoNext && styles.monthNavDisabled,
          ]}
          hitSlop={6}
          disabled={!canGoNext}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <ChevronRight
            size={16}
            color={canGoNext ? colors.emerald : colors.textMuted}
            strokeWidth={2.4}
          />
        </Pressable>
      </View>

      {/* Fleet filter */}
      {showFleetFilter ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.fleetChipRow}
          style={styles.fleetChipScroll}
        >
          <Pressable
            onPress={() => {
              setExpandedDayKey(null);
              setFleetOrgId("all");
            }}
            style={[
              styles.fleetChip,
              fleetOrgId === "all" ? styles.fleetChipActive : null,
              {
                borderColor:
                  fleetOrgId === "all"
                    ? Theme.driverEmeraldBorder
                    : cardBorder,
                backgroundColor:
                  fleetOrgId === "all"
                    ? isDark
                      ? "rgba(4,120,87,0.18)"
                      : Theme.driverEmeraldMuted
                    : colors.surface,
              },
            ]}
          >
            <Building2
              size={12}
              color={fleetOrgId === "all" ? colors.emerald : colors.textMuted}
              strokeWidth={2.3}
            />
            <Text
              style={[
                styles.fleetChipText,
                { color: fleetOrgId === "all" ? colors.emerald : colors.textMuted },
              ]}
            >
              All fleets
            </Text>
          </Pressable>
          {fleets.map((f) => {
            const active = fleetOrgId === String(f.orgId);
            return (
              <Pressable
                key={f.orgId}
                onPress={() => {
                  setExpandedDayKey(null);
                  setFleetOrgId(String(f.orgId));
                }}
                style={[
                  styles.fleetChip,
                  active ? styles.fleetChipActive : null,
                  {
                    borderColor: active ? Theme.driverEmeraldBorder : cardBorder,
                    backgroundColor: active
                      ? isDark
                        ? "rgba(4,120,87,0.18)"
                        : Theme.driverEmeraldMuted
                      : colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.fleetChipText,
                    { color: active ? colors.emerald : colors.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {f.orgName}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Hero summary — aligns with wallet “TO COLLECT” emerald card */}
      <LinearGradient
        colors={
          isDark
            ? [Theme.driverEmeraldDark, "#022c22"]
            : [Theme.driverEmerald, Theme.driverEmeraldDark]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroCard, { shadowColor: isDark ? "#000" : Theme.driverEmeraldDark }]}
      >
        <View style={styles.heroTopRow}>
          <View style={styles.heroBadge}>
            <IndianRupee size={12} color="#ecfdf5" strokeWidth={2.4} />
            <Text style={styles.heroBadgeText}>Earned this month</Text>
          </View>
          <Text style={styles.heroTripCount}>
            {scopedTrips.length} trip{scopedTrips.length === 1 ? "" : "s"}
          </Text>
        </View>

        <View style={styles.heroAmountRow}>
          <Text style={styles.heroRupee}>₹</Text>
          <Text
            style={styles.heroAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {earnedTotal.toLocaleString("en-IN")}
          </Text>
        </View>

        <View style={styles.progressPairRow}>
          <View style={styles.progressPairCol}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${collectedPct}%` }]} />
            </View>
            <Text style={styles.progressCaption} numberOfLines={2}>
              {collectedPct}% received · ₹{pendingTotal.toLocaleString("en-IN")} pending
            </Text>
          </View>
          {showMonthPnl ? (
            <View style={styles.progressPairCol}>
              <View style={styles.pnlBarTrack}>
                {monthPnl.spent > 0 ? (
                  <View
                    style={[
                      styles.pnlBarSpent,
                      { width: `${monthPnl.isLoss ? 100 : monthPnl.spentShare}%` },
                    ]}
                  />
                ) : null}
                {!monthPnl.isLoss && (monthPnl.marginShare > 0 || monthPnl.spent === 0) ? (
                  <View
                    style={[
                      styles.pnlBarKeep,
                      { width: `${monthPnl.spent === 0 ? 100 : monthPnl.marginShare}%` },
                    ]}
                  />
                ) : null}
              </View>
              <Text style={[styles.progressCaption, styles.progressCaptionEnd]} numberOfLines={2}>
                {monthPnl.spentShare}% spent · ₹
                {Math.abs(monthPnl.margin).toLocaleString("en-IN")}{" "}
                {monthPnl.isLoss ? "loss" : "margin"}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.heroMetricRow}>
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricLabel}>Received</Text>
            <Text style={styles.heroMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              ₹{receivedTotal.toLocaleString("en-IN")}
            </Text>
          </View>
          <View style={styles.heroMetricDivider} />
          <View style={styles.heroMetric}>
            <Text style={styles.heroMetricLabel}>Pending</Text>
            <Text style={styles.heroMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
              ₹{pendingTotal.toLocaleString("en-IN")}
            </Text>
          </View>
          {showMonthPnl ? (
            <>
              <View style={styles.heroMetricDivider} />
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricLabel}>Spent</Text>
                <Text
                  style={[styles.heroMetricValue, styles.pnlSpentValue]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  ₹{monthPnl.spent.toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={styles.heroMetricDivider} />
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricLabel}>
                  {monthPnl.isLoss ? "Loss" : "Margin"}
                  {` ${monthPnl.isLoss ? "" : "+"}${monthPnl.marginPct}%`}
                </Text>
                <Text
                  style={[
                    styles.heroMetricValue,
                    monthPnl.isLoss ? styles.pnlLossValue : null,
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {monthPnl.isLoss ? "−" : ""}₹
                  {Math.abs(monthPnl.margin).toLocaleString("en-IN")}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </LinearGradient>

      {/* Due filter + multi-select — directly under green earned card */}
      <View style={styles.toolsSection}>
        <Text style={[styles.toolsLabel, { color: colors.textMuted }]}>Request payment</Text>
        <View style={styles.toolsRow}>
          <Pressable
            onPress={() => {
              const next = !dueOnly;
              setDueOnly(next);
              if (!next && selectMode) toggleSelectMode(false);
            }}
            style={[
              styles.toolChip,
              {
                borderColor: dueOnly || selectMode ? Theme.driverEmeraldBorder : cardBorder,
                backgroundColor:
                  dueOnly || selectMode
                    ? isDark
                      ? "rgba(4,120,87,0.18)"
                      : Theme.driverEmeraldMuted
                    : colors.surface,
              },
            ]}
          >
            <Filter
              size={13}
              color={dueOnly || selectMode ? colors.emerald : colors.textMuted}
              strokeWidth={2.3}
            />
            <Text
              style={[
                styles.toolChipText,
                { color: dueOnly || selectMode ? colors.emerald : colors.textMuted },
              ]}
            >
              Due only
            </Text>
          </Pressable>

          <Pressable
            onPress={() => toggleSelectMode(!selectMode)}
            style={[
              styles.toolChipGrow,
              {
                borderColor: selectMode ? Theme.driverEmeraldBorder : cardBorder,
                backgroundColor: selectMode
                  ? colors.emerald
                  : isDark
                    ? colors.surfaceElevated
                    : colors.surface,
              },
            ]}
          >
            <CheckSquare
              size={14}
              color={selectMode ? Theme.textOnPrimary : colors.emerald}
              strokeWidth={2.4}
            />
            <Text
              style={[
                styles.toolChipText,
                { color: selectMode ? Theme.textOnPrimary : colors.emerald },
              ]}
            >
              {selectMode ? "Done selecting" : "Multi-select"}
            </Text>
          </Pressable>
        </View>

        {selectMode ? (
          <View style={styles.selectActionsCol}>
            <View
              style={[
                styles.selectBanner,
                {
                  backgroundColor: isDark ? colors.surfaceElevated : Theme.driverEmeraldMuted,
                  borderColor: isDark ? colors.borderSubtle : Theme.driverEmeraldBorderSoft,
                },
              ]}
            >
              <Text style={[styles.selectBannerText, { color: colors.text }]}>
                {selectedIds.length === 0
                  ? "Check due trips below, then send one consolidated reminder."
                  : `${selectedIds.length} selected · ₹${selectedDueTotal.toLocaleString("en-IN")}`}
              </Text>
            </View>
            <View style={styles.selectActionsRow}>
              <Pressable
                onPress={selectAllDueSameFleet}
                style={[
                  styles.selectSecondaryBtn,
                  {
                    borderColor: Theme.driverEmeraldBorderSoft,
                    backgroundColor: isDark ? colors.surface : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.selectSecondaryBtnText, { color: colors.text }]}>
                  Select all
                </Text>
              </Pressable>
              <Pressable
                onPress={openBulkFollowUp}
                disabled={selectedIds.length === 0}
                style={[
                  styles.selectPrimaryBtn,
                  {
                    backgroundColor:
                      selectedIds.length === 0
                        ? isDark
                          ? colors.surfaceElevated
                          : Theme.surfaceGray
                        : colors.emerald,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.selectPrimaryBtnText,
                    {
                      color:
                        selectedIds.length === 0 ? colors.textMuted : Theme.textOnPrimary,
                    },
                  ]}
                >
                  {selectedIds.length === 0
                    ? "Send reminder"
                    : `Send reminder · ${selectedIds.length}`}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {selectHint ? (
          <Text style={[styles.selectHint, { color: Theme.warning }]}>{selectHint}</Text>
        ) : null}
      </View>

      {/* Day breakdown header */}
      <View style={styles.daysHeader}>
        <View style={[styles.daysDot, { backgroundColor: colors.emerald }]} />
        <Text style={[styles.daysTitle, { color: colors.textMuted }]}>Daily breakdown</Text>
      </View>

      {displayDayBuckets.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            {
              backgroundColor: colors.surface,
              borderColor: cardBorder,
              shadowColor: cardShadow,
            },
          ]}
        >
          <View
            style={[
              styles.emptyIconWrap,
              {
                backgroundColor: isDark ? "rgba(4,120,87,0.14)" : Theme.driverEmeraldMuted,
              },
            ]}
          >
            <CalendarDays size={22} color={colors.emerald} strokeWidth={2.2} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {dueOnly || selectMode ? "No due trips" : "No earnings yet"}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {dueOnly || selectMode
              ? "Nothing pending to request for this period."
              : `Completed trips in ${formatMonthLabel(monthKey)} will show here.`}
          </Text>
        </View>
      ) : (
        <View style={styles.dayList}>
          {displayDayBuckets.map((day, index) => {
            const expanded = expandedDayKey === day.dayKey || selectMode;
            const isLast = index === displayDayBuckets.length - 1;
            return (
              <View key={day.dayKey} style={styles.timelineItem}>
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.timelineDayBadge,
                      {
                        backgroundColor: isDark
                          ? "rgba(4,120,87,0.22)"
                          : Theme.driverEmeraldMuted,
                        borderColor: isDark
                          ? "rgba(4,120,87,0.4)"
                          : Theme.driverEmeraldBorderSoft,
                      },
                    ]}
                  >
                    <Text style={[styles.timelineDayNum, { color: colors.emerald }]}>
                      {formatDayNum(day.dayKey)}
                    </Text>
                  </View>
                  {!isLast ? (
                    <View
                      style={[
                        styles.timelineLine,
                        {
                          backgroundColor: isDark
                            ? "rgba(4,120,87,0.28)"
                            : "rgba(4,120,87,0.18)",
                        },
                      ]}
                    />
                  ) : null}
                </View>

                <View
                  style={[
                    styles.dayCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: expanded
                        ? Theme.driverEmeraldBorderSoft
                        : cardBorder,
                      shadowColor: cardShadow,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() =>
                      setExpandedDayKey((cur) => (cur === day.dayKey ? null : day.dayKey))
                    }
                    style={({ pressed }) => [
                      styles.dayRow,
                      pressed && { opacity: 0.92 },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${day.label}, ${day.tripCount} trips`}
                  >
                    <View style={styles.dayLeft}>
                      <Text style={[styles.dayLabel, { color: colors.text }]}>{day.label}</Text>
                      <Text style={[styles.dayMeta, { color: colors.textMuted }]}>
                        {day.tripCount} trip{day.tripCount === 1 ? "" : "s"}
                      </Text>
                    </View>
                    {showMonthPnl ? (
                      <View style={styles.daySpendMid} accessibilityLabel={`Spend ₹${day.spent}`}>
                        <Text style={[styles.daySpendLabel, { color: colors.textMuted }]}>Spend</Text>
                        <Text
                          style={[styles.daySpendValue, { color: Theme.driverGold }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                        >
                          ₹{day.spent.toLocaleString("en-IN")}
                        </Text>
                      </View>
                    ) : null}
                    <View style={styles.dayRight}>
                      <Text style={[styles.dayEarned, { color: colors.text }]}>
                        ₹{day.earned.toLocaleString("en-IN")}
                      </Text>
                      {day.earned - day.received > 0 ? (
                        <Text style={[styles.dayReceived, { color: Theme.warning }]}>
                          Due ₹{Math.max(0, day.earned - day.received).toLocaleString("en-IN")}
                        </Text>
                      ) : (
                        <Text style={[styles.dayReceived, { color: colors.emerald }]}>
                          Received ₹{day.received.toLocaleString("en-IN")}
                        </Text>
                      )}
                    </View>
                    {expanded ? (
                      <ChevronUp size={16} color={colors.textMuted} strokeWidth={2.2} />
                    ) : (
                      <ChevronDown size={16} color={colors.textMuted} strokeWidth={2.2} />
                    )}
                  </Pressable>

                  {expanded ? (
                    <View
                      style={[
                        styles.dayTripList,
                        {
                          borderTopColor: isDark ? colors.borderSubtle : "rgba(226,232,240,0.95)",
                          backgroundColor: isDark
                            ? "rgba(15,23,42,0.35)"
                            : "rgba(248,250,252,0.92)",
                        },
                      ]}
                    >
                      {day.trips.map((line) => {
                        const isPending = line.pending > 0;
                        const lineCooldown = reminderCooldown(line.meta.lastReminderAt);
                        const tripId = String(line.id);
                        const isSelected = selectedIds.includes(tripId);
                        const canSelect = isPending && !lineCooldown.blocked;
                        const ends = routeEnds(line.route, line.meta.from, line.meta.to);
                        const tripLabel = line.meta.displayId?.trim() || "Trip";
                        const fleetLabel = line.meta.fleetName?.trim() || "Fleet";
                        return (
                          <Pressable
                            key={tripId}
                            onPress={() => {
                              if (!selectMode) return;
                              if (!canSelect) {
                                setSelectHint(
                                  lineCooldown.blocked
                                    ? "Reminder already sent for this trip (24h lock)."
                                    : "Only due trips can be selected.",
                                );
                                return;
                              }
                              toggleSelected(line);
                            }}
                            accessibilityRole={selectMode ? "checkbox" : "none"}
                            accessibilityState={
                              selectMode ? { checked: isSelected, disabled: !canSelect } : undefined
                            }
                            style={({ pressed }) => [
                              styles.dayTripRowWrap,
                              {
                                backgroundColor: isSelected
                                  ? isDark
                                    ? "rgba(4,120,87,0.16)"
                                    : Theme.driverEmeraldMuted
                                  : colors.surface,
                                borderColor: isSelected
                                  ? Theme.driverEmeraldBorder
                                  : isPending
                                    ? isDark
                                      ? "rgba(251,191,36,0.35)"
                                      : "rgba(245,158,11,0.28)"
                                    : cardBorder,
                                opacity: selectMode && !canSelect ? 0.55 : pressed ? 0.92 : 1,
                              },
                            ]}
                          >
                            <View style={styles.dayTripHead}>
                              {selectMode ? (
                                isSelected ? (
                                  <CheckSquare
                                    size={22}
                                    color={colors.emerald}
                                    strokeWidth={2.4}
                                  />
                                ) : (
                                  <Square
                                    size={22}
                                    color={canSelect ? colors.textMuted : colors.border}
                                    strokeWidth={2.2}
                                  />
                                )
                              ) : (
                                <View
                                  style={[
                                    styles.dayTripIcon,
                                    {
                                      backgroundColor: isPending
                                        ? isDark
                                          ? "rgba(245,158,11,0.16)"
                                          : "rgba(254,243,199,0.95)"
                                        : isDark
                                          ? "rgba(4,120,87,0.16)"
                                          : Theme.driverEmeraldMuted,
                                    },
                                  ]}
                                >
                                  <Route
                                    size={14}
                                    color={isPending ? Theme.warning : colors.emerald}
                                    strokeWidth={2.3}
                                  />
                                </View>
                              )}
                              <View style={styles.dayTripHeadText}>
                                <Text
                                  style={[styles.dayTripId, { color: colors.text }]}
                                  numberOfLines={1}
                                >
                                  {tripLabel}
                                </Text>
                                <Text
                                  style={[styles.dayTripFleet, { color: colors.textMuted }]}
                                  numberOfLines={1}
                                >
                                  {fleetLabel}
                                </Text>
                              </View>
                              {line.needsTag ? (
                                <Pressable
                                  onPress={(event) => {
                                    event?.stopPropagation?.();
                                    const trip = scopedTrips.find(
                                      (row) => String(row.id) === tripId,
                                    );
                                    if (trip) setTagTrip(trip);
                                  }}
                                  hitSlop={10}
                                  accessibilityRole="button"
                                  accessibilityLabel="Tag party"
                                  style={({ pressed }) => [
                                    styles.tagChip,
                                    {
                                      backgroundColor: Theme.driverEmeraldMuted,
                                      borderColor: Theme.driverEmeraldBorder,
                                      opacity: pressed ? 0.85 : 1,
                                    },
                                  ]}
                                >
                                  <Tag size={10} color={colors.emerald} strokeWidth={2.4} />
                                  <Text style={[styles.tagChipText, { color: colors.emerald }]}>
                                    Tag
                                  </Text>
                                </Pressable>
                              ) : null}
                              <View
                                style={[
                                  styles.dayTripStatus,
                                  {
                                    backgroundColor: isPending
                                      ? isDark
                                        ? "rgba(245,158,11,0.16)"
                                        : "rgba(255,247,237,0.95)"
                                      : isDark
                                        ? "rgba(4,120,87,0.16)"
                                        : Theme.driverEmeraldMuted,
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.dayTripStatusText,
                                    { color: isPending ? Theme.warning : colors.emerald },
                                  ]}
                                >
                                  {isPending ? "Due" : "Settled"}
                                </Text>
                              </View>
                            </View>

                            {"from" in ends ? (
                              <View style={styles.dayTripRouteBlock}>
                                <Text
                                  style={[styles.dayTripPlace, { color: colors.text }]}
                                  numberOfLines={2}
                                >
                                  {ends.from}
                                </Text>
                                <ArrowRight
                                  size={12}
                                  color={colors.textMuted}
                                  strokeWidth={2.2}
                                  style={styles.dayTripArrow}
                                />
                                <Text
                                  style={[styles.dayTripPlace, { color: colors.text }]}
                                  numberOfLines={2}
                                >
                                  {ends.to}
                                </Text>
                              </View>
                            ) : (
                              <Text
                                style={[styles.dayTripPlace, styles.dayTripPlaceSingle, { color: colors.text }]}
                                numberOfLines={2}
                              >
                                {ends.single}
                              </Text>
                            )}

                            <View
                              style={[
                                styles.dayTripStats,
                                {
                                  backgroundColor: isDark
                                    ? "rgba(15,23,42,0.35)"
                                    : "rgba(248,250,252,0.95)",
                                  borderColor: isDark ? colors.borderSubtle : "rgba(226,232,240,0.95)",
                                },
                              ]}
                            >
                              <View style={styles.dayTripStat}>
                                <Text style={[styles.dayTripStatLabel, { color: colors.textMuted }]}>
                                  Earned
                                </Text>
                                <Text style={[styles.dayTripStatValue, { color: colors.text }]}>
                                  ₹{line.earned.toLocaleString("en-IN")}
                                </Text>
                              </View>
                              {showMonthPnl ? (
                                <>
                                  <View
                                    style={[
                                      styles.dayTripStatRule,
                                      { backgroundColor: isDark ? colors.borderSubtle : Theme.borderLight },
                                    ]}
                                  />
                                  <View style={styles.dayTripStat}>
                                    <Text style={[styles.dayTripStatLabel, { color: colors.textMuted }]}>
                                      Spend
                                    </Text>
                                    <Text
                                      style={[styles.dayTripStatValue, { color: Theme.driverGold }]}
                                      numberOfLines={1}
                                    >
                                      ₹{line.spent.toLocaleString("en-IN")}
                                    </Text>
                                  </View>
                                </>
                              ) : null}
                              <View
                                style={[
                                  styles.dayTripStatRule,
                                  { backgroundColor: isDark ? colors.borderSubtle : Theme.borderLight },
                                ]}
                              />
                              <View style={styles.dayTripStat}>
                                <Text style={[styles.dayTripStatLabel, { color: colors.textMuted }]}>
                                  Received
                                </Text>
                                <Text
                                  style={[
                                    styles.dayTripStatValue,
                                    { color: line.received > 0 ? colors.emerald : colors.textMuted },
                                  ]}
                                >
                                  ₹{line.received.toLocaleString("en-IN")}
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.dayTripStatRule,
                                  { backgroundColor: isDark ? colors.borderSubtle : Theme.borderLight },
                                ]}
                              />
                              <View style={styles.dayTripStat}>
                                <Text style={[styles.dayTripStatLabel, { color: colors.textMuted }]}>
                                  Due
                                </Text>
                                <Text
                                  style={[
                                    styles.dayTripStatValue,
                                    { color: isPending ? Theme.warning : colors.textMuted },
                                  ]}
                                >
                                  ₹{line.pending.toLocaleString("en-IN")}
                                </Text>
                              </View>
                            </View>
                            {isPending && !selectMode ? (
                              <View style={styles.dayTripActions}>
                                <DriverCapturePaymentButton
                                  tripId={line.id}
                                  due={line.pending}
                                  lane="fleet"
                                  partyName={line.meta.fleetName}
                                  block
                                />
                                <Pressable
                                  onPress={() => openFollowUp(line)}
                                  style={({ pressed }) => [
                                    styles.followUpBtn,
                                    {
                                      backgroundColor: isDark
                                        ? "rgba(4,120,87,0.18)"
                                        : Theme.driverEmeraldMuted,
                                      borderColor: isDark
                                        ? "rgba(4,120,87,0.35)"
                                        : Theme.driverEmeraldBorderSoft,
                                      opacity: pressed ? 0.88 : 1,
                                    },
                                  ]}
                                  accessibilityRole="button"
                                  accessibilityLabel="Follow up and request payment"
                                >
                                  <Bell size={14} color={colors.emerald} strokeWidth={2.4} />
                                  <Text style={[styles.followUpBtnText, { color: colors.emerald }]}>
                                    {lineCooldown.blocked
                                      ? "View reminder"
                                      : line.meta.lastReminderAt
                                        ? "Follow up"
                                        : "Request"}
                                  </Text>
                                </Pressable>
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {selectMode && selectedIds.length > 0 ? (
        <View
          style={[
            styles.bulkCtaCard,
            {
              backgroundColor: isDark ? colors.surfaceElevated : "#ffffff",
              borderColor: Theme.driverEmeraldBorderSoft,
              shadowColor: isDark ? "#000" : "rgba(15,23,42,0.12)",
              marginBottom: 88,
            },
          ]}
        >
          <Text style={[styles.bulkCtaTitle, { color: colors.text }]}>
            Ready to request payment
          </Text>
          <Text style={[styles.bulkCtaSub, { color: colors.textMuted }]}>
            {selectedIds.length} trip{selectedIds.length === 1 ? "" : "s"} · ₹
            {selectedDueTotal.toLocaleString("en-IN")} · one consolidated Pulse reminder + PDF
          </Text>
          <Pressable
            onPress={openBulkFollowUp}
            style={[styles.bulkCtaBtn, { backgroundColor: colors.emerald }]}
          >
            <Text style={styles.bulkCtaBtnText}>Review & send consolidated request</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={previewOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeFollowUp}
        statusBarTranslucent
      >
        <View style={styles.fullPageRoot}>
          <View
            style={[
              styles.fullPage,
              {
                backgroundColor: isDark ? colors.background : Theme.screenBackground,
                paddingTop: insets.top + 8,
              },
            ]}
          >
          <View style={styles.fullPageHeader}>
            <View style={styles.sheetHeaderText}>
              <Text style={[styles.sheetEyebrow, { color: colors.emerald }]}>
                Payment request · document
              </Text>
              <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={1}>
                {isBulkPreview
                  ? `Request · ${bulkLines?.length ?? 0} trips`
                  : "Payment request"}
              </Text>
              <Text style={[styles.sheetSub, { color: colors.textMuted }]} numberOfLines={1}>
                {isBulkPreview
                  ? `${bulkLines?.[0]?.meta.fleetName ?? "Fleet"} · ₹${(
                      bulkLines ?? []
                    )
                      .reduce((s, t) => s + t.pending, 0)
                      .toLocaleString("en-IN")}`
                  : `${followUp?.meta.displayId} · ${followUp?.meta.fleetName}`}
              </Text>
            </View>
            <Pressable
              onPress={closeFollowUp}
              style={[
                styles.sheetClose,
                {
                  backgroundColor: isDark ? colors.surfaceElevated : Theme.surfaceGray,
                },
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close payment request"
            >
              <X size={16} color={colors.textMuted} strokeWidth={2.3} />
            </Pressable>
          </View>

          <Text style={[styles.docPreviewHint, { color: colors.textMuted }]}>
            Pinch to zoom · share PDF anytime
          </Text>

          <View
            style={[
              styles.fullPagePreview,
              {
                borderColor: cardBorder,
                backgroundColor: isDark ? "#0b1220" : Theme.surfaceGray,
              },
            ]}
          >
            {Platform.OS === "web" ? (
              <ScrollView
                contentContainerStyle={styles.webPreviewPad}
                maximumZoomScale={4}
                minimumZoomScale={1}
                bouncesZoom
              >
                <Text style={[styles.webPreviewTitle, { color: colors.text }]}>
                  Payment request
                </Text>
                <Text style={[styles.webPreviewAmount, { color: Theme.warning }]}>
                  ₹
                  {(isBulkPreview
                    ? (bulkLines ?? []).reduce((s, t) => s + t.pending, 0)
                    : followUp
                      ? followUp.pending > 0
                        ? followUp.pending
                        : followUp.earned
                      : 0
                  ).toLocaleString("en-IN")}
                </Text>
                <Text style={[styles.webPreviewBody, { color: colors.textMuted }]}>
                  {isBulkPreview
                    ? `${bulkLines?.length ?? 0} trips · ${bulkLines?.[0]?.meta.fleetName ?? "Fleet"}`
                    : `Bill to: ${followUp?.meta.fleetName ?? "—"}`}
                  {"\n"}
                  Share as PDF to send this payment request to the business.
                </Text>
              </ScrollView>
            ) : (
              <NativeHtmlWebView
                html={activePreviewHtml}
                docPreview
                style={styles.htmlWebView}
              />
            )}
          </View>

          {pulseError ? <Text style={styles.pulseErrorText}>{pulseError}</Text> : null}
          {pulseAlreadySentRecently && cooldown.label ? (
            <Text style={[styles.cooldownHint, { color: colors.textMuted }]}>
              Pulse reminder already sent. {cooldown.label}.
            </Text>
          ) : null}

          <View
            style={[
              styles.fullPageActions,
              { paddingBottom: Math.max(insets.bottom, 14) + 6 },
            ]}
          >
            <Pressable
              onPress={() => void handleSendPulse()}
              disabled={isPulseBusy || pulseAlreadySentRecently}
              style={({ pressed }) => [
                styles.pulseActionBtn,
                {
                  backgroundColor: pulseAlreadySentRecently
                    ? isDark
                      ? colors.surfaceElevated
                      : Theme.surfaceGray
                    : colors.emerald,
                  opacity: pressed || isPulseBusy ? 0.88 : 1,
                },
              ]}
            >
              {isPulseBusy ? (
                <ActivityIndicator
                  size="small"
                  color={
                    pulseAlreadySentRecently ? colors.textMuted : Theme.textOnPrimary
                  }
                />
              ) : (
                <Bell
                  size={15}
                  color={
                    pulseAlreadySentRecently ? colors.textMuted : Theme.textOnPrimary
                  }
                  strokeWidth={2.4}
                />
              )}
              <Text
                style={[
                  styles.pulseActionText,
                  pulseAlreadySentRecently && { color: colors.textMuted },
                ]}
              >
                {pulseAlreadySentRecently
                  ? "Reminder locked · 24h"
                  : "Send Pulse reminder"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => void handleSharePdf()}
              disabled={isPdfBusy}
              style={({ pressed }) => [
                styles.waActionBtn,
                {
                  borderColor: isDark
                    ? "rgba(37,211,102,0.35)"
                    : "rgba(37,211,102,0.4)",
                  backgroundColor: isDark
                    ? "rgba(37,211,102,0.12)"
                    : "rgba(220,252,231,0.85)",
                  opacity: pressed || isPdfBusy ? 0.88 : 1,
                },
              ]}
            >
              {isPdfBusy ? (
                <ActivityIndicator size="small" color="#128C7E" />
              ) : (
                <MessageCircle size={15} color="#128C7E" strokeWidth={2.4} />
              )}
              <Text style={styles.waActionText}>Share payment request PDF</Text>
            </Pressable>
            <Text style={[styles.shareHint, { color: colors.textMuted }]}>
              {pulseAlreadySentRecently
                ? "Pulse in-app reminder is locked for 24h — you can still send this payment request PDF to the business."
                : "Opens the share sheet — pick WhatsApp or email to send the payment request to the business."}
            </Text>
          </View>
        </View>

        {showSentConfirm ? (
          <Pressable
            style={styles.confirmBackdrop}
            onPress={() => setShowSentConfirm(false)}
          >
            <Pressable
              style={[
                styles.confirmCard,
                {
                  backgroundColor: isDark ? colors.surfaceElevated : "#ffffff",
                  borderColor: cardBorder,
                },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <View
                style={[
                  styles.confirmIconWrap,
                  {
                    backgroundColor: isDark
                      ? "rgba(16,185,129,0.16)"
                      : Theme.driverEmeraldMuted,
                  },
                ]}
              >
                <Bell size={22} color={colors.emerald} strokeWidth={2.3} />
              </View>
              <Text style={[styles.confirmTitle, { color: colors.text }]}>
                Reminder sent
              </Text>
              <Text style={[styles.confirmBody, { color: colors.textMuted }]}>
                Your fleet / shipper was reminded in Pulse. You can send another Pulse
                reminder after 24 hours. Share the PDF to WhatsApp anytime.
              </Text>
              <Pressable
                onPress={() => {
                  setShowSentConfirm(false);
                  if (isBulkPreview) {
                    setSelectMode(false);
                    setSelectedIds([]);
                  }
                }}
                style={[styles.confirmBtn, { backgroundColor: colors.emerald }]}
              >
                <Text style={styles.confirmBtnText}>OK</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        ) : null}
        </View>
      </Modal>
      {tagTrip ? (
        <DriverCollectFromSheet
          visible
          trip={tagTrip}
          due={0}
          assignerName={tripMeta(tagTrip).fleetName}
          onClose={() => setTagTrip(null)}
          onTagged={() => setTagTrip(null)}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    paddingTop: 8,
    paddingBottom: 28,
    gap: 10,
  },
  monthCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  monthNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  monthNavDisabled: {
    opacity: 0.38,
  },
  monthCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 6,
  },
  monthEyebrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  monthEyebrowText: {
    ...driverUISemiBold,
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  monthLabel: {
    ...driverUIExtraBold,
    fontSize: 15,
    letterSpacing: -0.2,
    textAlign: "center",
    lineHeight: 18,
  },
  monthHint: {
    ...driverBodySecondary,
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
  },
  fleetChipScroll: {
    flexGrow: 0,
    marginHorizontal: -2,
  },
  fleetChipRow: {
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  fleetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 38,
    maxWidth: 200,
  },
  fleetChipActive: {
    ...Platform.select({
      ios: {
        shadowColor: Theme.driverEmerald,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  fleetChipText: {
    ...driverUISemiBold,
    fontSize: 12,
  },
  toolsSection: {
    gap: 8,
    marginTop: 2,
  },
  toolsLabel: {
    ...driverUISemiBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    paddingLeft: 2,
  },
  toolsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  toolChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 44,
  },
  toolChipGrow: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
  },
  toolChipText: {
    ...driverUISemiBold,
    fontSize: 13,
  },
  selectActionsCol: {
    gap: 8,
  },
  selectActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectSecondaryBtn: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  selectSecondaryBtnText: {
    ...driverUIBold,
    fontSize: 13,
  },
  selectPrimaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  selectPrimaryBtnText: {
    ...driverUIBold,
    fontSize: 13,
  },
  selectBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectBannerText: {
    ...driverUISemiBold,
    fontSize: 12,
    flex: 1,
    minWidth: 0,
  },
  selectHint: {
    ...driverUISemiBold,
    fontSize: 11,
    paddingHorizontal: 2,
  },
  toolChipPrimary: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: "center",
  },
  toolChipPrimaryText: {
    ...driverUIBold,
    fontSize: 12,
    color: Theme.textOnPrimary,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  bulkCtaCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  bulkCtaTitle: {
    ...driverUIExtraBold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  bulkCtaSub: {
    ...driverBodySecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  bulkCtaBtn: {
    marginTop: 4,
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  bulkCtaBtnText: {
    ...driverUIBold,
    fontSize: 14,
    color: Theme.textOnPrimary,
  },
  heroCard: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 18,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: {
    fontFamily: DriverFontFamily.semiBold,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: "rgba(236,253,245,0.95)",
  },
  heroTripCount: {
    fontFamily: DriverFontFamily.medium,
    fontSize: 11,
    color: "rgba(167,243,208,0.85)",
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 2,
  },
  heroRupee: {
    fontFamily: DriverFontFamily.bold,
    fontSize: 22,
    color: "rgba(255,255,255,0.88)",
    marginTop: 8,
  },
  heroAmount: {
    fontFamily: DriverFontFamily.extraBold,
    fontSize: 36,
    letterSpacing: -1,
    color: "#ffffff",
    lineHeight: 42,
    flexShrink: 1,
  },
  progressPairRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 2,
  },
  progressPairCol: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(167,243,208,0.95)",
  },
  progressCaption: {
    fontFamily: DriverFontFamily.medium,
    fontSize: 10,
    lineHeight: 13,
    color: "rgba(167,243,208,0.85)",
  },
  progressCaptionEnd: {
    textAlign: "right",
  },
  heroMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  heroMetric: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    minWidth: 0,
    paddingHorizontal: 2,
  },
  heroMetricDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.22)",
    marginVertical: 2,
  },
  heroMetricLabel: {
    fontFamily: DriverFontFamily.semiBold,
    fontSize: 9,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    color: "rgba(167,243,208,0.8)",
    textAlign: "center",
  },
  heroMetricValue: {
    fontFamily: DriverFontFamily.bold,
    fontSize: 13,
    letterSpacing: -0.2,
    color: "#ffffff",
    textAlign: "center",
    width: "100%",
  },
  pnlBarTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
    flexDirection: "row",
  },
  pnlBarSpent: {
    height: "100%",
    backgroundColor: Theme.driverGold,
    minWidth: 4,
  },
  pnlBarKeep: {
    height: "100%",
    backgroundColor: "rgba(167,243,208,0.92)",
    minWidth: 4,
  },
  pnlSpentValue: {
    color: Theme.driverGold,
  },
  pnlLossValue: {
    color: Theme.warningMuted,
  },
  daysHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    paddingLeft: 2,
  },
  daysDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  daysTitle: {
    ...driverUIBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 8,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  emptyIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    ...driverUIBold,
    fontSize: 15,
  },
  emptyText: {
    ...driverBodySecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  dayList: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
  },
  timelineRail: {
    width: 36,
    alignItems: "center",
  },
  timelineDayBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  timelineDayNum: {
    ...driverUIBold,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  timelineLine: {
    flex: 1,
    width: 2,
    borderRadius: 1,
    marginTop: 4,
    marginBottom: 2,
    minHeight: 12,
  },
  dayCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 56,
  },
  dayLeft: {
    flex: 1.35,
    minWidth: 0,
    gap: 2,
  },
  dayLabel: {
    ...driverUIBold,
    fontSize: 14,
  },
  dayMeta: {
    ...driverBodySecondary,
    fontSize: 11,
  },
  daySpendMid: {
    flex: 0.9,
    minWidth: 56,
    maxWidth: 88,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: 4,
  },
  daySpendLabel: {
    ...driverUISemiBold,
    fontSize: 8,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  daySpendValue: {
    ...driverUIBold,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.2,
  },
  dayRight: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: 2,
  },
  dayEarned: {
    ...driverUIBold,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  dayReceived: {
    ...driverUISemiBold,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  dayTripList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  dayTripRowWrap: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },
  dayTripHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dayTripHeadText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  dayTripId: {
    ...driverUIBold,
    fontSize: 13,
    letterSpacing: -0.2,
  },
  dayTripFleet: {
    ...driverBodySecondary,
    fontSize: 11,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 28,
    minWidth: 44,
    flexShrink: 0,
    zIndex: 2,
  },
  tagChipText: {
    ...driverUIBold,
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  dayTripStatus: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dayTripStatusText: {
    ...driverUIBold,
    fontSize: 10,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  dayTripIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dayTripRouteBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  dayTripPlace: {
    ...driverUISemiBold,
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
  },
  dayTripPlaceSingle: {
    paddingRight: 4,
  },
  dayTripArrow: {
    marginTop: 2,
  },
  dayTripStats: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  dayTripStat: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4,
  },
  dayTripStatRule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
  },
  dayTripStatLabel: {
    ...driverUISemiBold,
    fontSize: 9,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  dayTripStatValue: {
    ...driverUIBold,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.2,
  },
  dayTripActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  followUpBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  followUpBtnText: {
    ...driverUIBold,
    fontSize: 13,
  },
  fullPage: {
    flex: 1,
    paddingHorizontal: 12,
    gap: 6,
  },
  fullPageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 2,
    paddingBottom: 0,
  },
  sheetHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  sheetEyebrow: {
    ...driverUISemiBold,
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  sheetTitle: {
    ...driverUIExtraBold,
    fontSize: 15,
    letterSpacing: -0.25,
    lineHeight: 19,
  },
  sheetSub: {
    ...driverBodySecondary,
    fontSize: 11,
    lineHeight: 14,
  },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  docPreviewHint: {
    ...driverBodySecondary,
    fontSize: 10,
    textAlign: "center",
    paddingHorizontal: 6,
    lineHeight: 13,
  },
  fullPagePreview: {
    flex: 1,
    minHeight: 240,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  htmlWebView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webPreviewPad: {
    padding: 14,
    gap: 8,
  },
  webPreviewTitle: {
    ...driverUIBold,
    fontSize: 13,
  },
  webPreviewAmount: {
    ...driverUIExtraBold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  webPreviewBody: {
    ...driverBodySecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  pulseErrorText: {
    ...driverUISemiBold,
    fontSize: 11,
    color: Theme.negative,
    paddingHorizontal: 2,
  },
  cooldownHint: {
    ...driverUISemiBold,
    fontSize: 11,
    paddingHorizontal: 2,
    lineHeight: 14,
  },
  fullPageActions: {
    gap: 7,
    paddingTop: 2,
  },
  pulseActionBtn: {
    minHeight: 42,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
  },
  pulseActionText: {
    ...driverUIBold,
    fontSize: 13,
    color: Theme.textOnPrimary,
  },
  waActionBtn: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
  },
  waActionText: {
    ...driverUIBold,
    fontSize: 13,
    color: "#128C7E",
  },
  shareHint: {
    ...driverBodySecondary,
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  confirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "rgba(15,23,42,0.48)",
    zIndex: 20,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: "center",
    gap: 10,
  },
  confirmIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmTitle: {
    ...driverUIExtraBold,
    fontSize: 18,
    letterSpacing: -0.3,
    textAlign: "center",
  },
  confirmBody: {
    ...driverBodySecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  confirmBtn: {
    marginTop: 4,
    minHeight: 44,
    minWidth: 120,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  confirmBtnText: {
    ...driverUIBold,
    fontSize: 14,
    color: Theme.textOnPrimary,
  },
});
