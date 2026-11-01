import { LoadingIndicator } from "@/components/LoadingIndicator";
import Theme from "@/constants/Theme";
import { useDriverTheme, useDriverThemeColors } from "@/contexts/DriverThemeContext";
import { DriverCollectFromSheet } from "@/features/drivers/components/DriverCollectFromSheet";
import {
  canTagPartyOnTrip,
  isTripTaggedToParty,
  tripReceivablePartyName,
} from "@/features/drivers/utils/driverPartyReceivables.util";
import { useDriverOperatingModeQuery } from "@/lib/queries/useDriverOperatingModeQuery";
import { DriverTripExpenseLogSection } from "@/features/driver/components/DriverTripExpenseLogSection";
import { TripPaymentAmountGrid } from "@/features/driver/components/TripPaymentAmountGrid";
import { driverCaptureLaneForTrip } from "@/features/drivers/utils/driverCapturePayment.util";
import { useDriverTripSettlement } from "@/features/driver/hooks/useDriverTripSettlement";
import { ExchangePaymentsPanel } from "@/features/marketplace/components/ExchangePaymentsPanel";
import { useExchangeTripSummaryQuery } from "@/features/marketplace/hooks/useExchangeTripPayments";
import { isDcoOperatingTrip } from "@/features/trips/domain/tripDcoOperating";
import type { DriverTripSettlementTone } from "@/features/driver/tripSettlement/driverTripSettlement.util";
import { tripHistoryDetailStyles as styles } from "@/features/driver/tripHistory/tripHistoryDetail.styles";
import { useTripOperationsSummary } from "@/features/trips/operations/queries/useTripOperations";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  formatKm,
  toVerificationSnapshot,
} from "@/features/trips/verification/selectors/verificationSelectors";
import { ROUTES, tripExpenseEntryEditRoute } from "@/lib/routes";
import { type Href, useRouter } from "expo-router";
import {
  Activity,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Info,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type TripDetailSettlementPanelProps = {
  trip: TripRow;
  /** Employer-linked fleet trip (history Fleet Trips rule). */
  isFleetLinked?: boolean;
  initialSelectedExpenseId?: string | null;
  onPartyTagged?: () => void;
};

function inr(v: number): string {
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function tonePillStyle(tone: DriverTripSettlementTone, isDark: boolean) {
  switch (tone) {
    case "success":
    case "fleet":
      return {
        backgroundColor: "#ecfdf5",
        borderColor: "#a7f3d0",
        color: Theme.driverEmerald,
      };
    case "warning":
      return {
        backgroundColor: "#fff7ed",
        borderColor: "#fed7aa",
        color: "#c2410c",
      };
    case "info":
      return {
        backgroundColor: "#eff6ff",
        borderColor: "#bfdbfe",
        color: "#1d4ed8",
      };
    default:
      return {
        backgroundColor: isDark ? "rgba(148,163,184,0.12)" : "#f8fafc",
        borderColor: isDark ? "rgba(148,163,184,0.22)" : "#e2e8f0",
        color: isDark ? "#94a3b8" : "#64748b",
      };
  }
}

export function TripDetailSettlementPanel({
  trip,
  isFleetLinked,
  initialSelectedExpenseId,
  onPartyTagged,
}: TripDetailSettlementPanelProps) {
  const colors = useDriverThemeColors();
  const { theme } = useDriverTheme();
  const isDark = theme === "dark";
  const router = useRouter();
  const [collectFromOpen, setCollectFromOpen] = useState(false);
  const { canAddDcoShippers } = useDriverOperatingModeQuery();
  const {
    settlementView,
    loading,
    requestPaymentLoading,
    requestPayment,
  } = useDriverTripSettlement(trip, { isFleetLinked });

  const summaryQuery = useTripOperationsSummary(trip.id, { includeMaintenance: false });
  const exchangeQuery = useExchangeTripSummaryQuery(
    isDcoOperatingTrip(trip) && trip.source === "market_bid" ? trip.id : null,
  );
  // The Exchange record is this DCO's receivable; no separate payout figure.
  const isExchangeReceivable = !!exchangeQuery.data;

  const openAddExpense = useCallback(() => {
    router.push(ROUTES.tripOtherExpenseEntry(trip.id) as Href);
  }, [router, trip.id]);
  const costEvents = summaryQuery.data?.costEvents ?? [];
  const reimbursementDueInr =
    summaryQuery.data?.financialSnapshot?.payableOutstandingInr ?? 0;
  const totalExpensesInr = useMemo(
    () => costEvents.reduce((sum, event) => sum + Math.max(0, event.amount), 0),
    [costEvents],
  );
  const pendingExpenseCount = costEvents.filter(
    (e) => e.settlementState !== "settled" && e.approvalState !== "rejected",
  ).length;
  const settledExpenseCount = costEvents.filter(
    (e) => e.settlementState === "settled",
  ).length;
  const distanceKm =
    summaryQuery.data?.mileage.distanceKm ??
    toVerificationSnapshot(trip).odometerDistanceKm ??
    (trip.distance != null ? Number(trip.distance) : null);

  const reimbursementStatusMessage =
    pendingExpenseCount > 0
      ? `${pendingExpenseCount} expense${pendingExpenseCount === 1 ? "" : "s"} awaiting fleet review`
      : reimbursementDueInr > 0
        ? `${inr(reimbursementDueInr)} pending reimbursement`
        : costEvents.length > 0
          ? "All expenses settled"
          : "No expenses yet";

  const reimbursementMetrics = [
    {
      label: "Distance",
      value: summaryQuery.isLoading ? "…" : formatKm(distanceKm),
    },
    {
      label: "Expenses",
      value: summaryQuery.isLoading ? "…" : inr(totalExpensesInr),
    },
    {
      label: "Due",
      value: summaryQuery.isLoading ? "…" : inr(reimbursementDueInr),
    },
    {
      label: "Settled",
      value: summaryQuery.isLoading
        ? "…"
        : `${settledExpenseCount}/${costEvents.length || 0}`,
    },
  ];

  if (loading || !settlementView) {
    return (
      <View style={panelStyles.loadingWrap}>
        <LoadingIndicator size="small" color={colors.emerald} />
      </View>
    );
  }

  const pill = tonePillStyle(settlementView.statusTone, isDark);
  const showCommissionHero = !settlementView.isSalary && !isExchangeReceivable;
  const showRequestFromFleet = settlementView.isFleetLinked && !isExchangeReceivable;
  const captureDue = Math.max(
    0,
    Math.round(settlementView.status === "settled" ? 0 : settlementView.outstandingAmount),
  );
  const captureLane = driverCaptureLaneForTrip(trip, !!settlementView.isFleetLinked);
  const isMarketplaceTrip = captureLane === "marketplace" || isExchangeReceivable;
  const taggedToParty = isTripTaggedToParty(trip);
  const taggedPartyName = taggedToParty ? tripReceivablePartyName(trip) : null;
  const marketplaceShipper =
    String(settlementView.fleetName ?? "").trim() ||
    tripReceivablePartyName(trip);
  const isOfflineReceivable = canTagPartyOnTrip(trip, !!settlementView.isFleetLinked);
  const revenueFrom = isMarketplaceTrip
    ? marketplaceShipper
    : isOfflineReceivable
      ? taggedPartyName ?? "Tag a party first"
      : String(settlementView.fleetName ?? "").trim() || "Fleet";
  const showDcoPartyActions =
    isOfflineReceivable &&
    !settlementView.isSalary;
  const showCollect =
    showDcoPartyActions &&
    taggedToParty &&
    settlementView.status !== "settled";
  const showMarketplaceCollect =
    canAddDcoShippers &&
    isMarketplaceTrip &&
    !settlementView.isSalary &&
    settlementView.status !== "settled";
  const openCollect = () => {
    if (!taggedPartyName) return;
    router.push(
      ROUTES.driverCapturePayment({
        tripId: trip.id,
        due: captureDue > 0 ? captureDue : undefined,
        lane: captureLane === "fleet" ? "shipper" : captureLane,
        partyName: taggedPartyName,
      }) as Href,
    );
  };
  const openMarketplaceCollect = () => {
    router.push(
      ROUTES.driverCapturePayment({
        tripId: trip.id,
        due: captureDue > 0 ? captureDue : undefined,
        lane: "marketplace",
        partyName: marketplaceShipper,
      }) as Href,
    );
  };
  const earningTitle = settlementView.isSalary
    ? "Salary"
    : settlementView.commissionApplies
      ? "Commission"
      : "Estimated earning";
  const earningSub = settlementView.isSalary
    ? "Paid offline with salary cycle"
    : settlementView.commissionApplies
      ? "Agreed trip commission — settle offline with fleet"
      : settlementView.isEstimated
        ? "Estimate — confirm rate offline with fleet"
        : "Amount to settle offline with fleet";
  const earningValue = settlementView.isSalary
    ? "SALARY"
    : inr(settlementView.expectedAmount);

  const onRequestFromFleet = () => {
    if (settlementView.isSalary) {
      router.push("/(driver)/salary-request" as Href);
      return;
    }
    if (settlementView.expectedAmount > 0 && !settlementView.isEstimated) {
      void requestPayment();
      return;
    }
    router.push("/(driver)/salary-request" as Href);
  };

  return (
    <View style={{ marginBottom: 12 }}>
      {showMarketplaceCollect ? (
        <View style={[panelStyles.partyCard, { marginBottom: 12 }]}>
          <Text style={panelStyles.partyKicker}>Collect from shipper</Text>
          <Text style={panelStyles.partyName} numberOfLines={1}>
            {marketplaceShipper}
          </Text>
          <TouchableOpacity
            style={panelStyles.collectBtn}
            onPress={openMarketplaceCollect}
            accessibilityRole="button"
            accessibilityLabel={`Collect from ${marketplaceShipper}`}
          >
            <Text style={panelStyles.collectBtnText} numberOfLines={1}>
              Collect
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showDcoPartyActions ? (
        <View style={[panelStyles.partyCard, { marginBottom: 12 }]}>
          <Text style={panelStyles.partyKicker}>
            {taggedToParty ? "Bill to" : "Tag a party first"}
          </Text>
          <Text style={panelStyles.partyName} numberOfLines={1}>
            {taggedToParty ? taggedPartyName : "Shipper or middleman"}
          </Text>
          <View style={{ gap: 8 }}>
            {showCollect ? (
              <TouchableOpacity
                style={panelStyles.collectBtn}
                onPress={openCollect}
                accessibilityRole="button"
                accessibilityLabel={`Collect from ${taggedPartyName}`}
              >
                <Text style={panelStyles.collectBtnText}>Collect</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={showCollect ? panelStyles.tagBtn : panelStyles.collectBtn}
              onPress={() => setCollectFromOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={taggedToParty ? "Change party" : "Tag party"}
            >
              <Text style={showCollect ? panelStyles.tagBtnText : panelStyles.collectBtnText}>
                {taggedToParty ? "Change party" : "Tag party"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {isExchangeReceivable ? <ExchangePaymentsPanel tripId={trip.id} /> : null}

      {settlementView.status === "incomplete" && !isExchangeReceivable ? (
        <View
          style={[
            panelStyles.incompleteBanner,
            {
              backgroundColor: isDark ? colors.surfaceElevated : "#f8fafc",
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[panelStyles.incompleteText, { color: colors.textMuted }]}>
            You can collect a partial payment now. Remaining pay can settle after the trip is complete.
          </Text>
        </View>
      ) : null}

      {showCommissionHero ? (
        <View style={styles.tdSettlementGlow}>
          <View
            style={[
              styles.tdNetCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.tdNetBlur} pointerEvents="none" />
            <View style={styles.tdNetHeader}>
              <View style={styles.tdNetWalletIcon}>
                <Wallet size={16} color={colors.emerald} />
              </View>
              <Text style={[styles.tdNetKicker, { color: colors.textMuted }]}>
                {settlementView.status === "settled" ? "Net payout" : "Expected payout"}
              </Text>
              <View style={styles.tdNetAmountRow}>
                <Text style={[styles.tdNetRupee, { color: colors.textMuted }]}>₹</Text>
                <Text
                  style={[styles.tdNetAmount, { color: colors.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {Math.round(settlementView.amount).toLocaleString("en-IN")}
                </Text>
              </View>
              <View
                style={[
                  panelStyles.statusPill,
                  { backgroundColor: pill.backgroundColor, borderColor: pill.borderColor },
                ]}
              >
                {settlementView.status === "settled" ||
                settlementView.status === "fleet_marked" ? (
                  <CheckCircle2 size={10} color={pill.color} />
                ) : null}
                <Text style={[panelStyles.statusPillText, { color: pill.color }]}>
                  {settlementView.statusLabel}
                </Text>
              </View>
              <Text style={[panelStyles.fleetLine, { color: colors.textMuted }]}>
                Revenue from {revenueFrom}
              </Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <TripPaymentAmountGrid
                expectedAmount={settlementView.expectedAmount}
                paymentAmount={settlementView.amount}
                outstandingAmount={settlementView.outstandingAmount}
                writeOffAmount={settlementView.writeOffAmount}
                hasPaymentShortfall={settlementView.hasPaymentShortfall}
                mode={
                  settlementView.status === "settled"
                    ? "settled"
                    : settlementView.status === "fleet_marked"
                      ? "fleet_marked"
                      : "pending"
                }
                colors={colors}
                isDark={isDark}
              />
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.tdEarningsHeader}>
        <Text style={[styles.tdEarningsHeaderTitle, { color: colors.textMuted }]}>
          Earnings detail
        </Text>
        <Info size={14} color={colors.textMuted} />
      </View>

      <View
        style={[
          styles.tdBreakdownCard,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {!settlementView.isFleetLinked && !isExchangeReceivable ? (
          <View style={styles.tdBreakRow}>
            <View style={styles.tdBreakLeft}>
              <View style={[styles.tdBreakIcon, { backgroundColor: colors.border }]}>
                <Info size={15} color={colors.textMuted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.tdBreakTitle, { color: colors.text }]}>
                  Not fleet-linked
                </Text>
                <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                  Estimated earning and commission apply only on fleet trips
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {isExchangeReceivable ? null : settlementView.showEstimatedEarning ? (
          <View style={styles.tdBreakRow}>
            <View style={styles.tdBreakLeft}>
              <View
                style={[
                  styles.tdBreakIcon,
                  {
                    backgroundColor: settlementView.commissionApplies
                      ? `${colors.emerald}22`
                      : colors.border,
                  },
                ]}
              >
                {settlementView.commissionApplies ? (
                  <Sparkles size={15} color={colors.emerald} />
                ) : (
                  <Banknote size={15} color={colors.textMuted} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.tdBreakTitle, { color: colors.text }]}>
                  {earningTitle}
                </Text>
                <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                  {earningSub}
                </Text>
              </View>
            </View>
            <Text
              style={[
                styles.tdBreakValue,
                {
                  color: settlementView.commissionApplies ? colors.emerald : colors.text,
                },
              ]}
            >
              {earningValue}
            </Text>
          </View>
        ) : settlementView.isFleetLinked ? (
          <View style={styles.tdBreakRow}>
            <View style={styles.tdBreakLeft}>
              <View style={[styles.tdBreakIcon, { backgroundColor: colors.border }]}>
                <Banknote size={15} color={colors.textMuted} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.tdBreakTitle, { color: colors.text }]}>
                  Commission
                </Text>
                <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                  No commission terms on this trip
                </Text>
              </View>
            </View>
            <Text style={[styles.tdBreakValue, { color: colors.textMuted }]}>—</Text>
          </View>
        ) : null}

        {settlementView.otherIncomeAmount > 0 ? (
          <View style={styles.tdBreakRow}>
            <View style={styles.tdBreakLeft}>
              <View style={[styles.tdBreakIcon, { backgroundColor: `${colors.emerald}18` }]}>
                <Receipt size={15} color={colors.emerald} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.tdBreakTitle, { color: colors.text }]}>
                  Other income
                </Text>
                <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                  Bonus / adjustments on this trip
                </Text>
              </View>
            </View>
            <Text style={[styles.tdBreakValue, { color: colors.text }]}>
              {inr(settlementView.otherIncomeAmount)}
            </Text>
          </View>
        ) : null}

        {settlementView.deductionsAmount > 0 ? (
          <View style={styles.tdBreakRow}>
            <View style={styles.tdBreakLeft}>
              <View style={[styles.tdBreakIcon, { backgroundColor: `${Theme.negative}22` }]}>
                <Banknote size={15} color={Theme.negative} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.tdBreakTitle, { color: colors.text }]}>
                  Deductions
                </Text>
                <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                  Ledger deductions for this trip
                </Text>
              </View>
            </View>
            <Text style={[styles.tdBreakValue, { color: Theme.negative }]}>
              -{inr(settlementView.deductionsAmount)}
            </Text>
          </View>
        ) : null}

        <View style={styles.tdBreakRow}>
          <View style={styles.tdBreakLeft}>
            <View style={[styles.tdBreakIcon, { backgroundColor: colors.border }]}>
              <Wallet size={15} color={colors.textMuted} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.tdBreakTitle, { color: colors.text }]}>
                Your expenses
              </Text>
              <Text style={[styles.tdBreakSub, { color: colors.textMuted }]}>
                Logged from your side on this trip
              </Text>
            </View>
          </View>
          <Text style={[styles.tdBreakValue, { color: colors.text }]}>
            {summaryQuery.isLoading ? "…" : inr(totalExpensesInr)}
          </Text>
        </View>
      </View>

      {showRequestFromFleet ? (
        <>
          <TouchableOpacity
            style={[
              styles.tdQueryBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                marginBottom: 8,
              },
            ]}
            activeOpacity={0.85}
            onPress={onRequestFromFleet}
            disabled={requestPaymentLoading}
          >
            {requestPaymentLoading ? (
              <ActivityIndicator size="small" color={colors.emerald} />
            ) : (
              <>
                <Text style={[styles.tdQueryBtnText, { color: colors.textMuted }]}>
                  {settlementView.isSalary
                    ? "Request salary from fleet"
                    : "Request from fleet owner"}
                </Text>
                <ChevronRight size={14} color={colors.textMuted} />
              </>
            )}
          </TouchableOpacity>
          <Text style={[panelStyles.offlineHint, { color: colors.textMuted }]}>
            Request from fleet to follow up, or capture payment when you receive it —
            same as Finance capture payment.
          </Text>
        </>
      ) : null}

      <View style={[styles.tdTimelineHeader, { marginTop: 6 }]}>
        <View style={styles.tdTimelineHeaderIcon}>
          <Wallet size={13} color="#ffffff" strokeWidth={2.2} />
        </View>
        <Text style={[styles.tdTimelineHeaderTitle, { color: colors.text }]} numberOfLines={1}>
          Reimbursement summary
        </Text>
        <View
          style={[
            panelStyles.syncPill,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
          ]}
        >
          <View style={[panelStyles.syncDot, { backgroundColor: colors.emerald }]} />
          <Text style={[panelStyles.syncPillText, { color: colors.emerald }]}>Live</Text>
        </View>
      </View>

      <View
        style={[
          styles.tdTimelineCard,
          { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 },
        ]}
      >
        <View
          style={[
            styles.tdLogDetailsBox,
            panelStyles.metricsBox,
            { backgroundColor: colors.background, borderColor: colors.border, marginBottom: 0 },
          ]}
        >
          <View style={panelStyles.metricGrid}>
            {reimbursementMetrics.map((metric) => (
              <View key={metric.label} style={panelStyles.metricCell}>
                <Text
                  style={[panelStyles.metricLabel, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {metric.label}
                </Text>
                <Text
                  style={[panelStyles.metricValue, { color: colors.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {metric.value}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={[panelStyles.statusBanner, { backgroundColor: colors.emeraldDark }]}>
        <Text style={panelStyles.summaryStatus}>{reimbursementStatusMessage}</Text>
        <Text style={panelStyles.summaryHint}>
          Fleet reviews and marks reimbursements after you submit expenses.
        </Text>
      </View>

      <View style={[styles.tdTimelineHeader, { marginTop: 14 }]}>
        <View style={styles.tdTimelineHeaderIcon}>
          <Activity size={13} color="#ffffff" strokeWidth={2.2} />
        </View>
        <Text style={[styles.tdTimelineHeaderTitle, { color: colors.text }]} numberOfLines={1}>
          Expense log
        </Text>
        <TouchableOpacity
          onPress={openAddExpense}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Add expense"
          style={panelStyles.addExpenseHeaderBtn}
        >
          <Text style={[styles.tdLogMetaV, { color: colors.emerald, fontWeight: "700" }]}>
            Add
          </Text>
          <ChevronRight size={14} color={colors.emerald} strokeWidth={2.4} />
        </TouchableOpacity>
      </View>

      <DriverTripExpenseLogSection
        trip={trip}
        events={costEvents}
        loading={summaryQuery.isLoading}
        initialSelectedEventId={initialSelectedExpenseId}
        onAddExpense={openAddExpense}
        onEditExpense={(event) => {
          const href = tripExpenseEntryEditRoute(trip.id, event.id);
          if (href) router.push(href as Href);
        }}
      />

      <TouchableOpacity
        style={[
          styles.tdQueryBtn,
          { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 12 },
        ]}
        activeOpacity={0.85}
        onPress={() => router.push("/(driver)/wallet" as Href)}
      >
        <Text style={[styles.tdQueryBtnText, { color: colors.textMuted }]}>
          Open earnings & trips
        </Text>
        <ChevronRight size={14} color={colors.textMuted} />
      </TouchableOpacity>

      {showDcoPartyActions ? (
        <DriverCollectFromSheet
          visible={collectFromOpen}
          trip={trip}
          due={captureDue}
          lane={captureLane}
          assignerName={settlementView.fleetName}
          onClose={() => setCollectFromOpen(false)}
          onTagged={() => onPartyTagged?.()}
        />
      ) : null}
    </View>
  );
}

const panelStyles = StyleSheet.create({
  loadingWrap: {
    paddingVertical: 24,
    alignItems: "center",
  },
  incompleteBanner: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  incompleteText: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 15,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 8,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.55,
  },
  fleetLine: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "500",
  },
  partyCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    gap: 10,
  },
  partyKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  partyName: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: Theme.textPrimary,
    marginTop: -4,
  },
  collectBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Theme.actionBtnInk,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  collectBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.buttonDarkText,
  },
  tagBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  tagBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimary,
  },
  offlineHint: {
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  syncPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncPillText: {
    fontSize: 10,
    fontWeight: "600",
  },
  metricsBox: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 14,
    columnGap: 12,
  },
  metricCell: {
    width: "47%",
    flexGrow: 1,
    minWidth: 0,
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 22,
  },
  statusBanner: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    marginBottom: 2,
  },
  summaryStatus: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 19,
    color: "#fff",
    letterSpacing: 0.1,
  },
  summaryHint: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
    color: "rgba(255,255,255,0.82)",
  },
  addExpenseHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
    minHeight: 44,
    justifyContent: "center",
  },
});
