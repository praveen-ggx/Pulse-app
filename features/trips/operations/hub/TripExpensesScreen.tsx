import Feather from "@expo/vector-icons/Feather";
import { useFocusEffect } from "@react-navigation/native";
import type { ComponentProps, ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Theme from "@/constants/Theme";
import Layout from "@/constants/Layout";
import { useAuth } from "@/contexts/AuthContext";
import type { TripRow } from "@/features/trips/services/trips.service";
import { shouldBackfillPostedExpensesToLedger } from "@/features/trips/components/trip-detail/completedTripInitialLoad.util";
import {
  useCancelDriverExpenseRequest,
  useRemindDriverExpenseRequest,
  useReviewTripFuelEntry,
  useReviewTripOtherExpenseEntry,
  useReviewTripTollEntry,
  useSetTripFuelReimbursementState,
  useSetTripOtherReimbursementState,
  useSetTripTollReimbursementState,
  useTripOperationsSummary,
} from "../queries/useTripOperations";
import { useTripOperationsSync } from "../hooks/useTripOperationsSync";
import { isDriverVisibleCostEvent } from "../shared/driverReimbursementEvents.util";
import { formatOtherExpenseCategoryLabel } from "../shared/tripOtherExpenseCategories";
import { canEditTripCostEvent } from "../shared/expenseEntryEdit.util";
import { ExpensePreviewSheet } from "./ExpensePreviewSheet";
import { syncOperationalFinanceProjection } from "@/features/finance/projections";
import { syncPostedTripExpensesToOperationLedger } from "../vehicle/syncPostedExpensesToOperationLedger.service";
import type { TripCostEvent, TripCostCategory } from "@/features/finance";
import { formatIndianVehicleNumber } from "@/lib/format";
import { useMemberAccess } from "@/lib/useMemberAccess";

type ListFilter = "all" | "action";

type CategoryVisual = {
  initials: string;
  bg: string;
  fg: string;
  icon: ComponentProps<typeof Feather>["name"];
  rail: string;
};

function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function toCategoryLabel(event: TripCostEvent): string {
  if (event.id.startsWith("other:")) {
    return formatOtherExpenseCategoryLabel(event.category);
  }
  const raw = event.category;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function categoryVisual(category: TripCostCategory): CategoryVisual {
  switch (category) {
    case "fuel":
      return { initials: "FU", bg: "#dcfce7", fg: "#15803d", icon: "droplet", rail: "#22c55e" };
    case "toll":
    case "fastag":
      return { initials: "TL", bg: "#ede9fe", fg: "#6d28d9", icon: "map-pin", rail: "#8b5cf6" };
    case "loading":
    case "unloading":
      return { initials: "LD", bg: "#ffedd5", fg: "#c2410c", icon: "package", rail: "#f97316" };
    case "parking":
      return { initials: "PK", bg: "#e0f2fe", fg: "#0369a1", icon: "square", rail: "#0ea5e9" };
    default:
      return { initials: "EX", bg: "#f1f5f9", fg: "#475569", icon: "file-text", rail: "#94a3b8" };
  }
}

const QUICK_ACTION_STYLE: Record<
  string,
  { bg: string; fg: string; ring: string }
> = {
  fuel: { bg: "#ecfdf5", fg: "#15803d", ring: "#bbf7d0" },
  toll: { bg: "#f5f3ff", fg: "#6d28d9", ring: "#ddd6fe" },
  other: { bg: "#eef2ff", fg: Theme.primary, ring: "#c7d2fe" },
};

function canApproveAndPostToLedger(event: TripCostEvent): boolean {
  if (event.approvalState === "pending") return true;
  if (event.approvalState === "rejected") return true;
  if (event.approvalState === "approved" && event.postingState !== "posted") return true;
  return false;
}

function approveAndPostButtonLabel(event: TripCostEvent): string {
  if (event.approvalState === "pending") return "Approve & post";
  if (event.approvalState === "rejected") return "Re-approve & post";
  return "Post to ledger";
}

type StatusTone = "good" | "pending" | "bad" | "settled";

function statusTone(event: TripCostEvent): StatusTone {
  if (event.approvalState === "rejected" || event.postingState === "failed") return "bad";
  if (canApproveAndPostToLedger(event)) return "pending";
  if (
    event.reimbursable &&
    event.approvalState === "approved" &&
    event.settlementState !== "settled"
  ) {
    return "pending";
  }
  if (event.settlementState === "settled") return "settled";
  return "good";
}

function eventStatusLabel(event: TripCostEvent): string {
  if (event.approvalState === "pending") return "Awaiting approval";
  if (event.approvalState === "rejected") return "Rejected";
  if (event.postingState !== "posted") return "Approved · not posted";
  if (
    event.reimbursable &&
    event.approvalState === "approved" &&
    event.settlementState !== "settled"
  ) {
    return "Posted · pay driver";
  }
  if (event.settlementState === "settled") return "Reimbursed";
  return "On ledger";
}

function formatReimbursedHint(event: TripCostEvent): string | null {
  if (!event.reimbursable) return null;
  if (event.settlementState === "settled") {
    const when = event.reimbursedAt
      ? new Date(event.reimbursedAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        })
      : null;
    return when
      ? `Marked reimbursed ${when} · cash payout is separate`
      : "Marked reimbursed · record driver payment in Finance";
  }
  if (event.postingState === "posted") {
    return "Trip cost on ledger · reimburse driver via Finance payment";
  }
  return "Driver paid · reimbursable";
}

export type TripDriverCashPayoutRow = {
  id: string;
  dateLabel: string;
  amount: number;
  description?: string | null;
};

function needsDriverPendingAction(event: TripCostEvent): boolean {
  return (
    event.incurredBy === "driver" &&
    event.reimbursable &&
    event.approvalState === "pending" &&
    event.postingState !== "posted"
  );
}

function isDriverReimbursementEvent(event: TripCostEvent): boolean {
  return isDriverVisibleCostEvent(event);
}

function driverEventStatusLabel(event: TripCostEvent): string {
  if (event.expenseContext === "dco") return "Recorded · your trip cost";
  if (event.expenseContext === "personal") return "Recorded · for your reference";
  if (event.approvalState === "pending") return "Awaiting fleet approval";
  if (event.approvalState === "rejected") return "Rejected by fleet";
  if (event.settlementState === "settled") return "Reimbursed";
  // settlementState is narrowed to non-"settled" here (guarded above)
  if (event.approvalState === "approved") {
    return "Approved · payout pending";
  }
  return eventStatusLabel(event);
}

function driverReimbursementHint(event: TripCostEvent): string | null {
  if (event.expenseContext === "dco") return "Counts in your trip earnings · no approval needed";
  if (event.expenseContext === "personal") {
    return "No employer on this trip · not sent to any fleet";
  }
  if (event.approvalState === "pending") {
    return "Submitted for fleet reimbursement";
  }
  if (event.approvalState === "rejected") {
    return event.rejectionReason ? `Reason: ${event.rejectionReason}` : "Fleet rejected this request";
  }
  if (event.settlementState === "settled") return "Fleet marked this reimbursed";
  // settlementState is narrowed to non-"settled" here (guarded above)
  if (event.approvalState === "approved") {
    return "Approved by fleet · payout pending";
  }
  return formatReimbursedHint(event);
}

function needsUserAction(event: TripCostEvent): boolean {
  if (canApproveAndPostToLedger(event)) return true;
  return (
    event.reimbursable &&
    event.approvalState === "approved" &&
    event.settlementState !== "settled"
  );
}

function StatusChip({
  event,
  isDriverViewer = false,
  comfortable = false,
}: {
  event: TripCostEvent;
  isDriverViewer?: boolean;
  comfortable?: boolean;
}) {
  const tone = statusTone(event);
  const chipStyle =
    tone === "bad"
      ? styles.chipBad
      : tone === "pending"
        ? styles.chipPending
        : tone === "settled"
          ? styles.chipSettled
          : styles.chipGood;
  const dotStyle =
    tone === "bad"
      ? styles.chipDotBad
      : tone === "pending"
        ? styles.chipDotPending
        : tone === "settled"
          ? styles.chipDotSettled
          : styles.chipDotGood;

  return (
    <View style={[styles.chip, comfortable && styles.chipComfortable, chipStyle]}>
      <View style={[styles.chipDot, comfortable && styles.chipDotComfortable, dotStyle]} />
      <Text
        style={[
          styles.chipText,
          comfortable && styles.chipTextComfortable,
          tone === "settled" && styles.chipTextOnSolid,
        ]}
        numberOfLines={1}
      >
        {isDriverViewer ? driverEventStatusLabel(event) : eventStatusLabel(event)}
      </Text>
    </View>
  );
}

type ExpenseRowProps = {
  event: TripCostEvent;
  embedded: boolean;
  comfortable: boolean;
  iconMd: number;
  loadingAction: boolean;
  isDriverViewer: boolean;
  /** Omitted when the viewer lacks `finance.expenses.approve` — hides the approve action. */
  onApprove?: (event: TripCostEvent) => void;
  onReject: (event: TripCostEvent) => void;
  onMarkSettled: (event: TripCostEvent) => void;
  onCancelRequest: (event: TripCostEvent) => void;
  onRemindRequest: (event: TripCostEvent) => void;
  onEdit?: (event: TripCostEvent) => void;
  onPreview: (event: TripCostEvent) => void;
};

const ExpenseRow = memo(function ExpenseRow({
  event,
  embedded,
  comfortable,
  iconMd,
  loadingAction,
  isDriverViewer,
  onApprove,
  onReject,
  onMarkSettled,
  onCancelRequest,
  onRemindRequest,
  onEdit,
  onPreview,
}: ExpenseRowProps) {
  const visual = categoryVisual(event.category);
  const showFleetActions = !isDriverViewer && needsUserAction(event);
  const showDriverActions = isDriverViewer && needsDriverPendingAction(event);
  const showActions = showFleetActions || showDriverActions;
  const tone = statusTone(event);
  const hint = isDriverViewer ? driverReimbursementHint(event) : formatReimbursedHint(event);
  const editable = canEditTripCostEvent(event) && typeof onEdit === "function";

  return (
    <View
      style={[
        styles.row,
        embedded && styles.rowEmbedded,
        comfortable && styles.rowComfortable,
        showActions && styles.rowNeedsAction,
        { borderLeftColor: visual.rail, borderLeftWidth: comfortable ? 4 : 3 },
      ]}
    >
      <Pressable
        style={[styles.rowMain, comfortable && styles.rowMainComfortable]}
        onPress={() => onPreview(event)}
        accessibilityRole="button"
        accessibilityLabel={`View ${toCategoryLabel(event)} expense`}
      >
        <View
          style={[
            styles.rowAvatar,
            comfortable && styles.rowAvatarComfortable,
            { backgroundColor: visual.bg },
          ]}
        >
          <Feather name={visual.icon} size={iconMd} color={visual.fg} />
        </View>
        <View style={styles.rowBody}>
          <Text
            style={[styles.rowTitle, comfortable && styles.rowTitleComfortable]}
            numberOfLines={1}
          >
            {toCategoryLabel(event)}
          </Text>
          {hint ? (
            <Text
              style={[styles.rowHint, comfortable && styles.rowHintComfortable]}
              numberOfLines={2}
            >
              {hint}
            </Text>
          ) : null}
        </View>
        <View style={[styles.rowRight, comfortable && styles.rowRightComfortable]}>
          <Text
            style={[
              styles.rowAmount,
              comfortable && styles.rowAmountComfortable,
              tone === "settled" && styles.rowAmountSettled,
            ]}
          >
            {inr(event.amount)}
          </Text>
          <StatusChip
            event={event}
            isDriverViewer={isDriverViewer}
            comfortable={comfortable}
          />
          <Feather name="chevron-right" size={iconMd} color={Theme.textMuted} />
        </View>
      </Pressable>

      {editable ? (
        <Pressable
          style={({ pressed }) => [
            styles.rowEditLink,
            comfortable && styles.rowEditLinkComfortable,
            pressed && styles.editBtnPressed,
          ]}
          onPress={() => onEdit?.(event)}
          disabled={loadingAction}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${toCategoryLabel(event)}`}
        >
          <Feather name="edit-2" size={iconMd} color={Theme.primary} />
          <Text
            style={[
              styles.rowEditLinkText,
              comfortable && styles.rowEditLinkTextComfortable,
            ]}
          >
            Edit
          </Text>
        </Pressable>
      ) : null}

      {showActions ? (
        <View style={[styles.actions, comfortable && styles.actionsComfortable]}>
          {showDriverActions ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  comfortable && styles.actionBtnComfortable,
                  styles.actionBtnPrimary,
                  pressed && styles.actionBtnPressed,
                ]}
                onPress={() => void onRemindRequest(event)}
                disabled={loadingAction}
              >
                <Text
                  style={[
                    styles.actionBtnTextPrimary,
                    comfortable && styles.actionBtnTextComfortable,
                  ]}
                >
                  Remind fleet
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  comfortable && styles.actionBtnComfortable,
                  pressed && styles.actionBtnSecondaryPressed,
                ]}
                onPress={() => void onCancelRequest(event)}
                disabled={loadingAction}
              >
                <Text
                  style={[
                    styles.actionBtnText,
                    comfortable && styles.actionBtnTextComfortable,
                  ]}
                >
                  Cancel request
                </Text>
              </Pressable>
            </>
          ) : canApproveAndPostToLedger(event) && onApprove ? (
            <>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  comfortable && styles.actionBtnComfortable,
                  styles.actionBtnPrimary,
                  pressed && styles.actionBtnPressed,
                ]}
                onPress={() => void onApprove(event)}
                disabled={loadingAction}
              >
                <Text
                  style={[
                    styles.actionBtnTextPrimary,
                    comfortable && styles.actionBtnTextComfortable,
                  ]}
                >
                  {approveAndPostButtonLabel(event)}
                </Text>
              </Pressable>
              {event.approvalState === "pending" || event.approvalState === "rejected" ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.actionBtn,
                    comfortable && styles.actionBtnComfortable,
                    pressed && styles.actionBtnSecondaryPressed,
                  ]}
                  onPress={() => void onReject(event)}
                  disabled={loadingAction}
                >
                  <Text
                    style={[
                      styles.actionBtnText,
                      comfortable && styles.actionBtnTextComfortable,
                    ]}
                  >
                    Reject
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : event.reimbursable &&
            event.approvalState === "approved" &&
            event.settlementState !== "settled" ? (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                comfortable && styles.actionBtnComfortable,
                styles.actionBtnPrimary,
                styles.actionBtnFull,
                pressed && styles.actionBtnPressed,
              ]}
              onPress={() => void onMarkSettled(event)}
              disabled={loadingAction}
            >
              <Text
                style={[
                  styles.actionBtnTextPrimary,
                  comfortable && styles.actionBtnTextComfortable,
                ]}
              >
                Mark reimbursed
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

export function TripExpensesScreen({
  trip,
  onBack,
  embedded = false,
  density = "compact",
  layout = "stack",
  leadingSlot,
  onAddFuel,
  onAddToll,
  onAddOtherExpense,
  onEditExpense,
  initialPreviewEventId,
  driverCashPayouts = [],
  onRecordDriverPayment,
}: {
  trip: TripRow;
  onBack?: () => void;
  embedded?: boolean;
  /** Desktop trip detail uses `comfortable` so type/actions stay readable. */
  density?: "compact" | "comfortable";
  /** `split` = expenses list left, summary + reimbursements right. */
  layout?: "stack" | "split";
  /** Odometer (or similar) rendered in the summary pane on split layouts. */
  leadingSlot?: ReactNode;
  onAddFuel?: () => void;
  onAddToll?: () => void;
  onAddOtherExpense?: () => void;
  onEditExpense?: (event: TripCostEvent) => void;
  /** Opens preview sheet on mount (e.g. deep link from Operations tab row). */
  initialPreviewEventId?: string | null;
  /** Cash-out rows to driver from Finance ledger (`transactions` on this trip). */
  driverCashPayouts?: TripDriverCashPayoutRow[];
  onRecordDriverPayment?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const comfortable = density === "comfortable";
  const split = layout === "split";
  const isDriverViewer = profile?.role === "driver";
  const [listFilter, setListFilter] = useState<ListFilter>(isDriverViewer ? "action" : "all");
  const driverDefaultTabSetRef = useRef(false);
  const [previewEvent, setPreviewEvent] = useState<TripCostEvent | null>(null);
  const summaryQuery = useTripOperationsSummary(trip.id, { enabled: true });
  useTripOperationsSync({ enabled: !embedded });
  const ledgerBackfillTripRef = useRef<string | null>(null);

  const vehicleLabel = useMemo(() => {
    const raw = (trip.vehicle_display_number ?? "").trim();
    return raw ? formatIndianVehicleNumber(raw) : null;
  }, [trip.vehicle_display_number]);

  useEffect(() => {
    if (!isDriverViewer || driverDefaultTabSetRef.current) return;
    setListFilter("action");
  }, [isDriverViewer]);

  useEffect(() => {
    if (
      !shouldBackfillPostedExpensesToLedger({
        isDriverViewer,
        trip,
      }) ||
      ledgerBackfillTripRef.current === trip.id
    ) {
      return;
    }
    ledgerBackfillTripRef.current = trip.id;
    void syncPostedTripExpensesToOperationLedger(trip.id).then(() => {
      syncOperationalFinanceProjection({
        queryClient,
        organizationId: trip.organization_id,
        tripId: trip.id,
        vehicleId: trip.vehicle_id ?? null,
      });
    });
  }, [isDriverViewer, queryClient, trip.id, trip.organization_id, trip.vehicle_id]);

  useFocusEffect(
    useCallback(() => {
      if (!trip.id) return;
      if (embedded && summaryQuery.data) return;
      void summaryQuery.refetch();
    }, [embedded, summaryQuery.data, summaryQuery.refetch, trip.id]),
  );

  const previewDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    const id = initialPreviewEventId?.trim();
    if (!id) {
      previewDeepLinkRef.current = null;
      return;
    }
    const match = (summaryQuery.data?.costEvents ?? []).find((event) => event.id === id);
    if (match) {
      setPreviewEvent(match);
      return;
    }
    if (summaryQuery.isLoading || previewDeepLinkRef.current === id) return;
    previewDeepLinkRef.current = id;
    void summaryQuery.refetch().then((res) => {
      const found = res.data?.costEvents.find((event) => event.id === id);
      if (found) setPreviewEvent(found);
    });
  }, [initialPreviewEventId, summaryQuery]);

  const handlePreview = useCallback((event: TripCostEvent) => {
    setPreviewEvent(event);
  }, []);
  const reviewFuel = useReviewTripFuelEntry();
  const reviewToll = useReviewTripTollEntry();
  const reviewOther = useReviewTripOtherExpenseEntry();
  const setFuelReimbursement = useSetTripFuelReimbursementState();
  const setTollReimbursement = useSetTripTollReimbursementState();
  const setOtherReimbursement = useSetTripOtherReimbursementState();
  const cancelDriverExpense = useCancelDriverExpenseRequest();
  const remindDriverExpense = useRemindDriverExpenseRequest();

  const allCostEvents = summaryQuery.data?.costEvents ?? [];
  const events = useMemo(() => {
    if (!isDriverViewer) return allCostEvents;
    return allCostEvents.filter(isDriverReimbursementEvent);
  }, [allCostEvents, isDriverViewer]);

  useEffect(() => {
    if (!isDriverViewer || driverDefaultTabSetRef.current || summaryQuery.isLoading) return;
    driverDefaultTabSetRef.current = true;
    if (events.some(needsDriverPendingAction)) setListFilter("action");
  }, [events, isDriverViewer, summaryQuery.isLoading]);

  const loadingAction =
    reviewFuel.isPending ||
    reviewToll.isPending ||
    reviewOther.isPending ||
    setFuelReimbursement.isPending ||
    setTollReimbursement.isPending ||
    setOtherReimbursement.isPending ||
    cancelDriverExpense.isPending ||
    remindDriverExpense.isPending;

  const snapshot = summaryQuery.data?.financialSnapshot ?? null;
  const actionNeededEvents = useMemo(() => {
    if (isDriverViewer) {
      return events.filter(needsDriverPendingAction);
    }
    return events.filter(needsUserAction);
  }, [events, isDriverViewer]);
  const postedCostInr = snapshot?.postedOperationalCostInr ?? 0;
  const pendingPostCount = snapshot?.approvedAwaitingPostingCount ?? 0;
  const reimbursementDueInr = snapshot?.payableOutstandingInr ?? 0;
  const hasSummaryAlerts = pendingPostCount > 0 || reimbursementDueInr > 0;
  const hasReimbursableExpenses = events.some((event) => event.reimbursable);
  const driverExpensesInr = useMemo(
    () =>
      events
        .filter((event) => event.incurredBy === "driver")
        .reduce((sum, event) => sum + Math.max(0, event.amount), 0),
    [events],
  );
  const showDriverPaymentCta =
    !isDriverViewer &&
    typeof onRecordDriverPayment === "function" &&
    !!trip.driver_id &&
    (reimbursementDueInr > 0 || hasReimbursableExpenses);

  const { can: canSurface } = useMemberAccess();
  const canApproveExpenses = canSurface("finance.expenses.approve");

  const handleApprove = useCallback(async (event: TripCostEvent) => {
    if (!canApproveExpenses) return;
    const [kind, sourceId] = event.id.split(":");
    if (!sourceId) return;
    try {
      if (kind === "fuel") {
        await reviewFuel.mutateAsync({
          tripId: trip.id,
          fuelEntryId: sourceId,
          approvalState: "approved",
          reviewerUserId: profile?.uid ?? null,
        });
        return;
      }
      if (kind === "toll") {
        await reviewToll.mutateAsync({
          tripId: trip.id,
          tollEntryId: sourceId,
          approvalState: "approved",
          reviewerUserId: profile?.uid ?? null,
        });
        return;
      }
      if (kind === "other") {
        await reviewOther.mutateAsync({
          tripId: trip.id,
          otherEntryId: sourceId,
          approvalState: "approved",
          reviewerUserId: profile?.uid ?? null,
        });
      }
      syncOperationalFinanceProjection({
        queryClient,
        organizationId: trip.organization_id,
        tripId: trip.id,
        vehicleId: trip.vehicle_id ?? null,
      });
    } catch (e) {
      Alert.alert(
        "Could not approve expense",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  }, [
    canApproveExpenses,
    profile?.uid,
    queryClient,
    reviewFuel,
    reviewOther,
    reviewToll,
    trip.id,
    trip.organization_id,
    trip.vehicle_id,
  ]);

  const handleReject = useCallback(async (event: TripCostEvent) => {
    if (!canApproveExpenses) return;
    const [kind, sourceId] = event.id.split(":");
    if (!sourceId) return;
    try {
      if (kind === "fuel") {
        await reviewFuel.mutateAsync({
          tripId: trip.id,
          fuelEntryId: sourceId,
          approvalState: "rejected",
          reviewerUserId: profile?.uid ?? null,
        });
        return;
      }
      if (kind === "toll") {
        await reviewToll.mutateAsync({
          tripId: trip.id,
          tollEntryId: sourceId,
          approvalState: "rejected",
          reviewerUserId: profile?.uid ?? null,
        });
        return;
      }
      if (kind === "other") {
        await reviewOther.mutateAsync({
          tripId: trip.id,
          otherEntryId: sourceId,
          approvalState: "rejected",
          reviewerUserId: profile?.uid ?? null,
        });
      }
    } catch (e) {
      Alert.alert(
        "Could not reject expense",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  }, [canApproveExpenses, profile?.uid, reviewFuel, reviewOther, reviewToll, trip.id]);

  const handleMarkSettled = useCallback(async (event: TripCostEvent) => {
    const [kind, sourceId] = event.id.split(":");
    if (!sourceId) return;
    try {
      if (kind === "fuel") {
        await setFuelReimbursement.mutateAsync({
          tripId: trip.id,
          fuelEntryId: sourceId,
          nextState: "reimbursed",
          actorUserId: profile?.uid ?? null,
        });
      } else if (kind === "toll") {
        await setTollReimbursement.mutateAsync({
          tripId: trip.id,
          tollEntryId: sourceId,
          nextState: "reimbursed",
          actorUserId: profile?.uid ?? null,
        });
      } else if (kind === "other") {
        await setOtherReimbursement.mutateAsync({
          tripId: trip.id,
          otherEntryId: sourceId,
          nextState: "reimbursed",
          actorUserId: profile?.uid ?? null,
        });
      }
      if (typeof onRecordDriverPayment === "function") {
        Alert.alert(
          "Reimbursement marked",
          `${toCategoryLabel(event)} (${inr(event.amount)}) is marked reimbursed. Record the cash paid to the driver in Finance so it appears below.`,
          [
            { text: "Later", style: "cancel" },
            { text: "Record driver payment", onPress: onRecordDriverPayment },
          ],
        );
      }
    } catch (e) {
      Alert.alert(
        "Could not update reimbursement",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  }, [
    onRecordDriverPayment,
    profile?.uid,
    setFuelReimbursement,
    setOtherReimbursement,
    setTollReimbursement,
    trip.id,
  ]);

  const handleCancelRequest = useCallback(
    (event: TripCostEvent) => {
      Alert.alert(
        "Cancel reimbursement request?",
        `Remove ${toCategoryLabel(event)} (${inr(event.amount)}) from fleet review?`,
        [
          { text: "Keep request", style: "cancel" },
          {
            text: "Cancel request",
            style: "destructive",
            onPress: () => {
              void cancelDriverExpense
                .mutateAsync({
                  tripId: trip.id,
                  eventId: event.id,
                  actorUserId: profile?.uid ?? null,
                  organizationId: trip.organization_id,
                })
                .catch((e) => {
                  Alert.alert(
                    "Could not cancel request",
                    e instanceof Error ? e.message : "Unknown error",
                  );
                });
            },
          },
        ],
      );
    },
    [cancelDriverExpense, profile?.uid, trip.id, trip.organization_id],
  );

  const handleRemindRequest = useCallback(
    async (event: TripCostEvent) => {
      try {
        await remindDriverExpense.mutateAsync({
          tripId: trip.id,
          eventId: event.id,
          actorUserId: profile?.uid ?? null,
          organizationId: trip.organization_id,
        });
        Alert.alert(
          "Reminder sent",
          "Fleet owner will see this reimbursement request at the top of their queue.",
        );
      } catch (e) {
        Alert.alert(
          "Could not send reminder",
          e instanceof Error ? e.message : "Unknown error",
        );
      }
    },
    [profile?.uid, remindDriverExpense, trip.id, trip.organization_id],
  );

  const displayedEvents = useMemo(() => {
    if (listFilter === "action") return actionNeededEvents;
    return events;
  }, [actionNeededEvents, events, listFilter]);

  const reimbursementEvents = useMemo(
    () => events.filter((event) => event.reimbursable),
    [events],
  );

  const iconSm = comfortable ? 14 : embedded ? 13 : 12;
  const iconMd = comfortable ? 16 : embedded ? 14 : 14;
  const iconLg = comfortable ? 18 : embedded ? 16 : 16;
  const iconEmpty = comfortable ? 24 : embedded ? 16 : 18;

  const quickActions = [
    { key: "fuel", label: "Fuel", icon: "droplet" as const, onPress: onAddFuel },
    { key: "toll", label: "Toll", icon: "map-pin" as const, onPress: onAddToll },
    {
      key: "other",
      label: "Other",
      icon: "plus-circle" as const,
      onPress: onAddOtherExpense,
    },
  ].filter((action) => typeof action.onPress === "function");

  const onAddExpense =
    onAddOtherExpense ?? onAddFuel ?? onAddToll ?? undefined;

  const previewSheet = (
    <ExpensePreviewSheet
      visible={previewEvent != null}
      costEventId={previewEvent?.id ?? null}
      event={previewEvent}
      isDriverViewer={isDriverViewer}
      onClose={() => setPreviewEvent(null)}
      onEdit={onEditExpense}
      onRemind={handleRemindRequest}
      onCancel={handleCancelRequest}
      statusLabel={
        previewEvent
          ? isDriverViewer
            ? driverEventStatusLabel(previewEvent)
            : eventStatusLabel(previewEvent)
          : undefined
      }
    />
  );

  if (split) {
    return (
      <View
        style={[
          styles.container,
          embedded ? styles.containerEmbedded : null,
          styles.containerSplit,
          { paddingTop: embedded ? 0 : insets.top + 10 },
        ]}
      >
        {!embedded && onBack ? (
          <Pressable style={styles.backBtn} onPress={onBack}>
            <Text style={[styles.backBtnText, styles.backBtnTextComfortable]}>
              ← Back
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.splitGrid}>
          <View style={styles.splitBand}>
            <View style={styles.splitHalf}>
            <View style={styles.splitComposerCard}>
              {onAddExpense ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.addExpenseBtn,
                    styles.addExpenseBtnSplit,
                    pressed && styles.addExpenseBtnPressed,
                  ]}
                  onPress={onAddExpense}
                  accessibilityRole="button"
                  accessibilityLabel="Add expense"
                >
                  <View style={[styles.addExpenseBtnIcon, styles.addExpenseBtnIconComfortable]}>
                    <Feather name="plus" size={16} color={Theme.textOnPrimary} />
                  </View>
                  <View style={styles.addExpenseBtnCopy}>
                    <Text style={[styles.addExpenseBtnTitle, styles.addExpenseBtnTitleComfortable]}>
                      Add expense
                    </Text>
                    <Text
                      style={[styles.addExpenseBtnSub, styles.addExpenseBtnSubComfortable]}
                      numberOfLines={1}
                    >
                      Fuel, toll, parking & other trip costs
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Theme.textMuted} />
                </Pressable>
              ) : null}

              {quickActions.length > 0 ? (
                <View style={styles.splitQuickRow}>
                  {quickActions.map((action) => {
                    const accent =
                      QUICK_ACTION_STYLE[action.key] ?? QUICK_ACTION_STYLE.other;
                    return (
                      <Pressable
                        key={action.key}
                        style={({ pressed }) => [
                          styles.quickTile,
                          styles.splitQuickTile,
                          pressed && styles.quickTilePressed,
                        ]}
                        onPress={() => action.onPress?.()}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${action.label}`}
                      >
                        <View
                          style={[
                            styles.quickTileIcon,
                            styles.quickTileIconComfortable,
                            { backgroundColor: accent.bg, borderColor: accent.ring },
                          ]}
                        >
                          <Feather name={action.icon} size={16} color={accent.fg} />
                        </View>
                        <Text style={[styles.quickTileLabel, styles.quickTileLabelComfortable]}>
                          {action.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <View style={[styles.segmentTrack, styles.segmentTrackComfortable]}>
                <Pressable
                  style={({ pressed }) => [
                    styles.segmentBtn,
                    styles.segmentBtnComfortable,
                    listFilter === "all" ? styles.segmentBtnActive : null,
                    pressed && styles.segmentBtnPressed,
                  ]}
                  onPress={() => setListFilter("all")}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      styles.segmentBtnTextComfortable,
                      listFilter === "all" ? styles.segmentBtnTextActive : null,
                    ]}
                  >
                    All
                  </Text>
                  <View
                    style={[
                      styles.segmentCount,
                      styles.segmentCountComfortable,
                      listFilter === "all" ? styles.segmentCountActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentCountText,
                        styles.segmentCountTextComfortable,
                        listFilter === "all" ? styles.segmentCountTextActive : null,
                      ]}
                    >
                      {events.length}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.segmentBtn,
                    styles.segmentBtnComfortable,
                    listFilter === "action" ? styles.segmentBtnActive : null,
                    pressed && styles.segmentBtnPressed,
                  ]}
                  onPress={() => setListFilter("action")}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      styles.segmentBtnTextComfortable,
                      listFilter === "action" ? styles.segmentBtnTextActive : null,
                    ]}
                  >
                    {isDriverViewer ? "Pending" : "Needs action"}
                  </Text>
                  <View
                    style={[
                      styles.segmentCount,
                      styles.segmentCountComfortable,
                      listFilter === "action" ? styles.segmentCountActive : null,
                      actionNeededEvents.length > 0 && listFilter !== "action"
                        ? styles.segmentCountHighlight
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentCountText,
                        styles.segmentCountTextComfortable,
                        listFilter === "action" ? styles.segmentCountTextActive : null,
                        actionNeededEvents.length > 0 && listFilter !== "action"
                          ? styles.segmentCountTextHighlight
                          : null,
                      ]}
                    >
                      {actionNeededEvents.length}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
            </View>
            <View style={styles.splitHalf}>
              <View style={styles.splitOdometerSlot}>
                {leadingSlot ?? (
                  <View style={styles.splitOdometerFallback}>
                    <Text style={styles.splitPaneKicker}>Odometer</Text>
                    <Text style={styles.splitSummaryCaption}>
                      Not used on this trip
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.splitBand}>
            <View style={styles.splitHalf}>
            <View style={styles.splitListCard}>
              <View style={[styles.listSectionHead, styles.listSectionHeadComfortable]}>
                <Text style={[styles.listSectionTitle, styles.listSectionTitleComfortable]}>
                  Line items
                </Text>
                <View style={[styles.listSectionBadge, styles.listSectionBadgeComfortable]}>
                  <Text
                    style={[
                      styles.listSectionBadgeText,
                      styles.listSectionBadgeTextComfortable,
                    ]}
                  >
                    {displayedEvents.length}
                  </Text>
                </View>
              </View>

              {summaryQuery.isError ? (
                <Text style={[styles.empty, styles.emptyComfortable]}>
                  {summaryQuery.error instanceof Error
                    ? summaryQuery.error.message
                    : "Could not load expenses."}
                </Text>
              ) : summaryQuery.isLoading ? (
                <Text style={[styles.empty, styles.emptyComfortable]}>Loading expenses…</Text>
              ) : displayedEvents.length === 0 ? (
                <View style={[styles.emptyCard, styles.emptyCardSplit]}>
                  <Feather
                    name={listFilter === "action" ? "check-circle" : "inbox"}
                    size={22}
                    color={Theme.textMuted}
                  />
                  <Text style={[styles.emptyTitle, styles.emptyTitleComfortable]}>
                    {listFilter === "action" ? "All caught up" : "No expenses yet"}
                  </Text>
                  <Text style={[styles.empty, styles.emptyComfortable]}>
                    {listFilter === "action"
                      ? isDriverViewer
                        ? "No reimbursement requests waiting on fleet right now."
                        : "Nothing waiting for approve, post, or reimburse."
                      : "Add fuel, toll, or other costs for this trip."}
                  </Text>
                </View>
              ) : (
                displayedEvents.map((event) => (
                  <ExpenseRow
                    key={event.id}
                    event={event}
                    embedded={embedded}
                    comfortable
                    iconMd={iconMd}
                    loadingAction={loadingAction}
                    isDriverViewer={isDriverViewer}
                    onApprove={canApproveExpenses ? handleApprove : undefined}
                    onReject={handleReject}
                    onMarkSettled={handleMarkSettled}
                    onCancelRequest={handleCancelRequest}
                    onRemindRequest={handleRemindRequest}
                    onEdit={onEditExpense}
                    onPreview={handlePreview}
                  />
                ))
              )}
            </View>
            </View>

            <View style={styles.splitHalf}>
            <View style={styles.splitRightStack}>
            <View style={styles.splitSummaryCard}>
              {!isDriverViewer ? (
                <>
                  <Text style={styles.splitPaneKicker}>Ledger summary</Text>
                  <Text style={styles.splitSummaryValue}>{inr(postedCostInr)}</Text>
                  <Text style={styles.splitSummaryCaption}>Posted to ledger</Text>
                  {vehicleLabel ? (
                    <View style={styles.vehicleRow}>
                      <Feather name="truck" size={iconSm} color={Theme.textMuted} />
                      <Text style={[styles.vehicleRowText, styles.vehicleRowTextComfortable]} numberOfLines={1}>
                        {vehicleLabel}
                      </Text>
                    </View>
                  ) : null}
                  {hasSummaryAlerts ? (
                    <View style={styles.splitAlertRow}>
                      {pendingPostCount > 0 ? (
                        <View style={[styles.alertPill, styles.alertPillComfortable]}>
                          <Feather name="clock" size={iconSm} color={Theme.warning} />
                          <Text style={[styles.alertPillText, styles.alertPillTextComfortable]}>
                            {pendingPostCount} awaiting post
                          </Text>
                        </View>
                      ) : null}
                      {reimbursementDueInr > 0 ? (
                        <View
                          style={[
                            styles.alertPill,
                            styles.alertPillDue,
                            styles.alertPillComfortable,
                          ]}
                        >
                          <Feather name="credit-card" size={iconSm} color={Theme.primary} />
                          <Text
                            style={[
                              styles.alertPillText,
                              styles.alertPillDueText,
                              styles.alertPillTextComfortable,
                            ]}
                          >
                            {inr(reimbursementDueInr)} to reimburse
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={styles.splitPaneKicker}>Your expenses</Text>
                  <Text style={styles.splitSummaryValue}>{inr(driverExpensesInr)}</Text>
                  <Text style={[styles.driverSummaryHint, styles.driverSummaryHintComfortable]}>
                    {actionNeededEvents.length > 0
                      ? `${actionNeededEvents.length} request${actionNeededEvents.length === 1 ? "" : "s"} awaiting fleet approval`
                      : reimbursementDueInr > 0
                        ? `${inr(reimbursementDueInr)} pending payout from fleet`
                        : "Submit expenses you paid out of pocket for fleet review"}
                  </Text>
                </>
              )}
            </View>

            {!isDriverViewer ? (
              <View style={styles.splitReimburseCard}>
                <View style={[styles.listSectionHead, styles.listSectionHeadComfortable]}>
                  <Text style={[styles.listSectionTitle, styles.listSectionTitleComfortable]}>
                    Reimbursements
                  </Text>
                  <View style={[styles.listSectionBadge, styles.listSectionBadgeComfortable]}>
                    <Text
                      style={[
                        styles.listSectionBadgeText,
                        styles.listSectionBadgeTextComfortable,
                      ]}
                    >
                      {reimbursementEvents.length}
                    </Text>
                  </View>
                </View>

                {showDriverPaymentCta ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.driverPayBanner,
                      styles.driverPayBannerSplit,
                      pressed && styles.driverPayBannerPressed,
                    ]}
                    onPress={() => onRecordDriverPayment?.()}
                  >
                    <View
                      style={[
                        styles.driverPayIconWrap,
                        styles.driverPayIconWrapComfortable,
                      ]}
                    >
                      <Feather name="credit-card" size={iconMd} color={Theme.primary} />
                    </View>
                    <View style={styles.driverPayBannerText}>
                      <Text
                        style={[
                          styles.driverPayBannerTitle,
                          styles.driverPayBannerTitleComfortable,
                        ]}
                      >
                        {reimbursementDueInr > 0
                          ? `${inr(reimbursementDueInr)} due to driver`
                          : "Record driver payment"}
                      </Text>
                      <Text
                        style={[styles.driverPayBannerSub, styles.driverPayBannerSubComfortable]}
                        numberOfLines={2}
                      >
                        Cash payout posts in Finance, separate from approve & post.
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={iconLg} color={Theme.textMuted} />
                  </Pressable>
                ) : null}

                {reimbursementEvents.length === 0 ? (
                  <Text style={[styles.payoutEmpty, styles.payoutEmptyComfortable]}>
                    No reimbursable expenses on this trip.
                  </Text>
                ) : (
                  reimbursementEvents.map((event) => (
                    <Pressable
                      key={`reimburse:${event.id}`}
                      style={({ pressed }) => [
                        styles.splitReimburseRow,
                        pressed && styles.addExpenseBtnPressed,
                      ]}
                      onPress={() => handlePreview(event)}
                      accessibilityRole="button"
                      accessibilityLabel={`${toCategoryLabel(event)} reimbursement`}
                    >
                      <View
                        style={[
                          styles.splitReimburseDot,
                          { backgroundColor: categoryVisual(event.category).rail },
                        ]}
                      />
                      <View style={styles.splitReimburseCopy}>
                        <Text style={styles.splitReimburseTitle} numberOfLines={1}>
                          {toCategoryLabel(event)}
                        </Text>
                        <Text style={styles.splitReimburseHint} numberOfLines={1}>
                          {eventStatusLabel(event)}
                        </Text>
                      </View>
                      <Text style={styles.splitReimburseAmount}>{inr(event.amount)}</Text>
                    </Pressable>
                  ))
                )}

                <View style={styles.splitPayoutDivider} />
                <Text style={[styles.payoutSectionTitle, styles.payoutSectionTitleComfortable]}>
                  Driver cash payouts
                </Text>
                {driverCashPayouts.length === 0 ? (
                  <Text style={[styles.payoutEmpty, styles.payoutEmptyComfortable]}>
                    No driver payment recorded on this trip yet.
                  </Text>
                ) : (
                  driverCashPayouts.map((payout) => (
                    <View key={payout.id} style={[styles.payoutRow, styles.payoutRowComfortable]}>
                      <View style={styles.payoutRowLeft}>
                        <Feather name="user" size={iconMd} color={Theme.positive} />
                        <View style={styles.payoutRowText}>
                          <Text
                            style={[styles.payoutRowTitle, styles.payoutRowTitleComfortable]}
                            numberOfLines={1}
                          >
                            {payout.description?.trim() || "Driver payment"}
                          </Text>
                          <Text style={[styles.payoutRowDate, styles.payoutRowDateComfortable]}>
                            {payout.dateLabel}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.payoutRowAmount, styles.payoutRowAmountComfortable]}>
                        {inr(payout.amount)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}
            </View>
            </View>
          </View>
        </View>
        {previewSheet}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        embedded ? styles.containerEmbedded : null,
        comfortable && styles.containerComfortable,
        { paddingTop: embedded ? 0 : insets.top + 10 },
      ]}
    >
      {!embedded && onBack ? (
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={[styles.backBtnText, comfortable && styles.backBtnTextComfortable]}>
            ← Back
          </Text>
        </Pressable>
      ) : null}

      <View
        style={[
          styles.toolbar,
          embedded && styles.toolbarEmbedded,
          comfortable && styles.toolbarComfortable,
        ]}
      >
          <View
            style={[
              styles.hubShell,
              embedded && styles.hubShellEmbedded,
              comfortable && styles.hubShellComfortable,
            ]}
          >
            {!isDriverViewer ? (
            <View style={styles.ledgerHero}>
              <View
                style={[styles.ledgerAccent, comfortable && styles.ledgerAccentComfortable]}
              />
              <View
                style={[
                  styles.ledgerHeroBody,
                  comfortable && styles.ledgerHeroBodyComfortable,
                ]}
              >
                <View style={styles.ledgerHeroTop}>
                  <View
                    style={[
                      styles.ledgerHeroIcon,
                      comfortable && styles.ledgerHeroIconComfortable,
                    ]}
                  >
                    <Feather
                      name="book-open"
                      size={comfortable ? 16 : 13}
                      color={Theme.primary}
                    />
                  </View>
                  <View style={styles.summaryLeft}>
                    <View
                      style={[
                        styles.summaryTitleRow,
                        comfortable && styles.summaryTitleRowComfortable,
                      ]}
                    >
                      <View style={comfortable ? styles.summaryCopyComfortable : undefined}>
                        <Text
                          style={[
                            styles.summaryLabel,
                            comfortable && styles.summaryLabelComfortable,
                          ]}
                        >
                          Posted to ledger
                        </Text>
                        <Text
                          style={[
                            styles.summaryValue,
                            comfortable && styles.summaryValueComfortable,
                          ]}
                        >
                          {inr(postedCostInr)}
                        </Text>
                      </View>
                      {comfortable && hasSummaryAlerts ? (
                        <View style={styles.summaryAlertsComfortable}>
                          {pendingPostCount > 0 ? (
                            <View
                              style={[styles.alertPill, styles.alertPillComfortable]}
                            >
                              <Feather name="clock" size={iconSm} color={Theme.warning} />
                              <Text
                                style={[
                                  styles.alertPillText,
                                  styles.alertPillTextComfortable,
                                ]}
                              >
                                {pendingPostCount} awaiting post
                              </Text>
                            </View>
                          ) : null}
                          {reimbursementDueInr > 0 ? (
                            <View
                              style={[
                                styles.alertPill,
                                styles.alertPillDue,
                                styles.alertPillComfortable,
                              ]}
                            >
                              <Feather
                                name="credit-card"
                                size={iconSm}
                                color="#7c3aed"
                              />
                              <Text
                                style={[
                                  styles.alertPillText,
                                  styles.alertPillDueText,
                                  styles.alertPillTextComfortable,
                                ]}
                              >
                                {inr(reimbursementDueInr)} to reimburse
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
                {vehicleLabel ? (
                  <View style={styles.vehicleRow}>
                    <Feather name="truck" size={iconSm} color={Theme.textMuted} />
                    <Text
                      style={[
                        styles.vehicleRowText,
                        comfortable && styles.vehicleRowTextComfortable,
                      ]}
                      numberOfLines={1}
                    >
                      {vehicleLabel}
                    </Text>
                  </View>
                ) : null}
                {!comfortable && hasSummaryAlerts ? (
                  <View style={styles.summaryAlerts}>
                    {pendingPostCount > 0 ? (
                      <View style={styles.alertPill}>
                        <Feather name="clock" size={iconSm} color={Theme.warning} />
                        <Text style={styles.alertPillText}>
                          {pendingPostCount} awaiting post
                        </Text>
                      </View>
                    ) : null}
                    {reimbursementDueInr > 0 ? (
                      <View style={[styles.alertPill, styles.alertPillDue]}>
                        <Feather name="credit-card" size={iconSm} color="#7c3aed" />
                        <Text style={[styles.alertPillText, styles.alertPillDueText]}>
                          {inr(reimbursementDueInr)} to reimburse
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
            ) : (
              <View style={styles.driverSummaryHero}>
                <View
                  style={[styles.ledgerAccent, comfortable && styles.ledgerAccentComfortable]}
                />
                <View
                  style={[
                    styles.ledgerHeroBody,
                    comfortable && styles.ledgerHeroBodyComfortable,
                  ]}
                >
                  <View style={styles.ledgerHeroTop}>
                    <View
                      style={[
                        styles.ledgerHeroIcon,
                        comfortable && styles.ledgerHeroIconComfortable,
                      ]}
                    >
                      <Feather
                        name="clock"
                        size={comfortable ? 16 : 11}
                        color={Theme.primary}
                      />
                    </View>
                    <View style={styles.summaryLeft}>
                      <View
                        style={[
                          styles.summaryTitleRow,
                          comfortable && styles.summaryTitleRowComfortable,
                        ]}
                      >
                        <View
                          style={comfortable ? styles.summaryCopyComfortable : undefined}
                        >
                          <Text
                            style={[
                              styles.summaryLabel,
                              comfortable && styles.summaryLabelComfortable,
                            ]}
                          >
                            Expenses
                          </Text>
                          <Text
                            style={[
                              styles.summaryValue,
                              comfortable && styles.summaryValueComfortable,
                            ]}
                          >
                            {inr(driverExpensesInr)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.driverSummaryHint,
                      comfortable && styles.driverSummaryHintComfortable,
                    ]}
                  >
                    {actionNeededEvents.length > 0
                      ? `${actionNeededEvents.length} request${actionNeededEvents.length === 1 ? "" : "s"} awaiting fleet approval`
                      : reimbursementDueInr > 0
                        ? `${inr(reimbursementDueInr)} pending payout from fleet`
                        : "Submit expenses you paid out of pocket for fleet review"}
                  </Text>
                </View>
              </View>
            )}

            {onAddExpense ? (
              <Pressable
                style={({ pressed }) => [
                  styles.addExpenseBtn,
                  comfortable && styles.addExpenseBtnComfortable,
                  pressed && styles.addExpenseBtnPressed,
                ]}
                onPress={onAddExpense}
                accessibilityRole="button"
                accessibilityLabel="Add expense"
              >
                <View
                  style={[
                    styles.addExpenseBtnIcon,
                    comfortable && styles.addExpenseBtnIconComfortable,
                  ]}
                >
                  <Feather name="plus" size={comfortable ? 16 : 13} color="#fff" />
                </View>
                <View style={styles.addExpenseBtnCopy}>
                  <Text
                    style={[
                      styles.addExpenseBtnTitle,
                      comfortable && styles.addExpenseBtnTitleComfortable,
                    ]}
                  >
                    Add expense
                  </Text>
                  <Text
                    style={[
                      styles.addExpenseBtnSub,
                      comfortable && styles.addExpenseBtnSubComfortable,
                    ]}
                    numberOfLines={1}
                  >
                    Fuel, toll, parking & other trip costs
                  </Text>
                </View>
                <Feather
                  name="chevron-right"
                  size={comfortable ? 16 : 16}
                  color={Theme.textMuted}
                />
              </Pressable>
            ) : null}

            {quickActions.length > 0 ? (
              <View
                style={[
                  styles.quickActionsRow,
                  comfortable && styles.quickActionsRowComfortable,
                ]}
              >
                {quickActions.map((action) => {
                  const accent =
                    QUICK_ACTION_STYLE[action.key] ?? QUICK_ACTION_STYLE.other;
                  return (
                    <Pressable
                      key={action.key}
                      style={({ pressed }) => [
                        styles.quickTile,
                        comfortable && styles.quickTileComfortable,
                        pressed && styles.quickTilePressed,
                      ]}
                      onPress={() => action.onPress?.()}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${action.label}`}
                    >
                      <View
                        style={[
                          styles.quickTileIcon,
                          comfortable && styles.quickTileIconComfortable,
                          {
                            backgroundColor: accent.bg,
                            borderColor: accent.ring,
                          },
                        ]}
                      >
                        <Feather
                          name={action.icon}
                          size={comfortable ? 18 : 13}
                          color={accent.fg}
                        />
                      </View>
                      <Text
                        style={[
                          styles.quickTileLabel,
                          comfortable && styles.quickTileLabelComfortable,
                        ]}
                      >
                        {action.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View
            style={[
              styles.controlDeck,
              embedded && styles.controlDeckEmbedded,
              comfortable && styles.controlDeckComfortable,
            ]}
          >
            <View
              style={[
                styles.segmentTrack,
                embedded && styles.segmentTrackEmbedded,
                comfortable && styles.segmentTrackComfortable,
              ]}
            >
            <Pressable
              style={({ pressed }) => [
                styles.segmentBtn,
                comfortable && styles.segmentBtnComfortable,
                listFilter === "all" ? styles.segmentBtnActive : null,
                pressed && styles.segmentBtnPressed,
              ]}
              onPress={() => setListFilter("all")}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  comfortable && styles.segmentBtnTextComfortable,
                  listFilter === "all" ? styles.segmentBtnTextActive : null,
                ]}
              >
                All
              </Text>
              <View
                style={[
                  styles.segmentCount,
                  comfortable && styles.segmentCountComfortable,
                  listFilter === "all" ? styles.segmentCountActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.segmentCountText,
                    comfortable && styles.segmentCountTextComfortable,
                    listFilter === "all" ? styles.segmentCountTextActive : null,
                  ]}
                >
                  {events.length}
                </Text>
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.segmentBtn,
                comfortable && styles.segmentBtnComfortable,
                listFilter === "action" ? styles.segmentBtnActive : null,
                pressed && styles.segmentBtnPressed,
              ]}
              onPress={() => setListFilter("action")}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  comfortable && styles.segmentBtnTextComfortable,
                  listFilter === "action" ? styles.segmentBtnTextActive : null,
                ]}
              >
                {isDriverViewer ? "Pending" : "Needs action"}
              </Text>
              <View
                style={[
                  styles.segmentCount,
                  comfortable && styles.segmentCountComfortable,
                  listFilter === "action" ? styles.segmentCountActive : null,
                  actionNeededEvents.length > 0 && listFilter !== "action"
                    ? styles.segmentCountHighlight
                    : null,
                ]}
              >
                <Text
                  style={[
                    styles.segmentCountText,
                    comfortable && styles.segmentCountTextComfortable,
                    listFilter === "action" ? styles.segmentCountTextActive : null,
                    actionNeededEvents.length > 0 && listFilter !== "action"
                      ? styles.segmentCountTextHighlight
                      : null,
                  ]}
                >
                  {actionNeededEvents.length}
                </Text>
              </View>
            </Pressable>
          </View>

          {!summaryQuery.isLoading &&
          !summaryQuery.isError &&
          displayedEvents.length === 0 ? (
            <View
              style={[
                styles.emptyUnderSegment,
                comfortable && styles.emptyUnderSegmentComfortable,
              ]}
            >
              <View
                style={[
                  styles.emptyCard,
                  embedded && styles.emptyCardEmbedded,
                  comfortable && styles.emptyCardComfortable,
                ]}
              >
                <Feather
                  name={listFilter === "action" ? "check-circle" : "inbox"}
                  size={iconEmpty}
                  color={Theme.textMuted}
                />
                <Text
                  style={[
                    styles.emptyTitle,
                    comfortable && styles.emptyTitleComfortable,
                  ]}
                >
                  {listFilter === "action" ? "All caught up" : "No expenses yet"}
                </Text>
                <Text
                  style={[styles.empty, comfortable && styles.emptyComfortable]}
                >
                  {listFilter === "action"
                    ? isDriverViewer
                      ? "No reimbursement requests waiting on fleet right now."
                      : "Nothing waiting for approve, post, or reimburse."
                    : isDriverViewer
                      ? "Log fuel, toll, or other trip costs you paid for reimbursement."
                      : "Add fuel, toll, or other costs for this trip."}
                </Text>
                {listFilter !== "action" && onAddExpense ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.emptyAddBtn,
                      comfortable && styles.emptyAddBtnComfortable,
                      pressed && styles.addExpenseBtnPressed,
                    ]}
                    onPress={onAddExpense}
                    accessibilityRole="button"
                    accessibilityLabel="Add expense"
                  >
                    <Feather
                      name="plus"
                      size={comfortable ? 16 : 12}
                      color="#fff"
                    />
                    <Text
                      style={[
                        styles.emptyAddBtnText,
                        comfortable && styles.emptyAddBtnTextComfortable,
                      ]}
                    >
                      Add expense
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}

          {showDriverPaymentCta ? (
            <Pressable
              style={({ pressed }) => [
                styles.driverPayBanner,
                embedded && styles.driverPayBannerEmbedded,
                comfortable && styles.driverPayBannerComfortable,
                pressed && styles.driverPayBannerPressed,
              ]}
              onPress={() => onRecordDriverPayment?.()}
            >
              <View style={styles.driverPayAccent} />
              <View
                style={[
                  styles.driverPayIconWrap,
                  comfortable && styles.driverPayIconWrapComfortable,
                ]}
              >
                <Feather name="credit-card" size={iconMd} color={Theme.primary} />
              </View>
              <View style={styles.driverPayBannerText}>
                <Text
                  style={[
                    styles.driverPayBannerTitle,
                    comfortable && styles.driverPayBannerTitleComfortable,
                  ]}
                >
                  {reimbursementDueInr > 0
                    ? `${inr(reimbursementDueInr)} due to driver`
                    : "Record driver payment"}
                </Text>
                <Text
                  style={[
                    styles.driverPayBannerSub,
                    comfortable && styles.driverPayBannerSubComfortable,
                  ]}
                  numberOfLines={2}
                >
                  Mark reimbursed on each expense is not cash. Post payout in Finance.
                </Text>
              </View>
              <Feather name="chevron-right" size={iconLg} color={Theme.textMuted} />
            </Pressable>
          ) : null}
          </View>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          comfortable && styles.listContentComfortable,
          { paddingBottom: embedded ? 12 : insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {summaryQuery.isError ? (
          <View style={[styles.emptyCard, comfortable && styles.emptyCardComfortable]}>
            <Text style={[styles.emptyTitle, comfortable && styles.emptyTitleComfortable]}>
              Could not load expenses
            </Text>
            <Text style={[styles.empty, comfortable && styles.emptyComfortable]}>
              {summaryQuery.error instanceof Error
                ? summaryQuery.error.message
                : "Pull to refresh or go back and try again."}
            </Text>
          </View>
        ) : summaryQuery.isLoading ? (
          <View style={[styles.emptyCard, comfortable && styles.emptyCardComfortable]}>
            <Text style={[styles.emptyTitle, comfortable && styles.emptyTitleComfortable]}>
              Loading expenses…
            </Text>
          </View>
        ) : displayedEvents.length === 0 ? null : (
          <>
            {!summaryQuery.isLoading && displayedEvents.length > 0 ? (
              <View
                style={[
                  styles.listSectionHead,
                  comfortable && styles.listSectionHeadComfortable,
                ]}
              >
                <Text
                  style={[
                    styles.listSectionTitle,
                    comfortable && styles.listSectionTitleComfortable,
                  ]}
                >
                  Line items
                </Text>
                <View
                  style={[
                    styles.listSectionBadge,
                    comfortable && styles.listSectionBadgeComfortable,
                  ]}
                >
                  <Text
                    style={[
                      styles.listSectionBadgeText,
                      comfortable && styles.listSectionBadgeTextComfortable,
                    ]}
                  >
                    {displayedEvents.length}
                  </Text>
                </View>
              </View>
            ) : null}
            {displayedEvents.map((event) => (
              <ExpenseRow
                key={event.id}
                event={event}
                embedded={embedded}
                comfortable={comfortable}
                iconMd={iconMd}
                loadingAction={loadingAction}
                isDriverViewer={isDriverViewer}
                onApprove={canApproveExpenses ? handleApprove : undefined}
                onReject={handleReject}
                onMarkSettled={handleMarkSettled}
                onCancelRequest={handleCancelRequest}
                onRemindRequest={handleRemindRequest}
                onEdit={onEditExpense}
                onPreview={handlePreview}
              />
            ))}
            {!isDriverViewer && hasReimbursableExpenses ? (
              <View
                style={[
                  styles.payoutSection,
                  comfortable && styles.payoutSectionComfortable,
                ]}
              >
                <Text
                  style={[
                    styles.payoutSectionTitle,
                    comfortable && styles.payoutSectionTitleComfortable,
                  ]}
                >
                  Driver cash payouts
                </Text>
                <Text
                  style={[
                    styles.payoutSectionHint,
                    comfortable && styles.payoutSectionHintComfortable,
                  ]}
                >
                  Cash paid to driver posts in Finance (separate from expense approve
                  & post).
                </Text>
                {driverCashPayouts.length === 0 ? (
                  <Text
                    style={[
                      styles.payoutEmpty,
                      comfortable && styles.payoutEmptyComfortable,
                    ]}
                  >
                    No driver payment on this trip yet — tap the banner above to record
                    one.
                  </Text>
                ) : (
                  driverCashPayouts.map((payout) => (
                    <View
                      key={payout.id}
                      style={[
                        styles.payoutRow,
                        comfortable && styles.payoutRowComfortable,
                      ]}
                    >
                      <View style={styles.payoutRowLeft}>
                        <Feather name="user" size={iconMd} color="#0f766e" />
                        <View style={styles.payoutRowText}>
                          <Text
                            style={[
                              styles.payoutRowTitle,
                              comfortable && styles.payoutRowTitleComfortable,
                            ]}
                            numberOfLines={1}
                          >
                            {payout.description?.trim() || "Driver payment"}
                          </Text>
                          <Text
                            style={[
                              styles.payoutRowDate,
                              comfortable && styles.payoutRowDateComfortable,
                            ]}
                          >
                            {payout.dateLabel}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.payoutRowAmount,
                          comfortable && styles.payoutRowAmountComfortable,
                        ]}
                      >
                        {inr(payout.amount)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <ExpensePreviewSheet
        visible={previewEvent != null}
        costEventId={previewEvent?.id ?? null}
        event={previewEvent}
        isDriverViewer={isDriverViewer}
        onClose={() => setPreviewEvent(null)}
        onEdit={onEditExpense}
        onRemind={handleRemindRequest}
        onCancel={handleCancelRequest}
        statusLabel={
          previewEvent
            ? isDriverViewer
              ? driverEventStatusLabel(previewEvent)
              : eventStatusLabel(previewEvent)
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  containerEmbedded: {
    flex: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    minHeight: 44,
    justifyContent: "center",
    marginBottom: 8,
  },
  backBtnText: {
    color: Theme.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  toolbar: {
    gap: 10,
    marginBottom: 10,
  },
  toolbarEmbedded: {
    gap: 10,
    marginBottom: 8,
  },
  hubShell: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
      },
      android: { elevation: 1 },
      default: { boxShadow: "0 4px 14px rgba(15,23,42,0.05)" } as object,
    }),
  },
  hubShellEmbedded: {
    borderRadius: 14,
    width: "100%",
    alignSelf: "stretch",
  },
  ledgerHero: {
    position: "relative",
    backgroundColor: Theme.brandBlueSoft,
    borderBottomWidth: 0,
    borderBottomColor: Theme.borderLight,
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 0,
    borderRadius: 12,
    overflow: "hidden",
  },
  driverSummaryHero: {
    position: "relative",
    backgroundColor: "#f0fdf4",
    borderBottomWidth: 0,
    borderBottomColor: "#dcfce7",
    marginHorizontal: 10,
    marginTop: 10,
    borderRadius: 12,
    overflow: "hidden",
  },
  driverSummaryHint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  ledgerAccent: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: Theme.primary,
  },
  ledgerHeroBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingLeft: 14,
    gap: 6,
  },
  ledgerHeroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ledgerHeroIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  controlDeck: {
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 4,
  },
  controlDeckEmbedded: {
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  summaryCard: {
    backgroundColor: Theme.cardWhite,
    padding: 10,
    gap: 8,
  },
  summaryCardEmbedded: {
    padding: 8,
    gap: 6,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  summaryLeft: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 0,
  },
  vehicleRowText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
    letterSpacing: 0.1,
  },
  vehiclePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    maxWidth: 118,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "#eef2ff",
  },
  vehiclePillText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.primary,
    flexShrink: 1,
  },
  summaryAlerts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  alertPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: "#fffbeb",
  },
  alertPillText: {
    fontSize: 8,
    fontWeight: "600",
    color: "#b45309",
  },
  alertPillDue: {
    backgroundColor: "#f5f3ff",
  },
  alertPillDueText: {
    color: "#6d28d9",
  },
  driverPayBanner: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    paddingLeft: 12,
    backgroundColor: "#faf5ff",
    overflow: "hidden",
  },
  driverPayBannerEmbedded: {
    gap: 6,
    paddingVertical: 7,
    backgroundColor: Theme.cardWhite,
  },
  driverPayBannerPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.995 }],
  },
  driverPayAccent: {
    position: "absolute",
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: Theme.buttonPrimary,
  },
  driverPayIconWrap: {
    width: 28,
    height: 28,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  driverPayBannerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  driverPayBannerTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    lineHeight: 13,
  },
  driverPayBannerSub: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 11,
  },
  payoutSection: {
    marginTop: 4,
    padding: 10,
    backgroundColor: Theme.surface,
    gap: 6,
  },
  payoutSectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  payoutSectionHint: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 13,
    marginBottom: 4,
  },
  payoutEmpty: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    fontStyle: "italic",
    lineHeight: 14,
  },
  payoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  payoutRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  payoutRowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  payoutRowTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  payoutRowDate: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  payoutRowAmount: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0f766e",
    fontVariant: ["tabular-nums"],
  },
  addExpenseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    minHeight: 44,
  },
  addExpenseBtnPressed: {
    opacity: 0.9,
  },
  addExpenseBtnIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.primary,
  },
  addExpenseBtnCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  addExpenseBtnTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  addExpenseBtnSub: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  emptyUnderSegment: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
    paddingBottom: 2,
  },
  emptyUnderSegmentComfortable: {
    paddingTop: 4,
    paddingBottom: 2,
  },
  emptyCard: {
    width: "100%",
    maxWidth: 260,
    alignSelf: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surface,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 3,
  },
  emptyCardEmbedded: {
    maxWidth: 240,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: Theme.surface,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
    textAlign: "center",
  },
  empty: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
    lineHeight: 14,
    maxWidth: 200,
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.primary,
    minHeight: 28,
    alignSelf: "center",
    minWidth: 0,
  },
  emptyAddBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  quickActionsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: "transparent",
    borderTopWidth: 0,
    borderTopColor: Theme.borderLight,
  },
  quickTile: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  quickTilePressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  quickTileIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTileLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 32,
  },
  quickActionBtnText: {
    color: Theme.textPrimaryDark,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  segmentTrack: {
    flexDirection: "row",
    padding: 3,
    backgroundColor: Theme.surfaceGray,
    gap: 3,
    borderRadius: 12,
  },
  segmentTrackEmbedded: {
    padding: 3,
    borderRadius: 12,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
    minHeight: 32,
    borderRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: Theme.cardWhite,
    ...Platform.select({
      ios: {
        shadowColor: "#0f172a",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: { boxShadow: "0 1px 3px rgba(15,23,42,0.06)" } as object,
    }),
  },
  segmentBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  segmentBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  segmentBtnTextActive: {
    color: Theme.textPrimaryDark,
    fontWeight: "700",
  },
  segmentCount: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: Theme.borderLight,
    alignItems: "center",
  },
  segmentCountActive: {
    backgroundColor: Theme.brandBlueSoft,
  },
  segmentCountHighlight: {
    backgroundColor: "#fef3c7",
  },
  segmentCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  segmentCountTextActive: {
    color: Theme.primary,
  },
  segmentCountTextHighlight: {
    color: "#b45309",
  },
  list: { flex: 1 },
  listContent: {
    gap: 8,
    paddingTop: 2,
  },
  listSectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 2,
  },
  listSectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  listSectionBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "#eef2ff",
    alignItems: "center",
  },
  listSectionBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.primary,
  },
  row: {
    backgroundColor: Theme.cardWhite,
    padding: 8,
    paddingLeft: 8,
    gap: 6,
    overflow: "hidden",
  },
  rowEmbedded: {
    padding: 8,
    gap: 6,
  },
  rowNeedsAction: {
    backgroundColor: "#fafbff",
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowAvatar: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    lineHeight: 13,
  },
  rowHint: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 11,
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 3,
    maxWidth: 100,
  },
  editBtn: {
    minWidth: 28,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  editBtnPressed: {
    opacity: 0.65,
  },
  rowEditLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 8,
    marginTop: -2,
  },
  rowEditLinkText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
  },
  rowAmount: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
    lineHeight: 13,
  },
  rowAmountSettled: {
    color: "#15803d",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    maxWidth: 100,
  },
  chipDot: {
    width: 4,
    height: 4,
  },
  chipDotGood: { backgroundColor: "#16a34a" },
  chipDotPending: { backgroundColor: "#d97706" },
  chipDotBad: { backgroundColor: "#dc2626" },
  chipDotSettled: { backgroundColor: "#ffffff" },
  chipText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flexShrink: 1,
    letterSpacing: 0.1,
  },
  chipTextOnSolid: {
    color: Theme.textOnPrimary,
  },
  chipGood: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
  chipPending: { borderColor: "#fcd34d", backgroundColor: "#fffbeb" },
  chipBad: { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  chipSettled: {
    backgroundColor: "#16a34a",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  actionBtn: {
    flex: 1,
    minWidth: 100,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 30,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Theme.surface,
  },
  actionBtnFull: {
    flex: 1,
    minWidth: "100%",
  },
  actionBtnPrimary: {
    backgroundColor: Theme.buttonPrimary,
    ...Platform.select({
      ios: {
        shadowColor: Theme.pulseIndigo,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  actionBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  actionBtnSecondaryPressed: {
    backgroundColor: Theme.borderLight,
  },
  actionBtnText: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  actionBtnTextPrimary: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  // ── Desktop density: editorial, readable, not oversized ───────────────────
  containerComfortable: {
    width: "100%",
  },
  toolbarComfortable: {
    gap: 12,
    marginBottom: 4,
  },
  hubShellComfortable: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  ledgerAccentComfortable: {
    width: 4,
    top: 12,
    bottom: 12,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  ledgerHeroBodyComfortable: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    paddingLeft: 20,
    gap: 10,
  },
  ledgerHeroIconComfortable: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  summaryTitleRowComfortable: {
    alignItems: "flex-start",
    gap: 16,
  },
  summaryCopyComfortable: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  summaryAlertsComfortable: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
    maxWidth: 320,
  },
  summaryLabelComfortable: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textMuted,
  },
  summaryValueComfortable: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
    fontWeight: "800",
  },
  vehicleRowTextComfortable: {
    fontSize: 13,
    fontWeight: "600",
  },
  alertPillComfortable: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  alertPillTextComfortable: {
    fontSize: 12,
    fontWeight: "700",
  },
  driverSummaryHintComfortable: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  addExpenseBtnComfortable: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 56,
    borderRadius: 12,
    gap: 12,
  },
  addExpenseBtnIconComfortable: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  addExpenseBtnTitleComfortable: {
    fontSize: 15,
    fontWeight: "700",
  },
  addExpenseBtnSubComfortable: {
    fontSize: 13,
    marginTop: 1,
  },
  quickActionsRowComfortable: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Theme.surface,
  },
  quickTileComfortable: {
    gap: 8,
    paddingVertical: 12,
    minHeight: 84,
    borderRadius: 12,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  quickTileIconComfortable: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickTileLabelComfortable: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  controlDeckComfortable: {
    gap: 10,
  },
  segmentTrackComfortable: {
    padding: 4,
    gap: 4,
    borderRadius: 12,
  },
  segmentBtnComfortable: {
    gap: 8,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 10,
  },
  segmentBtnTextComfortable: {
    fontSize: 13,
    fontWeight: "600",
  },
  segmentCountComfortable: {
    minWidth: 24,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  segmentCountTextComfortable: {
    fontSize: 12,
    fontWeight: "700",
  },
  driverPayBannerComfortable: {
    gap: 12,
    padding: 14,
    paddingLeft: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd6fe",
  },
  driverPayIconWrapComfortable: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  driverPayBannerTitleComfortable: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  driverPayBannerSubComfortable: {
    fontSize: 13,
    lineHeight: 18,
  },
  listContentComfortable: {
    gap: 10,
    paddingTop: 8,
  },
  listSectionHeadComfortable: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingHorizontal: 2,
  },
  listSectionTitleComfortable: {
    fontSize: 12,
    letterSpacing: 0.7,
  },
  listSectionBadgeComfortable: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  listSectionBadgeTextComfortable: {
    fontSize: 12,
  },
  rowComfortable: {
    padding: 14,
    paddingLeft: 14,
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowMainComfortable: {
    gap: 12,
    minHeight: 48,
  },
  rowAvatarComfortable: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  rowTitleComfortable: {
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.2,
    fontWeight: "800",
  },
  rowHintComfortable: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowRightComfortable: {
    gap: 6,
    maxWidth: 200,
  },
  rowAmountComfortable: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  rowEditLinkComfortable: {
    paddingHorizontal: 2,
    paddingBottom: 2,
    marginTop: 0,
    minHeight: 32,
  },
  rowEditLinkTextComfortable: {
    fontSize: 13,
  },
  chipComfortable: {
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 200,
    borderRadius: 8,
  },
  chipDotComfortable: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipTextComfortable: {
    fontSize: 11,
    fontWeight: "700",
  },
  actionsComfortable: {
    gap: 10,
    paddingTop: 10,
  },
  actionBtnComfortable: {
    minWidth: 140,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 10,
  },
  actionBtnTextComfortable: {
    fontSize: 13,
    fontWeight: "700",
  },
  emptyCardComfortable: {
    maxWidth: 300,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 6,
    borderRadius: 14,
  },
  emptyTitleComfortable: {
    fontSize: 14,
  },
  emptyComfortable: {
    fontSize: 12,
    lineHeight: 16,
  },
  emptyAddBtnComfortable: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 34,
    borderRadius: 999,
    gap: 5,
  },
  emptyAddBtnTextComfortable: {
    fontSize: 12,
  },
  payoutSectionComfortable: {
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    gap: 8,
  },
  payoutSectionTitleComfortable: {
    fontSize: 12,
    letterSpacing: 0.7,
  },
  payoutSectionHintComfortable: {
    fontSize: 13,
    lineHeight: 18,
  },
  payoutEmptyComfortable: {
    fontSize: 13,
    lineHeight: 18,
  },
  payoutRowComfortable: {
    paddingVertical: 12,
  },
  payoutRowTitleComfortable: {
    fontSize: 14,
  },
  payoutRowDateComfortable: {
    fontSize: 12,
  },
  payoutRowAmountComfortable: {
    fontSize: 15,
  },
  backBtnTextComfortable: {
    fontSize: 15,
  },
  containerSplit: {
    width: "100%",
    alignSelf: "stretch",
  },
  splitGrid: {
    width: "100%",
    alignSelf: "stretch",
    gap: 16,
  },
  splitBand: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "stretch",
    width: "100%",
    gap: 16,
  },
  splitHalf: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  splitComposerCard: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    gap: 10,
  },
  splitOdometerSlot: {
    flex: 1,
    minHeight: 0,
    height: "100%",
  },
  splitOdometerFallback: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    gap: 6,
    justifyContent: "center",
  },
  splitListCard: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    gap: 10,
  },
  splitRightStack: {
    flex: 1,
    gap: 12,
  },
  splitSummaryCard: {
    backgroundColor: Theme.brandBlueSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 6,
  },
  splitReimburseCard: {
    flex: 1,
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 14,
    gap: 10,
  },
  splitPaneKicker: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  splitSummaryValue: {
    fontSize: 28,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.6,
    fontVariant: ["tabular-nums"],
  },
  splitSummaryCaption: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  splitAlertRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  addExpenseBtnSplit: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  splitQuickRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  splitQuickTile: {
    flex: 1,
    minHeight: 72,
    paddingVertical: 10,
    backgroundColor: Theme.surface,
  },
  emptyCardSplit: {
    maxWidth: "100%",
    alignSelf: "stretch",
    paddingVertical: 20,
  },
  driverPayBannerSplit: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    padding: 12,
    paddingLeft: 12,
    backgroundColor: Theme.surface,
  },
  splitReimburseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  splitReimburseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  splitReimburseCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  splitReimburseTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  splitReimburseHint: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  splitReimburseAmount: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    fontVariant: ["tabular-nums"],
  },
  splitPayoutDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.borderLight,
    marginTop: 4,
  },
});
