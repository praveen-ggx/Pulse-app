/**
 * Global Compliance Verification work queue — header, counted stage filters,
 * Cards/Table toggle, and Trip/Vehicle/Driver checklist cards.
 */
import { ChromeBelowTopNavLoadingScreen } from "@/components/chromeLoadingScreens";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useAuth } from "@/contexts/AuthContext";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";
import { ComplianceDocumentReviewSheet } from "@/features/tripCompliance/components/ComplianceDocumentReviewSheet";
import { CompliancePaymentConfirmModal } from "@/features/tripCompliance/components/CompliancePaymentConfirmModal";
import { ComplianceTripCard } from "@/features/tripCompliance/components/ComplianceTripCard";
import { ComplianceTripsTable } from "@/features/tripCompliance/components/ComplianceTripsTable";
import { useComplianceProductEnabled } from "@/features/tripCompliance/hooks/useComplianceProductEnabled";
import {
  COMPLIANCE_QUEUE_PAGE_SIZE,
  useComplianceStageFilter,
  useComplianceTripsQuery,
  useInvalidateComplianceTrips,
} from "@/features/tripCompliance/hooks/useComplianceTripsQuery";
import { postCompliancePayment, type ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import { COMPLIANCE_STAGE_FILTER_LABEL, COMPLIANCE_STAGES, type ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import { COMPLIANCE_FILTER_COUNT_TONE, matchesComplianceTripSearch } from "@/features/tripCompliance/utils/complianceCardVisual.util";
import { deriveComplianceQueueReadiness } from "@/features/tripCompliance/utils/complianceReadiness.util";
import { alertMessage } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { ROUTES } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useRouter } from "expo-router";
import { Download, LayoutGrid, Search, Table2, Wallet } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View, type TextStyle, type ViewStyle } from "react-native";

function StageChip({
  label,
  count,
  countColor,
  active,
  onPress,
}: {
  label: string;
  count: number;
  countColor: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {count > 0 ? (
        <Text style={[styles.chipCount, { color: active ? Theme.buttonDarkText : countColor }]}>{count}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function ComplianceScreen() {
  const layout = useLayoutInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { can: canSurface, isLoading: accessLoading } = useMemberAccess();
  const { enabled: complianceEnabled, isLoading: productsLoading } = useComplianceProductEnabled();
  const canViewCompliance = complianceEnabled && canSurface("trip_compliance.tab");
  const canViewDocuments = canSurface("trip_compliance.documents.view");
  const canVerifyDocuments = canSurface("trip_compliance.documents.verify");
  const canMarkVerified = canSurface("trip_compliance.trip.mark_verified");
  const canManageFinance = canSurface("trip_compliance.finance.manage");
  const canViewFinance = canSurface("trip_compliance.finance.view");
  const { user } = useAuth();
  const orgCtx = useOptionalOrganization();
  const currentOrganization = orgCtx?.currentOrganization ?? null;

  const { data, isLoading, isError, error, isFetching, refetch } = useComplianceTripsQuery(0);
  const { stage, setStage, filtered, counts } = useComplianceStageFilter(data?.summaries);
  const invalidate = useInvalidateComplianceTrips();
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [search, setSearch] = useState("");
  const [pay, setPay] = useState<{ summary: ComplianceTripSummary; category: ComplianceLedgerCategory } | null>(null);
  const [paying, setPaying] = useState(false);
  const [review, setReview] = useState<{
    tripId: string;
    documentKey: string | null;
    scope: "trip" | "vehicle" | "driver";
  } | null>(null);

  const contentTopInset = layout.isDesktopWeb ? Layout.desktopTopNavOffset : layout.top;
  const pagePad = Layout.screenPaddingHorizontal;
  const gridGap = Math.min(Layout.spacingMedium, 12);
  const compactToolbar = width < 760;
  const columns = width >= 1100 ? 3 : width >= 760 ? 2 : 1;
  const usableWidth = Math.max(280, width - pagePad * 2);
  const nativeCardWidth =
    columns === 1 ? usableWidth : Math.floor((usableWidth - gridGap * (columns - 1)) / columns);
  const cardSlotStyle =
    Platform.OS === "web"
      ? {
          width: `calc((100% - ${gridGap * (columns - 1)}px) / ${columns})`,
        }
      : { width: nativeCardWidth };

  const openTrip = useCallback(
    (tripId: string) => {
      router.push(ROUTES.tripDetail(tripId) as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const openPay = useCallback((summary: ComplianceTripSummary) => {
    const readiness = deriveComplianceQueueReadiness(summary);
    if (!readiness.readyCategory) {
      alertMessage("Payment blocked", readiness.blockerLines[0] ?? "This trip is not ready for payment.");
      return;
    }
    setPay({ summary, category: readiness.readyCategory });
  }, []);

  const openDetails = useCallback(
    (tripId: string) => {
      router.push(ROUTES.complianceDetail(tripId) as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const visible = useMemo(
    () => filtered.filter((summary) => matchesComplianceTripSearch(summary, search)),
    [filtered, search],
  );

  const reviewingSummary = useMemo(
    () => (review ? (data?.summaries ?? []).find((s) => s.trip.id === review.tripId) : null),
    [review, data?.summaries],
  );

  if (orgCtx === undefined || accessLoading || productsLoading) {
    return <ChromeBelowTopNavLoadingScreen variant="preparing" />;
  }

  if (!canViewCompliance) {
    return (
      <View style={[styles.centered, { paddingTop: contentTopInset }]}>
        <Text style={styles.message}>
          {complianceEnabled
            ? "You don't have access to Compliance."
            : "Compliance is not enabled for this workspace."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: contentTopInset }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: layout.scrollBottomPadding(24),
          paddingHorizontal: pagePad,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={[styles.headerTop, compactToolbar && styles.headerTopStack]}>
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>
              Compliance Verification
            </Text>
            <View style={styles.headerMeta}>
              <View style={styles.activeBadge}>
                <View style={styles.activeDot} />
                <Text style={styles.activeBadgeText}>
                  {counts.all} trips on this page
                </Text>
              </View>
              <Text style={styles.subtitle} numberOfLines={2}>
                Showing the first {COMPLIANCE_QUEUE_PAGE_SIZE} trips
                {data?.hasMore ? " — more exist in this organization." : "."} Stage counts apply to this page only.
              </Text>
            </View>
          </View>
          <View style={[styles.headerActions, compactToolbar && styles.headerActionsStart]}>
            {canViewFinance ? (
              <TouchableOpacity
                style={styles.reportBtn}
                onPress={() => router.push(ROUTES.COMPLIANCE_REPORT as Parameters<typeof router.push>[0])}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Download size={14} color={Theme.textPrimary} strokeWidth={2.2} />
                <Text style={styles.reportBtnText}>Export Report</Text>
              </TouchableOpacity>
            ) : null}
            {canManageFinance ? (
              <TouchableOpacity
                style={styles.bulkBtn}
                onPress={() => router.push(ROUTES.COMPLIANCE_BULK_PAYMENT as Parameters<typeof router.push>[0])}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Wallet size={14} color={Theme.complianceBulkText} strokeWidth={2.2} />
                <Text style={styles.bulkBtnText}>Bulk Payment</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Search size={16} color={Theme.textMuted} strokeWidth={2.2} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search trip ID, vehicle, driver, or client"
          placeholderTextColor={Theme.textMuted}
          style={styles.searchInput as TextStyle}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          accessibilityLabel="Search compliance trips"
        />
      </View>

      <View style={[styles.toolbarRow, compactToolbar && styles.toolbarStack]}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipScrollContent}
        >
          <StageChip
            label="All"
            count={counts.all}
            countColor={COMPLIANCE_FILTER_COUNT_TONE.all}
            active={stage === "all"}
            onPress={() => setStage("all")}
          />
          {COMPLIANCE_STAGES.map((s) => (
            <StageChip
              key={s}
              label={COMPLIANCE_STAGE_FILTER_LABEL[s]}
              count={counts[s]}
              countColor={COMPLIANCE_FILTER_COUNT_TONE[s]}
              active={stage === s}
              onPress={() => setStage(s)}
            />
          ))}
        </ScrollView>
        <View style={[styles.viewToggle, compactToolbar && styles.viewToggleEnd]}>
          <TouchableOpacity
            onPress={() => setViewMode("card")}
            style={[styles.toggleBtn, viewMode === "card" && styles.toggleBtnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: viewMode === "card" }}
          >
            <LayoutGrid size={14} color={viewMode === "card" ? Theme.buttonDarkText : Theme.textMuted} strokeWidth={2.2} />
            <Text style={[styles.toggleBtnText, viewMode === "card" && styles.toggleBtnTextActive]}>Cards</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode("table")}
            style={[styles.toggleBtn, viewMode === "table" && styles.toggleBtnActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: viewMode === "table" }}
          >
            <Table2 size={14} color={viewMode === "table" ? Theme.buttonDarkText : Theme.textMuted} strokeWidth={2.2} />
            <Text style={[styles.toggleBtnText, viewMode === "table" && styles.toggleBtnTextActive]}>Table</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isFetching && data ? (
        <Text style={styles.stale}>Updating queue…</Text>
      ) : null}

      {isLoading && !data ? (
        <Text style={styles.message}>Loading required trip, document, and payment data…</Text>
      ) : isError ? (
        <View>
          <Text style={styles.message}>{(error as Error)?.message ?? "Couldn't load Compliance."}</Text>
          <TouchableOpacity style={styles.reportBtn} onPress={() => void refetch()}>
            <Text style={styles.reportBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : visible.length === 0 ? (
        <Text style={styles.message}>
          {search.trim()
            ? "No trips on this page match your search."
            : data?.summaries?.length
              ? "No trips in this stage on this page."
              : "No trips in this queue page."}
        </Text>
      ) : viewMode === "table" ? (
        <ComplianceTripsTable
          summaries={visible}
          onOpenTrip={openTrip}
          onOpenDetails={openDetails}
          onReview={(tripId, documentKey, scope = "trip") => setReview({ tripId, documentKey, scope })}
          onPay={(tripId) => {
            const summary = visible.find((s) => s.trip.id === tripId);
            if (summary) openPay(summary);
          }}
          canManageFinance={canManageFinance}
        />
      ) : (
        <View style={[styles.cardGrid, { gap: gridGap }]}>
          {visible.map((summary) => (
            <View key={summary.trip.id} style={cardSlotStyle as ViewStyle}>
              <ComplianceTripCard
                summary={summary}
                onReviewDocuments={(scope) => setReview({ tripId: summary.trip.id, documentKey: null, scope })}
                onViewTrip={() => openTrip(summary.trip.id)}
                onOpenDetails={() => openDetails(summary.trip.id)}
                onPay={() => openPay(summary)}
                canManageFinance={canManageFinance}
              />
            </View>
          ))}
        </View>
      )}

      {reviewingSummary ? (
        <ComplianceDocumentReviewSheet
          visible={review != null}
          onClose={() => setReview(null)}
          tripId={reviewingSummary.trip.id}
          tripLabel={`${reviewingSummary.trip.booking_ref ?? reviewingSummary.trip.id.slice(0, 8)} · ${reviewingSummary.trip.client_name || "Client"}`}
          organizationId={currentOrganization?.id ?? ""}
          actorId={user?.uid ?? null}
          documents={reviewingSummary.documents}
          canViewDocuments={canViewDocuments}
          canVerify={canVerifyDocuments}
          canMarkVerified={canMarkVerified}
          canManageFinance={canManageFinance}
          summary={reviewingSummary}
          initialSelectedKey={review?.documentKey ?? null}
          onChanged={() => invalidate(reviewingSummary.trip.id)}
          onPay={() => openPay(reviewingSummary)}
          scope={review?.scope ?? "trip"}
          vehicleId={reviewingSummary.trip.vehicle_id}
          driverId={reviewingSummary.trip.driver_id}
          vehicleDocuments={reviewingSummary.vehicleDocuments ?? []}
          driverDocuments={reviewingSummary.driverDocuments ?? []}
          vehicleLabel={reviewingSummary.trip.vehicle_display_number?.trim() || "Unassigned"}
          driverLabel={reviewingSummary.trip.driver_display_name?.trim() || "Unassigned"}
        />
      ) : null}

      <CompliancePaymentConfirmModal
        visible={pay != null}
        summary={pay?.summary ?? null}
        category={pay?.category ?? null}
        submitting={paying}
        onCancel={() => {
          if (!paying) setPay(null);
        }}
        onConfirm={async (values) => {
          if (!pay || !currentOrganization?.id) return;
          setPaying(true);
          const { error: payError } = await postCompliancePayment({
            organizationId: currentOrganization.id,
            trip: pay.summary.trip,
            category: pay.category,
            amount: values.amount,
            paymentModeId: values.paymentModeId,
            paymentModeLabel: values.paymentModeLabel,
            utr: values.utr,
          });
          setPaying(false);
          if (payError) {
            alertMessage("Couldn't post payment", payError.message);
            return;
          }
          setPay(null);
          invalidate(pay.summary.trip.id);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.compliancePageBg },
  content: { paddingTop: Layout.spacingMedium, gap: Layout.spacingMedium },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Theme.compliancePageBg },
  header: { gap: Layout.spacingSmall },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  headerTopStack: { flexDirection: "column", alignItems: "stretch" },
  titleBlock: { flex: 1, minWidth: 0, gap: 6 },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    lineHeight: 24,
  },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  activeBadge: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Theme.complianceActiveBadgeBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Theme.complianceActiveBadgeFg },
  activeBadgeText: { fontSize: 11, fontWeight: "700", color: Theme.complianceActiveBadgeFg },
  subtitle: { flex: 1, minWidth: 160, fontSize: 13, color: Theme.textMuted, lineHeight: 18 },
  headerActions: { flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  headerActionsStart: { justifyContent: "flex-start" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimary,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as const } : null),
  },
  bulkBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Theme.complianceBulk,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bulkBtnText: { fontSize: 13, fontWeight: "700", color: Theme.complianceBulkText },
  reportBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reportBtnText: { fontSize: 13, fontWeight: "700", color: Theme.textPrimary },
  toolbarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  toolbarStack: { flexDirection: "column", alignItems: "stretch" },
  chipScroll: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  chipScrollContent: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2, paddingRight: 4 },
  chip: {
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipActive: {
    backgroundColor: Theme.buttonDark,
    borderColor: Theme.buttonDark,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  chipTextActive: { color: Theme.buttonDarkText },
  chipCount: { fontSize: 12, fontWeight: "800" },
  viewToggle: {
    flexShrink: 0,
    flexDirection: "row",
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    gap: 2,
  },
  viewToggleEnd: { alignSelf: "flex-end" },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 40,
  },
  toggleBtnActive: { backgroundColor: Theme.buttonDark },
  toggleBtnText: { fontSize: 12, fontWeight: "700", color: Theme.textMuted },
  toggleBtnTextActive: { color: Theme.buttonDarkText },
  cardGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch" },
  message: { fontSize: 14, color: Theme.textMuted, textAlign: "center", paddingVertical: 28, lineHeight: 20 },
  stale: { fontSize: 12, color: Theme.textMuted },
});
