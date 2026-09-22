/**
 * Trip detail — manifest layout (hero, Journey / Finance / Vault).
 * Mobile native + narrow web; wide web uses the same screen with isDesktop layout.
 */
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { PersistentTabPanel } from "@/components/PersistentTabPanel";
import { EntityAvatar as PartyAvatar } from '@/components/EntityAvatar';
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import { Theme } from "@/constants/Theme";
import {
  shouldAutoRunHistoricalLrOcr,
  shouldFetchOperationsSummary,
  shouldFlushTripOutboxOnDetail,
  shouldFetchManifestRefAssetInsights,
  shouldLoadTripDocumentsForViewer,
  shouldSkipExpenseTabAutoSelect,
} from "@/features/trips/components/trip-detail/completedTripInitialLoad.util";
import { canAddMoreTripDocs, canMutateTripVaultDoc, formatLrVaultDateLabel, formatLrVaultNumberLabel, formatVaultDocDate, isEwayBillVaultDoc, isLrVaultDoc, isPdfTripDoc, type TripDocItem, VAULT_DOC_LIMIT_HINT, VAULT_DOC_MAX_BYTES, VAULT_DOC_MAX_MB, VAULT_DOC_PICKER_TYPES, vaultDocDateToIso, vaultDocHasPreviewableFile, vaultPickerRejectionMessage } from "@/features/trips/components/trip-detail/tripDocTypes";
import { CompactValidTillCalendar, EwayBillLrStrip, buildEwayBillStripRows } from "@/features/trips/components/trip-detail/EwayBillVaultTab";
import {
  ewayDocHasPreviewableFile,
  type EwayFieldValues,
} from "@/features/trips/services/ewayBillFields.util";
import { TripVaultFilePreview } from "@/features/trips/components/trip-detail/TripVaultFilePreview";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOptionalActiveWorkspace } from "@/contexts/ActiveWorkspaceContext";
import { getGroundOpsDocUploadEnabled } from "@/features/organization/services/organization.service";
import { useDocumentPreview } from "@/features/chat/components/DocumentPreviewModal";
import { ChatDocumentThreadPreview } from "@/features/chat/components/ChatDocumentThreadPreview";
import { resolveChatDocumentStorageUrl } from "@/features/chat/utils/resolveChatDocumentUrl.util";
import {
  pushTripLedgerQuickEntry,
} from "@/features/finance/ledger/tripLedgerEntryChooser";
import { TripPayableReceivableSummaryCard } from "@/features/trips/components/trip-detail/adjustment/TripPayableReceivableSummaryCard";
import { TripMarginHero } from "@/features/trips/components/trip-detail/TripMarginHero";
import { TripLedgerTransactionPreviewModal } from "@/features/trips/components/trip-detail/TripLedgerTransactionPreviewModal";
import { TripAuditLogPanel } from "@/features/trips/components/trip-detail/TripAuditLogPanel";
import { TripPodStatusSection } from "@/features/trips/components/trip-detail/TripPodStatusSection";
import { ComplianceSection } from "@/features/tripCompliance/components/ComplianceSection";
import { useWorkspaceProductsQuery } from "@/lib/queries/useWorkspaceProductsQuery";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import type { LedgerEntryReceiptPartyAvatar } from "@/components/ledger/LedgerEntryReceiptCard";
import { latestTripSettlementLedgerEntry } from "@/features/trips/utils/tripSettlementLedgerEntries.util";
import { computePartnerIndentFreightCost } from "@/features/finance/utils/partnerIndentFreightCost.util";
import { resolveTripLedgerTripType } from "@/features/finance/utils/tripLedgerPayoutMode.util";
import { TripRatingsBlock } from "@/features/ratings/components/TripRatingsBlock";
import { isAggregateTrip } from "@/features/drivers/utils/driverUtils.util";
import { ROUTES, tripExpenseEntryEditRoute } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { formatINR, formatIndianVehicleNumber } from "@/lib/format";
import { formatPhoneForDisplay } from "@/lib/phoneLookup";
import { supabase } from "@/lib/supabase";
import { throwIfCancelled } from "@/lib/supabaseAbort.util";
import { notifyTripChatMessagesChanged } from "@/lib/tripChatInvalidate";
import { getOptimalRoute } from "@/lib/routingService";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import { extractLrFieldsFromUploadedDocument } from "@/features/trips/services/lrDocumentOcr.service";
import {
  parseLrFieldValues,
  serializeLrFieldValues,
} from "@/features/trips/services/lrDocumentOcr.util";
import {
  deleteVehicleDocument,
  deleteVehicleExtraDocument,
  getVehicleDocumentViewUrl,
  resolveVehicleDocumentsWriteTarget,
  uploadAndSaveVehicleDocument,
  uploadAndSaveVehicleDocumentForTrip,
  uploadAndSaveVehicleExtraDocuments,
} from "@/features/vehicles/services/vehicleDocuments.service";
import {
  DOCUMENT_LABELS,
  VEHICLE_COMPLIANCE_TYPE_HINT,
  VEHICLE_UPLOAD_CHOOSER_ORDER,
  vehicleComplianceOnFileSummary,
  type VehicleComplianceDocType,
} from "@/features/vehicles/utils/vehicleDocuments.util";
import { getSupplierById } from "@/features/suppliers/services/suppliers.service";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { Activity, MessageSquare, Zap } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import LottieView from "lottie-react-native";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Linking,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
    COST_REASON_OPTIONS,
    REVENUE_REASON_OPTIONS,
    adjustedCost,
    adjustedRevenue,
    isAdjustmentVoided,
    type TripAdjustment,
    type TripAdjustmentImpact,
    type TripAdjustmentType,
} from "../../services/tripAdjustments";
import { regenerateTripOtp } from "../../services/tripOtp.service";
import {
    forceSetTripStatusSimulated,
    getTripDisplayNumber,
    isTripCompleted,
    updateTripStatus,
    type TripRow,
} from "../../services/trips.service";
import { AggregateTripOtpPanel } from "../AggregateTripOtpPanel";
import { TripAssignmentBlock } from "../TripAssignmentBlock";
import { ReassignSheet } from "../reassign/ReassignSheet";
import { WaitingForDriverLocationOverlay } from "../reassign/WaitingForDriverLocationOverlay";
import { useReassignMigrationGate } from "@/features/trips/hooks/useReassignMigrationGate";

function vaultPreviewStoragePath(doc: TripDocItem): string | null {
  const primary = doc.storagePath?.trim();
  if (primary) return primary;
  const nested = doc.files?.find((file) => file.storagePath?.trim())?.storagePath?.trim();
  return nested || null;
}

function vaultDocPreviewMime(doc: TripDocItem): string | null {
  if (isPdfTripDoc(doc)) return "application/pdf";
  const type = (doc.type ?? "").toUpperCase();
  if (type === "PNG") return "image/png";
  if (type === "WEBP") return "image/webp";
  if (type === "JPG" || type === "JPEG") return "image/jpeg";
  const path = (doc.storagePath ?? "").toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (/\.jpe?g$/.test(path)) return "image/jpeg";
  return "image/jpeg";
}

// ── Lazy-loaded modals: only imported when first rendered (not on page load) ──
const ProvisionAdjustmentModal = lazy(() =>
  import("@/features/trips/components/trip-detail/adjustment/ProvisionAdjustmentModal").then(
    (m) => ({ default: m.ProvisionAdjustmentModal }),
  ),
);
const ProvisionDeductionConfirmModal = lazy(() =>
  import("@/features/trips/components/trip-detail/adjustment/ProvisionDeductionConfirmModal").then(
    (m) => ({ default: m.ProvisionDeductionConfirmModal }),
  ),
);
const ProvisionNotePdfModal = lazy(() =>
  import("@/features/trips/components/trip-detail/adjustment/ProvisionNotePdfModal").then(
    (m) => ({ default: m.ProvisionNotePdfModal }),
  ),
);
import { TripFinanceAdjustmentsPanel } from "@/features/trips/components/trip-detail/adjustment/TripFinanceAdjustmentsPanel";
import type { ProvisionNotePdfContext } from "@/features/trips/components/trip-detail/adjustment/tripProvisionNotePdf.util";
import {
  buildCostDeductionSaveParams,
  type ClientPassThroughRecommendation,
} from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentPassThrough.util";
import { TripOdometerPreviewCard } from "@/features/trips/components/trip-detail/TripOdometerPreviewCard";
const TripAdjustmentModal = lazy(() =>
  import("./TripAdjustmentModal").then((m) => ({ default: m.TripAdjustmentModal })),
);
// TripDetailFinanceView is currently unused (inside dead {false && ...} block) — not imported.
import type { TripDetailScreenProps } from "./TripDetailScreen.types";
const TripMap = lazy(() =>
  import("./TripMap").then((m) => ({ default: m.TripMap })),
);
const TripChatRoomSheet = lazy(() =>
  import("@/features/chat/components/TripChatRoomSheet").then((m) => ({
    default: m.TripChatRoomSheet,
  })),
);
import { ManifestDriverPingList } from "./ManifestDriverPingList";
import { useTripDetail } from "./hooks/useTripDetail";
import { useTrackingState } from "@/features/tracking/hooks/useTrackingState";
const LiveTrackingModal = lazy(() =>
  import("./modals/LiveTrackingModal").then((m) => ({ default: m.LiveTrackingModal })),
);
import {
  defaultTrackingState,
  isTripDriverMapEligible,
  isTripTrackingActive,
} from "@/features/trips/utils/tripTrackingStatus.util";
import {
  mergeMapLocationTrail,
  resolveMapTruckLocation,
} from "@/features/trips/utils/mapDriverTracking.util";
import { buildLiveTrackingPresentation } from "@/features/trips/utils/liveTrackingPresentation.util";
import { computeTripStageMetrics } from "@/features/trips/domain/tripStageMetrics";
import { computeJourneyMetrics } from "@/features/trips/domain/tripJourneyMetrics";
import { useTripTimelineQuery } from "@/lib/queries/useTripTimelineQuery";
import { useTripCheckpointDistanceQuery } from "@/lib/queries/useTripCheckpointDistanceQuery";
import { buildDriverLastPingDisplay } from "@/features/trips/utils/driverLastPingDisplay.util";
import { TripDetailTrackingHub } from "./TripDetailTrackingHub";
import { TripMobileDetail } from "./TripMobileDetail";
import { TripMobileFinancePanel } from "./TripMobileFinancePanel";
import { TripMobileVaultPanel } from "./TripMobileVaultPanel";
import { TripStageControlPanel } from "./TripStageControlPanel";
import { ManifestRefAssetCard } from "./ManifestRefAssetCard";
import { useManifestRefAssetInsights } from "./hooks/useManifestRefAssetInsights";
import { parseTripCoordinate } from "@/features/driver/tripHistory/tripHistoryDetail.util";
import { DriverTrackingOfflineOverlay } from "./DriverTrackingOfflineOverlay";
import {
  MAP_LOCATION_LABEL_LOADING,
  resolveMapLocationLabel,
} from "@/lib/mapLocationLabel.service";
import {
  buildManifestJourneyLogs,
  getManifestCurrentStepIndex,
  getVisibleManifestJourneyLogs,
  manifestSimLogsForStepIndex,
  manifestStepIndexForLog,
  type ManifestJourneyLogEntry,
} from "@/features/trips/utils/manifestJourneyLog.util";
import { MANIFEST_PULSE_PING_DISPLAY_MAX } from "@/lib/trackingLocation.constants";
import { formatTrackingDateTime } from "@/features/trips/utils/formatTrackingTimestamp.util";
import { useTripVerificationSync } from "@/features/trips/verification";
import { useTripOperationsSummary, useTripOperationsSync } from "@/features/trips/operations";
const TripExpensesScreen = lazy(() =>
  import("@/features/trips/operations/hub/TripExpensesScreen").then(
    (m) => ({ default: m.TripExpensesScreen }),
  ),
);
import { isAssetExecutionTrip, shouldShowTripExpenseHub } from "@/features/trips/domain/tripExecutionModel";
import { isDcoOperatingTrip } from "@/features/trips/domain/tripDcoOperating";
import { getMoverAssetTripIdForIndent } from "@/features/trips/services/trips.service";
import { tripIsDeliveredStatus, tripPodIsReceived } from "@/features/trips/services/tripDocumentLrPod.service";
import { FeedbackPlaceholder } from "./parts/FeedbackPlaceholder";
import { ManifestPulseStepIcon } from "./parts/ManifestPulseStepIcon";
import { ExpenseListCard } from "./parts/ExpenseListCard";
import { LedgerCard } from "./parts/LedgerCard";
import {
  formatLedgerDate,
  ledgerHistoryTitle,
} from "./parts/ledgerHistory.util";
import {
  dStyles,
  neoStyles,
  styles,
  MANIFEST_HERO_AVATAR_DESKTOP,
} from "./TripDetailScreen.styles";
import { TripProvider } from "./context/TripContext";
import { useTripDetailUi } from "./hooks/useTripDetailUi";
import {
  adjustmentsCountingAsIncome,
  adjustmentsCountingAsDeductions,
  FINANCE_PROTOCOL_CHIPS,
  getInlineReasonOptions,
  haversineKmBetween,
  inferCoordsFromLocationName,
  protocolSupplierChipAdjustment,
  provisionLineMetaLabel,
  resolveTripSupplierDisplayName,
  splitLocationPrimarySecondary,
} from "./tripDetail.helpers";
import {
  shouldShowManifestHeroDriverParty,
  type AggregateTripKindPillContext,
} from "@/features/drivers/utils/driverUtils.util";
import {
  buildAssetProvisionCostBreakdownLines,
  driverOfferFromDriverRow,
  selectAssetTripProvisionCostBreakdown,
  selectTripManifestMargin,
} from "@/features/finance";
import { computeTripSettlementDues, tripPayableCostTarget } from "@/features/finance/utils/tripSettlement.util";
import { getDriverById } from "@/features/drivers/services/drivers.service";
const LRDocumentsSection = lazy(() =>
  import("./sections/LRDocumentsSection").then((m) => ({ default: m.LRDocumentsSection })),
);
import {
    TripStatusTimeline,
    type TripStageTimestamp,
} from "./sections/TripStatusTimeline";

type Tab = "trip" | "finance" | "expenses" | "tracking" | "docs";

type TripWebExtra = {
  pickup_state?: string | null;
  drop_state?: string | null;
  driver_name?: string | null;
  vehicle_number?: string | null;
  supplier_name?: string | null;
  duration_minutes?: number | null;
  vehicle_type?: string | null;
  truck_type?: string | null;
  capacity?: string | null;
  vehicle_capacity?: string | null;
};

type LedgerWebExtra = LedgerRow & {
  reference_no?: string | null;
};

/** Manifest hero bridge — party avatars (client / driver / supplier). */
const manifestHeroBridgePartyStyles = StyleSheet.create({
  avatarStack: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    borderWidth: 1.5,
    borderColor: "#0f172a",
    borderRadius: 999,
    backgroundColor: "#1e293b",
    overflow: "hidden",
  },
});

/** Desktop neo hero — same party row layout as mobile bridge. */
function NeoManifestHeroBridgePartyEnd({
  roleLabel,
  partyName,
  partyPhone,
  entityType,
  avatarSize,
  avatarUrl,
  avatarSeed,
  organizationImageUrl,
  organizationAvatarSeed,
  isIntegrated,
  vehicleLabel,
  vehicleId,
  styles: neo,
  partyStyles,
}: {
  roleLabel: string;
  partyName: string;
  partyPhone?: string | null;
  entityType: "driver" | "supplier";
  avatarSize: number;
  avatarUrl?: string | null;
  avatarSeed?: string | null;
  organizationImageUrl?: string | null;
  organizationAvatarSeed?: string | null;
  isIntegrated?: boolean;
  vehicleLabel?: string | null;
  vehicleId?: string | null;
  styles: {
    heroParty: object;
    heroPartyRight: object;
    heroPartyTextRight: object;
    heroKicker: object;
    alignRight: object;
    heroPartyName: object;
    heroPartyPhone: object;
    heroVehicleBadge: object;
  };
  partyStyles: typeof manifestHeroBridgePartyStyles;
}) {
  const showVehicleBadge =
    entityType === "driver" && !!String(vehicleLabel ?? "").trim();
  const badgeSize = Math.max(10, Math.round(avatarSize * 0.42));
  const stackSize = avatarSize + (showVehicleBadge ? 6 : 0);
  const phoneDisplay = formatPhoneForDisplay(partyPhone);
  const phoneDigits = (partyPhone ?? "").replace(/[^\d+]/g, "");

  return (
    <View style={[neo.heroParty, neo.heroPartyRight]}>
      <View style={neo.heroPartyTextRight}>
        <Text style={[neo.heroKicker, neo.alignRight]} numberOfLines={1}>
          {roleLabel}
        </Text>
        <Text
          style={[neo.heroPartyName, neo.alignRight]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {partyName.toUpperCase()}
        </Text>
        {phoneDisplay ? (
          <TouchableOpacity
            onPress={() => {
              if (phoneDigits) void Linking.openURL(`tel:${phoneDigits}`);
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Call ${partyName} at ${phoneDisplay}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text
              style={[neo.heroPartyPhone, neo.alignRight]}
              numberOfLines={1}
            >
              {phoneDisplay}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View
        style={[
          partyStyles.avatarStack,
          { width: stackSize, height: stackSize },
        ]}
      >
        <PartyAvatar
          name={partyName}
          entityType={entityType}
          size={avatarSize}
          avatarUrl={avatarUrl ?? undefined}
          avatarSeed={avatarSeed ?? undefined}
          organizationImageUrl={organizationImageUrl ?? undefined}
          organizationAvatarSeed={organizationAvatarSeed ?? undefined}
          isIntegrated={isIntegrated}
          showIntegrationBadge={false}
        />
        {showVehicleBadge ? (
          <View
            style={partyStyles.vehicleBadge}
            accessibilityLabel={`Vehicle ${vehicleLabel}`}
          >
            <PartyAvatar
              name={vehicleLabel!}
              entityType="driver"
              size={badgeSize}
              avatarSeed={vehicleId ?? undefined}
              showIntegrationBadge={false}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function vaultBufferTooLargeMessage(fileName: string, byteLength: number): string | null {
  if (byteLength <= VAULT_DOC_MAX_BYTES) return null;
  return `${fileName || "This file"} exceeds ${VAULT_DOC_MAX_MB} MB. Each file must be ${VAULT_DOC_MAX_MB} MB or smaller.`;
}

function alertIfVaultPickerRejected(
  assets: { name?: string | null; mimeType?: string | null; size?: number | null }[],
): boolean {
  const message = vaultPickerRejectionMessage(assets);
  if (!message) return false;
  Alert.alert("File not accepted", message);
  return true;
}

function DeferredTripMap(props: ComponentProps<typeof TripMap>) {
  return (
    <Suspense fallback={<View style={{ minHeight: 160 }} />}>
      <TripMap {...props} />
    </Suspense>
  );
}

export default function TripDetailScreen({
  tripId,
  entryContext,
  clientIdFromContext,
  clientNameFromContext,
  initialTab,
  initialFinanceSubTab,
  onBack,
}: TripDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentOrganization } = useOrganization();
  const { t } = useLanguage();
  const { width: screenWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "trip");
  const tripOperationsSummaryQuery = useTripOperationsSummary(tripId || null, {
    enabled: shouldFetchOperationsSummary(tripId, activeTab),
  });
  const {
    financeSubTab,
    setFinanceSubTab,
    previewLedgerTx,
    setPreviewLedgerTx,
    searchTerm,
    setSearchTerm,
    expandedLog,
    setExpandedLog,
    locationLogExpanded,
    setLocationLogExpanded,
    showReassignSheet,
    setShowReassignSheet,
    showTripAuditLog,
    setShowTripAuditLog,
    otpResending,
    setOtpResending,
  } = useTripDetailUi({ initialFinanceSubTab });
  const expenseTabAutoSelectedRef = useRef(false);
  const [showFinanceProvisionPanel, setShowFinanceProvisionPanel] = useState<
    "client" | "supplier" | null
  >(null);
  const [pendingCostDeduction, setPendingCostDeduction] =
    useState<ClientPassThroughRecommendation | null>(null);
  const [costDeductionSubmitting, setCostDeductionSubmitting] = useState(false);
  const [provisionNotePdfContext, setProvisionNotePdfContext] =
    useState<ProvisionNotePdfContext | null>(null);
  const [provisionEditTarget, setProvisionEditTarget] =
    useState<TripAdjustment | null>(null);
  const [provisionConfirm, setProvisionConfirm] = useState<{
    mode: "delete" | "edit";
    adjustment: TripAdjustment;
  } | null>(null);
  const [editingProvisionAdjustmentId, setEditingProvisionAdjustmentId] =
    useState<string | null>(null);
  const [showInlineAdjustmentForm, setShowInlineAdjustmentForm] =
    useState(false);
  const [inlineAdjType, setInlineAdjType] =
    useState<TripAdjustmentType>("revenue");
  const [inlineAdjImpact, setInlineAdjImpact] =
    useState<TripAdjustmentImpact>("plus");
  const [inlineAdjAmount, setInlineAdjAmount] = useState("");
  const [inlineAdjReason, setInlineAdjReason] = useState("");
  const [inlineAdjOtherReason, setInlineAdjOtherReason] = useState("");
  const [provisionVoidReason, setProvisionVoidReason] = useState("");

  const vehicleGalleryScrollRef = useRef<ScrollView | null>(null);
  const [vehicleGalleryPageWidth, setVehicleGalleryPageWidth] = useState(0);
  const vehicleGalleryInitialSyncedRef = useRef(false);

  const closeFinanceProvisionModal = () => {
    setShowFinanceProvisionPanel(null);
    setShowInlineAdjustmentForm(false);
    setProvisionConfirm(null);
    setProvisionVoidReason("");
    setEditingProvisionAdjustmentId(null);
    setProvisionEditTarget(null);
  };

  const openProvisionEdit = useCallback((adj: TripAdjustment) => {
    if (isAdjustmentVoided(adj)) return;
    setProvisionEditTarget(adj);
    setShowFinanceProvisionPanel(adj.type === "revenue" ? "client" : "supplier");
  }, []);

  const handleRequestCostDeduction = useCallback(
    (rec: ClientPassThroughRecommendation) => {
      setPendingCostDeduction(rec);
      setShowFinanceProvisionPanel(null);
    },
    [],
  );

  const isMobile = screenWidth < 640;
  const isTablet = screenWidth >= 640 && screenWidth < 1024;
  const isDesktop = screenWidth >= 1024;
  const useCompactAdjustmentWizard = screenWidth < 680;
  const desktopTab: "tracking" | "finance" =
    activeTab === "finance" ? "finance" : "tracking";
  const hPad = isMobile ? 14 : isTablet ? 16 : 24;
  const mapHeight = isMobile ? 220 : isTablet ? 380 : 600;

  const detail = useTripDetail({
    tripId,
    entryContext,
    clientIdFromContext,
    clientNameFromContext,
    onBack,
    financeSurfaceActive: activeTab === "finance",
  });
  useTripVerificationSync({
    enabled: shouldFlushTripOutboxOnDetail(detail.trip),
  });
  useTripOperationsSync({
    enabled: shouldFlushTripOutboxOnDetail(detail.trip),
  });

  useEffect(() => {
    if (shouldLoadTripDocumentsForViewer(activeTab)) {
      void detail.ensureTripDocumentsForViewer();
    }
    if (activeTab === "tracking") {
      detail.ensureLocationHistory();
    }
  }, [
    activeTab,
    detail.ensureTripDocumentsForViewer,
    detail.ensureLocationHistory,
  ]);

  const resolveReceiptPartyAvatar = useCallback(
    (row: LedgerRow): LedgerEntryReceiptPartyAvatar | undefined => {
      const partyName = (row.party_name ?? "").trim();
      if (!partyName) return undefined;
      const isSupplier = row.contact_type === "supplier";
      const fields = isSupplier
        ? detail.supplierPartyAvatarFields
        : detail.clientPartyAvatarFields;
      const partyRes = isSupplier
        ? detail.supplierPartyRes
        : detail.clientPartyRes;
      return {
        name: partyName,
        entityType: (row.contact_type as "client" | "supplier") ?? "client",
        avatarUrl: fields?.avatarUrl ?? undefined,
        avatarSeed: fields?.avatarSeed ?? undefined,
        organizationImageUrl: fields?.organizationImageUrl ?? undefined,
        organizationAvatarSeed: fields?.organizationAvatarSeed ?? undefined,
        isIntegrated: partyRes?.integrated ?? false,
        initialsColorSeed: row.contact_id ?? row.party_name,
      };
    },
    [
      detail.clientPartyAvatarFields,
      detail.supplierPartyAvatarFields,
      detail.clientPartyRes,
      detail.supplierPartyRes,
    ],
  );

  const { can: canSurface } = useMemberAccess();
  const { data: workspaceProducts } = useWorkspaceProductsQuery();
  const complianceEnabled = (workspaceProducts ?? []).some(
    (p) => p.product_id === "pulse_compliance" && (p.status === "active" || p.status === "trial"),
  );
  const canViewCompliance = complianceEnabled && canSurface("trip_compliance.tab");
  const { memberPlatformRole } = useOptionalActiveWorkspace() ?? {};
  const isGroundOpsOnly = memberPlatformRole === "ground_ops";
  const groundOpsDocUploadQuery = useQuery({
    queryKey: ["q", "org", currentOrganization?.id ?? "", "ground-ops-doc-upload"],
    enabled: isGroundOpsOnly && !!currentOrganization?.id,
    queryFn: () => getGroundOpsDocUploadEnabled(currentOrganization!.id),
    staleTime: 60_000,
  });
  const groundOpsDocUploadEnabled = groundOpsDocUploadQuery.data === true;
  const canTripFinanceTab = canSurface("tripops.trips.finance");
  // Settlement write actions (capture payment / record payout). The trip finance
  // tab is read-only for a dispatcher — money movement needs its own grant.
  const canAddFinanceEntry = canSurface("finance.add_transaction");
  const canViewTripLedger = canSurface("finance.trip_ledger");
  const canVoidAdjustments = canSurface("finance.void_adjustments");
  // Two surfaces cover this tab from different domains: the TripOps tab grant
  // and the Finance expense-view grant. Require both so turning either off hides it.
  const canTripExpensesTab =
    canSurface("tripops.trips.expenses") && canSurface("finance.expenses.view");
  const canTripDocsTab = canSurface("tripops.trips.docs");
  const canTripTrackingTab = canSurface("tripops.trips.tracking");
  const canTripReassign = canSurface("tripops.trips.reassign");
  const canTripVerification = canSurface("tripops.trips.verification");
  const canTripSimulate = canSurface("tripops.trips.simulate");
  const canTripRatings = canSurface("tripops.trips.ratings");

  const manifestInsightsEnabled = shouldFetchManifestRefAssetInsights(
    detail.trip,
  );
  const manifestRefAssetInsights = useManifestRefAssetInsights({
    orgId: manifestInsightsEnabled
      ? (currentOrganization?.id ?? detail.trip?.organization_id ?? null)
      : null,
    driverId: manifestInsightsEnabled ? (detail.trip?.driver_id ?? null) : null,
    vehicleId: manifestInsightsEnabled
      ? (detail.trip?.vehicle_id ?? null)
      : null,
  });
  const manifestDriverInsights =
    manifestRefAssetInsights.data?.driver ?? {
      ratingAvg: null,
      docsIssue: false,
    };
  const manifestVehicleInsights =
    manifestRefAssetInsights.data?.vehicle ?? {
      ratingAvg: null,
      docsIssue: false,
    };

  const handleConfirmCostDeduction = useCallback(async () => {
    if (!pendingCostDeduction || costDeductionSubmitting) return;
    setCostDeductionSubmitting(true);
    try {
      await detail.handleSaveAdjustment(buildCostDeductionSaveParams(pendingCostDeduction));
      setPendingCostDeduction(null);
    } finally {
      setCostDeductionSubmitting(false);
    }
  }, [pendingCostDeduction, costDeductionSubmitting, detail.handleSaveAdjustment]);

  const expensePendingCount =
    (tripOperationsSummaryQuery.data?.financialSnapshot?.approvalPendingCount ?? 0) +
    (tripOperationsSummaryQuery.data?.financialSnapshot?.settlementPendingCount ?? 0);

  const tripForAssetFinance = detail.trip;
  const assignedDriverCompQuery = useQuery({
    queryKey: [
      "q",
      "trip",
      tripId,
      "driver-comp",
      tripForAssetFinance?.driver_id ?? "",
    ],
    enabled:
      !!tripForAssetFinance?.driver_id &&
      !!tripForAssetFinance.organization_id &&
      !!tripForAssetFinance &&
      isAssetExecutionTrip(tripForAssetFinance),
    queryFn: async ({ signal }) => {
      const res = await getDriverById(
        tripForAssetFinance!.organization_id,
        tripForAssetFinance!.driver_id!,
        signal,
      );
      throwIfCancelled(signal, res.error);
      if (res.error) throw res.error;
      return res.driver;
    },
    staleTime: 60_000,
  });

  const assetProvisionCostPreview = useMemo(() => {
    if (!tripForAssetFinance || !isAssetExecutionTrip(tripForAssetFinance)) {
      return null;
    }
    return selectAssetTripProvisionCostBreakdown({
      trip: tripForAssetFinance,
      events: tripOperationsSummaryQuery.data?.costEvents ?? [],
      driverOffer: driverOfferFromDriverRow(assignedDriverCompQuery.data ?? null),
    });
  }, [
    tripForAssetFinance,
    tripOperationsSummaryQuery.data?.costEvents,
    assignedDriverCompQuery.data,
  ]);

  useEffect(() => {
    if (!detail.trip || !isAssetExecutionTrip(detail.trip)) return;
    if (expenseTabAutoSelectedRef.current) return;
    if (shouldSkipExpenseTabAutoSelect(detail.trip)) {
      expenseTabAutoSelectedRef.current = true;
      return;
    }
    if (activeTab !== "trip") return;
    if (expensePendingCount > 0) {
      setActiveTab("expenses");
      expenseTabAutoSelectedRef.current = true;
      return;
    }
    if (tripOperationsSummaryQuery.isFetched) {
      expenseTabAutoSelectedRef.current = true;
    }
  }, [
    activeTab,
    expensePendingCount,
    tripOperationsSummaryQuery.isFetched,
    detail.trip,
  ]);

  // Bounce off the expenses tab only on true aggregate trips. Keyed on the
  // execution model, not isAggregateTrip(): a bookkeeping supplier_id is present
  // on asset deploys too, and using it here bounced the user straight back to
  // the trip tab even once the Expense Hub was visible.
  useEffect(() => {
    if (!detail.trip || shouldShowTripExpenseHub(detail.trip)) return;
    if (activeTab === "expenses") {
      setActiveTab("trip");
    }
  }, [detail.trip, activeTab]);

  // Mover opened the AGGREGATOR's shared trip directly (deep link). The trip
  // list hides this row for the mover (get_trips_for_org), but a by-id deep link
  // bypasses that, landing the mover on the settlement view with no Expense Hub.
  // If the mover has its own mover_asset trip for this load, redirect to it so
  // driver payout / fuel / toll are reachable. Owner keeps the aggregator view.
  const moverAssetRedirectedRef = useRef(false);
  useEffect(() => {
    const t = detail.trip;
    const viewerOrgId = currentOrganization?.id;
    if (!t || !viewerOrgId || moverAssetRedirectedRef.current) return;
    const indentId = t.indent_id;
    const isMover = t.organization_id != null && t.organization_id !== viewerOrgId;
    // Already on an asset trip, or owner, or no indent — nothing to redirect.
    if (!isMover || !indentId || String(t.source ?? "") === "mover_asset") return;
    let cancelled = false;
    const abort = new AbortController();
    getMoverAssetTripIdForIndent(viewerOrgId, indentId, abort.signal).then((assetTripId) => {
      if (cancelled || !assetTripId || assetTripId === t.id) return;
      moverAssetRedirectedRef.current = true;
      router.replace(ROUTES.tripDetail(assetTripId) as never);
    });
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [detail.trip, currentOrganization?.id, router]);

  const trackingState = useTrackingState(
    detail.trip?.id ?? null,
    detail.trip?.status ?? null,
    {
      isPinging: detail.isPingingDriver,
      lastPingRespondedAt: detail.lastPingRespondedAt,
      lastSeenAt: detail.lastSeenAt,
    },
  );
  const isPingTimedOut = detail.isPingTimedOut ?? false;
  const journeyTrackingActive = useMemo(
    () =>
      detail.trip
        ? isTripTrackingActive(detail.trip.status, detail.trip.completed_at)
        : false,
    [detail.trip?.status, detail.trip?.completed_at, detail.trip],
  );
  /** Assigned + in-transit: Track modal, hub, map trail / current pin. */
  const driverMapTrackingEligible = useMemo(
    () =>
      detail.trip
        ? isTripDriverMapEligible(
            detail.trip.status,
            detail.trip.completed_at,
            detail.trip.driver_id,
          )
        : false,
    [
      detail.trip?.status,
      detail.trip?.completed_at,
      detail.trip?.driver_id,
      detail.trip,
    ],
  );
  const showDriverTrackingOfflineOverlay = useMemo(
    () => journeyTrackingActive && (detail.isDriverOffline ?? false),
    [journeyTrackingActive, detail.isDriverOffline],
  );

  // Must run before any early return (loading/error) — Rules of Hooks.
  // One cached/deduped migration RPC per aggregate assignable trip (not per render).
  const tripForReassignGate = detail.trip;
  const reassignMigrationCheckEnabled =
    !!tripForReassignGate &&
    isAggregateTrip(tripForReassignGate) &&
    detail.canAssign &&
    !isTripCompleted(tripForReassignGate);
  const { migrationBlocked: reassignMigrationBlocked } =
    useReassignMigrationGate(reassignMigrationCheckEnabled);

  const previewGalleryDocs = useMemo(() => {
    if (detail.isVehicleGalleryDoc) {
      return detail.vehiclePreviewDocs.filter((doc) => !!doc.storagePath);
    }
    if ((detail.selectedDoc?.files?.length ?? 0) >= 1) {
      return (detail.selectedDoc?.files ?? [])
        .filter((file) => !!file.storagePath)
        .map((file) => ({
          id: file.id,
          label: file.label,
          type: file.type,
          storagePath: file.storagePath,
          documentId: file.documentId,
          status: "Uploaded" as const,
        }));
    }
    return [];
  }, [
    detail.isVehicleGalleryDoc,
    detail.vehiclePreviewDocs,
    detail.selectedDoc?.files,
  ]);
  const isGalleryPreview =
    detail.isVehicleGalleryDoc || (detail.selectedDoc?.files?.length ?? 0) >= 1;

  const goToVehicleGalleryIndex = useCallback(
    (nextIndex: number, animated = true) => {
      const total = previewGalleryDocs.length;
      if (total <= 0) return;
      const clamped = Math.max(0, Math.min(nextIndex, total - 1));
      if (clamped !== detail.vehiclePreviewIndex) {
        detail.setVehiclePreviewIndex(clamped);
      }
      if (vehicleGalleryPageWidth > 0) {
        vehicleGalleryScrollRef.current?.scrollTo({
          x: clamped * vehicleGalleryPageWidth,
          animated,
        });
      }
    },
    [detail, vehicleGalleryPageWidth, previewGalleryDocs.length],
  );

  const selectedPreviewIsPdf = isPdfTripDoc(
    isGalleryPreview
      ? previewGalleryDocs[detail.vehiclePreviewIndex] ?? detail.selectedDoc
      : detail.selectedDoc,
  );
  const galleryActiveDoc = previewGalleryDocs[detail.vehiclePreviewIndex] ?? null;
  const galleryPreviewOpenUrl = galleryActiveDoc
    ? (detail.vehiclePreviewUrls[galleryActiveDoc.id] ?? null)
    : null;
  const previewOpenUrl = isGalleryPreview
    ? galleryPreviewOpenUrl
    : detail.docPreviewUrl;

  const openPreviewExternally = (url: string | null) => {
    if (!url) return;
    if (Platform.OS === "web") {
      (globalThis as { window?: Window }).window?.open?.(
        url,
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    void Linking.openURL(url);
  };

  // One-shot scroll sync when the gallery first becomes visible, so the
  // hook's auto-jump to the first uploaded doc lines up with the carousel.
  // After that, scroll position and `vehiclePreviewIndex` stay in sync via
  // `onScroll` for swipes and `goToVehicleGalleryIndex` for taps.
  useEffect(() => {
    if (!isGalleryPreview) {
      vehicleGalleryInitialSyncedRef.current = false;
      return;
    }
    if (vehicleGalleryPageWidth <= 0) return;
    if (vehicleGalleryInitialSyncedRef.current) return;
    vehicleGalleryInitialSyncedRef.current = true;
    vehicleGalleryScrollRef.current?.scrollTo({
      x: detail.vehiclePreviewIndex * vehicleGalleryPageWidth,
      animated: false,
    });
  }, [
    isGalleryPreview,
    detail.vehiclePreviewIndex,
    vehicleGalleryPageWidth,
  ]);

  const [tripRoomOpen, setTripRoomOpen] = useState(false);

  const openOdometerVerification = useCallback(
    (side: "start" | "end") => {
      const id = detail.trip?.id;
      if (!id || !canTripVerification) return;
      router.push(ROUTES.tripVerification(id, side) as never);
    },
    [detail.trip?.id, router, canTripVerification],
  );

  const handleOpenTripChat = useCallback(() => {
    if (!detail.trip?.id) return;
    setTripRoomOpen(true);
  }, [detail.trip?.id]);

  const [mapRouteDistanceKm, setMapRouteDistanceKm] = useState<string | null>(
    null,
  );
  const [manifestRouteEtaSeconds, setManifestRouteEtaSeconds] = useState<
    number | null
  >(null);
  const [simConfirmStep, setSimConfirmStep] = useState<{
    label: string;
    targetStatus: string;
    started_at?: string;
    completed_at?: string;
    driverLat: number | null;
    driverLng: number | null;
    driverLocLabel: string | null;
  } | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [revokingSimulation, setRevokingSimulation] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  useEffect(() => {
    setMapRouteDistanceKm(null);
    setManifestRouteEtaSeconds(null);
  }, [tripId]);

  // Proactively fetch road distance as soon as coordinates are available.
  // This updates mapRouteDistanceKm before TripMap finishes its own async routing.
  useEffect(() => {
    const o = detail.trackingMapOriginCoordinate;
    const d = detail.trackingMapDestinationCoordinate;
    if (!o || !d) return;
    const raw = detail.trip?.distance;
    if (raw != null && raw !== "") {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (Number.isFinite(n) && n >= 0) return;
    }
    let cancelled = false;
    getOptimalRoute(o, d)
      .then((result) => {
        if (!cancelled && result) {
          setMapRouteDistanceKm((result.distance / 1000).toFixed(1));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    detail.trip?.distance,
    detail.trackingMapOriginCoordinate?.latitude,
    detail.trackingMapOriginCoordinate?.longitude,
    detail.trackingMapDestinationCoordinate?.latitude,
    detail.trackingMapDestinationCoordinate?.longitude,
  ]);

  const resolvedDistanceLabel = useMemo(() => {
    const tr = detail.trip;
    if (!tr) return null;
    const raw = tr.distance;
    if (raw != null && raw !== "") {
      const n = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (Number.isFinite(n) && n >= 0) {
        const s =
          Math.abs(n - Math.round(n)) < 1e-9
            ? String(Math.round(n))
            : n.toFixed(1);
        return `${s} km`;
      }
    }
    const mapKm = mapRouteDistanceKm?.trim();
    if (mapKm) return `${mapKm} km`;
    const o = detail.trackingMapOriginCoordinate;
    const d = detail.trackingMapDestinationCoordinate;
    const crow = o && d ? haversineKmBetween(o, d) : null;
    if (crow != null) return `≈ ${(crow * 1.3).toFixed(1)} km`;
    const inferredOrigin = inferCoordsFromLocationName(tr.pickup_area);
    const inferredDestination = inferCoordsFromLocationName(tr.drop_location);
    const inferredKm =
      inferredOrigin && inferredDestination
        ? haversineKmBetween(inferredOrigin, inferredDestination)
        : null;
    if (inferredKm != null) return `≈ ${(inferredKm * 1.3).toFixed(1)} km`;
    return null;
  }, [
    detail.trip,
    detail.trackingMapOriginCoordinate,
    detail.trackingMapDestinationCoordinate,
    mapRouteDistanceKm,
  ]);

  const timelineDistanceKm =
    resolvedDistanceLabel
      ?.replace(/^≈\s*/, "")
      .replace(/\s*km$/i, "")
      .trim() || undefined;

  // Parse simulation log entries stored in trip.notes.
  // Format: [BISIM|status|timestamp|lat|lng|userName]
  const simLogEntries = useMemo(() => {
    const notes = detail.trip?.notes;
    if (!notes) return [];
    return notes
      .split("\n")
      .filter((line) => line.startsWith("[BISIM|"))
      .map((line) => {
        const inner = line.slice(7, -1);
        const [status, timestamp, lat, lng, userName, fromStatus] =
          inner.split("|");
        return {
          status,
          timestamp,
          lat: parseFloat(lat) || null,
          lng: parseFloat(lng) || null,
          userName: userName || "Business",
          fromStatus: fromStatus || null,
        };
      });
  }, [detail.trip?.notes]);

  const [simLocationByKey, setSimLocationByKey] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    const pending = simLogEntries.filter(
      (e) => e.lat != null && e.lng != null,
    );
    if (pending.length === 0) return;
    void (async () => {
      const next: Record<string, string> = {};
      for (const sim of pending) {
        const key = `${sim.status}|${sim.timestamp}`;
        const label = await resolveMapLocationLabel(sim.lat!, sim.lng!, {
          mode: "full",
        });
        if (label?.trim()) next[key] = label.trim();
      }
      if (!cancelled && Object.keys(next).length > 0) {
        setSimLocationByKey((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [simLogEntries]);

  const hasAssignedDriverForEta = useMemo(
    () =>
      !!(
        detail.effectiveDriverIdForLocation?.trim() ||
        detail.trip?.driver_id?.trim()
      ),
    [detail.effectiveDriverIdForLocation, detail.trip?.driver_id],
  );

  const manifestRouteFetchEndpoints = useMemo(() => {
    const tr = detail.trip;
    if (!tr || !hasAssignedDriverForEta) return null;
    const dest =
      detail.trackingMapDestinationCoordinate ??
      (parseTripCoordinate(tr.drop_lat) != null &&
      parseTripCoordinate(tr.drop_lon) != null
        ? {
            latitude: parseTripCoordinate(tr.drop_lat)!,
            longitude: parseTripCoordinate(tr.drop_lon)!,
          }
        : null);
    if (!dest) return null;

    const driverPos =
      trackingState?.currentPosition ??
      (detail.driverLocation?.latitude != null &&
      detail.driverLocation?.longitude != null
        ? {
            latitude: detail.driverLocation.latitude,
            longitude: detail.driverLocation.longitude,
          }
        : null);
    if (driverPos) {
      return { from: driverPos, to: dest };
    }

    const origin =
      detail.trackingMapOriginCoordinate ??
      (parseTripCoordinate(tr.pickup_lat) != null &&
      parseTripCoordinate(tr.pickup_lon) != null
        ? {
            latitude: parseTripCoordinate(tr.pickup_lat)!,
            longitude: parseTripCoordinate(tr.pickup_lon)!,
          }
        : null);
    if (!origin) return null;
    return { from: origin, to: dest };
  }, [
    detail.trip,
    hasAssignedDriverForEta,
    detail.trackingMapOriginCoordinate,
    detail.trackingMapDestinationCoordinate,
    trackingState?.currentPosition,
    detail.driverLocation?.latitude,
    detail.driverLocation?.longitude,
  ]);

  useEffect(() => {
    if (!manifestRouteFetchEndpoints || isTripCompleted(detail.trip)) {
      setManifestRouteEtaSeconds(null);
      return;
    }
    let cancelled = false;
    void getOptimalRoute(
      manifestRouteFetchEndpoints.from,
      manifestRouteFetchEndpoints.to,
    )
      .then((result) => {
        if (!cancelled && result?.duration != null) {
          setManifestRouteEtaSeconds(result.duration);
        }
      })
      .catch(() => {
        if (!cancelled) setManifestRouteEtaSeconds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    detail.trip?.completed_at,
    detail.trip?.status,
    manifestRouteFetchEndpoints?.from.latitude,
    manifestRouteFetchEndpoints?.from.longitude,
    manifestRouteFetchEndpoints?.to.latitude,
    manifestRouteFetchEndpoints?.to.longitude,
  ]);

  const liveTrackingOpsTripId =
    canTripTrackingTab &&
    driverMapTrackingEligible &&
    (isDesktop || detail.showTrackingModal)
      ? (detail.trip?.id ?? null)
      : null;
  const { events: liveTrackingTimelineEvents } = useTripTimelineQuery(
    liveTrackingOpsTripId,
    detail.trip?.created_at ?? null,
  );
  const { distanceCoveredM: liveTrackingDistanceCoveredM } = useTripCheckpointDistanceQuery(
    liveTrackingOpsTripId,
  );
  const liveTrackingStageMetrics = useMemo(
    () => (detail.trip ? computeTripStageMetrics(detail.trip, liveTrackingTimelineEvents) : null),
    [detail.trip, liveTrackingTimelineEvents],
  );
  const liveTrackingJourneyMetrics = useMemo(
    () =>
      detail.trip && liveTrackingStageMetrics
        ? computeJourneyMetrics(detail.trip, liveTrackingDistanceCoveredM, liveTrackingStageMetrics)
        : null,
    [detail.trip, liveTrackingDistanceCoveredM, liveTrackingStageMetrics],
  );
  const liveTrackingPresentation = useMemo(
    () =>
      detail.trip && liveTrackingStageMetrics
        ? buildLiveTrackingPresentation({
            trip: detail.trip,
            stageMetrics: liveTrackingStageMetrics,
            journeyMetrics: liveTrackingJourneyMetrics,
            routeEtaSeconds: manifestRouteEtaSeconds,
          })
        : null,
    [detail.trip, liveTrackingStageMetrics, liveTrackingJourneyMetrics, manifestRouteEtaSeconds],
  );

  // Vault upload hooks — must run before loading/error early returns (Rules of Hooks).
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [pendingVaultUpload, setPendingVaultUpload] = useState<{
    slotId: string;
    label: string;
    docType: tripDocumentsService.TripDocumentType | "vehicle_extra";
    uri: string;
    fileName: string;
    mimeType: string;
    extraFiles?: { uri: string; fileName: string; mimeType: string }[];
    vehicleKind?: VehicleComplianceDocType | "extra";
  } | null>(null);
  const [pendingLrNumber, setPendingLrNumber] = useState("");
  const [pendingLrDate, setPendingLrDate] = useState("");
  const [pendingLrInvoice, setPendingLrInvoice] = useState("");
  const [showPendingLrCalendar, setShowPendingLrCalendar] = useState(false);
  const resetPendingLrFields = useCallback(() => {
    setPendingLrNumber("");
    setPendingLrDate("");
    setPendingLrInvoice("");
    setShowPendingLrCalendar(false);
  }, []);
  const fillPendingLrFields = useCallback(
    (
      raw?: string | null,
      dateFallback?: string | null,
      invoiceFallback?: string | null,
    ) => {
      const fields = parseLrFieldValues(raw);
      setPendingLrNumber(fields.lrNumber);
      setPendingLrDate(fields.date || dateFallback?.trim() || "");
      setPendingLrInvoice(fields.invoice || invoiceFallback?.trim() || "");
      setShowPendingLrCalendar(false);
    },
    [],
  );
  const [lrOcrReading, setLrOcrReading] = useState(false);
  const lrOcrAttemptedRef = useRef<string | null>(null);
  const [addDocChooserVisible, setAddDocChooserVisible] = useState(false);
  const [vehicleDocChooserVisible, setVehicleDocChooserVisible] = useState(false);
  const [vaultDeleteTarget, setVaultDeleteTarget] = useState<{
    cardId: string;
    label: string;
    storagePath: string;
    documentId?: string;
    category?: string;
    kind?: "trip" | "vehicle_extra" | "vehicle_compliance";
    extraId?: string;
    complianceType?: "rc" | "insurance" | "fitness" | "pollution";
  } | null>(null);
  const pendingPreviewIsPdf = isPdfTripDoc({
    mimeType: pendingVaultUpload?.mimeType,
    fileName: pendingVaultUpload?.fileName,
    storagePath: pendingVaultUpload?.uri,
  });
  const pendingPreviewIsImage = (pendingVaultUpload?.mimeType || "").startsWith(
    "image/",
  );

  const pendingFileCount =
    (pendingVaultUpload ? 1 : 0) + (pendingVaultUpload?.extraFiles?.length ?? 0);

  const lrVaultSlot = detail.computedTripDocs.find(
    (doc) => doc.id === "lr" || doc.category === "lr",
  );
  const lrDocId = lrVaultSlot?.documentId ?? null;
  const lrStoragePath = lrVaultSlot?.storagePath ?? null;
  const lrNeedsOcr =
    !!lrVaultSlot &&
    lrVaultSlot.status !== "Pending" &&
    !lrVaultSlot.documentNumber?.trim();

  useEffect(() => {
    lrOcrAttemptedRef.current = null;
    setLrOcrReading(false);
  }, [detail.trip?.id]);

  useEffect(() => {
    const orgId = currentOrganization?.id;
    const tripId = detail.trip?.id;
    const createdBy = detail.currentUserId;
    if (!shouldAutoRunHistoricalLrOcr(activeTab, detail.trip)) return;
    if (!lrNeedsOcr || !orgId || !tripId || !createdBy || !lrDocId || !lrStoragePath) {
      return;
    }
    if (lrDocId.startsWith("storage-")) return;
    if (lrOcrAttemptedRef.current === lrDocId) return;
    lrOcrAttemptedRef.current = lrDocId;
    setLrOcrReading(true);
    void tripDocumentsService
      .getDocumentViewUrl(lrStoragePath)
      .then((url) =>
        extractLrFieldsFromUploadedDocument({
          organizationId: orgId,
          localUri: url,
          tripId,
          tripDocumentId: lrDocId,
          storagePath: lrStoragePath,
          createdBy,
          existingDocumentNumber: lrVaultSlot?.documentNumber,
        }),
      )
      .catch(() => undefined)
      .finally(() => {
        setLrOcrReading(false);
        detail.handleRefresh();
      });
  }, [
    currentOrganization?.id,
    detail.currentUserId,
    detail.handleRefresh,
    detail.trip?.id,
    detail.trip,
    activeTab,
    lrDocId,
    lrNeedsOcr,
    lrStoragePath,
  ]);

  const readFileAsArrayBuffer = useCallback(
    async (uri: string): Promise<ArrayBuffer> => {
      if (Platform.OS === "web") {
        const response = await fetch(uri);
        return response.arrayBuffer();
      }
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: "base64" as const,
      });
      return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
    },
    [],
  );

  const confirmPendingVaultUpload = useCallback(async () => {
    const pending = pendingVaultUpload;
    const tripIdForUpload = detail.trip?.id;
    const uploaderId = detail.currentUserId;
    if (!pending) return;
    if (!tripIdForUpload) {
      Alert.alert("Upload failed", "Trip is still loading. Try again in a moment.");
      return;
    }
    if (!uploaderId) {
      Alert.alert("Upload failed", "Your session expired. Sign in again, then retry.");
      return;
    }
    if (uploadingDocId) return;

    setUploadingDocId(pending.slotId);
    try {
      const files = [
        {
          uri: pending.uri,
          fileName: pending.fileName,
          mimeType: pending.mimeType,
        },
        ...(pending.extraFiles ?? []),
      ];
      let uploadedCount = 0;
      let lrOcrTarget: {
        uri: string;
        tripDocumentId: string;
        storagePath: string;
      } | null = null;

      if (pending.docType === "vehicle_extra") {
        const vehicleId = detail.trip?.vehicle_id ?? null;
        if (!vehicleId) {
          Alert.alert(
            "Assign a vehicle",
            "Assign a vehicle to this trip before adding vehicle documents.",
          );
          return;
        }

        const preferredOrgIds: Array<string | null | undefined> = [
          detail.trip?.organization_id,
          currentOrganization?.id,
        ];
        if (detail.trip?.supplier_id && currentOrganization?.id) {
          const { supplier } = await getSupplierById(
            currentOrganization.id,
            detail.trip.supplier_id,
          );
          preferredOrgIds.push(supplier?.linked_organization_id);
        }
        const resolved = await resolveVehicleDocumentsWriteTarget(vehicleId, preferredOrgIds);
        // Viewer org (trip/current) — required for cross-org storage + trip RPC fallback.
        const viewerOrgId =
          detail.trip?.organization_id ?? currentOrganization?.id ?? null;
        if (!viewerOrgId) {
          Alert.alert(
            "Upload failed",
            "Could not resolve the organization for this trip.",
          );
          return;
        }

        const buffers: {
          arrayBuffer: ArrayBuffer;
          fileName: string;
          mimeType: string;
        }[] = [];
        for (const file of files) {
          const arrayBuffer = await readFileAsArrayBuffer(file.uri);
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            Alert.alert(
              "Upload failed",
              `Could not read ${file.fileName || "the selected file"}.`,
            );
            return;
          }
          const tooLarge = vaultBufferTooLargeMessage(
            file.fileName,
            arrayBuffer.byteLength,
          );
          if (tooLarge) {
            Alert.alert("File not accepted", tooLarge);
            return;
          }
          buffers.push({
            arrayBuffer,
            fileName: file.fileName,
            mimeType: file.mimeType,
          });
        }
        const complianceKind =
          pending.vehicleKind && pending.vehicleKind !== "extra"
            ? pending.vehicleKind
            : null;
        if (complianceKind) {
          const first = buffers[0];
          if (!first) {
            Alert.alert("Upload failed", "No file selected.");
            return;
          }
          const { documents, error } = await uploadAndSaveVehicleDocumentForTrip(
            viewerOrgId,
            tripIdForUpload,
            vehicleId,
            complianceKind,
            first,
            detail.vehicleDocs?.[complianceKind]?.expiryDate ??
              resolved?.documents?.[complianceKind]?.expiryDate ??
              "",
            resolved?.documents ?? detail.vehicleDocs,
            preferredOrgIds,
          );
          if (error) {
            Alert.alert("Upload failed", error.message);
            return;
          }
          uploadedCount = 1;
          if (documents) detail.setVehicleDocs(documents);
        } else {
          const { documents, error } = await uploadAndSaveVehicleExtraDocuments(
            viewerOrgId,
            vehicleId,
            buffers,
            resolved?.documents ?? detail.vehicleDocs,
          );
          if (error) {
            Alert.alert("Upload failed", error.message);
            return;
          }
          uploadedCount = buffers.length;
          if (documents) detail.setVehicleDocs(documents);
        }
      } else {
        for (const [index, file] of files.entries()) {
          const arrayBuffer = await readFileAsArrayBuffer(file.uri);
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            Alert.alert(
              "Upload failed",
              `Could not read ${file.fileName || "the selected file"}.`,
            );
            return;
          }
          const tooLarge = vaultBufferTooLargeMessage(
            file.fileName,
            arrayBuffer.byteLength,
          );
          if (tooLarge) {
            Alert.alert("File not accepted", tooLarge);
            return;
          }
          const lrPayload =
            pending.docType === "lr"
              ? serializeLrFieldValues({
                  lrNumber: pendingLrNumber,
                  date: pendingLrDate,
                  invoice: pendingLrInvoice,
                })
              : "";
          const { doc, error } = await tripDocumentsService.uploadTripDocument(
            tripIdForUpload,
            uploaderId,
            {
              arrayBuffer,
              fileName: file.fileName,
              mimeType: file.mimeType,
            },
            pending.docType,
            pending.docType === "lr" ? lrPayload || undefined : undefined,
          );
          if (error) {
            Alert.alert(
              uploadedCount > 0 ? "Partial upload" : "Upload failed",
              uploadedCount > 0
                ? `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} saved, then ${error.message}`
                : error.message,
            );
            if (uploadedCount > 0) {
              setPendingVaultUpload(null);
              resetPendingLrFields();
              detail.handleRefresh();
            }
            return;
          }
          uploadedCount += 1;
          if (doc) {
            if (lrPayload && !doc.document_number?.trim()) {
              await tripDocumentsService.updateTripDocumentNumber(doc.id, lrPayload);
              doc.document_number = lrPayload;
            }
            detail.upsertTripDocument({
              ...doc,
              document_number: lrPayload || doc.document_number,
            });
          }
          if (
            pending.docType === "lr" &&
            doc?.id &&
            !lrOcrTarget &&
            currentOrganization?.id
          ) {
            lrOcrTarget = {
              uri: file.uri,
              tripDocumentId: doc.id,
              storagePath: doc.storage_path,
            };
          }
        }
      }
      setPendingVaultUpload(null);
      resetPendingLrFields();
      detail.handleRefresh();
      Alert.alert(
        "Uploaded",
        uploadedCount > 1
          ? `${uploadedCount} documents are saved in the vault.`
          : `${pending.label} is saved in the vault.`,
      );
      const typedLr = pending.docType === "lr" ? pendingLrNumber.trim() : "";
      const typedLrFields =
        pending.docType === "lr" &&
        (typedLr || pendingLrDate.trim() || pendingLrInvoice.trim());
      if (lrOcrTarget && currentOrganization?.id && !typedLrFields) {
        lrOcrAttemptedRef.current = lrOcrTarget.tripDocumentId;
        setLrOcrReading(true);
        void extractLrFieldsFromUploadedDocument({
          organizationId: currentOrganization.id,
          localUri: lrOcrTarget.uri,
          tripId: tripIdForUpload,
          tripDocumentId: lrOcrTarget.tripDocumentId,
          storagePath: lrOcrTarget.storagePath,
          createdBy: uploaderId,
          existingDocumentNumber: typedLr,
        })
          .catch(() => undefined)
          .finally(() => {
            setLrOcrReading(false);
            detail.handleRefresh();
          });
      }
    } catch (e) {
      Alert.alert(
        "Upload failed",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    } finally {
      setUploadingDocId(null);
    }
  }, [
    pendingVaultUpload,
    pendingLrNumber,
    pendingLrDate,
    pendingLrInvoice,
    resetPendingLrFields,
    detail.trip?.id,
    detail.trip?.organization_id,
    detail.trip?.vehicle_id,
    detail.trip?.supplier_id,
    detail.currentUserId,
    detail.vehicleDocs,
    detail.setVehicleDocs,
    detail.handleRefresh,
    detail.upsertTripDocument,
    currentOrganization?.id,
    uploadingDocId,
    readFileAsArrayBuffer,
  ]);

  const executeVaultDelete = useCallback(async () => {
    const target = vaultDeleteTarget;
    const tripId = detail.trip?.id;
    if (!target || uploadingDocId) return;

    setUploadingDocId(target.cardId);
    setVaultDeleteTarget(null);
    try {
      if (target.kind === "vehicle_extra" || target.kind === "vehicle_compliance") {
        const orgId =
          detail.trip?.organization_id ?? currentOrganization?.id ?? null;
        const vehicleId = detail.trip?.vehicle_id ?? null;
        if (!orgId || !vehicleId) {
          Alert.alert(
            "Delete failed",
            "Assign a vehicle to this trip before removing vehicle documents.",
          );
          return;
        }
        const { documents, error } =
          target.kind === "vehicle_extra"
            ? await deleteVehicleExtraDocument(
                orgId,
                vehicleId,
                target.extraId ?? "",
                detail.vehicleDocs,
              )
            : await deleteVehicleDocument(
                orgId,
                vehicleId,
                target.complianceType ?? "rc",
                detail.vehicleDocs,
              );
        if (error) {
          Alert.alert("Delete failed", error.message);
          return;
        }
        if (documents) detail.setVehicleDocs(documents);
      } else {
        if (!tripId) return;
        const row =
          (target.documentId
            ? detail.tripDocuments.find((d) => d.id === target.documentId)
            : undefined) ??
          detail.tripDocuments.find((d) => d.storage_path === target.storagePath);

        const categoryToType: Record<
          string,
          tripDocumentsService.TripDocumentType
        > = {
          lr: "lr",
          eway: "eway_bill",
          trip: "manifest",
          driver: "pod",
        };

        const payload: tripDocumentsService.TripDocumentRow =
          row ??
          ({
            id: `storage-${target.storagePath}`,
            trip_id: tripId,
            file_name: target.label,
            storage_path: target.storagePath,
            mime_type: null,
            size_bytes: null,
            uploaded_at: new Date().toISOString(),
            uploaded_by: null,
            document_type: categoryToType[target.category ?? ""] ?? "manifest",
          } satisfies tripDocumentsService.TripDocumentRow);

        const { error } = await tripDocumentsService.deleteTripDocument(payload);
        if (error) {
          Alert.alert("Delete failed", error.message);
          return;
        }
      }
      detail.setSelectedDoc(null);
      detail.handleRefresh();
      Alert.alert("Deleted", `${target.label} was removed.`);
    } catch (e) {
      Alert.alert(
        "Delete failed",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    } finally {
      setUploadingDocId(null);
    }
  }, [
    vaultDeleteTarget,
    detail.trip?.id,
    detail.trip?.organization_id,
    detail.trip?.vehicle_id,
    detail.tripDocuments,
    detail.vehicleDocs,
    detail.setVehicleDocs,
    detail.setSelectedDoc,
    detail.handleRefresh,
    currentOrganization?.id,
    uploadingDocId,
  ]);

  const requestDeleteCurrentPreview = useCallback(() => {
    const selected = detail.selectedDoc;
    if (!selected || uploadingDocId) return;

    if (isGalleryPreview) {
      const current = previewGalleryDocs[detail.vehiclePreviewIndex];
      const storagePath = current?.storagePath?.trim();
      if (!current || !storagePath) return;
      if (detail.isVehicleGalleryDoc) {
        if (current.id.startsWith("vehicle-extra-")) {
          setVaultDeleteTarget({
            cardId: selected.id,
            label: current.label,
            storagePath,
            kind: "vehicle_extra",
            extraId: current.id.slice("vehicle-extra-".length),
          });
          return;
        }
        const complianceType = current.id.startsWith("vehicle-")
          ? current.id.slice("vehicle-".length)
          : "";
        if (
          complianceType === "rc" ||
          complianceType === "insurance" ||
          complianceType === "fitness" ||
          complianceType === "pollution"
        ) {
          setVaultDeleteTarget({
            cardId: selected.id,
            label: current.label,
            storagePath,
            kind: "vehicle_compliance",
            complianceType,
          });
        }
        return;
      }
      const nested = selected.files?.find((file) => file.id === current.id);
      setVaultDeleteTarget({
        cardId: selected.id,
        label: current.label,
        storagePath,
        documentId: nested?.documentId,
        category: selected.category,
        kind: "trip",
      });
      return;
    }

    const storagePath = selected.storagePath?.trim();
    if (!storagePath) return;
    setVaultDeleteTarget({
      cardId: selected.id,
      label: selected.label,
      storagePath,
      documentId: selected.documentId,
      category: selected.category,
      kind: "trip",
    });
  }, [
    detail.selectedDoc,
    detail.isVehicleGalleryDoc,
    detail.vehiclePreviewIndex,
    isGalleryPreview,
    previewGalleryDocs,
    uploadingDocId,
  ]);

  const handleVaultUpload = useCallback(
    async (doc: (typeof detail.computedTripDocs)[number]) => {
      const tripIdForUpload = detail.trip?.id;
      const uploaderId = detail.currentUserId;
      if (!tripIdForUpload || !uploaderId || uploadingDocId || pendingVaultUpload)
        return;

      let uri: string | null = null;
      let fileName = `${doc.id}-${Date.now()}.pdf`;
      let mimeType = "application/pdf";
      let extraFiles: { uri: string; fileName: string; mimeType: string }[] = [];

      try {
        const res = await DocumentPicker.getDocumentAsync({
          multiple: true,
          copyToCacheDirectory: true,
          type: [...VAULT_DOC_PICKER_TYPES],
        });
        if (res.canceled || !res.assets?.[0]) return;
        if (alertIfVaultPickerRejected(res.assets)) return;
        const [asset, ...rest] = res.assets;
        uri = asset.uri;
        fileName = asset.name || fileName;
        mimeType = asset.mimeType || "application/pdf";
        extraFiles = rest.map((item, index) => ({
          uri: item.uri,
          fileName: item.name || `${doc.id}-${Date.now()}-${index + 2}.pdf`,
          mimeType: item.mimeType || "application/pdf",
        }));

        if (!uri) return;

        const CATEGORY_TO_DOC_TYPE: Record<
          string,
          tripDocumentsService.TripDocumentType
        > = {
          driver: "pod",
          trip: "manifest",
          lr: "lr",
          eway: "eway_bill",
        };

        // Preview + confirm before any network upload (prevents accidental saves).
        const nextDocType =
          CATEGORY_TO_DOC_TYPE[doc.category ?? ""] ?? "manifest";
        if (nextDocType === "lr") {
          fillPendingLrFields(
            doc.documentNumber,
            doc.documentDate,
            doc.invoiceNumber,
          );
        } else {
          resetPendingLrFields();
        }
        setPendingVaultUpload({
          slotId: doc.id,
          label: doc.label,
          docType: nextDocType,
          uri,
          fileName,
          mimeType,
          extraFiles: extraFiles.length > 0 ? extraFiles : undefined,
        });
      } catch (e) {
        Alert.alert(
          "Upload failed",
          e instanceof Error ? e.message : "Something went wrong.",
        );
      }
    },
    [
      detail.trip,
      detail.currentUserId,
      uploadingDocId,
      pendingVaultUpload,
      fillPendingLrFields,
      resetPendingLrFields,
    ],
  );

  const handleLRUpload = useCallback(async () => {
    const tripIdForUpload = detail.trip?.id;
    const uploaderId = detail.currentUserId;
    if (!tripIdForUpload || !uploaderId || uploadingDocId || pendingVaultUpload)
      return;

    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: [...VAULT_DOC_PICKER_TYPES],
      });
      if (res.canceled || !res.assets?.[0]) return;
      if (alertIfVaultPickerRejected(res.assets)) return;
      const [asset, ...rest] = res.assets;
      const fileName = asset.name || `lr-${Date.now()}.pdf`;
      const mimeType = asset.mimeType || "application/pdf";

      fillPendingLrFields(
        lrVaultSlot?.documentNumber,
        lrVaultSlot?.documentDate,
        lrVaultSlot?.invoiceNumber,
      );
      setPendingVaultUpload({
        slotId: "lr",
        label: rest.length > 0 ? "LR Documents" : "LR Document",
        docType: "lr",
        uri: asset.uri,
        fileName,
        mimeType,
        extraFiles:
          rest.length > 0
            ? rest.map((item, index) => ({
                uri: item.uri,
                fileName: item.name || `lr-${Date.now()}-${index + 2}.pdf`,
                mimeType: item.mimeType || "application/pdf",
              }))
            : undefined,
      });
    } catch (e) {
      Alert.alert(
        "Upload failed",
        e instanceof Error ? e.message : "Something went wrong.",
      );
    }
  }, [
    detail.trip?.id,
    detail.currentUserId,
    uploadingDocId,
    pendingVaultUpload,
    lrVaultSlot?.documentNumber,
    lrVaultSlot?.documentDate,
    lrVaultSlot?.invoiceNumber,
    fillPendingLrFields,
  ]);

  const pickVehicleDocument = useCallback(
    async (kind: VehicleComplianceDocType | "extra") => {
      const tripIdForUpload = detail.trip?.id;
      const uploaderId = detail.currentUserId;
      const vehicleId = detail.trip?.vehicle_id ?? null;
      if (!tripIdForUpload || !uploaderId || uploadingDocId || pendingVaultUpload)
        return;
      if (!vehicleId) {
        Alert.alert(
          "Assign a vehicle",
          "Assign a vehicle to this trip before adding vehicle documents.",
        );
        return;
      }

      try {
        const res = await DocumentPicker.getDocumentAsync({
          multiple: kind === "extra",
          copyToCacheDirectory: true,
          type: [...VAULT_DOC_PICKER_TYPES],
        });
        if (res.canceled || !res.assets?.[0]) return;
        if (alertIfVaultPickerRejected(res.assets)) return;
        const [asset, ...rest] = res.assets;
        const label =
          kind === "extra" ? "Additional vehicle document" : DOCUMENT_LABELS[kind];
        setPendingVaultUpload({
          slotId: "vehicle-documents",
          label,
          docType: "vehicle_extra",
          vehicleKind: kind,
          uri: asset.uri,
          fileName: asset.name || `vehicle-${kind}-${Date.now()}.pdf`,
          mimeType: asset.mimeType || "application/pdf",
          extraFiles:
            kind === "extra" && rest.length > 0
              ? rest.map((item, index) => ({
                  uri: item.uri,
                  fileName:
                    item.name || `vehicle-extra-${Date.now()}-${index + 2}.pdf`,
                  mimeType: item.mimeType || "application/pdf",
                }))
              : undefined,
        });
      } catch (e) {
        Alert.alert(
          "Upload failed",
          e instanceof Error ? e.message : "Something went wrong.",
        );
      }
    },
    [
      detail.trip?.id,
      detail.trip?.vehicle_id,
      detail.currentUserId,
      uploadingDocId,
      pendingVaultUpload,
    ],
  );

  const openVehicleDocChooser = useCallback(() => {
    if (uploadingDocId || pendingVaultUpload) return;
    if (!detail.trip?.vehicle_id) {
      Alert.alert(
        "Assign a vehicle",
        "Assign a vehicle to this trip before adding vehicle documents.",
      );
      return;
    }
    setVehicleDocChooserVisible(true);
  }, [detail.trip?.vehicle_id, uploadingDocId, pendingVaultUpload]);

  const chooseVehicleDocKind = useCallback(
    (kind: VehicleComplianceDocType | "extra") => {
      setVehicleDocChooserVisible(false);
      void pickVehicleDocument(kind);
    },
    [pickVehicleDocument],
  );

  const startAddMoreForDoc = useCallback(
    (doc: (typeof detail.computedTripDocs)[number]) => {
      if (doc.category === "lr" || doc.id === "lr" || doc.id.startsWith("lr-")) {
        void handleLRUpload();
        return;
      }
      if (doc.id === "vehicle-documents" || doc.category === "vehicle") {
        openVehicleDocChooser();
        return;
      }
      void handleVaultUpload(doc);
    },
    [handleLRUpload, handleVaultUpload, openVehicleDocChooser],
  );

  const openAddDocumentChooser = useCallback(() => {
    if (uploadingDocId || pendingVaultUpload) return;
    setAddDocChooserVisible(true);
  }, [uploadingDocId, pendingVaultUpload]);

  const chooseAddDocumentType = useCallback(
    (kind: "lr" | "manifest" | "pod" | "vehicle") => {
      setAddDocChooserVisible(false);
      if (kind === "lr") {
        void handleLRUpload();
        return;
      }
      if (kind === "vehicle") {
        openVehicleDocChooser();
        return;
      }
      void handleVaultUpload({
        id: kind,
        label: kind === "pod" ? "Driver POD" : "Trip Manifest",
        type: kind === "pod" ? "JPG" : "PDF",
        status: "Pending",
        category: kind === "pod" ? "driver" : "trip",
      });
    },
    [handleLRUpload, handleVaultUpload, openVehicleDocChooser],
  );

  const manifestJourneyPings = useMemo(() => {
    const trail = detail.locationTrailWithNames ?? [];
    return trail.length > 0
      ? trail
      : detail.tripLocationPoints.map((p) => ({
          ...p,
          locationName: null as string | null,
        }));
  }, [detail.locationTrailWithNames, detail.tripLocationPoints]);

  const journeyLogs = useMemo((): ManifestJourneyLogEntry[] => {
    const tr = detail.trip;
    if (!tr) return [];
    return buildManifestJourneyLogs({
      trip: tr,
      assignmentAuditRows: detail.assignmentAuditRows,
      driverLocationAddress: detail.driverLocationAddress,
      driverLocation: detail.driverLocation,
      locationPings: manifestJourneyPings,
      simLogs: simLogEntries,
      simLocationByKey,
      locationLoadingLabel: MAP_LOCATION_LABEL_LOADING,
    });
  }, [
    detail.trip,
    detail.assignmentAuditRows,
    detail.driverLocation,
    detail.driverLocationAddress,
    manifestJourneyPings,
    simLogEntries,
    simLocationByKey,
  ]);

  const manifestDriverPings = useMemo(() => {
    const trail = detail.locationTrailWithNames ?? [];
    const source =
      trail.length > 0
        ? trail
        : detail.tripLocationPoints.map((p) => ({
            ...p,
            locationName: null as string | null,
          }));
    return [...source]
      .reverse()
      .slice(0, MANIFEST_PULSE_PING_DISPLAY_MAX)
      .map((p) => ({
        recorded_at: p.recorded_at,
        locationName: "locationName" in p ? p.locationName : null,
      }));
  }, [detail.locationTrailWithNames, detail.tripLocationPoints]);

  const manifestPulseLastIndex = 4;
  const currentStepIndex = detail.trip
    ? getManifestCurrentStepIndex(detail.trip, {
        assignmentAuditRows: detail.assignmentAuditRows,
        locationPings: manifestJourneyPings,
      })
    : 0;
  const visibleJourneyLogs = useMemo(
    () => getVisibleManifestJourneyLogs(journeyLogs, currentStepIndex),
    [journeyLogs, currentStepIndex],
  );
  const manifestJourneyComplete = currentStepIndex >= manifestPulseLastIndex;

  const tripForAssignmentFlow = detail.trip;
  const canChangeManifestAssetsForNav =
    !!tripForAssignmentFlow &&
    detail.canAssign &&
    !isTripCompleted(tripForAssignmentFlow);

  const openAssignmentFlow = useCallback(
    (focus: "driver" | "vehicle") => {
      if (!tripForAssignmentFlow?.id || !canChangeManifestAssetsForNav) return;
      router.push(ROUTES.tripAssignment(tripForAssignmentFlow.id, focus) as never);
    },
    [tripForAssignmentFlow?.id, canChangeManifestAssetsForNav, router],
  );

  const saveEwayBillFields = useCallback(
    async (values: EwayFieldValues[]) => {
      const tripIdForSave = detail.trip?.id;
      if (!tripIdForSave) return false;
      const uploadedBy = detail.currentUserId;
      if (!uploadedBy) {
        Alert.alert("Could not save", "Sign in to save e-way bill details.");
        return false;
      }
      const { error } = await tripDocumentsService.upsertEwayBillFields({
        tripId: tripIdForSave,
        uploadedBy,
        values,
      });
      if (error) {
        Alert.alert("Could not save", error.message);
        return false;
      }
      await detail.loadTripDocuments();
      return true;
    },
    [detail.trip?.id, detail.currentUserId, detail.loadTripDocuments],
  );

  const manifestHeroPartyContext = useMemo<AggregateTripKindPillContext>(
    () => ({
      viewerOrganizationId: currentOrganization?.id ?? null,
      supplierLinkedOrganizationId: detail.partnerOrgId ?? null,
    }),
    [currentOrganization?.id, detail.partnerOrgId],
  );
  const showManifestHeroDriver = useMemo(
    () =>
      detail.trip
        ? shouldShowManifestHeroDriverParty(
            detail.trip,
            manifestHeroPartyContext,
          )
        : false,
    [detail.trip, manifestHeroPartyContext],
  );

  const { open: openVaultChatPreview, node: vaultChatPreviewNode } =
    useDocumentPreview();

  const openVaultDocLikeChat = useCallback(
    async (doc: TripDocItem, storagePath: string) => {
      const url =
        doc.docSource === "vehicle"
          ? await getVehicleDocumentViewUrl(storagePath)
          : await resolveChatDocumentStorageUrl(storagePath);
      if (!url) {
        Alert.alert(
          "Preview unavailable",
          "We could not open this file. Try again in a moment.",
        );
        return false;
      }
      await openVaultChatPreview(
        url,
        vaultDocPreviewMime(doc),
        doc.label,
      );
      return true;
    },
    [openVaultChatPreview],
  );

  // Spinner only when there is no list/cache seed and no trip yet.
  // Bundle may still be in flight; do not block first paint when `trip` is seeded.
  if (detail.loading && !detail.trip) {
    return <CenteredLoadingView message="Loading trip…" />;
  }

  if (!detail.canViewDetail) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorText}>
          You don’t have access to trip details.
        </Text>
      </View>
    );
  }

  if (detail.error || !detail.trip) {
    return (
      <View style={styles.errorWrap}>
        <Text style={styles.errorText}>{detail.error ?? "Trip not found"}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={detail.load}
          activeOpacity={0.8}
        >
          <FontAwesome
            name="refresh"
            size={14}
            color="#fff"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.retryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { trip } = detail;
  const expenseHubLabel = "Expense Hub";
  const isAggregate = isAggregateTrip(trip);
  /**
   * Expense Hub gate. Deliberately NOT `!isAggregate`: isAggregateTrip() is a
   * bare supplier_id check, and on the direct-quote deploy path supplier_id is
   * bookkeeping (the shipper's supplier row for the winning bidder) and is set
   * on asset trips too. Using it here hid the Expense Hub from a supplier who
   * deployed his own truck and driver — exactly the person who needs to book
   * fuel and tolls. getTripExecutionModel() is the canonical asset/aggregate
   * source, so gate on that instead. isAggregate is left untouched for OTP,
   * earnings, and ledger logic, which depend on its current meaning.
   */
  const showExpenseHub = shouldShowTripExpenseHub(trip);

  const driverSummaryText = (() => {
    const name = detail.driverName?.trim();
    const r = detail.driverRatingAvg;
    const hasScore = r != null && Number.isFinite(Number(r));
    if (!name && !hasScore) return null;
    const score = hasScore ? Number(r).toFixed(1) : "—";
    return `${name || "Driver"} — ${score} \u2605`;
  })();

  const openTripDirectionsInMaps = () => {
    const o = detail.trackingMapOriginCoordinate;
    const d = detail.trackingMapDestinationCoordinate;
    if (!o || !d) return;
    const url = `https://www.google.com/maps/dir/${o.latitude},${o.longitude}/${d.latitude},${d.longitude}`;
    void Linking.openURL(url);
  };
  const inlineReasonOptions = getInlineReasonOptions(
    inlineAdjType,
    inlineAdjImpact,
  );
  const inlineFinalReason =
    inlineAdjReason === "Other"
      ? inlineAdjOtherReason.trim() || "Other"
      : inlineAdjReason.trim();
  const inlineAmountNum = Math.round(
    parseFloat(inlineAdjAmount.replace(/,/g, "")) || 0,
  );
  const canSaveInlineAdjustment =
    inlineAmountNum > 0 && inlineFinalReason.length > 0;

  const openInlineAdjustmentForm = (preset?: {
    type: TripAdjustmentType;
    impact: TripAdjustmentImpact;
    reasonSeed?: string;
  }) => {
    setEditingProvisionAdjustmentId(null);
    if (preset) {
      setInlineAdjType(preset.type);
      setInlineAdjImpact(preset.impact);
      const seed = (preset.reasonSeed ?? "").trim();
      const opts =
        preset.type === "revenue"
          ? REVENUE_REASON_OPTIONS
          : COST_REASON_OPTIONS;
      if (seed && (opts as readonly string[]).includes(seed)) {
        setInlineAdjReason(seed);
        setInlineAdjOtherReason("");
      } else if (seed) {
        setInlineAdjReason("Other");
        setInlineAdjOtherReason(seed);
      } else {
        setInlineAdjReason("");
        setInlineAdjOtherReason("");
      }
    } else {
      setInlineAdjType("revenue");
      setInlineAdjImpact("plus");
      setInlineAdjReason("");
      setInlineAdjOtherReason("");
    }
    setInlineAdjAmount("");
    setShowInlineAdjustmentForm(true);
  };

  const beginInlineEditFromAdjustment = (adj: TripAdjustment) => {
    if (isAdjustmentVoided(adj)) return;
    setEditingProvisionAdjustmentId(adj.id);
    setInlineAdjType(adj.type);
    setInlineAdjImpact(adj.impact);
    setInlineAdjAmount(adj.amount > 0 ? String(adj.amount) : "");
    const opts =
      adj.type === "revenue" ? REVENUE_REASON_OPTIONS : COST_REASON_OPTIONS;
    const r = (adj.reason ?? "").trim();
    if (r && (opts as readonly string[]).includes(r)) {
      setInlineAdjReason(r);
      setInlineAdjOtherReason("");
    } else if (r) {
      setInlineAdjReason("Other");
      setInlineAdjOtherReason(r);
    } else {
      setInlineAdjReason("");
      setInlineAdjOtherReason("");
    }
    setShowInlineAdjustmentForm(true);
  };

  const saveInlineAdjustment = async () => {
    if (!canSaveInlineAdjustment) return;
    if (editingProvisionAdjustmentId) {
      const existing = detail.adjustments.find(
        (a) => a.id === editingProvisionAdjustmentId,
      );
      if (existing && isAdjustmentVoided(existing)) return;
      await detail.handleUpdateAdjustment(editingProvisionAdjustmentId, {
        type: inlineAdjType,
        impact: inlineAdjImpact,
        amount: inlineAmountNum,
        reason: inlineFinalReason,
      });
      setEditingProvisionAdjustmentId(null);
    } else {
      await detail.handleSaveAdjustment({
        type: inlineAdjType,
        impact: inlineAdjImpact,
        amount: inlineAmountNum,
        reason: inlineFinalReason,
      });
    }
    setInlineAdjAmount("");
    setInlineAdjReason("");
    setInlineAdjOtherReason("");
    setShowInlineAdjustmentForm(false);
  };

  // ── Stage timestamps ──────────────────────────────────────────────────────────
  const stageTimestamps: TripStageTimestamp[] = [];
  if (trip.pickup_date)
    stageTimestamps.push({
      stageKey: "confirmed",
      timestamp: trip.pickup_date,
    });
  if (trip.started_at)
    stageTimestamps.push({ stageKey: "intransit", timestamp: trip.started_at });
  if (trip.completed_at)
    stageTimestamps.push({
      stageKey: "pod_received",
      timestamp: trip.completed_at,
    });

  const stageLocations: Partial<Record<string, string>> = {
    confirmed: trip.pickup_area?.trim() || undefined,
    s_in: trip.pickup_area?.trim() || undefined,
    s_out: trip.pickup_area?.trim() || undefined,
    d_in: trip.drop_location?.trim() || undefined,
    d_out: trip.drop_location?.trim() || undefined,
  };

  // ── Finance numbers ───────────────────────────────────────────────────────────
  // Keep POV parity with TripDetailFinanceView: supplier-side view (indent OR
  // manual/Aggregate-assigned) should use supplier settlement amounts, not
  // client billing amounts. Gated on supplier_id (matches isAggregateTrip()'s
  // convention), not indent_id — get_trip_detail_bundle now masks client_price/
  // margin/etc. to null for a non-owner supplier regardless of indent_id, so
  // this must recognize the same trips or a manual Aggregate trip shows a
  // false ₹0 sale instead of the supplier's real supplier_rate.
  const isTripOwner =
    currentOrganization?.id != null &&
    trip.organization_id != null &&
    trip.organization_id === currentOrganization.id;
  const isPartnerSettlementView =
    String(trip.supplier_id ?? "").trim().length > 0 && !isTripOwner;
  const payoutModeLc = String(trip.trip_payout_mode ?? "")
    .trim()
    .toLowerCase();
  const customerSales = Number(trip.client_price ?? 0);
  const supplierCost = Number(trip.supplier_rate ?? 0);
  const sales = isPartnerSettlementView ? supplierCost : customerSales;
  const isDcoTrip = isDcoOperatingTrip(trip);
  const isAssetTripFinance = !isDcoTrip && isAssetExecutionTrip(trip);
  const assetApprovedCostInr =
    tripOperationsSummaryQuery.data?.financialSnapshot?.approvedOperationalCostInr ?? 0;
  const assetDriverOffer = driverOfferFromDriverRow(
    assignedDriverCompQuery.data ?? null,
  );
  const assetCostEstimate =
    assetProvisionCostPreview?.totalBaseCostInr ??
    (assetApprovedCostInr > 0
      ? assetApprovedCostInr
      : isAssetTripFinance
        ? tripPayableCostTarget(
            trip,
            currentOrganization?.id ?? null,
            null,
            assetDriverOffer,
            null,
          )
        : 0);
  /**
   * A carrier viewing the shipper's trip is in the partner-settlement view, but
   * it may still have hauled the load on its OWN driver + truck (asset deploy).
   * That is a real cost it must settle, so the driver's stamped pay becomes the
   * freight cost — otherwise margin ignores the payout and the driver-payable
   * lane has nothing to render.
   *
   * There is deliberately no second trip row for this: the carrier settles
   * against the same trip the shipper owns.
   */
  const partnerOwnAssetDriverPay =
    isPartnerSettlementView && isAssetTripFinance
      ? Number(trip.driver_commission ?? 0) || 0
      : 0;
  const cost = isPartnerSettlementView
    ? computePartnerIndentFreightCost(
        detail.subcontractRate,
        partnerOwnAssetDriverPay,
      )
    : isAssetTripFinance
      ? assetCostEstimate
      : supplierCost;
  /**
   * trips.service.ts persists supplier_rate as 0 whenever it was never entered (see
   * createTrip's `Number(data.supplier_rate) || 0`), so a real ₹0 rate and "never set" are
   * indistinguishable in the DB. Flag it here (supplier assigned but rate is 0) so the UI can
   * show "Not set" instead of a false, settled-looking ₹0 — see ProvisionRevisedPartiesCard.
   */
  const supplierCostRateUnset =
    !isPartnerSettlementView &&
    !isAssetTripFinance &&
    !!(trip.supplier_id ?? "").trim() &&
    supplierCost === 0;
  const baseFreight = sales;
  const incomeAdjustmentRows = adjustmentsCountingAsIncome(detail.adjustments);
  const deductionAdjustmentRows = adjustmentsCountingAsDeductions(
    detail.adjustments,
  );
  const additionalIncome = incomeAdjustmentRows.reduce(
    (s, a) => s + a.amount,
    0,
  );
  const deductions = deductionAdjustmentRows.reduce((s, a) => s + a.amount, 0);

  const ledgerEntries = Array.isArray(detail.tripLedgerEntries)
    ? detail.tripLedgerEntries
    : [];
  const ledgerEntriesLoading = detail.tripLedgerEntriesLoading;
  const ledgerEntriesError = detail.tripLedgerEntriesError;
  const received = ledgerEntries.reduce(
    (s, tx) => s + Number(tx.amount_in ?? 0),
    0,
  );
  const pending = Math.max(0, sales - received);

  const tripSettlement = computeTripSettlementDues({
    trip,
    viewerOrgId: currentOrganization?.id ?? null,
    ledgerEntries,
    adjustments: detail.adjustments,
    subcontractRate: detail.subcontractRate ?? null,
    driverOffer: assetDriverOffer,
    assetProvisionCostInr: assetProvisionCostPreview?.totalBaseCostInr ?? null,
  });
  // Mover_asset trip: the client payment lives on the aggregator's trip, not
  // here. We show what the aggregator has paid as a read-only INFO BADGE
  // ("<client> marked paid ₹X") — it does NOT count as a local receipt, so
  // Lenovo's own collected/due stay untouched until Lenovo confirms receipt.
  const isMoverAssetTrip = String(trip.source ?? "") === "mover_asset";
  const moverClientMarkedPaid = isMoverAssetTrip
    ? (detail.moverClientPaid ?? 0)
    : 0;
  const collectedFromClient = tripSettlement.clientReceived;
  const supplierPaid = tripSettlement.payablePaid;

  type FinanceHistoryRow = {
    key: string;
    tx: LedgerRow;
    isIn: boolean;
    amount: number;
  };
  const financeHistoryRows: FinanceHistoryRow[] = (() => {
    const rows: FinanceHistoryRow[] = [];
    for (const tx of ledgerEntries) {
      const inAmt = Number(tx.amount_in ?? 0);
      const outAmt = Number(tx.amount_out ?? 0);
      if (inAmt > 0)
        rows.push({ key: `${tx.id}-in`, tx, isIn: true, amount: inAmt });
      if (outAmt > 0)
        rows.push({ key: `${tx.id}-out`, tx, isIn: false, amount: outAmt });
    }
    rows.sort((a, b) => {
      const da = new Date(a.tx.transaction_date || a.tx.created_at).getTime();
      const db = new Date(b.tx.transaction_date || b.tx.created_at).getTime();
      return db - da;
    });
    return rows;
  })();
  const driverCashPayoutsForExpenses = ledgerEntries
    .filter(
      (tx) =>
        tx.contact_type === "driver" && Number(tx.amount_out ?? 0) > 0,
    )
    .map((tx) => ({
      id: tx.id,
      dateLabel: new Date(
        tx.transaction_date ?? tx.created_at ?? "",
      ).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      amount: Number(tx.amount_out ?? 0),
      description: tx.description,
    }));
  const driverReimbursementDueInr =
    tripOperationsSummaryQuery.data?.financialSnapshot?.payableOutstandingInr ?? 0;
  const paymentCaptured = ledgerEntries.some(
    (row) => row.contact_type === "client" && Number(row.amount_in ?? 0) > 0,
  );

  // ── Map ───────────────────────────────────────────────────────────────────────
  const hasOrigin = !!detail.trackingMapOriginCoordinate;
  const hasDest = !!detail.trackingMapDestinationCoordinate;
  const mapCenter = hasOrigin
    ? {
        latitude: detail.trackingMapOriginCoordinate!.latitude,
        longitude: detail.trackingMapOriginCoordinate!.longitude,
      }
    : { latitude: 20.5937, longitude: 78.9629 };

  const tripExtra = trip as TripRow & TripWebExtra;
  const originSplit = splitLocationPrimarySecondary(trip.pickup_area);
  const destinationSplit = splitLocationPrimarySecondary(trip.drop_location);
  const originStateLabel =
    originSplit.secondary ||
    String(tripExtra.pickup_state ?? "").trim() ||
    "Origin Node";
  const destinationStateLabel =
    destinationSplit.secondary ||
    String(tripExtra.drop_state ?? "").trim() ||
    "Destination Node";
  const allocatedDriverName =
    detail.driverName?.trim() ||
    String(tripExtra.driver_name ?? "").trim() ||
    "Unassigned";
  const allocatedVehicleLabel =
    detail.displayVehicleFromInput?.trim() ||
    detail.vehicleLabel?.trim() ||
    String(trip.vehicle_display_number ?? "").trim() ||
    String(tripExtra.vehicle_number ?? "").trim() ||
    "Pending";

  const mapDbLocationTrail = mergeMapLocationTrail(
    detail.tripLocationPoints ?? [],
    (detail.trackingTrail ?? []).map((c) => ({
      latitude: c.latitude,
      longitude: c.longitude,
      recorded_at: c.recorded_at,
    })),
  );
  const mapTruckLocation = resolveMapTruckLocation({
    tripCompleted: detail.tripCompleted,
    currentPosition: trackingState?.currentPosition ?? null,
    driverLocation: detail.driverLocation ?? null,
    trail: mapDbLocationTrail,
  });
  const mapTruckStatus =
    detail.tripCompleted || !mapTruckLocation
      ? null
      : {
          truckNo: allocatedVehicleLabel,
          speed: 0,
          ignitionStatus: false,
          location: detail.driverLocationAddress?.trim() || undefined,
          lastUpdated:
            detail.driverLocation?.recorded_at ??
            trackingState?.lastSeenAt ??
            mapDbLocationTrail[mapDbLocationTrail.length - 1]?.recorded_at,
        };
  const driverLastPingRecordedAt =
    detail.driverLocation?.recorded_at ??
    trackingState?.lastSeenAt ??
    mapDbLocationTrail[mapDbLocationTrail.length - 1]?.recorded_at ??
    null;
  const driverLastPingDisplay = buildDriverLastPingDisplay({
    latitude: mapTruckLocation?.latitude ?? null,
    longitude: mapTruckLocation?.longitude ?? null,
    locationAddress: detail.driverLocationAddress,
    recordedAt: driverLastPingRecordedAt,
  });
  const awaitingDataLabel = t("tripsHubAwaitingData");
  const clientNameForParty =
    detail.displayClientName?.trim() ||
    String(trip.client_name ?? "").trim() ||
    awaitingDataLabel;
  const supplierNameForParty =
    resolveTripSupplierDisplayName({
      partnerName: detail.partnerName,
      supplierPartyName: detail.supplierPartyRes?.name,
      tripSupplierName: tripExtra.supplier_name,
      linkedOrganizationName:
        detail.supplierPartyAvatarFields?.organizationName,
      clientName:
        detail.displayClientName?.trim() ||
        String(trip.client_name ?? "").trim() ||
        null,
      ledgerEntries,
    }) || awaitingDataLabel;
  const clientNameCard = clientNameForParty.toUpperCase();
  const supplierName = supplierNameForParty.toUpperCase();
  const isIntegratedTrip = Boolean(trip.indent_id);

  // Next step the business can simulate
  const nextSimulateStep = (() => {
    if (!canTripSimulate) return null;
    const s = String(trip.status ?? "").toLowerCase();
    const loc = detail.driverLocation;
    const driverLat = loc?.latitude ?? null;
    const driverLng = loc?.longitude ?? null;
    const driverLocLabel = detail.driverLocationAddress?.trim() || null;
    const now = new Date().toISOString();
    if (s === "pending_acceptance")
      return {
        label: "Driver accepts assignment",
        targetStatus: "assigned",
        driverLat,
        driverLng,
        driverLocLabel,
      };
    if (["draft", "assigned"].includes(s))
      return {
        label: "Driver arrived at pickup",
        targetStatus: "in_progress",
        started_at: now,
        driverLat,
        driverLng,
        driverLocLabel,
      };
    if (["in_progress", "picked_up"].includes(s))
      return {
        label: "Package collected — in transit",
        targetStatus: "in_transit",
        driverLat,
        driverLng,
        driverLocLabel,
      };
    if (s === "in_transit")
      return {
        label: "Driver arrived at drop-off",
        targetStatus: "at_drop",
        driverLat,
        driverLng,
        driverLocLabel,
      };
    if (s === "at_drop")
      return {
        label: "Trip delivered & completed",
        targetStatus: "completed",
        completed_at: now,
        driverLat,
        driverLng,
        driverLocLabel,
      };
    return null;
  })();

  const previousStatusForSimTarget = (targetStatusRaw: string) => {
    const targetStatus = String(targetStatusRaw ?? "").trim().toLowerCase();
    if (!targetStatus) return null;
    if (targetStatus === "assigned") return "pending_acceptance";
    if (targetStatus === "in_progress") return "assigned";
    if (targetStatus === "picked_up") return "in_progress";
    if (targetStatus === "in_transit") return "in_progress";
    if (targetStatus === "at_drop") return "in_transit";
    if (targetStatus === "completed") return "at_drop";
    return null;
  };

  const lastSimulatedTransition = (() => {
    if (simLogEntries.length === 0) return null;
    const last = simLogEntries[simLogEntries.length - 1];
    if (!last?.status) return null;
    const toStatus = String(last.status).trim().toLowerCase();
    if (!toStatus) return null;
    const fallbackFrom = previousStatusForSimTarget(toStatus);
    const fromStatus = String(last.fromStatus ?? "")
      .trim()
      .toLowerCase();
    return {
      toStatus,
      fromStatus: fromStatus || fallbackFrom,
      lat: last.lat ?? null,
      lng: last.lng ?? null,
    };
  })();

  const currentTripStatusLower = String(trip.status ?? "").trim().toLowerCase();
  const canRevokeLastSimulation =
    canTripSimulate &&
    !!lastSimulatedTransition?.toStatus &&
    currentTripStatusLower === lastSimulatedTransition.toStatus &&
    !!lastSimulatedTransition.fromStatus;

  // Execute simulation: advance status + append log marker to notes
  const handleConfirmSimulate = async () => {
    if (!simConfirmStep || !canTripSimulate) return;
    setSimulating(true);
    setSimError(null);
    try {
      const updateData: {
        status: string;
        started_at?: string;
        completed_at?: string;
        status_change_origin?: string;
      } = {
        status: simConfirmStep.targetStatus,
        status_change_origin: "business_simulated",
      };
      if (simConfirmStep.started_at)
        updateData.started_at = simConfirmStep.started_at;
      if (simConfirmStep.completed_at)
        updateData.completed_at = simConfirmStep.completed_at;

      const { error } = await updateTripStatus(trip.id, updateData);
      if (error) {
        // Simulation fallback: allow final completion even when strict business validation
        // (e.g. supplier-link checks) blocks status transition in normal flows.
        if (simConfirmStep.targetStatus === "completed") {
          const { error: fallbackError } = await forceSetTripStatusSimulated(trip.id, {
            status: "completed",
            completedAt: simConfirmStep.completed_at ?? new Date().toISOString(),
            startedAt: simConfirmStep.started_at || undefined,
            statusChangeOrigin: "business_simulated",
          });
          if (fallbackError) {
            setSimError(fallbackError.message);
            setSimulating(false);
            return;
          }
        } else {
          setSimError(error.message);
          setSimulating(false);
          return;
        }
      }

      // DB trigger posts Trip System lines to `trip_messages`; refetch in-app trip chat
      // (realtime may be unavailable). Same pattern as ledger → chat bridge.
      notifyTripChatMessagesChanged();

      const userName = detail.profile?.full_name?.trim() || "Business";
      const simEntry = `[BISIM|${simConfirmStep.targetStatus}|${new Date().toISOString()}|${simConfirmStep.driverLat ?? ""}|${simConfirmStep.driverLng ?? ""}|${userName}|${String(trip.status ?? "").trim().toLowerCase()}]`;
      const existingNotes = trip.notes?.trim() || "";
      await supabase()
        .from("trips")
        .update({
          notes: existingNotes ? `${existingNotes}\n${simEntry}` : simEntry,
        })
        .eq("id", trip.id);

      setSimConfirmStep(null);
      detail.handleRefresh();
    } catch (e: unknown) {
      setSimError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setSimulating(false);
    }
  };

  const handleRevokeLastSimulation = async () => {
    if (!canRevokeLastSimulation || !lastSimulatedTransition?.fromStatus) return;
    setRevokingSimulation(true);
    setSimError(null);
    try {
      const revertToStatus = lastSimulatedTransition.fromStatus;
      const revertPayload = {
        status: revertToStatus,
        status_change_origin: "business_simulation_revoked",
      };
      const { error } = await updateTripStatus(trip.id, revertPayload);
      if (error) {
        const { error: fallbackError } = await forceSetTripStatusSimulated(trip.id, {
          status: revertPayload.status,
          statusChangeOrigin: revertPayload.status_change_origin,
        });
        if (fallbackError) {
          setSimError(fallbackError.message);
          return;
        }
      }

      // If we moved back from completion/in-progress stages, clear terminal timestamps.
      const cleanupPayload: Record<string, unknown> = {};
      if (revertToStatus !== "completed") cleanupPayload.completed_at = null;
      if (["pending_acceptance", "assigned", "draft"].includes(revertToStatus)) {
        cleanupPayload.started_at = null;
      }
      if (Object.keys(cleanupPayload).length > 0) {
        await supabase().from("trips").update(cleanupPayload).eq("id", trip.id);
      }

      notifyTripChatMessagesChanged();

      const userName = detail.profile?.full_name?.trim() || "Business";
      const loc = detail.driverLocation;
      const revokeLat = loc?.latitude ?? lastSimulatedTransition.lat ?? "";
      const revokeLng = loc?.longitude ?? lastSimulatedTransition.lng ?? "";
      const revokeEntry = `[BISIM_REVOKE|${currentTripStatusLower}|${revertToStatus}|${new Date().toISOString()}|${revokeLat}|${revokeLng}|${userName}]`;
      const existingNotes = trip.notes?.trim() || "";
      await supabase()
        .from("trips")
        .update({
          notes: existingNotes ? `${existingNotes}\n${revokeEntry}` : revokeEntry,
        })
        .eq("id", trip.id);

      detail.handleRefresh();
    } catch (e: unknown) {
      setSimError(e instanceof Error ? e.message : "Revoke simulation failed");
    } finally {
      setRevokingSimulation(false);
    }
  };

  const tripCompleted = isTripCompleted(trip);
  const canChangeManifestAssets =
    detail.canAssign && canTripReassign && !tripCompleted;
  const canOpenReassign =
    canChangeManifestAssets && (!isAggregate || !reassignMigrationBlocked);
  const effectiveStatusLower = tripCompleted
    ? "completed"
    : String(trip.status ?? "assigned").toLowerCase();
  const hasAnyAssignment =
    !!trip.driver_id ||
    !!trip.vehicle_id ||
    !!String(trip.driver_display_name ?? "").trim() ||
    !!String(trip.vehicle_display_number ?? "").trim();
  const payoutModeLabel = (() => {
    if (isDcoOperatingTrip(trip)) return "DCO";
    if (!payoutModeLc) return "—";
    if (payoutModeLc === "asset") return "Asset";
    if (payoutModeLc === "market") return "Market";
    return payoutModeLc.replace(/_/g, " ");
  })();
  const paymentStatusLabel = (() => {
    const raw = String(trip.payment_status ?? "")
      .trim()
      .toLowerCase();
    if (!raw) return "—";
    return raw.replace(/_/g, " ");
  })();
  const loadTonsLabel = (() => {
    const n = Number(trip.load_tons ?? 0);
    return Number.isFinite(n) && n > 0 ? `${n} t` : "—";
  })();
  const advancePaidLabel = (() => {
    const n = Number(trip.advance_paid ?? 0);
    return Number.isFinite(n) && n > 0 ? `₹${n.toLocaleString("en-IN")}` : "₹0";
  })();
  const amountPaidLabel = (() => {
    const n = Number(trip.amount_paid ?? 0);
    return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : "₹0";
  })();

  const vehicleTypeLabel =
    String(tripExtra.vehicle_type ?? "").trim() ||
    String(tripExtra.truck_type ?? "").trim() ||
    "";
  const adjSales = adjustedRevenue(sales, detail.adjustments);
  const adjCost = adjustedCost(cost, detail.adjustments);
  const netManifestYield = selectTripManifestMargin({
    adjustedSaleInr: adjSales,
    adjustedCostInr: adjCost,
  });
  const marginBasisLabel = isPartnerSettlementView
    ? // Partner (mover) view: sales = what they're paid (supplier_rate), cost = their
      // own freight cost — not a client-sale spread. Labeling it "Client sale −
      // supplier cost" wrongly framed the amount as the owner's margin.
      "Partner amount − your cost"
    : isAssetTripFinance
      ? "Client sale − trip cost"
      : "Client sale − supplier cost";
  const revenueSideDelta = adjSales - sales;
  const costSideDelta = adjCost - cost;
  const receivableAfterAdjustments = tripSettlement.receivableDue;
  const supplierDueAfterAdjustments = tripSettlement.payableDue;
  const provisionCostPartyName = isDcoTrip
    ? "DCO"
    : isAssetTripFinance
      ? allocatedDriverName !== "Unassigned"
        ? allocatedDriverName
        : detail.driverName?.trim() || "Driver"
      : supplierNameForParty;
  const clientPartyIntegrated = detail.clientPartyRes?.integrated ?? false;
  const supplierPartyIntegrated = detail.supplierPartyRes?.integrated ?? false;
  const hasLinkedClient = Boolean((clientIdFromContext ?? trip.client_id)?.trim());
  const hasLinkedSupplier = Boolean((trip.supplier_id ?? "").trim());
  const tripLedgerType = resolveTripLedgerTripType(trip);
  const hasNamedSupplierParty =
    hasLinkedSupplier ||
    (!!supplierNameForParty.trim() &&
      supplierNameForParty !== awaitingDataLabel);
  /**
   * Market payable lane — show whenever there is supplier cost to settle (even when opened
   * from supplier detail with `entryContext=supplier`). Recording is gated to trip owner.
   */
  const hasMarketSupplierPayable =
    !isAssetTripFinance &&
    !isDcoTrip &&
    tripLedgerType === "market" &&
    payoutModeLc !== "asset" &&
    (adjCost > 0 || cost > 0 || hasNamedSupplierParty);
  const hasDcoPayable =
    isDcoTrip &&
    (adjCost > 0 || cost > 0 || Number(trip.supplier_rate ?? 0) > 0);
  const showRecordSupplierPayoutCta =
    hasMarketSupplierPayable &&
    !isPartnerSettlementView &&
    isTripOwner &&
    canAddFinanceEntry;
  // Asset trips: the mover can pay its driver at any time, even before a cost
  // is recorded (previously gated on adjCost/cost > 0, which hid the button on
  // a fresh asset trip — chicken-and-egg). Still owner-only and not a partner view.
  /**
   * Record-driver-payout is for whoever actually employs the driver:
   *   - the trip owner running its own asset, or
   *   - a carrier settling the shipper's trip that it hauled on its own driver
   *     (partner view, own-asset deploy) — there is no separate trip row for it.
   */
  const showRecordDriverPayoutCta =
    isAssetTripFinance &&
    canAddFinanceEntry &&
    (isPartnerSettlementView ? partnerOwnAssetDriverPay > 0 : isTripOwner);
  /**
   * The partner-settlement view normally hides the payable lane: the carrier is
   * collecting from the shipper, and the shipper's own supplier payable is not
   * the carrier's business. But when the carrier hauled the load on its own
   * driver, it genuinely owes that driver, so the lane must appear — it is the
   * only place to record the payout.
   */
  const showPayableSettlementLane = isPartnerSettlementView
    ? partnerOwnAssetDriverPay > 0
    : hasMarketSupplierPayable || isAssetTripFinance || hasDcoPayable;
  const tripLedgerNavContext = {
    trip,
    router,
    displayClientName: detail.displayClientName ?? null,
    clientIdFromContext: clientIdFromContext ?? null,
    clientNameFromContext: clientNameFromContext ?? null,
    partnerName: detail.partnerName ?? null,
    driverDisplayName: detail.driverName ?? null,
  };
  const financeLayout = isDesktop ? "desktop" : "mobile";
  const openSettlementLanePreview = (lane: "receivable" | "payable") => {
    const payableEntityType = isDcoTrip
      ? "dco"
      : isAssetTripFinance
        ? "driver"
        : "supplier";
    const tx = latestTripSettlementLedgerEntry(
      ledgerEntries,
      lane,
      payableEntityType,
    );
    if (tx) {
      setPreviewLedgerTx(tx);
      return;
    }
    setActiveTab("finance");
    setFinanceSubTab("transactions");
  };
  const financeCapturePaymentSlot = (
    <View style={neoStyles.capturePaymentSlot}>
      <TripPayableReceivableSummaryCard
        layout={financeLayout}
        showReceivable={hasLinkedClient || adjSales > 0}
        clientName={clientNameForParty}
        clientAvatarUrl={detail.clientPartyAvatarFields?.avatarUrl}
        clientAvatarSeed={
          detail.clientPartyAvatarFields?.avatarSeed ??
          clientIdFromContext ??
          trip.client_id ??
          null
        }
        clientOrganizationImageUrl={
          detail.clientPartyAvatarFields?.organizationImageUrl
        }
        clientOrganizationAvatarSeed={
          detail.clientPartyAvatarFields?.organizationAvatarSeed
        }
        clientIntegrated={clientPartyIntegrated}
        revisedReceivable={adjSales}
        collectedAmount={collectedFromClient}
        receivableDue={receivableAfterAdjustments}
        receivableInfoNote={
          moverClientMarkedPaid > 0
            ? `${clientNameForParty} marked ${formatINR(moverClientMarkedPaid)} paid`
            : undefined
        }
        showPayable={showPayableSettlementLane}
        payablePartyName={provisionCostPartyName}
        payableAvatarUrl={
          isAssetTripFinance
            ? detail.driverAvatarUri
            : detail.supplierPartyAvatarFields?.avatarUrl
        }
        payableAvatarSeed={
          isAssetTripFinance
            ? (trip.driver_id ?? null)
            : (detail.supplierPartyAvatarFields?.avatarSeed ??
              trip.supplier_id ??
              null)
        }
        payableOrganizationImageUrl={
          isAssetTripFinance
            ? undefined
            : detail.supplierPartyAvatarFields?.organizationImageUrl
        }
        payableOrganizationAvatarSeed={
          isAssetTripFinance
            ? undefined
            : detail.supplierPartyAvatarFields?.organizationAvatarSeed
        }
        payableIntegrated={
          isAssetTripFinance ? undefined : supplierPartyIntegrated
        }
        payableEntityType={
          isDcoTrip ? "dco" : isAssetTripFinance ? "driver" : "supplier"
        }
        payableLaneLabel={
          isDcoTrip ? "DCO payable" : isAssetTripFinance ? "Driver payable" : "Payable"
        }
        revisedPayable={adjCost}
        paidAmount={supplierPaid}
        payableDue={supplierDueAfterAdjustments}
        onPressReceivable={
          collectedFromClient > 0
            ? () => openSettlementLanePreview("receivable")
            : undefined
        }
        onPressPayable={
          supplierPaid > 0
            ? () => openSettlementLanePreview("payable")
            : undefined
        }
        receivableAction={
          !canAddFinanceEntry ? null : (
          <TouchableOpacity
            style={[
              neoStyles.laneActionBtn,
              neoStyles.laneActionBtnPrimary,
              financeLayout === "mobile" && neoStyles.laneActionBtnMobile,
            ]}
            onPress={() => {
              const dueHint = Math.max(0, Math.round(receivableAfterAdjustments));
              pushTripLedgerQuickEntry(
                {
                  ...tripLedgerNavContext,
                  ledgerSyncExtraParams: {
                    dueAmountIn: String(dueHint),
                  },
                },
                "client",
              );
            }}
            activeOpacity={0.88}
          >
            <Feather
              name="credit-card"
              size={financeLayout === "mobile" ? 13 : 14}
              color={Theme.buttonPrimaryText}
            />
            <Text
              style={[
                neoStyles.laneActionBtnText,
                financeLayout === "mobile" && neoStyles.laneActionBtnTextMobile,
              ]}
              numberOfLines={2}
            >
              Capture payment
            </Text>
          </TouchableOpacity>
          )
        }
        payableAction={
          showRecordSupplierPayoutCta ? (
            <TouchableOpacity
              style={[
                neoStyles.laneActionBtn,
                neoStyles.laneActionBtnDark,
                financeLayout === "mobile" && neoStyles.laneActionBtnMobile,
              ]}
              onPress={() => {
                const dueOut = Math.max(0, Math.round(supplierDueAfterAdjustments));
                pushTripLedgerQuickEntry(
                  {
                    ...tripLedgerNavContext,
                    ledgerSyncExtraParams: {
                      dueAmountOut: String(dueOut),
                    },
                  },
                  "supplier",
                );
              }}
              activeOpacity={0.88}
            >
              <Feather name="arrow-up-right" size={financeLayout === "mobile" ? 13 : 14} color="#fff" />
              <Text
                style={[
                  neoStyles.laneActionBtnText,
                  neoStyles.laneActionBtnDarkText,
                  financeLayout === "mobile" && neoStyles.laneActionBtnTextMobile,
                ]}
                numberOfLines={2}
              >
                Record supplier payout
              </Text>
            </TouchableOpacity>
          ) : showRecordDriverPayoutCta ? (
            <TouchableOpacity
              style={[
                neoStyles.laneActionBtn,
                neoStyles.laneActionBtnDark,
                financeLayout === "mobile" && neoStyles.laneActionBtnMobile,
              ]}
              onPress={() => {
                const dueOut = Math.max(0, Math.round(supplierDueAfterAdjustments));
                pushTripLedgerQuickEntry(
                  {
                    ...tripLedgerNavContext,
                    ledgerSyncExtraParams: {
                      dueAmountOut: String(dueOut),
                    },
                  },
                  "driver",
                );
              }}
              activeOpacity={0.88}
            >
              <Feather name="arrow-up-right" size={financeLayout === "mobile" ? 13 : 14} color="#fff" />
              <Text
                style={[
                  neoStyles.laneActionBtnText,
                  neoStyles.laneActionBtnDarkText,
                  financeLayout === "mobile" && neoStyles.laneActionBtnTextMobile,
                ]}
                numberOfLines={2}
              >
                Record driver payout
              </Text>
            </TouchableOpacity>
          ) : null
        }
        payableActionHint={
          showRecordSupplierPayoutCta && !hasLinkedSupplier ? (
            <Text style={neoStyles.laneActionHint}>
              Link a supplier to pre-fill payout
            </Text>
          ) : null
        }
      />
    </View>
  );

  const assetCostBreakdownLines =
    isAssetTripFinance && assetProvisionCostPreview
      ? buildAssetProvisionCostBreakdownLines(assetProvisionCostPreview)
      : undefined;

  const financeAdjustmentSummaryWrappedEl = (
    <TripFinanceAdjustmentsPanel
      layout={financeLayout}
      canAddAdjustment={canVoidAdjustments}
      adjustments={detail.adjustments}
      sales={sales}
      adjSales={adjSales}
      revenueSideDelta={revenueSideDelta}
      cost={cost}
      adjCost={adjCost}
      costSideDelta={costSideDelta}
      clientName={clientNameForParty}
      clientAvatarUrl={detail.clientPartyAvatarFields?.avatarUrl}
      clientAvatarSeed={
        detail.clientPartyAvatarFields?.avatarSeed ??
        clientIdFromContext ??
        trip.client_id ??
        null
      }
      clientOrganizationImageUrl={
        detail.clientPartyAvatarFields?.organizationImageUrl
      }
      clientOrganizationAvatarSeed={
        detail.clientPartyAvatarFields?.organizationAvatarSeed
      }
      clientIntegrated={clientPartyIntegrated}
      supplierName={provisionCostPartyName}
      supplierAvatarUrl={
        isAssetTripFinance
          ? detail.driverAvatarUri
          : detail.supplierPartyAvatarFields?.avatarUrl
      }
      supplierAvatarSeed={
        isAssetTripFinance
          ? (trip.driver_id ?? null)
          : (detail.supplierPartyAvatarFields?.avatarSeed ??
            trip.supplier_id ??
            null)
      }
      supplierOrganizationImageUrl={
        isAssetTripFinance
          ? undefined
          : detail.supplierPartyAvatarFields?.organizationImageUrl
      }
      supplierOrganizationAvatarSeed={
        isAssetTripFinance
          ? undefined
          : detail.supplierPartyAvatarFields?.organizationAvatarSeed
      }
      supplierIntegrated={
        isAssetTripFinance ? undefined : supplierPartyIntegrated
      }
      isAssetExecution={isAssetTripFinance}
      costLaneLabel={isAssetTripFinance ? "Revised trip cost" : undefined}
      costBreakdownLines={assetCostBreakdownLines}
      costUnset={supplierCostRateUnset}
      lineMetaLabel={provisionLineMetaLabel}
      onOpenProvision={setShowFinanceProvisionPanel}
      onRequestDeduction={handleRequestCostDeduction}
      onViewNotePdf={(adj) => {
        const isSale = adj.type === "revenue";
        setProvisionNotePdfContext({
          adjustment: adj,
          tripCode: getTripDisplayNumber(trip, currentOrganization?.id),
          companyName: currentOrganization?.name?.trim() || "PULSE",
          partyName: isSale ? clientNameForParty : provisionCostPartyName,
          laneLabel: isSale ? "Sale" : "Cost",
          partyRole: isSale ? "Client" : isDcoTrip ? "DCO" : isAssetTripFinance ? "Driver" : "Supplier",
          baseLaneAmount: isSale ? sales : cost,
          revisedLaneAmount: isSale ? adjSales : adjCost,
        });
      }}
      onEditAdjustment={openProvisionEdit}
      capturePaymentSlot={financeCapturePaymentSlot}
    />
  );

  /** Shared mobile + desktop: trip margin hero only (detail in adjustments panel below). */
  const financeManifestSummaryBlock = (
    <TripMarginHero
      amount={netManifestYield}
      basisLabel={marginBasisLabel}
      layout={isDesktop ? "desktop" : "mobile"}
    />
  );

  const showOdometerVerification =
    isDcoOperatingTrip(trip) || isAssetExecutionTrip(trip);
  const expenseHubDensity = isDesktop ? "comfortable" : "compact";
  const odometerPreviewEl = showOdometerVerification ? (
    <TripOdometerPreviewCard
      trip={trip}
      compact={!isDesktop}
      density={expenseHubDensity}
      onRecordStart={() => openOdometerVerification("start")}
      onRecordEnd={() => openOdometerVerification("end")}
    />
  ) : null;

  const filteredFinanceRows = financeHistoryRows.filter((row) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    const text = [
      ledgerHistoryTitle(row.tx, row.isIn),
      row.tx.description ?? "",
      row.tx.payment_mode ?? "",
      (row.tx as LedgerWebExtra).reference_no ?? "",
      formatLedgerDate(row.tx.transaction_date),
    ]
      .join(" ")
      .toLowerCase();
    return text.includes(q);
  });
  const vaultDocs = detail.computedTripDocs;
  const ewayBillDoc = vaultDocs.find(isEwayBillVaultDoc);
  const vaultCardDocs = vaultDocs.filter((doc) => !isEwayBillVaultDoc(doc));
  const ewayStripRows = buildEwayBillStripRows({
    ewayDoc: ewayBillDoc,
  });
  const openEwayBillPreview = (rowId: string) => {
    if (!ewayBillDoc || !ewayDocHasPreviewableFile(ewayBillDoc)) return;
    const files = ewayBillDoc.files ?? [];
    const fileIndex = files.findIndex((file) => file.id === rowId);
    detail.setVehiclePreviewIndex(fileIndex >= 0 ? fileIndex : 0);
    detail.setSelectedDoc(ewayBillDoc);
  };
  const canUploadTripDocs =
    !!currentOrganization?.id &&
    !!trip.organization_id &&
    currentOrganization.id === trip.organization_id &&
    (!isGroundOpsOnly || groundOpsDocUploadEnabled); // Ground Ops needs the org toggle on; RLS is the real boundary

  const canUploadThisVaultDoc = (doc: (typeof detail.computedTripDocs)[number]) =>
    canMutateTripVaultDoc({
      doc,
      canUploadTripDocs,
      tripCompleted,
    });

  const openDriverDetails = () => {
    if (!trip.driver_id) return;
    router.push(`/driver/${trip.driver_id}` as never);
  };

  const openVehicleDetails = () => {
    if (!trip.vehicle_id) return;
    router.push(ROUTES.vehicleDetail(trip.vehicle_id, trip.id) as never);
  };

  const openTripDocumentsFlow = () => {
    router.push(
      `/log-incoming-pods?tripId=${encodeURIComponent(trip.id)}` as never,
    );
  };

  const handleDocOpen = (doc: (typeof detail.computedTripDocs)[number]) => {
    const isUploaded = doc.status !== "Pending" || !!doc.storagePath;
    if (isUploaded) {
      const nestedFiles = (doc.files ?? []).filter((file) => file.storagePath?.trim());
      if (nestedFiles.length > 1 || doc.id === "vehicle-documents") {
        detail.setSelectedDoc(doc);
        return;
      }
      const path = vaultPreviewStoragePath(doc);
      if (path) {
        void openVaultDocLikeChat(doc, path);
        return;
      }
      detail.setSelectedDoc(doc);
      return;
    }
    if (canUploadTripDocs) {
      openTripDocumentsFlow();
      return;
    }
    if (doc.id === "vehicle-documents" && trip.vehicle_id) {
      router.push(ROUTES.vehicleDetail(trip.vehicle_id, trip.id) as never);
    }
  };

  /**
   * Press handler for the new vault cards. Branches:
   *  - Already uploaded → open preview (existing behavior).
   *  - Vehicle Document → preview when a file exists; Add opens the type chooser.
   *  - Trip Manifest / Driver POD (pending) → inline file picker → uploadTripDocument.
   *  - User can't upload (different org) → fall back to existing handleDocOpen.
   */
  const handleVaultCardPress = (
    doc: (typeof detail.computedTripDocs)[number],
  ) => {
    const isUploaded = doc.status !== "Pending" || !!doc.storagePath;
    if (doc.id === "vehicle-documents") {
      if (!vaultDocHasPreviewableFile(doc)) return;
      detail.setSelectedDoc(doc);
      return;
    }
    if (isUploaded) {
      const nestedFiles = (doc.files ?? []).filter((file) => file.storagePath?.trim());
      if (nestedFiles.length > 1) {
        detail.setSelectedDoc(doc);
        return;
      }
      const path = vaultPreviewStoragePath(doc);
      if (path) {
        void openVaultDocLikeChat(doc, path);
        return;
      }
      detail.setSelectedDoc(doc);
      return;
    }
    if (doc.id === "lr" || doc.category === "lr") {
      if (canUploadTripDocs) void handleLRUpload();
      return;
    }
    if (canUploadTripDocs) {
      void handleVaultUpload(doc);
      return;
    }
    handleDocOpen(doc);
  };

  const hasDriverAssigned = !!trip.driver_id;
  const hasVehicleAssigned =
    !!trip.vehicle_id || !!String(trip.vehicle_display_number ?? "").trim();
  const canGenerateAggregateOtp = hasDriverAssigned && hasVehicleAssigned;
  const otpLockedByTripProgress = ["in_progress", "in_transit"].includes(
    String(trip.status ?? "").toLowerCase(),
  );
  // True when a driver row is assigned but hasn't claimed the trip yet (user_id = null).
  // Dispatcher must share the OTP so the driver can self-link via the claim flow.
  const driverIsUnlinked = hasDriverAssigned && !detail.driverLinked;

  const aggregateOtpState = (() => {
    // Non-aggregate trip with an unlinked driver: show OTP so dispatcher can share it.
    if (!isAggregate && driverIsUnlinked) return "otp_pending";
    if (!isAggregate) return null;
    if (!canGenerateAggregateOtp) return "not_required";
    const status = String(trip.status ?? "").toLowerCase();
    if (status === "assigned") return "otp_pending";
    if (status === "in_progress" || status === "in_transit") return "verified";
    return "not_required";
  })();

  const handleResendOtp = async () => {
    if (
      !trip?.id ||
      otpResending ||
      (!canGenerateAggregateOtp && !driverIsUnlinked) ||
      otpLockedByTripProgress
    )
      return;
    setOtpResending(true);
    try {
      await regenerateTripOtp(trip.id);
      detail.handleAssignmentUpdated();
    } finally {
      setOtpResending(false);
    }
  };

  // ── Dashboard: computed values ─────────────────────────────────────────────
  const statusLower = effectiveStatusLower;
  const statusLabel =
    statusLower.includes("in_transit") || statusLower.includes("transit")
      ? "In Transit"
      : statusLower.includes("in_progress")
        ? "In Progress"
        : statusLower.includes("complet") ||
            statusLower.includes("deliver") ||
            statusLower === "done"
          ? "Completed"
          : statusLower === "assigned" && !hasAnyAssignment
            ? "Unassigned"
            : statusLower === "assigned"
              ? "Assigned"
              : statusLower === "pending"
                ? "Pending"
                : (trip.status ?? "Pending");
  const statusColor =
    statusLabel === "In Transit" || statusLabel === "In Progress"
      ? "#22c55e"
      : statusLabel === "Completed"
        ? "#60a5fa"
        : "#f59e0b";
  const timelineWatermarkAnimation = (() => {
    const isCompletedLike =
      statusLower === "at_drop" ||
      statusLower.includes("arrived") ||
      statusLower.includes("destination") ||
      statusLower.includes("complet") ||
      statusLower.includes("deliver") ||
      statusLower === "done";
    if (isCompletedLike) {
      return require("@/assets/Animated folder/truck-unloading.json");
    }
    if (statusLower.includes("in_transit") || statusLower.includes("transit")) {
      return require("@/assets/Animated folder/truck-2.json");
    }
    return require("@/assets/Animated folder/truck-loading.json");
  })();
  const timelineWatermarkKey = `manifest-watermark-${statusLower}`;
  const pickupStr = trip.pickup_date
    ? new Date(trip.pickup_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const mobilePlacedOnLabel = (() => {
    if (!trip.created_at) return "—";
    try {
      return new Date(trip.created_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  })();

  const mobileTripIdLabel = getTripDisplayNumber(
    trip,
    currentOrganization?.id,
  );

  const fmtAuditDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso.slice(0, 16).replace("T", " ");
    }
  };
  void baseFreight;
  void additionalIncome;
  void deductions;
  void pending;
  void hasDest;
  void mapCenter;
  void isIntegratedTrip;
  void openDriverDetails;
  void openVehicleDetails;
  void fmtAuditDate;

  return (
    <TripProvider
      value={{
        trip,
        tripId,
        viewerOrgId: currentOrganization?.id ?? null,
        t: detail.t,
        refresh: detail.handleRefresh,
      }}
    >
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Navigation bar ──────────────────────────────────────────────────── */}
      <View
        style={[
          styles.navBar,
          { paddingHorizontal: hPad },
          !isDesktop && styles.navBarMobile,
        ]}
      >
        {isDesktop ? (
          <>
            <View style={neoStyles.manifestNavLeft}>
              <TouchableOpacity
                onPress={onBack}
                style={neoStyles.manifestBackBtn}
                activeOpacity={0.8}
              >
                <FontAwesome name="chevron-left" size={13} color="#0f172a" />
              </TouchableOpacity>
              <View style={neoStyles.manifestNavDivider} />
              <View>
                <Text style={neoStyles.manifestNavKicker}>
                  Manifest Management
                </Text>
                <View style={neoStyles.manifestNavTitleRow}>
                  <Text style={neoStyles.manifestNavTripId} numberOfLines={1}>
                    {getTripDisplayNumber(trip, currentOrganization?.id)}
                  </Text>
                  <View style={neoStyles.manifestStatusBadge}>
                    <Text style={neoStyles.manifestStatusBadgeText}>
                      {statusLabel === "Completed"
                        ? "DEPLOYED"
                        : statusLabel.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={neoStyles.manifestNavActions}>
              {detail.driverPhone?.trim() ? (
                <TouchableOpacity
                  style={neoStyles.manifestPhoneBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    const digits = detail.driverPhone!.replace(/[^\d+]/g, "");
                    if (digits) void Linking.openURL(`tel:${digits}`);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Call driver ${formatPhoneForDisplay(detail.driverPhone)}`}
                >
                  <Feather name="phone" size={14} color={Theme.driverEmerald} />
                  <Text style={neoStyles.manifestPhoneBtnText} numberOfLines={1}>
                    {formatPhoneForDisplay(detail.driverPhone)}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={neoStyles.auditBtn}
                activeOpacity={0.85}
                onPress={() => setShowTripAuditLog(true)}
                accessibilityRole="button"
                accessibilityLabel="Open trip activity"
              >
                <Feather name="clock" size={16} color="#94a3b8" />
                <Text style={neoStyles.auditBtnText}>Activity</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={neoStyles.manifestChatBtn}
                activeOpacity={0.85}
                onPress={() => void handleOpenTripChat()}
                accessibilityRole="button"
                accessibilityLabel={t("tripChatNeedsDriverTitle")}
              >
                <MessageSquare
                  size={18}
                  color={Theme.driverEmerald}
                  strokeWidth={2.2}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={neoStyles.manifestShareBtn}
                activeOpacity={0.85}
              >
                <Feather name="share-2" size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={onBack}
              style={styles.navBackHit}
              activeOpacity={0.85}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <FontAwesome name="chevron-left" size={16} color="#212121" />
            </TouchableOpacity>
            <Text style={styles.navMobileTitle}>Trips</Text>
            <View style={styles.navMobileRightActions}>
              <TouchableOpacity
                style={styles.navHelpBtn}
                activeOpacity={0.85}
                onPress={() => setShowTripAuditLog(true)}
                accessibilityRole="button"
                accessibilityLabel="Help and activity"
              >
                <Feather name="help-circle" size={15} color="#2874F0" />
                <Text style={styles.navHelpText}>Help</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.navIconHit}
                activeOpacity={0.85}
                onPress={() => void handleOpenTripChat()}
                accessibilityRole="button"
                accessibilityLabel={t("tripChatNeedsDriverTitle")}
              >
                <MessageSquare
                  size={17}
                  color={Theme.driverEmerald}
                  strokeWidth={2.2}
                />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* ── Tab bar ───────────────────────────────────────────────────────────── */}
      {false && isDesktop ? (
        <View style={[styles.tabBar, { paddingHorizontal: hPad }]}>
          <TabButton
            label="Tracking"
            icon="map-marker"
            active={desktopTab === "tracking"}
            onPress={() => setActiveTab("tracking")}
            compact={false}
          />
          <TabButton
            label="Finance"
            icon="bar-chart"
            active={desktopTab === "finance"}
            onPress={() => setActiveTab("finance")}
            compact={false}
          />
        </View>
      ) : null}

      {/* ── Scrollable content ────────────────────────────────────────────────── */}
      <ScrollView
        style={[styles.scroll, !isDesktop && styles.scrollMobileOrder]}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.scrollContentDesktop,
          {
            padding: isDesktop ? 24 : isMobile ? 0 : 18,
            gap: isDesktop ? 24 : isMobile ? 0 : 16,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={detail.refreshing}
            onRefresh={detail.handleRefresh}
          />
        }
      >
        {!isDesktop ? (
          <>
            <View style={styles.mobileOrderChipRow}>
              <TouchableOpacity
                style={[
                  styles.mobileOrderChip,
                  activeTab === "trip" && styles.mobileOrderChipActive,
                ]}
                onPress={() => setActiveTab("trip")}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.mobileOrderChipText,
                    activeTab === "trip" && styles.mobileOrderChipTextActive,
                  ]}
                >
                  Journey
                </Text>
              </TouchableOpacity>
              {canTripFinanceTab ? (
                <TouchableOpacity
                  style={[
                    styles.mobileOrderChip,
                    activeTab === "finance" && styles.mobileOrderChipActive,
                  ]}
                  onPress={() => setActiveTab("finance")}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.mobileOrderChipText,
                      activeTab === "finance" && styles.mobileOrderChipTextActive,
                    ]}
                  >
                    Finance
                  </Text>
                </TouchableOpacity>
              ) : null}
              {showExpenseHub && canTripExpensesTab ? (
                <TouchableOpacity
                  style={[
                    styles.mobileOrderChip,
                    activeTab === "expenses" && styles.mobileOrderChipActive,
                  ]}
                  onPress={() => setActiveTab("expenses")}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.mobileOrderChipText,
                      activeTab === "expenses" && styles.mobileOrderChipTextActive,
                    ]}
                  >
                    {expenseHubLabel}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {canTripDocsTab ? (
                <TouchableOpacity
                  style={[
                    styles.mobileOrderChip,
                    activeTab === "docs" && styles.mobileOrderChipActive,
                  ]}
                  onPress={() => setActiveTab("docs")}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.mobileOrderChipText,
                      activeTab === "docs" && styles.mobileOrderChipTextActive,
                    ]}
                  >
                    Vault
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <PersistentTabPanel active={activeTab === "trip"}>
              <TripMobileDetail
                tripIdLabel={getTripDisplayNumber(trip, currentOrganization?.id)}
                status={String(trip.status ?? "")}
                statusLabel={statusLabel}
                payoutModeLabel={payoutModeLabel}
                createdAtIso={trip.created_at ?? null}
                pickupDateIso={trip.pickup_date ?? null}
                completedAtIso={trip.completed_at ?? null}
                startedAtIso={trip.started_at ?? null}
                origin={
                  [originSplit.primary, originStateLabel]
                    .filter(Boolean)
                    .join(", ") ||
                  trip.pickup_area ||
                  "—"
                }
                destination={
                  [destinationSplit.primary, destinationStateLabel]
                    .filter(Boolean)
                    .join(", ") ||
                  trip.drop_location ||
                  "—"
                }
                vehicleLabel={allocatedVehicleLabel}
                vehicleType={vehicleTypeLabel}
                loadTonsLabel={loadTonsLabel}
                distanceLabel={resolvedDistanceLabel}
                etaLabel={liveTrackingPresentation?.eta.label ?? null}
                clientName={clientNameForParty}
                driverName={allocatedDriverName}
                driverPhone={detail.driverPhone}
                supplierName={supplierNameForParty}
                clientParty={{
                  name: clientNameForParty,
                  roleLabel: "Client",
                  entityType: "client",
                  avatarUrl: detail.clientPartyAvatarFields?.avatarUrl,
                  avatarSeed: detail.clientPartyAvatarFields?.avatarSeed,
                  organizationImageUrl:
                    detail.clientPartyAvatarFields?.organizationImageUrl,
                  organizationAvatarSeed:
                    detail.clientPartyAvatarFields?.organizationAvatarSeed,
                  isIntegrated: clientPartyIntegrated,
                }}
                costParty={
                  isAssetTripFinance
                    ? {
                        name:
                          allocatedDriverName !== "Unassigned"
                            ? allocatedDriverName
                            : detail.driverName?.trim() || "Driver",
                        roleLabel: "Driver",
                        entityType: "driver",
                        avatarUrl: detail.driverAvatarUri,
                        avatarSeed: trip.driver_id,
                        isIntegrated: false,
                      }
                    : {
                        name: supplierNameForParty,
                        roleLabel: "Supplier",
                        entityType: "supplier",
                        avatarUrl: detail.supplierPartyAvatarFields?.avatarUrl,
                        avatarSeed: detail.supplierPartyAvatarFields?.avatarSeed,
                        organizationImageUrl:
                          detail.supplierPartyAvatarFields
                            ?.organizationImageUrl,
                        organizationAvatarSeed:
                          detail.supplierPartyAvatarFields
                            ?.organizationAvatarSeed,
                        isIntegrated: supplierPartyIntegrated,
                      }
                }
                saleInr={sales}
                costInr={cost}
                adjustedSaleInr={adjSales}
                adjustedCostInr={adjCost}
                marginInr={netManifestYield}
                marginBasisLabel={marginBasisLabel}
                saleLabel={
                  isPartnerSettlementView ? "Partner amount" : "Client rate"
                }
                costLabel={
                  isDcoTrip
                    ? "DCO earning"
                    : isAssetTripFinance
                    ? "Trip cost"
                    : isPartnerSettlementView
                      ? "Your cost"
                      : "Supplier cost"
                }
                canTrack={canTripTrackingTab}
                onTrack={() => {
                  if (!hasDriverAssigned) {
                    Alert.alert(
                      "Driver not assigned",
                      "Assign a driver to this trip before you can track live location.",
                      canChangeManifestAssets
                        ? [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Assign driver",
                              onPress: () => openAssignmentFlow("driver"),
                            },
                          ]
                        : [{ text: "OK" }],
                    );
                    return;
                  }
                  if (driverMapTrackingEligible) {
                    detail.setShowTrackingModal(true);
                  } else {
                    router.push(ROUTES.trackTrip(trip.id));
                  }
                }}
                canChangeAssets={canChangeManifestAssets}
                onChangeAssets={() => openAssignmentFlow("driver")}
                onOpenFinance={
                  canTripFinanceTab
                    ? () => setActiveTab("finance")
                    : undefined
                }
              >
                {canTripTrackingTab &&
                driverMapTrackingEligible &&
                (isDesktop || detail.showTrackingModal) ? (
                  <View style={styles.mobileOrderOpsSheet}>
                    <TripDetailTrackingHub
                      onOpenLiveTracking={() =>
                        detail.setShowTrackingModal(true)
                      }
                      presentation={liveTrackingPresentation}
                      driverLastPing={driverLastPingDisplay}
                      recordedAt={driverLastPingRecordedAt}
                      broadcastActive={trackingState?.broadcastActive ?? false}
                    />
                    {trip ? (
                      <View style={{ marginTop: 8 }}>
                        <TripStageControlPanel
                          trip={trip}
                          driverName={detail.driverName}
                          vehicleLabel={detail.vehicleLabel}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {canTripRatings ? (
                  <View style={styles.mobileOrderRatingsSheet}>
                    <TripRatingsBlock
                      trip={trip}
                      organizationId={currentOrganization?.id ?? null}
                      partnerName={detail.partnerName}
                      driverName={detail.driverName}
                      driverAvatarUri={detail.driverAvatarUri}
                      clientName={
                        detail.displayClientName ?? trip.client_name ?? null
                      }
                      clientPartyAvatarFields={detail.clientPartyAvatarFields}
                      supplierPartyAvatarFields={
                        detail.supplierPartyAvatarFields
                      }
                      paymentCaptured={paymentCaptured}
                      layoutVariant="registry"
                      skipHistoricalPartyRatings={tripCompleted}
                    />
                  </View>
                ) : null}
              </TripMobileDetail>
            </PersistentTabPanel>
            <PersistentTabPanel active={activeTab === "finance"}>
              <TripMobileFinancePanel
                tripIdLabel={mobileTripIdLabel}
                createdAtLabel={mobilePlacedOnLabel}
                statusLabel={statusLabel}
                saleLabel={
                  isPartnerSettlementView ? "Partner amount" : "Client rate"
                }
                costLabel={
                  isDcoTrip
                    ? "DCO earning"
                    : isAssetTripFinance
                    ? "Trip cost"
                    : isPartnerSettlementView
                      ? "Your cost"
                      : "Supplier cost"
                }
                saleInr={sales}
                costInr={cost}
                adjustedSaleInr={adjSales}
                adjustedCostInr={adjCost}
                marginInr={netManifestYield}
                marginBasisLabel={marginBasisLabel}
                clientName={clientNameForParty}
                payablePartyName={provisionCostPartyName}
                payablePartyLabel={
                  isDcoTrip ? "DCO" : isAssetTripFinance ? "Driver" : "Supplier"
                }
                subTab={financeSubTab}
                onSubTabChange={setFinanceSubTab}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                captureSlot={undefined}
                summarySlot={financeAdjustmentSummaryWrappedEl}
                transactionsSlot={
                  ledgerEntries.length === 0 && ledgerEntriesLoading ? (
                    <Text style={styles.mobileOrderEmptyTxn}>
                      Loading ledger…
                    </Text>
                  ) : ledgerEntries.length === 0 && ledgerEntriesError ? (
                    <Text style={styles.mobileOrderEmptyTxn}>
                      Couldn’t load ledger
                    </Text>
                  ) : filteredFinanceRows.length === 0 ? (
                    <Text style={styles.mobileOrderEmptyTxn}>
                      No transactions yet
                    </Text>
                  ) : (
                    filteredFinanceRows.map((row) => (
                      <TouchableOpacity
                        key={row.key}
                        style={styles.mobileOrderTxnRow}
                        activeOpacity={0.85}
                        onPress={() => setPreviewLedgerTx(row.tx)}
                        accessibilityRole="button"
                        accessibilityLabel="Preview transaction"
                      >
                        <View style={styles.mobileOrderTxnLeft}>
                          <View
                            style={[
                              styles.mobileOrderTxnIcon,
                              row.isIn
                                ? styles.mobileOrderTxnIconIn
                                : styles.mobileOrderTxnIconOut,
                            ]}
                          >
                            <Feather
                              name={
                                row.isIn ? "arrow-down-left" : "arrow-up-right"
                              }
                              size={14}
                              color={row.isIn ? Theme.positive : Theme.teslaRed}
                            />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              style={styles.mobileOrderTxnLabel}
                              numberOfLines={1}
                            >
                              {ledgerHistoryTitle(row.tx, row.isIn)}
                            </Text>
                            <Text
                              style={styles.mobileOrderTxnMeta}
                              numberOfLines={1}
                            >
                              {formatLedgerDate(row.tx.transaction_date)} ·{" "}
                              {row.tx.payment_mode || "Wallet"}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.mobileOrderTxnAmount,
                            row.isIn
                              ? styles.mobileOrderTxnAmountIn
                              : styles.mobileOrderTxnAmountOut,
                          ]}
                        >
                          {formatINR(row.amount)}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )
                }
              />
            </PersistentTabPanel>
            {showExpenseHub && canTripExpensesTab ? (
              <PersistentTabPanel active={activeTab === "expenses"}>
              <View style={[styles.refFinanceWrap, styles.mobileOrderTabPad]}>
                {odometerPreviewEl}
                <Suspense fallback={<ActivityIndicator style={{ margin: 24 }} color="#818cf8" />}>
                <TripExpensesScreen
                  trip={trip}
                  embedded
                  density={expenseHubDensity}
                  onAddFuel={() => router.push(ROUTES.tripFuelEntry(trip.id) as never)}
                  onAddToll={() => router.push(ROUTES.tripTollEntry(trip.id) as never)}
                  onAddOtherExpense={() => router.push(ROUTES.tripOtherExpenseEntry(trip.id) as never)}
                  onEditExpense={(event) => {
                    const href = tripExpenseEntryEditRoute(trip.id, event.id);
                    if (href) router.push(href as never);
                  }}
                  driverCashPayouts={driverCashPayoutsForExpenses}
                  onRecordDriverPayment={
                    trip.driver_id
                      ? () =>
                          pushTripLedgerQuickEntry(
                            {
                              trip,
                              router,
                              displayClientName: detail.displayClientName ?? null,
                              clientIdFromContext: clientIdFromContext ?? null,
                              clientNameFromContext: clientNameFromContext ?? null,
                              partnerName: detail.partnerName ?? null,
                              driverDisplayName: detail.driverName ?? null,
                              ledgerSyncExtraParams: {
                                dueAmountOut:
                                  driverReimbursementDueInr > 0
                                    ? String(
                                        Math.round(driverReimbursementDueInr),
                                      )
                                    : undefined,
                              },
                            },
                            "driver",
                          )
                      : undefined
                  }
                />
                </Suspense>
              </View>
              </PersistentTabPanel>
            ) : null}
            <PersistentTabPanel active={activeTab === "docs"}>
              <TripMobileVaultPanel
                docs={vaultDocs}
                canUploadTripDocs={canUploadTripDocs}
                tripCompleted={tripCompleted}
                uploadingDocId={uploadingDocId}
                vehicleId={trip.vehicle_id ?? null}
                onCardPress={handleVaultCardPress}
                onAddMore={(doc) => startAddMoreForDoc(doc)}
                ewayStripRows={ewayStripRows}
                onViewEwayBill={openEwayBillPreview}
                canEditEwayBill={canUploadTripDocs}
                onSaveEwayBill={saveEwayBillFields}
                tripIdLabel={mobileTripIdLabel}
                createdAtLabel={mobilePlacedOnLabel}
              />
            </PersistentTabPanel>
          </>
        ) : null}

        {isDesktop ? (
          <View style={neoStyles.shell}>
            <View style={neoStyles.grid}>
              <View style={neoStyles.mainCol}>
                <View style={neoStyles.hero}>
                  <View style={neoStyles.heroGlow} />
                  <View style={neoStyles.heroBridge}>
                    <View style={neoStyles.heroParty}>
                      <PartyAvatar
                        name={clientNameForParty}
                        entityType="client"
                        size={MANIFEST_HERO_AVATAR_DESKTOP}
                        organizationImageUrl={
                          detail.clientPartyAvatarFields
                            ?.organizationImageUrl ?? undefined
                        }
                        organizationAvatarSeed={
                          detail.clientPartyAvatarFields
                            ?.organizationAvatarSeed ?? undefined
                        }
                        avatarUrl={
                          detail.clientPartyAvatarFields?.avatarUrl ?? undefined
                        }
                        avatarSeed={
                          detail.clientPartyAvatarFields?.avatarSeed ??
                          undefined
                        }
                        isIntegrated={clientPartyIntegrated}
                        showIntegrationBadge={false}
                      />
                      <View style={neoStyles.heroPartyText}>
                        <Text style={neoStyles.heroKicker}>CLIENT</Text>
                        <Text
                          style={neoStyles.heroPartyName}
                          numberOfLines={2}
                          ellipsizeMode="tail"
                        >
                          {clientNameCard}
                        </Text>
                      </View>
                    </View>
                    <View style={neoStyles.swapIcon}>
                      <FontAwesome name="exchange" size={11} color="#64748b" />
                    </View>
                    {showManifestHeroDriver ? (
                      <NeoManifestHeroBridgePartyEnd
                        roleLabel="DRIVER"
                        partyName={allocatedDriverName}
                        partyPhone={detail.driverPhone}
                        entityType="driver"
                        avatarSize={MANIFEST_HERO_AVATAR_DESKTOP}
                        avatarUrl={detail.driverAvatarUri}
                        avatarSeed={trip.driver_id}
                        vehicleLabel={allocatedVehicleLabel}
                        vehicleId={trip.vehicle_id}
                        styles={neoStyles}
                        partyStyles={manifestHeroBridgePartyStyles}
                      />
                    ) : (
                      <NeoManifestHeroBridgePartyEnd
                        roleLabel="SUPPLIER"
                        partyName={supplierName}
                        entityType="supplier"
                        avatarSize={MANIFEST_HERO_AVATAR_DESKTOP}
                        avatarUrl={detail.supplierPartyAvatarFields?.avatarUrl}
                        avatarSeed={
                          detail.supplierPartyAvatarFields?.avatarSeed
                        }
                        organizationImageUrl={
                          detail.supplierPartyAvatarFields?.organizationImageUrl
                        }
                        organizationAvatarSeed={
                          detail.supplierPartyAvatarFields
                            ?.organizationAvatarSeed
                        }
                        isIntegrated={supplierPartyIntegrated}
                        styles={neoStyles}
                        partyStyles={manifestHeroBridgePartyStyles}
                      />
                    )}
                  </View>

                  <View style={neoStyles.routeHeroRow}>
                    <View style={neoStyles.routeHeroSide}>
                      <Text style={neoStyles.routeHeroCity} numberOfLines={2}>
                        {originSplit.primary.toUpperCase()}
                      </Text>
                      <Text style={neoStyles.routeHeroSub}>
                        {originStateLabel.toUpperCase()}
                      </Text>
                    </View>
                    <View style={neoStyles.routeVector}>
                      <View style={neoStyles.routeVectorLine} />
                      <View style={neoStyles.routeVectorTruck}>
                        <Feather name="truck" size={15} color="#cbd5e1" />
                      </View>
                      <View style={neoStyles.routeVectorLine} />
                    </View>
                    <View
                      style={[
                        neoStyles.routeHeroSide,
                        neoStyles.routeHeroSideRight,
                      ]}
                    >
                      <Text
                        style={[neoStyles.routeHeroCity, neoStyles.alignRight]}
                        numberOfLines={2}
                      >
                        {destinationSplit.primary.toUpperCase()}
                      </Text>
                      <Text
                        style={[neoStyles.routeHeroSub, neoStyles.alignRight]}
                      >
                        {destinationStateLabel.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={neoStyles.heroMetrics}>
                    <View style={neoStyles.heroMetric}>
                      <Text style={neoStyles.heroMetricLabel}>
                        Manifest Range
                      </Text>
                      <Text style={neoStyles.heroMetricValue}>
                        {resolvedDistanceLabel
                          ? resolvedDistanceLabel.replace(/\s*km$/i, " KM")
                          : "—"}
                      </Text>
                    </View>
                    <View style={neoStyles.heroMetricDivider} />
                    <View style={neoStyles.heroMetric}>
                      <Text style={neoStyles.heroMetricLabel}>
                        ETA Manifest
                      </Text>
                      <Text style={neoStyles.heroMetricValue}>
                        {liveTrackingPresentation?.eta.label ?? '—'}
                      </Text>
                    </View>
                    <View style={neoStyles.heroMetricDivider} />
                    <View style={neoStyles.heroMetric}>
                      <Text style={neoStyles.heroMetricLabel}>Status</Text>
                      <Text
                        style={[
                          neoStyles.heroMetricValue,
                          { color: statusColor },
                        ]}
                      >
                        {statusLabel.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={neoStyles.tabShell}>
                  {(
                    [
                      {
                        id: "trip" as const,
                        label: "Journey Log",
                        icon: "activity" as const,
                      },
                      ...(canTripFinanceTab
                        ? [
                            {
                              id: "finance" as const,
                              label: "Finance Hub",
                              icon: "credit-card" as const,
                            },
                          ]
                        : []),
                      ...(showExpenseHub && canTripExpensesTab
                        ? [
                            {
                              id: "expenses" as const,
                              label: expenseHubLabel,
                              icon: "dollar-sign" as const,
                            },
                          ]
                        : []),
                      ...(canTripDocsTab
                        ? [
                            {
                              id: "docs" as const,
                              label: "Asset Vault",
                              icon: "shield" as const,
                            },
                          ]
                        : []),
                    ] as const
                  ).map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <TouchableOpacity
                        key={tab.id}
                        style={[
                          neoStyles.neoTab,
                          active && neoStyles.neoTabActive,
                        ]}
                        onPress={() => setActiveTab(tab.id)}
                        activeOpacity={0.86}
                      >
                        <Feather
                          name={tab.icon}
                          size={15}
                          color={active ? "#818cf8" : "#94a3b8"}
                        />
                        <Text
                          style={[
                            neoStyles.neoTabText,
                            active && neoStyles.neoTabTextActive,
                          ]}
                        >
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {activeTab === "trip" ? (
                  <View
                    style={[
                      neoStyles.journeyGrid,
                      isMobile && neoStyles.journeyGridMobile,
                    ]}
                  >
                    <View
                      style={[
                        neoStyles.timelineCard,
                        isMobile && neoStyles.timelineCardMobile,
                      ]}
                    >
                      <View
                        pointerEvents="none"
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        style={[
                          neoStyles.timelineWatermarkWrap,
                          isMobile && neoStyles.timelineWatermarkWrapMobile,
                        ]}
                      >
                        <LottieView
                          key={timelineWatermarkKey}
                          source={timelineWatermarkAnimation}
                          autoPlay
                          loop
                          speed={0.85}
                          style={neoStyles.timelineWatermark}
                        />
                      </View>
                      <View style={neoStyles.timelineCardContent}>
                        <View
                          style={[
                            neoStyles.cardTitleRow,
                            isMobile && neoStyles.cardTitleRowMobile,
                          ]}
                        >
                          <View style={neoStyles.manifestPulseTitleGroup}>
                            <Activity size={24} color="#5856D6" strokeWidth={2.5} />
                            <Text
                              style={[
                                neoStyles.cardTitleDark,
                                isMobile && neoStyles.cardTitleDarkMobile,
                              ]}
                            >
                              MANIFEST PULSE
                            </Text>
                          </View>
                          <View style={neoStyles.simActions}>
                            {canRevokeLastSimulation ? (
                              <TouchableOpacity
                                style={[
                                  neoStyles.simBtn,
                                  neoStyles.simBtnRevoke,
                                  isMobile && neoStyles.simBtnMobile,
                                ]}
                                onPress={handleRevokeLastSimulation}
                                activeOpacity={0.85}
                                disabled={simulating || revokingSimulation}
                              >
                                {revokingSimulation ? (
                                  <LoadingIndicator size="small" color="#f59e0b" />
                                ) : (
                                  <Feather name="rotate-ccw" size={13} color="#f59e0b" />
                                )}
                                <Text
                                  style={[
                                    neoStyles.simBtnText,
                                    isMobile && neoStyles.simBtnTextMobile,
                                  ]}
                                >
                                  {revokingSimulation ? "Revoking…" : "Revoke Last"}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                            {nextSimulateStep && !tripCompleted ? (
                              <TouchableOpacity
                                style={[neoStyles.simBtn, isMobile && neoStyles.simBtnMobile]}
                                onPress={() => setSimConfirmStep(nextSimulateStep)}
                                activeOpacity={0.85}
                                disabled={revokingSimulation}
                              >
                                <Zap size={14} color="#f59e0b" fill="#f59e0b" />
                                <Text
                                  style={[
                                    neoStyles.simBtnText,
                                    isMobile && neoStyles.simBtnTextMobile,
                                  ]}
                                >
                                  {nextSimulateStep.targetStatus === "completed"
                                    ? "Simulate Complete"
                                    : "Simulate"}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                        {visibleJourneyLogs.map((log, index) => {
                          const expanded = expandedLog === index;
                          const isLast = index === visibleJourneyLogs.length - 1;
                          const isCurrent =
                            !manifestJourneyComplete && isLast;
                          const phase: "completed" | "current" | "pending" = isCurrent
                            ? "current"
                            : "completed";
                          const stepIndex = manifestStepIndexForLog(log.stepKey);
                          const stepSimLogs = manifestSimLogsForStepIndex(
                            stepIndex,
                            simLogEntries,
                          );
                          return (
                            <View
                              key={`${log.stepKey}-${index}`}
                              style={[
                                neoStyles.timelineItemWrap,
                                !isLast && neoStyles.timelineItemWrapSpaced,
                                isMobile &&
                                  !isLast &&
                                  neoStyles.timelineItemWrapSpacedMobile,
                              ]}
                            >
                              {!isLast ? (
                                <View
                                  style={[
                                    neoStyles.timelineConnector,
                                    { backgroundColor: "#40B876" },
                                  ]}
                                />
                              ) : null}
                              <TouchableOpacity
                                style={[
                                  neoStyles.timelineItem,
                                  isMobile && neoStyles.timelineItemMobile,
                                  expanded && neoStyles.timelineItemActive,
                                ]}
                                onPress={() =>
                                  setExpandedLog(expanded ? null : index)
                                }
                                activeOpacity={0.9}
                              >
                                <View style={neoStyles.manifestPulseIconColumn}>
                                  <ManifestPulseStepIcon phase={phase} />
                                </View>
                                <View style={neoStyles.timelineBody}>
                                  <View style={neoStyles.timelineTop}>
                                    <Text
                                      style={[
                                        neoStyles.timelineStatus,
                                        isMobile && neoStyles.timelineStatusMobile,
                                      ]}
                                    >
                                      {log.status}
                                    </Text>
                                    <Text
                                      style={[
                                        neoStyles.timelineTime,
                                        isMobile && neoStyles.timelineTimeMobile,
                                      ]}
                                    >
                                      {log.time}
                                    </Text>
                                  </View>
                                  <Text
                                    style={[
                                      neoStyles.timelineLocation,
                                      isMobile && neoStyles.timelineLocationMobile,
                                    ]}
                                    numberOfLines={expanded ? undefined : 2}
                                  >
                                    {log.location}
                                  </Text>
                                  {log.locationCoords ? (
                                    <Text
                                      style={[
                                        neoStyles.timelineLocationCoords,
                                        isMobile &&
                                          neoStyles.timelineLocationCoordsMobile,
                                      ]}
                                      numberOfLines={expanded ? undefined : 2}
                                    >
                                      {log.locationCoords}
                                    </Text>
                                  ) : null}
                                  {expanded ? (
                                    <Text style={neoStyles.timelineDetails}>
                                      {log.details}
                                    </Text>
                                  ) : null}
                                  {expanded && stepIndex === 3 ? (
                                    <ManifestDriverPingList pings={manifestDriverPings} />
                                  ) : null}
                                  {/* Business simulation log badges */}
                                  {stepSimLogs.map((sim, si) => (
                                    <View
                                      key={si}
                                      style={[
                                        neoStyles.simLogBadge,
                                        isMobile && neoStyles.simLogBadgeMobile,
                                      ]}
                                    >
                                      <Feather
                                        name="zap"
                                        size={10}
                                        color="#f59e0b"
                                      />
                                      <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text
                                          style={[
                                            neoStyles.simLogBadgeText,
                                            isMobile &&
                                              neoStyles.simLogBadgeTextMobile,
                                          ]}
                                        >
                                          Business simulated · {sim.userName}
                                        </Text>
                                        {sim.timestamp ? (
                                          <Text
                                            style={[
                                              neoStyles.simLogBadgeTime,
                                              isMobile &&
                                                neoStyles.simLogBadgeTimeMobile,
                                            ]}
                                          >
                                            {formatTrackingDateTime(sim.timestamp)}
                                          </Text>
                                        ) : null}
                                      </View>
                                    </View>
                                  ))}
                                </View>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    </View>

                    {/* Business Simulate Confirmation Modal */}
                    {simConfirmStep ? (
                      <Modal
                        transparent
                        animationType="fade"
                        visible
                        onRequestClose={() => setSimConfirmStep(null)}
                      >
                        <View style={neoStyles.simModalBackdrop}>
                          <View style={neoStyles.simModal}>
                            <View style={neoStyles.simModalHeader}>
                              <Feather name="zap" size={18} color="#f59e0b" />
                              <Text style={neoStyles.simModalTitle}>
                                Simulate Stage
                              </Text>
                            </View>
                            <Text style={neoStyles.simModalAction}>
                              {simConfirmStep.label}
                            </Text>
                            <View style={neoStyles.simModalDivider} />
                            {simConfirmStep.driverLat != null ? (
                              <View style={neoStyles.simModalLocRow}>
                                <Feather
                                  name="map-pin"
                                  size={13}
                                  color="#10b981"
                                />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={neoStyles.simModalLocLabel}>
                                    Driver location
                                  </Text>
                                  <Text
                                    style={neoStyles.simModalLocValue}
                                    numberOfLines={2}
                                  >
                                    {simConfirmStep.driverLocLabel ||
                                      `${simConfirmStep.driverLat.toFixed(5)}°N, ${simConfirmStep.driverLng?.toFixed(5) ?? "—"}°E`}
                                  </Text>
                                  <Text style={neoStyles.simModalLocCoords}>
                                    {simConfirmStep.driverLat.toFixed(5)}°N{" "}
                                    {simConfirmStep.driverLng?.toFixed(5) ??
                                      "—"}
                                    °E
                                  </Text>
                                </View>
                              </View>
                            ) : (
                              <Text style={neoStyles.simModalNoLoc}>
                                No driver GPS data available
                              </Text>
                            )}
                            {simError ? (
                              <Text style={neoStyles.simModalError}>
                                {simError}
                              </Text>
                            ) : null}
                            <View style={neoStyles.simModalBtns}>
                              <TouchableOpacity
                                style={neoStyles.simModalCancel}
                                onPress={() => {
                                  setSimConfirmStep(null);
                                  setSimError(null);
                                }}
                                activeOpacity={0.8}
                              >
                                <Text style={neoStyles.simModalCancelText}>
                                  Cancel
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[
                                  neoStyles.simModalConfirm,
                                  simulating && { opacity: 0.6 },
                                ]}
                                onPress={handleConfirmSimulate}
                                disabled={simulating}
                                activeOpacity={0.85}
                              >
                                {simulating ? (
                                  <LoadingIndicator
                                    size="small"
                                    color="#fff"
                                  />
                                ) : (
                                  <Feather name="zap" size={14} color="#fff" />
                                )}
                                <Text style={neoStyles.simModalConfirmText}>
                                  {simulating
                                    ? "Simulating…"
                                    : "Confirm Simulate"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </Modal>
                    ) : null}

                    <View style={neoStyles.radarCard}>
                      <View style={neoStyles.radarMapLayer}>
                        <WaitingForDriverLocationOverlay
                          visible={detail.waitingForNewDriverLocation}
                        />
                        <DeferredTripMap
                          source={(trip.pickup_area ?? "").trim() || undefined}
                          destination={
                            (trip.drop_location ?? "").trim() || undefined
                          }
                          sourceCoords={
                            detail.trackingMapOriginCoordinate ?? undefined
                          }
                          destCoords={
                            detail.trackingMapDestinationCoordinate ?? undefined
                          }
                          truckLocation={mapTruckLocation}
                          dbLocationTrail={mapDbLocationTrail}
                          truckStatus={mapTruckStatus}
                          height="100%"
                          onDistanceCalculated={setMapRouteDistanceKm}
                          tripId={trip.id}
                          trackingEnabled={trackingState?.broadcastActive ?? false}
                          fitPaddingBottom={driverMapTrackingEligible ? 168 : 96}
                          driverAvatarUri={detail.driverAvatarUri}
                          driverAvatarSeed={trip.driver_id}
                          driverOnline={trackingState?.broadcastActive ?? false}
                        />
                        {showDriverTrackingOfflineOverlay ? (
                          <DriverTrackingOfflineOverlay
                            variant="map"
                            showReassign={detail.canAssign}
                            onSendLoginReminder={detail.requestDriverPing}
                            onReassignDriver={() => setShowReassignSheet(true)}
                          />
                        ) : null}
                      </View>
                      {trackingState?.broadcastActive ? (
                        <View style={neoStyles.radarLive} pointerEvents="none">
                          <View style={neoStyles.radarLiveDot} />
                          <Text style={neoStyles.radarLiveText}>
                            Live Telemetry
                          </Text>
                        </View>
                      ) : driverMapTrackingEligible ? (
                        <View
                          style={[neoStyles.radarLive, neoStyles.radarHistory]}
                          pointerEvents="none"
                        >
                          <Text style={neoStyles.radarHistoryText}>
                            Route history
                          </Text>
                        </View>
                      ) : null}
                      <View
                        style={neoStyles.radarBottom}
                        pointerEvents="box-none"
                      >
                        <View style={neoStyles.radarBottomMetaRow}>
                          <View style={neoStyles.radarBottomLeft}>
                            <Text style={neoStyles.radarMetaLabel}>
                              Driver location
                            </Text>
                            <Text
                              style={neoStyles.radarMetaValue}
                              numberOfLines={2}
                            >
                              {driverLastPingDisplay.locationLabel?.trim() ||
                                driverLastPingDisplay.cityLabel?.trim() ||
                                (driverMapTrackingEligible
                                  ? "Waiting for first ping"
                                  : "—")}
                            </Text>
                            {detail.driverName?.trim() ? (
                              <Text style={neoStyles.radarDriverName} numberOfLines={1}>
                                {detail.driverName.trim()}
                                {detail.vehicleLabel?.trim()
                                  ? ` · ${detail.vehicleLabel.trim()}`
                                  : ""}
                              </Text>
                            ) : null}
                          </View>
                          <View style={neoStyles.radarBottomRight}>
                            <Text style={neoStyles.radarMetaLabel}>
                              {driverLastPingDisplay.recordedAtLabel
                                ? "Last ping"
                                : "Distance / ETA"}
                            </Text>
                            {driverLastPingDisplay.recordedAtLabel ? (
                              <Text style={neoStyles.radarMetaTime}>
                                {driverLastPingDisplay.recordedAtLabel}
                              </Text>
                            ) : (
                              <Text style={neoStyles.radarSpeed}>
                                {resolvedDistanceLabel ?? "Calculating"}{" "}
                                <Text style={neoStyles.radarSpeedUnit}>
                                  · {liveTrackingPresentation?.eta.label ?? "—"}
                                </Text>
                              </Text>
                            )}
                          </View>
                        </View>
                        {driverMapTrackingEligible ? (
                          <View style={neoStyles.radarBottomActions}>
                            <TouchableOpacity
                              style={neoStyles.radarBottomActionBtn}
                              onPress={() => detail.setShowTrackingModal(true)}
                              activeOpacity={0.75}
                              accessibilityRole="button"
                              accessibilityLabel="Open live tracking"
                            >
                              <Feather name="map-pin" size={14} color={Theme.buttonDarkText} />
                              <Text style={neoStyles.radarBottomActionTextLive}>
                                Live Tracking
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                neoStyles.radarBottomActionBtn,
                                neoStyles.radarBottomActionBtnPing,
                                isPingTimedOut && neoStyles.radarBottomActionBtnTimedOut,
                                (trackingState?.isPinging ?? false) &&
                                  neoStyles.radarBottomActionBtnActive,
                              ]}
                              onPress={detail.requestDriverPing}
                              disabled={trackingState?.isPinging ?? false}
                              activeOpacity={0.75}
                              accessibilityRole="button"
                              accessibilityLabel="Ping driver"
                            >
                              {(trackingState?.isPinging ?? false) ? (
                                <ActivityIndicator size="small" color={Theme.buttonDarkText} />
                              ) : isPingTimedOut ? (
                                <Feather name="alert-circle" size={14} color={Theme.buttonDarkText} />
                              ) : (
                                <Feather name="navigation" size={14} color={Theme.buttonDarkText} />
                              )}
                              <Text
                                style={[
                                  neoStyles.radarBottomActionTextPing,
                                  isPingTimedOut && neoStyles.radarPingTextTimedOut,
                                ]}
                              >
                                {(trackingState?.isPinging ?? false)
                                  ? "Pinging…"
                                  : isPingTimedOut
                                    ? "No response"
                                    : "Ping Driver"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ) : activeTab === "finance" ? (
                  <View style={neoStyles.financeStack}>
                    <View style={neoStyles.financeSubTabs}>
                      {(["summary", "transactions"] as const).map((sub) => {
                        const active = financeSubTab === sub;
                        return (
                          <TouchableOpacity
                            key={sub}
                            style={neoStyles.financeSubTab}
                            onPress={() => setFinanceSubTab(sub)}
                            activeOpacity={0.86}
                          >
                            <Text
                              style={[
                                neoStyles.financeSubTabText,
                                isDesktop && neoStyles.financeSubTabTextDesktop,
                                active && neoStyles.financeSubTabTextActive,
                              ]}
                            >
                              {sub}
                            </Text>
                            {active ? (
                              <View style={neoStyles.financeSubLine} />
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {financeSubTab === "summary" ? (
                      <>
                        <View
                          style={[
                            neoStyles.financeSummaryTwoPane,
                            isDesktop && neoStyles.financeSummaryTwoPaneDesktop,
                          ]}
                        >
                          <View
                            style={[
                              neoStyles.financeSummaryPaneLeft,
                              isDesktop && neoStyles.financeSummaryPaneLeftDesktop,
                            ]}
                          >
                            <View
                              style={[
                                neoStyles.financeManifestInPane,
                                isDesktop && neoStyles.financeManifestInPaneDesktop,
                              ]}
                            >
                              {financeManifestSummaryBlock}
                              {financeAdjustmentSummaryWrappedEl}
                            </View>
                          </View>
                          <View
                            style={[
                              neoStyles.financeSummaryPaneRight,
                              isDesktop && neoStyles.financeSummaryPaneRightDesktop,
                            ]}
                          >
                            {canViewTripLedger && (
                            <View
                              style={[
                                neoStyles.financeLedgerPreviewCard,
                                isDesktop && neoStyles.financeLedgerPreviewCardDesktop,
                              ]}
                            >
                              <View style={neoStyles.financeLedgerPreviewHead}>
                                <Text
                                  style={[
                                    neoStyles.financeLedgerPreviewTitle,
                                    isDesktop && neoStyles.financeLedgerPreviewTitleDesktop,
                                  ]}
                                >
                                  Ledger snapshot
                                </Text>
                                <TouchableOpacity
                                  style={neoStyles.financeLedgerPreviewLink}
                                  onPress={() =>
                                    setFinanceSubTab("transactions")
                                  }
                                  activeOpacity={0.85}
                                  accessibilityRole="button"
                                  accessibilityLabel="View full transaction list"
                                >
                                  <Text
                                    style={
                                      neoStyles.financeLedgerPreviewLinkText
                                    }
                                  >
                                    View all
                                  </Text>
                                  <Feather
                                    name="chevron-right"
                                    size={14}
                                    color="#4D3636"
                                  />
                                </TouchableOpacity>
                              </View>
                              <Text
                                style={[
                                  neoStyles.financeLedgerPreviewSub,
                                  isDesktop && neoStyles.financeLedgerPreviewSubDesktop,
                                ]}
                              >
                                {ledgerEntries.length === 0 && ledgerEntriesLoading
                                  ? "Loading ledger…"
                                  : ledgerEntries.length === 0 && ledgerEntriesError
                                  ? "Couldn’t load ledger"
                                  : financeHistoryRows.length === 0
                                  ? "No cash movements on this trip yet"
                                  : `${financeHistoryRows.length} movement${
                                      financeHistoryRows.length === 1 ? "" : "s"
                                    } · newest first`}
                              </Text>
                              <ScrollView
                                style={neoStyles.financeLedgerPreviewScroll}
                                contentContainerStyle={
                                  neoStyles.financeLedgerPreviewScrollContent
                                }
                                nestedScrollEnabled
                                showsVerticalScrollIndicator={false}
                              >
                                {ledgerEntries.length === 0 && ledgerEntriesLoading ? (
                                  <Text
                                    style={neoStyles.financeLedgerPreviewEmpty}
                                  >
                                    Loading ledger…
                                  </Text>
                                ) : ledgerEntries.length === 0 && ledgerEntriesError ? (
                                  <Text
                                    style={neoStyles.financeLedgerPreviewEmpty}
                                  >
                                    Couldn’t load ledger
                                  </Text>
                                ) : financeHistoryRows.length === 0 ? (
                                  <Text
                                    style={neoStyles.financeLedgerPreviewEmpty}
                                  >
                                    Trip ledger entries appear here when you
                                    record receipts or payouts.
                                  </Text>
                                ) : (
                                  financeHistoryRows.slice(0, 8).map((row) => (
                                    <TouchableOpacity
                                      key={row.key}
                                      style={[
                                        neoStyles.financePreviewTxnRow,
                                        isDesktop && neoStyles.financePreviewTxnRowDesktop,
                                      ]}
                                      activeOpacity={0.85}
                                      onPress={() => setPreviewLedgerTx(row.tx)}
                                      accessibilityRole="button"
                                      accessibilityLabel="Preview transaction"
                                    >
                                      <View
                                        style={[
                                          neoStyles.financePreviewTxnIcon,
                                          isDesktop && neoStyles.financePreviewTxnIconDesktop,
                                          row.isIn
                                            ? neoStyles.financePreviewTxnIconIn
                                            : neoStyles.financePreviewTxnIconOut,
                                        ]}
                                      >
                                        <Feather
                                          name={
                                            row.isIn
                                              ? "arrow-down-left"
                                              : "arrow-up-right"
                                          }
                                          size={isDesktop ? 16 : 14}
                                          color={
                                            row.isIn ? "#10b981" : "#f43f5e"
                                          }
                                        />
                                      </View>
                                      <View
                                        style={neoStyles.financePreviewTxnMid}
                                      >
                                        <Text
                                          style={[
                                            neoStyles.financePreviewTxnTitle,
                                            isDesktop &&
                                              neoStyles.financePreviewTxnTitleDesktop,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {ledgerHistoryTitle(row.tx, row.isIn)}
                                        </Text>
                                        <Text
                                          style={[
                                            neoStyles.financePreviewTxnMeta,
                                            isDesktop &&
                                              neoStyles.financePreviewTxnMetaDesktop,
                                          ]}
                                          numberOfLines={1}
                                        >
                                          {formatLedgerDate(
                                            row.tx.transaction_date,
                                          )}{" "}
                                          · {row.tx.payment_mode || "Wallet"}
                                        </Text>
                                      </View>
                                      <Text
                                        style={[
                                          neoStyles.financePreviewTxnAmt,
                                          isDesktop &&
                                            neoStyles.financePreviewTxnAmtDesktop,
                                          row.isIn
                                            ? neoStyles.financePreviewTxnAmtIn
                                            : neoStyles.financePreviewTxnAmtOut,
                                        ]}
                                      >
                                        {formatINR(row.amount)}
                                      </Text>
                                    </TouchableOpacity>
                                  ))
                                )}
                              </ScrollView>
                            </View>
                            )}
                          </View>
                        </View>

                        {false && showFinanceProvisionPanel ? (
                          <View style={neoStyles.provisionPanel}>
                            <View style={neoStyles.provisionHeader}>
                              <View>
                                <Text style={neoStyles.provisionTitle}>
                                  Provision Adjustments
                                </Text>
                                <Text style={neoStyles.provisionSub}>
                                  {showFinanceProvisionPanel === "client"
                                    ? "Client sale adjustment"
                                    : "Supplier cost adjustment"}
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() =>
                                  setShowFinanceProvisionPanel(null)
                                }
                                style={neoStyles.provisionClose}
                                activeOpacity={0.85}
                              >
                                <Feather name="x" size={18} color="#fff" />
                              </TouchableOpacity>
                            </View>
                            <View style={neoStyles.provisionChips}>
                              {FINANCE_PROTOCOL_CHIPS.map((chip) => (
                                <TouchableOpacity
                                  key={chip}
                                  style={neoStyles.provisionChip}
                                  onPress={() =>
                                    openInlineAdjustmentForm(
                                      showFinanceProvisionPanel === "supplier"
                                        ? protocolSupplierChipAdjustment(chip)
                                        : {
                                            type: "revenue",
                                            impact: "plus",
                                            reasonSeed: chip,
                                          },
                                    )
                                  }
                                  activeOpacity={0.86}
                                >
                                  <Text style={neoStyles.provisionChipText}>
                                    {chip}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            {showInlineAdjustmentForm ? (
                              <View style={neoStyles.provisionForm}>
                                <View style={neoStyles.provisionFormHead}>
                                  <View>
                                    <Text style={neoStyles.provisionFormTitle}>
                                      Add Adjustment
                                    </Text>
                                    <Text style={neoStyles.provisionFormMeta}>
                                      {`${inlineAdjType === "revenue" ? "Sale / revenue" : "Supplier cost"} · ${
                                        inlineAdjImpact === "plus"
                                          ? "Debit add-on"
                                          : "Credit deduction"
                                      }`}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    style={neoStyles.provisionFormClose}
                                    onPress={() =>
                                      setShowInlineAdjustmentForm(false)
                                    }
                                    activeOpacity={0.85}
                                  >
                                    <Feather
                                      name="x"
                                      size={14}
                                      color="#475569"
                                    />
                                  </TouchableOpacity>
                                </View>

                                <Text style={neoStyles.provisionInputLabel}>
                                  Amount
                                </Text>
                                <View style={neoStyles.provisionAmountRow}>
                                  <Text style={neoStyles.provisionCurrency}>
                                    ₹
                                  </Text>
                                  <TextInput
                                    value={inlineAdjAmount}
                                    onChangeText={setInlineAdjAmount}
                                    style={neoStyles.provisionAmountInput}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    placeholderTextColor="#94a3b8"
                                    maxLength={14}
                                  />
                                </View>

                                <Text style={neoStyles.provisionInputLabel}>
                                  Reason
                                </Text>
                                <View style={neoStyles.provisionReasonWrap}>
                                  {inlineReasonOptions.map((reason) => (
                                    <TouchableOpacity
                                      key={reason}
                                      style={[
                                        neoStyles.provisionReasonChip,
                                        inlineAdjReason === reason &&
                                          neoStyles.provisionReasonChipActive,
                                      ]}
                                      onPress={() => setInlineAdjReason(reason)}
                                      activeOpacity={0.82}
                                    >
                                      <Text
                                        style={[
                                          neoStyles.provisionReasonText,
                                          inlineAdjReason === reason &&
                                            neoStyles.provisionReasonTextActive,
                                        ]}
                                      >
                                        {reason}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>

                                {inlineAdjReason === "Other" ? (
                                  <TextInput
                                    value={inlineAdjOtherReason}
                                    onChangeText={setInlineAdjOtherReason}
                                    style={neoStyles.provisionOtherInput}
                                    placeholder="Describe reason..."
                                    placeholderTextColor="#94a3b8"
                                    maxLength={80}
                                  />
                                ) : null}

                                <TouchableOpacity
                                  style={[
                                    neoStyles.provisionSaveBtn,
                                    !canSaveInlineAdjustment &&
                                      neoStyles.provisionSaveBtnDisabled,
                                  ]}
                                  onPress={() => void saveInlineAdjustment()}
                                  disabled={!canSaveInlineAdjustment}
                                  activeOpacity={0.86}
                                >
                                  <Text style={neoStyles.provisionSaveText}>
                                    Save Adjustment
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <View style={neoStyles.txnList}>
                        {ledgerEntries.length === 0 && ledgerEntriesLoading ? (
                          <Text style={neoStyles.emptyText}>
                            Loading ledger…
                          </Text>
                        ) : ledgerEntries.length === 0 && ledgerEntriesError ? (
                          <Text style={neoStyles.emptyText}>
                            Couldn’t load ledger
                          </Text>
                        ) : filteredFinanceRows.length === 0 ? (
                          <Text style={neoStyles.emptyText}>
                            No transaction rows found
                          </Text>
                        ) : (
                          filteredFinanceRows.map((row) => (
                            <TouchableOpacity
                              key={row.key}
                              style={neoStyles.txnRow}
                              activeOpacity={0.85}
                              onPress={() => setPreviewLedgerTx(row.tx)}
                              accessibilityRole="button"
                              accessibilityLabel="Preview transaction"
                            >
                              <View
                                style={[
                                  neoStyles.txnIcon,
                                  row.isIn
                                    ? neoStyles.txnIconIn
                                    : neoStyles.txnIconOut,
                                ]}
                              >
                                <Feather
                                  name={
                                    row.isIn
                                      ? "arrow-down-left"
                                      : "arrow-up-right"
                                  }
                                  size={20}
                                  color={row.isIn ? Theme.primary : "#f43f5e"}
                                />
                              </View>
                              <View style={neoStyles.txnInfo}>
                                <Text style={neoStyles.txnTitle}>
                                  {ledgerHistoryTitle(row.tx, row.isIn)}
                                </Text>
                                <Text style={neoStyles.txnMeta}>
                                  {formatLedgerDate(row.tx.transaction_date)} ·{" "}
                                  {row.tx.payment_mode || "Wallet"}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  neoStyles.txnAmount,
                                  row.isIn
                                    ? neoStyles.txnAmountIn
                                    : neoStyles.txnAmountOut,
                                ]}
                              >
                                {formatINR(row.amount)}
                              </Text>
                            </TouchableOpacity>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                ) : activeTab === "expenses" ? (
                  <View
                    style={[
                      neoStyles.financeStack,
                      neoStyles.expenseHubStack,
                      isDesktop && neoStyles.expenseHubStackDesktop,
                    ]}
                  >
                    {odometerPreviewEl}
                    <Suspense fallback={<ActivityIndicator style={{ margin: 24 }} color="#818cf8" />}>
                    <TripExpensesScreen
                      trip={trip}
                      embedded
                      density={expenseHubDensity}
                      onAddFuel={() => router.push(ROUTES.tripFuelEntry(trip.id) as never)}
                      onAddToll={() => router.push(ROUTES.tripTollEntry(trip.id) as never)}
                      onAddOtherExpense={() => router.push(ROUTES.tripOtherExpenseEntry(trip.id) as never)}
                      onEditExpense={(event) => {
                        const href = tripExpenseEntryEditRoute(trip.id, event.id);
                        if (href) router.push(href as never);
                      }}
                      driverCashPayouts={driverCashPayoutsForExpenses}
                      onRecordDriverPayment={
                        trip.driver_id
                          ? () =>
                              pushTripLedgerQuickEntry(
                                {
                                  trip,
                                  router,
                                  displayClientName: detail.displayClientName ?? null,
                                  clientIdFromContext: clientIdFromContext ?? null,
                                  clientNameFromContext: clientNameFromContext ?? null,
                                  partnerName: detail.partnerName ?? null,
                                  driverDisplayName: detail.driverName ?? null,
                                  ledgerSyncExtraParams: {
                                    dueAmountOut:
                                      driverReimbursementDueInr > 0
                                        ? String(
                                            Math.round(driverReimbursementDueInr),
                                          )
                                        : undefined,
                                  },
                                },
                                "driver",
                              )
                          : undefined
                      }
                    />
                    </Suspense>
                  </View>
                ) : (
                  <View>
                    {canUploadTripDocs ? (
                      <Text style={neoStyles.vaultLimitsHint}>
                        {VAULT_DOC_LIMIT_HINT}
                      </Text>
                    ) : null}
                    <View style={neoStyles.vaultGrid}>
                    {vaultCardDocs.map((doc) => {
                      const isUploadingThis = uploadingDocId === doc.id;
                      const isPending = doc.status === "Pending";
                      const isVehicleDoc = doc.id === "vehicle-documents";
                      const canUploadThis = canUploadThisVaultDoc(doc);
                      const canAddMore =
                        canUploadThis &&
                        canAddMoreTripDocs(doc) &&
                        (doc.id !== "vehicle-documents" || !!trip.vehicle_id);
                      const fileCount = doc.files?.length ?? 0;
                      const vehicleTypeSummary = isVehicleDoc
                        ? vehicleComplianceOnFileSummary(detail.vehicleDocs)
                        : "";
                      const extraCount = isVehicleDoc
                        ? (detail.vehicleDocs?.extras ?? []).filter((extra) =>
                            extra.url?.trim(),
                          ).length
                        : 0;
                      const isLrDoc = isLrVaultDoc(doc);
                      const lrNumber = isLrDoc
                        ? formatLrVaultNumberLabel(doc.documentNumber)
                        : "";
                      const lrDate = isLrDoc
                        ? formatLrVaultDateLabel(doc.documentDate)
                        : null;
                      const statusLabel = isVehicleDoc
                        ? [
                            vehicleTypeSummary,
                            extraCount > 0
                              ? `${extraCount} extra`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || VEHICLE_COMPLIANCE_TYPE_HINT
                        : isLrDoc && !isPending
                          ? lrNumber || "Uploaded"
                          : doc.documentNumber?.trim()
                              ? doc.documentNumber.trim()
                              : !isPending && fileCount > 1
                                ? `${fileCount} files`
                                : doc.status;
                      const showUploadPrimary =
                        isPending && canUploadThis && !isVehicleDoc;
                      const previewDisabled =
                        isVehicleDoc && !vaultDocHasPreviewableFile(doc);
                      const uploadedPreviewPath = vaultPreviewStoragePath(doc);
                      const showUploadedThumb =
                        !isPending &&
                        !!uploadedPreviewPath &&
                        !isPdfTripDoc(doc) &&
                        doc.docSource !== "vehicle";
                      const primaryDisabled = previewDisabled;
                      const btnLabel = isVehicleDoc
                        ? "Preview"
                        : showUploadPrimary
                          ? "Upload"
                          : isPending
                            ? "Pending"
                            : "Preview";
                      const btnIcon = isVehicleDoc || !isPending
                        ? "eye"
                        : showUploadPrimary
                          ? "upload"
                          : "clock";
                      return (
                        <View key={doc.id} style={neoStyles.vaultCard}>
                          {isLrDoc && !isPending && (lrNumber || lrDate) ? (
                            <View style={neoStyles.vaultLrCorner}>
                              {lrNumber ? (
                                <Text
                                  style={neoStyles.vaultLrNumber}
                                  numberOfLines={1}
                                >
                                  {lrNumber}
                                </Text>
                              ) : null}
                              {lrDate ? (
                                <Text
                                  style={neoStyles.vaultLrDate}
                                  numberOfLines={1}
                                >
                                  {lrDate}
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                          {showUploadedThumb && uploadedPreviewPath ? (
                            <View style={neoStyles.vaultThumb}>
                              <ChatDocumentThreadPreview
                                storagePath={uploadedPreviewPath}
                                maxWidth={168}
                                maxHeight={96}
                              />
                            </View>
                          ) : (
                            <Feather
                              name={
                                isPending && !isVehicleDoc
                                  ? "upload-cloud"
                                  : "file-text"
                              }
                              size={34}
                              color={
                                isPending && !isVehicleDoc ? "#cbd5e1" : "#94a3b8"
                              }
                            />
                          )}
                          <Text style={neoStyles.vaultTitle} numberOfLines={2}>
                            {doc.label}
                          </Text>
                          <Text style={neoStyles.vaultSub} numberOfLines={1}>
                            {isLrDoc && !isPending && lrNumber
                              ? "Uploaded"
                              : statusLabel}
                          </Text>
                          <View style={neoStyles.vaultBtnRow}>
                            <TouchableOpacity
                              onPress={() => handleVaultCardPress(doc)}
                              style={[
                                neoStyles.vaultBtn,
                                showUploadPrimary && neoStyles.vaultBtnUpload,
                                canAddMore && neoStyles.vaultBtnFlex,
                                primaryDisabled && neoStyles.vaultBtnDisabled,
                              ]}
                              activeOpacity={0.85}
                              disabled={isUploadingThis || primaryDisabled}
                              accessibilityState={{ disabled: primaryDisabled }}
                              accessibilityLabel={
                                previewDisabled
                                  ? `${doc.label} preview unavailable — no document on file`
                                  : `${btnLabel} ${doc.label}`
                              }
                            >
                              {isUploadingThis ? (
                                <LoadingIndicator size="small" color="#fff" />
                              ) : (
                                <>
                                  <Feather
                                    name={btnIcon}
                                    size={12}
                                    color={
                                      primaryDisabled
                                        ? Theme.textMuted
                                        : showUploadPrimary
                                          ? Theme.buttonPrimaryText
                                          : "#fff"
                                    }
                                  />
                                  <Text
                                    style={[
                                      neoStyles.vaultBtnText,
                                      showUploadPrimary &&
                                        neoStyles.vaultBtnTextUpload,
                                      primaryDisabled &&
                                        neoStyles.vaultBtnTextDisabled,
                                    ]}
                                  >
                                    {btnLabel}
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>
                            {canAddMore ? (
                              <TouchableOpacity
                                onPress={() => startAddMoreForDoc(doc)}
                                style={[
                                  neoStyles.vaultBtn,
                                  neoStyles.vaultBtnUpload,
                                  neoStyles.vaultBtnFlex,
                                ]}
                                activeOpacity={0.85}
                                disabled={isUploadingThis}
                                accessibilityLabel={`Add another ${doc.label}`}
                              >
                                <Feather
                                  name="plus"
                                  size={12}
                                  color={Theme.buttonPrimaryText}
                                />
                                <Text
                                  style={[
                                    neoStyles.vaultBtnText,
                                    neoStyles.vaultBtnTextUpload,
                                  ]}
                                >
                                  Add
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                    <View style={neoStyles.vaultEwayWrap}>
                      <EwayBillLrStrip
                        rows={ewayStripRows}
                        onView={openEwayBillPreview}
                        canEdit={canUploadTripDocs}
                        onSave={saveEwayBillFields}
                      />
                    </View>
                  </View>
                  </View>
                )}
              </View>

              <View style={neoStyles.sideCol}>
                <View style={neoStyles.sideCard}>
                  <View style={neoStyles.sideSection}>
                    <View style={neoStyles.sideHeading}>
                      <Feather name="activity" size={16} color="#cbd5e1" />
                      <Text style={neoStyles.sideHeadingText}>
                        Manifest Assets
                      </Text>
                    </View>
                    <ManifestRefAssetCard
                      desktop
                      roleLabel="Driver"
                      primaryText={allocatedDriverName}
                      variant="driver"
                      phone={detail.driverPhone}
                      ratingAvg={manifestDriverInsights.ratingAvg}
                      docsIssue={manifestDriverInsights.docsIssue}
                      insightsLoading={manifestRefAssetInsights.isLoading}
                      driverName={detail.driverName}
                      driverAvatarUrl={detail.driverAvatarUri}
                      driverId={trip.driver_id}
                showChange={canChangeManifestAssets}
                      onChange={() => openAssignmentFlow("driver")}
                      style={neoStyles.assetCardWrap}
                    />
                    <ManifestRefAssetCard
                      desktop
                      roleLabel="Vehicle"
                      primaryText={allocatedVehicleLabel}
                      variant="vehicle"
                      vehicleType={vehicleTypeLabel}
                      docsIssue={manifestVehicleInsights.docsIssue}
                      insightsLoading={manifestRefAssetInsights.isLoading}
                      showChange={canChangeManifestAssets}
                      onChange={() => openAssignmentFlow("vehicle")}
                      style={neoStyles.assetCardWrap}
                    />
                  </View>
                </View>

                {canTripRatings ? (
                <View style={[neoStyles.sideCard, neoStyles.feedbackSideCard]}>
                  <TripRatingsBlock
                    trip={trip}
                    organizationId={currentOrganization?.id ?? null}
                    partnerName={detail.partnerName}
                    driverName={detail.driverName}
                    driverAvatarUri={detail.driverAvatarUri}
                    clientName={
                      detail.displayClientName ?? trip.client_name ?? null
                    }
                    clientPartyAvatarFields={detail.clientPartyAvatarFields}
                    supplierPartyAvatarFields={detail.supplierPartyAvatarFields}
                    paymentCaptured={detail.tripLedgerEntries.some(
                      (row) =>
                        row.contact_type === "client" &&
                        Number(row.amount_in ?? 0) > 0,
                    )}
                    layoutVariant="registry"
                    embeddedSidebar
                    skipHistoricalPartyRatings={tripCompleted}
                  />
                </View>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* ════════════════════ TRACKING TAB ════════════════════ */}
        {false && isDesktop && desktopTab === "tracking" && (
          <>
            {/* ── Hero Card ── */}
            <View style={dStyles.heroCard}>
              <View style={dStyles.heroLeft}>
                <View style={dStyles.heroTitleRow}>
                  <Text style={dStyles.heroTripId}>
                    {getTripDisplayNumber(trip, currentOrganization?.id)}
                  </Text>
                  <View
                    style={[dStyles.statusBadge, { borderColor: statusColor }]}
                  >
                    <View
                      style={[
                        dStyles.statusDot,
                        { backgroundColor: statusColor },
                      ]}
                    />
                    <Text style={[dStyles.statusText, { color: statusColor }]}>
                      {statusLabel.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={dStyles.routeRow}>
                  <View style={dStyles.routeStop}>
                    <Text style={dStyles.routeLabel}>ORIGIN</Text>
                    <Text style={dStyles.routeCity} numberOfLines={1}>
                      {trip.pickup_area || "—"}
                    </Text>
                    <Text style={dStyles.routeDate}>{pickupStr}</Text>
                  </View>
                  <View style={dStyles.routeDivider}>
                    <View style={dStyles.routeLine} />
                    <FontAwesome
                      name="truck"
                      size={16}
                      color="rgba(100,116,139,0.65)"
                    />
                    <View style={dStyles.routeLine} />
                  </View>
                  <View style={dStyles.routeStop}>
                    <Text style={dStyles.routeLabel}>DESTINATION</Text>
                    <Text style={dStyles.routeCity} numberOfLines={1}>
                      {trip.drop_location || "—"}
                    </Text>
                    {trip.estimated_duration ? (
                      <Text style={dStyles.routeDate}>
                        EST: {trip.estimated_duration}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
              <View style={dStyles.heroStats}>
                <View style={dStyles.statBox}>
                  <Text style={dStyles.statLabel}>DISTANCE</Text>
                  <Text style={dStyles.statValue}>
                    {resolvedDistanceLabel ?? "—"}
                  </Text>
                </View>
                <View style={dStyles.statDivider} />
                <View style={dStyles.statBox}>
                  <Text style={dStyles.statLabel}>STATUS</Text>
                  <Text style={[dStyles.statValue, { fontSize: 14 }]}>
                    {statusLabel}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[dStyles.card, dStyles.snapshotCard]}>
              <View style={dStyles.cardHeader}>
                <FontAwesome
                  name="database"
                  size={14}
                  color="#60a5fa"
                  style={{ marginRight: 8 }}
                />
                <Text style={dStyles.cardTitle}>Trip Data Snapshot</Text>
              </View>
              <View style={dStyles.snapshotGrid}>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Client Name</Text>
                  <Text style={dStyles.snapshotValue} numberOfLines={2}>
                    {clientNameCard || "—"}
                  </Text>
                </View>
                {isAggregate ? (
                  <View style={dStyles.snapshotCell}>
                    <Text style={dStyles.snapshotLabel}>Supplier Name</Text>
                    <Text style={dStyles.snapshotValue} numberOfLines={2}>
                      {supplierName || "—"}
                    </Text>
                  </View>
                ) : null}
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Payment Status</Text>
                  <Text style={dStyles.snapshotValue}>
                    {paymentStatusLabel}
                  </Text>
                </View>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Amount Paid</Text>
                  <Text style={dStyles.snapshotValue}>{amountPaidLabel}</Text>
                </View>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Advance Paid</Text>
                  <Text style={dStyles.snapshotValue}>{advancePaidLabel}</Text>
                </View>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Payout Mode</Text>
                  <Text style={dStyles.snapshotValue}>{payoutModeLabel}</Text>
                </View>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Load Tons</Text>
                  <Text style={dStyles.snapshotValue}>{loadTonsLabel}</Text>
                </View>
                <View style={dStyles.snapshotCell}>
                  <Text style={dStyles.snapshotLabel}>Estimated Duration</Text>
                  <Text style={dStyles.snapshotValue}>
                    {trip.estimated_duration
                      ? String(trip.estimated_duration)
                      : "—"}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Map ── */}
            <View style={dStyles.card}>
                <View style={dStyles.cardHeader}>
                  <FontAwesome
                    name="map"
                    size={14}
                    color="#60a5fa"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={dStyles.cardTitle}>Live Tracking</Text>
                  {detail.trackingMapOriginCoordinate &&
                    detail.trackingMapDestinationCoordinate && (
                      <TouchableOpacity
                        style={dStyles.openMapsBtn}
                        onPress={openTripDirectionsInMaps}
                        activeOpacity={0.8}
                      >
                        <Feather name="navigation" size={12} color="#60a5fa" />
                        <Text style={dStyles.openMapsBtnText}>Open Maps</Text>
                      </TouchableOpacity>
                    )}
                </View>
                <View style={dStyles.telemetryWrap}>
                  <WaitingForDriverLocationOverlay
                    visible={detail.waitingForNewDriverLocation}
                  />
                  <DeferredTripMap
                    source={(trip.pickup_area ?? "").trim() || undefined}
                    destination={(trip.drop_location ?? "").trim() || undefined}
                    sourceCoords={
                      detail.trackingMapOriginCoordinate ?? undefined
                    }
                    destCoords={
                      detail.trackingMapDestinationCoordinate ?? undefined
                    }
                    truckLocation={mapTruckLocation}
                    dbLocationTrail={mapDbLocationTrail}
                    truckStatus={mapTruckStatus}
                    height={mapHeight}
                    onDistanceCalculated={setMapRouteDistanceKm}
                    tripId={trip.id}
                    trackingEnabled={trackingState?.broadcastActive ?? false}
                    driverAvatarUri={detail.driverAvatarUri}
                    driverAvatarSeed={trip.driver_id}
                    driverOnline={trackingState?.broadcastActive ?? false}
                  />
                  {showDriverTrackingOfflineOverlay ? (
                    <DriverTrackingOfflineOverlay
                      variant="map"
                      showReassign={detail.canAssign}
                      onSendLoginReminder={detail.requestDriverPing}
                      onReassignDriver={() => setShowReassignSheet(true)}
                    />
                  ) : null}
                </View>
              </View>

            {/* ── Driver / Vehicle + Documents ── */}
            {isAggregate && reassignMigrationBlocked ? (
              <View
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: Theme.warningMuted,
                  borderWidth: 1,
                  borderColor: Theme.warning,
                }}
              >
                <Text style={{ fontSize: 13, color: Theme.textPrimary, lineHeight: 18 }}>
                  Reassignment is unavailable until database migration 20260805140000 is
                  applied (preserves trip stage on reassign). Contact your admin to run db
                  push.
                </Text>
              </View>
            ) : null}

            <View style={{ marginBottom: 16 }}>
              <TripPodStatusSection
                tripId={trip.id}
                organizationId={trip.organization_id}
                podReceivedAt={trip.pod_received_at}
                tripCompleted={tripIsDeliveredStatus(trip.status)}
                softCopyReceived={detail.tripDocuments.some(
                  (d) => d.document_type === "pod",
                )}
                canMutate={canUploadTripDocs}
                onSoftCopyUpload={() => chooseAddDocumentType("pod")}
                onUpdated={() => {
                  void detail.load();
                  void detail.loadTripDocuments();
                }}
              />
            </View>

            {canViewCompliance ? (
              <View style={{ marginBottom: 16 }}>
                <ComplianceSection
                  trip={trip}
                  organizationId={trip.organization_id}
                  actorId={detail.currentUserId ?? null}
                  tripDocuments={detail.tripDocuments}
                  tripDelivered={tripIsDeliveredStatus(trip.status)}
                  complianceVerifiedAt={trip.compliance_verified_at ?? null}
                  hardCopyPodReceived={tripPodIsReceived({ pod_received_at: trip.pod_received_at })}
                  canVerifyDocuments={canSurface("trip_compliance.documents.verify")}
                  canMarkVerified={canSurface("trip_compliance.trip.mark_verified")}
                  canManagePod={canSurface("trip_compliance.pod.manage")}
                  canManageFinance={canSurface("trip_compliance.finance.manage")}
                  onUpdated={() => {
                    void detail.load();
                    void detail.loadTripDocuments();
                  }}
                />
              </View>
            ) : null}

            <View style={dStyles.row}>
              <View style={dStyles.bottomLeft}>
                <View style={dStyles.card}>
                  <View style={dStyles.cardHeaderRowInline}>
                    <Text style={dStyles.cardMicroLabel}>PRIMARY DRIVER</Text>
                    {canOpenReassign ? (
                      <TouchableOpacity
                        style={dStyles.reassignInlineBtn}
                        activeOpacity={0.85}
                        onPress={() => setShowReassignSheet(true)}
                      >
                        <Text style={dStyles.reassignInlineBtnText}>
                          Reassign
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={dStyles.driverRow}>
                    {detail.driverAvatarUri ? (
                      <Image
                        source={{ uri: detail.driverAvatarUri as string }}
                        style={dStyles.driverAvatar}
                      />
                    ) : (
                      <View style={dStyles.driverAvatarFallback}>
                        <FontAwesome
                          name="user"
                          size={20}
                          color={Theme.textSecondary}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={dStyles.driverName}>
                        {detail.driverName || "—"}
                      </Text>
                      {detail.driverRatingAvg != null && (
                        <Text style={dStyles.driverRating}>
                          ★ {Number(detail.driverRatingAvg).toFixed(1)}
                        </Text>
                      )}
                    </View>
                    {trip.started_at ? (
                      <View style={dStyles.statBoxSm}>
                        <Text style={dStyles.statLabelSm}>STARTED</Text>
                        <Text style={dStyles.statValueSm}>
                          {formatTrackingDateTime(String(trip.started_at))}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={dStyles.card}>
                  <View style={dStyles.cardHeaderRowInline}>
                    <Text style={dStyles.cardMicroLabel}>ASSIGNED VEHICLE</Text>
                    {canOpenReassign ? (
                      <TouchableOpacity
                        style={dStyles.reassignInlineBtn}
                        activeOpacity={0.85}
                        onPress={() => setShowReassignSheet(true)}
                      >
                        <Text style={dStyles.reassignInlineBtnText}>
                          Reassign
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={dStyles.vehicleRow}>
                    <View style={dStyles.vehicleIconWrap}>
                      <FontAwesome
                        name="truck"
                        size={20}
                        color={Theme.textSecondary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={dStyles.vehicleName}>
                        {detail.vehicleLabel ||
                          detail.displayVehicleFromInput ||
                          "—"}
                      </Text>
                      {trip.load_type ? (
                        <Text style={dStyles.vehicleSub}>{trip.load_type}</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>

              <View style={[dStyles.card, dStyles.docsCol]}>
                <View style={dStyles.cardHeader}>
                  <FontAwesome
                    name="file-text-o"
                    size={14}
                    color="#60a5fa"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={dStyles.cardTitle}>Required Documents</Text>
                  <View style={dStyles.docsBadge}>
                    <Text style={dStyles.docsBadgeText}>
                      {
                        vaultCardDocs.filter(
                          (d) => d.status === "Uploaded",
                        ).length
                      }
                      /{vaultCardDocs.length} VERIFIED
                    </Text>
                  </View>
                </View>
                {vaultCardDocs.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={dStyles.docRow}
                    onPress={() => handleDocOpen(doc)}
                    activeOpacity={0.75}
                  >
                    <View style={dStyles.docIconWrap}>
                      <FontAwesome
                        name="file-o"
                        size={14}
                        color={Theme.textMuted}
                      />
                    </View>
                    <Text style={dStyles.docLabel} numberOfLines={1}>
                      {doc.id === "vehicle-documents" && doc.type
                        ? `Vehicle · ${doc.type}`
                        : doc.label}
                    </Text>
                    <View
                      style={[
                        dStyles.docStatusPill,
                        doc.status === "Uploaded"
                          ? dStyles.docStatusVerified
                          : dStyles.docStatusPending,
                      ]}
                    >
                      <Text
                        style={[
                          dStyles.docStatusText,
                          doc.status === "Uploaded"
                            ? dStyles.docStatusTextVerified
                            : dStyles.docStatusTextPending,
                        ]}
                      >
                        {doc.status === "Uploaded" ? "VERIFIED" : "PENDING"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Placeholder for dead code path below — preserve existing view refs */}
            {false && (
              <View style={styles.workspaceRow}>
                <View style={styles.workspaceLeftCol}>
                  <View style={styles.voyageCard}>
                    <View style={styles.sectionKickerRow}>
                      <View style={styles.sectionKickerBar} />
                      <Text style={styles.sectionKicker}>Voyage Manifest</Text>
                    </View>
                    <View style={styles.routeLineWrap}>
                      <View style={styles.routeDotsCol}>
                        <View style={[styles.routeDot, styles.routeDotStart]} />
                        <View style={styles.routeDashedLine} />
                        <View style={[styles.routeDot, styles.routeDotEnd]} />
                      </View>
                      <View style={styles.routeTextCol}>
                        <Text style={styles.routePlace}>
                          {trip.pickup_area || "Pickup"}
                        </Text>
                        <Text style={styles.routePlace}>
                          {trip.drop_location || "Destination"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.voyageMetaGrid}>
                      <View style={styles.voyageMetaCell}>
                        <Text style={styles.voyageMetaLabel}>Client</Text>
                        <Text style={styles.voyageMetaValue}>
                          {detail.displayClientName || "—"}
                        </Text>
                      </View>
                      <View style={styles.voyageMetaCell}>
                        <Text style={styles.voyageMetaLabel}>Material</Text>
                        <Text style={styles.voyageMetaValue}>
                          {trip.load_type || "General Load"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.operatorCard}>
                    <View style={styles.operatorBadge}>
                      <FontAwesome name="user" size={16} color="#64748b" />
                      <View>
                        <Text style={styles.operatorLabel}>Operator</Text>
                        <Text style={styles.operatorValue}>
                          {detail.driverName || "Unassigned"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.operatorSub}>
                      {detail.vehicleLabel ||
                        detail.displayVehicleFromInput ||
                        "Vehicle pending assignment"}
                    </Text>
                  </View>

                  {trip.organization_id ? (
                    <TripAssignmentBlock
                      trip={trip}
                      organizationId={currentOrganization?.id ?? ""}
                      canAssign={detail.canAssign}
                      onUpdated={detail.handleAssignmentUpdated}
                      partnerName={detail.partnerName}
                      driverName={detail.driverName}
                      assignedDriverPhone={detail.driverPhone}
                      vehicleLabel={
                        isAggregate
                          ? detail.displayVehicleFromInput.trim() ||
                            detail.vehicleLabel ||
                            null
                          : detail.vehicleLabel
                      }
                      driverAvatarUri={detail.driverAvatarUri}
                      showAssignByPhone={detail.showAssignByPhone}
                      assignmentSource={detail.assignmentSource}
                      currentUserId={detail.currentUserId}
                      previousDriverName={detail.previousDriverName}
                      latestReassignmentSummary={
                        detail.latestReassignmentSummary
                      }
                      driverAssignOrgId={
                        isAggregate ? (currentOrganization?.id ?? null) : null
                      }
                      onVehicleDisplayChange={(value) => {
                        const normalized = formatIndianVehicleNumber(
                          value ?? "",
                        );
                        detail.setDisplayVehicleFromInput(normalized);
                      }}
                      inlineSection={
                        (isAggregate || driverIsUnlinked) ? (
                          <AggregateTripOtpPanel
                            variant="inline"
                            tripNumber={getTripDisplayNumber(trip, currentOrganization?.id)}
                            aggregateOtpState={aggregateOtpState}
                            canGenerateAggregateOtp={canGenerateAggregateOtp}
                            otpLockedByTripProgress={otpLockedByTripProgress}
                            tripOtp={detail.tripOtp}
                            onResendOtp={handleResendOtp}
                            otpResending={otpResending}
                          />
                        ) : null
                      }
                    />
                  ) : null}

                  <View style={styles.lrGrow}>
                    <Suspense fallback={<ActivityIndicator style={{ margin: 12 }} color="#818cf8" />}>
                    <LRDocumentsSection
                      presentation="gallery"
                      docs={detail.computedTripDocs.map((d) => {
                        const isUploaded =
                          d.status !== "Pending" || !!d.storagePath;
                        const canUploadThis =
                          canMutateTripVaultDoc({
                            doc: d,
                            canUploadTripDocs,
                            tripCompleted,
                          }) &&
                          (d.id !== "vehicle-documents" || !!trip.vehicle_id) &&
                          (d.category === "lr" ||
                            d.category === "trip" ||
                            d.category === "driver" ||
                            d.category === "vehicle");
                        return {
                          id: d.id,
                          label: d.label,
                          type:
                            (d.files?.length ?? 0) > 1
                              ? `${d.files?.length} files`
                              : d.type,
                          subtitle: isLrVaultDoc(d)
                            ? formatLrVaultNumberLabel(d.documentNumber) ??
                              undefined
                            : undefined,
                          status:
                            d.status === "Verified" ? "Uploaded" : d.status,
                          onView: isUploaded
                            ? () => detail.setSelectedDoc(d)
                            : canUploadThis
                              ? () => startAddMoreForDoc(d)
                              : d.id === "vehicle-documents"
                                ? () => detail.setSelectedDoc(d)
                                : undefined,
                        };
                      })}
                      onUpdateLR={() => void handleLRUpload()}
                      onAddDocument={
                        canUploadTripDocs ? openAddDocumentChooser : undefined
                      }
                    />
                    </Suspense>
                  </View>
                </View>

                <View style={styles.workspaceRightCol}>
                  <TripStatusTimeline
                    variant="journey"
                    trip={trip}
                    stageTimestamps={stageTimestamps}
                    stageLocations={stageLocations}
                    lastUpdatedAt={trip.updated_at}
                    canAdvance={detail.canAssign}
                    distanceKm={timelineDistanceKm}
                    driverSummaryText={driverSummaryText}
                    onOpenMaps={
                      detail.trackingMapOriginCoordinate &&
                      detail.trackingMapDestinationCoordinate
                        ? openTripDirectionsInMaps
                        : undefined
                    }
                    mapPreview={
                      <View style={styles.telemetryWrap}>
                        <WaitingForDriverLocationOverlay
                          visible={detail.waitingForNewDriverLocation}
                        />
                        <DeferredTripMap
                          source={(trip.pickup_area ?? "").trim() || undefined}
                          destination={
                            (trip.drop_location ?? "").trim() || undefined
                          }
                          sourceCoords={
                            detail.trackingMapOriginCoordinate ?? undefined
                          }
                          destCoords={
                            detail.trackingMapDestinationCoordinate ?? undefined
                          }
                          truckLocation={mapTruckLocation}
                          dbLocationTrail={mapDbLocationTrail}
                          truckStatus={mapTruckStatus}
                          height={520}
                          onDistanceCalculated={setMapRouteDistanceKm}
                          tripId={trip.id}
                          trackingEnabled={trackingState?.broadcastActive ?? false}
                          driverAvatarUri={detail.driverAvatarUri}
                          driverAvatarSeed={trip.driver_id}
                          driverOnline={trackingState?.broadcastActive ?? false}
                        />
                        {showDriverTrackingOfflineOverlay ? (
                          <DriverTrackingOfflineOverlay
                            variant="map"
                            showReassign={detail.canAssign}
                            onSendLoginReminder={detail.requestDriverPing}
                            onReassignDriver={() => setShowReassignSheet(true)}
                          />
                        ) : null}
                        <View style={styles.telemetryOverlay}>
                          <FontAwesome
                            name="compass"
                            size={20}
                            color="#60a5fa"
                          />
                          <Text style={styles.telemetryTitle}>
                            Telemetry Link Secured
                          </Text>
                          <Text style={styles.telemetrySub}>
                            Protocol v4.2 synchronized live
                          </Text>
                        </View>
                      </View>
                    }
                  />
                </View>
              </View>
            )}

            {/* Location Log section */}
            {(detail.locationTrailWithNames ?? detail.tripLocationPoints).length > 0 && (
              <View style={styles.locationLogWrap}>
                <TouchableOpacity
                  style={styles.locationLogHeader}
                  onPress={() => setLocationLogExpanded((v) => !v)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={locationLogExpanded ? "Collapse location log" : "Expand location log"}
                >
                  <View style={styles.locationLogHeaderLeft}>
                    <Feather name="map-pin" size={13} color="#7c3aed" />
                    <Text style={styles.locationLogTitle}>Location log</Text>
                    <View style={styles.locationLogBadge}>
                      <Text style={styles.locationLogBadgeText}>
                        {(detail.locationTrailWithNames ?? detail.tripLocationPoints).length}
                      </Text>
                    </View>
                  </View>
                  <Feather
                    name={locationLogExpanded ? "chevron-up" : "chevron-down"}
                    size={15}
                    color="#94a3b8"
                  />
                </TouchableOpacity>
                {locationLogExpanded && (
                  <ScrollView
                    style={styles.locationLogScroll}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={false}
                  >
                    {(detail.locationTrailWithNames ?? detail.tripLocationPoints)
                      .slice()
                      .reverse()
                      .slice(0, 20)
                      .map((pt, idx, arr) => {
                        const isLast = idx === arr.length - 1;
                        const timeStr = pt.recorded_at
                          ? (() => {
                              try {
                                return new Date(pt.recorded_at).toLocaleString("en-IN", {
                                  timeZone: "Asia/Kolkata",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  day: "2-digit",
                                  month: "short",
                                  hour12: true,
                                });
                              } catch {
                                return "—";
                              }
                            })()
                          : "—";
                        const locationName =
                          "locationName" in pt
                            ? (pt as { locationName: string | null }).locationName
                            : null;
                        return (
                          <View key={`${pt.recorded_at ?? idx}-${idx}`} style={styles.locationLogRow}>
                            <View style={styles.locationLogTrack}>
                              <View style={styles.locationLogDot} />
                              {!isLast && <View style={styles.locationLogLine} />}
                            </View>
                            <View style={styles.locationLogContent}>
                              <Text style={styles.locationLogTime}>{timeStr}</Text>
                              <Text style={styles.locationLogName} numberOfLines={2}>
                                {locationName ?? "Resolving location…"}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Feedback / Ratings section */}
            {currentOrganization?.id && canTripRatings && (
              <View style={styles.feedbackWrap}>
                {detail.tripCompleted ? (
                  <TripRatingsBlock
                    trip={trip}
                    organizationId={currentOrganization?.id ?? null}
                    partnerName={detail.partnerName}
                    driverName={detail.driverName}
                    driverAvatarUri={detail.driverAvatarUri}
                    clientName={
                      detail.displayClientName ?? trip.client_name ?? null
                    }
                    clientPartyAvatarFields={detail.clientPartyAvatarFields}
                    supplierPartyAvatarFields={detail.supplierPartyAvatarFields}
                    paymentCaptured={detail.tripLedgerEntries.some(
                      (row) =>
                        row.contact_type === "client" &&
                        Number(row.amount_in ?? 0) > 0,
                    )}
                    layoutVariant="registry"
                    skipHistoricalPartyRatings
                  />
                ) : (
                  <FeedbackPlaceholder />
                )}
              </View>
            )}
          </>
        )}

        {/* TripDetailFinanceView removed — was dead code ({false && …}) */}

        <View style={{ height: !isDesktop ? 120 : 48 }} />
      </ScrollView>

      {/* ── Modals (lazy-loaded: imported only when first rendered) ──────────── */}
      <Suspense fallback={null}>
      <ProvisionAdjustmentModal
        visible={!!showFinanceProvisionPanel}
        side={showFinanceProvisionPanel}
        onClose={closeFinanceProvisionModal}
        onSave={detail.handleSaveAdjustment}
        editTarget={provisionEditTarget}
        onUpdate={detail.handleUpdateAdjustment}
        tripCode={getTripDisplayNumber(trip, currentOrganization?.id)}
        partyLabel={
          showFinanceProvisionPanel === "client"
            ? (detail.displayClientName ?? trip.client_name ?? "Client")
            : provisionCostPartyName
        }
        clientName={clientNameForParty}
        clientAvatarSeed={clientIdFromContext ?? trip.client_id ?? null}
        supplierName={provisionCostPartyName}
        supplierAvatarSeed={
          isAssetTripFinance ? (trip.driver_id ?? null) : (trip.supplier_id ?? null)
        }
        sales={sales}
        adjSales={adjSales}
        cost={cost}
        adjCost={adjCost}
        revenueSideDelta={revenueSideDelta}
        costSideDelta={costSideDelta}
        isAssetExecution={isAssetTripFinance}
        costLaneLabel={isAssetTripFinance ? "Revised trip cost" : undefined}
        costBreakdownLines={assetCostBreakdownLines}
        adjustments={detail.adjustments}
        lineMetaLabel={provisionLineMetaLabel}
        onRequestDeduction={handleRequestCostDeduction}
      />

      <ProvisionDeductionConfirmModal
        visible={pendingCostDeduction !== null}
        recommendation={pendingCostDeduction}
        isAssetExecution={isAssetTripFinance}
        costPartyName={provisionCostPartyName}
        adjCost={adjCost}
        submitting={costDeductionSubmitting}
        onCancel={() => {
          if (!costDeductionSubmitting) setPendingCostDeduction(null);
        }}
        onConfirm={() => void handleConfirmCostDeduction()}
      />

      <ProvisionNotePdfModal
        visible={provisionNotePdfContext !== null}
        context={provisionNotePdfContext}
        onClose={() => setProvisionNotePdfContext(null)}
        onEdit={
          provisionNotePdfContext &&
          !isAdjustmentVoided(provisionNotePdfContext.adjustment)
            ? (adj) => {
                setProvisionNotePdfContext(null);
                openProvisionEdit(adj);
              }
            : undefined
        }
      />

      {!useCompactAdjustmentWizard ? (
        <TripAdjustmentModal
          visible={detail.showAdjustmentModal}
          preset={detail.adjustmentModalPreset}
          onClose={detail.closeTripAdjustmentModal}
          onSave={detail.handleSaveAdjustment}
          tripCode={getTripDisplayNumber(trip, currentOrganization?.id)}
          entryContextLabel={
            trip
              ? `${getTripDisplayNumber(trip, currentOrganization?.id)} · ${
                  detail.adjustmentModalPreset?.type === "cost"
                    ? provisionCostPartyName
                    : (detail.displayClientName ?? trip.client_name ?? "Client")
                }`
              : null
          }
        />
      ) : null}
      </Suspense>

      <Modal
        visible={provisionConfirm !== null}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setProvisionConfirm(null);
          setProvisionVoidReason("");
        }}
      >
        <View style={neoStyles.provisionConfirmBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setProvisionConfirm(null);
              setProvisionVoidReason("");
            }}
          />
          <View style={neoStyles.provisionConfirmCard} pointerEvents="box-none">
            <Text style={neoStyles.provisionConfirmTitle}>
              {provisionConfirm?.mode === "delete"
                ? "Void adjustment?"
                : "Edit adjustment?"}
            </Text>
            {provisionConfirm ? (
              <>
                <View style={neoStyles.provisionConfirmBlock}>
                  <Text style={neoStyles.provisionConfirmLine}>
                    {provisionConfirm.adjustment.type === "revenue"
                      ? "Client sale"
                      : "Supplier cost"}{" "}
                    ·{" "}
                    {provisionConfirm.adjustment.impact === "plus"
                      ? "Debit note (DN)"
                      : "Credit note (CN)"}
                  </Text>
                  <Text style={neoStyles.provisionConfirmLine}>
                    Amount:{" "}
                    {provisionConfirm.adjustment.impact === "plus" ? "+" : "−"}
                    {formatINR(provisionConfirm.adjustment.amount)}
                  </Text>
                  <Text
                    style={neoStyles.provisionConfirmLine}
                    numberOfLines={3}
                  >
                    Reason:{" "}
                    {(provisionConfirm.adjustment.reason ?? "").trim() || "—"}
                  </Text>
                </View>
                {provisionConfirm.mode === "delete" ? (
                  <>
                    <Text style={neoStyles.provisionVoidReasonLabel}>
                      Reason for voiding
                    </Text>
                    <TextInput
                      value={provisionVoidReason}
                      onChangeText={setProvisionVoidReason}
                      placeholder="Required — why should this line be voided?"
                      placeholderTextColor="#94a3b8"
                      style={neoStyles.provisionVoidReasonInput}
                      multiline
                      maxLength={240}
                    />
                  </>
                ) : null}
                <Text style={neoStyles.provisionConfirmHint}>
                  {provisionConfirm.mode === "delete"
                    ? "The line stays in the list as struck-through with your note. Adjusted totals will exclude it."
                    : "Next you can change amount, credit/debit type, or reason in the form."}
                </Text>
              </>
            ) : null}
            <View style={neoStyles.provisionConfirmActions}>
              <TouchableOpacity
                style={neoStyles.provisionConfirmCancel}
                onPress={() => {
                  setProvisionConfirm(null);
                  setProvisionVoidReason("");
                }}
                activeOpacity={0.85}
              >
                <Text style={neoStyles.provisionConfirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  provisionConfirm?.mode === "delete"
                    ? neoStyles.provisionConfirmDanger
                    : neoStyles.provisionConfirmPrimary,
                  provisionConfirm?.mode === "delete" &&
                    !provisionVoidReason.trim() &&
                    neoStyles.provisionConfirmDangerDisabled,
                ]}
                disabled={
                  provisionConfirm?.mode === "delete" &&
                  !String(provisionVoidReason ?? "").trim()
                }
                onPress={() => {
                  if (!provisionConfirm) return;
                  if (provisionConfirm.mode === "delete") {
                    const r = String(provisionVoidReason ?? "").trim();
                    if (!r) return;
                    void detail.handleVoidAdjustment(
                      provisionConfirm.adjustment.id,
                      r,
                    );
                    setProvisionConfirm(null);
                    setProvisionVoidReason("");
                  } else {
                    const adj = provisionConfirm.adjustment;
                    setProvisionConfirm(null);
                    beginInlineEditFromAdjustment(adj);
                  }
                }}
                activeOpacity={0.88}
              >
                <Text style={neoStyles.provisionConfirmOkText}>
                  {provisionConfirm?.mode === "delete"
                    ? "Void line"
                    : "Continue"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ThemedAlertModal
        visible={detail.showDriverRejectedModal}
        title="Driver Rejected"
        message="The assigned driver has rejected this trip."
        onOk={() => detail.setShowDriverRejectedModal(false)}
        variant="warning"
      />

      {trip.organization_id ? (
        <ReassignSheet
          visible={showReassignSheet}
          onClose={() => setShowReassignSheet(false)}
          trip={trip}
          organizationId={currentOrganization?.id ?? trip.organization_id}
          isAggregate={isAggregate}
          canAssign={detail.canAssign}
          currentUserId={detail.currentUserId}
          driverAssignOrgId={isAggregate ? (currentOrganization?.id ?? null) : null}
          currentDriverName={detail.driverName}
          currentDriverPhone={detail.driverPhone}
          currentVehicleLabel={
            isAggregate
              ? detail.displayVehicleFromInput.trim() ||
                detail.vehicleLabel ||
                null
              : detail.vehicleLabel
          }
          onCompleted={detail.handleReassignCompleted}
          onReloadTrip={detail.load}
          onVehicleDisplayChange={(value) => {
            detail.setDisplayVehicleFromInput(formatIndianVehicleNumber(value ?? ""));
          }}
        />
      ) : null}

      <TripAuditLogPanel
        visible={showTripAuditLog}
        onClose={() => setShowTripAuditLog(false)}
        trip={trip}
        organizationId={currentOrganization?.id ?? trip.organization_id}
        currentUserId={detail.currentUserId}
        assignmentAuditRows={detail.assignmentAuditRows}
        assignmentDriverNames={detail.assignmentDriverNames}
        assignmentVehicleLabels={detail.assignmentVehicleLabels}
        timelineRows={detail.driverActivityTimelineRows ?? []}
        tripLedgerEntries={detail.tripLedgerEntries}
        driverDisplayName={detail.driverName}
      />

      {vaultChatPreviewNode}

      <Modal
        visible={!!detail.selectedDoc}
        animationType="fade"
        transparent
        onRequestClose={() => detail.setSelectedDoc(null)}
      >
        <View style={styles.docModalBackdrop}>
          <View
            style={[
              styles.docModalCard,
              { marginTop: insets.top + 12, marginBottom: insets.bottom + 12 },
            ]}
          >
            <View style={styles.docModalHeader}>
              <View style={styles.docModalTitleBlock}>
                <Text style={styles.docModalTitle} numberOfLines={2}>
                  {isGalleryPreview && galleryActiveDoc
                    ? galleryActiveDoc.label
                    : (detail.selectedDoc?.label ?? "Document")}
                </Text>
                <Text style={styles.docModalSubtitle} numberOfLines={1}>
                  {isGalleryPreview && previewGalleryDocs.length > 1
                    ? `${detail.vehiclePreviewIndex + 1} of ${previewGalleryDocs.length}`
                    : "Preview"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => detail.setSelectedDoc(null)}
                style={styles.docModalCloseIcon}
                activeOpacity={0.8}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Close preview"
              >
                <FontAwesome name="times" size={18} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <View style={styles.docModalBody}>
              {formatLrVaultNumberLabel(detail.selectedDoc?.documentNumber) ? (
                <Text style={styles.docPreviewLrNumber} numberOfLines={1}>
                  {formatLrVaultNumberLabel(detail.selectedDoc?.documentNumber)}
                </Text>
              ) : null}
              {detail.docPreviewLoading ? (
                <View style={styles.docModalCenter}>
                  <LoadingIndicator size="large" color={Theme.primary} />
                  <Text style={styles.docModalHint}>Loading preview…</Text>
                </View>
              ) : isGalleryPreview ? (
                previewGalleryDocs.length > 0 ? (
                  <View
                    style={styles.docGalleryWrap}
                    onLayout={(event) =>
                      setVehicleGalleryPageWidth(event.nativeEvent.layout.width)
                    }
                  >
                    <ScrollView
                      ref={vehicleGalleryScrollRef}
                      horizontal
                      pagingEnabled
                      showsHorizontalScrollIndicator={false}
                      scrollEventThrottle={16}
                      onScroll={(event) => {
                        const pageWidth =
                          event.nativeEvent.layoutMeasurement.width;
                        if (pageWidth <= 0) return;
                        const nextIndex = Math.round(
                          event.nativeEvent.contentOffset.x / pageWidth,
                        );
                        const clamped = Math.max(
                          0,
                          Math.min(
                            nextIndex,
                            previewGalleryDocs.length - 1,
                          ),
                        );
                        if (clamped !== detail.vehiclePreviewIndex) {
                          detail.setVehiclePreviewIndex(clamped);
                        }
                      }}
                      onMomentumScrollEnd={(event) => {
                        const pageWidth =
                          event.nativeEvent.layoutMeasurement.width;
                        if (pageWidth <= 0) return;
                        const nextIndex = Math.round(
                          event.nativeEvent.contentOffset.x / pageWidth,
                        );
                        const clamped = Math.max(
                          0,
                          Math.min(
                            nextIndex,
                            previewGalleryDocs.length - 1,
                          ),
                        );
                        if (clamped !== detail.vehiclePreviewIndex) {
                          detail.setVehiclePreviewIndex(clamped);
                        }
                      }}
                    >
                      {previewGalleryDocs.map((doc) => {
                        const url = detail.vehiclePreviewUrls[doc.id] ?? null;
                        const isPdf = isPdfTripDoc(doc);
                        const slideStyle = [
                          styles.docGallerySlide,
                          vehicleGalleryPageWidth > 0
                            ? { width: vehicleGalleryPageWidth }
                            : null,
                        ];
                        return (
                          <View key={doc.id} style={slideStyle}>
                            {url ? (
                              <TripVaultFilePreview
                                uri={url}
                                isPdf={isPdf}
                                style={styles.docModalImage}
                                accessibilityLabel={`${doc.label} preview`}
                              />
                            ) : (
                              <View style={styles.docModalCenter}>
                                <FontAwesome
                                  name="file-o"
                                  size={48}
                                  color="#94a3b8"
                                />
                                <Text style={styles.docModalHint}>
                                  {doc.label}
                                </Text>
                                <Text style={styles.docModalHint}>
                                  {doc.storagePath
                                    ? detail.docPreviewLoading
                                      ? "Generating secure link…"
                                      : "Couldn’t open this file. Try View again, or re-upload if it still fails."
                                    : "No document uploaded yet."}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </ScrollView>

                    {previewGalleryDocs.length > 1 ? (
                      <>
                        <TouchableOpacity
                          accessibilityLabel="Previous document"
                          activeOpacity={0.85}
                          disabled={detail.vehiclePreviewIndex <= 0}
                          onPress={() =>
                            goToVehicleGalleryIndex(
                              detail.vehiclePreviewIndex - 1,
                            )
                          }
                          style={[
                            styles.docGalleryNavBtn,
                            styles.docGalleryNavBtnLeft,
                            detail.vehiclePreviewIndex <= 0 &&
                              styles.docGalleryNavBtnDisabled,
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <FontAwesome
                            name="chevron-left"
                            size={16}
                            color="#0f172a"
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          accessibilityLabel="Next document"
                          activeOpacity={0.85}
                          disabled={
                            detail.vehiclePreviewIndex >=
                            previewGalleryDocs.length - 1
                          }
                          onPress={() =>
                            goToVehicleGalleryIndex(
                              detail.vehiclePreviewIndex + 1,
                            )
                          }
                          style={[
                            styles.docGalleryNavBtn,
                            styles.docGalleryNavBtnRight,
                            detail.vehiclePreviewIndex >=
                              previewGalleryDocs.length - 1 &&
                              styles.docGalleryNavBtnDisabled,
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <FontAwesome
                            name="chevron-right"
                            size={16}
                            color="#0f172a"
                          />
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.docModalCenter}>
                    <FontAwesome name="file-o" size={48} color="#94a3b8" />
                    <Text style={styles.docModalHint}>
                      {detail.isVehicleGalleryDoc
                        ? "No vehicle document on file yet."
                        : "No document on file yet."}
                    </Text>
                  </View>
                )
              ) : detail.docPreviewUrl ? (
                <View style={styles.docGalleryWrap}>
                  <TripVaultFilePreview
                    uri={detail.docPreviewUrl}
                    isPdf={selectedPreviewIsPdf}
                    style={styles.docModalImage}
                    accessibilityLabel={`${detail.selectedDoc?.label ?? "Document"} preview`}
                  />
                </View>
              ) : detail.docPreviewError ? (
                <View style={styles.docModalCenter}>
                  <FontAwesome
                    name="exclamation-triangle"
                    size={40}
                    color="#94a3b8"
                  />
                  <Text style={styles.docModalHint}>
                    Could not load this document.
                  </Text>
                </View>
              ) : (
                <View style={styles.docModalCenter}>
                  <FontAwesome name="file-o" size={48} color="#94a3b8" />
                  <Text style={styles.docModalHint}>
                    {detail.selectedDoc?.status === "Pending"
                      ? "This document has not been uploaded yet."
                      : "No preview available."}
                  </Text>
                </View>
              )}
            </View>

            {isGalleryPreview && previewGalleryDocs.length > 1 ? (
              <View style={styles.docGalleryDots}>
                {previewGalleryDocs.map((doc, index) => {
                  const isActive = index === detail.vehiclePreviewIndex;
                  return (
                    <TouchableOpacity
                      key={doc.id}
                      accessibilityLabel={`Go to document ${index + 1}`}
                      onPress={() => goToVehicleGalleryIndex(index)}
                      activeOpacity={0.85}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    >
                      <View
                        style={[
                          styles.docGalleryDot,
                          isActive
                            ? styles.docGalleryDotActive
                            : styles.docGalleryDotInactive,
                        ]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.docModalFooter}>
              {canUploadTripDocs &&
              canMutateTripVaultDoc({
                doc: detail.selectedDoc,
                canUploadTripDocs,
                tripCompleted,
              }) &&
              canAddMoreTripDocs(detail.selectedDoc) &&
              (detail.selectedDoc?.id !== "vehicle-documents" ||
                !!trip.vehicle_id) ? (
                <TouchableOpacity
                  style={styles.docModalFooterCancelBtn}
                  onPress={() => {
                    const doc = detail.selectedDoc;
                    detail.setSelectedDoc(null);
                    if (doc) startAddMoreForDoc(doc);
                  }}
                  activeOpacity={0.85}
                  accessibilityLabel="Add another document"
                >
                  <Text style={styles.docModalFooterCancelText}>Add another</Text>
                </TouchableOpacity>
              ) : previewOpenUrl ? (
                <TouchableOpacity
                  style={styles.docModalFooterCancelBtn}
                  onPress={() => openPreviewExternally(previewOpenUrl)}
                  activeOpacity={0.85}
                  accessibilityLabel="Open document"
                >
                  <Text style={styles.docModalFooterCancelText}>Open</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <View style={{ flexDirection: "row", gap: 8 }}>
                {previewOpenUrl &&
                canMutateTripVaultDoc({
                  doc: detail.selectedDoc,
                  canUploadTripDocs,
                  tripCompleted,
                }) &&
                canAddMoreTripDocs(detail.selectedDoc) &&
                (detail.selectedDoc?.id !== "vehicle-documents" ||
                  !!trip.vehicle_id) ? (
                  <TouchableOpacity
                    style={styles.docModalFooterCancelBtn}
                    onPress={() => openPreviewExternally(previewOpenUrl)}
                    activeOpacity={0.85}
                    accessibilityLabel="Open document"
                  >
                    <Text style={styles.docModalFooterCancelText}>Open</Text>
                  </TouchableOpacity>
                ) : null}
                {canUploadTripDocs &&
                !detail.docPreviewLoading &&
                (isGalleryPreview
                  ? !!previewGalleryDocs[detail.vehiclePreviewIndex]?.storagePath
                  : !!detail.selectedDoc?.storagePath) ? (
                  <TouchableOpacity
                    style={styles.docModalFooterDeleteBtn}
                    onPress={requestDeleteCurrentPreview}
                    activeOpacity={0.85}
                    disabled={!!uploadingDocId}
                    accessibilityLabel="Delete this file"
                  >
                    <Text style={styles.docModalFooterDeleteText}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.docModalFooterBtn}
                  onPress={() => detail.setSelectedDoc(null)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.docModalFooterBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pendingVaultUpload != null}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!uploadingDocId) {
            setPendingVaultUpload(null);
            resetPendingLrFields();
          }
        }}
      >
        <View style={styles.docModalBackdrop}>
          <View
            style={[
              styles.docModalCard,
              {
                marginTop: insets.top + 12,
                marginBottom: insets.bottom + 12,
                maxHeight: "88%",
              },
            ]}
          >
            <View style={styles.docModalHeader}>
              <TouchableOpacity
                onPress={() => {
                  if (!uploadingDocId) {
                    setPendingVaultUpload(null);
                    resetPendingLrFields();
                  }
                }}
                style={styles.docModalCloseIcon}
                activeOpacity={0.8}
                disabled={!!uploadingDocId}
              >
                <FontAwesome name="times" size={18} color="#0f172a" />
              </TouchableOpacity>
              <View style={styles.docModalTitleBlock}>
                <Text style={styles.docModalTitle} numberOfLines={2}>
                  {pendingVaultUpload?.label ?? "Document"}
                </Text>
                <Text style={styles.docModalSubtitle} numberOfLines={2}>
                  {pendingVaultUpload?.vehicleKind &&
                  pendingVaultUpload.vehicleKind !== "extra"
                    ? `Saving as ${pendingVaultUpload.label}`
                    : pendingFileCount > 1
                      ? `Confirm upload · ${pendingFileCount} files`
                      : "Confirm upload"}
                </Text>
              </View>
              <View style={{ width: 36 }} />
            </View>

            <ScrollView
              style={styles.docModalBody}
              contentContainerStyle={{ paddingBottom: 8 }}
              nestedScrollEnabled
            >
              {pendingVaultUpload ? (
                pendingPreviewIsImage || pendingPreviewIsPdf ? (
                  <TripVaultFilePreview
                    uri={pendingVaultUpload.uri}
                    isPdf={pendingPreviewIsPdf}
                    style={styles.docModalImageConfirm}
                    accessibilityLabel={`${pendingVaultUpload.label} preview`}
                  />
                ) : (
                  <View style={styles.docModalCenter}>
                    <FontAwesome
                      name="file-pdf-o"
                      size={48}
                      color={Theme.primary}
                    />
                    <Text style={styles.docModalHint} numberOfLines={2}>
                      {pendingVaultUpload.fileName}
                    </Text>
                    <Text style={styles.docModalHint}>
                      File ready — confirm to save to the vault.
                    </Text>
                  </View>
                )
              ) : null}

              {pendingVaultUpload ? (
                <Text style={styles.pendingExtraFileName} numberOfLines={2}>
                  {pendingVaultUpload.fileName}
                </Text>
              ) : null}

              {pendingVaultUpload?.extraFiles &&
              pendingVaultUpload.extraFiles.length > 0 ? (
                <View style={styles.pendingExtraFiles}>
                  <Text style={styles.pendingExtraFilesTitle}>
                    Also uploading
                  </Text>
                  {pendingVaultUpload.extraFiles.map((file) => (
                    <Text
                      key={`${file.uri}-${file.fileName}`}
                      style={styles.pendingExtraFileName}
                      numberOfLines={1}
                    >
                      {file.fileName}
                    </Text>
                  ))}
                </View>
              ) : null}

              {pendingVaultUpload ? (
                <Text style={styles.vaultLimitsHint}>{VAULT_DOC_LIMIT_HINT}</Text>
              ) : null}

              {pendingVaultUpload?.docType === "lr" ? (
                <View>
                  <View style={styles.lrFieldsRow}>
                    <View style={styles.lrFieldCol}>
                      <Text style={styles.lrNumberFieldLabel}>LR NUMBER</Text>
                      <TextInput
                        value={pendingLrNumber}
                        onChangeText={setPendingLrNumber}
                        placeholder="LR No."
                        placeholderTextColor={Theme.textMuted}
                        style={styles.lrNumberFieldInput}
                        autoCapitalize="characters"
                        editable={!uploadingDocId}
                        returnKeyType="next"
                      />
                    </View>
                    <View style={styles.lrFieldCol}>
                      <Text style={styles.lrNumberFieldLabel}>LR DATE</Text>
                      <Pressable
                        style={styles.lrDateField}
                        onPress={() => {
                          if (uploadingDocId) return;
                          setShowPendingLrCalendar((open) => !open);
                        }}
                        disabled={!!uploadingDocId}
                        accessibilityRole="button"
                        accessibilityLabel="Pick LR date"
                      >
                        <Text
                          style={
                            pendingLrDate
                              ? styles.lrDateFieldText
                              : styles.lrDateFieldPlaceholder
                          }
                          numberOfLines={1}
                        >
                          {pendingLrDate || "Pick date"}
                        </Text>
                        <Feather
                          name="calendar"
                          size={16}
                          color={Theme.primary}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.lrFieldCol}>
                      <Text style={styles.lrNumberFieldLabel}>INVOICE</Text>
                      <TextInput
                        value={pendingLrInvoice}
                        onChangeText={setPendingLrInvoice}
                        placeholder="Invoice no."
                        placeholderTextColor={Theme.textMuted}
                        style={styles.lrNumberFieldInput}
                        autoCapitalize="characters"
                        editable={!uploadingDocId}
                        returnKeyType="done"
                      />
                    </View>
                  </View>
                  {showPendingLrCalendar ? (
                    <View style={styles.lrCalendarWrap}>
                      <CompactValidTillCalendar
                        selectedIso={vaultDocDateToIso(pendingLrDate) ?? ""}
                        onSelect={(iso) => {
                          setPendingLrDate(formatVaultDocDate(iso) ?? iso);
                          setShowPendingLrCalendar(false);
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.docModalFooter}>
              <TouchableOpacity
                style={styles.docModalFooterCancelBtn}
                onPress={() => {
                  setPendingVaultUpload(null);
                  resetPendingLrFields();
                }}
                activeOpacity={0.85}
                disabled={!!uploadingDocId}
              >
                <Text style={styles.docModalFooterCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.docModalFooterBtn}
                onPress={() => void confirmPendingVaultUpload()}
                activeOpacity={0.85}
                disabled={!!uploadingDocId}
              >
                {uploadingDocId ? (
                  <ActivityIndicator
                    size="small"
                    color={Theme.buttonDarkText}
                  />
                ) : (
                  <Text style={styles.docModalFooterBtnText}>Save to vault</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={addDocChooserVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setAddDocChooserVisible(false)}
      >
        <View style={styles.docModalBackdrop}>
          <View
            style={[
              styles.docModalCard,
              {
                maxWidth: 420,
                marginTop: insets.top + 12,
                marginBottom: insets.bottom + 12,
              },
            ]}
          >
            <View style={styles.docModalHeader}>
              <View style={styles.docModalTitleBlock}>
                <Text style={styles.docModalTitle}>Add document</Text>
                <Text style={styles.docModalSubtitle}>
                  Choose what you want to upload
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setAddDocChooserVisible(false)}
                style={styles.docModalCloseIcon}
                activeOpacity={0.8}
                accessibilityLabel="Close"
              >
                <FontAwesome name="times" size={18} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 12, gap: 8 }}>
              {(
                [
                  { kind: "lr" as const, label: "LR Document" },
                  { kind: "manifest" as const, label: "Trip Manifest" },
                  { kind: "vehicle" as const, label: "Vehicle Document" },
                  { kind: "pod" as const, label: "Driver POD" },
                ] as const
              ).map((item) => {
                return (
                <TouchableOpacity
                  key={item.kind}
                  style={styles.addDocTypeBtn}
                  onPress={() => chooseAddDocumentType(item.kind)}
                  activeOpacity={0.85}
                  accessibilityLabel={`Upload ${item.label}`}
                >
                  <FontAwesome name="file-text-o" size={16} color="#0f172a" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.addDocTypeBtnText, { flex: 0 }]}>
                      {item.label}
                    </Text>
                    {item.kind === "vehicle" ? (
                      <Text style={styles.addDocTypeBtnMeta}>
                        {VEHICLE_COMPLIANCE_TYPE_HINT}
                      </Text>
                    ) : null}
                  </View>
                  <FontAwesome name="chevron-right" size={12} color="#94a3b8" />
                </TouchableOpacity>
                );
              })}
              <Text style={styles.vaultLimitsHint}>{VAULT_DOC_LIMIT_HINT}</Text>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={vehicleDocChooserVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setVehicleDocChooserVisible(false)}
      >
        <View style={styles.docModalBackdrop}>
          <View
            style={[
              styles.docModalCard,
              {
                maxWidth: 420,
                marginTop: insets.top + 12,
                marginBottom: insets.bottom + 12,
              },
            ]}
          >
            <View style={styles.docModalHeader}>
              <View style={styles.docModalTitleBlock}>
                <Text style={styles.docModalTitle}>Vehicle document</Text>
                <Text style={styles.docModalSubtitle}>
                  Choose RC, Fitness, Insurance or PUC
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setVehicleDocChooserVisible(false)}
                style={styles.docModalCloseIcon}
                activeOpacity={0.8}
                accessibilityLabel="Close"
              >
                <FontAwesome name="times" size={18} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 12, gap: 8 }}>
              {VEHICLE_UPLOAD_CHOOSER_ORDER.map((docType) => {
                const onFile = !!detail.vehicleDocs?.[docType]?.url;
                return (
                  <TouchableOpacity
                    key={docType}
                    style={styles.addDocTypeBtn}
                    onPress={() => chooseVehicleDocKind(docType)}
                    activeOpacity={0.85}
                    accessibilityLabel={`Upload ${DOCUMENT_LABELS[docType]}`}
                  >
                    <FontAwesome name="file-text-o" size={16} color="#0f172a" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.addDocTypeBtnText, { flex: 0 }]}>
                        {DOCUMENT_LABELS[docType]}
                      </Text>
                      <Text style={styles.addDocTypeBtnMeta}>
                        {onFile ? "On file — tap to replace" : "Needed"}
                      </Text>
                    </View>
                    <FontAwesome name="chevron-right" size={12} color="#94a3b8" />
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.addDocTypeBtn}
                onPress={() => chooseVehicleDocKind("extra")}
                activeOpacity={0.85}
                accessibilityLabel="Upload additional vehicle document"
              >
                <FontAwesome name="plus" size={16} color="#0f172a" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.addDocTypeBtnText, { flex: 0 }]}>
                    Additional document
                  </Text>
                  <Text style={styles.addDocTypeBtnMeta}>
                    Extra file, not RC / Fitness / Insurance / PUC
                  </Text>
                </View>
                <FontAwesome name="chevron-right" size={12} color="#94a3b8" />
              </TouchableOpacity>
              <Text style={styles.vaultLimitsHint}>{VAULT_DOC_LIMIT_HINT}</Text>
            </View>
          </View>
        </View>
      </Modal>

      <ThemedAlertModal
        visible={vaultDeleteTarget != null}
        title="Delete document?"
        message={`Remove “${vaultDeleteTarget?.label ?? "this file"}” from the vault? This cannot be undone.`}
        okText="Delete"
        okVariant="primary"
        variant="warning"
        secondaryText="Cancel"
        onSecondary={() => setVaultDeleteTarget(null)}
        onRequestClose={() => setVaultDeleteTarget(null)}
        onOk={() => {
          void executeVaultDelete();
        }}
      />

      <TripLedgerTransactionPreviewModal
        visible={previewLedgerTx != null}
        transaction={previewLedgerTx}
        onClose={() => setPreviewLedgerTx(null)}
        onViewAll={() => {
          setActiveTab("finance");
          setFinanceSubTab("transactions");
        }}
        resolveReceiptPartyAvatar={resolveReceiptPartyAvatar}
        tripDetailsMap={
          trip?.id
            ? {
                [trip.id]: {
                  trip_number: getTripDisplayNumber(trip, currentOrganization?.id),
                  pickup_area: trip.pickup_area ?? null,
                  drop_location: trip.drop_location ?? null,
                  pickup_date: trip.pickup_date ?? trip.created_at ?? null,
                },
              }
            : undefined
        }
      />

      <Suspense fallback={null}>
        <LiveTrackingModal
          visible={detail.showTrackingModal ?? false}
          onClose={() => detail.setShowTrackingModal(false)}
          trip={trip}
          isDriverOffline={showDriverTrackingOfflineOverlay}
          onSendLoginReminder={detail.requestDriverPing}
          onReassignDriver={() => {
            detail.setShowTrackingModal(false);
            setShowReassignSheet(true);
          }}
          isClientIndentView={entryContext === "client"}
          trackingState={trackingState ?? defaultTrackingState}
          vehicleLabel={detail.vehicleLabel}
          locationLabels={detail.trackingMapLocationLabels}
          originCoordinate={detail.trackingMapOriginCoordinate}
          destinationCoordinate={detail.trackingMapDestinationCoordinate}
          tripLocationPoints={mapDbLocationTrail}
          mapTruckLocation={mapTruckLocation ?? null}
          mapDbLocationTrail={mapDbLocationTrail}
          mapTruckStatus={mapTruckStatus}
          trackingBroadcastActive={trackingState?.broadcastActive ?? false}
          lastPingRecordedAt={driverLastPingRecordedAt}
          driverAvatarUri={detail.driverAvatarUri}
          driverAvatarSeed={trip.driver_id}
          locationAddress={detail.driverLocationAddress}
          driverActivityTimelineRows={detail.driverActivityTimelineRows}
          expandedTimelineEntryIds={detail.expandedTimelineEntryIds}
          onToggleTimelineItem={detail.toggleTimelineItemExpanded}
          assignmentDriverNames={detail.assignmentDriverNames}
          assignmentVehicleLabels={detail.assignmentVehicleLabels}
          driverName={detail.driverName}
          driverPhone={detail.driverPhone}
          currentUserId={detail.currentUserId}
          presentation={liveTrackingPresentation}
          displayClientName={
            detail.displayClientName ?? trip.client_name ?? null
          }
        />
      </Suspense>

      {tripRoomOpen ? (
        <Suspense fallback={null}>
          <TripChatRoomSheet
            visible
            tripId={trip.id}
            tripLabel={getTripDisplayNumber(trip, currentOrganization?.id)}
            onClose={() => setTripRoomOpen(false)}
            onViewTrip={() => setTripRoomOpen(false)}
          />
        </Suspense>
      ) : null}

    </View>
    </TripProvider>
  );
}

// ── Tab button ─────────────────────────────────────────────────────────────────

function TabButton({
  label,
  icon,
  active,
  onPress,
  compact = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  active: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.tabBtn,
        compact && styles.tabBtnCompact,
        active && styles.tabBtnActive,
        compact && active && styles.tabBtnActiveCompact,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {!compact ? (
        <FontAwesome
          name={icon}
          size={13}
          color={active ? "#2563eb" : "#6b7280"}
        />
      ) : null}
      <Text
        style={[
          styles.tabBtnText,
          compact && styles.tabBtnTextCompact,
          active && styles.tabBtnTextActive,
          compact && active && styles.tabBtnTextActiveCompact,
        ]}
      >
        {label}
      </Text>
      {compact && active ? <View style={styles.tabUnderlineCompact} /> : null}
    </TouchableOpacity>
  );
}

// ── Nav action button ──────────────────────────────────────────────────────────

function NavAction({
  icon,
  label,
  onPress,
  primary,
  danger,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  onPress?: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.navActionBtn,
        primary && styles.navActionBtnPrimary,
        danger && styles.navActionBtnDanger,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <FontAwesome
        name={icon}
        size={12}
        color={primary ? "#fff" : danger ? "#ef4444" : "#94a3b8"}
      />
      <Text
        style={[
          styles.navActionText,
          primary && styles.navActionTextPrimary,
          danger && styles.navActionTextDanger,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

void LedgerCard;
void ExpenseListCard;
void NavAction;

