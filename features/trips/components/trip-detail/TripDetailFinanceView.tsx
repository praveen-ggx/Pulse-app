/**
 * Trip detail — Trip Details layout (aligned with reference):
 * Grid Tracking Node, Protocol Specification (financial blueprint), Adjustment Registry,
 * Supplier Sync bar, Associated Handshakes.
 */
import { ProvisionCnDnImpactTag } from "@/features/trips/components/trip-detail/adjustment/ProvisionCnDnImpactTag";
import { TripFinancialCard } from "@/components/TripFinancialCard";
import Theme from "@/constants/Theme";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDoubleEntryDisplayLabel } from "@/features/finance/accounting/accountingModel";
import type { TripLedgerQuickTag } from "@/features/finance/ledger/tripLedgerEntryChooser";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { ExchangePaymentsPanel } from "@/features/marketplace/components/ExchangePaymentsPanel";
import { computeTripEntryFinancialSnapshot } from "@/features/finance/utils/computeTripEntryFinancials.util";
import { computePartnerIndentFreightCost } from "@/features/finance/utils/partnerIndentFreightCost.util";
import type { TripAssignmentAuditRow } from "@/features/trips/services/trip-assignment-audit.service";
import type {
    TripAdjustment,
    TripAdjustmentImpact,
    TripAdjustmentType,
} from "@/features/trips/services/tripAdjustments";
import {
    adjustedCost,
    adjustedRevenue,
    COST_REASON_OPTIONS,
    isAdjustmentVoided,
    REVENUE_REASON_OPTIONS,
} from "@/features/trips/services/tripAdjustments";
import type { TripRow } from "@/features/trips/services/trips.service";
import { formatTrackingDateTime } from "@/features/trips/utils/formatTrackingTimestamp.util";
import { splitTripLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { ComponentProps, ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import {
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from "react-native";

/** Enable LayoutAnimation on Android (one-time no-op on iOS). */
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function formatLedgerDateShort(s: string | null | undefined): string {
  if (!s) return "—";
  const d = (s ?? "").slice(0, 10);
  if (!d) return "—";
  const [, m, day] = d.split("-");
  const months = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");
  return `${day} ${months[Number(m) - 1] ?? m}`;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0, minimumFractionDigits: 0 })}`;
}

function toTitleCase(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "—";
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const FINANCE_PROTOCOL_CHIPS = [
  "Loading",
  "Unloading",
  "Detention",
  "Damage",
  "Toll",
  "RTO",
] as const;

function protocolSupplierChipAdjustment(
  chip: (typeof FINANCE_PROTOCOL_CHIPS)[number],
): {
  type: TripAdjustmentType;
  impact: TripAdjustmentImpact;
  reasonSeed: string;
} {
  if (chip === "Loading")
    return { type: "cost", impact: "plus", reasonSeed: "Loading Charges" };
  if (chip === "Unloading")
    return { type: "cost", impact: "plus", reasonSeed: "Unloading Charges" };
  if (chip === "Detention")
    return { type: "cost", impact: "plus", reasonSeed: "Detention" };
  if (chip === "Damage")
    return { type: "cost", impact: "plus", reasonSeed: "Damages / Missing" };
  if (chip === "Toll")
    return { type: "cost", impact: "plus", reasonSeed: "Pass Debit" };
  return { type: "cost", impact: "plus", reasonSeed: "Other" };
}

/**
 * Derive tracking step 1–4 from status for progress bar.
 * Aligns with DB + driver app: assigned → 1, in_progress → 2, completed → 4.
 * Legacy/alternate labels (in_transit, delivered, etc.) supported for compatibility.
 */
function trackingStepFromStatus(status: string | null | undefined): number {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" || s === "delivered" || s === "done") return 4;
  if (s === "arrived" || s === "at_destination" || s === "at_drop") return 3;
  if (
    s === "in_progress" ||
    s === "in_transit" ||
    s === "dispatched" ||
    s === "picked_up" ||
    s === "pickup"
  )
    return 2;
  return 1; // draft, assigned, cancelled, or unknown
}

/** Trip detail screen: Tracking (status, docs, map, log) vs Finance (ledger, billing, transactions). */
export type TripDetailTab = "tracking" | "finance";

export interface TripDetailFinanceViewProps {
  trip: TripRow;
  tripLedgerEntries: LedgerRow[];
  /** Adjustments to revenue (sale) or cost (supplier) — not in/out ledger. */
  adjustments?: TripAdjustment[];
  driverName?: string | null;
  /** Driver rating (1–5) when trip is completed; shown in tracking card. */
  driverRating?: number | null;
  vehicleLabel?: string | null;
  /** Saves trip adjustment (same behavior as Add Adjustment modal). */
  onSaveAdjustment?: (params: {
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    amount: number;
    reason: string;
  }) => void | Promise<void>;
  /** Opens full-page / modal adjustment wizard (mobile). When set, inline form is hidden. */
  onOpenAdjustment?: (preset: {
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    reasonSeed?: string | null;
  }) => void;
  /** Soft-void an adjustment (requires reason); parent persists void state. */
  onRemoveAdjustment?: (
    adjustmentId: string,
    voidReason: string,
  ) => void | Promise<void>;
  /** Assignment / reassignment history for this trip (newest first). */
  assignmentAuditRows?: TripAssignmentAuditRow[];
  /** Resolved driver id → display name for assignment audit rows. */
  assignmentDriverNames?: Record<string, string>;
  /** Resolved vehicle id → display label for assignment audit rows. */
  assignmentVehicleLabels?: Record<string, string>;
  /** For aggregate trips: current OTP (code + expiry) for display in Assignments. */
  tripOtp?: { code: string | null; expires_at: string | null } | null;
  /** For aggregate trips: partner/supplier display name. */
  partnerName?: string | null;
  /** Optional block to render in Assignments section (e.g. TripAssignmentBlock for change/reassign). */
  assignmentBlock?: ReactNode;
  /** Current user id (auth) so Activity Log can show "by you" when changed_by matches. */
  currentUserId?: string | null;
  /** When true, show driver-offline state on tracking card and in live tracking modal. */
  isDriverOffline?: boolean;
  /** When set, the trip status card is tappable and opens the tracking view. */
  onOpenTracking?: () => void;
  /** Documents for this trip (e.g. manifest, vehicle docs, POD). When set, doc section is shown and onOpenDoc called when user taps a doc. */
  tripDocs?: TripDocItem[];
  /** Called when user taps a document to preview. */
  onOpenDoc?: (doc: TripDocItem) => void;
  /** When set, used to determine if we're the trip owner. Owner + indent => revenue = supplier_rate. Client (non-owner) => client_price. */
  viewerOrgId?: string | null;
  /** Display name of the client for this trip */
  clientName?: string | null;
  /** If the viewer is the supplier and subcontracted the trip, the subcontract rate. */
  subcontractRate?: number | null;
  /** Current org display name; used when the supplier viewer cannot resolve the linked supplier row (e.g. indent / RLS). */
  viewerOrganizationName?: string | null;
  /** When set with `onTripDetailTabChange`, the view uses two tabs (full trip detail screen). */
  tripDetailTab?: TripDetailTab | null;
  onTripDetailTabChange?: (tab: TripDetailTab) => void;
  /** Suppress the internal Tracking/Finance tab bar (web uses its own top-level tabs). */
  hideInternalTabBar?: boolean;
  /** Tracking tab: map + vehicle + driver activity (parent renders `TrackingMapBlock` + timeline). */
  trackingTabExtras?: ReactNode;
  /** Opens ledger-sync from the trip financial snapshot (respects market vs asset). */
  onTripFinancialLedgerCta?: (tag: TripLedgerQuickTag) => void;
}

export type { DocCategory, TripDocItem } from './tripDocTypes';
import { isEwayBillVaultDoc, type TripDocItem } from './tripDocTypes';

const DEFAULT_TRIP_DOCS: TripDocItem[] = [
  {
    id: "manifest",
    label: "Trip Manifest",
    type: "PDF",
    status: "Pending",
    category: "trip",
  },
  {
    id: "vehicle-documents",
    label: "Vehicle Document",
    type: "DOCS",
    status: "Pending",
    category: "vehicle",
  },
  {
    id: "pod",
    label: "Driver POD",
    type: "JPG",
    status: "Pending",
    category: "driver",
  },
];

function TripDocsGrid({
  tripDocs,
  onOpenDoc,
}: {
  tripDocs: TripDocItem[];
  onOpenDoc?: (doc: TripDocItem) => void;
}) {
  if (tripDocs.length === 0) return null;

  return (
    <View style={styles.docSection}>
      <View style={styles.docSectionHeader}>
        <FontAwesome name="paperclip" size={10} color={Theme.textMuted} />
        <Text style={styles.docSectionTitle}>Documents</Text>
      </View>
      <View style={styles.docGrid}>
        {tripDocs.filter((doc) => !isEwayBillVaultDoc(doc)).map((doc) => {
          const isUploaded =
            doc.status === "Uploaded" || doc.status === "Verified";
          const statusColor =
            doc.status === "Verified"
              ? Theme.darkGreen
              : isUploaded
                ? Theme.primary
                : Theme.textMuted;
          const statusIcon: ComponentProps<typeof FontAwesome>["name"] =
            doc.status === "Pending" ? "clock-o" : "check-circle";

          return (
            <TouchableOpacity
              key={doc.id}
              style={styles.docCard}
              onPress={() => onOpenDoc?.(doc)}
              activeOpacity={0.85}
              disabled={!onOpenDoc}
              accessibilityLabel={`${doc.label}, ${doc.status}`}
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.docCardIconWrap,
                  isUploaded
                    ? styles.docCardIconWrapUploaded
                    : styles.docCardIconWrapPending,
                ]}
              >
                <FontAwesome
                  name={isUploaded ? "file-text-o" : "file-o"}
                  size={28}
                  color={isUploaded ? Theme.primary : Theme.textMuted}
                />
              </View>
              <Text style={styles.docCardLabel} numberOfLines={2}>
                {doc.label}
              </Text>
              <Text style={styles.docCardType} numberOfLines={1}>
                {doc.type}
              </Text>
              <View style={styles.docCardStatus}>
                <FontAwesome
                  name={statusIcon}
                  size={12}
                  color={statusColor}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function formatAssignmentDate(iso: string | null | undefined): string {
  return formatTrackingDateTime(iso);
}

/** Uppercase format for Activity Log: "12 MAR 2026 AT 2:07 PM" */
function formatAssignmentDateActivityMeta(
  iso: string | null | undefined,
): string {
  const s = formatAssignmentDate(iso);
  if (s === "—") return s;
  return s.toUpperCase().replace(", ", " AT ");
}

export function TripDetailFinanceView({
  trip,
  tripLedgerEntries,
  adjustments = [],
  driverName,
  driverRating,
  vehicleLabel,
  assignmentAuditRows = [],
  assignmentDriverNames = {},
  assignmentVehicleLabels = {},
  tripOtp: _tripOtp = null,
  partnerName = null,
  onSaveAdjustment,
  onOpenAdjustment,
  onRemoveAdjustment,
  assignmentBlock,
  currentUserId = null,
  isDriverOffline = false,
  onOpenTracking,
  tripDocs = DEFAULT_TRIP_DOCS,
  onOpenDoc,
  viewerOrgId = null,
  clientName,
  subcontractRate,
  viewerOrganizationName = null,
  tripDetailTab = null,
  onTripDetailTabChange,
  hideInternalTabBar = false,
  trackingTabExtras,
  onTripFinancialLedgerCta,
}: TripDetailFinanceViewProps) {
  const { t } = useLanguage();
  const tabsEnabled =
    typeof onTripDetailTabChange === "function" && tripDetailTab != null;
  const [showFinanceProvisionPanel, setShowFinanceProvisionPanel] =
    useState(false);
  const [draftType, setDraftType] = useState<TripAdjustmentType>("revenue");
  const [draftImpact, setDraftImpact] = useState<TripAdjustmentImpact>("plus");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftReason, setDraftReason] = useState("");
  const [draftOtherReason, setDraftOtherReason] = useState("");
  const [voidPromptAdj, setVoidPromptAdj] = useState<TripAdjustment | null>(
    null,
  );
  const [voidPromptReason, setVoidPromptReason] = useState("");
  const activeTab: TripDetailTab = tripDetailTab ?? "finance";
  const showTrackingSection = !tabsEnabled || activeTab === "tracking";
  const showFinanceSection = !tabsEnabled || activeTab === "finance";
  const showAssignmentsSection = !tabsEnabled || activeTab === "tracking";
  const routeStr =
    `${trip.pickup_area ?? "—"} → ${trip.drop_location ?? "—"}`.trim() || "—";
  const reasonOptions =
    draftType === "revenue" ? REVENUE_REASON_OPTIONS : COST_REASON_OPTIONS;
  const selectedInlineReason =
    draftReason === "Other"
      ? draftOtherReason.trim() || "Other"
      : draftReason.trim();
  const inlineAmountNum = Math.round(
    parseFloat(draftAmount.replace(/,/g, "")) || 0,
  );
  const canSaveInlineAdjustment =
    inlineAmountNum > 0 && (!!selectedInlineReason || reasonOptions.length > 0);

  const openInlineAdjustment = useCallback(
    (
      preset: {
        type: TripAdjustmentType;
        impact: TripAdjustmentImpact;
        reasonSeed?: string | null;
      } | null = null,
    ) => {
      if (preset) {
        setDraftType(preset.type);
        setDraftImpact(preset.impact);
        const seed = (preset.reasonSeed ?? "").trim();
        const options =
          preset.type === "revenue"
            ? REVENUE_REASON_OPTIONS
            : COST_REASON_OPTIONS;
        if (seed && (options as readonly string[]).includes(seed)) {
          setDraftReason(seed);
          setDraftOtherReason("");
        } else if (seed) {
          setDraftReason("Other");
          setDraftOtherReason(seed);
        } else {
          setDraftReason("");
          setDraftOtherReason("");
        }
      } else {
        setDraftType("revenue");
        setDraftImpact("plus");
        setDraftReason("");
        setDraftOtherReason("");
      }
      setDraftAmount("");
    },
    [],
  );

  const handleInlineSaveAdjustment = useCallback(async () => {
    if (!onSaveAdjustment || !canSaveInlineAdjustment) return;
    const fallbackReason =
      draftType === "revenue" ? "Revenue adjustment" : "Cost adjustment";
    await onSaveAdjustment({
      type: draftType,
      impact: draftImpact,
      amount: inlineAmountNum,
      reason: selectedInlineReason || fallbackReason,
    });
    setDraftAmount("");
    setDraftReason("");
    setDraftOtherReason("");
  }, [
    onSaveAdjustment,
    canSaveInlineAdjustment,
    draftType,
    draftImpact,
    inlineAmountNum,
    selectedInlineReason,
  ]);
  const customerSales = Number(trip.client_price ?? 0) || 0;
  const supplierCost = Number(trip.supplier_rate ?? 0) || 0;
  // Owner = client (shipper), revenue = client_price. Non-owner supplier
  // (indent OR manual/Aggregate-assigned — gated on supplier_id, matching
  // isAggregateTrip()) = revenue = supplier_rate. get_trip_detail_bundle masks
  // client_price/margin/etc. to null for a non-owner supplier regardless of
  // indent_id, so this must recognize the same trips or a manual Aggregate
  // trip shows a false ₹0 sale instead of the supplier's real supplier_rate.
  const isTripOwner =
    viewerOrgId != null &&
    trip.organization_id != null &&
    trip.organization_id === viewerOrgId;
  const isPartnerSettlementView =
    String(trip.supplier_id ?? "").trim().length > 0 && !isTripOwner;
  /** Non-owner supplier: supplier_rate. Otherwise: client_price. */
  const sales = isPartnerSettlementView ? supplierCost : customerSales;
  /** Owner: cost = supplier_rate. Non-owner supplier: asset-style freight cost (see helper). */
  const cost = isPartnerSettlementView
    ? computePartnerIndentFreightCost(subcontractRate)
    : supplierCost;
  const billingOriginalLabel = isPartnerSettlementView
    ? "Partner Amount"
    : "Original Price";
  const billingFinalLabel = isPartnerSettlementView
    ? "Final Partner Amount"
    : "Final Price";
  const billingSectionTitle = isPartnerSettlementView
    ? "Partner Settlement"
    : "Customer Billing";

  const supplierNameFromLedger = useMemo(() => {
    for (const tx of tripLedgerEntries) {
      if (tx.contact_type !== "supplier") continue;
      if (Number(tx.amount_out ?? 0) <= 0) continue;
      const p = (tx.party_name ?? "").trim();
      if (p && p !== "—") return p;
    }
    return null;
  }, [tripLedgerEntries]);

  const supplierDisplayName = useMemo(() => {
    const viewerLc = (viewerOrganizationName ?? "").trim().toLowerCase();
    const usable = (value: string | null | undefined) => {
      const v = (value ?? "").trim();
      if (!v || v === "—") return null;
      if (viewerLc && v.toLowerCase() === viewerLc) return null;
      return v;
    };
    const fromTrip = usable(partnerName ?? trip.supplier_name);
    if (fromTrip) return fromTrip;
    if (usable(supplierNameFromLedger)) return usable(supplierNameFromLedger);
    return null;
  }, [
    partnerName,
    trip.supplier_name,
    supplierNameFromLedger,
    viewerOrganizationName,
  ]);

  const adjSales = useMemo(
    () => adjustedRevenue(sales, adjustments),
    [sales, adjustments],
  );
  const adjCost = useMemo(
    () => adjustedCost(cost, adjustments),
    [cost, adjustments],
  );
  const adjMargin = adjSales - adjCost;

  const tripFinanceSnapshot = useMemo(() => {
    if (!viewerOrgId) return null;
    const cp = Number(trip.client_price ?? 0) || 0;
    const sr = Number(trip.supplier_rate ?? 0) || 0;
    if (cp <= 0 && sr <= 0) return null;
    return computeTripEntryFinancialSnapshot(
      {
        id: trip.id,
        organization_id: trip.organization_id,
        indent_id: trip.indent_id ?? null,
        client_id: trip.client_id,
        supplier_id: trip.supplier_id,
        driver_id: trip.driver_id,
        client_price: trip.client_price,
        supplier_rate: trip.supplier_rate,
        driver_commission: trip.driver_commission,
        distance: trip.distance,
        is_cross_org_supplier:
          (trip as { is_cross_org_supplier?: boolean | null })
            .is_cross_org_supplier ?? null,
        subcontract_rate: subcontractRate ?? null,
        trip_payout_mode: trip.trip_payout_mode ?? null,
        vehicle_id: trip.vehicle_id ?? null,
      },
      tripLedgerEntries,
      viewerOrgId,
      null,
    );
  }, [trip, tripLedgerEntries, viewerOrgId, subcontractRate]);

  const receivedFromCustomer = useMemo(
    () => tripLedgerEntries.reduce((s, tx) => s + Number(tx.amount_in ?? 0), 0),
    [tripLedgerEntries],
  );
  const dueFromCustomer = Math.max(0, adjSales - receivedFromCustomer);

  /** Paid to supplier: outflows linked to this trip (supplier payments). Due vs adjusted cost. */
  const paidToSupplier = useMemo(
    () =>
      tripLedgerEntries.reduce((s, tx) => s + Number(tx.amount_out ?? 0), 0),
    [tripLedgerEntries],
  );
  const supplierDue = Math.max(0, adjCost - paidToSupplier);

  /** Commission / payments by party type (for display when present). */
  const { supplierCommission, driverCommission } = useMemo(() => {
    let supplier = 0;
    let driver = 0;
    for (const tx of tripLedgerEntries) {
      const out = Number(tx.amount_out ?? 0);
      if (out <= 0) continue;
      const ct = tx.contact_type;
      if (ct === "supplier") supplier += out;
      else if (ct === "driver") driver += out;
    }
    return { supplierCommission: supplier, driverCommission: driver };
  }, [tripLedgerEntries]);

  const _receivableTransactions = useMemo(
    () => tripLedgerEntries.filter((tx) => Number(tx.amount_in ?? 0) > 0),
    [tripLedgerEntries],
  );
  const _payableTransactions = useMemo(
    () => tripLedgerEntries.filter((tx) => Number(tx.amount_out ?? 0) > 0),
    [tripLedgerEntries],
  );

  const revenueAdjustments = useMemo(
    () => adjustments.filter((a) => a.type === "revenue"),
    [adjustments],
  );
  const costAdjustments = useMemo(
    () => adjustments.filter((a) => a.type === "cost"),
    [adjustments],
  );

  const trackingStep = useMemo(
    () => trackingStepFromStatus(trip.status),
    [trip.status],
  );
  const statusLabel =
    trip.driver_id == null
      ? "Unassigned"
      : (trip.status ?? "Active").replace(/_/g, " ");
  const trackingLocation = routeStr !== "—" ? routeStr : "Unmapped";

  const handleTrackingCardPress = () => {
    onOpenTracking?.();
  };

  return (
    <View style={styles.content}>
      {tabsEnabled && !hideInternalTabBar ? (
        <View style={styles.detailTabBar}>
          <TouchableOpacity
            style={[
              styles.detailTabBtn,
              activeTab === "tracking" && styles.detailTabBtnOn,
            ]}
            onPress={() => onTripDetailTabChange?.("tracking")}
            activeOpacity={0.88}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "tracking" }}
          >
            <Text
              style={[
                styles.detailTabBtnTxt,
                activeTab === "tracking" && styles.detailTabBtnTxtOn,
              ]}
            >
              Tracking
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.detailTabBtn,
              activeTab === "finance" && styles.detailTabBtnOn,
            ]}
            onPress={() => onTripDetailTabChange?.("finance")}
            activeOpacity={0.88}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === "finance" }}
          >
            <Text
              style={[
                styles.detailTabBtnTxt,
                activeTab === "finance" && styles.detailTabBtnTxtOn,
              ]}
            >
              Finance
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showTrackingSection ? (
        <>
          <View style={styles.manifestCard}>
            <View style={styles.sectionKickerRow}>
              <View style={styles.sectionKickerBar} />
              <Text style={styles.sectionKicker}>Voyage Manifest</Text>
            </View>
            <View style={styles.manifestRouteRow}>
              <View style={styles.manifestDotsCol}>
                <View style={[styles.manifestDot, styles.manifestDotStart]} />
                <View style={styles.manifestRouteLine} />
                <View style={[styles.manifestDot, styles.manifestDotEnd]} />
              </View>
              <View style={styles.manifestTextCol}>
                <ManifestRouteStop location={trip.pickup_area} />
                <ManifestRouteStop location={trip.drop_location} />
              </View>
            </View>
            <View style={styles.manifestMetaRow}>
              <View style={styles.manifestMetaCell}>
                <Text style={styles.manifestMetaLabel}>Client</Text>
                <Text style={styles.manifestMetaValue} numberOfLines={1}>
                  {(clientName ?? partnerName ?? "—").trim() || "—"}
                </Text>
              </View>
              <View style={styles.manifestMetaCell}>
                <Text style={styles.manifestMetaLabel}>Material</Text>
                <Text style={styles.manifestMetaValue} numberOfLines={1}>
                  {toTitleCase(trip.load_type ?? "General Material")}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.operatorCardModern}>
            <View style={styles.operatorBadgeModern}>
              <FontAwesome name="user" size={15} color={Theme.textMuted} />
              <View style={styles.operatorTextBlock}>
                <Text style={styles.operatorLabelModern}>Operator</Text>
                <Text style={styles.operatorValueModern}>
                  {driverName?.trim() ? driverName : "Unassigned"}
                </Text>
              </View>
            </View>
            <Text style={styles.operatorSubModern}>
              {vehicleLabel?.trim()
                ? vehicleLabel
                : "Vehicle pending assignment"}
            </Text>
          </View>

          <View style={styles.assignmentCardModern}>
            <Text style={styles.assignmentTitleModern}>Current Assignment</Text>
            <View style={styles.assignmentRowModern}>
              <View style={styles.assignmentIconBox}>
                <FontAwesome name="user" size={14} color={Theme.textMuted} />
              </View>
              <View style={styles.assignmentTextWrap}>
                <Text style={styles.assignmentMetaLabel}>Driver</Text>
                <Text style={styles.assignmentMetaValue}>
                  {driverName?.trim() ? driverName : "Unassigned"}
                </Text>
              </View>
            </View>
            <View style={styles.assignmentRowModern}>
              <View style={styles.assignmentIconBox}>
                <FontAwesome name="truck" size={13} color={Theme.textMuted} />
              </View>
              <View style={styles.assignmentTextWrap}>
                <Text style={styles.assignmentMetaLabel}>Vehicle</Text>
                <Text style={styles.assignmentMetaValue}>
                  {vehicleLabel?.trim() ? vehicleLabel : "Pending"}
                </Text>
              </View>
            </View>
            <View style={styles.assignmentFootRow}>
              <Text style={styles.assignmentFootText}>
                OTP will be generated during assignment confirmation flow.
              </Text>
              {onOpenTracking ? (
                <TouchableOpacity
                  onPress={handleTrackingCardPress}
                  style={styles.assignmentActionBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.assignmentActionBtnText}>
                    Open Tracking
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* keep quick progress card for status signal */}
          <TouchableOpacity
            style={styles.trackingCard}
            onPress={handleTrackingCardPress}
            activeOpacity={0.92}
            accessible
            accessibilityLabel={
              isDriverOffline
                ? "Driver offline - Open tracking"
                : "Open tracking"
            }
            accessibilityRole="button"
          >
            <View style={styles.trackingHeader}>
              <View style={styles.trackingHeaderLeft}>
                <View
                  style={[
                    styles.trackingStatusDot,
                    isDriverOffline && styles.trackingStatusDotOffline,
                  ]}
                />
                <Text
                  style={[
                    styles.trackingLabel,
                    isDriverOffline && styles.trackingLabelOffline,
                  ]}
                >
                  {isDriverOffline ? "Driver Offline" : "Journey Progress"}
                </Text>
              </View>
              {onOpenTracking ? (
                <View style={styles.trackingLiveMapBadge}>
                  <FontAwesome
                    name="location-arrow"
                    size={10}
                    color={Theme.primary}
                  />
                  <Text style={styles.trackingLiveMapText}>Open Maps</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.progressRow}>
              {[1, 2, 3, 4].map((step) => (
                <View
                  key={step}
                  style={[
                    styles.progressSegment,
                    step <= trackingStep && styles.progressSegmentActive,
                  ]}
                />
              ))}
            </View>
            <View style={styles.trackingFooter}>
              <View style={styles.trackingFooterLeft}>
                <FontAwesome
                  name="location-arrow"
                  size={10}
                  color={isDriverOffline ? Theme.negative : Theme.positive}
                  style={styles.clockIcon}
                />
                <Text
                  style={[
                    styles.trackingFooterValue,
                    isDriverOffline && styles.trackingFooterValueOffline,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
              <View style={styles.trackingFooterRight}>
                <Text
                  style={[
                    styles.trackingFooterValueAccent,
                    isDriverOffline && styles.trackingFooterValueAccentOffline,
                  ]}
                  numberOfLines={1}
                >
                  {driverRating != null && driverRating > 0
                    ? `${driverName ?? "Driver"} · ${driverRating.toFixed(1)} ★`
                    : trackingLocation}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </>
      ) : null}

      {/* Documents */}
      {showTrackingSection && tripDocs.length > 0 ? (
        <TripDocsGrid tripDocs={tripDocs} onOpenDoc={onOpenDoc} />
      ) : null}

      {showTrackingSection && trackingTabExtras ? (
        <View style={styles.trackingTabExtrasWrap}>{trackingTabExtras}</View>
      ) : null}

      {/* Unified Trip Finances Card + ledger modal + transactions */}
      {showFinanceSection ? (
        <>
          <View style={styles.financeCard}>
            <View style={styles.financeHeader}>
              <View>
                <Text style={styles.financeTitle}>Trip Finances</Text>
                {(clientName ?? partnerName) && (
                  <View style={styles.financeSubtitleRow}>
                    <Text style={styles.financeSubtitle}>
                      {clientName ?? partnerName}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.financeProfitWrap}>
                <Text style={styles.financeProfitLabel}>Profit</Text>
                <Text style={styles.financeProfitValue}>
                  {formatINR(adjMargin)}
                </Text>
              </View>
            </View>

            {onTripFinancialLedgerCta && tripFinanceSnapshot ? (
              <View style={styles.tripFinanceSnapshotWrap}>
                <TripFinancialCard
                  snapshot={tripFinanceSnapshot}
                  selectedTag={null}
                  onDuePress={(tag) => onTripFinancialLedgerCta(tag)}
                  onAddExpense={
                    tripFinanceSnapshot.trip_type === "asset"
                      ? () => onTripFinancialLedgerCta("vehicle")
                      : undefined
                  }
                  variant="stack"
                />
              </View>
            ) : null}

            <ExchangePaymentsPanel tripId={trip.id} />

            {/* Customer Billing Section */}
            <View style={styles.financeSection}>
              <Text style={styles.financeSectionTitle}>
                {billingSectionTitle}
              </Text>
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>{billingOriginalLabel}</Text>
                <Text style={styles.financeValue}>{formatINR(sales)}</Text>
              </View>

              {revenueAdjustments.length > 0 && (
                <View style={styles.financeAdjustmentsWrap}>
                  {revenueAdjustments.map((adj) => {
                    const voided = isAdjustmentVoided(adj);
                    return (
                      <View key={adj.id} style={styles.financeAdjRow}>
                        <View style={styles.financeAdjLeftCol}>
                          <Text
                            style={[
                              styles.financeAdjReason,
                              voided && styles.financeAdjVoided,
                            ]}
                            numberOfLines={voided ? 2 : 1}
                          >
                            {adj.impact === "plus" ? "+" : "−"} {adj.reason}
                          </Text>
                          {voided ? (
                            <Text
                              style={styles.financeAdjVoidNote}
                              numberOfLines={3}
                            >
                              Voided: {(adj.void_reason ?? "").trim() || "—"}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.financeAdjRight}>
                          <Text
                            style={[
                              styles.financeAdjAmount,
                              voided && styles.financeAdjVoided,
                              adj.impact === "plus"
                                ? { color: Theme.darkGreen }
                                : { color: Theme.teslaRed },
                            ]}
                          >
                            {adj.impact === "plus" ? "+" : "−"}
                            {formatINR(adj.amount)}
                          </Text>
                          {onRemoveAdjustment && !voided ? (
                            <TouchableOpacity
                              onPress={() => {
                                setVoidPromptAdj(adj);
                                setVoidPromptReason("");
                              }}
                              hitSlop={8}
                              style={styles.financeAdjRemoveBtn}
                              accessibilityLabel="Void adjustment"
                            >
                              <FontAwesome
                                name="times"
                                size={14}
                                color={Theme.textMuted}
                              />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.financeTotalRow}>
                <Text style={styles.financeTotalLabel}>
                  {billingFinalLabel}
                </Text>
                <Text style={styles.financeTotalValue}>
                  {formatINR(adjSales)}
                </Text>
              </View>

              <View style={styles.financeStatusBox}>
                <View style={styles.financeStatusCol}>
                  <Text style={styles.financeStatusLabel}>Received</Text>
                  <Text style={styles.financeStatusValueGreen}>
                    {formatINR(receivedFromCustomer)}
                  </Text>
                </View>
                <View style={styles.financeStatusDivider} />
                <View style={styles.financeStatusColRight}>
                  <Text style={styles.financeStatusLabel}>
                    Pending to Collect
                  </Text>
                  <Text
                    style={[
                      styles.financeStatusValue,
                      dueFromCustomer > 0 && styles.financeStatusValueRed,
                    ]}
                  >
                    {formatINR(dueFromCustomer)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.financeSectionDivider} />

            {/* Supplier Payments Section */}
            <View style={styles.financeSection}>
              <Text style={styles.financeSectionTitle}>Supplier Payments</Text>
              {supplierDisplayName ? (
                <Text style={styles.financeSectionSubtitle}>
                  {supplierDisplayName}
                </Text>
              ) : null}
              <View style={styles.financeRow}>
                <Text style={styles.financeLabel}>Original Cost</Text>
                <Text style={styles.financeValue}>{formatINR(cost)}</Text>
              </View>

              {costAdjustments.length > 0 && (
                <View style={styles.financeAdjustmentsWrap}>
                  {costAdjustments.map((adj) => {
                    const voided = isAdjustmentVoided(adj);
                    return (
                      <View key={adj.id} style={styles.financeAdjRow}>
                        <View style={styles.financeAdjLeftCol}>
                          <Text
                            style={[
                              styles.financeAdjReason,
                              voided && styles.financeAdjVoided,
                            ]}
                            numberOfLines={voided ? 2 : 1}
                          >
                            {adj.impact === "plus" ? "+" : "−"} {adj.reason}
                          </Text>
                          {voided ? (
                            <Text
                              style={styles.financeAdjVoidNote}
                              numberOfLines={3}
                            >
                              Voided: {(adj.void_reason ?? "").trim() || "—"}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.financeAdjRight}>
                          <Text
                            style={[
                              styles.financeAdjAmount,
                              voided && styles.financeAdjVoided,
                              adj.impact === "plus"
                                ? { color: Theme.darkGreen }
                                : { color: Theme.teslaRed },
                            ]}
                          >
                            {adj.impact === "plus" ? "+" : "−"}
                            {formatINR(adj.amount)}
                          </Text>
                          {onRemoveAdjustment && !voided ? (
                            <TouchableOpacity
                              onPress={() => {
                                setVoidPromptAdj(adj);
                                setVoidPromptReason("");
                              }}
                              hitSlop={8}
                              style={styles.financeAdjRemoveBtn}
                              accessibilityLabel="Void adjustment"
                            >
                              <FontAwesome
                                name="times"
                                size={14}
                                color={Theme.textMuted}
                              />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.financeTotalRow}>
                <Text style={styles.financeTotalLabel}>Final Cost</Text>
                <Text style={styles.financeTotalValue}>
                  {formatINR(adjCost)}
                </Text>
              </View>

              <View style={styles.financeStatusBox}>
                <View style={styles.financeStatusCol}>
                  <Text style={styles.financeStatusLabel}>Paid</Text>
                  <Text style={styles.financeStatusValueDark}>
                    {formatINR(paidToSupplier)}
                  </Text>
                </View>
                <View style={styles.financeStatusDivider} />
                <View style={styles.financeStatusColRight}>
                  <Text style={styles.financeStatusLabel}>Pending to Pay</Text>
                  <Text
                    style={[
                      styles.financeStatusValue,
                      supplierDue > 0 && styles.financeStatusValueRed,
                    ]}
                  >
                    {formatINR(supplierDue)}
                  </Text>
                </View>
              </View>

              <View style={styles.provisionWrap}>
                <TouchableOpacity
                  onPress={() => setShowFinanceProvisionPanel((prev) => !prev)}
                  style={styles.provisionToggleBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.provisionToggleText}>
                    Provision CN/DN (Supplier)
                  </Text>
                  <FontAwesome
                    name={
                      showFinanceProvisionPanel ? "chevron-up" : "chevron-down"
                    }
                    size={12}
                    color={Theme.textPrimaryDark}
                  />
                </TouchableOpacity>

                {showFinanceProvisionPanel ? (
                  <View style={styles.provisionPanel}>
                    <View style={styles.provisionDnRow}>
                      <TouchableOpacity
                        style={[styles.provisionDnBtn, styles.provisionCnBtn]}
                        onPress={() => {
                          const preset = {
                            type: "cost" as const,
                            impact: "minus" as const,
                            reasonSeed: "Other",
                          };
                          if (onOpenAdjustment) {
                            onOpenAdjustment(preset);
                          } else {
                            openInlineAdjustment(preset);
                          }
                          setShowFinanceProvisionPanel(false);
                        }}
                        activeOpacity={0.88}
                      >
                        <Text style={styles.provisionDnLabel}>Credit (CN)</Text>
                        <ProvisionCnDnImpactTag type="cost" impact="minus" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.provisionDnBtn,
                          styles.provisionDnBtnDebit,
                        ]}
                        onPress={() => {
                          const preset = {
                            type: "cost" as const,
                            impact: "plus" as const,
                            reasonSeed: "Other",
                          };
                          if (onOpenAdjustment) {
                            onOpenAdjustment(preset);
                          } else {
                            openInlineAdjustment(preset);
                          }
                          setShowFinanceProvisionPanel(false);
                        }}
                        activeOpacity={0.88}
                      >
                        <Text style={styles.provisionDnLabel}>Debit (DN)</Text>
                        <ProvisionCnDnImpactTag type="cost" impact="plus" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.provisionChipsLbl}>
                      Quick protocol tabs
                    </Text>
                    <View style={styles.provisionChipWrap}>
                      {FINANCE_PROTOCOL_CHIPS.map((chip) => (
                        <TouchableOpacity
                          key={chip}
                          style={styles.provisionChip}
                          onPress={() => {
                            const preset = protocolSupplierChipAdjustment(chip);
                            if (onOpenAdjustment) {
                              onOpenAdjustment(preset);
                            } else {
                              openInlineAdjustment(preset);
                            }
                            setShowFinanceProvisionPanel(false);
                          }}
                          activeOpacity={0.82}
                        >
                          <Text style={styles.provisionChipTxt}>{chip}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.provisionFoot}>
                      <View>
                        <Text style={styles.provisionHint}>
                          Authorization preview
                        </Text>
                        <Text style={styles.provisionPulse}>
                          Provision sync
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.provisionConfirm}
                        onPress={() => {
                          const preset = { type: "cost" as const, impact: "plus" as const };
                          if (onOpenAdjustment) {
                            onOpenAdjustment(preset);
                          } else {
                            openInlineAdjustment(preset);
                          }
                          setShowFinanceProvisionPanel(false);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.provisionConfirmTxt}>
                          Full adjustment...
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>

              {!onOpenAdjustment ? (
              <View style={styles.inlineAdjustmentWrap}>
                <View style={styles.inlineAdjustmentHeader}>
                  <View>
                    <Text style={styles.inlineAdjustmentTitle}>
                      Add Adjustment
                    </Text>
                    <Text style={styles.inlineAdjustmentSubtitle}>
                      modify trip amounts
                    </Text>
                  </View>
                  <View style={styles.inlineAdjustmentClosePlaceholder} />
                </View>

                <Text style={styles.inlineLabel}>Adjustment Type</Text>
                <View style={styles.inlineTypeRow}>
                  <TouchableOpacity
                    style={[
                      styles.inlineTypeBtn,
                      draftType === "revenue" && styles.inlineTypeBtnActive,
                    ]}
                    onPress={() => {
                      setDraftType("revenue");
                      setDraftReason("");
                      setDraftOtherReason("");
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.inlineTypeBtnText,
                        draftType === "revenue" &&
                          styles.inlineTypeBtnTextActive,
                      ]}
                    >
                      Revenue (Sale)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.inlineTypeBtn,
                      draftType === "cost" && styles.inlineTypeBtnActive,
                    ]}
                    onPress={() => {
                      setDraftType("cost");
                      setDraftReason("");
                      setDraftOtherReason("");
                    }}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.inlineTypeBtnText,
                        draftType === "cost" && styles.inlineTypeBtnTextActive,
                      ]}
                    >
                      Cost (Supplier)
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.inlineLabel}>Impact</Text>
                <View style={styles.inlineTypeRow}>
                  <TouchableOpacity
                    style={[
                      styles.inlineTypeBtn,
                      styles.inlineImpactPlus,
                      draftImpact === "plus" && styles.inlineImpactPlusActive,
                    ]}
                    onPress={() => setDraftImpact("plus")}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.inlineTypeBtnText,
                        draftImpact === "plus" &&
                          styles.inlineTypeBtnTextActive,
                      ]}
                    >
                      Addition
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.inlineTypeBtn,
                      styles.inlineImpactMinus,
                      draftImpact === "minus" && styles.inlineImpactMinusActive,
                    ]}
                    onPress={() => setDraftImpact("minus")}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.inlineTypeBtnText,
                        draftImpact === "minus" &&
                          styles.inlineTypeBtnTextActive,
                      ]}
                    >
                      Deduction
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.inlineLabel}>Amount</Text>
                <View style={styles.inlineAmountRow}>
                  <Text style={styles.inlineCurrency}>₹</Text>
                  <TextInput
                    style={styles.inlineAmountInput}
                    value={draftAmount}
                    onChangeText={setDraftAmount}
                    placeholder="0"
                    placeholderTextColor={Theme.textMuted}
                    keyboardType="numeric"
                    maxLength={14}
                  />
                </View>

                <Text style={styles.inlineLabel}>Reason</Text>
                <View style={styles.inlineReasonWrap}>
                  {reasonOptions.map((reason) => (
                    <TouchableOpacity
                      key={reason}
                      style={[
                        styles.inlineReasonChip,
                        draftReason === reason && styles.inlineReasonChipActive,
                      ]}
                      onPress={() => setDraftReason(reason)}
                      activeOpacity={0.82}
                    >
                      <Text
                        style={[
                          styles.inlineReasonChipText,
                          draftReason === reason &&
                            styles.inlineReasonChipTextActive,
                        ]}
                      >
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {draftReason === "Other" ? (
                  <TextInput
                    style={styles.inlineOtherInput}
                    value={draftOtherReason}
                    onChangeText={setDraftOtherReason}
                    placeholder="Describe reason..."
                    placeholderTextColor={Theme.textMuted}
                    maxLength={80}
                  />
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.inlineSaveBtn,
                    !canSaveInlineAdjustment && styles.inlineSaveBtnDisabled,
                  ]}
                  onPress={() => void handleInlineSaveAdjustment()}
                  disabled={!canSaveInlineAdjustment || !onSaveAdjustment}
                  activeOpacity={0.88}
                >
                  <Text style={styles.inlineSaveBtnText}>Save Adjustment</Text>
                </TouchableOpacity>
              </View>
              ) : null}
            </View>

            {/* Actions & Commissions */}
            <View style={styles.financeFooter}>
              {onSaveAdjustment && (
                <TouchableOpacity
                  onPress={() =>
                    onOpenAdjustment
                      ? onOpenAdjustment({ type: "revenue", impact: "plus" })
                      : openInlineAdjustment()
                  }
                  style={styles.financeAddBtn}
                  activeOpacity={0.8}
                >
                  <FontAwesome
                    name="plus"
                    size={12}
                    color={Theme.primary}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.financeAddBtnText}>Add Adjustment</Text>
                </TouchableOpacity>
              )}

              {(supplierCommission > 0 || driverCommission > 0) && (
                <View style={styles.financeCommissionsWrap}>
                  {supplierCommission > 0 && (
                    <Text style={styles.financeCommissionText}>
                      Supplier Commission: {formatINR(supplierCommission)}
                    </Text>
                  )}
                  {driverCommission > 0 && (
                    <Text style={styles.financeCommissionText}>
                      Driver Commission: {formatINR(driverCommission)}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Transaction list */}
          <Text style={styles.handshakesLabel}>Transaction list</Text>
          <View style={styles.handshakesWrap}>
            {tripLedgerEntries.length === 0 ? (
              <Text style={styles.handshakesEmpty}>
                No transactions linked to this corridor
              </Text>
            ) : (
              <View style={styles.txList}>
                {tripLedgerEntries.map((row) => {
                  const dateStr = formatLedgerDateShort(
                    row.transaction_date ?? row.created_at,
                  );
                  const typeLabel =
                    getDoubleEntryDisplayLabel(row) ??
                    row.description ??
                    row.party_name ??
                    "—";
                  const party = row.party_name?.trim() || "—";
                  const inAmt = Number(row.amount_in ?? 0);
                  const outAmt = Number(row.amount_out ?? 0);
                  const isIn = inAmt > 0;
                  const amount = isIn ? inAmt : outAmt;
                  return (
                    <View key={row.id} style={styles.txCard}>
                      <View
                        style={[
                          styles.txCardIcon,
                          isIn ? styles.txCardIconIn : styles.txCardIconOut,
                        ]}
                      >
                        <FontAwesome
                          name={isIn ? "arrow-down" : "arrow-up"}
                          size={14}
                          color={isIn ? Theme.darkGreen : Theme.teslaRed}
                        />
                      </View>
                      <View style={styles.txCardBody}>
                        <Text style={styles.txCardTitle} numberOfLines={1}>
                          {typeLabel}
                        </Text>
                        <Text style={styles.txCardSubtitle} numberOfLines={1}>
                          {dateStr} · {party}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.txCardAmount,
                          isIn ? styles.txCardAmountIn : styles.txCardAmountOut,
                        ]}
                      >
                        {isIn ? "+" : "−"}
                        {formatINR(amount)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </>
      ) : null}

      {/* Assignments Registry (Current Node card + Activity Log; aggregate partner/OTP live inside the block) */}
      {showAssignmentsSection ? (
        <>
          <Text style={styles.handshakesLabel}>Assignments Registry</Text>
          <View style={styles.handshakesWrap}>
            {assignmentBlock ? (
              <View style={styles.assignmentBlockWrap}>{assignmentBlock}</View>
            ) : null}
            <View style={styles.activityWrap}>
              <View style={styles.activitySectionHeader}>
                <FontAwesome name="refresh" size={10} color={Theme.textMuted} />
                <Text style={styles.handshakesLabel}>Activity Log</Text>
              </View>
              {(() => {
                const hasCurrentAssignment = !!(
                  trip.driver_id ||
                  trip.vehicle_id ||
                  (trip.vehicle_display_number ?? "").trim()
                );
                const fallbackRow: TripAssignmentAuditRow | null =
                  assignmentAuditRows.length === 0 && hasCurrentAssignment
                    ? {
                        id: "fallback",
                        trip_id: trip.id,
                        event_type: "assignment",
                        driver_id_prev: null,
                        driver_id_new: trip.driver_id ?? null,
                        vehicle_id_prev: null,
                        vehicle_id_new: trip.vehicle_id ?? null,
                        changed_at:
                          trip.created_at ??
                          trip.updated_at ??
                          new Date().toISOString(),
                        changed_by: null,
                      }
                    : null;
                const dedupeKey = (row: TripAssignmentAuditRow) =>
                  `${row.changed_at}-${row.event_type}-${row.driver_id_new ?? ""}-${row.vehicle_id_new ?? ""}-${row.changed_by ?? ""}`;
                const seenKeys = new Set<string>();
                const dedupedAuditRows = assignmentAuditRows.filter((row) => {
                  const key = dedupeKey(row);
                  if (seenKeys.has(key)) return false;
                  seenKeys.add(key);
                  return true;
                });
                const effectiveRows: TripAssignmentAuditRow[] =
                  dedupedAuditRows.length > 0
                    ? dedupedAuditRows
                    : fallbackRow
                      ? [fallbackRow]
                      : [];

                if (effectiveRows.length === 0) {
                  return (
                    <Text style={styles.activityEmpty}>
                      No assignment activity recorded
                    </Text>
                  );
                }

                return (
                  <View style={styles.activityTimeline}>
                    {effectiveRows.map((row) => {
                      const eventLabel =
                        row.event_type === "reassignment"
                          ? "Reassignment"
                          : "Assignment";
                      const dateStr = formatAssignmentDateActivityMeta(
                        row.changed_at,
                      );
                      const isDriverDeclined =
                        row.event_type === "reassignment" &&
                        row.driver_id_prev != null &&
                        row.driver_id_new == null;
                      const byLabel = isDriverDeclined
                        ? ` · ${t("driverRejected")}`
                        : row.changed_by != null
                          ? row.changed_by === currentUserId
                            ? " • BY YOU"
                            : " • BY DISPATCHER"
                          : "";
                      const isFallback = row.id === "fallback";
                      const driverPrev =
                        !isFallback && row.driver_id_prev
                          ? (assignmentDriverNames[row.driver_id_prev] ??
                            row.driver_id_prev)
                          : null;
                      const driverNew = row.driver_id_new
                        ? (assignmentDriverNames[row.driver_id_new] ??
                          (isFallback
                            ? (driverName ?? null)
                            : row.driver_id_new))
                        : null;
                      const vehiclePrev =
                        !isFallback && row.vehicle_id_prev
                          ? (assignmentVehicleLabels[row.vehicle_id_prev] ??
                            row.vehicle_id_prev)
                          : null;
                      const vehicleNew = row.vehicle_id_new
                        ? (assignmentVehicleLabels[row.vehicle_id_new] ??
                          (isFallback
                            ? (vehicleLabel ?? null)
                            : row.vehicle_id_new))
                        : isFallback &&
                            (trip.vehicle_display_number ?? "").trim()
                          ? (trip.vehicle_display_number ?? "").trim()
                          : null;

                      const driverLine =
                        driverPrev != null && driverNew != null
                          ? `Driver: ${driverPrev} → ${driverNew}`
                          : driverNew != null
                            ? `Driver: ${driverNew}`
                            : driverPrev != null
                              ? `Driver: ${driverPrev} (rejected)`
                              : null;
                      const vehicleLine =
                        vehiclePrev != null && vehicleNew != null
                          ? `Vehicle: ${vehiclePrev} → ${vehicleNew}`
                          : vehicleNew != null
                            ? `Vehicle: ${vehicleNew}`
                            : vehiclePrev != null
                              ? `Vehicle: ${vehiclePrev} (rejected)`
                              : null;

                      const detail = [driverLine, vehicleLine]
                        .filter(Boolean)
                        .join("  ·  ");

                      return (
                        <View key={row.id} style={styles.activityItem}>
                          <View style={styles.activityDot} />
                          <View style={styles.activityCard}>
                            <Text
                              style={styles.activityTitle}
                              numberOfLines={1}
                            >
                              {eventLabel}
                            </Text>
                            <Text style={styles.activityMeta} numberOfLines={1}>
                              {dateStr}
                              {byLabel}
                            </Text>
                            {detail ? (
                              <Text
                                style={styles.activityDetail}
                                numberOfLines={2}
                              >
                                {detail}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}
            </View>
          </View>
        </>
      ) : null}

      <Modal
        visible={voidPromptAdj !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setVoidPromptAdj(null);
          setVoidPromptReason("");
        }}
      >
        <View style={styles.voidPromptBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setVoidPromptAdj(null);
              setVoidPromptReason("");
            }}
          />
          <View style={styles.voidPromptCard}>
            <Text style={styles.voidPromptTitle}>Void adjustment</Text>
            {voidPromptAdj ? (
              <Text style={styles.voidPromptMeta} numberOfLines={3}>
                {(voidPromptAdj.reason ?? "").trim() || "Adjustment"} ·{" "}
                {voidPromptAdj.impact === "plus" ? "+" : "−"}
                {formatINR(voidPromptAdj.amount)}
              </Text>
            ) : null}
            <Text style={styles.voidPromptLabel}>Reason for voiding</Text>
            <TextInput
              value={voidPromptReason}
              onChangeText={setVoidPromptReason}
              placeholder="Required — explain why this line is voided"
              placeholderTextColor={Theme.textMuted}
              style={styles.voidPromptInput}
              multiline
              maxLength={240}
            />
            <View style={styles.voidPromptActions}>
              <TouchableOpacity
                style={styles.voidPromptCancelBtn}
                onPress={() => {
                  setVoidPromptAdj(null);
                  setVoidPromptReason("");
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.voidPromptCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.voidPromptConfirmBtn,
                  !voidPromptReason.trim() &&
                    styles.voidPromptConfirmBtnDisabled,
                ]}
                disabled={!voidPromptReason.trim()}
                onPress={() => {
                  if (!voidPromptAdj || !onRemoveAdjustment) return;
                  const r = voidPromptReason.trim();
                  if (!r) return;
                  const id = voidPromptAdj.id;
                  void (async () => {
                    await Promise.resolve(onRemoveAdjustment(id, r));
                    setVoidPromptAdj(null);
                    setVoidPromptReason("");
                  })();
                }}
                activeOpacity={0.88}
              >
                <Text style={styles.voidPromptConfirmTxt}>Void line</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const CARD_PADDING = 14;
const SECTION_GAP = 12;

function ManifestRouteStop({ location }: { location: string | null | undefined }) {
  const { city, detail } = splitTripLocationDisplay(location);
  const cityLabel = toTitleCase(city || String(location ?? "").trim() || "—");
  const detailLabel = detail ? toTitleCase(detail) : "";
  return (
    <View style={styles.manifestStopCol}>
      <Text style={styles.manifestPlace} numberOfLines={2}>
        {cityLabel}
      </Text>
      {detailLabel ? (
        <Text style={styles.manifestPlaceDetail} numberOfLines={2}>
          {detailLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 80 },
  detailTabBar: {
    flexDirection: "row",
    gap: 6,
    marginBottom: SECTION_GAP,
    padding: 3,
    backgroundColor: Theme.surfaceGray,
  },
  detailTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTabBtnOn: {
    backgroundColor: Theme.screenBackground,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  detailTabBtnTxt: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  detailTabBtnTxtOn: {
    color: Theme.primary,
  },
  manifestCard: {
    backgroundColor: Theme.screenBackground,
    padding: CARD_PADDING,
    marginBottom: SECTION_GAP,
  },
  sectionKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  sectionKickerBar: {
    width: 3,
    height: 14,
    backgroundColor: Theme.buttonPrimary,
  },
  sectionKicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: Theme.textSection,
    textTransform: "uppercase",
  },
  manifestRouteRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  manifestDotsCol: {
    alignItems: "center",
    width: 12,
    marginTop: 5,
  },
  manifestDot: {
    width: 8,
    height: 8,
  },
  manifestDotStart: {
    backgroundColor: Theme.positive,
  },
  manifestDotEnd: {
    backgroundColor: Theme.teslaRed,
  },
  manifestRouteLine: {
    width: 1.5,
    flex: 1,
    minHeight: 18,
    backgroundColor: Theme.borderLight,
    marginVertical: 5,
  },
  manifestTextCol: {
    flex: 1,
    justifyContent: "space-between",
    gap: 10,
  },
  manifestStopCol: {
    minWidth: 0,
    gap: 1,
  },
  manifestPlace: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  manifestPlaceDetail: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textRouteCard,
    lineHeight: 11,
    letterSpacing: 0.2,
  },
  manifestMetaRow: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    paddingTop: 8,
  },
  manifestMetaCell: {
    flex: 1,
    minWidth: 0,
  },
  manifestMetaLabel: {
    fontSize: 8,
    fontWeight: "700",
    color: Theme.textRouteCard,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 1,
  },
  manifestMetaValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  operatorCardModern: {
    backgroundColor: Theme.screenBackground,
    padding: CARD_PADDING,
    marginBottom: SECTION_GAP,
  },
  operatorBadgeModern: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  operatorTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  operatorLabelModern: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: Theme.textRouteCard,
    textTransform: "uppercase",
  },
  operatorValueModern: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.15,
  },
  operatorSubModern: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textSecondary,
    lineHeight: 15,
  },
  assignmentCardModern: {
    backgroundColor: Theme.screenBackground,
    padding: CARD_PADDING,
    marginBottom: SECTION_GAP,
  },
  assignmentTitleModern: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 0,
  },
  assignmentRowModern: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  assignmentIconBox: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  assignmentTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  assignmentMetaLabel: {
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    color: Theme.textRouteCard,
    letterSpacing: 0.6,
  },
  assignmentMetaValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.1,
  },
  assignmentFootRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  assignmentFootText: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    color: Theme.textSecondary,
    lineHeight: 14,
  },
  assignmentActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: Theme.buttonPrimary,
  },
  assignmentActionBtnText: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  trackingTabExtrasWrap: {
    marginBottom: SECTION_GAP,
  },
  trackingCard: {
    backgroundColor: Theme.screenBackground,
    padding: CARD_PADDING,
    marginBottom: SECTION_GAP,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  trackingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  trackingHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  trackingStatusDot: {
    width: 6,
    height: 6,
    backgroundColor: Theme.positive,
  },
  trackingStatusDotOffline: {
    backgroundColor: Theme.negative,
  },
  trackingLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: Theme.primary,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  trackingLabelOffline: {
    color: Theme.negative,
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Theme.positiveMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveDot: {
    width: 4,
    height: 4,
    backgroundColor: Theme.darkGreen,
  },
  livePillText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
  },
  trackingLiveMapBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  trackingLiveMapText: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    backgroundColor: Theme.surfaceGray,
  },
  progressSegmentActive: {
    backgroundColor: Theme.buttonPrimary,
  },
  trackingFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  trackingFooterLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  trackingFooterLabel: {
    fontSize: 7,
    fontWeight: "700",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontStyle: "italic",
    marginBottom: 2,
  },
  trackingFooterValueRow: { flexDirection: "row", alignItems: "center" },
  clockIcon: { marginRight: 6 },
  trackingFooterValueOffline: {
    color: Theme.negative,
  },
  trackingFooterValueAccentOffline: {
    color: Theme.negative,
  },
  trackingFooterValue: {
    fontSize: 10,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.textPrimaryDark,
    flex: 1,
    minWidth: 0,
  },
  trackingFooterRight: {
    alignItems: "flex-end",
    flex: 1,
    minWidth: 0,
  },
  trackingFooterValueAccent: {
    fontSize: 9,
    fontWeight: "800",
    fontStyle: "italic",
    color: Theme.primary,
    textAlign: "right",
  },
  docSection: { marginBottom: SECTION_GAP - 4 },
  docSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  docSectionTitle: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    flex: 1,
  },
  docGrid: {
    flexDirection: "row",
    gap: 8,
  },
  docCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 116,
    backgroundColor: Theme.screenBackground,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  docCardIconWrap: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  docCardIconWrapUploaded: {
    backgroundColor: "rgba(79,108,255,0.08)",
  },
  docCardIconWrapPending: {
    backgroundColor: Theme.surfaceGray,
  },
  docCardLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    minHeight: 20,
  },
  docCardType: {
    fontSize: 8,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 1,
    marginBottom: 4,
  },
  docCardStatus: {
    marginTop: 0,
  },
  financeCard: {
    backgroundColor: Theme.screenBackground,
    padding: CARD_PADDING,
    marginBottom: SECTION_GAP,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tripFinanceSnapshotWrap: {
    marginBottom: 12,
    marginTop: -8,
  },
  financeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  financeTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  financeSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
  },
  financeSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    flexWrap: "wrap",
  },
  financeProfitWrap: {
    alignItems: "flex-end",
  },
  financeProfitLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.darkGreen,
    textTransform: "uppercase",
  },
  financeProfitValue: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.darkGreen,
    marginTop: 2,
  },
  financeSection: {
    marginBottom: 0,
  },
  financeSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  financeSectionSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: -4,
    marginBottom: 8,
  },
  financeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  financeLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  financeValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  financeAdjustmentsWrap: {
    backgroundColor: Theme.surfaceGray,
    padding: 10,
    marginBottom: 10,
  },
  financeAdjRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 4,
  },
  financeAdjLeftCol: {
    flex: 1,
    marginRight: 8,
    minWidth: 0,
  },
  financeAdjReason: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  financeAdjVoided: {
    textDecorationLine: "line-through",
    opacity: 0.72,
  },
  financeAdjVoidNote: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "600",
    color: Theme.textMuted,
    fontStyle: "italic",
  },
  financeAdjRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  financeAdjAmount: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  financeAdjRemoveBtn: {
    marginLeft: 8,
    padding: 4,
  },
  voidPromptBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  voidPromptCard: {
    backgroundColor: Theme.screenBackground,
    padding: 18,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  voidPromptTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
    marginBottom: 8,
  },
  voidPromptMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginBottom: 14,
  },
  voidPromptLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  voidPromptInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    minHeight: 72,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  voidPromptActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  voidPromptCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: Theme.surfaceGray,
  },
  voidPromptCancelTxt: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textSecondary,
  },
  voidPromptConfirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Theme.teslaRed,
  },
  voidPromptConfirmBtnDisabled: {
    opacity: 0.45,
  },
  voidPromptConfirmTxt: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  financeTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    marginBottom: 12,
  },
  financeTotalLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  financeTotalValue: {
    fontSize: 14,
    fontWeight: "900",
    color: Theme.textPrimaryDark,
  },
  financeStatusBox: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 12,
  },
  financeStatusCol: {
    flex: 1,
  },
  financeStatusColRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  financeStatusDivider: {
    width: 1,
    backgroundColor: Theme.borderLight,
    marginHorizontal: 12,
  },
  financeStatusLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  financeStatusValueGreen: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.darkGreen,
  },
  financeStatusValueDark: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  financeStatusValue: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  financeStatusValueRed: {
    color: Theme.teslaRed,
  },
  financeSectionDivider: {
    height: 1,
    backgroundColor: Theme.borderLight,
    marginVertical: 16,
  },
  provisionWrap: {
    marginTop: 14,
    gap: 10,
  },
  provisionToggleBtn: {
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  provisionToggleText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  provisionPanel: {
    backgroundColor: Theme.surface,
    padding: 12,
    gap: 10,
  },
  provisionDnRow: {
    flexDirection: "row",
    gap: 8,
  },
  provisionDnBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Theme.surfaceGray,
  },
  provisionCnBtn: {
    backgroundColor: Theme.positiveMuted,
  },
  provisionDnBtnDebit: {
    backgroundColor: Theme.negativeMuted,
  },
  provisionDnLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  provisionChipsLbl: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  provisionChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  provisionChip: {
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  provisionChipTxt: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
  },
  provisionFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
    paddingTop: 10,
  },
  provisionHint: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  provisionPulse: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    color: Theme.primary,
    textTransform: "uppercase",
  },
  provisionConfirm: {
    backgroundColor: Theme.buttonPrimary,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  provisionConfirmTxt: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
  },
  inlineAdjustmentWrap: {
    marginTop: 12,
    backgroundColor: Theme.screenBackground,
    padding: 12,
    gap: 10,
  },
  inlineAdjustmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inlineAdjustmentTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  inlineAdjustmentSubtitle: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  inlineAdjustmentClose: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  inlineAdjustmentClosePlaceholder: {
    width: 30,
    height: 30,
  },
  inlineLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  inlineTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  inlineTypeBtn: {
    flex: 1,
    backgroundColor: Theme.surface,
    paddingVertical: 11,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  inlineTypeBtnActive: {
    backgroundColor: Theme.buttonPrimary,
  },
  inlineTypeBtnText: {
    fontSize: 10,
    fontWeight: "800",
    color: Theme.textMuted,
    textTransform: "uppercase",
  },
  inlineTypeBtnTextActive: {
    color: Theme.buttonPrimaryText,
  },
  inlineImpactPlus: {
  },
  inlineImpactPlusActive: {
    backgroundColor: Theme.darkGreen,
  },
  inlineImpactMinus: {
  },
  inlineImpactMinusActive: {
    backgroundColor: Theme.teslaRed,
  },
  inlineAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inlineCurrency: {
    fontSize: 26,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    marginRight: 8,
  },
  inlineAmountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: "300",
    color: Theme.textPrimaryDark,
    paddingVertical: 4,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
    }),
  },
  inlineReasonWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  inlineReasonChip: {
    backgroundColor: Theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inlineReasonChipActive: {
    backgroundColor: Theme.textPrimaryDark,
  },
  inlineReasonChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  inlineReasonChipTextActive: {
    color: Theme.textOnPrimary,
  },
  inlineOtherInput: {
    backgroundColor: Theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    ...Platform.select({
      web: { outlineStyle: "none" } as object,
    }),
  },
  inlineSaveBtn: {
    marginTop: 4,
    backgroundColor: Theme.buttonPrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  inlineSaveBtnDisabled: {
    opacity: 0.45,
  },
  inlineSaveBtnText: {
    fontSize: 11,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  financeFooter: {
    marginTop: 12,
    gap: 12,
  },
  financeAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    paddingVertical: 10,
  },
  financeAddBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  financeCommissionsWrap: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: Theme.surfaceGray,
    padding: 10,
  },
  financeCommissionText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textSecondary,
    textTransform: "uppercase",
  },
  handshakesLabel: {
    fontSize: 8,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontStyle: "italic",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  assignmentBlockWrap: {
    marginBottom: 12,
  },
  activityWrap: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  activitySectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  activityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  activityHeaderText: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 1.0,
    textTransform: "uppercase",
  },
  activityEmpty: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
    fontStyle: "italic",
    paddingHorizontal: 2,
    paddingBottom: 6,
  },
  activityTimeline: {
    gap: 10,
    paddingLeft: 2,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  activityDot: {
    width: 10,
    height: 10,
    backgroundColor: Theme.borderLight,
    marginTop: 10,
  },
  activityCard: {
    flex: 1,
    backgroundColor: Theme.screenBackground,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  activityMeta: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  activityDetail: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  handshakesWrap: {
    backgroundColor: Theme.surfaceGray,
    padding: 12,
  },
  handshakesEmpty: {
    fontSize: 8,
    fontWeight: "400",
    color: Theme.textSection,
    textAlign: "center",
    fontStyle: "italic",
    paddingVertical: 24,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  txList: { gap: 8 },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.screenBackground,
    padding: 14,
    borderWidth: 1,
    borderColor: Theme.borderLight,
  },
  txCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  txCardIconIn: { backgroundColor: Theme.positiveMuted },
  txCardIconOut: { backgroundColor: "#FFF1F2" },
  assignmentCardIcon: { backgroundColor: "rgba(59, 130, 246, 0.12)" },
  txCardBody: { flex: 1, minWidth: 0 },
  txCardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  txCardSubtitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: 2,
    textTransform: "uppercase",
  },
  assignmentDetailLine: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginTop: 4,
  },
  txCardAmount: { fontSize: 12, fontWeight: "800", fontStyle: "italic" },
  txCardAmountIn: { color: Theme.darkGreen },
  txCardAmountOut: { color: Theme.teslaRed },
});
