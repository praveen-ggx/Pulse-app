/**
 * Core data hook for TripDetailScreen.
 * Extracts all state, data loading, side effects, and computed values
 * from the 5k-line monolith so the screen component stays thin.
 */
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
    getClientById,
    getClientDetails,
    getLinkedOrgProfile,
} from "@/features/clients/services/clients.service";
import {
    getDriverById,
    getDriverProfileDisplay,
} from "@/features/drivers/services/drivers.service";
import { openTripLedgerEntryChooser } from "@/features/finance/ledger/tripLedgerEntryChooser";
import type { LedgerRow } from "@/features/finance/services/finance.service";
import { getTripLedgerEntries } from "@/features/finance/utils/getTripLedgerEntries";
import { resolveTripSupplierDisplayName } from "../tripDetail.helpers";
import { useTripRatings } from "./useTripRatings";
import {
    getLinkedOrgProfileForSupplier,
    getSupplierById,
    getSupplierDetails,
} from "@/features/suppliers/services/suppliers.service";
import { getVehicleDocumentViewUrl, getVehicleDocumentViewUrls, mergeEntityDocumentsIntoVehicleVault } from "@/features/vehicles/services/vehicleDocuments.service";
import { resolveTripDocumentPreviewUrl } from "@/features/tripCompliance/services/vehicleDocumentReuse.service";
import { getVehicleById, getVehicleForTripViewer } from "@/features/vehicles/services/vehicles.service";
import type { VehicleDocuments } from "@/features/vehicles/utils/vehicleDocuments.util";
import {
    DOCUMENT_EXPIRY_ORDER,
    DOCUMENT_LABELS,
    VEHICLE_COMPLIANCE_TYPE_HINT,
    vehicleComplianceOnFileSummary,
} from "@/features/vehicles/utils/vehicleDocuments.util";
import { getSignedAvatarUrl } from "@/lib/avatarUpload";
import { canAssignTrip } from "@/lib/capabilities";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { useCapabilities } from "@/lib/useCapabilities";
import { isAggregateTrip } from "@/features/drivers/utils/driverUtils.util";
import {
  isIntegratedClientRow,
  isIntegratedSupplierRow,
} from "@/features/trips/visibility/tripVisibility";
import { formatIndianVehicleNumber } from "@/lib/format";
import {
    useShipperDisplayNamesQuery,
    useTransactionsQuery,
    useTripSubcontractsQuery,
} from "@/lib/queries";
import {
    isBundleEnabled,
    peekTripDetailBundleCache,
    patchTripDetailBundleCache,
    fetchLightTripDetailFinance,
    useTripDetailBundleQuery,
    type BundleDocument,
    type BundleTransaction,
} from "@/lib/queries/useTripDetailBundleQuery";
import { queryKeys } from "@/lib/queryKeys";
import * as driverLocationService from "@/features/driver/services/driverLocation.service";
import { getMoverAssetClientPaid } from "@/features/trips/services/moverAssetPayment.service";
import * as tripDocumentsService from "@/features/trips/services/tripDocuments.service";
import { parseLrFieldValues } from "@/features/trips/services/lrDocumentOcr.util";
import {
  parseEwayFieldEntries,
  parseEwayFieldValues,
} from "@/features/trips/services/ewayBillFields.util";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRealtimeDriverLocations, useRealtimeTrip, useRealtimeTripDocuments } from "../../../hooks/useRealtimeTrips";
import { useTrackingTripBroadcast } from "@/features/tracking/hooks/useTrackingTripBroadcast";
import { isTrackingBroadcastV1Enabled } from "@/features/tracking/trackingFeatureFlags";
import {
  getTrackingState,
  isTripDriverMapEligible,
  isTripTrackingActive,
  shouldShowDriverTrackingOfflineOverlay,
} from "@/features/trips/utils/tripTrackingStatus.util";
import { useTripLiveTracking } from "@/features/trips/hooks/useTripLiveTracking";
import { useRequestDriverPing } from "@/features/trips/hooks/useRequestDriverPing";
import {
    clearInitialTripForDetail,
    getInitialTripForDetail,
} from "../../../initialTripForDetail";
import type { TripAssignmentAuditRow } from "../../../services/trip-assignment-audit.service";
import { getTripAssignmentAuditHistory } from "../../../services/trip-assignment-audit.service";
import type {
    TripAdjustment,
    TripAdjustmentImpact,
    TripAdjustmentType,
} from "../../../services/tripAdjustments";
import {
    addTripAdjustment,
    getTripAdjustments,
    updateTripAdjustment,
    voidTripAdjustment,
} from "../../../services/tripAdjustments";
import { getTripOperationalDisplay } from "@/features/operations/display";
import { getTripOtpForDisplay } from "../../../services/tripOtp.service";
import {
    getTripById,
    getTripDisplayNumber,
    getTripsWhereOrgIsSupplier,
    supplierRowToTripRow,
    isTripCompleted,
    type TripRow,
} from "../../../services/trips.service";
import type { AssignmentSource } from "../../TripAssignmentBlock";
import type { ReassignCompletedMeta } from "../../reassign/reassign.types";

export type { ReassignCompletedMeta };
import type { TripDetailTab } from "../TripDetailFinanceView";
import { isPdfTripDoc, type TripDocItem } from "../tripDocTypes";
import {
  isNarrowWebViewport,
  shouldFetchTripSubcontractsOnDetail,
  shouldLoadTripTrackingQueries,
  shouldPreferLightTripDetailFirstPaint,
} from "../completedTripInitialLoad.util";
import { Platform } from "react-native";

import {
  resolveMapLocationLabel,
  resolveMapLocationLabelsBatch,
} from "@/lib/mapLocationLabel.service";
import { getTripTrackingMapStore } from "@/features/tracking/map/TripTrackingMapStore";
import {
  TRACKING_LOCATION_GEOCODE_MAX,
  TRIP_TRACKING_HISTORY_FETCH_LIMIT,
} from "@/lib/trackingLocation.constants";

function ledgerRowsFromBundleTransactions(
  rows: BundleTransaction[] | null | undefined,
): LedgerRow[] {
  if (!rows?.length) return [];
  return rows.map((tx) => ({
    id: tx.id,
    organization_id: tx.organization_id,
    trip_id: tx.trip_id,
    party_name: tx.party_name,
    description: tx.description,
    amount_in: Number(tx.amount_in ?? 0),
    amount_out: Number(tx.amount_out ?? 0),
    transaction_date: tx.transaction_date,
    created_at: tx.created_at ?? tx.transaction_date,
    contact_id: tx.contact_id,
    contact_type: (tx.contact_type as LedgerRow["contact_type"]) ?? null,
    ledger_entity_type: tx.ledger_entity_type,
    ledger_flow_type: tx.ledger_flow_type,
    ledger_category: tx.ledger_category,
  }));
}

function tripDocumentsFromBundle(
  rows: BundleDocument[] | null | undefined,
): tripDocumentsService.TripDocumentRow[] {
  if (!rows?.length) return [];
  return rows.map((doc) => ({
    id: doc.id,
    trip_id: doc.trip_id,
    file_name: doc.file_name,
    storage_path: doc.storage_path,
    mime_type: doc.mime_type,
    size_bytes: doc.size_bytes,
    uploaded_at: doc.uploaded_at,
    uploaded_by: doc.uploaded_by,
    document_type: doc.document_type ?? "pod",
  }));
}

function docTypeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  if (ext === "heic" || ext === "heif") return "HEIC";
  if (ext === "jpg" || ext === "jpeg") return "JPG";
  if (ext === "png") return "PNG";
  if (ext === "pdf") return "PDF";
  return ext ? ext.toUpperCase() : "JPG";
}

function tripDocItemType(doc: {
  mime_type?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
}): string {
  if (
    isPdfTripDoc({
      mimeType: doc.mime_type,
      fileName: doc.file_name,
      storagePath: doc.storage_path,
    })
  ) {
    return "PDF";
  }
  const mime = (doc.mime_type ?? "").toLowerCase();
  if (mime.includes("png")) return "PNG";
  if (mime.includes("webp")) return "WEBP";
  if (mime.startsWith("image/")) return "JPG";
  return docTypeFromFileName(doc.file_name || doc.storage_path || "");
}

function buildSlotCard(
  rows: tripDocumentsService.TripDocumentRow[],
  slot: {
    id: string;
    label: string;
    pendingType: string;
    category: TripDocItem["category"];
  },
): TripDocItem {
  if (rows.length === 0) {
    return {
      id: slot.id,
      label: slot.label,
      type: slot.pendingType,
      status: "Pending",
      category: slot.category,
    };
  }
  const isEwaySlot = slot.category === "eway" || slot.id === "eway_bill";
  const files = rows.map((row, index) => {
    const number = isEwaySlot
      ? parseEwayFieldValues(row.document_number).ewayNo
      : parseLrFieldValues(row.document_number).lrNumber;
    return {
      id: `${slot.id}-${row.id}`,
      label: number
        ? `${slot.label} · ${number}`
        : rows.length > 1
          ? `${slot.label} ${index + 1}`
          : slot.label,
      type: tripDocItemType(row),
      storagePath: row.storage_path,
      documentId: row.id,
    };
  });
  const storedFields = rows
    .map((row) => parseLrFieldValues(row.document_number))
    .find((fields) => fields.lrNumber || fields.date || fields.invoice);
  const ewayRaw = isEwaySlot
    ? rows.find((row) => parseEwayFieldEntries(row.document_number).length > 0)
        ?.document_number ??
      rows.find((row) => row.document_number?.trim())?.document_number ??
      null
    : null;
  const documentNumber = isEwaySlot
    ? ewayRaw?.trim() || null
    : storedFields?.lrNumber || null;
  return {
    id: slot.id,
    label: slot.label,
    type: files.length > 1 ? "FILES" : files[0].type,
    status: "Uploaded",
    storagePath: files[0].storagePath,
    documentId: files[0].documentId,
    category: slot.category,
    files,
    documentNumber,
    documentDate: storedFields?.date || rows[0]?.document_date || null,
    invoiceNumber: storedFields?.invoice || null,
    uploadedAt: rows[0]?.uploaded_at ?? null,
  };
}

export interface VehiclePreviewDoc {
  id: string;
  label: string;
  type: string;
  status: "Uploaded" | "Pending";
  storagePath?: string;
  expiryDate?: string | null;
}

export type DriverActivityTimelineRow =
  | { kind: "assignment"; row: TripAssignmentAuditRow }
  | {
      kind: "status";
      id: string;
      status_label: string;
      changed_at: string;
      status_context: "started" | "in_transit" | "completed" | "created" | "accepted" | "assigned";
      detail_line: string;
    };

type TripMapCoordinateFields = TripRow & {
  pickup_lat?: unknown;
  pickup_lon?: unknown;
  drop_lat?: unknown;
  drop_lon?: unknown;
};

/** Linked org + contact fields for global {@link PartyAvatar} resolution. */
export type TripPartyAvatarFields = {
  organizationImageUrl: string | null;
  organizationAvatarSeed: string | null;
  /** Linked org display name (e.g. Ajio) — used when supplier row name is missing from the bundle. */
  organizationName: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
};

function emptyTripPartyAvatarFields(): TripPartyAvatarFields {
  return {
    organizationImageUrl: null,
    organizationAvatarSeed: null,
    organizationName: null,
    avatarUrl: null,
    avatarSeed: null,
  };
}

function nStr(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v.length ? v : null;
}

function pickClientDisplayName(
  client: { name?: string | null; contact_person?: string | null } | null | undefined,
): string | null {
  if (!client) return null;
  return (client.name || client.contact_person || "").trim() || null;
}

function pickSupplierDisplayName(
  supplier: {
    company_name?: string | null;
    name?: string | null;
    contact_person?: string | null;
  } | null | undefined,
): string | null {
  if (!supplier) return null;
  return (
    supplier.company_name ||
    supplier.name ||
    supplier.contact_person ||
    ""
  ).trim() || null;
}

function isMissingSupplierLabel(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  const lc = v.toLowerCase();
  return (
    lc === "awaiting data" ||
    lc === "supplier" ||
    lc === "partner" ||
    lc === "connected" ||
    lc === "—" ||
    lc === "-"
  );
}

export interface UseTripDetailOptions {
  tripId: string;
  entryContext?: "supplier" | "vehicle" | "client";
  clientIdFromContext?: string;
  clientNameFromContext?: string;
  onBack: () => void;
  /** Delivered light path: load transactions/adjustments only when Finance is open. */
  financeSurfaceActive?: boolean;
}

/**
 * First paint: prefer an already-fetched bundle (authoritative) over the list
 * TripRow seed. Never write the list row into `queryKeys.trips.bundle`.
 */
function peekTripDetailFirstPaint(
  tripId: string | null | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
): TripRow | null {
  if (!tripId) return null;
  const cached = peekTripDetailBundleCache(queryClient, tripId);
  if (cached?.trip?.id === tripId) {
    return cached.trip as unknown as TripRow;
  }
  return getInitialTripForDetail(tripId);
}

/** Light bundle only when this trip is already known completed — frozen for the screen instance. */
function peekCompletedTripForLightBundle(
  tripId: string,
  orgId: string | null | undefined,
  queryClient: ReturnType<typeof useQueryClient>,
): boolean {
  if (isTripCompleted(peekTripDetailFirstPaint(tripId, queryClient))) return true;
  if (!orgId) return false;
  const list = queryClient.getQueryData<TripRow[]>(queryKeys.trips.finite(orgId));
  const row = Array.isArray(list) ? list.find((t) => t.id === tripId) : undefined;
  return isTripCompleted(row);
}

function tripRowListPaintFields(row: TripRow): {
  driverName: string | null;
  vehicleLabel: string | null;
} {
  return {
    driverName: (row.driver_display_name ?? "").trim() || null,
    vehicleLabel: (row.vehicle_display_number ?? "").trim() || null,
  };
}

export function useTripDetail({
  tripId,
  entryContext,
  clientIdFromContext,
  clientNameFromContext,
  onBack,
  financeSurfaceActive = false,
}: UseTripDetailOptions) {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile, user } = useAuth();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  void onBack;

  // ── Trip data ─────────────────────────────────────────────────────────────
  // Sync seed so the first committed render can paint from the list TripRow
  // (or a cached bundle). Do not wait for a post-mount effect.
  const [trip, setTrip] = useState<TripRow | null>(() =>
    peekTripDetailFirstPaint(tripId, queryClient),
  );
  const [loading, setLoading] = useState(
    () => peekTripDetailFirstPaint(tripId, queryClient) == null,
  );
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Assignment / driver / vehicle ─────────────────────────────────────────
  const [driverName, setDriverName] = useState<string | null>(() => {
    const row = peekTripDetailFirstPaint(tripId, queryClient);
    return row ? tripRowListPaintFields(row).driverName : null;
  });
  const [driverPhone, setDriverPhone] = useState<string | null>(null);
  const [driverAvatarUri, setDriverAvatarUri] = useState<string | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(() => {
    const row = peekTripDetailFirstPaint(tripId, queryClient);
    return row ? tripRowListPaintFields(row).vehicleLabel : null;
  });
  const [vehicleDocs, setVehicleDocs] = useState<VehicleDocuments | null>(null);
  const [displayVehicleFromInput, setDisplayVehicleFromInput] = useState("");
  const [driverLinked, setDriverLinked] = useState(false);

  // ── Partner / supplier / client ───────────────────────────────────────────
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [clientAvatarUri, setClientAvatarUri] = useState<string | null>(null);
  const [supplierAvatarUri, setSupplierAvatarUri] = useState<string | null>(null);
  const [clientPartyAvatarFields, setClientPartyAvatarFields] =
    useState<TripPartyAvatarFields | null>(null);
  const [supplierPartyAvatarFields, setSupplierPartyAvatarFields] =
    useState<TripPartyAvatarFields | null>(null);
  const [partnerOrgId, setPartnerOrgId] = useState<string | null>(null);
  const [clientPartyRes, setClientPartyRes] = useState<{
    name: string | null;
    integrated: boolean;
    orgId: string | null;
  } | null>(null);
  const [supplierPartyRes, setSupplierPartyRes] = useState<{
    name: string | null;
    integrated: boolean;
    orgId: string | null;
  } | null>(null);

  // ── Finance / adjustments ─────────────────────────────────────────────────
  const [financeRefreshKey, setFinanceRefreshKey] = useState(0);
  const [adjustments, setAdjustments] = useState<TripAdjustment[]>([]);
  // Mover_asset trips: amount the aggregator has already paid the mover on the
  // linked load (read-only shared-ledger visibility; no row on mover's books).
  const [moverClientPaid, setMoverClientPaid] = useState<number>(0);

  // ── Assignment audit ──────────────────────────────────────────────────────
  const [assignmentAuditRows, setAssignmentAuditRows] = useState<TripAssignmentAuditRow[]>([]);
  const [assignmentDriverNames, setAssignmentDriverNames] = useState<Record<string, string>>({});
  const [assignmentVehicleLabels, setAssignmentVehicleLabels] = useState<Record<string, string>>({});
  const [tripOtp, setTripOtp] = useState<{ code: string | null; expires_at: string | null } | null>(null);
  /** After reassign: show tracking copy until new driver presence arrives (max 60s). */
  const [waitingForNewDriverLocation, setWaitingForNewDriverLocation] = useState(false);

  // ── Tracking / location ───────────────────────────────────────────────────
  const [driverLocation, setDriverLocation] =
    useState<driverLocationService.DriverLocationRow | null>(null);
  // ISO timestamp from broadcast (not lat/lon — GPS never enters React state from broadcast path).
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [driverLocationLoading, setDriverLocationLoading] = useState(false);
  const [tripLocationPoints, setTripLocationPoints] = useState<
    { latitude: number; longitude: number; recorded_at: string }[]
  >([]);
  const [driverLocationAddress, setDriverLocationAddress] = useState<string | null>(null);
  const [pastLocationAddresses, setPastLocationAddresses] = useState<
    [string | null, string | null]
  >([null, null]);
  const [locationTrailWithNames, setLocationTrailWithNames] = useState<
    { latitude: number; longitude: number; recorded_at: string; locationName: string | null }[]
  >([]);

  // ── Documents ─────────────────────────────────────────────────────────────
  const [tripDocuments, setTripDocuments] = useState<tripDocumentsService.TripDocumentRow[]>([]);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [docPreviewLoading, setDocPreviewLoading] = useState(false);
  const [docPreviewError, setDocPreviewError] = useState(false);
  const [vehiclePreviewUrls, setVehiclePreviewUrls] = useState<Record<string, string | null>>({});
  const [vehiclePreviewIndex, setVehiclePreviewIndex] = useState(0);
  const [selectedDoc, setSelectedDoc] = useState<TripDocItem | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  /** When opening the modal from Finance Overview (shortcuts / protocol chips may seed reason). */
  const [adjustmentModalPreset, setAdjustmentModalPreset] = useState<{
    type?: TripAdjustmentType;
    impact?: TripAdjustmentImpact;
    reasonSeed?: string | null;
  } | null>(null);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [showFullScreenMap, setShowFullScreenMap] = useState(false);
  const [locationHistoryEnabled, setLocationHistoryEnabled] = useState(false);
  const [showDriverRejectedModal, setShowDriverRejectedModal] = useState(false);
  const [tripDetailTab, setTripDetailTab] = useState<TripDetailTab>("finance");
  const [expandedTimelineEntryIds, setExpandedTimelineEntryIds] = useState<
    Record<string, boolean>
  >({});

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isRefreshingRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const refetchTransactionsRef = useRef<() => void>(() => {});
  const podModalRefetchDoneRef = useRef(false);
  const loadCompletedForIdRef = useRef<string | null>(null);
  const supplierFallbackLastFetchAtRef = useRef<number>(0);
  const SUPPLIER_FALLBACK_MIN_INTERVAL_MS = 60_000;
  const supplierRetryForTripIdRef = useRef<string | null>(null);
  const tripRef = useRef<TripRow | null>(null);
  tripRef.current = trip;
  // Guards loadTripDocuments against a stale response: if the user
  // navigates trip -> trip before an in-flight getDocumentsByTripId
  // resolves, this lets the .then() detect it's no longer for the active
  // trip and discard it, instead of overwriting the new trip's documents
  // (and therefore its LR/POD/manifest preview) with the previous trip's.
  const currentTripIdRef = useRef<string | null>(null);
  currentTripIdRef.current = tripId ?? null;
  // Phase 3c: deduplicates dual-filter Realtime events (trip_id + driver_id on same channel).
  const lastSeenLocationIdRef = useRef<string | null>(null);
  // Coarse gate: only re-geocode when position changes by > ~100m (3 decimal degrees).
  const lastGeocodedLocRef = useRef<{ lat: number; lng: number } | null>(null);
  // Broadcast timestamp ref — written per GPS tick, flushed into React state at 1s cadence.
  const lastBroadcastTimestampRef = useRef<string | null>(null);
  // Phase 3b: true after bundle data has been seeded into state on initial mount.
  const bundleSeededRef = useRef(false);
  /** Documents/POD viewer opened — allows OCR + Storage fallback. */
  const documentsViewerActiveRef = useRef(false);
  /**
   * Bundle seed already applies latest_driver_location. Skip the first
   * status/updated_at location read for this tripId; later status changes still fetch.
   */
  const skippedBundleMountLocationReadForTripRef = useRef<string | null>(null);

  // ── Shipper display names (platform-level alias) ──────────────────────────
  const { data: shipperNameByTripId = {} } = useShipperDisplayNamesQuery(
    currentOrganization?.id ?? null,
  );
  const displayClientName = trip
    ? (shipperNameByTripId[trip.id] ??
        (trip.organization_id !== currentOrganization?.id ? undefined : trip.client_name ?? undefined))
    : undefined;

  // ── Derived flags ─────────────────────────────────────────────────────────
  const isAggregate = useMemo(() => (trip ? isAggregateTrip(trip) : false), [trip]);
  const tripCompleted = trip != null && isTripCompleted(trip);
  const { driverRatingAvg } = useTripRatings(trip?.id, tripCompleted);
  const currentUserId = user?.uid ?? null;

  const capabilities = useCapabilities();
  const { can: canSurface } = useMemberAccess();
  const canViewDetail = canSurface("tripops.trips.detail");
  const canAssign = useMemo(
    () =>
      trip
        ? canAssignTrip(capabilities) && canSurface("tripops.trips.assign")
        : false,
    [capabilities, trip, canSurface],
  );
  const canAddFinanceEntry = canSurface("finance.add_transaction");
  const canVoidAdjustments = canSurface("finance.void_adjustments");
  const canViewTripExpenses = canSurface("finance.expenses.view");
  const canApproveTripExpenses = canSurface("finance.expenses.approve");

  const showAssignByPhone = useMemo(() => {
    if (!trip) return false;
    // Aggregate assignments should keep phone + OTP workflow visible
    // even after driver assignment, so dispatch can re-share OTP when needed.
    return isAggregateTrip(trip);
  }, [trip]);

  const assignmentSource = useMemo<AssignmentSource>(() => {
    if (!assignmentAuditRows.length) return "unassigned";
    const latest = assignmentAuditRows[0];
    if (!latest?.driver_id_new) return "unassigned";
    return latest.changed_by === currentUserId ? "private" : "shared";
  }, [assignmentAuditRows, currentUserId]);

  const latestAssignmentRow = useMemo(() => {
    if (!assignmentAuditRows.length) return null;
    return [...assignmentAuditRows].sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
    )[0] ?? null;
  }, [assignmentAuditRows]);

  const effectiveDriverIdForLocation = useMemo(
    () => trip?.driver_id ?? latestAssignmentRow?.driver_id_new ?? null,
    [trip?.driver_id, latestAssignmentRow],
  );

  const trackingBroadcastEligible =
    isTrackingBroadcastV1Enabled() &&
    !!trip?.id &&
    isTripDriverMapEligible(
      trip.status,
      trip.completed_at,
      effectiveDriverIdForLocation,
    );

  const compactWebTrackingDefer = isNarrowWebViewport(
    typeof window !== "undefined" ? window.innerWidth : undefined,
    Platform.OS,
  );
  const trackingUiOpen =
    showTrackingModal || showFullScreenMap || tripDetailTab === "tracking";
  const trackingQueriesEnabled = shouldLoadTripTrackingQueries({
    compactWeb: compactWebTrackingDefer,
    trackingUiOpen,
  });

  /** Load presence + checkpoint trail whenever a driver is on an open trip (incl. assigned). */
  const driverMapDataEnabled =
    trackingQueriesEnabled &&
    !!trip?.id &&
    !!effectiveDriverIdForLocation &&
    isTripDriverMapEligible(
      trip.status,
      trip.completed_at,
      effectiveDriverIdForLocation,
    );

  const trackingBroadcastEnabled =
    trackingQueriesEnabled && trackingBroadcastEligible;

  const liveTracking = useTripLiveTracking({
    tripId: trip?.id ?? null,
    driverId: effectiveDriverIdForLocation,
    trackingEnabled: driverMapDataEnabled,
  });

  const driverPing = useRequestDriverPing({
    tripId: trip?.id ?? null,
    trackingEnabled: trackingBroadcastEnabled || driverMapDataEnabled,
  });

  const isDriverOffline = useMemo(() => {
    if (!trip) return true;

    if (isTripTrackingActive(trip.status, trip.completed_at)) {
      const trailLast = liveTracking.trail[liveTracking.trail.length - 1]?.recorded_at;
      const pointsLast = tripLocationPoints[tripLocationPoints.length - 1]?.recorded_at;
      const lastLocationAt =
        lastSeenAt ??
        driverPing.lastPingRespondedAt ??
        driverLocation?.recorded_at ??
        trailLast ??
        pointsLast ??
        null;
      return shouldShowDriverTrackingOfflineOverlay({
        tripStatus: trip.status,
        completedAt: trip.completed_at,
        driverId: effectiveDriverIdForLocation ?? trip.driver_id,
        driverOnline: getTrackingState(trip.id, trip.status, {
          lastSeenAt,
          lastPingRespondedAt: driverPing.lastPingRespondedAt,
        }).driverOnline,
        lastLocationAt,
      });
    }

    const statusLower = (trip.status ?? "").toLowerCase();
    const hasJourneyRuntimeStatus =
      statusLower === "in_progress" ||
      statusLower === "in_transit" ||
      statusLower === "picked_up" ||
      statusLower === "arrived" ||
      statusLower === "at_destination" ||
      statusLower === "completed" ||
      statusLower === "delivered" ||
      statusLower === "done";
    const hasAssignedDriver =
      !!effectiveDriverIdForLocation || hasJourneyRuntimeStatus;
    if (!hasAssignedDriver) return true;
    const trailPointCount = liveTracking.trail.length;
    const hasLiveTrackingSignal = !!driverLocation || trailPointCount > 0;
    const viewerOrgId = currentOrganization?.id ?? null;
    const isSharedClientOrNonOwnerView =
      !!viewerOrgId &&
      !!trip.organization_id &&
      trip.organization_id !== viewerOrgId;
    const isClientOwnerIndentView =
      !!trip.indent_id &&
      !!viewerOrgId &&
      !!trip.organization_id &&
      trip.organization_id === viewerOrgId;
    const isClientTrackingView = entryContext === "client";
    if (
      isClientTrackingView ||
      isClientOwnerIndentView ||
      isSharedClientOrNonOwnerView ||
      hasLiveTrackingSignal
    ) {
      return false;
    }
    return !driverLinked;
  }, [
    effectiveDriverIdForLocation,
    entryContext,
    trip,
    driverLinked,
    currentOrganization?.id,
    driverLocation,
    liveTracking.trail.length,
    tripLocationPoints.length,
    lastSeenAt,
    driverPing.lastPingRespondedAt,
  ]);

  // Seed map store from DB pings when broadcast is off (assigned / stale broadcast).
  useEffect(() => {
    if (!trip?.id || !driverMapDataEnabled || trackingBroadcastEnabled) return;
    const seed = liveTracking.seedPoint;
    const lat = driverLocation?.latitude ?? seed?.latitude;
    const lng = driverLocation?.longitude ?? seed?.longitude;
    const recordedAt = driverLocation?.recorded_at ?? seed?.recorded_at;
    if (lat == null || lng == null || !recordedAt) return;
    getTripTrackingMapStore(trip.id).applySeed(lat, lng, recordedAt);
    setLastSeenAt((prev) => {
      if (!prev || new Date(recordedAt).getTime() >= new Date(prev).getTime()) {
        return recordedAt;
      }
      return prev;
    });
  }, [
    trip?.id,
    driverMapDataEnabled,
    trackingBroadcastEnabled,
    driverLocation?.latitude,
    driverLocation?.longitude,
    driverLocation?.recorded_at,
    liveTracking.seedPoint?.latitude,
    liveTracking.seedPoint?.longitude,
    liveTracking.seedPoint?.recorded_at,
  ]);


  const previousDriverName = useMemo(() => {
    const prev = assignmentAuditRows.find((r) => r.driver_id_prev != null);
    return prev ? (assignmentDriverNames[prev.driver_id_prev!] ?? null) : null;
  }, [assignmentAuditRows, assignmentDriverNames]);

  const latestReassignmentSummary = useMemo(() => {
    const reassign = assignmentAuditRows.find((r) => r.event_type === "reassignment");
    if (!reassign) return null;
    const from = reassign.driver_id_prev
      ? (assignmentDriverNames[reassign.driver_id_prev] ?? "Previous driver")
      : "Previous driver";
    const to = reassign.driver_id_new
      ? (assignmentDriverNames[reassign.driver_id_new] ?? "New driver")
      : "New driver";
    return `Reassigned: ${from} → ${to}`;
  }, [assignmentAuditRows, assignmentDriverNames]);

  const driverActivityTimelineRows = useMemo<DriverActivityTimelineRow[]>(() => {
    if (!trip) return [];

    const rows: DriverActivityTimelineRow[] = [];
    const tripStatusMeta = trip as TripRow & { status_updated_at?: string | null };
    if (trip.created_at) {
      rows.push({
        kind: "status",
        id: "status-created",
        status_label: "Trip Created",
        changed_at: trip.created_at,
        status_context: "created",
        detail_line: `System generated trip ${getTripDisplayNumber(trip)}`,
      });
    }

    if (assignmentAuditRows.length > 0) {
      const orderedAudit = [...assignmentAuditRows].sort(
        (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime(),
      );
      orderedAudit.forEach((row, idx) => {
        const dName = row.driver_id_new
          ? (assignmentDriverNames[row.driver_id_new] ?? trip.driver_display_name ?? null)
          : null;
        const vLabel = row.vehicle_id_new
          ? (assignmentVehicleLabels[row.vehicle_id_new] ?? trip.vehicle_display_number ?? null)
          : null;
        rows.push({
          kind: "status",
          id: `status-assigned-${row.id}-${idx}`,
          status_label: "Assigned",
          changed_at: row.changed_at,
          status_context: "assigned",
          detail_line:
            [dName, vLabel].filter(Boolean).join(" · ") ||
            trip.pickup_area ||
            "Driver assigned",
        });
      });
    } else if (trip.driver_id || trip.driver_display_name || trip.vehicle_id || trip.vehicle_display_number) {
      rows.push({
        kind: "status",
        id: "status-assigned-fallback",
        status_label: "Assigned",
        changed_at: trip.updated_at ?? trip.created_at ?? new Date().toISOString(),
        status_context: "assigned",
        detail_line:
          [trip.driver_display_name, trip.vehicle_display_number].filter(Boolean).join(" · ") ||
          trip.pickup_area ||
          "Driver assigned",
      });
    }

    if (
      (trip.status_updated_role === "driver" || Number(trip.status_revision ?? 0) > 0) &&
      (trip.updated_at || trip.started_at)
    ) {
      rows.push({
        kind: "status",
        id: "status-accepted",
        status_label: "Driver Accepted",
        changed_at: trip.updated_at ?? trip.started_at ?? new Date().toISOString(),
        status_context: "accepted",
        detail_line: trip.pickup_area || "Accepted assignment",
      });
    }

    const statusLower = String(trip.status ?? "").toLowerCase();
    const inTransitLikeStatus =
      statusLower === "in_progress" ||
      statusLower === "in_transit" ||
      statusLower === "pickup" ||
      statusLower === "picked_up" ||
      statusLower === "at_drop";

    if (trip.started_at || inTransitLikeStatus) {
      rows.push({
        kind: "status",
        id: "status-in-transit",
        status_label: "In transit",
        changed_at:
          trip.started_at ??
          tripStatusMeta.status_updated_at ??
          trip.updated_at ??
          new Date().toISOString(),
        status_context: "in_transit",
        detail_line: trip.pickup_area || "Origin",
      });
    }

    const completedLikeStatus =
      statusLower.includes("complet") ||
      statusLower.includes("deliver") ||
      statusLower === "done";
    if (trip.completed_at || completedLikeStatus) {
      rows.push({
        kind: "status",
        id: "status-completed",
        status_label: "Delivered",
        changed_at:
          trip.completed_at ??
          tripStatusMeta.status_updated_at ??
          trip.updated_at ??
          new Date().toISOString(),
        status_context: "completed",
        detail_line: trip.drop_location || "Destination",
      });
    }

    return rows;
  }, [trip, assignmentAuditRows, assignmentDriverNames, assignmentVehicleLabels]);

  // Phase 3b: single-RPC bundle replacing 18-24 serial calls.
  // When ENABLE_TRIP_DETAIL_BUNDLE is true (global), bundleActive is true for all orgs.
  // Legacy load effects below are no-ops on the bundle path.
  // Delivered/completed (from list seed or trips.finite): skip get_trip_detail_bundle.
  // Narrow web: light trip row first so phones are not blocked on the bundle RPC + Leaflet.
  // Frozen so a later status/resize cannot swap rpc→light and drop party/audit fields.
  const completedLightOnly = peekCompletedTripForLightBundle(
    tripId,
    currentOrganization?.id ?? null,
    queryClient,
  );
  const [preferLightBundle] = useState(() =>
    shouldPreferLightTripDetailFirstPaint({
      completed: completedLightOnly,
      narrowWeb: isNarrowWebViewport(
        typeof window !== "undefined" ? window.innerWidth : undefined,
        Platform.OS,
      ),
    }),
  );
  const { bundle, isBundleLoading, bundleError } = useTripDetailBundleQuery(
    tripId,
    currentOrganization?.id ?? null,
    { preferLight: preferLightBundle },
  );
  const bundleActive = isBundleEnabled(currentOrganization?.id ?? null);

  useEffect(() => {
    if (!preferLightBundle || !financeSurfaceActive || !tripId) return;
    let cancelled = false;
    void fetchLightTripDetailFinance(tripId).then((slice) => {
      if (cancelled) return;
      patchTripDetailBundleCache(queryClient, tripId, (old) => {
        if (!old || old.trip.id !== tripId) return old;
        return {
          ...old,
          transactions: slice.transactions,
          adjustments: slice.adjustments,
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [preferLightBundle, financeSurfaceActive, tripId, queryClient]);

  // ── Transactions (React Query) ────────────────────────────────────────────
  // Bundle already includes the trip-scoped 50-row slice — do not load org-wide ledger.
  const orgIdForTransactions = bundleActive
    ? null
    : (currentOrganization?.id ?? null);
  const tripOwnerOrgIdForTransactions = trip?.organization_id ?? null;
  const secondaryOrgIdForTransactions =
    orgIdForTransactions &&
    tripOwnerOrgIdForTransactions &&
    tripOwnerOrgIdForTransactions !== orgIdForTransactions
      ? tripOwnerOrgIdForTransactions
      : null;
  const {
    data: primaryTransactionsData = [],
    refetch: refetchPrimaryTransactions,
    isPending: primaryTxPending,
    isLoading: primaryTxLoading,
    isError: primaryTxError,
    isSuccess: primaryTxSuccess,
  } = useTransactionsQuery(orgIdForTransactions);
  const {
    data: secondaryTransactionsData = [],
    refetch: refetchSecondaryTransactions,
    isPending: secondaryTxPending,
    isLoading: secondaryTxLoading,
    isError: secondaryTxError,
    isSuccess: secondaryTxSuccess,
  } = useTransactionsQuery(secondaryOrgIdForTransactions);
  refetchTransactionsRef.current = () => {
    if (bundleActive && tripId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) });
      return;
    }
    void refetchPrimaryTransactions();
    if (secondaryOrgIdForTransactions) void refetchSecondaryTransactions();
  };
  const transactions: LedgerRow[] | null = useMemo(() => {
    if (bundleActive) {
      return ledgerRowsFromBundleTransactions(bundle?.transactions);
    }
    if (!orgIdForTransactions) return null;
    const merged = [...primaryTransactionsData, ...secondaryTransactionsData];
    if (merged.length <= 1) return merged;
    const deduped = new Map<string, LedgerRow>();
    for (const row of merged) deduped.set(row.id, row);
    return Array.from(deduped.values());
  }, [
    bundleActive,
    bundle?.transactions,
    orgIdForTransactions,
    primaryTransactionsData,
    secondaryTransactionsData,
  ]);

  const tripLedgerEntries = useMemo(
    () =>
      getTripLedgerEntries(
        transactions,
        trip?.id,
        trip ? getTripDisplayNumber(trip) : undefined,
      ),
    [transactions, trip],
  );

  // First-result only: required queries still pending, and nothing to show.
  // Disabled secondary (no owner-org mismatch) is not required. Cached rows
  // keep the list visible during background refetch (isFetching with data).
  const primaryTxRequired = !!orgIdForTransactions;
  const secondaryTxRequired = !!secondaryOrgIdForTransactions;
  const primaryTxAwaiting =
    primaryTxRequired &&
    (primaryTxLoading || (primaryTxPending && !primaryTxSuccess && !primaryTxError));
  const secondaryTxAwaiting =
    secondaryTxRequired &&
    (secondaryTxLoading || (secondaryTxPending && !secondaryTxSuccess && !secondaryTxError));
  const tripLedgerEntriesLoading = bundleActive
    ? tripLedgerEntries.length === 0 && isBundleLoading
    : tripLedgerEntries.length === 0 && (primaryTxAwaiting || secondaryTxAwaiting);
  const tripLedgerEntriesError = bundleActive
    ? tripLedgerEntries.length === 0 && !isBundleLoading && !!bundleError
    : tripLedgerEntries.length === 0 &&
      !tripLedgerEntriesLoading &&
      ((primaryTxRequired && primaryTxError) ||
        (secondaryTxRequired && secondaryTxError));

  /** Prefer linked supplier name; fall back to supplier ledger party_name. */
  const resolvedPartnerName = useMemo(
    () =>
      resolveTripSupplierDisplayName({
        partnerName,
        supplierPartyName: supplierPartyRes?.name,
        tripSupplierName: trip?.supplier_name,
        linkedOrganizationName: supplierPartyAvatarFields?.organizationName,
        clientName: displayClientName ?? trip?.client_name,
        ledgerEntries: tripLedgerEntries,
      }),
    [
      partnerName,
      supplierPartyRes?.name,
      trip?.supplier_name,
      supplierPartyAvatarFields?.organizationName,
      displayClientName,
      trip?.client_name,
      tripLedgerEntries,
    ],
  );

  const { data: tripSubcontracts = [] } = useTripSubcontractsQuery(
    shouldFetchTripSubcontractsOnDetail(trip)
      ? (currentOrganization?.id ?? null)
      : null,
    shouldFetchTripSubcontractsOnDetail(trip) && trip ? [trip.id] : [],
  );

  const subcontractRate = useMemo(() => {
    if (tripSubcontracts.length > 0 && trip) {
      const exact = tripSubcontracts.find((row) => row.trip_id === trip.id);
      return exact?.rate ?? null;
    }
    return null;
  }, [tripSubcontracts, trip]);

  // ── Finance totals ────────────────────────────────────────────────────────
  const paidToDriver = useMemo(
    () =>
      tripLedgerEntries.reduce(
        (s, r) => (r.contact_type === "driver" ? s + Number(r.amount_out ?? 0) : s),
        0,
      ),
    [tripLedgerEntries],
  );

  // ── Map coordinates ───────────────────────────────────────────────────────
  const trackingMapOriginCoordinate = useMemo(() => {
    const tripWithCoords = trip as TripMapCoordinateFields | null;
    const latitude = Number(tripWithCoords?.pickup_lat);
    const longitude = Number(tripWithCoords?.pickup_lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }, [trip]);

  const trackingMapDestinationCoordinate = useMemo(() => {
    const tripWithCoords = trip as TripMapCoordinateFields | null;
    const latitude = Number(tripWithCoords?.drop_lat);
    const longitude = Number(tripWithCoords?.drop_lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  }, [trip]);

  const trackingMapLocationLabels = useMemo(
    (): [string, string, string, string, string] => [
      (trip?.pickup_area ?? "Origin").trim() || "Start",
      pastLocationAddresses[0] ?? "Past location 1",
      pastLocationAddresses[1] ?? "Past location 2",
      driverLocationAddress?.trim() || "Current location",
      (trip?.drop_location ?? "Destination").trim() || "Destination",
    ],
    [trip?.pickup_area, trip?.drop_location, pastLocationAddresses, driverLocationAddress],
  );

  // ── Vehicle preview docs ──────────────────────────────────────────────────
  const vehiclePreviewDocs = useMemo<VehiclePreviewDoc[]>(() => {
    const complianceDocs = DOCUMENT_EXPIRY_ORDER.map((docType) => {
      const vDoc = vehicleDocs?.[docType];
      const storagePath = vDoc?.url?.trim();
      return storagePath
        ? {
            id: `vehicle-${docType}`,
            label: DOCUMENT_LABELS[docType],
            type: docTypeFromFileName(storagePath),
            status: "Uploaded" as const,
            storagePath,
            expiryDate: vDoc?.expiryDate ?? null,
          }
        : {
            id: `vehicle-${docType}`,
            label: DOCUMENT_LABELS[docType],
            type: "JPG",
            status: "Pending" as const,
            expiryDate: vDoc?.expiryDate ?? null,
          };
    });
    const extraDocs = (vehicleDocs?.extras ?? [])
      .filter((extra) => !!extra.url?.trim())
      .map((extra, index) => ({
        id: `vehicle-extra-${extra.id}`,
        label: extra.fileName?.trim() || `Vehicle Document ${index + 1}`,
        type: docTypeFromFileName(extra.url),
        status: "Uploaded" as const,
        storagePath: extra.url,
        expiryDate: extra.expiryDate || null,
      }));
    return [...complianceDocs, ...extraDocs];
  }, [vehicleDocs]);

  const computedTripDocs = useMemo<TripDocItem[]>(() => {
    const hasVehicleDoc = vehiclePreviewDocs.some((doc) => !!doc.storagePath);
    const firstVehicleDoc = vehiclePreviewDocs.find((doc) => !!doc.storagePath);

    const uploadedVehicleFiles = vehiclePreviewDocs
      .filter((doc) => !!doc.storagePath)
      .map((doc) => ({
        id: doc.id,
        label: doc.label,
        type: doc.type,
        storagePath: doc.storagePath!,
      }));

    return [
      buildSlotCard(
        tripDocuments.filter((d) => d.document_type === "lr"),
        { id: "lr", label: "LR Document", pendingType: "PDF", category: "lr" },
      ),
      buildSlotCard(
        tripDocuments.filter((d) => d.document_type === "eway_bill"),
        {
          id: "eway_bill",
          label: "Eway Bill",
          pendingType: "PDF",
          category: "eway",
        },
      ),
      buildSlotCard(
        tripDocuments.filter((d) => d.document_type === "manifest"),
        {
          id: "manifest",
          label: "Trip Manifest",
          pendingType: "PDF",
          category: "trip",
        },
      ),
      {
        id: "vehicle-documents",
        label: "Vehicle Document",
        type:
          vehicleComplianceOnFileSummary(vehicleDocs) ||
          (hasVehicleDoc ? "FILES" : VEHICLE_COMPLIANCE_TYPE_HINT),
        status: hasVehicleDoc ? ("Uploaded" as const) : ("Pending" as const),
        storagePath: firstVehicleDoc?.storagePath,
        docSource: "vehicle" as const,
        category: "vehicle" as const,
        files: uploadedVehicleFiles.length > 0 ? uploadedVehicleFiles : undefined,
      },
      buildSlotCard(
        tripDocuments.filter((d) => d.document_type === "pod"),
        {
          id: "pod",
          label: "Driver POD",
          pendingType: "JPG",
          category: "driver",
        },
      ),
    ];
  }, [tripDocuments, vehiclePreviewDocs, vehicleDocs]);

  const docPreviewStoragePath = useMemo(() => {
    if (!selectedDoc) return undefined;
    if (selectedDoc.storagePath) return selectedDoc.storagePath;
    if (selectedDoc.id.startsWith("pod")) {
      const selectedPodDocumentId = selectedDoc.documentId ?? null;
      if (selectedPodDocumentId) {
        return (
          tripDocuments.find((d) => d.id === selectedPodDocumentId)
            ?.storage_path ?? undefined
        );
      }
      // Fallback: keep legacy behavior if we can't identify the specific pod row.
      return tripDocuments.find((d) => d.document_type === "pod")?.storage_path;
    }
    return undefined;
  }, [selectedDoc, tripDocuments]);

  const isVehicleGalleryDoc = selectedDoc?.id === "vehicle-documents";
  const isTripSlotGalleryDoc = (selectedDoc?.files?.length ?? 0) >= 1;
  const isGalleryPreviewDoc = isVehicleGalleryDoc || isTripSlotGalleryDoc;

  const activeVehiclePreviewDoc = useMemo(
    () => vehiclePreviewDocs[vehiclePreviewIndex] ?? null,
    [vehiclePreviewDocs, vehiclePreviewIndex],
  );

  // ── Data loaders ──────────────────────────────────────────────────────────
  const load = useCallback(() => {
    if (!tripId) {
      setLoading(false);
      loadCompletedForIdRef.current = null;
      return;
    }
    const isRepeatLoadForSameId = loadCompletedForIdRef.current === tripId;
    if (isRepeatLoadForSameId || isRefreshingRef.current) {
      isRefreshingRef.current = true;
    } else if (!initialLoadDoneRef.current) {
      setLoading(true);
    }
    setError(null);
    getTripById(tripId)
      .then((res) => {
        if (res.error) {
          setError(res.error.message);
          setTrip(null);
        } else if (res.trip) {
          setTrip(res.trip);
        } else {
          const alreadyHaveTripForThisId = tripRef.current?.id === tripId;
          if (!alreadyHaveTripForThisId) setTrip(null);
        }
        return res;
      })
      .then(async (res) => {
        if (res.trip) return;
        const orgId = currentOrganization?.id;
        if (!orgId) return;
        const now = Date.now();
        if (now - supplierFallbackLastFetchAtRef.current < SUPPLIER_FALLBACK_MIN_INTERVAL_MS) {
          return;
        }
        supplierFallbackLastFetchAtRef.current = now;
        const supplierRes = await getTripsWhereOrgIsSupplier(orgId);
        if (supplierRes.error) return;
        const found = supplierRes.trips.find((t) => t.id === tripId);
        if (found) {
          const mapped = supplierRowToTripRow(found);
          const current = tripRef.current;
          const unchanged =
            current?.id === found.id &&
            current?.updated_at === found.updated_at &&
            (current?.status ?? "") === (found.status ?? "");
          if (!unchanged) {
            setTrip(mapped);
            setError(null);
          }
        }
      })
      .finally(() => {
        loadCompletedForIdRef.current = tripId;
        setLoading(false);
        initialLoadDoneRef.current = true;
        isRefreshingRef.current = false;
        setRefreshing(false);
      });
  }, [tripId, currentOrganization?.id]);

  const loadAdjustments = useCallback(async () => {
    if (!tripId) return;
    const list = await getTripAdjustments(tripId);
    setAdjustments(list);
  }, [tripId]);

  const loadAssignmentAudit = useCallback(() => {
    if (!tripId) return;
    getTripAssignmentAuditHistory(tripId).then(({ error, rows }) => {
      if (!error) {
        const sorted = [...(rows ?? [])].sort(
          (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
        );
        setAssignmentAuditRows(sorted);
      }
      else setAssignmentAuditRows([]);
    });
  }, [tripId]);

  // ── Realtime (UPDATE merges row from WAL — no getTripById refetch) ───────────
  const handleRealtimeTripUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      if (
        payload.eventType === "UPDATE" &&
        payload.new &&
        typeof payload.new === "object" &&
        (payload.new as { id?: string }).id === tripId
      ) {
        setTrip((prev) => {
          if (!prev || prev.id !== tripId) return prev;
          return { ...prev, ...(payload.new as Partial<TripRow>) } as TripRow;
        });
        // Keep the cached bundle's trip fields aligned with the realtime state so a
        // remount within staleTime (60s) doesn't re-seed `trip` from stale cache and
        // revert this merge — see queryKeys.trips.bundle usage in useTripDetailBundleQuery.
        patchTripDetailBundleCache(queryClient, tripId, (old) => {
            if (!old || old.trip.id !== tripId) return old;
            return { ...old, trip: { ...old.trip, ...(payload.new as Partial<typeof old.trip>) } };
          });
        return;
      }
      isRefreshingRef.current = true;
      setFinanceRefreshKey((k) => k + 1);
      // Bundle path: refetchTransactionsRef already invalidates queryKeys.trips.bundle.
      refetchTransactionsRef.current();
      if (!bundleActive) {
        load();
        loadAssignmentAudit();
      }
    },
    [tripId, load, loadAssignmentAudit, bundleActive, queryClient],
  );

  useRealtimeTrip(tripId ?? null, handleRealtimeTripUpdate);

  /** Resolve audit row IDs to labels. Skipped on bundle path — names are already inlined by the RPC. */
  useEffect(() => {
    if (bundleActive) return;
    const orgId = trip?.organization_id;
    if (!orgId || assignmentAuditRows.length === 0) {
      setAssignmentDriverNames({});
      setAssignmentVehicleLabels({});
      return;
    }
    const driverIds = new Set<string>();
    const vehicleIds = new Set<string>();
    for (const row of assignmentAuditRows) {
      if (row.driver_id_prev) driverIds.add(row.driver_id_prev);
      if (row.driver_id_new) driverIds.add(row.driver_id_new);
      if (row.vehicle_id_prev) vehicleIds.add(row.vehicle_id_prev);
      if (row.vehicle_id_new) vehicleIds.add(row.vehicle_id_new);
    }
    let cancelled = false;
    const resolveDriverDisplay = async (id: string): Promise<string> => {
      const res = await getDriverById(orgId, id);
      if (res.driver) return res.driver.name || res.driver.phone || id;
      if (trip.supplier_id) {
        const sup = await getSupplierById(orgId, trip.supplier_id);
        const linkedOrgId = sup.supplier?.linked_organization_id;
        if (linkedOrgId) {
          const res2 = await getDriverById(linkedOrgId, id);
          if (res2.driver) return res2.driver.name || res2.driver.phone || id;
        }
      }
      const viewerOrgId = currentOrganization?.id;
      if (viewerOrgId && viewerOrgId !== orgId) {
        const res3 = await getDriverById(viewerOrgId, id);
        if (res3.driver) return res3.driver.name || res3.driver.phone || id;
      }
      return id;
    };
    const resolveVehicleDisplay = async (id: string): Promise<string> => {
      const res = await getVehicleById(orgId, id);
      if (res.vehicle) {
        return (
          [res.vehicle.vehicle_number, res.vehicle.vehicle_type]
            .filter(Boolean)
            .join(" · ") || id
        );
      }
      if (trip.supplier_id) {
        const sup = await getSupplierById(orgId, trip.supplier_id);
        const linkedOrgId = sup.supplier?.linked_organization_id;
        if (linkedOrgId) {
          const res2 = await getVehicleById(linkedOrgId, id);
          if (res2.vehicle) {
            return (
              [res2.vehicle.vehicle_number, res2.vehicle.vehicle_type]
                .filter(Boolean)
                .join(" · ") || id
            );
          }
        }
      }
      return id;
    };
    const driverPromises = Array.from(driverIds).map(async (id) => ({
      id,
      name: await resolveDriverDisplay(id),
    }));
    const vehiclePromises = Array.from(vehicleIds).map(async (id) => ({
      id,
      label: await resolveVehicleDisplay(id),
    }));
    Promise.all([Promise.all(driverPromises), Promise.all(vehiclePromises)])
      .then(([driverResults, vehicleResults]) => {
        if (cancelled) return;
        const drivers: Record<string, string> = {};
        const vehicles: Record<string, string> = {};
        for (const r of driverResults) drivers[r.id] = r.name;
        for (const r of vehicleResults) vehicles[r.id] = r.label;
        setAssignmentDriverNames(drivers);
        setAssignmentVehicleLabels(vehicles);
      })
      .catch(() => {
        if (!cancelled) {
          setAssignmentDriverNames({});
          setAssignmentVehicleLabels({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    trip?.organization_id,
    trip?.supplier_id,
    assignmentAuditRows,
    currentOrganization?.id,
  ]);

  /** Primary driver card + vehicle label. Skipped on bundle path — driver/vehicle seeded from RPC. */
  useEffect(() => {
    if (bundleActive) return;
    if (!trip?.organization_id) {
      setDriverName(null);
      setDriverPhone(null);
      setDriverAvatarUri(null);
      setVehicleLabel(null);
      setVehicleDocs(null);
      setDriverLinked(false);
      return;
    }
    const fallbackDriverName = (trip.driver_display_name ?? "").trim() || null;
    let cancelled = false;
    const orgId = trip.organization_id;
    const resolveDriverAvatarUri = async (
      driverId: string,
      candidateUrl?: string | null,
    ) => {
      let rawAvatar = (candidateUrl ?? "").trim();
      if (!rawAvatar) {
        const profileRes = await getDriverProfileDisplay(driverId);
        rawAvatar = (profileRes.profile?.avatarUrl ?? "").trim();
      }
      if (!rawAvatar) return null;
      if (rawAvatar.startsWith("http://") || rawAvatar.startsWith("https://")) {
        return rawAvatar;
      }
      const signed = await getSignedAvatarUrl(rawAvatar);
      return signed ?? null;
    };
    if (trip.driver_id) {
      setDriverName(fallbackDriverName);
      setDriverPhone(null);
      setDriverAvatarUri(null);
      setDriverLinked(false);
      getDriverById(orgId, trip.driver_id).then((res) => {
        if (cancelled) return;
        const d = res.driver;
        if (d) {
          const fromDriver = (d.name || d.phone || "").trim() || null;
          setDriverName(fromDriver ?? fallbackDriverName ?? "—");
          setDriverPhone((d.phone ?? "").trim() || null);
          setDriverLinked(!!d.user_id);
          void resolveDriverAvatarUri(trip.driver_id!, d.avatar_url ?? null).then(
            (uri) => {
              if (!cancelled) setDriverAvatarUri(uri);
            },
          );
          return;
        }
        const trySupplierOrgThenViewerOrg = () => {
          if (!trip.supplier_id) {
            tryViewerOrg();
            return;
          }
          getSupplierById(orgId, trip.supplier_id).then((r) => {
            if (cancelled) return;
            const linkedOrgId = r.supplier?.linked_organization_id;
            if (linkedOrgId) {
              getDriverById(linkedOrgId, trip.driver_id!).then((res2) => {
                if (cancelled) return;
                const d2 = res2.driver;
                if (d2) {
                  const fromDriver2 = (d2.name || d2.phone || "").trim() || null;
                  setDriverName(fromDriver2 ?? fallbackDriverName ?? "—");
                  setDriverPhone((d2.phone ?? "").trim() || null);
                  setDriverLinked(!!d2.user_id);
                  void resolveDriverAvatarUri(trip.driver_id!, d2.avatar_url ?? null).then(
                    (uri) => {
                      if (!cancelled) setDriverAvatarUri(uri);
                    },
                  );
                  return;
                }
                tryViewerOrg();
              });
            } else {
              tryViewerOrg();
            }
          });
        };
        const tryViewerOrg = () => {
          const viewerOrgId = currentOrganization?.id;
          if (!viewerOrgId || viewerOrgId === orgId) {
            setDriverName(fallbackDriverName ?? "—");
            setDriverPhone(null);
            void resolveDriverAvatarUri(trip.driver_id!, null).then((uri) => {
              if (!cancelled) setDriverAvatarUri(uri);
            });
            setDriverLinked(false);
            return;
          }
          getDriverById(viewerOrgId, trip.driver_id!).then((res3) => {
            if (cancelled) return;
            const d3 = res3.driver;
            const fromDriver3 = d3
              ? (d3.name || d3.phone || "").trim() || null
              : null;
            setDriverName(fromDriver3 ?? fallbackDriverName ?? "—");
            setDriverPhone((d3?.phone ?? "").trim() || null);
            void resolveDriverAvatarUri(trip.driver_id!, d3?.avatar_url ?? null).then(
              (uri) => {
                if (!cancelled) setDriverAvatarUri(uri);
              },
            );
            setDriverLinked(!!d3?.user_id);
          });
        };
        trySupplierOrgThenViewerOrg();
      });
    } else {
      setDriverName(fallbackDriverName);
      setDriverAvatarUri(null);
      setDriverLinked(false);
    }
    const aggregateVehicleDisplay = (trip.vehicle_display_number ?? "").trim();
    if (trip.vehicle_id) {
      const applyVehicleRow = async (
        v: NonNullable<Awaited<ReturnType<typeof getVehicleById>>["vehicle"]>,
        labelOverride?: string | null,
      ) => {
        if (labelOverride) {
          setVehicleLabel(labelOverride);
        } else {
          const parts = [v.vehicle_number];
          if (v.vehicle_type) parts.push(v.vehicle_type);
          setVehicleLabel(parts.join(" · "));
        }
        const merged = await mergeEntityDocumentsIntoVehicleVault(
          trip.vehicle_id!,
          orgId,
          v.documents ?? null,
        );
        if (!cancelled) setVehicleDocs(merged);
      };
      const aggregateLabel =
        isAggregateTrip(trip) && aggregateVehicleDisplay
          ? formatIndianVehicleNumber(aggregateVehicleDisplay)
          : null;
      getVehicleById(orgId, trip.vehicle_id).then(async (res) => {
        if (cancelled) return;
        if (res.vehicle) {
          await applyVehicleRow(res.vehicle, aggregateLabel);
          return;
        }
        const viewer = await getVehicleForTripViewer(trip.vehicle_id!, trip.id, orgId);
        if (cancelled) return;
        if (viewer.vehicle) {
          await applyVehicleRow(viewer.vehicle, aggregateLabel);
          return;
        }
        if (aggregateLabel) setVehicleLabel(aggregateLabel);
        if (!trip.supplier_id) {
          const mergedOnly = await mergeEntityDocumentsIntoVehicleVault(
            trip.vehicle_id!,
            orgId,
            null,
          );
          if (!cancelled && mergedOnly) setVehicleDocs(mergedOnly);
          return;
        }
        getSupplierById(orgId, trip.supplier_id).then((r) => {
          if (cancelled) return;
          const linkedOrgId = r.supplier?.linked_organization_id;
          if (!linkedOrgId) {
            void mergeEntityDocumentsIntoVehicleVault(trip.vehicle_id!, orgId, null).then(
              (mergedOnly) => {
                if (!cancelled && mergedOnly) setVehicleDocs(mergedOnly);
              },
            );
            return;
          }
          getVehicleById(linkedOrgId, trip.vehicle_id!).then(async (res2) => {
            if (cancelled) return;
            if (res2.vehicle) {
              await applyVehicleRow(res2.vehicle, aggregateLabel);
              return;
            }
            const mergedOnly = await mergeEntityDocumentsIntoVehicleVault(
              trip.vehicle_id!,
              orgId,
              null,
            );
            if (!cancelled && mergedOnly) setVehicleDocs(mergedOnly);
          });
        });
      });
    } else if (aggregateVehicleDisplay) {
      setVehicleLabel(formatIndianVehicleNumber(aggregateVehicleDisplay));
      setVehicleDocs(null);
    } else {
      setVehicleLabel(null);
      setVehicleDocs(null);
    }
    return () => {
      cancelled = true;
    };
  }, [trip, currentOrganization?.id]);

  useEffect(() => {
    let cancelled = false;
    const ownerOrg = trip?.organization_id ?? currentOrganization?.id ?? null;
    const resolvePartyAvatarUri = async (raw: string | null | undefined) => {
      const value = (raw ?? "").trim();
      if (!value) return null;
      if (value.startsWith("http://") || value.startsWith("https://")) return value;
      return (await getSignedAvatarUrl(value)) ?? null;
    };

    setClientAvatarUri(null);
    setSupplierAvatarUri(null);
    setClientPartyAvatarFields(null);
    setSupplierPartyAvatarFields(null);
    // Do not wipe party names seeded by the bundle RPC while resolving avatars.
    if (!bundleActive) {
      setClientPartyRes(null);
      setSupplierPartyRes(null);
      setPartnerName(null);
    }
    if (!trip || !ownerOrg) return;

    void (async () => {
      if (bundleActive) {
        if (!bundle) return;
        if (trip.client_id) {
          const client = bundle.client_detail?.client;
          const linked = bundle.client_detail?.linked_org;
          const fields = emptyTripPartyAvatarFields();
          fields.avatarUrl = nStr(client?.avatar_url);
          fields.avatarSeed = nStr(client?.avatar_seed);
          fields.organizationImageUrl = nStr(linked?.logo_url);
          const rawAvatar =
            nStr(client?.avatar_url) ?? nStr(linked?.logo_url);
          const uri = await resolvePartyAvatarUri(rawAvatar);
          if (!cancelled) {
            setClientPartyAvatarFields(fields);
            setClientAvatarUri(uri);
          }
        }
        if (trip.supplier_id) {
          const supplier = bundle.supplier_detail?.supplier;
          const linked = bundle.supplier_detail?.linked_org;
          const fields = emptyTripPartyAvatarFields();
          fields.avatarUrl = nStr(supplier?.avatar_url);
          fields.avatarSeed = nStr(supplier?.avatar_seed);
          fields.organizationImageUrl = nStr(linked?.logo_url);
          fields.organizationName = nStr(linked?.name);
          const rawAvatar =
            nStr(supplier?.avatar_url) ?? nStr(linked?.logo_url);
          const uri = await resolvePartyAvatarUri(rawAvatar);
          if (!cancelled) {
            setSupplierPartyAvatarFields(fields);
            setSupplierAvatarUri(uri);
          }
        }
        return;
      }

      if (trip.client_id) {
        const fields = emptyTripPartyAvatarFields();
        let rawAvatar = "";
        const details = await getClientDetails(trip.client_id);
        if (!cancelled && details.client) {
          fields.avatarUrl = nStr(details.client.avatar_url);
          fields.avatarSeed = nStr(details.client.avatar_seed);
          if (details.client.linked_organization_id) {
            const linked = await getLinkedOrgProfile(details.client.linked_organization_id);
            if (!cancelled && linked.profile) {
              fields.organizationImageUrl = nStr(linked.profile.avatarUrl);
              fields.organizationAvatarSeed = nStr(linked.profile.avatarSeed);
            }
          }
        }
        if (!cancelled && details.client?.avatar_url) rawAvatar = details.client.avatar_url;
        if (!rawAvatar && details.client?.linked_organization_id) {
          const linked = await getLinkedOrgProfile(details.client.linked_organization_id);
          if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
        }
        if (!rawAvatar) {
          const { client } = await getClientById(ownerOrg, trip.client_id);
          if (!cancelled && client) {
            if (!fields.avatarUrl) fields.avatarUrl = nStr(client.avatar_url);
            if (!fields.avatarSeed) fields.avatarSeed = nStr(client.avatar_seed);
            if (!fields.organizationImageUrl && client.linked_organization_id) {
              const linked = await getLinkedOrgProfile(client.linked_organization_id);
              if (!cancelled && linked.profile) {
                if (!fields.organizationImageUrl)
                  fields.organizationImageUrl = nStr(linked.profile.avatarUrl);
                if (!fields.organizationAvatarSeed)
                  fields.organizationAvatarSeed = nStr(linked.profile.avatarSeed);
              }
            }
            if (!cancelled && client.avatar_url) rawAvatar = client.avatar_url;
            if (!rawAvatar && client.linked_organization_id) {
              const linked = await getLinkedOrgProfile(client.linked_organization_id);
              if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
            }
          }
        }
        const uri = await resolvePartyAvatarUri(rawAvatar || null);
        if (!cancelled) {
          setClientPartyAvatarFields(fields);
          setClientAvatarUri(uri);
        }
        if (!bundleActive) {
          let clientRow = details.client;
          if (!clientRow) {
            const { client } = await getClientById(ownerOrg, trip.client_id);
            clientRow = client;
          }
          if (!cancelled && clientRow) {
            setClientPartyRes({
              name: pickClientDisplayName(clientRow),
              integrated: isIntegratedClientRow(clientRow),
              orgId: nStr(clientRow.linked_organization_id),
            });
          }
        }
      }

      if (trip.supplier_id) {
        const fields = emptyTripPartyAvatarFields();
        let rawAvatar = "";
        let linkedOrgName: string | null = null;
        const details = await getSupplierDetails(trip.supplier_id);
        if (!cancelled && details.supplier) {
          fields.avatarUrl = nStr(details.supplier.avatar_url);
          fields.avatarSeed = nStr(details.supplier.avatar_seed);
          if (details.supplier.linked_organization_id) {
            const linked = await getLinkedOrgProfileForSupplier(
              details.supplier.linked_organization_id,
            );
            if (!cancelled && linked.profile) {
              fields.organizationImageUrl = nStr(linked.profile.avatarUrl);
              fields.organizationAvatarSeed = nStr(linked.profile.avatarSeed);
              linkedOrgName = nStr(linked.profile.organizationName);
              fields.organizationName = linkedOrgName;
            }
          }
        }
        if (!cancelled && details.supplier?.avatar_url) rawAvatar = details.supplier.avatar_url;
        if (!rawAvatar && details.supplier?.linked_organization_id) {
          const linked = await getLinkedOrgProfileForSupplier(details.supplier.linked_organization_id);
          if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
          if (!linkedOrgName && linked.profile) {
            linkedOrgName = nStr(linked.profile.organizationName);
            fields.organizationName = linkedOrgName;
          }
        }
        if (!rawAvatar || !fields.organizationName) {
          const { supplier } = await getSupplierById(ownerOrg, trip.supplier_id);
          if (!cancelled && supplier) {
            if (!fields.avatarUrl) fields.avatarUrl = nStr(supplier.avatar_url);
            if (!fields.avatarSeed) fields.avatarSeed = nStr(supplier.avatar_seed);
            if (supplier.linked_organization_id) {
              const linked = await getLinkedOrgProfileForSupplier(supplier.linked_organization_id);
              if (!cancelled && linked.profile) {
                if (!fields.organizationImageUrl)
                  fields.organizationImageUrl = nStr(linked.profile.avatarUrl);
                if (!fields.organizationAvatarSeed)
                  fields.organizationAvatarSeed = nStr(linked.profile.avatarSeed);
                if (!fields.organizationName) {
                  linkedOrgName = nStr(linked.profile.organizationName);
                  fields.organizationName = linkedOrgName;
                }
              }
            }
            if (!cancelled && supplier.avatar_url) rawAvatar = supplier.avatar_url;
            if (!rawAvatar && supplier.linked_organization_id) {
              const linked = await getLinkedOrgProfileForSupplier(supplier.linked_organization_id);
              if (!cancelled && linked.profile?.avatarUrl) rawAvatar = linked.profile.avatarUrl;
            }
          }
        }
        const viewerOrgId = currentOrganization?.id;
        if (!rawAvatar && viewerOrgId && viewerOrgId !== ownerOrg) {
          const { supplier } = await getSupplierById(viewerOrgId, trip.supplier_id);
          if (!cancelled && supplier?.avatar_url) rawAvatar = supplier.avatar_url;
        }
        const uri = await resolvePartyAvatarUri(rawAvatar || null);
        if (!cancelled) {
          setSupplierPartyAvatarFields(fields);
          setSupplierAvatarUri(uri);
        }

        // Always resolve a display name — the trip-detail bundle historically
        // omitted suppliers.name (only company_name), which left integrated
        // suppliers like Ajio as "Awaiting data" while the org logo still loaded.
        const pick = pickSupplierDisplayName;
        let supplierRow = details.supplier;
        if (!supplierRow) {
          const { supplier, error: errOwner } = await getSupplierById(ownerOrg, trip.supplier_id);
          if (!errOwner) supplierRow = supplier;
        }
        if (!supplierRow && viewerOrgId && viewerOrgId !== ownerOrg) {
          const { supplier, error: errViewer } = await getSupplierById(
            viewerOrgId,
            trip.supplier_id,
          );
          if (!errViewer) supplierRow = supplier;
        }
        const fallback = (trip.supplier_name ?? "").trim() || null;
        const supplierName =
          (supplierRow ? pick(supplierRow) : null) ??
          linkedOrgName ??
          fallback;
        if (!cancelled && !isMissingSupplierLabel(supplierName)) {
          setPartnerName(supplierName);
          setSupplierPartyRes({
            name: supplierName,
            integrated: supplierRow
              ? isIntegratedSupplierRow(supplierRow)
              : !!details.supplier?.linked_organization_id,
            orgId: supplierRow
              ? nStr(supplierRow.linked_organization_id)
              : nStr(details.supplier?.linked_organization_id),
          });
        } else if (!cancelled && !bundleActive) {
          setPartnerName(supplierName);
          if (supplierRow || supplierName) {
            setSupplierPartyRes({
              name: supplierName,
              integrated: supplierRow
                ? isIntegratedSupplierRow(supplierRow)
                : false,
              orgId: supplierRow
                ? nStr(supplierRow.linked_organization_id)
                : null,
            });
          } else {
            setSupplierPartyRes(null);
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    trip?.id,
    trip?.client_id,
    trip?.supplier_id,
    trip?.supplier_name,
    trip?.organization_id,
    currentOrganization?.id,
    bundleActive,
    bundle,
  ]);

  useEffect(() => {
    if (!trip) {
      setPartnerOrgId(null);
      return;
    }
    if (!clientPartyRes && !supplierPartyRes) {
      setPartnerOrgId(null);
      return;
    }
    setPartnerOrgId(supplierPartyRes?.orgId ?? clientPartyRes?.orgId ?? null);
  }, [trip, clientPartyRes, supplierPartyRes]);

  useEffect(() => {
    setDisplayVehicleFromInput("");
  }, [tripId]);

  const loadTripOtp = useCallback(() => {
    const hasDriverAssigned = !!trip?.driver_id;
    const hasVehicleAssigned =
      !!trip?.vehicle_id || !!String(trip?.vehicle_display_number ?? "").trim();
    const isAggregateTripFlag = isAggregateTrip(trip);
    // Load OTP when:
    //   A) aggregate trip with driver + vehicle assigned (original path), OR
    //   B) any trip where the assigned driver row has no user_id yet (unlinked
    //      tracking-only driver) — dispatcher needs the code to share with the driver.
    const needsOtp =
      (isAggregateTripFlag && hasDriverAssigned && hasVehicleAssigned) ||
      (!isAggregateTripFlag && hasDriverAssigned && !driverLinked);
    if (!trip?.id || !needsOtp) {
      setTripOtp(null);
      return;
    }
    getTripOtpForDisplay(trip.id).then(({ error, code, expires_at }) => {
      if (error) setTripOtp(null);
      else setTripOtp({ code: code ?? null, expires_at: expires_at ?? null });
    });
  }, [trip?.id, trip?.supplier_id, trip?.driver_id, trip?.vehicle_id, trip?.vehicle_display_number, driverLinked]);

  const loadTripDocuments = useCallback(
    (opts?: { forViewer?: boolean }) => {
      if (!tripId) return Promise.resolve();
      if (opts?.forViewer) documentsViewerActiveRef.current = true;
      const requestedTripId = tripId;
      const forViewer = documentsViewerActiveRef.current;
      return tripDocumentsService
        .getDocumentsByTripId(tripId, {
          includeOcr: forViewer,
          includeStorageFallback: forViewer,
        })
        .then(({ documents, error }) => {
          if (currentTripIdRef.current !== requestedTripId) return;
          if (error) return;
          if ((documents ?? []).length > 0) {
            setTripDocuments(documents ?? []);
            return;
          }
          if (forViewer) setTripDocuments([]);
        });
    },
    [tripId],
  );

  const ensureTripDocumentsForViewer = useCallback(() => {
    documentsViewerActiveRef.current = true;
    return loadTripDocuments({ forViewer: true });
  }, [loadTripDocuments]);

  const upsertTripDocument = useCallback(
    (row: tripDocumentsService.TripDocumentRow) => {
      setTripDocuments((prev) => {
        const without = prev.filter((doc) => doc.id !== row.id);
        return [row, ...without];
      });
    },
    [],
  );

  // Ops has no other signal for a driver-uploaded document (e.g. POD) — trip_documents
  // has no org-scoped realtime coverage elsewhere, so this per-trip subscription is the
  // only way this screen learns about a new upload without a manual refresh.
  useRealtimeTripDocuments(tripId ?? null, () => {
    void loadTripDocuments();
  });

  const fetchLatestDriverLocationFromDb = useCallback(async () => {
    if (!trip?.id) return;
    const driverId = effectiveDriverIdForLocation;
    setDriverLocationLoading(true);
    try {
      const latestRes =
        await driverLocationService.getLatestDriverLocationForTripOrDriver(
          trip.id,
          driverId,
        );
      const latest = latestRes.error ? null : (latestRes.location ?? null);
      if (latest) setDriverLocation(latest);
    } catch {
      // Location fetch failed silently — UI shows offline state
    } finally {
      setDriverLocationLoading(false);
    }
  }, [trip?.id, effectiveDriverIdForLocation]);

  const fetchLocationHistoryFromDb = useCallback(async () => {
    if (!trip?.id) return;
    const driverId = effectiveDriverIdForLocation;
    try {
      const historyByTrip = await driverLocationService.getTripLocationHistory(
        trip.id,
        TRIP_TRACKING_HISTORY_FETCH_LIMIT,
      );
      let effectivePoints = !historyByTrip.error ? historyByTrip.points : [];
      if (effectivePoints.length === 0 && driverId) {
        const historyByDriver =
          await driverLocationService.getDriverLocationHistoryByDriverId(driverId);
        if (!historyByDriver.error) effectivePoints = historyByDriver.points;
      }
      setTripLocationPoints(
        effectivePoints.map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          recorded_at: p.recorded_at,
        })),
      );
    } catch {
      // History fetch failed silently — latest ping still available
    }
  }, [trip?.id, effectiveDriverIdForLocation]);

  const fetchDriverLocationFromDb = useCallback(async () => {
    await fetchLatestDriverLocationFromDb();
    if (locationHistoryEnabled) {
      await fetchLocationHistoryFromDb();
    }
  }, [
    fetchLatestDriverLocationFromDb,
    fetchLocationHistoryFromDb,
    locationHistoryEnabled,
  ]);

  const ensureLocationHistory = useCallback(() => {
    setLocationHistoryEnabled(true);
  }, []);

  const handleRefresh = useCallback(() => {
    isRefreshingRef.current = true;
    setRefreshing(true);
    setFinanceRefreshKey((k) => k + 1);
    refetchTransactionsRef.current();
    loadTripDocuments();
    if (bundleActive && tripId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) });
    } else {
      load();
      loadAdjustments();
      loadAssignmentAudit();
    }
  }, [load, loadAdjustments, loadAssignmentAudit, loadTripDocuments, tripId, queryClient, bundleActive]);


  /** Immediate refresh after assignment/reassignment actions. */
  const handleAssignmentUpdated = useCallback(() => {
    setFinanceRefreshKey((k) => k + 1);
    refetchTransactionsRef.current();
    if (bundleActive && tripId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) });
    } else {
      load();
      loadAssignmentAudit();
      loadAdjustments();
      loadTripDocuments();
      loadTripOtp();
    }
  }, [load, loadAssignmentAudit, loadAdjustments, loadTripDocuments, loadTripOtp, tripId, queryClient, bundleActive]);


  // ── Entry modal ───────────────────────────────────────────────────────────
  const openAddEntry = useCallback(() => {
    if (!trip?.id || !canAddFinanceEntry) return;
    openTripLedgerEntryChooser({
      trip,
      router,
      displayClientName: displayClientName ?? null,
      clientIdFromContext: clientIdFromContext ?? null,
      clientNameFromContext: clientNameFromContext ?? null,
      partnerName: resolvedPartnerName ?? partnerName ?? null,
      driverDisplayName: driverName,
      labels: {
        addTransaction: t("addEntry"),
      },
    });
  }, [
    trip,
    canAddFinanceEntry,
    router,
    clientIdFromContext,
    clientNameFromContext,
    resolvedPartnerName,
    partnerName,
    displayClientName,
    driverName,
    t,
  ]);

  /** Cash OUT / trip expense — same query shape as TripLedgerDetailScreen.onAddExpense. */
  const openAddExpense = useCallback(() => {
    if (!trip?.id || !canAddFinanceEntry) return;
    const tripNumber = getTripDisplayNumber(trip);
    const params = new URLSearchParams({
      tripId: trip.id,
      tripNumber,
      defaultType: "out",
    });

    const sales = Number(trip.client_price ?? 0);
    const received = tripLedgerEntries.reduce(
      (s, tx) => s + Number(tx.amount_in ?? 0),
      0,
    );
    const pendingAmt = Math.max(0, sales - received);

    const supplierCost = Number(trip.supplier_rate ?? 0);
    const paidOut = tripLedgerEntries.reduce(
      (s, tx) => s + Number(tx.amount_out ?? 0),
      0,
    );
    const supplierDueAmt = Math.max(0, supplierCost - paidOut);

    if (pendingAmt > 0) params.set("dueAmountIn", String(pendingAmt));
    if (supplierDueAmt > 0) params.set("dueAmountOut", String(supplierDueAmt));

    if (entryContext === "supplier" && trip.supplier_id) {
      params.set("partyContext", "suppliers");
      params.set("partyId", trip.supplier_id);
      const supplierLabel = resolvedPartnerName ?? partnerName;
      if (supplierLabel) params.set("partyName", supplierLabel);
    } else if (entryContext === "client" && (clientIdFromContext ?? trip.client_id)) {
      params.set("partyContext", "customers");
      params.set("partyId", clientIdFromContext ?? trip.client_id ?? "");
      const name = clientNameFromContext ?? displayClientName ?? trip.client_name ?? "";
      if (name) params.set("partyName", name);
    } else if (entryContext === "vehicle" && trip.vehicle_id) {
      params.set("entityType", "VEHICLE");
      params.set("entityId", trip.vehicle_id);
    }

    router.push(`/(modals)/ledger-sync?${params.toString()}`);
  }, [
    trip,
    canAddFinanceEntry,
    tripLedgerEntries,
    entryContext,
    resolvedPartnerName,
    partnerName,
    clientIdFromContext,
    clientNameFromContext,
    displayClientName,
    router,
  ]);

  const handleRecordDriverPayment = useCallback(() => {
    if (!trip?.id || !trip.driver_id || !canAddFinanceEntry) return;
    const tripNumber = getTripDisplayNumber(trip);
    const params = new URLSearchParams({
      tripId: trip.id,
      tripNumber,
      defaultType: "out",
      partyContext: "drivers",
      partyId: trip.driver_id,
      partyName: driverName ?? t("driver"),
    });
    router.push(`/(modals)/ledger-sync?${params.toString()}`);
  }, [trip, canAddFinanceEntry, driverName, router, t]);

  const closeTripAdjustmentModal = useCallback(() => {
    setShowAdjustmentModal(false);
    setAdjustmentModalPreset(null);
  }, []);

  const openTripAdjustmentModal = useCallback(
    (
      preset: {
        type?: TripAdjustmentType;
        impact?: TripAdjustmentImpact;
        reasonSeed?: string | null;
      } | null = null,
    ) => {
      // Single chokepoint for every adjustment entry point (add / income /
      // deduction / supplier cost) — a member without the surface can't open it.
      if (!canVoidAdjustments) return;
      setAdjustmentModalPreset(preset);
      setShowAdjustmentModal(true);
    },
    [canVoidAdjustments],
  );

  // ── Adjustment handlers ───────────────────────────────────────────────────
  const handleAddAdjustment = useCallback(() => {
    openTripAdjustmentModal(null);
  }, [openTripAdjustmentModal]);

  /** Maps to Finance Overview “Additional Income” (revenue + addition). */
  const openClientIncomeAdjustment = useCallback(() => {
    openTripAdjustmentModal({ type: "revenue", impact: "plus" });
  }, [openTripAdjustmentModal]);

  /** Maps to Finance Overview “Deductions” (revenue + deduction). */
  const openClientDeductionAdjustment = useCallback(() => {
    openTripAdjustmentModal({ type: "revenue", impact: "minus" });
  }, [openTripAdjustmentModal]);

  /** Supplier cost increases (cost + addition). */
  const openSupplierCostAdditionAdjustment = useCallback(() => {
    openTripAdjustmentModal({ type: "cost", impact: "plus" });
  }, [openTripAdjustmentModal]);

  /** Supplier cost reductions (credit to cost). */
  const openSupplierCostReductionAdjustment = useCallback(() => {
    openTripAdjustmentModal({ type: "cost", impact: "minus" });
  }, [openTripAdjustmentModal]);

  const handleSaveAdjustment = useCallback(
    async (params: {
      type: "revenue" | "cost";
      impact: "plus" | "minus";
      amount: number;
      reason: string;
    }) => {
      if (!trip?.id) return;
      /**
       * The row is stamped with the org that OWNS the adjustment, and RLS on
       * trip_finance_adjustments is `is_org_member(organization_id)`. Preferring
       * the trip owner broke the partner case: a carrier adding a CN/DN on the
       * shipper's trip stamped the shipper's org, failed the membership check,
       * and addTripAdjustment silently fell back to AsyncStorage — so the line
       * appeared in the UI and vanished on reload.
       *
       * Use the viewer's own org whenever they are not a member of the trip
       * owner's org. Each side then owns its own adjustment lines, which is also
       * what the Shared Ledger's You-vs-They split expects.
       */
      const tripOwnerOrgId = trip.organization_id?.trim() || null;
      const viewerOrgId = currentOrganization?.id?.trim() || null;
      const viewerOwnsTrip =
        !!tripOwnerOrgId && !!viewerOrgId && tripOwnerOrgId === viewerOrgId;
      const orgId = viewerOwnsTrip
        ? tripOwnerOrgId
        : (viewerOrgId ?? tripOwnerOrgId);
      const missionRaw = getTripOperationalDisplay({
        trip_operational_code: trip.trip_operational_code ?? null,
        trip_code: trip.trip_code ?? null,
        display_trip_id: trip["display_trip_id"] ?? null,
        trip_number: trip["trip_number"] ?? null,
      });
      await addTripAdjustment(
        trip.id,
        params,
        orgId
          ? { organizationId: orgId, missionKey: missionRaw === "—" ? null : missionRaw }
          : undefined,
      );
      await loadAdjustments();
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.tripFinanceAdjustmentsRoot],
      });
    },
    [trip, currentOrganization?.id, loadAdjustments, queryClient],
  );

  const handleVoidAdjustment = useCallback(
    async (adjustmentId: string, voidReason: string) => {
      if (!trip?.id) return;
      const r = String(voidReason ?? "").trim();
      if (!r) return;
      await voidTripAdjustment(trip.id, adjustmentId, r);
      await loadAdjustments();
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.tripFinanceAdjustmentsRoot],
      });
    },
    [trip?.id, loadAdjustments, queryClient],
  );

  const handleUpdateAdjustment = useCallback(
    async (
      adjustmentId: string,
      params: {
        type: TripAdjustmentType;
        impact: TripAdjustmentImpact;
        amount: number;
        reason: string;
      },
    ) => {
      if (!trip?.id) return;
      await updateTripAdjustment(trip.id, adjustmentId, params);
      await loadAdjustments();
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.tripFinanceAdjustmentsRoot],
      });
    },
    [trip?.id, loadAdjustments, queryClient],
  );

  // ── Timeline expand ───────────────────────────────────────────────────────
  const toggleTimelineItemExpanded = useCallback((id: string) => {
    setExpandedTimelineEntryIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);


  // ── Effects ───────────────────────────────────────────────────────────────

  // Phase 3b: seed all state from bundle on initial mount and on bundle cache refresh.
  // Individual load effects below are guarded by bundleActive so they do not
  // fire their own DB calls when the bundle path is active.
  useEffect(() => {
    if (!bundle) return;
    bundleSeededRef.current = true;

    setTrip(bundle.trip as unknown as TripRow);
    setLoading(false);
    setError(null);
    loadCompletedForIdRef.current = bundle.trip.id;
    // Drop the list/award seed after authoritative hydration so it cannot
    // outlive this trip id. Do not write the seed into the bundle cache.
    clearInitialTripForDetail(bundle.trip.id);
    initialLoadDoneRef.current = true;

    const auditRows = Array.isArray(bundle.assignment_audit)
      ? bundle.assignment_audit
      : [];
    const sorted = [...auditRows].sort(
      (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime(),
    );
    setAssignmentAuditRows(sorted as unknown as TripAssignmentAuditRow[]);

    const driverNames: Record<string, string> = {};
    const vehicleLabels: Record<string, string> = {};
    for (const aa of auditRows) {
      if (aa.driver_id_new && aa.driver_new_name) driverNames[aa.driver_id_new] = aa.driver_new_name;
      if (aa.driver_id_prev && aa.driver_prev_name) driverNames[aa.driver_id_prev] = aa.driver_prev_name;
      if (aa.vehicle_id_new && aa.vehicle_new_label) vehicleLabels[aa.vehicle_id_new] = aa.vehicle_new_label;
      if (aa.vehicle_id_prev && aa.vehicle_prev_label) vehicleLabels[aa.vehicle_id_prev] = aa.vehicle_prev_label;
    }
    setAssignmentDriverNames(driverNames);
    setAssignmentVehicleLabels(vehicleLabels);

    setAdjustments(
      (Array.isArray(bundle.adjustments)
        ? bundle.adjustments
        : []) as unknown as TripAdjustment[],
    );
    if (!documentsViewerActiveRef.current) {
      setTripDocuments(tripDocumentsFromBundle(bundle.documents));
    }

    if (bundle.otp) {
      setTripOtp({ code: bundle.otp.code, expires_at: bundle.otp.expires_at });
    }
    if (bundle.latest_driver_location) {
      setDriverLocation(bundle.latest_driver_location);
    }
    if (bundle.driver) {
      const d = bundle.driver;
      setDriverName((d.name || d.phone || '').trim() || (bundle.trip as unknown as TripRow).driver_display_name || null);
      setDriverPhone((d.phone ?? "").trim() || null);
      setDriverLinked(!!d.user_id);
    }
    if (bundle.vehicle) {
      const v = bundle.vehicle;
      setVehicleLabel([v.vehicle_number, v.vehicle_type].filter(Boolean).join(' · '));
      const baseDocs = (v.documents ?? null) as unknown as VehicleDocuments | null;
      setVehicleDocs(baseDocs);
      // Trip "Save to vault" may persist via entity_documents when vehicles.documents
      // RLS blocks cross-org writes. Merge those back so docs survive navigation.
      const tripRow = bundle.trip as unknown as TripRow;
      const vehicleId = tripRow.vehicle_id ?? (typeof v.id === "string" ? v.id : null);
      const viewerOrgId =
        currentOrganization?.id ?? tripRow.organization_id ?? null;
      if (vehicleId && viewerOrgId) {
        const tripIdForMerge = tripRow.id;
        void mergeEntityDocumentsIntoVehicleVault(vehicleId, viewerOrgId, baseDocs).then(
          (merged) => {
            if (merged) setVehicleDocs(merged);
          },
        );
        void getVehicleForTripViewer(vehicleId, tripIdForMerge, viewerOrgId).then(
          async (viewer) => {
            if (!viewer.vehicle) return;
            const fromViewer = (viewer.vehicle.documents ?? null) as VehicleDocuments | null;
            const merged = await mergeEntityDocumentsIntoVehicleVault(
              vehicleId,
              viewerOrgId,
              fromViewer ?? baseDocs,
            );
            if (merged) setVehicleDocs(merged);
          },
        );
      }
    } else {
      const tripRow = bundle.trip as unknown as TripRow;
      const vehicleId = tripRow.vehicle_id ?? null;
      const viewerOrgId =
        currentOrganization?.id ?? tripRow.organization_id ?? null;
      if (vehicleId && viewerOrgId) {
        void mergeEntityDocumentsIntoVehicleVault(vehicleId, viewerOrgId, null).then(
          (merged) => {
            if (merged) setVehicleDocs(merged);
          },
        );
      }
    }

    const tripRow = bundle.trip as unknown as TripRow;
    if (bundle.client_detail?.client) {
      const c = bundle.client_detail.client;
      const linkedId = nStr(c.linked_organization_id);
      setClientPartyRes({
        name: pickClientDisplayName(c),
        integrated: !!linkedId,
        orgId: linkedId,
      });
    } else {
      const fromTrip = nStr(tripRow.client_name);
      setClientPartyRes(
        fromTrip ? { name: fromTrip, integrated: false, orgId: null } : null,
      );
    }

    if (bundle.supplier_detail?.supplier) {
      const s = bundle.supplier_detail.supplier;
      const linkedId = nStr(s.linked_organization_id);
      const linkedOrgName = nStr(
        (bundle.supplier_detail.linked_org as { name?: string | null } | null)
          ?.name,
      );
      // Bundle historically shipped company_name only; prefer canonical `name`
      // when present, then linked org name (Ajio logo without label case).
      const supplierName =
        pickSupplierDisplayName({
          company_name: s.company_name,
          name: (s as { name?: string | null }).name,
        }) ??
        linkedOrgName ??
        nStr(tripRow.supplier_name);
      setPartnerName(supplierName);
      setSupplierPartyRes({
        name: supplierName,
        integrated: !!linkedId,
        orgId: linkedId,
      });
      if (linkedOrgName || bundle.supplier_detail.linked_org?.logo_url) {
        setSupplierPartyAvatarFields((prev) => ({
          ...(prev ?? emptyTripPartyAvatarFields()),
          organizationImageUrl:
            nStr(bundle.supplier_detail?.linked_org?.logo_url) ??
            prev?.organizationImageUrl ??
            null,
          organizationName: linkedOrgName ?? prev?.organizationName ?? null,
        }));
      }
    } else {
      const fallbackSupplierName = nStr(tripRow.supplier_name);
      setPartnerName(fallbackSupplierName);
      setSupplierPartyRes(
        fallbackSupplierName
          ? { name: fallbackSupplierName, integrated: false, orgId: null }
          : null,
      );
    }
  }, [bundle, currentOrganization?.id]);

  // List/award TripRow seed + trip-id switch: apply before paint so we never
  // show the previous trip. Cached bundle wins over the partial list seed.
  useLayoutEffect(() => {
    if (!tripId) {
      bundleSeededRef.current = false;
      setTrip(null);
      setLoading(true);
      return;
    }

    const switchingAway = tripRef.current != null && tripRef.current.id !== tripId;
    if (switchingAway) {
      bundleSeededRef.current = false;
    }

    const next = peekTripDetailFirstPaint(tripId, queryClient);
    if (next?.id === tripId) {
      const cachedBundle = peekTripDetailBundleCache(queryClient, tripId);
      const hasAuthoritativeBundle = cachedBundle?.trip?.id === tripId;
      setTrip((prev) => {
        if (prev?.id === tripId && (bundleSeededRef.current || hasAuthoritativeBundle)) {
          return prev;
        }
        if (prev?.id === tripId) return prev;
        return next;
      });
      if (switchingAway) {
        const paint = tripRowListPaintFields(next);
        setDriverName(paint.driverName);
        setVehicleLabel(paint.vehicleLabel);
        setDriverPhone(null);
        setDriverAvatarUri(null);
        setPartnerName(String(next.supplier_name ?? "").trim() || null);
        setClientPartyRes(null);
        setSupplierPartyRes(null);
      } else if (!bundleSeededRef.current && !hasAuthoritativeBundle) {
        const paint = tripRowListPaintFields(next);
        setDriverName(paint.driverName);
        setVehicleLabel(paint.vehicleLabel);
      }
      setError(null);
      setLoading(false);
      loadCompletedForIdRef.current = tripId;
      return;
    }

    if (switchingAway || tripRef.current?.id !== tripId) {
      bundleSeededRef.current = false;
      setTrip(null);
      setDriverName(null);
      setVehicleLabel(null);
      setDriverPhone(null);
      setDriverAvatarUri(null);
      setPartnerName(null);
      setClientPartyRes(null);
      setSupplierPartyRes(null);
      setError(null);
      setLoading(true);
    }
  }, [tripId, queryClient]);

  // Seed the trip row even when the bundle RPC is slow or failing.
  useEffect(() => {
    if (bundle?.trip?.id === tripId) return;
    load();
  }, [load, bundle?.trip?.id, tripId]);

  // Supplier retry when org becomes available — skipped on bundle path
  useEffect(() => {
    if (bundleActive) return;
    if (!tripId || !currentOrganization?.id || trip !== null || loading) return;
    if (supplierRetryForTripIdRef.current === tripId) return;
    supplierRetryForTripIdRef.current = tripId;
    setLoading(true);
    load();
  }, [tripId, currentOrganization?.id, trip, loading, load, bundleActive]);

  // Adjustments + audit on mount — skipped on bundle path (bundle seeding effect provides both)
  useEffect(() => {
    if (bundleActive) return;
    if (tripId) loadAdjustments();
  }, [tripId, loadAdjustments, bundleActive]);
  useEffect(() => {
    if (bundleActive) return;
    if (tripId) loadAssignmentAudit();
  }, [tripId, loadAssignmentAudit, bundleActive]);

  // Legacy path: one table-only document list. Bundle path seeds from RPC.
  // OCR + Storage fallback wait until Documents/POD viewer (ensureTripDocumentsForViewer).
  useEffect(() => {
    documentsViewerActiveRef.current = false;
    setLocationHistoryEnabled(false);
    skippedBundleMountLocationReadForTripRef.current = null;
  }, [tripId]);

  useEffect(() => {
    if (bundleActive) return;
    if (trip?.id) loadTripDocuments();
    else setTripDocuments([]);
  }, [trip?.id, loadTripDocuments, bundleActive]);

  useEffect(() => {
    if (!selectedDoc) return;
    if (documentsViewerActiveRef.current) return;
    void ensureTripDocumentsForViewer();
  }, [selectedDoc, ensureTripDocumentsForViewer]);

  useEffect(() => {
    if (!selectedDoc) {
      podModalRefetchDoneRef.current = false;
    }
  }, [selectedDoc]);

  useEffect(() => {
    if (!selectedDoc) {
      setDocPreviewUrl(null);
      setDocPreviewLoading(false);
      setDocPreviewError(false);
      setVehiclePreviewUrls({});
      setVehiclePreviewIndex(0);
      return;
    }
    if (isGalleryPreviewDoc) return;
    if (!docPreviewStoragePath) {
      // Clear any previously-resolved preview before bailing -- otherwise
      // the modal header (bound to selectedDoc.label) updates to the new
      // doc immediately while the image body keeps showing whichever
      // document was previously loaded.
      setDocPreviewUrl(null);
      setDocPreviewLoading(false);
      setDocPreviewError(false);
      return;
    }
    let isActive = true;
    setDocPreviewLoading(true);
    setDocPreviewUrl(null);
    setDocPreviewError(false);
    const matchingTripDoc = tripDocuments.find((d) => d.storage_path === docPreviewStoragePath);
    const urlPromise =
      selectedDoc.docSource === "vehicle"
        ? getVehicleDocumentViewUrl(docPreviewStoragePath)
        : resolveTripDocumentPreviewUrl({
            storagePath: docPreviewStoragePath,
            sourceEntityDocumentId: matchingTripDoc?.source_entity_document_id,
            organizationId: trip?.organization_id,
          }).then((url) => url ?? "");
    urlPromise
      .then((url) => {
        if (isActive) {
          setDocPreviewUrl(url);
          setDocPreviewLoading(false);
        }
      })
      .catch(() => {
        if (isActive) {
          setDocPreviewError(true);
          setDocPreviewLoading(false);
        }
      });
    return () => {
      isActive = false;
    };
  }, [selectedDoc, docPreviewStoragePath, isGalleryPreviewDoc, tripDocuments, trip?.organization_id]);

  const galleryPreviewDocs = useMemo(() => {
    if (!selectedDoc || !isGalleryPreviewDoc) return [];
    if (isVehicleGalleryDoc) {
      return vehiclePreviewDocs.filter((doc) => !!doc.storagePath);
    }
    return (selectedDoc.files ?? [])
      .filter((file) => !!file.storagePath)
      .map((file) => ({
        id: file.id,
        storagePath: file.storagePath,
      }));
  }, [selectedDoc, isGalleryPreviewDoc, isVehicleGalleryDoc, vehiclePreviewDocs]);

  const galleryStorageKey = useMemo(
    () =>
      galleryPreviewDocs
        .map((doc) => `${doc.id}:${doc.storagePath}`)
        .join("|"),
    [galleryPreviewDocs],
  );

  useEffect(() => {
    if (!selectedDoc || !isGalleryPreviewDoc) return;

    const galleryDocs = galleryPreviewDocs;

    setVehiclePreviewIndex(0);
    setDocPreviewUrl(null);
    setDocPreviewError(false);
    setVehiclePreviewUrls({});

    if (galleryDocs.length === 0) {
      setDocPreviewLoading(false);
      return;
    }

    let isActive = true;
    setDocPreviewLoading(true);

    const signGallery = isVehicleGalleryDoc
      ? getVehicleDocumentViewUrls(
          galleryDocs.map((doc) => doc.storagePath!),
        )
      : tripDocumentsService.getDocumentViewUrls(
          galleryDocs.map((doc) => doc.storagePath!),
        );

    void signGallery
      .then((byPath) => {
        if (!isActive) return;
        const next: Record<string, string | null> = {};
        for (const doc of galleryDocs) {
          next[doc.id] = byPath[doc.storagePath!] ?? null;
        }
        setVehiclePreviewUrls(next);
        setDocPreviewLoading(false);
      })
      .catch(() => {
        if (!isActive) return;
        setDocPreviewError(true);
        setDocPreviewLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [galleryStorageKey, isGalleryPreviewDoc, isVehicleGalleryDoc, galleryPreviewDocs]);

  useEffect(() => {
    if (!selectedDoc) {
      return;
    }
    if (!selectedDoc.id.startsWith("pod") || docPreviewStoragePath || !tripId) return;
    if (podModalRefetchDoneRef.current) return;
    podModalRefetchDoneRef.current = true;
    void loadTripDocuments({ forViewer: true });
  }, [selectedDoc, docPreviewStoragePath, tripId, loadTripDocuments]);

  // OTP — skipped on bundle path (bundle seeding effect provides otp or null)
  useEffect(() => {
    if (bundleActive) return;
    if (trip?.id && (isAggregateTrip(trip) || (!!trip.driver_id && !driverLinked))) {
      loadTripOtp();
    } else {
      setTripOtp(null);
    }
  }, [trip?.id, trip?.supplier_id, trip?.driver_id, driverLinked, loadTripOtp, bundleActive]);

  // Latest ping only on the legacy path. Bundle already supplies latest_driver_location.
  useEffect(() => {
    if (!driverMapDataEnabled) {
      setDriverLocation(null);
      setTripLocationPoints([]);
      setDriverLocationLoading(false);
      return;
    }
    if (bundleActive) return;
    void fetchLatestDriverLocationFromDb();
  }, [
    driverMapDataEnabled,
    trip?.id,
    effectiveDriverIdForLocation,
    fetchLatestDriverLocationFromDb,
    bundleActive,
  ]);

  useEffect(() => {
    if (showTrackingModal || showFullScreenMap || tripDetailTab === "tracking") {
      setLocationHistoryEnabled(true);
    }
  }, [showTrackingModal, showFullScreenMap, tripDetailTab]);

  useEffect(() => {
    if (!locationHistoryEnabled || !trip?.id || !driverMapDataEnabled) return;
    void fetchLocationHistoryFromDb();
  }, [
    locationHistoryEnabled,
    trip?.id,
    driverMapDataEnabled,
    fetchLocationHistoryFromDb,
  ]);

  // Live tracking seed/trail: TanStack Query key is [tripId, driverId] — driver change refetches once, no per-render loop.

  // Phase 3c: on trip status/update events, fetch latest location only — history unchanged by status transitions.
  // Bundle mount already seeds latest_driver_location; skip that first read. Keep later
  // fetches because Realtime trip UPDATE merges the trip row without refreshing bundle location.
  useEffect(() => {
    if (!trip?.id || !effectiveDriverIdForLocation) return;
    if (bundleActive) {
      if (skippedBundleMountLocationReadForTripRef.current !== trip.id) {
        skippedBundleMountLocationReadForTripRef.current = trip.id;
        return;
      }
    }
    void driverLocationService.getLatestDriverLocationForTripOrDriver(trip.id, effectiveDriverIdForLocation)
      .then(res => { if (!res.error && res.location) setDriverLocation(res.location); });
  }, [trip?.updated_at, trip?.status, effectiveDriverIdForLocation, trip?.id, bundleActive]);

  useTrackingTripBroadcast({
    tripId: trip?.id ?? null,
    enabled: trackingBroadcastEnabled,
    // Only the ISO timestamp escapes into React — coordinates go exclusively to TripTrackingMapStore.
    onTimestamp: (ts) => {
      lastBroadcastTimestampRef.current = ts;
    },
    onReseed: () => {
      liveTracking.reseed();
    },
  });

  // Flush broadcast timestamp ref → React state at 1s cadence (drives "Updated X min ago" label).
  useEffect(() => {
    if (!trackingBroadcastEnabled) return;
    const id = globalThis.setInterval(() => {
      const ts = lastBroadcastTimestampRef.current;
      if (ts) setLastSeenAt(ts);
    }, 1000);
    return () => globalThis.clearInterval(id);
  }, [trackingBroadcastEnabled]);

  // Geocode live position from store (broadcast path) — no driverLocation state dependency.
  useEffect(() => {
    if (!trackingBroadcastEnabled || !trip?.id) return;
    const store = getTripTrackingMapStore(trip.id);
    const unsub = store.subscribe((point) => {
      if (!point) return;
      const roundedLat = Math.round(point.latitude * 1000) / 1000;
      const roundedLng = Math.round(point.longitude * 1000) / 1000;
      const last = lastGeocodedLocRef.current;
      if (last && last.lat === roundedLat && last.lng === roundedLng) return;
      lastGeocodedLocRef.current = { lat: roundedLat, lng: roundedLng };
      void resolveMapLocationLabel(point.latitude, point.longitude, { mode: 'full' }).then((label) => {
        setDriverLocationAddress(label);
      });
    });
    return unsub;
  }, [trackingBroadcastEnabled, trip?.id]);

  /**
   * Legacy WAL path — disabled when EXPO_PUBLIC_TRACKING_BROADCAST_V1=1.
   * Preserved for rollout; removes postgres_changes fanout at scale.
   */
  useRealtimeDriverLocations(
    trackingBroadcastEnabled ? null : trip?.id ?? null,
    trackingBroadcastEnabled ? null : effectiveDriverIdForLocation,
    (payload) => {
      if (payload.eventType !== "INSERT" || !payload.new) return;
      const raw = payload.new as Record<string, unknown>;
      const locId = raw.id as string | undefined;
      if (!locId || locId === lastSeenLocationIdRef.current) return;
      lastSeenLocationIdRef.current = locId;
      const loc: driverLocationService.DriverLocationRow = {
        latitude: raw.latitude as number,
        longitude: raw.longitude as number,
        accuracy: (raw.accuracy as number | null) ?? null,
        recorded_at: raw.recorded_at as string,
      };
      setDriverLocation(loc);
      setTripLocationPoints((prev) => [
        ...prev,
        {
          latitude: loc.latitude,
          longitude: loc.longitude,
          recorded_at: loc.recorded_at,
        },
      ]);
    },
  );

  /**
   * Phase 3c: fallback poll fetches latest location only (not history).
   * History loads when map/tracking UI is opened.
   * Disabled when broadcast is active — broadcast updates arrive at 30s cadence.
   */
  useEffect(() => {
    if (!driverMapDataEnabled || tripCompleted) return;
    const id = globalThis.setInterval(() => {
      void fetchLatestDriverLocationFromDb();
    }, 60_000);
    return () => globalThis.clearInterval(id);
  }, [driverMapDataEnabled, tripCompleted, fetchLatestDriverLocationFromDb]);

  // Mover_asset: fetch how much the aggregator has paid on the linked load, so
  // the mover's receivable shows "<client> marked paid ₹X" instead of nothing.
  useEffect(() => {
    const tid = trip?.id;
    if (!tid || String(trip?.source ?? "") !== "mover_asset") {
      setMoverClientPaid(0);
      return;
    }
    let cancelled = false;
    getMoverAssetClientPaid(tid)
      .then((res) => {
        if (!cancelled) setMoverClientPaid(res.paid);
      })
      .catch(() => {
        if (!cancelled) setMoverClientPaid(0);
      });
    return () => {
      cancelled = true;
    };
  }, [trip?.id, trip?.source]);

  // Driver location — Mapbox/Nominatim label (no raw lat/lon in UI).
  // When broadcast is active, the store subscriber above handles geocoding instead.
  useEffect(() => {
    if (trackingBroadcastEnabled) return;
    if (!driverLocation) {
      setDriverLocationAddress(null);
      return;
    }
    // Only re-geocode when position moves > ~100m (3 decimal degrees ≈ 111m).
    const roundedLat = Math.round(driverLocation.latitude * 1000) / 1000;
    const roundedLng = Math.round(driverLocation.longitude * 1000) / 1000;
    const last = lastGeocodedLocRef.current;
    if (last && last.lat === roundedLat && last.lng === roundedLng) return;
    lastGeocodedLocRef.current = { lat: roundedLat, lng: roundedLng };
    let isActive = true;
    void resolveMapLocationLabel(
      driverLocation.latitude,
      driverLocation.longitude,
      { mode: "full" },
    ).then((label) => {
      if (!isActive) return;
      setDriverLocationAddress(label);
    });
    return () => {
      isActive = false;
    };
  }, [driverLocation?.latitude, driverLocation?.longitude, trackingBroadcastEnabled]);

  // Past location labels (last 2 checkpoints) for map stage markers
  useEffect(() => {
    const past = liveTracking.trail.slice(-2).reverse();
    setPastLocationAddresses([null, null]);
    if (past.length === 0) return;
    let isActive = true;
    past.forEach((pt, i) => {
      void resolveMapLocationLabel(pt.latitude, pt.longitude, { mode: "city" }).then(
        (label) => {
          if (!isActive) return;
          setPastLocationAddresses((prev) => {
            const next: [string | null, string | null] = [...prev];
            next[i] = label;
            return next;
          });
        },
      );
    });
    return () => {
      isActive = false;
    };
  }, [liveTracking.trail]);

  // Location trail — batch reverse geocode (up to 10 recent checkpoints)
  useEffect(() => {
    type TrailRow = { latitude: number; longitude: number; recorded_at: string; locationName: string | null };
    setLocationTrailWithNames(
      liveTracking.trail.map((p) => ({ ...p, locationName: null })),
    );
    if (liveTracking.trail.length === 0) return;
    let isActive = true;
    void resolveMapLocationLabelsBatch(liveTracking.trail, {
      maxResolve: TRACKING_LOCATION_GEOCODE_MAX,
      mode: "full",
      onProgress: (resolved) => {
        if (isActive) setLocationTrailWithNames(resolved as TrailRow[]);
      },
    }).then((resolved) => {
      if (isActive) setLocationTrailWithNames(resolved as TrailRow[]);
    });
    return () => {
      isActive = false;
    };
  }, [liveTracking.trail]);

  // Clear "waiting for new driver" when presence arrives for the assigned driver.
  useEffect(() => {
    if (!waitingForNewDriverLocation) return;
    const driverId = trip?.driver_id;
    const seed = liveTracking.seedPoint;
    if (
      driverId &&
      seed &&
      seed.driver_id === driverId &&
      seed.trip_id === trip?.id
    ) {
      setWaitingForNewDriverLocation(false);
    }
  }, [
    waitingForNewDriverLocation,
    trip?.driver_id,
    trip?.id,
    liveTracking.seedPoint,
  ]);

  useEffect(() => {
    if (!waitingForNewDriverLocation) return;
    const t = setTimeout(() => setWaitingForNewDriverLocation(false), 60_000);
    return () => clearTimeout(t);
  }, [waitingForNewDriverLocation]);

  /**
   * After reassign: refresh trip row, assignment audit, finance labels, documents, adjustments, OTP.
   * Reseed is driven by effectiveDriverIdForLocation effect — not called directly here
   * to avoid stale driver_id on seed.
   *
   * Intentionally excluded vs handleAssignmentUpdated:
   * - refetchTransactionsRef — ledger transaction list unchanged by driver/vehicle swap alone
   * - no duplicate audit pipeline beyond loadAssignmentAudit()
   */
  const handleReassignCompleted = useCallback(
    async (meta?: { driverIdChanged?: boolean }) => {
      if (!bundleActive) {
        await load();
        loadAssignmentAudit();
        loadAdjustments();
        loadTripDocuments();
        loadTripOtp();
      }
      setFinanceRefreshKey((k) => k + 1);
      if (meta?.driverIdChanged) {
        setWaitingForNewDriverLocation(true);
      }
      if (bundleActive && tripId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.bundle(tripId) });
      }
    },
    [
      load,
      loadAssignmentAudit,
      loadAdjustments,
      loadTripDocuments,
      loadTripOtp,
      bundleActive,
      tripId,
      queryClient,
    ],
  );

  return {
    // Data
    trip,
    loading,
    error,
    refreshing,
    tripCompleted,
    isAggregate,

    // People
    driverName,
    driverPhone,
    driverAvatarUri,
    vehicleLabel,
    vehicleDocs,
    displayVehicleFromInput,
    setDisplayVehicleFromInput,
    driverLinked,
    partnerName: resolvedPartnerName ?? partnerName,
    clientAvatarUri,
    supplierAvatarUri,
    clientPartyAvatarFields,
    supplierPartyAvatarFields,
    partnerOrgId,
    clientPartyRes,
    supplierPartyRes,
    displayClientName,

    // Finance
    tripLedgerEntries,
    tripLedgerEntriesLoading,
    tripLedgerEntriesError,
    adjustments,
    subcontractRate,
    moverClientPaid,
    paidToDriver,
    financeRefreshKey,

    // Assignment
    assignmentAuditRows,
    assignmentDriverNames,
    assignmentVehicleLabels,
    tripOtp,
    canAssign,
    canViewDetail,
    canAddFinanceEntry,
    canVoidAdjustments,
    canViewTripExpenses,
    canApproveTripExpenses,
    showAssignByPhone,
    assignmentSource,
    previousDriverName,
    latestReassignmentSummary,
    driverActivityTimelineRows,

    // Tracking
    driverLocation,
    driverLocationLoading,
    tripLocationPoints,
    locationTrailWithNames,
    driverLocationAddress,
    trackingMapLocationLabels,
    trackingMapOriginCoordinate,
    trackingMapDestinationCoordinate,
    isDriverOffline,
    effectiveDriverIdForLocation,
    /** @deprecated Use useTrackingState(tripId, tripStatus).broadcastActive instead. */
    trackingActive: trackingBroadcastEnabled,
    trackingTrail: liveTracking.trail,
    lastSeenAt,
    requestDriverPing: driverPing.requestPing,
    /** @deprecated Use useTrackingState(tripId, tripStatus, overrides).isPinging instead. */
    isPingingDriver: driverPing.isPinging,
    /** @deprecated Use useTrackingState(tripId, tripStatus, overrides).lastPingRespondedAt instead. */
    lastPingRespondedAt: driverPing.lastPingRespondedAt,
    /** UI-only — do not pass through useTrackingState overrides. True for 3s after ping timeout. */
    isPingTimedOut: driverPing.pingTimedOut,
    waitingForNewDriverLocation,
    clearWaitingForNewDriverLocation: () => setWaitingForNewDriverLocation(false),

    // Documents
    tripDocuments,
    loadTripDocuments,
    ensureTripDocumentsForViewer,
    upsertTripDocument,
    computedTripDocs,
    vehiclePreviewDocs,
    vehiclePreviewUrls,
    vehiclePreviewIndex,
    setVehiclePreviewIndex,
    activeVehiclePreviewDoc,
    isVehicleGalleryDoc,
    isTripSlotGalleryDoc,
    isGalleryPreviewDoc,
    selectedDoc,
    setSelectedDoc,
    docPreviewUrl,
    setDocPreviewUrl,
    docPreviewLoading,
    setDocPreviewLoading,
    docPreviewError,
    setDocPreviewError,

    // Ratings
    driverRatingAvg,

    // UI state
    showAdjustmentModal,
    setShowAdjustmentModal,
    adjustmentModalPreset,
    closeTripAdjustmentModal,
    openClientIncomeAdjustment,
    openClientDeductionAdjustment,
    openSupplierCostAdditionAdjustment,
    openSupplierCostReductionAdjustment,
    openTripAdjustmentModal,
    showTrackingModal,
    setShowTrackingModal,
    showFullScreenMap,
    setShowFullScreenMap,
    showDriverRejectedModal,
    setShowDriverRejectedModal,
    tripDetailTab,
    setTripDetailTab,
    expandedTimelineEntryIds,
    toggleTimelineItemExpanded,

    // Actions
    load,
    handleRefresh,
    handleAssignmentUpdated,
    handleReassignCompleted,
    openAddEntry,
    openAddExpense,
    handleAddAdjustment,
    handleSaveAdjustment,
    handleVoidAdjustment,
    handleUpdateAdjustment,
    handleRecordDriverPayment,
    fetchDriverLocationFromDb,
    ensureLocationHistory,

    // Misc
    currentUserId,
    currentOrganization,
    profile,
    t,

    // Setters needed by child components that mutate shared state
    setTrip,
    setVehicleLabel,
    setDriverName,
    setDriverAvatarUri,
    setDriverLinked,
    setPartnerName,
    setPartnerOrgId,
    setClientPartyRes,
    setSupplierPartyRes,
    setVehiclePreviewUrls,
    setVehicleDocs,
    setDriverLocation,
    setDriverLocationLoading,
  };
}
