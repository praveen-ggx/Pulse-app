import { alertRegistryActionStyles } from "@/components/AlertRegistryCardActions";
import { LoadCardRouteRow } from "@/components/LoadCardRouteRow";
import { PartyAvatar } from "@/components/PartyAvatar";
import type { ClientRow } from "@/features/clients/services/clients.service";
import type { SupplierRow } from "@/features/suppliers/services/suppliers.service";
import { pickPartyOrganizationImageUrl } from "@/lib/partyAvatarDisplay";
import { useClientsQuery } from "@/lib/queries/useClientsQuery";
import { useSuppliersQuery } from "@/lib/queries/useSuppliersQuery";
import { useLinkedOrgProfileMap, type LinkedOrgDisplay } from "@/lib/useLinkedOrgProfileMap";
import { useMemberAccess } from "@/lib/useMemberAccess";
import { AdjustableSplitLayout } from "@/components/layout/AdjustableSplitLayout";
import { ThemedAlertModal } from "@/components/ThemedAlertModal";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import {
  deleteComplianceDocument,
  rejectDocument,
  updateEntityDocumentExpiry,
  verifyDocument,
} from "@/features/compliance/services/documents.service";
import { getSupplierBankAccount } from "@/features/suppliers/services/supplierVendorOnboarding.service";
import { resolveBankBranch } from "@/features/suppliers/utils/ifscDirectory.util";
import { subscribeSupplierBankChanged } from "@/features/suppliers/utils/supplierBankEvents.util";
import { ComplianceAdvanceCreditCard } from "@/features/tripCompliance/components/ComplianceAdvanceCreditCard";
import {
  ComplianceAdvancePaidDetails,
  type AdvanceUtrTarget,
} from "@/features/tripCompliance/components/ComplianceAdvancePaidDetails";
import { ComplianceAdvancePaymentArt } from "@/features/tripCompliance/components/ComplianceAdvancePaymentArt";
import { ComplianceDeclineModal } from "@/features/tripCompliance/components/ComplianceDeclineModal";
import { NoDocumentPreviewEmpty, NoTripsFoundEmpty } from "@/features/tripCompliance/components/ComplianceEmptyState";
import { ComplianceActivityLogButton } from "@/features/tripCompliance/components/ComplianceTripActivityLog";
import { ComplianceTripCard } from "@/features/tripCompliance/components/ComplianceTripCard";
import { hubMobileListCanvasStyles, HUB_MOBILE_LIST_CANVAS_BG } from "@/components/hub";
import { ComplianceExpiryDateModal } from "@/features/tripCompliance/components/ComplianceExpiryDateModal";
import {
  CompliancePaymentConfirmModal,
  type CompliancePaymentConfirmValues,
} from "@/features/tripCompliance/components/CompliancePaymentConfirmModal";
import { ComplianceRejectRemarkModal } from "@/features/tripCompliance/components/ComplianceRejectRemarkModal";
import { complianceActionButtonStyles } from "@/features/tripCompliance/utils/complianceActionButton.util";
import type { ComplianceListTripFacts } from "@/features/tripCompliance/hooks/useComplianceListTripFacts";
import {
  COMPLIANCE_QUEUE_WINDOW_SIZE,
  useComplianceListWindow,
} from "@/features/tripCompliance/hooks/useComplianceListWindow";
import {
  guessCompliancePreviewMime,
  invalidateCompliancePreviewCache,
  signCompliancePreviewUrl,
} from "@/features/tripCompliance/services/complianceDocumentView.service";
import type { ComplianceChange } from "@/features/tripCompliance/services/compliancePipelineSync.service";
import { tripAppearsInAwaitingPod } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import { setTripDocumentVerification, updateCompliancePaymentReference, updateCompliancePaymentTransactionDate } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import {
  COMPLIANCE_DRIVER_DOCUMENT_TYPES,
  COMPLIANCE_FINANCE_DOCUMENT_TYPES,
  COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
  REQUIRED_COMPLIANCE_DOCUMENT_TYPES,
  documentRequiresExpiry,
  type ComplianceStage,
  type ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  formatComplianceTimestamp,
  isComplianceVerifiedRejected,
  tripOpsStatusBadge,
  podDebitStatusVisual,
  verificationStatusVisual,
} from "@/features/tripCompliance/utils/complianceCardVisual.util";
import {
  deriveComplianceDocumentRows,
  deriveEntityComplianceRows,
  deriveFinanceDocumentRows,
  deriveTripVaultReviewRows,
  financeVaultDetailLine,
  retargetCompliancePreviewKey,
  labelForDocType,
  labelForFinanceDocType,
  mergeFinanceBankDocsFromSupplier,
  type ComplianceDocRow,
} from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import {
  compliancePreviewSourceForRow,
  compliancePreviewSourceForVaultFile,
  vaultChooserSourceForComplianceRow,
} from "@/features/tripCompliance/utils/compliancePreviewSource.util";
import { deriveComplianceQueueReadiness } from "@/features/tripCompliance/utils/complianceReadiness.util";
import {
  applyOptimisticDecision,
  canModerateComplianceRow,
  canShowSingleRowDecline,
  complianceDecisionButtonState,
  complianceGroupReviewState,
  complianceReviewDecisionActions,
  complianceRowDeclineReason,
  complianceTabMarkedApproved,
  recordOptimisticDecision,
  singleComplianceRowDeclineIds,
  type ComplianceGroupReviewState,
  type OptimisticComplianceDecision,
} from "@/features/tripCompliance/utils/complianceReviewActions.util";
import {
  complianceVaultDocNumbers,
  isActiveFinanceReject,
  isComplianceAwaitingResubmit,
  isComplianceDeclineActive,
  isComplianceHoldAwaitingResubmit,
  isFinanceDeclinedTrip,
  explainResubmitBlocked,
  isResubmitBlockedByMissingDocs,
  isResubmittedFinanceReject,
} from "@/features/tripCompliance/utils/complianceTableStatus.util";
import { HubTripLrUpdateModal } from "@/features/trips/components/HubTripLrUpdateModal";
import { parseLrFieldValues } from "@/features/trips/services/lrDocumentOcr.util";
import {
  groundOpsDocumentLockLabel,
  groundOpsDocumentLockReason,
  isOwnRecentUpload,
} from "@/features/tripCompliance/utils/groundOpsDocumentLock.util";
import { alertMessage, confirmAction } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import {
  COMPLIANCE_DECLINE_REASON_SECTIONS,
  FINANCE_FLAG_REASON_SECTIONS,
  complianceDeclineSectionsForScope,
  groupDeclinedReasonLines,
  mergeDeclinedDocumentReasons,
} from "@/features/tripCompliance/utils/complianceDeclineReason.util";
import type { DocumentAuditMilestoneRow } from "@/features/tripCompliance/utils/complianceCardActivity.util";
import {
  dedupeResubmitChangeItems,
  formatResubmitChangeItemLine,
  formatResubmitChangeLogBlock,
  mergeResubmitChangeLog,
  resubmitChangeLogFromAudits,
  resubmitChangeLogFromLiveDocs,
  type ResubmitChangeLog,
} from "@/features/tripCompliance/utils/complianceResubmitChangeLog.util";
import { fetchSupplierBankProofBundle } from "@/features/tripCompliance/utils/supplierBankProof.util";
import { classifyTripDocument, readTypedDetails } from "@/features/tripCompliance/utils/tripDocumentClassification.util";
import { ewayValidTillEnd } from "@/features/trips/services/ewayBillFields.util";
import { supabase } from "@/lib/supabase";

/** Stages whose bank card stays as it was (no beneficiary / branch, no live refresh). */
const PRE_VERIFIED_STAGES: ReadonlySet<ComplianceStage> = new Set(["pending_for_docs", "compliance_pending"]);
const supplierBankProofCache = new Map<
  string,
  {
    previewPath: string | null;
    detailLine: string | null;
    kycDocId: string | null;
    supplierId: string | null;
    status: string | null;
    fileName: string | null;
    createdAt: string | null;
    accountNumber: string | null;
    ifsc: string | null;
    bankName: string | null;
    beneficiaryName: string | null;
    branchName: string | null;
    onFile: boolean;
  }
>();

import { PodClientValidationPanel } from "@/features/debit-control/components/PodClientValidationPanel";
import {
  pickComplianceVaultFile,
  pickComplianceVaultFiles,
  uploadComplianceVaultFile,
} from "@/features/tripCompliance/services/complianceVaultUpload.service";
import {
  deleteTripDocument,
  uploadTripDocument,
  type TripDocumentRow,
  type TripDocumentType,
} from "@/features/trips/services/tripDocuments.service";
import { type HardCopyPodLrOption } from "@/features/trips/components/trip-detail/LogHardCopyPodModal";
import { ComplianceHardCopyPodSheet } from "@/features/tripCompliance/components/ComplianceHardCopyPodSheet";
import { PodVerificationPane } from "@/features/tripCompliance/components/PodVerificationPane";
import {
  formatDocumentHeaderFacts,
  formatInvoiceVaultNumberLabel,
  formatLrVaultNumberLabel,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { TripVaultFilePreview } from "@/features/trips/components/trip-detail/TripVaultFilePreview";
import { VaultCategoryPreviewModal } from "@/features/trips/components/trip-detail/VaultCategoryPreviewModal";
import type { VaultCategoryPreviewFile } from "@/features/trips/components/trip-detail/vaultCategoryPreview.types";
import {
  VaultChooserNotifyRow,
  type VaultChooserPreview,
} from "@/features/trips/components/trip-detail/VaultChooserNotifyRow";
import { getTripExecutionModel } from "@/features/trips/domain/tripExecutionModel";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { lrReceiptForTrip } from "@/features/trips/utils/lrReceiptStatus.util";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import { approveComplianceVehicleDocument } from "@/features/tripCompliance/services/complianceVehicleApprove.service";
import { isVehicleComplianceDocType } from "@/features/vehicles/utils/vehicleDocuments.util";
import { formatIndianVehicleNumber } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { SIGNED_URL_CACHE_TTL_MS, SIGNED_URL_EXPIRY_SEC } from "@/lib/storageSignedUrlCache";
import { Image as ExpoImage } from "expo-image";
import { useRouter, type Href } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Banknote, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleCheck, ClipboardList, Clock, FileText, Landmark, Maximize2, Minus, NotebookText, Plus, RotateCwSquare, Truck, Users, X } from "lucide-react-native";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Local preview-URL reuse window. Service-level signers already cache URLs until
 * ~2 min before expiry, so a URL we receive may have only that margin left —
 * stay inside it so a cached entry can never outlive its signature.
 */
const PREVIEW_CACHE_TTL_MS = SIGNED_URL_EXPIRY_SEC * 1000 - SIGNED_URL_CACHE_TTL_MS - 30_000;

type PreviewCacheEntry = { url: string; mime: string | null; expiresAtMs: number };

function readPreviewCache(cache: Map<string, PreviewCacheEntry>, path: string): PreviewCacheEntry | null {
  const entry = cache.get(path);
  if (!entry) return null;
  if (entry.expiresAtMs <= Date.now()) {
    cache.delete(path);
    return null;
  }
  return entry;
}

function writePreviewCache(cache: Map<string, PreviewCacheEntry>, path: string, url: string, mime: string | null) {
  cache.set(path, { url, mime, expiresAtMs: Date.now() + PREVIEW_CACHE_TTL_MS });
}

type DocTab = "trip" | "vehicle" | "driver";
type DocFilter = "all" | "finance" | DocTab;

/** Optimistic decisions survive tab switches. Key includes the tab so trip/vehicle/driver rows cannot collide. */
function optimisticKey(scope: DocTab, rowKey: string): string {
  return `${scope}:${rowKey}`;
}
type ChecklistPreviewMode = "document" | "trip" | "advance";
type ComplianceReviewGroup = "required" | "optional";

const TABS: { key: DocTab; label: string }[] = [
  { key: "trip", label: "Trip" },
  { key: "vehicle", label: "Vehicle" },
  { key: "driver", label: "Driver" },
];

type HoverPressState = { pressed: boolean; hovered?: boolean };

const WEB_POINTER: ViewStyle | null =
  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

const WEB_TRANSITION: ViewStyle | null =
  Platform.OS === "web"
    ? ({
        transitionDuration: "140ms",
        transitionProperty: "background-color, border-color, box-shadow, opacity",
        transitionTimingFunction: "ease",
      } as ViewStyle)
    : null;

const WEB_COPY =
  Platform.OS === "web" ? ({ whiteSpace: "pre-wrap" } as const) : null;

const LIST_CARD_AVATAR = 32;
const LIST_CARD_AVATAR_DOT = 7;

type ListCardPartyAvatar = {
  name: string;
  entityType: "client" | "supplier";
  partyId: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
  organizationImageUrl: string | null;
  initialsColorSeed: string;
  isIntegrated: boolean;
};

function findCrmPartyByIdOrName<
  T extends { id: string; name?: string | null; company_name?: string | null },
>(byId: Map<string, T>, id: string, name: string): T | undefined {
  const trimmed = id.trim();
  if (trimmed) {
    const row = byId.get(trimmed) ?? byId.get(trimmed.toLowerCase());
    if (row) return row;
  }
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  let match: T | undefined;
  let hits = 0;
  for (const row of byId.values()) {
    const label = (row.name ?? row.company_name ?? "").trim().toLowerCase();
    if (label !== wanted) continue;
    hits += 1;
    match = row;
  }
  return hits === 1 ? match : undefined;
}

function linkedPartyOrgImage(
  linkedOrgId: string | null | undefined,
  linkedMap: Record<string, LinkedOrgDisplay> | undefined,
  partyAvatarUrl?: string | null,
): string | null {
  const id = (linkedOrgId ?? "").trim();
  const o = id && linkedMap ? linkedMap[id] : undefined;
  return pickPartyOrganizationImageUrl({
    organizationImageUrl: o?.avatarUrl,
    logoUrl: o?.logoUrl,
    avatarUrl: partyAvatarUrl,
  });
}

function resolveListCardPartyAvatar(
  trip: ComplianceTripSummary["trip"],
  supplierName: string | null,
  clientById: Map<string, ClientRow>,
  supplierById: Map<string, SupplierRow>,
  linkedMap?: Record<string, LinkedOrgDisplay>,
): ListCardPartyAvatar {
  const customerName = trip.client_name?.trim() || "—";
  const supplierLabel = (supplierName ?? trip.supplier_name)?.trim() || "—";
  const supplierId = (trip.supplier_id ?? "").trim();
  const useSupplier =
    Boolean(supplierId) &&
    supplierLabel !== "—" &&
    supplierLabel.toLowerCase() !== "own fleet";
  if (useSupplier) {
    const row = findCrmPartyByIdOrName(supplierById, supplierId, supplierLabel);
    const logo = (row?.avatar_url ?? "").trim() || null;
    return {
      name: supplierLabel,
      entityType: "supplier",
      partyId: (row?.id ?? supplierId) || null,
      avatarUrl: logo,
      avatarSeed: (row?.avatar_seed ?? "").trim() || null,
      organizationImageUrl: linkedPartyOrgImage(
        row?.linked_organization_id,
        linkedMap,
        logo,
      ),
      initialsColorSeed: row?.id ?? supplierId,
      isIntegrated: Boolean(
        row?.is_integrated ||
          row?.linked_organization_id ||
          row?.supplier_type === "integrated",
      ),
    };
  }
  const clientId = (trip.client_id ?? "").trim();
  const row = findCrmPartyByIdOrName(clientById, clientId, customerName);
  const logo = (row?.avatar_url ?? "").trim() || null;
  return {
    name: customerName !== "—" ? customerName : supplierLabel,
    entityType: "client",
    partyId: (row?.id ?? clientId) || null,
    avatarUrl: logo,
    avatarSeed: (row?.avatar_seed ?? "").trim() || null,
    organizationImageUrl: linkedPartyOrgImage(
      row?.linked_organization_id,
      linkedMap,
      logo,
    ),
    initialsColorSeed: (row?.id ?? clientId) || trip.id,
    isIntegrated: Boolean(row?.is_integrated || row?.linked_organization_id),
  };
}

function isHovered(state: HoverPressState): boolean {
  return Boolean(state.hovered) || state.pressed;
}

const TAB_VAULT_COPY: Record<
  DocTab,
  { vaultLabel: string; vaultHint: string; unassignedTitle: string; unassignedHint: string }
> = {
  trip: {
    vaultLabel: "Trip vault",
    vaultHint: "Upload these from the trip asset vault to continue compliance",
    unassignedTitle: "",
    unassignedHint: "",
  },
  vehicle: {
    vaultLabel: "Vehicle vault",
    vaultHint: "Upload these from the vehicle asset vault for this trip",
    unassignedTitle: "No vehicle assigned",
    unassignedHint: "Assign a vehicle to this trip to manage vehicle compliance documents.",
  },
  driver: {
    vaultLabel: "Driver vault",
    vaultHint: "Upload these from the driver asset vault for this trip",
    unassignedTitle: "No driver assigned",
    unassignedHint: "Assign a driver to this trip to manage driver compliance documents.",
  },
};

function rowsForTab(summary: ComplianceTripSummary, tab: DocTab): ComplianceDocRow[] {
  if (tab === "vehicle") return deriveEntityComplianceRows(COMPLIANCE_VEHICLE_DOCUMENT_TYPES, summary.vehicleDocuments);
  if (tab === "driver") return deriveEntityComplianceRows(COMPLIANCE_DRIVER_DOCUMENT_TYPES, summary.driverDocuments);
  return deriveTripVaultReviewRows(summary.documents);
}

/** Entity doc approve/decline changes that vehicle's or driver's docs — shared by every trip using it. */
function entityDocumentChange(doc: { entity_type: "vehicle" | "driver"; entity_id: string }): ComplianceChange {
  return doc.entity_type === "driver"
    ? { type: "driverDocuments", driverId: doc.entity_id }
    : { type: "vehicleDocuments", vehicleId: doc.entity_id };
}

/** Row has reviewable content: a present trip doc (per classifier) or an entity file. */
/** One checklist row per document type: the first row with a file, else the first row. */
function firstRowPerType(rows: ComplianceDocRow[]): ComplianceDocRow[] {
  const byType = new Map<string, ComplianceDocRow>();
  for (const row of rows) {
    const current = byType.get(row.type);
    if (!current || (!hasFile(current) && hasFile(row))) byType.set(row.type, row);
  }
  return rows.filter((row) => byType.get(row.type) === row);
}

function vaultPreviewPath(row: ComplianceDocRow): string | null {
  const tripDoc = row.doc;
  if (tripDoc) {
    const kind = classifyTripDocument(tripDoc);
    const path = tripDoc.storage_path?.trim() || "";
    if (
      (kind.kind === "file" || kind.kind === "url") &&
      kind.hasBinary &&
      path &&
      !path.startsWith("ref:")
    ) {
      return path;
    }
  }
  const entityPath = row.entityDoc?.storage_path?.trim() || "";
  if (!entityPath || entityPath.startsWith("ref:") || /fields\.json$/i.test(entityPath)) {
    return null;
  }
  return entityPath;
}

function vaultPreviewForRow(
  row: ComplianceDocRow,
  organizationId: string,
  tripId: string | null,
  fallbackName: string,
): VaultChooserPreview | null {
  const storagePath = vaultPreviewPath(row);
  if (!storagePath) return null;
  const pathName = storagePath.split("/").pop()?.split("?")[0]?.trim() || "";
  const entityFileName =
    row.entityDoc?.notes?.trim() ||
    (/^[^/]+\.[a-z0-9]+$/i.test(pathName) ? pathName : "") ||
    fallbackName;
  return {
    storagePath,
    fileName: row.doc?.file_name ?? entityFileName,
    mimeHint: row.doc?.mime_type,
    // Must follow the row's real bucket (vehicle-vault RC ≠ compliance-documents).
    source: vaultChooserSourceForComplianceRow(row),
    organizationId,
    entityId: row.entityDoc?.entity_id ?? tripId,
    docType: row.type,
  };
}

function localVaultFilePreviewUri(file: { uri?: string; arrayBuffer: ArrayBuffer; mimeType: string }): string | null {
  if (file.uri?.trim()) return file.uri.trim();
  if (typeof Blob === "undefined" || typeof URL === "undefined") return null;
  try {
    return URL.createObjectURL(
      new Blob([file.arrayBuffer], { type: file.mimeType || "application/octet-stream" }),
    );
  } catch {
    return null;
  }
}

function compliancePreviewFileFromRow(
  row: ComplianceDocRow,
  label: string,
  canDelete: boolean,
): VaultCategoryPreviewFile {
  const isTripFile = Boolean(row.doc);
  const entityDoc = row.entityDoc;
  const driverKind =
    row.type === "license" || row.type === "aadhaar" ? row.type : undefined;
  const complianceType = isVehicleComplianceDocType(row.type) ? row.type : undefined;
  const approved = row.status === "verified";
  const supplierLocked =
    entityDoc != null &&
    !isTripFile &&
    (entityDoc.entity_type === "supplier" || entityDoc.source === "supplier-kyc");
  return {
    id: row.key,
    fileName: row.doc?.file_name?.trim() || entityDoc?.notes?.trim() || label,
    categoryLabel: label,
    storagePath: vaultPreviewPath(row),
    documentId: row.doc?.id ?? entityDoc?.id,
    category: row.type,
    deleteKind:
      canDelete && !approved && !supplierLocked
        ? isTripFile
          ? "trip"
          : complianceType
            ? "vehicle_compliance"
            : driverKind
              ? "driver_identity"
              : undefined
        : undefined,
    complianceType,
    driverKind,
    expiryDate: entityDoc?.expiry_date ?? null,
  };
}

function hasFile(row: ComplianceDocRow): boolean {
  if (row.doc) return classifyTripDocument(row.doc).present;
  if (row.entityDoc?.storage_path) return true;
  // Supplier bank account details (no proof scan) still open the Bank Docs panel.
  return row.type === "bank_docs" && Boolean(row.entityDoc?.notes?.trim());
}

/** Typed-details lines for a details-only trip doc; null when there is a binary to preview instead. */
function typedDetailsLines(row: ComplianceDocRow | null): { label: string; value: string }[] | null {
  const doc = row?.doc;
  if (!doc || classifyTripDocument(doc).kind !== "details") return null;
  return readTypedDetails(doc.document_number);
}

type TypedDetailLineView = { label: string; value: string };

/** The identifier row (eway, invoice, LR) leads the card; other lines stay in the body. */
function primaryTypedLine(lines: TypedDetailLineView[]): TypedDetailLineView | null {
  return (
    lines.find((line) => /eway|e-way|e way|invoice|lr\b|doc no|document/i.test(line.label)) ??
    null
  );
}

function typedValidityStatus(
  lines: TypedDetailLineView[],
): { label: string; tone: "ok" | "soon" | "expired" | "neutral" } | null {
  const line = lines.find((item) => /valid/i.test(item.label));
  const raw = String(line?.value ?? "").trim();
  if (!raw || raw === "—") return null;
  const end = ewayValidTillEnd(raw);
  if (!end) return { label: "Dated", tone: "neutral" };
  const hours = (end.getTime() - Date.now()) / 3_600_000;
  if (hours <= 0) return { label: "Expired", tone: "expired" };
  if (hours <= 48) return { label: "Expiring", tone: "soon" };
  return { label: "Active", tone: "ok" };
}

/** Group numbered lines (e.g. "Eway no 1") into entry cards — values unchanged. */
function groupTypedDetailLines(lines: TypedDetailLineView[]): {
  key: string;
  heading: string | null;
  lines: TypedDetailLineView[];
}[] {
  const byIndex = new Map<number, TypedDetailLineView[]>();
  const plain: TypedDetailLineView[] = [];
  for (const line of lines) {
    const match = line.label.match(/^(.*)\s+(\d+)$/);
    if (!match) {
      plain.push(line);
      continue;
    }
    const index = Number(match[2]);
    const fieldLabel = match[1].trim() || line.label;
    const bucket = byIndex.get(index) ?? [];
    bucket.push({ label: fieldLabel, value: line.value });
    byIndex.set(index, bucket);
  }
  if (byIndex.size === 0) {
    return [{ key: "details", heading: null, lines: plain.length > 0 ? plain : lines }];
  }
  const groups = [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, groupLines]) => ({
      key: `entry-${index}`,
      heading: byIndex.size > 1 ? `Entry ${index}` : null,
      lines: groupLines,
    }));
  if (plain.length > 0) {
    groups.push({ key: "other", heading: "Other details", lines: plain });
  }
  return groups;
}

/** "Eway no" → "E-way No", "Doc no" → "Doc No": same wording as the vault e-way strip. */
function typedLineLabel(label: string): string {
  return label.replace(/^e-?way\b/i, "E-way").replace(/\bno\b/gi, "No");
}

/**
 * Fixed-width digits only for pure numbers (e-way / doc no). On dates the tabular
 * font also widened the hyphens on Android ("16 - Oct - 26").
 */
function typedValueStyle(value: string) {
  return /^[\d\s]+$/.test(value.trim()) ? styles.typedValueTabular : null;
}

/**
 * Android ignores `numberOfLines` on selectable Text, so long e-way numbers and
 * dates wrapped and the card clipped the second line. Keep copy-select elsewhere.
 */
const TYPED_VALUE_SELECTABLE = Platform.OS !== "android";

function TypedDetailsPreview({
  title,
  lines,
  insetForSideNav = false,
  darkCanvas = false,
  bindScrollRails = true,
}: {
  title: string;
  lines: TypedDetailLineView[];
  /** Leave room for overlay prev/next chevrons. */
  insetForSideNav?: boolean;
  darkCanvas?: boolean;
  /** Drive the shared footer rail. Only one mounted preview should publish. */
  bindScrollRails?: boolean;
}) {
  const groups = useMemo(() => groupTypedDetailLines(lines), [lines]);
  const entryCount = groups.filter((group) => group.key.startsWith("entry-")).length;
  const { width: windowWidth } = useWindowDimensions();
  // Phone: two cards side by side (between the prev/next chevrons) cut labels and
  // wrap values, so one entry per row there.
  const multiColumn = groups.length >= 2 && windowWidth >= 560;
  const rows = useMemo(() => {
    if (!multiColumn) return [groups];
    const next: (typeof groups)[] = [];
    for (let i = 0; i < groups.length; i += 2) {
      next.push(groups.slice(i, i + 2));
    }
    return next;
  }, [groups, multiColumn]);

  const scrollRef = useRef<ScrollView>(null);
  const stageRef = useRef<View>(null);
  const scrollDomId = useRef(`typed-details-scroll-${Math.random().toString(36).slice(2, 10)}`).current;
  const metrics = useRef({ vw: 1, vh: 1, cw: 1, ch: 1, x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0, maxX: 0, maxY: 0 });

  const syncPan = useCallback(() => {
    const m = metrics.current;
    const maxScrollX = Math.max(0, m.cw - m.vw);
    const maxScrollY = Math.max(0, m.ch - m.vh);
    const maxX = maxScrollX / 2;
    const maxY = maxScrollY / 2;
    const x = maxX - m.x;
    const y = maxY - m.y;
    setPan((prev) =>
      prev.x === x && prev.y === y && prev.maxX === maxX && prev.maxY === maxY
        ? prev
        : { x, y, maxX, maxY },
    );
  }, []);

  const webScroller = useCallback((): HTMLElement | null => {
    if (Platform.OS !== "web" || typeof document === "undefined") return null;
    const host = document.getElementById(scrollDomId);
    if (!host) return null;
    host.style.overflowY = "auto";
    host.style.overflowX = "hidden";
    host.style.overscrollBehavior = "contain";
    if (host.scrollHeight > host.clientHeight + 1 || host.scrollWidth > host.clientWidth + 1) {
      return host;
    }
    const nested = host.querySelectorAll("div");
    for (let i = 0; i < nested.length; i += 1) {
      const child = nested[i] as HTMLElement;
      if (child.scrollHeight > child.clientHeight + 1 || child.scrollWidth > child.clientWidth + 1) {
        child.style.overflowY = "auto";
        child.style.overscrollBehavior = "contain";
        return child;
      }
    }
    return host;
  }, [scrollDomId]);

  const applyScroll = useCallback(
    (x: number, y: number) => {
      metrics.current.x = x;
      metrics.current.y = y;
      scrollRef.current?.scrollTo({ x, y, animated: false });
      const node = webScroller();
      if (node) {
        node.scrollLeft = x;
        node.scrollTop = y;
        metrics.current.vw = node.clientWidth;
        metrics.current.vh = node.clientHeight;
        metrics.current.cw = node.scrollWidth;
        metrics.current.ch = node.scrollHeight;
      }
      syncPan();
    },
    [syncPan, webScroller],
  );

  const moveX = useCallback(
    (next: number) => {
      const m = metrics.current;
      const maxScrollX = Math.max(0, m.cw - m.vw);
      const maxX = maxScrollX / 2;
      applyScroll(Math.min(maxScrollX, Math.max(0, maxX - next)), m.y);
    },
    [applyScroll],
  );

  const moveY = useCallback(
    (next: number) => {
      const m = metrics.current;
      const maxScrollY = Math.max(0, m.ch - m.vh);
      const maxY = maxScrollY / 2;
      applyScroll(m.x, Math.min(maxScrollY, Math.max(0, maxY - next)));
    },
    [applyScroll],
  );

  useEffect(() => {
    if (!bindScrollRails) return;
    previewScrollBus.publish({
      x: pan.x,
      y: pan.y,
      maxX: pan.maxX,
      maxY: pan.maxY,
      moveX,
      moveY,
    });
  }, [bindScrollRails, moveX, moveY, pan]);

  useEffect(() => {
    if (!bindScrollRails) return;
    return () => {
      if (previewScrollBus.frame?.moveY === moveY) previewScrollBus.publish(null);
    };
  }, [bindScrollRails, moveY]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const stage = stageRef.current as unknown as HTMLElement | null;
    if (!stage?.addEventListener) return;
    const onWheel = (event: WheelEvent) => {
      event.stopPropagation();
      const scroller = webScroller();
      if (!scroller) return;
      const maxScrollX = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      const maxScrollY = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (maxScrollY < 0.5 && maxScrollX < 0.5) return;
      event.preventDefault();
      applyScroll(
        Math.min(maxScrollX, Math.max(0, scroller.scrollLeft + event.deltaX)),
        Math.min(maxScrollY, Math.max(0, scroller.scrollTop + event.deltaY)),
      );
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [applyScroll, webScroller]);

  return (
    <View
      style={[
        styles.typedPreviewShell,
        darkCanvas && styles.typedPreviewScrollDark,
        insetForSideNav && styles.typedPreviewContentWithNav,
      ]}
    >
      <View style={styles.typedPreviewColumn}>
      <View style={styles.typedPreviewHeader}>
        <View style={styles.typedPreviewHeaderIcon}>
          <ClipboardList size={15} color={Theme.buttonDarkText} strokeWidth={2.1} />
        </View>
        <View style={styles.typedPreviewHeaderCopy}>
          <Text style={styles.typedPreviewKicker}>Entered details</Text>
          <Text style={styles.typedPreviewTitle} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <View style={styles.typedPreviewChips}>
          <View style={styles.typedChip}>
            <Text style={styles.typedChipText}>
              {entryCount > 1
                ? `${entryCount} bills`
                : lines.length > 0
                  ? `${lines.length} fields`
                  : "Empty"}
            </Text>
          </View>
          <View style={[styles.typedChip, styles.typedChipMuted]}>
            <Text style={styles.typedChipText}>No file</Text>
          </View>
        </View>
      </View>
      <View ref={stageRef} style={styles.typedPreviewScrollStage}>
        <ScrollView
          ref={scrollRef}
          nativeID={scrollDomId}
          style={[
            styles.typedPreviewScroll,
            Platform.OS === "web"
              ? ({ overflowY: "auto", overflowX: "hidden" } as ViewStyle)
              : null,
          ]}
          contentContainerStyle={styles.typedPreviewScrollContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            metrics.current.vw = width;
            metrics.current.vh = height;
            syncPan();
          }}
          onContentSizeChange={(width, height) => {
            metrics.current.cw = width;
            metrics.current.ch = height;
            syncPan();
          }}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            metrics.current.x = contentOffset.x;
            metrics.current.y = contentOffset.y;
            metrics.current.vw = layoutMeasurement.width;
            metrics.current.vh = layoutMeasurement.height;
            metrics.current.cw = contentSize.width;
            metrics.current.ch = contentSize.height;
            syncPan();
          }}
        >
          {rows.map((row, rowIndex) => (
            <View
              key={`row-${rowIndex}`}
              style={[styles.typedPreviewRow, multiColumn && styles.typedPreviewRowGrid]}
            >
              {row.map((group) => {
                const primary = group.heading ? primaryTypedLine(group.lines) : null;
                const bodyLines = primary
                  ? group.lines.filter((line) => line !== primary)
                  : group.lines;
                const validity = typedValidityStatus(group.lines);
                return (
                <View key={group.key} style={styles.typedEntryCard}>
                  <View
                    style={[
                      styles.typedEntryAccent,
                      validity?.tone === "expired"
                        ? styles.typedEntryAccentExpired
                        : validity?.tone === "soon"
                          ? styles.typedEntryAccentSoon
                          : styles.typedEntryAccentOk,
                    ]}
                  />
                  <View style={styles.typedEntryInner}>
                  {group.heading ? (
                    <View style={styles.typedEntryHeadingRow}>
                      <View style={styles.typedEntryIndex}>
                        <Text style={styles.typedEntryIndexText}>
                          {group.heading.replace(/^Entry\s+/i, "")}
                        </Text>
                      </View>
                      <View style={styles.typedEntryHeadingCopy}>
                        <Text style={styles.typedEntryKicker} numberOfLines={1}>
                          {primary ? typedLineLabel(primary.label) : group.heading}
                        </Text>
                        <Text
                          style={[styles.typedEntryHeading, typedValueStyle(primary?.value ?? "")]}
                          numberOfLines={2}
                          selectable={TYPED_VALUE_SELECTABLE}
                        >
                          {primary?.value ?? group.heading}
                        </Text>
                      </View>
                      {validity ? (
                        <View
                          style={[
                            styles.typedStatusPill,
                            validity.tone === "expired"
                              ? styles.typedStatusExpired
                              : validity.tone === "soon"
                                ? styles.typedStatusSoon
                                : validity.tone === "ok"
                                  ? styles.typedStatusOk
                                  : styles.typedStatusNeutral,
                          ]}
                        >
                          <Text
                            style={[
                              styles.typedStatusText,
                              validity.tone === "expired"
                                ? styles.typedStatusTextExpired
                                : validity.tone === "soon"
                                  ? styles.typedStatusTextSoon
                                  : validity.tone === "ok"
                                    ? styles.typedStatusTextOk
                                    : styles.typedStatusTextNeutral,
                            ]}
                          >
                            {validity.label}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={styles.typedFactGrid}>
                    {bodyLines.map((line, index) => (
                      <View
                        key={`${group.key}-${line.label}-${index}`}
                        style={[
                          styles.typedFact,
                          bodyLines.length % 2 === 1 && index === bodyLines.length - 1
                            ? styles.typedFactWide
                            : null,
                        ]}
                      >
                        <Text style={styles.typedFactLabel} numberOfLines={1}>
                          {typedLineLabel(line.label)}
                        </Text>
                        <Text
                          style={[styles.typedFactValue, typedValueStyle(line.value)]}
                          numberOfLines={2}
                          selectable={TYPED_VALUE_SELECTABLE}
                        >
                          {line.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                  </View>
                </View>
                );
              })}
              {multiColumn && row.length === 1 ? <View style={styles.typedEntryCardSpacer} /> : null}
            </View>
          ))}
        </ScrollView>
        <PreviewScrollRail axis="y" value={pan.y} max={pan.maxY} onChange={moveY} />
      </View>
      </View>
    </View>
  );
}

function fitDocumentSize(
  natural: { width: number; height: number },
  box: { width: number; height: number },
  zoom: number,
): { width: number; height: number } {
  const nw = natural.width;
  const nh = natural.height;
  if (box.width < 1 || box.height < 1 || nw < 1 || nh < 1) {
    return { width: 1, height: 1 };
  }
  const scale = Math.min(box.width / nw, box.height / nh) * zoom;
  return {
    width: Math.max(1, Math.round(nw * scale)),
    height: Math.max(1, Math.round(nh * scale)),
  };
}

/** A4 page shape — keep the iframe a sheet, not a wide black stage. */
const PDF_PAGE_RATIO = 210 / 297;

function fitPdfSize(
  box: { width: number; height: number },
  zoom: number,
): { width: number; height: number } {
  if (box.width < 1 || box.height < 1) return { width: 1, height: 1 };
  let width = box.height * PDF_PAGE_RATIO;
  let height = box.height;
  if (width > box.width) {
    width = box.width;
    height = box.width / PDF_PAGE_RATIO;
  }
  return {
    width: Math.max(1, Math.round(width * zoom)),
    height: Math.max(1, Math.round(height * zoom)),
  };
}

const MIN_PREVIEW_ZOOM = 0.5;
const MAX_PREVIEW_ZOOM = 4;
const PREVIEW_CANVAS_PAD = 12;

function clampPreviewZoom(value: number): number {
  return Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, value));
}

/** Pixel delta for a wheel event. Line and page modes are converted to pixels. */
function wheelDelta(event: WheelEvent): number {
  const raw = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  let dy = Number.isFinite(raw) ? raw : 0;
  if (event.deltaMode === 1) dy *= 16;
  else if (event.deltaMode === 2) dy *= 400;
  return dy;
}

/** Drag / scroll travel for the inline preview at a given zoom. */
function previewPanLimits(
  box: { width: number; height: number },
  display: { width: number; height: number } | null,
  zoom: number,
): { maxX: number; maxY: number } {
  if (box.width < 2 || box.height < 2) return { maxX: 0, maxY: 0 };
  const scaledW = (display?.width ?? box.width) * zoom;
  const scaledH = (display?.height ?? box.height) * zoom;
  return {
    maxX: Math.max(28, Math.abs(scaledW - box.width) / 2, box.width * 0.22),
    maxY: Math.max(28, Math.abs(scaledH - box.height) / 2, box.height * 0.22),
  };
}

/** Smooth exponential zoom. A mouse notch eases in; trackpad pixels stay continuous. */
function wheelZoomFactor(dy: number): number {
  const clamped = Math.max(-180, Math.min(180, dy));
  return Math.exp(-clamped * 0.0022);
}

function previewDomNode(node: unknown): HTMLElement | null {
  if (!node || typeof node !== "object") return null;
  const el = node as HTMLElement;
  if (typeof el.getBoundingClientRect === "function" && typeof el.contains === "function") return el;
  return null;
}

function cssPreviewTransform(
  pan: { x: number; y: number },
  scale: number,
  rotation: number,
  viewport?: { width: number; height: number },
): string {
  const fit = viewport
    ? containScaleForRotation(viewport.width, viewport.height, rotation)
    : 1;
  const rot = normalizePreviewRotation(rotation);
  return `translate(${pan.x}px, ${pan.y}px) rotate(${rot}deg) scale(${scale * fit})`;
}

/** Normalize degrees to [0, 360). */
function normalizePreviewRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

/** 90° / 270° swap the visual bounding box vs the layout box. */
function previewRotationSwapsAxes(rotation: number): boolean {
  const rot = normalizePreviewRotation(rotation);
  return rot === 90 || rot === 270;
}

/**
 * After a 90°/270° CSS rotate the layout box's AABB is height×width.
 * Shrink so the whole page stays on screen at 100%.
 */
function containScaleForRotation(
  width: number,
  height: number,
  rotation: number,
): number {
  if (!previewRotationSwapsAxes(rotation) || width < 1 || height < 1) return 1;
  return Math.min(width / height, height / width) * 0.98;
}

/** Largest box that stays fully on screen before and after a 90° rotate. */
function mediaLayoutForRotation(
  viewportW: number,
  viewportH: number,
  rotation: number,
): { width: number; height: number } {
  if (viewportW < 1 || viewportH < 1) return { width: 0, height: 0 };
  if (!previewRotationSwapsAxes(rotation)) {
    return { width: viewportW, height: viewportH };
  }
  const side = Math.min(viewportW, viewportH);
  return { width: side, height: side };
}

function clampScreenPan(
  x: number,
  y: number,
  zoom: number,
  viewportW: number,
  viewportH: number,
  mediaW: number,
  mediaH: number,
  rotation: number,
): { x: number; y: number } {
  if (viewportW <= 0 || viewportH <= 0) return { x: 0, y: 0 };
  const swap = previewRotationSwapsAxes(rotation);
  const visualW = (swap ? mediaH : mediaW) * Math.max(zoom, 0);
  const visualH = (swap ? mediaW : mediaH) * Math.max(zoom, 0);
  const maxX = Math.max(0, (visualW - viewportW) / 2);
  const maxY = Math.max(0, (visualH - viewportH) / 2);
  if (maxX <= 0 && maxY <= 0) return { x: 0, y: 0 };
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}

function canPanPreview(scale: number, rotation = 0): boolean {
  if (scale > 1) return true;
  return previewRotationSwapsAxes(rotation);
}

type PreviewScrollFrame = {
  x: number;
  y: number;
  maxX: number;
  maxY: number;
  moveX: (next: number) => void;
  moveY: (next: number) => void;
};

/** Lets the preview footer rail follow pan without re-rendering the whole workspace. */
const previewScrollBus = {
  frame: null as PreviewScrollFrame | null,
  listeners: new Set<() => void>(),
  publish(frame: PreviewScrollFrame | null) {
    this.frame = frame;
    this.listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  },
};

function usePreviewScrollFrame(): PreviewScrollFrame | null {
  const [, bump] = useState(0);
  useEffect(() => previewScrollBus.subscribe(() => bump((n) => n + 1)), []);
  return previewScrollBus.frame;
}

function PreviewScrollRail({
  axis,
  value,
  max,
  onChange,
}: {
  axis: "x" | "y";
  value: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const horizontal = axis === "x";
  const [track, setTrack] = useState(0);
  const [cues, setCues] = useState(false);
  const drag = useRef<{ origin: number; value: number } | null>(null);
  const raf = useRef<number | null>(null);
  const hideCues = useRef<ReturnType<typeof setTimeout> | null>(null);
  const span = Math.max(track, 1);
  const scrollable = max > 0.5;
  const safeMax = Math.max(max, 1);
  const thumb = Math.max(
    18,
    Math.min(span * (scrollable ? 0.16 : 0.14), span - 16),
  );
  const travel = Math.max(1, span - thumb);
  const fraction = Math.min(1, Math.max(0, (safeMax - value) / (2 * safeMax)));
  const offset = fraction * travel;
  const atStart = value >= safeMax - 0.5;
  const atEnd = value <= -safeMax + 0.5;
  const StartIcon = horizontal ? ChevronLeft : ChevronUp;
  const EndIcon = horizontal ? ChevronRight : ChevronDown;

  const showCues = () => {
    if (hideCues.current) clearTimeout(hideCues.current);
    hideCues.current = null;
    setCues(true);
  };

  const deferHideCues = () => {
    if (hideCues.current) clearTimeout(hideCues.current);
    hideCues.current = setTimeout(() => {
      hideCues.current = null;
      setCues(false);
    }, 1400);
  };

  const applyFraction = (next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    onChange(safeMax - clamped * 2 * safeMax);
  };

  const schedule = (next: number) => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      applyFraction(next);
    });
  };

  const nudge = (direction: 1 | -1) => {
    if (!scrollable) return;
    showCues();
    const step = Math.max(56, safeMax * 0.32);
    onChange(Math.min(safeMax, Math.max(-safeMax, value + direction * step)));
    deferHideCues();
  };

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      if (hideCues.current) clearTimeout(hideCues.current);
    },
    [],
  );

  const arrowBtn = (edge: "start" | "end") => {
    const towardStart = edge === "start";
    const disabled = !scrollable || (towardStart ? atStart : atEnd);
    const Icon = towardStart ? StartIcon : EndIcon;
    return (
      <Pressable
        style={[
          styles.previewScrollArrow,
          horizontal ? styles.previewScrollArrowX : styles.previewScrollArrowY,
          !cues && styles.previewScrollArrowHidden,
          cues && disabled && styles.previewScrollArrowDisabled,
        ]}
        onPress={() => nudge(towardStart ? 1 : -1)}
        disabled={!cues || disabled}
        pointerEvents={cues ? "auto" : "none"}
        accessibilityRole="button"
        accessibilityLabel={
          horizontal
            ? towardStart
              ? "Scroll document left"
              : "Scroll document right"
            : towardStart
              ? "Scroll document up"
              : "Scroll document down"
        }
        {...(Platform.OS === "web"
          ? { title: towardStart ? (horizontal ? "Scroll left" : "Scroll up") : horizontal ? "Scroll right" : "Scroll down" }
          : {})}
      >
        <Icon size={12} color={disabled ? Theme.textMuted : Theme.textPrimaryDark} strokeWidth={2.4} />
      </Pressable>
    );
  };

  return (
    <View
      testID="compliance-preview-scroll-rail"
      style={[
        horizontal ? styles.previewScrollRowX : styles.previewScrollRowY,
        cues && (horizontal ? styles.previewScrollRowXActive : styles.previewScrollRowYActive),
      ]}
      accessibilityRole="adjustable"
      accessibilityLabel={horizontal ? "Scroll document sideways" : "Scroll document up and down"}
      {...(Platform.OS === "web"
        ? {
            onMouseEnter: showCues,
            onMouseLeave: deferHideCues,
          }
        : null)}
    >
      {arrowBtn("start")}
      <View
        style={horizontal ? styles.previewScrollHitX : styles.previewScrollHitY}
        onLayout={(event) => {
          const size = horizontal ? event.nativeEvent.layout.width : event.nativeEvent.layout.height;
          setTrack((prev) => (Math.abs(prev - size) < 0.5 ? prev : size));
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => scrollable}
        onStartShouldSetResponderCapture={() => scrollable}
        onResponderGrant={(event) => {
          showCues();
          if (!scrollable) return;
          const point = horizontal ? event.nativeEvent.pageX : event.nativeEvent.pageY;
          drag.current = { origin: point, value };
          const local = horizontal ? event.nativeEvent.locationX : event.nativeEvent.locationY;
          applyFraction((local - thumb / 2) / travel);
        }}
        onResponderMove={(event) => {
          if (!drag.current || !scrollable) return;
          const point = horizontal ? event.nativeEvent.pageX : event.nativeEvent.pageY;
          const start = (safeMax - drag.current.value) / (2 * safeMax);
          schedule(start + (point - drag.current.origin) / travel);
        }}
        onResponderRelease={() => {
          drag.current = null;
          if (raf.current != null) {
            cancelAnimationFrame(raf.current);
            raf.current = null;
          }
          deferHideCues();
        }}
        onResponderTerminate={() => {
          drag.current = null;
          deferHideCues();
        }}
      >
        <View
          pointerEvents="none"
          style={horizontal ? styles.previewScrollTrackX : styles.previewScrollTrackY}
        >
          <View
            style={[
              styles.previewScrollThumb,
              horizontal
                ? { top: 1, height: 3, width: thumb, transform: [{ translateX: offset }] }
                : { left: 1, width: 3, height: thumb, transform: [{ translateY: offset }] },
            ]}
          />
        </View>
      </View>
      {arrowBtn("end")}
    </View>
  );
}

function PreviewPanFooter({ label }: { label: string }) {
  const frame = usePreviewScrollFrame();
  return (
    <View style={styles.previewFooter}>
      <PreviewScrollRail
        axis="x"
        value={frame?.x ?? 0}
        max={frame?.maxX ?? 0}
        onChange={frame?.moveX ?? (() => undefined)}
      />
      <Text style={styles.previewFooterMeta} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Screen-space pan last so cursor drag matches document motion at any angle. */
function previewViewTransform(
  pan: { x: number; y: number },
  scale: number,
  rotation: number,
  viewport?: { width: number; height: number },
) {
  const fit = viewport
    ? containScaleForRotation(viewport.width, viewport.height, rotation)
    : 1;
  // Same order as cssPreviewTransform: pan is in screen pixels, not multiplied by the zoom.
  return [
    { translateX: pan.x },
    { translateY: pan.y },
    { rotate: `${normalizePreviewRotation(rotation)}deg` as const },
    { scale: scale * fit },
  ];
}

function OriginalDocumentPreview({
  uri,
  isPdf,
  zoom,
  rotation,
  label,
  onZoomChange,
}: {
  uri: string;
  isPdf: boolean;
  zoom: number;
  rotation: number;
  label: string;
  onZoomChange?: (nextZoom: number) => void;
}) {
  const canvasRef = useRef<View>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [imageLoading, setImageLoading] = useState(!isPdf);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const dragMoved = useRef(false);
  const mediaRef = useRef<View>(null);
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const wheelLive = useRef(false);
  const frameRef = useRef({
    box: { width: 0, height: 0 },
    display: null as { width: number; height: number } | null,
    rotation: 0,
  });
  useEffect(() => {
    if (wheelLive.current) {
      if (Math.abs(zoom - viewRef.current.zoom) < 0.001) wheelLive.current = false;
      return;
    }
    viewRef.current = { zoom, panX: pan.x, panY: pan.y };
  }, [zoom, pan.x, pan.y]);

  useEffect(() => {
    setNatural(null);
    setPan({ x: 0, y: 0 });
    setImageLoading(!isPdf);
    if (isPdf) return;
    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (cancelled) return;
        if (width > 0 && height > 0) setNatural({ width, height });
        setImageLoading(false);
      },
      () => {
        if (!cancelled) {
          setNatural(null);
          setImageLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri, isPdf]);

  const fitBox = useMemo(() => {
    const width = Math.max(0, box.width - PREVIEW_CANVAS_PAD * 2);
    const height = Math.max(0, box.height - PREVIEW_CANVAS_PAD * 2);
    return { width, height };
  }, [box.height, box.width]);

  /** Base fit at 100% — zoom is applied via transform so pan stays smooth. */
  const display = useMemo(() => {
    if (fitBox.width < 2 || fitBox.height < 2) return null;
    if (isPdf) return fitPdfSize(fitBox, 1);
    if (!natural) return fitPdfSize(fitBox, 1);
    return fitDocumentSize(natural, fitBox, 1);
  }, [fitBox, isPdf, natural]);

  const limits = useMemo(() => previewPanLimits(box, display, zoom), [box, display, zoom]);

  const clampLocalPan = useCallback(
    (x: number, y: number) => ({
      x: Math.min(limits.maxX, Math.max(-limits.maxX, x)),
      y: Math.min(limits.maxY, Math.max(-limits.maxY, y)),
    }),
    [limits.maxX, limits.maxY],
  );

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [rotation]);

  const moveX = useCallback(
    (next: number) => {
      setPan((prev) => clampLocalPan(next, prev.y));
    },
    [clampLocalPan],
  );
  const moveY = useCallback(
    (next: number) => {
      setPan((prev) => clampLocalPan(prev.x, next));
    },
    [clampLocalPan],
  );

  useEffect(() => {
    previewScrollBus.publish({
      x: pan.x,
      y: pan.y,
      maxX: limits.maxX,
      maxY: limits.maxY,
      moveX,
      moveY,
    });
  }, [limits.maxX, limits.maxY, moveX, moveY, pan.x, pan.y]);

  useEffect(
    () => () => {
      previewScrollBus.publish(null);
    },
    [],
  );

  const pannable = limits.maxX > 0 || limits.maxY > 0;
  frameRef.current = { box, display, rotation };

  const paintZoom = useCallback((nextZoom: number, cursorX: number, cursorY: number) => {
    const current = viewRef.current;
    const frame = frameRef.current;
    const clamped = clampPreviewZoom(nextZoom);
    const from = Math.max(current.zoom, 0.001);
    const ratio = clamped / from;
    const scaledW = (frame.display?.width ?? frame.box.width) * clamped;
    const scaledH = (frame.display?.height ?? frame.box.height) * clamped;
    const maxX = Math.max(0, Math.abs(scaledW - frame.box.width) / 2);
    const maxY = Math.max(0, Math.abs(scaledH - frame.box.height) / 2);
    const next = {
      x: Math.min(maxX, Math.max(-maxX, cursorX - ratio * (cursorX - current.panX))),
      y: Math.min(maxY, Math.max(-maxY, cursorY - ratio * (cursorY - current.panY))),
    };
    viewRef.current = { zoom: clamped, panX: next.x, panY: next.y };
    if (Platform.OS !== "web") return;
    const el = mediaRef.current as unknown as HTMLElement | null;
    if (el?.style) el.style.transform = cssPreviewTransform(next, clamped, frame.rotation, frame.box);
  }, []);

  const zoomAnim = useRef(0);
  const glideGen = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushZoom = useCallback(() => {
    const live = viewRef.current;
    onZoomChange?.(live.zoom);
    setPan((prev) => (prev.x === live.panX && prev.y === live.panY ? prev : { x: live.panX, y: live.panY }));
  }, [onZoomChange]);

  const scheduleFlush = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      flushZoom();
    }, 90);
  }, [flushZoom]);

  const glideZoom = useCallback(
    (targetZoom: number, cursorX: number, cursorY: number, duration: number) => {
      wheelLive.current = true;
      if (settleTimer.current) {
        clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
      const dest = clampPreviewZoom(targetZoom);
      const origin = viewRef.current.zoom;
      const gen = ++glideGen.current;
      if (zoomAnim.current) cancelAnimationFrame(zoomAnim.current);
      const started = performance.now();
      const step = (now: number) => {
        if (glideGen.current !== gen) return;
        const t = Math.min(1, (now - started) / duration);
        const eased = 1 - (1 - t) * (1 - t) * (1 - t);
        paintZoom(origin + (dest - origin) * eased, cursorX, cursorY);
        if (t < 1) zoomAnim.current = requestAnimationFrame(step);
        else {
          zoomAnim.current = 0;
          scheduleFlush();
        }
      };
      zoomAnim.current = requestAnimationFrame(step);
    },
    [paintZoom, scheduleFlush],
  );

  useLayoutEffect(() => {
    if (Platform.OS !== "web" || !wheelLive.current) return;
    const el = mediaRef.current as unknown as HTMLElement | null;
    const live = viewRef.current;
    const frame = frameRef.current;
    if (!el?.style) return;
    el.style.transform = cssPreviewTransform(
      { x: live.panX, y: live.panY },
      live.zoom,
      frame.rotation,
      frame.box,
    );
  });

  useEffect(
    () => () => {
      if (zoomAnim.current) cancelAnimationFrame(zoomAnim.current);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || !onZoomChange) return;

    const canvas = () =>
      previewDomNode(canvasRef.current) ??
      (typeof document !== "undefined"
        ? document.getElementById("compliance-preview-canvas")
        : null);

    const pointInCanvas = (event: MouseEvent) => {
      const node = canvas();
      if (!node) return null;
      const top = document.elementFromPoint(event.clientX, event.clientY);
      if (!top || !node.contains(top)) return null;
      if (
        (top as HTMLElement).closest?.(
          "[data-testid='compliance-preview-scroll-rail'], [data-testid='compliance-doc-side-nav']",
        )
      ) {
        return null;
      }
      const rect = node.getBoundingClientRect();
      return {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      };
    };

    const onWheel = (event: WheelEvent) => {
      const point = pointInCanvas(event);
      if (!point) return;
      const live = viewRef.current;
      // Zoomed in: scroll / two-finger swipe moves the page; Ctrl+scroll or pinch still zooms.
      if (!event.ctrlKey && !event.metaKey && live.zoom > 1.01) {
        event.preventDefault();
        event.stopPropagation();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
        let dx = (Number.isFinite(event.deltaX) ? event.deltaX : 0) * unit;
        let dy = (Number.isFinite(event.deltaY) ? event.deltaY : 0) * unit;
        if (event.shiftKey && dx === 0) {
          dx = dy;
          dy = 0;
        }
        const frame = frameRef.current;
        const { maxX, maxY } = previewPanLimits(frame.box, frame.display, live.zoom);
        const next = {
          x: Math.min(maxX, Math.max(-maxX, live.panX - dx)),
          y: Math.min(maxY, Math.max(-maxY, live.panY - dy)),
        };
        viewRef.current = { ...live, panX: next.x, panY: next.y };
        const el = mediaRef.current as unknown as HTMLElement | null;
        if (el?.style) el.style.transform = cssPreviewTransform(next, live.zoom, frame.rotation, frame.box);
        setPan(next);
        return;
      }
      const dy = wheelDelta(event);
      if (dy === 0) return;
      event.preventDefault();
      event.stopPropagation();
      wheelLive.current = true;
      const target = viewRef.current.zoom * wheelZoomFactor(dy);
      if (Math.abs(dy) >= 40) glideZoom(target, point.x, point.y, 170);
      else {
        glideGen.current += 1;
        if (zoomAnim.current) cancelAnimationFrame(zoomAnim.current);
        zoomAnim.current = 0;
        paintZoom(target, point.x, point.y);
        scheduleFlush();
      }
    };

    const onClick = (event: MouseEvent) => {
      if (dragMoved.current) {
        dragMoved.current = false;
        return;
      }
      const point = pointInCanvas(event);
      if (!point) return;
      const zoomOut = event.altKey || event.shiftKey || viewRef.current.zoom >= MAX_PREVIEW_ZOOM - 0.01;
      const next = zoomOut
        ? viewRef.current.zoom <= 1.05
          ? 1
          : viewRef.current.zoom / 1.2
        : viewRef.current.zoom * 1.2;
      glideZoom(next, point.x, point.y, 200);
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("click", onClick, true);
    };
  }, [glideZoom, onZoomChange, paintZoom, scheduleFlush]);

  const cursorStyle =
    Platform.OS === "web"
      ? ({
          cursor: dragging ? "grabbing" : pannable ? "grab" : zoom >= MAX_PREVIEW_ZOOM - 0.01 ? "zoom-out" : "zoom-in",
          userSelect: "none",
        } as unknown as ViewStyle)
      : null;

  return (
    <View
      ref={canvasRef}
      nativeID="compliance-preview-canvas"
      style={[styles.previewCanvas, hovered && styles.previewCanvasHovered, cursorStyle]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
      }}
      {...(Platform.OS === "web"
        ? ({
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => {
              setHovered(false);
              setDragging(false);
              drag.current = null;
            },
          } as Record<string, unknown>)
        : null)}
      accessibilityLabel={
        isPdf
          ? `${label}. Scroll or click to zoom. When zoomed, drag or scroll to move; Ctrl+scroll to zoom.`
          : `${label}. Scroll or click to zoom. When zoomed, drag or scroll to move; Ctrl+scroll to zoom.`
      }
    >
      <View
        style={styles.previewPanSurface}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => {
          dragMoved.current = false;
          setDragging(true);
          drag.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
            panX: viewRef.current.panX,
            panY: viewRef.current.panY,
          };
        }}
        onResponderMove={(event) => {
          if (!drag.current) return;
          if (
            Math.hypot(event.nativeEvent.pageX - drag.current.x, event.nativeEvent.pageY - drag.current.y) > 4
          ) {
            dragMoved.current = true;
          }
          const next = clampLocalPan(
            drag.current.panX + event.nativeEvent.pageX - drag.current.x,
            drag.current.panY + event.nativeEvent.pageY - drag.current.y,
          );
          viewRef.current.panX = next.x;
          viewRef.current.panY = next.y;
          if (Platform.OS === "web") {
            const el = mediaRef.current as unknown as HTMLElement | null;
            const frame = frameRef.current;
            if (el?.style) {
              el.style.transform = cssPreviewTransform(next, viewRef.current.zoom, frame.rotation, frame.box);
            }
          }
          setPan(next);
        }}
        onResponderRelease={() => {
          drag.current = null;
          setDragging(false);
        }}
        onResponderTerminate={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
      {imageLoading && !isPdf ? (
        <View style={styles.previewLoadingOverlay} pointerEvents="none">
          <ActivityIndicator color={Theme.textPrimaryDark} />
        </View>
      ) : null}
      {display ? (
        <View style={[styles.previewAlign, imageLoading && !isPdf ? { opacity: 0 } : null]} pointerEvents="none">
          <View
            ref={mediaRef}
            style={[
              display,
              isPdf && styles.previewPageSheet,
              styles.previewLiveLayer,
              {
                transform: previewViewTransform(pan, zoom, rotation, box),
              },
            ]}
          >
          {isPdf ? (
            <TripVaultFilePreview
              uri={uri}
              isPdf
                showToolbar={false}
                zoom={1}
                sizing="fit"
                interactive={false}
                style={StyleSheet.absoluteFillObject}
              accessibilityLabel={label}
            />
          ) : (
              <ExpoImage
              source={{ uri }}
                style={StyleSheet.absoluteFillObject}
                contentFit="contain"
              accessibilityLabel={label}
              />
            )}
          </View>
        </View>
      ) : null}
      </View>
      <PreviewScrollRail axis="y" value={pan.y} max={limits.maxY} onChange={moveY} />
      <View style={styles.previewScrollXDock} pointerEvents="box-none">
        <PreviewScrollRail axis="x" value={pan.x} max={limits.maxX} onChange={moveX} />
      </View>
    </View>
  );
}

/** Reads /Count from the existing PDF bytes. Does not modify the file. */
async function readPdfPageCount(uri: string): Promise<number | null> {
  try {
    const response = await fetch(uri);
    if (!response.ok) return null;
    const text = new TextDecoder("iso-8859-1").decode(await response.arrayBuffer());
    let count = 0;
    const pages = /\/Type\s*\/Pages\b/g;
    let match: RegExpExecArray | null;
    while ((match = pages.exec(text))) {
      const after = text.slice(match.index, match.index + 240);
      const before = text.slice(Math.max(0, match.index - 240), match.index);
      const found = after.match(/\/Count\s+(\d+)/) ?? before.match(/\/Count\s+(\d+)\D*$/);
      if (found) count = Math.max(count, Number(found[1]));
    }
    if (count > 0) return count;
    const leaves = text.match(/\/Type\s*\/Page(?!s)\b/g);
    return leaves && leaves.length > 0 ? leaves.length : null;
  } catch {
    return null;
  }
}

function DocSideNavButton({
  direction,
  onPress,
  disabled,
  tone = "light",
}: {
  direction: "prev" | "next";
  onPress: () => void;
  disabled?: boolean;
  tone?: "light" | "dark";
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const label = direction === "prev" ? "Previous document" : "Next document";
  const iconColor = disabled
    ? Theme.textMuted
    : tone === "dark"
      ? Theme.textOnDark
      : Theme.textPrimaryDark;
  return (
    <Pressable
      testID="compliance-doc-side-nav"
      style={[
        styles.docSideNavBtn,
        tone === "dark" && styles.docSideNavBtnDark,
        disabled && styles.docSideNavBtnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={8}
      {...(Platform.OS === "web" ? { title: label } : {})}
    >
      <Icon size={20} color={iconColor} strokeWidth={2.2} />
    </Pressable>
  );
}

export function DocumentScreen({
  visible,
  uri,
  isPdf,
  title,
  onClose,
  presentation = "page",
  onPrev,
  onNext,
  navLabel = null,
  headerFacts = null,
  canNavigate = false,
  typedLines = null,
  resolving = false,
  documentKey = null,
  documentVersion = null,
  emptyHint = null,
}: {
  visible: boolean;
  uri: string | null;
  isPdf: boolean;
  title: string;
  onClose: () => void;
  /** `page` fills the screen. `sheet` stays a centered card. */
  presentation?: "sheet" | "page";
  onPrev?: () => void;
  onNext?: () => void;
  navLabel?: string | null;
  /** LR / invoice / Valid till — same facts as the document card. */
  headerFacts?: string | null;
  canNavigate?: boolean;
  /** Details-only docs (e.g. typed E-way) — no binary file. */
  typedLines?: { label: string; value: string }[] | null;
  /** True while the next signed URL is being fetched. */
  resolving?: boolean;
  documentKey?: string | null;
  documentVersion?: string | null;
  emptyHint?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const stageRef = useRef<View>(null);
  const closeRef = useRef<View>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const viewRef = useRef({ scale: 1, panX: 0, panY: 0, rotation: 0 });
  const screenMediaRef = useRef<View>(null);
  const viewFlushRaf = useRef(0);
  useEffect(() => {
    viewRef.current = { scale, panX: pan.x, panY: pan.y, rotation };
  }, [scale, pan.x, pan.y, rotation]);
  /** Coalesce pan updates so wheel/drag stays smooth (one paint per frame). */
  const panRafRef = useRef(0);
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null);
  const schedulePan = useCallback((next: { x: number; y: number }) => {
    const current = viewRef.current;
    current.panX = next.x;
    current.panY = next.y;
    if (Platform.OS === "web") {
      const el = screenMediaRef.current as unknown as HTMLElement | null;
      if (el?.style) {
        el.style.transform = cssPreviewTransform(next, current.scale, current.rotation);
      }
    }
    pendingPanRef.current = next;
    if (panRafRef.current) return;
    panRafRef.current = requestAnimationFrame(() => {
      panRafRef.current = 0;
      const pending = pendingPanRef.current;
      if (pending) setPan(pending);
    });
  }, [frame.height, frame.width]);
  useEffect(
    () => () => {
      if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
      if (viewFlushRaf.current) cancelAnimationFrame(viewFlushRaf.current);
    },
    [],
  );
  const compact = windowWidth < 720;
  const fullPage = presentation === "page";
  const sheetWidth = Math.min(1080, windowWidth - Math.max(insets.left, 12) - Math.max(insets.right, 12) - (compact ? 16 : 48));
  const sheetHeight = Math.min(windowHeight - insets.top - insets.bottom - (compact ? 16 : 48), compact ? windowHeight : 880);
  const frameWidth = fullPage ? windowWidth : sheetWidth;
  const frameHeight = fullPage
    ? windowHeight
    : sheetHeight;
  const sideNavEnabled = Boolean(canNavigate && onPrev && onNext);
  const showTyped = Boolean(typedLines && typedLines.length > 0 && !uri);
  const showPdf = Boolean(uri && isPdf && !showTyped);
  const showImage = Boolean(uri && !isPdf && !showTyped);
  const mediaBox = mediaLayoutForRotation(frame.width, frame.height, rotation);

  const applyView = useCallback(
    (nextScale: number, nextPan: { x: number; y: number }, size = frame, rot = rotation) => {
    const zoom = clampPreviewZoom(nextScale);
      const box = mediaLayoutForRotation(size.width, size.height, rot);
      const panNext = clampScreenPan(
        nextPan.x,
        nextPan.y,
        zoom,
        size.width,
        size.height,
        box.width,
        box.height,
        rot,
      );
      viewRef.current = { scale: zoom, panX: panNext.x, panY: panNext.y, rotation: rot };
      if (Platform.OS === "web") {
        const el = screenMediaRef.current as unknown as HTMLElement | null;
        if (el?.style) {
          el.style.transform = cssPreviewTransform(panNext, zoom, rot);
        }
      }
      if (viewFlushRaf.current) return;
      viewFlushRaf.current = requestAnimationFrame(() => {
        viewFlushRaf.current = 0;
        const live = viewRef.current;
        setScale(live.scale);
        setPan({ x: live.panX, y: live.panY });
      });
    },
    [frame, rotation],
  );

  useEffect(() => {
    if (!visible) return;
    setScale(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setPage(1);
    setPageCount(null);
    setImageFailed(false);
    setImageLoading(Boolean(uri && !isPdf && !showTyped));
  }, [visible, uri, isPdf, showTyped]);

  /** Keep pan inside the viewport when zoom or rotation changes. */
  useEffect(() => {
    if (!visible || frame.width <= 0) return;
    setPan((prev) =>
      clampScreenPan(prev.x, prev.y, scale, frame.width, frame.height, mediaBox.width, mediaBox.height, rotation),
    );
  }, [visible, frame.width, frame.height, mediaBox.height, mediaBox.width, scale, rotation]);

  useLayoutEffect(() => {
    if (Platform.OS !== "web" || !visible || frame.width < 1) return;
    const el = screenMediaRef.current as unknown as HTMLElement | null;
    if (!el?.style) return;
    el.style.transform = cssPreviewTransform(pan, scale, rotation);
    el.style.transformOrigin = "center center";
  }, [visible, frame, pan, scale, rotation]);

  /** Never leave the spinner up forever if onLoad/onError never fire (common on slow signed URLs). */
  useEffect(() => {
    if (!visible || !imageLoading || !showImage) return;
    const timer = setTimeout(() => {
      setImageLoading(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [visible, imageLoading, showImage, uri]);

  useEffect(() => {
    if (!visible || !showPdf || !uri) return;
    let cancelled = false;
    void readPdfPageCount(uri).then((count) => {
      if (!cancelled && count) setPageCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, showPdf, uri]);

  useEffect(() => {
    if (pageCount != null && page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  /** Any non-zero CSS rotate — native scroll fights the transform; we own pan/wheel. */
  const pdfViewOwned = showPdf && normalizePreviewRotation(rotation) !== 0;
  const imageViewOwned = showImage && normalizePreviewRotation(rotation) !== 0;
  const rotatedViewOwned = pdfViewOwned || imageViewOwned;

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const blockWheel = (event: WheelEvent) => {
      // Upright PDF keeps native iframe scroll. Images / rotated media are handled on the stage.
      if ((showPdf && !pdfViewOwned) || showTyped) return;
      event.preventDefault();
    };
    window.addEventListener("wheel", blockWheel, { passive: false });
    const frameId = requestAnimationFrame(() => {
      const closeNode = closeRef.current as unknown as HTMLElement | null;
      closeNode?.focus?.();
    });
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("wheel", blockWheel);
      cancelAnimationFrame(frameId);
    };
  }, [visible, showPdf, showTyped, pdfViewOwned]);

  useEffect(() => {
    if (!visible || frame.width <= 0 || Platform.OS !== "web") return;
    const node = stageRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;

    const clampLive = (x: number, y: number, zoom: number, vw: number, vh: number, rot: number) => {
      const box = mediaLayoutForRotation(vw, vh, rot);
      return clampScreenPan(x, y, zoom, vw, vh, box.width, box.height, rot);
    };

    const panFromWheel = (event: WheelEvent) => {
      const rect = node.getBoundingClientRect();
      const current = viewRef.current;
      schedulePan(
        clampLive(
          current.panX - event.deltaX,
          current.panY - event.deltaY,
          current.scale,
          rect.width,
          rect.height,
          current.rotation,
        ),
      );
    };

    const onWheel = (event: WheelEvent) => {
      if (showTyped) return;
      // Upright PDF: leave wheel to the browser viewer (smooth native scroll).
      if (showPdf && !pdfViewOwned) return;

      event.preventDefault();
      event.stopPropagation();

      // Two-finger / shift scroll pans. Plain wheel zooms toward the cursor.
      if (event.shiftKey || (Math.abs(event.deltaX) > Math.abs(event.deltaY) && event.deltaX !== 0)) {
        panFromWheel(event);
        return;
      }

      if (showPdf && !pdfViewOwned) return;
      const rect = node.getBoundingClientRect();
      const current = viewRef.current;
      const cursorX = event.clientX - rect.left - rect.width / 2;
      const cursorY = event.clientY - rect.top - rect.height / 2;
      const next = clampPreviewZoom(current.scale * wheelZoomFactor(event.deltaY));
      const ratio = next / Math.max(current.scale, 0.001);
      const nextPan = clampLive(
        cursorX - ratio * (cursorX - current.panX),
        cursorY - ratio * (cursorY - current.panY),
        next,
        rect.width,
        rect.height,
        current.rotation,
      );
      current.scale = next;
      current.panX = nextPan.x;
      current.panY = nextPan.y;
      applyView(next, nextPan, { width: rect.width, height: rect.height });
    };

    /** Native pointer pan — RN responders are unreliable over transformed media on web. */
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const current = viewRef.current;
      if (!showImage && !pdfViewOwned) return;
      event.preventDefault();
      drag.current = {
        x: event.clientX,
        y: event.clientY,
        panX: current.panX,
        panY: current.panY,
      };
      setDragging(true);
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      node.style.cursor = "grabbing";
      node.style.userSelect = "none";
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag.current) return;
      const current = viewRef.current;
      const rect = node.getBoundingClientRect();
      schedulePan(
        clampLive(
          drag.current.panX + event.clientX - drag.current.x,
          drag.current.panY + event.clientY - drag.current.y,
          current.scale,
          rect.width,
          rect.height,
          current.rotation,
        ),
      );
    };
    const endPointer = (event: PointerEvent) => {
      if (!drag.current) return;
      drag.current = null;
      setDragging(false);
      try {
        node.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      node.style.cursor = "grab";
      node.style.userSelect = "";
    };
    const onDoubleClick = (event: MouseEvent) => {
      if (showPdf || showTyped) return;
      const rect = node.getBoundingClientRect();
      const current = viewRef.current;
      if (current.scale >= 1.99) {
        applyView(1, { x: 0, y: 0 }, { width: rect.width, height: rect.height });
        return;
      }
      const cursorX = event.clientX - rect.left - rect.width / 2;
      const cursorY = event.clientY - rect.top - rect.height / 2;
      const ratio = 2 / current.scale;
      applyView(
        2,
        {
          x: cursorX - ratio * (cursorX - current.panX),
          y: cursorY - ratio * (cursorY - current.panY),
        },
        { width: rect.width, height: rect.height },
      );
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        const current = viewRef.current;
        applyView(current.scale + 0.25, { x: current.panX, y: current.panY });
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        const current = viewRef.current;
        applyView(current.scale - 0.25, { x: current.panX, y: current.panY });
      } else if (event.key === "0") {
        event.preventDefault();
        applyView(1, { x: 0, y: 0 });
      } else if (sideNavEnabled && event.key === "ArrowLeft") {
        event.preventDefault();
        onPrev?.();
      } else if (sideNavEnabled && event.key === "ArrowRight") {
        event.preventDefault();
        onNext?.();
      } else if (showPdf && event.key === "ArrowLeft") {
        event.preventDefault();
        setPage((value) => Math.max(1, value - 1));
        setPan({ x: 0, y: 0 });
      } else if (showPdf && event.key === "ArrowRight") {
        event.preventDefault();
        setPage((value) => Math.min(pageCount ?? 40, value + 1));
        setPan({ x: 0, y: 0 });
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("dblclick", onDoubleClick);
    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerup", endPointer);
    node.addEventListener("pointercancel", endPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("dblclick", onDoubleClick);
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", endPointer);
      node.removeEventListener("pointercancel", endPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [
    visible,
    frame.width,
    frame.height,
    showPdf,
    showImage,
    showTyped,
    pdfViewOwned,
    rotatedViewOwned,
    onClose,
    pageCount,
    applyView,
    schedulePan,
    sideNavEnabled,
    onPrev,
    onNext,
  ]);

  const pageLimit = pageCount ?? 40;
  const atFirstPage = page <= 1;
  const atLastPage = page >= pageLimit;
  const showPdfPageTools = showPdf && !sideNavEnabled;
  const busyResolving = resolving && !uri && !showTyped;
  const pannable = showImage || showPdf;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.screenRoot,
          fullPage && styles.screenRootPage,
          {
            paddingTop: fullPage ? 0 : Math.max(insets.top, 8),
            paddingBottom: fullPage ? 0 : Math.max(insets.bottom, 8),
          },
        ]}
        accessibilityViewIsModal
      >
        {!fullPage ? (
        <Pressable style={styles.screenBackdrop} onPress={onClose} accessibilityLabel="Close document preview" />
        ) : null}
        <View
          style={[
            styles.screenSheet,
            fullPage && styles.screenSheetPage,
            {
              width: frameWidth,
              height: frameHeight,
              paddingTop: fullPage ? Math.max(insets.top, 0) : 0,
              paddingBottom: fullPage ? Math.max(insets.bottom, 0) : 0,
            },
          ]}
        >
          <View style={[styles.screenBar, compact && styles.screenBarCompact]}>
            <View style={styles.screenTitleBlock}>
            <Text style={styles.screenTitle} numberOfLines={1}>{title}</Text>
              {headerFacts ? (
                <Text style={styles.screenSubtitle} numberOfLines={1}>
                  {headerFacts}
                </Text>
              ) : null}
            </View>
            <View style={styles.screenTools}>
              {showPdfPageTools ? (
                <View style={[styles.previewZoomCluster, styles.previewPageCluster]}>
                <Pressable
                    style={[styles.previewZoomBtn, atFirstPage && styles.previewToolBtnDisabled]}
                  onPress={() => {
                    setPage((value) => Math.max(1, value - 1));
                    setPan({ x: 0, y: 0 });
                  }}
                  disabled={atFirstPage}
                  accessibilityRole="button"
                  accessibilityLabel="Previous page"
                  accessibilityState={{ disabled: atFirstPage }}
                  {...(Platform.OS === "web" ? { title: "Previous page" } : {})}
                >
                    <ChevronLeft size={14} color={atFirstPage ? Theme.textMuted : Theme.textPrimaryDark} />
                </Pressable>
                  <Text style={[styles.previewZoomLabel, styles.previewPageLabel]} accessibilityLabel={pageCount ? `Page ${page} of ${pageCount}` : `Page ${page}`}>
                    {pageCount ? `${page} / ${pageCount}` : `Page ${page}`}
                </Text>
                <Pressable
                    style={[styles.previewZoomBtn, atLastPage && styles.previewToolBtnDisabled]}
                  onPress={() => {
                    setPage((value) => Math.min(pageLimit, value + 1));
                    setPan({ x: 0, y: 0 });
                  }}
                  disabled={atLastPage}
                  accessibilityRole="button"
                  accessibilityLabel="Next page"
                  accessibilityState={{ disabled: atLastPage }}
                  {...(Platform.OS === "web" ? { title: "Next page" } : {})}
                >
                    <ChevronRight size={14} color={atLastPage ? Theme.textMuted : Theme.textPrimaryDark} />
                </Pressable>
              </View>
            ) : null}
              {showImage || showPdf ? (
                <>
              <Pressable
                    style={[styles.previewRotateBtn, styles.previewToolBtnNamed]}
                    onPress={() => {
                      const next = (rotation + 90) % 360;
                      setRotation(next);
                      setScale(1);
                      setPan({ x: 0, y: 0 });
                      viewRef.current = { scale: 1, panX: 0, panY: 0, rotation: next };
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Rotate"
                    {...(Platform.OS === "web" ? { title: "Rotate" } : {})}
                  >
                    <RotateCwSquare size={14} color={Theme.textPrimaryDark} strokeWidth={2.1} />
                    <Text style={styles.previewToolName}>Rotate</Text>
                  </Pressable>
                  <View style={styles.previewZoomCluster}>
                    <Pressable
                      style={styles.previewZoomBtn}
                onPress={() => applyView(scale - 0.25, pan)}
                accessibilityRole="button"
                accessibilityLabel="Zoom out"
                {...(Platform.OS === "web" ? { title: "Zoom out" } : {})}
              >
                      <Minus size={14} color={Theme.textPrimaryDark} />
              </Pressable>
                    <Text style={styles.previewZoomLabel} accessibilityLabel={`Zoom ${Math.round(scale * 100)} percent`}>
                {Math.round(scale * 100)}%
              </Text>
              <Pressable
                      style={styles.previewZoomBtn}
                onPress={() => applyView(scale + 0.25, pan)}
                accessibilityRole="button"
                accessibilityLabel="Zoom in"
                {...(Platform.OS === "web" ? { title: "Zoom in" } : {})}
              >
                      <Plus size={14} color={Theme.textPrimaryDark} />
              </Pressable>
                  </View>
                </>
              ) : null}
              <Pressable
                ref={closeRef}
                style={styles.previewToolBtn}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                {...(Platform.OS === "web" ? { title: "Close" } : {})}
              >
                <X size={14} color={Theme.textPrimaryDark} />
              </Pressable>
            </View>
          </View>
          <View style={[styles.screenStageRow, fullPage && styles.screenStageRowPage]}>
          <View
            ref={stageRef}
              style={[
                styles.screenStage,
                fullPage && styles.screenStagePage,
                showTyped && styles.screenStageTyped,
                Platform.OS === "web" && (showImage || showPdf)
                  ? ({
                      cursor: dragging ? "grabbing" : "grab",
                      userSelect: "none",
                    } as unknown as ViewStyle)
                  : null,
              ]}
              accessibilityLabel={
                showTyped
                  ? "Entered document details"
                  : showPdf
                    ? pdfViewOwned
                      ? "Rotated PDF. Scroll or drag to pan. Use the header Rotate to straighten."
                      : "Original PDF document. Scroll pages in the viewer. Use the header Rotate for a smooth rotated view."
                    : rotatedViewOwned
                      ? "Rotated image. Scroll or drag to pan. Use side arrows for the next document."
                      : "Image preview. Scroll to zoom. Drag to pan when zoomed or rotated."
              }
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setFrame((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
            }}
              // Native: keep responders. Web pan uses pointer events above (more reliable when rotated).
              {...(Platform.OS !== "web"
                ? {
                    onStartShouldSetResponder: () => pannable && (showImage || pdfViewOwned),
                    onMoveShouldSetResponder: () => pannable && (showImage || pdfViewOwned),
                    onResponderGrant: (event: { nativeEvent: { pageX: number; pageY: number } }) => {
                      if (!pannable) return;
                      if (!showImage && !pdfViewOwned) return;
                      drag.current = {
                        x: event.nativeEvent.pageX,
                        y: event.nativeEvent.pageY,
                        panX: pan.x,
                        panY: pan.y,
                      };
                    },
                    onResponderMove: (event: { nativeEvent: { pageX: number; pageY: number } }) => {
                      if (!drag.current || !canPanPreview(viewRef.current.scale, viewRef.current.rotation)) {
                        return;
                      }
                      if (!showImage && !pdfViewOwned) return;
                      schedulePan(
                        clampScreenPan(
                drag.current.panX + event.nativeEvent.pageX - drag.current.x,
                drag.current.panY + event.nativeEvent.pageY - drag.current.y,
                viewRef.current.scale,
                frame.width,
                frame.height,
                          mediaBox.width,
                          mediaBox.height,
                          viewRef.current.rotation,
                        ),
              );
                    },
                    onResponderRelease: () => {
              drag.current = null;
                    },
                  }
                : null)}
            >
              {showTyped && typedLines ? (
                <TypedDetailsPreview
                  title={title}
                  lines={typedLines}
                  insetForSideNav={sideNavEnabled}
                  darkCanvas={fullPage}
                />
              ) : showPdf && uri ? (
            <View
                  ref={screenMediaRef}
                  style={[
                    mediaBox.width > 0
                      ? { width: mediaBox.width, height: mediaBox.height }
                      : styles.screenPage,
                    styles.previewLiveLayer,
                    {
                      transform: previewViewTransform(
                        pan,
                        pdfViewOwned ? scale : 1,
                        pdfViewOwned ? rotation : 0,
                      ),
                    },
                  ]}
                  // Rotated: stage owns wheel/drag. Upright: iframe keeps native scroll.
                  pointerEvents={pdfViewOwned ? "box-none" : "auto"}
                >
                <TripVaultFilePreview
                  uri={uri}
                  isPdf
                    // Hide Chrome PDF chrome — its built-in rotate breaks smooth scroll.
                    // Use the header Rotate control instead. Upright files still
                    // use the live iframe (previewTier=full + scrollbar) so pages
                    // can be scrolled, same as vault preview.
                  showToolbar={false}
                  sizing="fit"
                    zoom={pdfViewOwned ? 1 : scale}
                    page={showPdfPageTools ? page : undefined}
                    scrollbar={!pdfViewOwned}
                    interactive={!pdfViewOwned}
                    previewTier={pdfViewOwned ? "thumb" : "full"}
                    documentKey={documentKey}
                    documentVersion={documentVersion}
                  style={styles.screenFile}
                  accessibilityLabel={title}
                />
                </View>
              ) : showImage && uri ? (
                <>
                  {(imageLoading || busyResolving) && !imageFailed ? (
                    <View style={styles.screenLoading} pointerEvents="none">
                      <ActivityIndicator size="large" color={Theme.textOnDark} />
                      <Text style={styles.screenLoadingText}>Loading document…</Text>
                    </View>
                  ) : null}
                  {imageFailed ? (
                    <View style={styles.screenLoading}>
                      <Text style={styles.screenLoadingText}>Couldn’t load this file. Try Next or close and reopen.</Text>
                    </View>
                  ) : (
                    <View
                      ref={screenMediaRef}
                      pointerEvents="none"
                      style={[
                        mediaBox.width > 0
                          ? { width: mediaBox.width, height: mediaBox.height }
                          : styles.screenPage,
                        styles.previewLiveLayer,
                        {
                          opacity: imageLoading ? 0.15 : 1,
                          transform: previewViewTransform(pan, scale, rotation),
                        },
                      ]}
                    >
                      <ExpoImage
                        source={{ uri }}
                        style={styles.screenFile}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        recyclingKey={uri}
                        accessibilityLabel={title}
                        onLoadStart={() => {
                          setImageFailed(false);
                          setImageLoading(true);
                        }}
                        onLoad={() => setImageLoading(false)}
                        onError={() => {
                          setImageLoading(false);
                          setImageFailed(true);
                        }}
                      />
                    </View>
                  )}
                </>
              ) : busyResolving ? (
                <View style={styles.screenLoading}>
                  <ActivityIndicator size="large" color={Theme.textOnDark} />
                  <Text style={styles.screenLoadingText}>Loading document…</Text>
            </View>
              ) : (
                <View style={styles.screenLoading}>
                  <Text style={styles.screenLoadingText}>
                    {emptyHint ?? "No preview available for this document."}
                  </Text>
          </View>
              )}
        </View>
            {/* Inside the stage row so arrows stay above the rotated media hit-target. */}
            {sideNavEnabled ? (
              <>
                <View style={[styles.docSideNavOverlayLeft, styles.docSideNavOverlayScreen]} pointerEvents="box-none">
                  <DocSideNavButton
                    direction="prev"
                    onPress={() => onPrev?.()}
                    tone={fullPage ? "dark" : "light"}
                  />
      </View>
                <View style={[styles.docSideNavOverlayRight, styles.docSideNavOverlayScreen]} pointerEvents="box-none">
                  <DocSideNavButton
                    direction="next"
                    onPress={() => onNext?.()}
                    tone={fullPage ? "dark" : "light"}
                  />
        </View>
              </>
            ) : null}
      </View>
          {showTyped ? (
            <PreviewPanFooter label={navLabel ?? "Entered details"} />
          ) : navLabel ? (
            <View style={[styles.previewFooter, styles.screenNavFooter]}>
              <Text style={styles.previewFooterMeta} numberOfLines={1} accessibilityLabel={navLabel}>
                {navLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

export function ComplianceDocumentWorkspace({
  summaries,
  tripFacts,
  organizationId,
  actorId,
  canVerify,
  canViewDocuments,
  onChanged,
  stacked = false,
  mobileExclusive = false,
  mobileReviewing = false,
  style,
  canManageFinance = false,
  hideCommercials = false,
  groundOpsDocumentLock = false,
  /** False on Compliance Pending queue chip only — hide Finance tab for every trip in that stage. */
  showFinanceTab = true,
  canManagePod = false,
  canEditTripFiles = false,
  showHardCopyPodLog = false,
  compliancePendingQueue = false,
  showPodClientValidation = false,
  podVerificationLayout = false,
  settlementLayout = false,
  finalSettlement = false,
  chargesReview = false,
  onChargesSaved,
  onRevalidated,
  onProceededToSettlement,
  onPayBalance,
  onPodNotFound,
  showHardcopyPodButton = false,
  logHardCopyPodRequest = 0,
  courierLrOptions = [],
  onPay,
  onConfirmPayment,
  paymentSubmitting = false,
  onRejectCompliance,
  onResubmitCompliance,
  onFlagForCompliance,
  onClearFinanceFlag,
  onDeclineCompliance,
  onMarkComplianceVerified,
  onFinanceVerify,
  onUndoFinanceVerify,
  financeVerifySubmitting = false,
  defaultPreview = "document",
  defaultFinanceList = false,
  hideDocumentDecisions = false,
  hideDocumentPanes = false,
  selectedTripId = null,
  onSelectedTripChange,
  chargeFocusTripId = null,
  chargeFocusToken = 0,
  focusTab = null,
  focusToken = 0,
  onReviewTripDocs,
  listHeader = null,
  detailHeader = null,
  pageHeader = null,
  onOpenActivityLog,
  onOpenTrip,
  onOpenSupplier,
}: {
  summaries: ComplianceTripSummary[];
  /** Resolved by the page for the full queue — one lookup pass, not one per view. */
  tripFacts: ComplianceListTripFacts;
  /** Pinned above the trip cards (e.g. Verified-stage outcome filter). */
  listHeader?: React.ReactNode;
  /** Phone page chrome that scrolls with the list or document review. */
  pageHeader?: React.ReactNode;
  /** Pinned above the right-hand body (Awaiting POD age filters). */
  detailHeader?: React.ReactNode;
  organizationId: string;
  actorId: string | null;
  canVerify: boolean;
  canViewDocuments: boolean;
  /** Exactly what changed, so the pipeline patches only the affected inputs. */
  onChanged: (change: ComplianceChange) => void;
  stacked?: boolean;
  /** Phone layout: list and review are exclusive full-screen panes. */
  mobileExclusive?: boolean;
  /** Phone layout: trip review is open (list is hidden). */
  mobileReviewing?: boolean;
  style?: StyleProp<ViewStyle>;
  canManageFinance?: boolean;
  /** Ground Ops: no rates, profit, supplier bank details or Advance Payment preview. */
  hideCommercials?: boolean;
  /** Ground Ops: existing trip files lock in transit / after approval (groundOpsDocumentLock.util). */
  groundOpsDocumentLock?: boolean;
  /**
   * Finance documents tab. Off only while the page filter is Compliance Pending
   * (includes Declined-by-finance trips that still have verified_at).
   */
  showFinanceTab?: boolean;
  /** Log hard-copy POD — Compliance role (and owner/admin) only. */
  canManagePod?: boolean;
  /** Upload / Replace / Remove trip files. Ground Ops: document view, not only resubmit. */
  canEditTripFiles?: boolean;
  /** True while the POD queue can log hard copy (POD Pending, or All on an awaiting trip). */
  showHardCopyPodLog?: boolean;
  /** True while the Compliance queue filter is Compliance Pending (hides the Finance tab for every listed trip). */
  compliancePendingQueue?: boolean;
  /** True only while the Compliance queue filter is POD Received. */
  showPodClientValidation?: boolean;
  /** POD Verification: preview soft/hard POD + log + notify-style plan. */
  podVerificationLayout?: boolean;
  /** Settlement Verification: POD charges preview + CN/DN, no log form. */
  settlementLayout?: boolean;
  /** Final Settlement: same layout, payable summary, no create / revalidate. */
  finalSettlement?: boolean;
  /** Charges stay as text until Edit. */
  chargesReview?: boolean;
  /** POD Received save: parent moves the trip to the next stage. */
  onChargesSaved?: (tripId: string) => void;
  onRevalidated?: (tripId: string) => void;
  onProceededToSettlement?: (tripId: string) => void;
  onPayBalance?: (summary: ComplianceTripSummary, amount: number) => void;
  onPodNotFound?: (tripId: string) => void;
  /**
   * PREVIEW-row Hardcopy POD control — Awaiting POD / POD Received /
   * Balance Pending / Settled only (not Verified → Payment Pending).
   */
  showHardcopyPodButton?: boolean;
  /**
   * Increments when the page bar asks to create a hard-copy POD log
   * for the selected Awaiting POD trip.
   */
  logHardCopyPodRequest?: number;
  /** Awaiting POD LRs that can share one courier docket. Trip IDs come from these rows. */
  courierLrOptions?: HardCopyPodLrOption[];
  onPay?: (summary: ComplianceTripSummary) => void;
  /** Inline Confirm payment from Advance Payment panel (no popup). */
  onConfirmPayment?: (
    summary: ComplianceTripSummary,
    category: ComplianceLedgerCategory,
    values: CompliancePaymentConfirmValues,
  ) => void | Promise<void>;
  paymentSubmitting?: boolean;
  /** Reject a verified trip with a remark (keeps Verified stage, red card). */
  onRejectCompliance?: (tripId: string, reason: string) => Promise<void>;
  /** Ground Ops, Document Upload → Declined by finance only. */
  onResubmitCompliance?: (tripId: string, note: string) => Promise<void>;
  /** Finance: flag a verified trip for Compliance review (throws on failure). */
  onFlagForCompliance?: (tripId: string, note: string) => Promise<void>;
  /** Compliance: clear a finance flag. */
  onClearFinanceFlag?: (tripId: string) => Promise<void>;
  /** Decline the whole trip while it is still in Compliance Pending. */
  onDeclineCompliance?: (tripId: string, reason: string) => Promise<void>;
  /** Marks the trip Compliance Verified once all required docs are approved. */
  /** Resolves `false` when verification failed (the handler already alerted). */
  onMarkComplianceVerified?: (tripId: string) => Promise<boolean | void>;
  /** Finance approval of a Compliance Verified trip (moves it to Finance Verified). */
  onFinanceVerify?: (tripId: string) => Promise<void>;
  /** Undo Finance Verify while no advance is posted. */
  onUndoFinanceVerify?: (tripId: string) => Promise<void>;
  financeVerifySubmitting?: boolean;
  /**
   * What opens first when a trip is selected: its documents, the Finance
   * documents tab (Advance Verification), or the advance payment form
   * (Advance Payment).
   */
  defaultPreview?: "document" | "advance";
  /** Open with the Finance documents tab selected on the left (Advance Verification). */
  defaultFinanceList?: boolean;
  /** Advance Verification: documents are view-only, so hide group Approve / Decline. */
  hideDocumentDecisions?: boolean;
  /** Hide the document checklist + preview (Debit control works POD only). */
  hideDocumentPanes?: boolean;
  /** Trip to show when opening the card view from the table. */
  selectedTripId?: string | null;
  /**
   * A card was tapped. The page keeps its selection in step, so its stale
   * `selectedTripId` can't snap the list back to the previously focused trip.
   */
  onSelectedTripChange?: (tripId: string) => void;
  /** Trip to select after a charge save moves it to Balance Pending. */
  chargeFocusTripId?: string | null;
  chargeFocusToken?: number;
  /** Tab to open with that trip. Applied once per `focusToken`. */
  focusTab?: "trip" | "vehicle" | "driver" | null;
  focusToken?: number;
  /** Open document review for upload — trip / vehicle / driver vault. */
  onReviewTripDocs?: (
    tripId: string,
    documentKey: string | null,
    scope?: "trip" | "vehicle" | "driver",
  ) => void;
  onOpenActivityLog?: (summary: ComplianceTripSummary) => void;
  /** Open the trip page from Trip ID. */
  onOpenTrip?: (tripId: string) => void;
  /** Open the supplier page from the supplier name. */
  onOpenSupplier?: (supplierId: string) => void;
}) {
  const listRef = useRef<ScrollView>(null);
  const listViewportH = useRef(0);
  const listContentH = useRef(0);
  const scrolledTripId = useRef<string | null>(null);
  const listResetKey = useMemo(
    () => summaries.map((item) => item.trip.id).join(","),
    [summaries],
  );
  const {
    visibleItems: listWindowItems,
    hasMore: listHasMore,
    loadingMore: listLoadingMore,
    allLoaded: listAllLoaded,
    loadMore: loadMoreList,
    revealThrough: revealListThrough,
  } = useComplianceListWindow(summaries, { resetKey: listResetKey });
  const appliedFocusToken = useRef(0);
  const focusUploadTypeRef = useRef<string | null>(null);
  const appliedChargeFocus = useRef(0);
  const appliedSelectedTripId = useRef<string | null>(selectedTripId ?? null);
  const { truckTypeByVehicleId, supplierNameByTripId } = tripFacts;
  const clientsQuery = useClientsQuery(organizationId);
  const suppliersQuery = useSuppliersQuery(organizationId);
  const linkedOrgByOrganizationId = useLinkedOrgProfileMap(
    clientsQuery.data ?? [],
    suppliersQuery.data ?? [],
  );
  const _partyAvatarByTripId = useMemo(() => {
    const clientById = new Map((clientsQuery.data ?? []).map((row) => [row.id, row]));
    const supplierById = new Map((suppliersQuery.data ?? []).map((row) => [row.id, row]));
    const next: Record<string, ListCardPartyAvatar> = {};
    for (const item of summaries) {
      next[item.trip.id] = resolveListCardPartyAvatar(
        item.trip,
        supplierNameByTripId[item.trip.id] ?? null,
        clientById,
        supplierById,
        linkedOrgByOrganizationId,
      );
    }
    return next;
  }, [
    clientsQuery.data,
    linkedOrgByOrganizationId,
    summaries,
    supplierNameByTripId,
    suppliersQuery.data,
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(selectedTripId ?? summaries[0]?.trip.id ?? null);
  const [docFilter, setDocFilter] = useState<DocFilter>("all");
  const [docIndex, setDocIndex] = useState(0);
  const [checklistKey, setChecklistKey] = useState<string | null>(null);
  const [mobileDocPane, setMobileDocPane] = useState<"list" | "preview">("list");
  const [checklistPreviewMode, setChecklistPreviewMode] = useState<ChecklistPreviewMode>("document");
  const financeList = docFilter === "finance";
  const showAllDocs = docFilter === "all";
  const tab: DocTab =
    docFilter === "vehicle" || docFilter === "driver" ? docFilter : "trip";
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [_toolLabel, setToolLabel] = useState<"rotate" | "refresh" | null>(null);
  const resetPreviewView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setToolLabel("refresh");
  }, []);
  const applyDocFilter = useCallback(
    (next: DocFilter) => {
      setDocFilter((current) => (next !== "all" && next === current ? "all" : next));
      setChecklistPreviewMode("document");
      resetPreviewView();
      setScreenOpen(false);
      if (mobileExclusive) setMobileDocPane("list");
    },
    [mobileExclusive, resetPreviewView],
  );
  useEffect(() => {
    setToolLabel(null);
  }, [checklistKey]);
  const [screenOpen, setScreenOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingFinanceType, setUploadingFinanceType] = useState<string | null>(null);
  /** Document type whose files dialog is open (eye on a grouped row). */
  const [_filesModalType, setFilesModalType] = useState<string | null>(null);
  const [categoryPreview, setCategoryPreview] = useState<{
    files: VaultCategoryPreviewFile[];
    index: number;
    type: string;
  } | null>(null);
  const [_fileActionKey, setFileActionKey] = useState<string | null>(null);
  /** Files dialog to reopen when the full-screen viewer opened from it closes. */
  const filesModalReturnRef = useRef<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [rowDeclineTarget, setRowDeclineTarget] = useState<ComplianceDocRow | null>(null);
  const [approveConfirm, setApproveConfirm] = useState<ComplianceReviewGroup | null>(null);
  const [tripDeclineOpen, setTripDeclineOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  /** File upload/delete log since hold/reject — loaded when Resubmit modal opens. */
  const [resubmitChangeLog, setResubmitChangeLog] = useState<ResubmitChangeLog | null>(null);
  const [resubmitChangeLogReady, setResubmitChangeLogReady] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [podOpen, setPodOpen] = useState(false);
  const [_podLogRound, _setPodLogRound] = useState(0);
  const [expiryPrompt, setExpiryPrompt] = useState<{
    docType: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  /** Optimistic decisions so Approve/Decline feel instant before pipeline refetch. */
  const [localDecisionByKey, setLocalDecisionByKey] = useState<
    Record<string, OptimisticComplianceDecision>
  >({});
  const previewCacheRef = useRef<Map<string, PreviewCacheEntry>>(new Map());
  const [declineTarget, setDeclineTarget] = useState<ComplianceReviewGroup>("required");
  /** Group Approve/Decline in flight — drives the spinner on that group's button only. */
  const [groupBusy, setGroupBusy] = useState<{
    group: ComplianceReviewGroup;
    decision: OptimisticComplianceDecision["decision"];
  } | null>(null);
  const [markingVerified, setMarkingVerified] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<{ tone: "progress" | "success"; text: string } | null>(
    null,
  );
  const podRequestSeen = useRef(0);

  const summary = summaries.find((item) => item.trip.id === selectedId) ?? summaries[0] ?? null;
  const showLogHardCopyPod =
    showHardCopyPodLog && summary != null && tripAppearsInAwaitingPod(summary);
  const selectedPodReceived =
    summary != null &&
    Boolean(summary.hardCopyPod.received) &&
    summary.hardCopyPod.chargesSaved !== true;
  const showValidationPane =
    showPodClientValidation &&
    (!showLogHardCopyPod || selectedPodReceived) &&
    summary?.stage !== "payment_settled";

  useEffect(() => {
    if (!logHardCopyPodRequest || logHardCopyPodRequest === podRequestSeen.current) return;
    if (!showLogHardCopyPod) return;
    podRequestSeen.current = logHardCopyPodRequest;
    setPodOpen(true);
  }, [logHardCopyPodRequest, showLogHardCopyPod]);
  const isPendingDocsTrip = Boolean(summary && verificationStatusVisual(summary).kind === "pending_docs");
  const rows = useMemo(() => (summary ? rowsForTab(summary, tab) : []), [summary, tab]);
  const entityUnassigned =
    !showAllDocs &&
    ((tab === "vehicle" && !summary?.trip.vehicle_id) ||
      (tab === "driver" && !summary?.trip.driver_id));
  /** Same dual-pane shell (tabs + upload pill + list | preview) on every tab and stage. */
  const showDocumentShell = Boolean(summary);
  const showEntityUnassigned = Boolean(summary && entityUnassigned);
  /** Trip/Vehicle/Driver list always uses vault rows inside the shared shell. */
  const checklistRows = useMemo(() => {
    if (!showDocumentShell || showEntityUnassigned) return [];
    return rows;
  }, [showDocumentShell, showEntityUnassigned, rows]);
  const [supplierBankProof, setSupplierBankProof] = useState<{
    previewPath: string | null;
    detailLine: string | null;
    kycDocId: string | null;
    supplierId: string | null;
    status: string | null;
    fileName: string | null;
    createdAt: string | null;
    accountNumber: string | null;
    ifsc: string | null;
    bankName: string | null;
    beneficiaryName: string | null;
    branchName: string | null;
    onFile: boolean;
  } | null>(null);
  const [supplierBankLoading, setSupplierBankLoading] = useState(false);
  const [supplierBankRevision, setSupplierBankRevision] = useState(0);
  const bankSupplierId = (summary?.trip.supplier_id ?? "").trim();
  const bankLiveRefresh = Boolean(summary && !PRE_VERIFIED_STAGES.has(summary.stage));
  useEffect(() => {
    if (!bankSupplierId || !bankLiveRefresh) return;
    return subscribeSupplierBankChanged((changedId) => {
      if (changedId === bankSupplierId) setSupplierBankRevision((n) => n + 1);
    });
  }, [bankSupplierId, bankLiveRefresh]);

  useEffect(() => {
    let cancelled = false;
    const orgId = (summary?.trip.organization_id ?? organizationId ?? "").trim();
    const supplierId = (summary?.trip.supplier_id ?? "").trim();
    if (!summary || !orgId || !supplierId || hideCommercials) {
      setSupplierBankProof(null);
      setSupplierBankLoading(false);
      return;
    }
    const cacheKey = `${orgId}:${supplierId}`;
    const cached = supplierBankProofCache.get(cacheKey);
    if (cached) {
      setSupplierBankProof(cached);
      setSupplierBankLoading(false);
    } else {
      setSupplierBankLoading(true);
    }
    const stage = summary.stage;
    void fetchSupplierBankProofBundle(orgId, supplierId)
      .then(async (bundle) => {
        const branchName = PRE_VERIFIED_STAGES.has(stage)
          ? ""
          : await resolveBankBranch(bundle.account?.branch_name, bundle.account?.ifsc_code);
        if (cancelled) return;
        const next = {
          beneficiaryName: bundle.account?.beneficiary_name?.trim() || null,
          branchName: branchName || null,
          previewPath: bundle.previewPath,
          detailLine: bundle.detailLine,
          kycDocId: bundle.kycDoc?.id ?? null,
          supplierId,
          status: bundle.kycDoc?.status ?? null,
          fileName: bundle.kycDoc?.file_name ?? null,
          createdAt: bundle.kycDoc?.updated_at ?? bundle.kycDoc?.created_at ?? null,
          accountNumber: bundle.account?.account_number?.trim() ?? null,
          ifsc: bundle.account?.ifsc_code?.trim() ?? null,
          bankName: bundle.account?.bank_name?.trim() ?? null,
          onFile: bundle.onFile,
        };
        supplierBankProofCache.set(cacheKey, next);
        setSupplierBankProof(next);
      })
      .finally(() => {
        if (!cancelled) setSupplierBankLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    summary?.trip.id,
    summary?.trip.organization_id,
    summary?.trip.supplier_id,
    summary?.stage,
    organizationId,
    checklistPreviewMode,
    supplierBankRevision,
    hideCommercials,
  ]);

  const financeRows = useMemo(() => {
    if (!summary) return [];
    const base = financeRowsFor(summary, hideCommercials);
    return hideCommercials ? base : mergeFinanceBankDocsFromSupplier(base, supplierBankProof);
  }, [summary, supplierBankProof, hideCommercials]);
  const isFinanceMode =
    showFinanceTab &&
    financeList &&
    !showAllDocs &&
    summary?.stage !== "compliance_pending" &&
    !compliancePendingQueue;
  const canEditFiles = isFinanceMode
    ? canManageFinance || canEditTripFiles
    : Boolean(onReviewTripDocs) && canEditTripFiles;
  const allDocumentRows = useMemo(() => {
    if (!summary) return [];
    const trip = deriveTripVaultReviewRows(summary.documents);
    const vehicle = summary.trip.vehicle_id
      ? deriveEntityComplianceRows(
          COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
          summary.vehicleDocuments,
        )
      : [];
    const driver = summary.trip.driver_id
      ? deriveEntityComplianceRows(
          COMPLIANCE_DRIVER_DOCUMENT_TYPES,
          summary.driverDocuments,
        )
      : [];
    const finance =
      showFinanceTab && !compliancePendingQueue ? financeRows : [];
    return [...finance, ...trip, ...vehicle, ...driver];
  }, [compliancePendingQueue, financeRows, showFinanceTab, summary]);
  const listRows = showAllDocs
    ? allDocumentRows
    : isFinanceMode
      ? financeRows
      : checklistRows;
  /** More than a few rows: tighten padding so the list still fits above the fixed illustration. */
  const denseChecklist = listRows.length >= 4;

  useEffect(() => {
    if (!showFinanceTab && financeList) {
      setDocFilter("all");
    }
  }, [showFinanceTab, financeList]);
  const reviewScope: DocTab = isFinanceMode ? "trip" : tab;
  const displayListRows = useMemo(
    () =>
      listRows.map((row) =>
        applyOptimisticDecision(row, localDecisionByKey[optimisticKey(reviewScope, row.key)]),
      ),
    [listRows, localDecisionByKey, reviewScope],
  );

  useEffect(() => {
    if (!organizationId || !canViewDocuments) return;
    const withFiles = displayListRows.filter(hasFile);
    const focus = withFiles.findIndex((row) => row.key === checklistKey);
    const start = focus >= 0 ? focus : 0;
    const neighbors = [start, start + 1, start + 2, start - 1]
      .filter((i) => i >= 0 && i < withFiles.length)
      .map((i) => withFiles[i]);
    const seen = new Set<string>();
    for (const row of neighbors) {
      if (!row || seen.has(row.key)) continue;
      seen.add(row.key);
      if (row.doc && !classifyTripDocument(row.doc).hasBinary) continue;
      const path = vaultPreviewPath(row);
      if (!path) continue;
      void signCompliancePreviewUrl({
        storagePath: path,
        source: compliancePreviewSourceForRow(row),
        sourceEntityDocumentId: row.doc?.source_entity_document_id,
        organizationId,
        entityId:
          row.entityDoc?.entity_id ??
          (reviewScope === "vehicle" ? summary?.trip.vehicle_id : summary?.trip.driver_id) ??
          summary?.trip.id,
        docType: row.type,
      });
    }
  }, [
    canViewDocuments,
    checklistKey,
    displayListRows,
    organizationId,
    reviewScope,
    summary?.trip.driver_id,
    summary?.trip.id,
    summary?.trip.vehicle_id,
  ]);
  /** Each tab (Finance, Trip, Vehicle, Driver) uses the same group Approve. */
  const showGroupedReview = !showEntityUnassigned && !showAllDocs;
  const requiredGroupState = useMemo<ComplianceGroupReviewState | null>(
    () =>
      showGroupedReview
        ? complianceGroupReviewState(
            displayListRows.filter((row) => row.required),
            reviewScope,
          )
        : null,
    [showGroupedReview, displayListRows, reviewScope],
  );
  const optionalGroupState = useMemo<ComplianceGroupReviewState | null>(
    () =>
      showGroupedReview
        ? complianceGroupReviewState(
            displayListRows.filter((row) => !row.required),
            reviewScope,
          )
        : null,
    [showGroupedReview, displayListRows, reviewScope],
  );
  const checklistSelectedRow = useMemo(() => {
    if (!showDocumentShell || showEntityUnassigned) return null;
    return listRows.find((row) => row.key === checklistKey) ?? null;
  }, [showDocumentShell, showEntityUnassigned, listRows, checklistKey]);
  const previewable = useMemo(() => {
    if (!showDocumentShell || showEntityUnassigned) return [];
    return listRows.filter(hasFile);
  }, [showDocumentShell, showEntityUnassigned, listRows]);
  const activeRow = !showDocumentShell || showEntityUnassigned
    ? null
    : checklistSelectedRow && hasFile(checklistSelectedRow)
        ? checklistSelectedRow
      : null;
  useEffect(() => {
    if (!chargeFocusToken || !chargeFocusTripId) return;
    if (appliedChargeFocus.current === chargeFocusToken) return;
    if (!summaries.some((item) => item.trip.id === chargeFocusTripId)) return;
    appliedChargeFocus.current = chargeFocusToken;
    setSelectedId(chargeFocusTripId);
  }, [chargeFocusToken, chargeFocusTripId, summaries]);

  useEffect(() => {
    if (
      selectedTripId &&
      selectedTripId !== appliedSelectedTripId.current &&
      summaries.some((item) => item.trip.id === selectedTripId)
    ) {
      appliedSelectedTripId.current = selectedTripId;
      setSelectedId(selectedTripId);
      return;
    }
    if (!summaries.some((item) => item.trip.id === selectedId)) {
      setSelectedId(summaries[0]?.trip.id ?? null);
    }
  }, [summaries, selectedId, selectedTripId]);

  useEffect(() => {
    const id = selectedTripId ?? selectedId;
    if (!id) return;
    const index = summaries.findIndex((item) => item.trip.id === id);
    if (index >= 0) revealListThrough(index);
  }, [revealListThrough, selectedId, selectedTripId, summaries]);

  const fillListIfShort = useCallback(() => {
    if (!listHasMore || listLoadingMore) return;
    if (listViewportH.current < 1 || listContentH.current < 1) return;
    if (listContentH.current <= listViewportH.current + 24) loadMoreList();
  }, [listHasMore, listLoadingMore, loadMoreList]);

  useEffect(() => {
    fillListIfShort();
  }, [fillListIfShort, listWindowItems.length]);

  const onListScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      listContentH.current = contentSize.height;
      listViewportH.current = layoutMeasurement.height;
      if (!listHasMore || listLoadingMore) return;
      if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 160) {
        loadMoreList();
      }
    },
    [listHasMore, listLoadingMore, loadMoreList],
  );

  const selectListTrip = useCallback(
    (tripId: string) => {
      appliedSelectedTripId.current = tripId;
      setSelectedId(tripId);
      onSelectedTripChange?.(tripId);
      setDocFilter("all");
      setChecklistPreviewMode(defaultPreview);
    setDocIndex(0);
      resetPreviewView();
      // Debit control: no side pane — tapping a trip opens Log hard copy POD.
      if (hideDocumentPanes && showHardCopyPodLog) setPodOpen(true);
    },
    [
      defaultPreview,
      resetPreviewView,
      hideDocumentPanes,
      showHardCopyPodLog,
      onSelectedTripChange,
    ],
  );

  useEffect(() => {
    if (!focusToken || !focusTab || appliedFocusToken.current === focusToken) return;
    appliedFocusToken.current = focusToken;
    setDocFilter(focusTab);
    setChecklistPreviewMode("document");
    resetPreviewView();
    setScreenOpen(false);
  }, [focusTab, focusToken, resetPreviewView]);

  useEffect(() => {
    setLocalDecisionByKey({});
    setMobileDocPane("list");
  }, [summary?.trip.id]);

  useEffect(() => {
    if (!mobileReviewing) setMobileDocPane("list");
  }, [mobileReviewing]);

  useEffect(() => {
    if (compliancePendingQueue) {
      setDocFilter((current) => (current === "finance" ? "all" : current));
      setChecklistPreviewMode((mode) => (mode === "advance" ? "document" : mode));
    }
  }, [compliancePendingQueue]);

  useEffect(() => {
    setDocIndex(0);
    resetPreviewView();
    setDeclineOpen(false);
    setRowDeclineTarget(null);
    setRejectOpen(false);
    setExpiryPrompt((prev) => {
      prev?.resolve(null);
      return null;
    });
  }, [summary?.trip.id, tab, resetPreviewView]);

  useEffect(() => {
    setDocFilter("all");
    setChecklistPreviewMode(defaultPreview);
  }, [summary?.trip.id, defaultPreview]);

  useEffect(() => {
    if (verifyNotice?.tone !== "success") return;
    const timer = setTimeout(() => setVerifyNotice(null), 3200);
    return () => clearTimeout(timer);
  }, [verifyNotice]);

  useEffect(() => {
    if (!showDocumentShell || showEntityUnassigned) {
      setChecklistKey(null);
      return;
    }
    const pool = listRows;
    setChecklistKey((prev) => {
      const focusType = focusUploadTypeRef.current;
      if (focusType) {
        const newest = [...pool]
          .filter((row) => row.type === focusType && hasFile(row))
          .sort((a, b) => {
            const aAt = a.doc?.uploaded_at ?? a.entityDoc?.created_at ?? "";
            const bAt = b.doc?.uploaded_at ?? b.entityDoc?.created_at ?? "";
            return bAt.localeCompare(aAt);
          })[0];
        const typed = newest ?? pool.find((row) => row.type === focusType);
        if (typed) {
          focusUploadTypeRef.current = null;
          return typed.key;
        }
      }
      const retargeted = retargetCompliancePreviewKey(pool, prev);
      if (retargeted) return retargeted;
      const firstWithFile = pool.find(hasFile);
      const firstMissing = pool.find((row) => row.status === "missing");
      return firstWithFile?.key ?? firstMissing?.key ?? pool[0]?.key ?? null;
    });
  }, [
    showDocumentShell,
    showEntityUnassigned,
    checklistPreviewMode,
    listRows,
    summary?.trip.id,
    docFilter,
  ]);

  const activePreviewPath = activeRow ? vaultPreviewPath(activeRow) : null;
  const activePreviewSource = compliancePreviewSourceForRow(activeRow);
  const activePreviewEntityId =
    activeRow?.entityDoc?.entity_id ??
    (reviewScope === "vehicle" ? summary?.trip.vehicle_id : summary?.trip.driver_id) ??
    summary?.trip.id ??
    null;
  const activePreviewDocType = activeRow?.type ?? null;
  const activePreviewSourceEntityId = activeRow?.doc?.source_entity_document_id ?? null;
  const activePreviewMimeHint = activeRow?.doc?.mime_type ?? null;
  // Details-only trip docs have no binary to sign — they render via typedDetailsLines.
  const activePreviewHasBinary = !activeRow?.doc || classifyTripDocument(activeRow.doc).hasBinary;

  useEffect(() => {
    if (!activePreviewPath || !activePreviewHasBinary || !canViewDocuments || !organizationId) {
      setPreviewUrl(null);
      setPreviewMime(null);
      setPreviewError(null);
      setLoadingPreview(false);
      return;
    }
    const cached = readPreviewCache(previewCacheRef.current, activePreviewPath);
    if (cached) {
      setPreviewUrl(cached.url);
      setPreviewMime(cached.mime);
      setPreviewError(null);
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError(null);
    void signCompliancePreviewUrl({
      storagePath: activePreviewPath,
      source: activePreviewSource,
      sourceEntityDocumentId: activePreviewSourceEntityId,
      organizationId,
      entityId: activePreviewEntityId,
      docType: activePreviewDocType,
    }).then((url) => {
      if (cancelled) return;
      const mime = guessCompliancePreviewMime(activePreviewPath, activePreviewMimeHint);
      if (url) {
        writePreviewCache(previewCacheRef.current, activePreviewPath, url, mime);
        setPreviewError(null);
      } else {
        setPreviewError(
          "Could not load this file. If it was just replaced, select it again or reopen the trip.",
        );
      }
      setPreviewUrl(url);
      setPreviewMime(mime);
      setLoadingPreview(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    activePreviewPath,
    activePreviewHasBinary,
    activePreviewSource,
    activePreviewSourceEntityId,
    activePreviewEntityId,
    activePreviewDocType,
    activePreviewMimeHint,
    canViewDocuments,
    organizationId,
    previewEpoch,
  ]);

  // Prefetch the next file so Approve → Next feels instant.
  useEffect(() => {
    if (!canViewDocuments || !organizationId || previewable.length < 2) return;
    const nextRow = previewable[(docIndex + 1) % previewable.length];
    if (nextRow?.doc && !classifyTripDocument(nextRow.doc).hasBinary) return;
    const path = nextRow ? vaultPreviewPath(nextRow) : null;
    if (!path || readPreviewCache(previewCacheRef.current, path)) return;
    let cancelled = false;
    void signCompliancePreviewUrl({
      storagePath: path,
      source: compliancePreviewSourceForRow(nextRow),
      sourceEntityDocumentId: nextRow.doc?.source_entity_document_id,
      organizationId,
      entityId:
        nextRow.entityDoc?.entity_id ??
        (reviewScope === "vehicle" ? summary?.trip.vehicle_id : summary?.trip.driver_id) ??
        summary?.trip.id,
      docType: nextRow.type,
    }).then((url) => {
      if (cancelled || !url) return;
      writePreviewCache(previewCacheRef.current, path, url, guessCompliancePreviewMime(path, nextRow.doc?.mime_type));
    });
    return () => {
      cancelled = true;
    };
  }, [
    canViewDocuments,
    organizationId,
    previewable,
    docIndex,
    reviewScope,
    summary?.trip.id,
    summary?.trip.vehicle_id,
    summary?.trip.driver_id,
  ]);

  const goNext = () => {
    if (previewable.length === 0) return;
    if (showDocumentShell) {
      const current = Math.max(
        0,
        previewable.findIndex((row) => row.key === checklistKey),
      );
      const next = previewable[(current + 1) % previewable.length];
      if (next) {
        setChecklistKey(next.key);
        setChecklistPreviewMode("document");
      }
      resetPreviewView();
      return;
    }
    setDocIndex((index) => (index + 1) % previewable.length);
    resetPreviewView();
  };
  const goPrev = () => {
    if (previewable.length === 0) return;
    if (showDocumentShell) {
      const current = Math.max(
        0,
        previewable.findIndex((row) => row.key === checklistKey),
      );
      const prev = previewable[(current - 1 + previewable.length) % previewable.length];
      if (prev) {
        setChecklistKey(prev.key);
        setChecklistPreviewMode("document");
      }
      resetPreviewView();
      return;
    }
    setDocIndex((index) => (index - 1 + previewable.length) % previewable.length);
    resetPreviewView();
  };

  const promptExpiryDate = useCallback((docType: string) => {
    return new Promise<string | null>((resolve) => {
      setExpiryPrompt({ docType, resolve });
    });
  }, []);

  /** One Approve write (trip doc, vehicle vault or entity doc). Alerts on failure; caller owns `busy`. */
  const writeApproval = async (row: ComplianceDocRow, sync = true): Promise<boolean> => {
    if (!summary || !actorId) return false;
    const tripId = summary.trip.id;

    if (reviewScope === "trip") {
        if (!row.doc) {
          alertMessage("Couldn't approve document", "This trip document has no uploaded file.");
        return false;
        }
        const { error } = await setTripDocumentVerification({
          document: row.doc,
          organizationId,
          actorId,
          status: "verified",
        });
        if (error) {
          alertMessage("Couldn't approve document", error.message);
        return false;
        }
      if (sync) {
        onChanged({ type: "tripDocumentDecision", tripId, documentId: row.doc.id, status: "verified", actorId });
      }
      return true;
    }
    if (row.entityDoc?.source === "vehicle-vault" && summary.trip.vehicle_id) {
      const vehicleId = summary.trip.vehicle_id;
      const marked = await approveComplianceVehicleDocument({
        orgId: organizationId,
        vehicleId,
        docType: row.type,
        actorId,
        vehicleDocuments: summary.vehicleDocuments,
      });
      if (marked.error) {
        alertMessage("Couldn't approve document", marked.error.message);
        return false;
      }
      if (sync) onChanged({ type: "vehicleDocuments", vehicleId });
      return true;
    }
    if (
      row.entityDoc?.id &&
      row.entityDoc.source !== "driver-kyc" &&
      (row.entityDoc.entity_type === "vehicle" || row.entityDoc.entity_type === "driver")
    ) {
        const { error } = await verifyDocument(row.entityDoc.id, actorId);
        if (error) {
          alertMessage("Couldn't approve document", error.message);
        return false;
      }
      if (sync) {
        onChanged(
          entityDocumentChange({
            entity_type: row.entityDoc.entity_type,
            entity_id: row.entityDoc.entity_id,
          }),
        );
      }
      return true;
    }
    alertMessage("Couldn't approve document", "This document can't be approved from this preview.");
    return false;
  };

  /** One Decline write. Alerts on failure; caller owns `busy`. */
  const writeDecline = async (row: ComplianceDocRow, note: string): Promise<boolean> => {
    if (!summary || !actorId) return false;
    const tripId = summary.trip.id;
    if (reviewScope === "trip") {
        if (!row.doc) {
          alertMessage("Couldn't decline document", "This trip document has no uploaded file.");
        return false;
        }
        const { error } = await setTripDocumentVerification({
          document: row.doc,
          organizationId,
          actorId,
          status: "rejected",
          rejectionReason: note,
        });
        if (error) {
          alertMessage("Couldn't decline document", error.message);
        return false;
        }
        onChanged({
          type: "tripDocumentDecision",
          tripId,
          documentId: row.doc.id,
          status: "rejected",
          actorId,
          rejectionReason: note,
        });
      return true;
    }
    if (row.entityDoc?.source === "vehicle-vault") {
        alertMessage(
          "Couldn't decline document",
          "Replace this file from the vehicle vault, or upload a new copy.",
        );
      return false;
    }
    if (
      row.entityDoc?.id &&
      row.entityDoc.source !== "driver-kyc" &&
      (row.entityDoc.entity_type === "vehicle" || row.entityDoc.entity_type === "driver")
    ) {
        const { error } = await rejectDocument(row.entityDoc.id, note);
        if (error) {
          alertMessage("Couldn't decline document", error.message);
        return false;
        }
        onChanged(entityDocumentChange(row.entityDoc));
      return true;
    }
        alertMessage("Couldn't decline document", "This document can't be declined from this preview.");
    return false;
  };

  /**
   * Once every required trip document is approved, move the trip to Verified.
   * `approvedKeys` covers approvals the pipeline refetch hasn't reflected yet.
   * Also re-verifies a finance-declined trip (Verified Reject) so it returns to Verified.
   */
  const autoVerifyIfRequiredApproved = async (approvedKeys: string[]) => {
    // Compliance Pending moves on only when the user presses Verify.
    if (summary?.stage === "compliance_pending" && !isFinanceDeclinedTrip(summary)) return;
    if (!summary || !onMarkComplianceVerified || reviewScope !== "trip") return;
    const alreadyCleanVerified =
      Boolean(summary.complianceVerifiedAt) && !isFinanceDeclinedTrip(summary);
    if (alreadyCleanVerified) return;
    const requiredRows = deriveComplianceDocumentRows(summary.documents).filter((row) => row.required);
    if (requiredRows.length === 0) return;
    const approved = new Set(approvedKeys);
    const allApproved = requiredRows.every(
      (row) =>
        approved.has(row.key) ||
        applyOptimisticDecision(row, localDecisionByKey[optimisticKey("trip", row.key)]).status === "verified",
    );
    if (!allApproved) return;
    const tripLabel = getTripDisplayNumber(summary.trip, summary.trip.organization_id ?? null);
    setVerifyNotice({ tone: "progress", text: `All required documents approved · moving ${tripLabel} to Verified` });
    setMarkingVerified(true);
    try {
      const result = await onMarkComplianceVerified(summary.trip.id);
      setVerifyNotice(
        result === false ? null : { tone: "success", text: `${tripLabel} moved to Verified` },
      );
    } catch {
      setVerifyNotice(null);
    } finally {
      setMarkingVerified(false);
    }
  };

  const ensureCanModerate = (title: string, verb: string): boolean => {
    if (!canVerify) {
      alertMessage(title, "You don't have permission to verify compliance documents.");
      return false;
    }
    if (!actorId) {
      alertMessage(title, `Sign in again, then try ${verb}.`);
      return false;
    }
    return true;
  };

  /** Raw (server) rows behind a group's actionable list — optimistic overlays must not be re-recorded. */
  const groupActionableRows = (group: ComplianceReviewGroup): ComplianceDocRow[] => {
    const state = group === "required" ? requiredGroupState : optionalGroupState;
    if (!state) return [];
    const keys = new Set(state.actionable.map((row) => row.key));
    return listRows.filter((row) => keys.has(row.key));
  };

  const approveGroup = async (group: ComplianceReviewGroup) => {
    if (!summary || busy) return;
    if (!ensureCanModerate("Can't approve", "Approve")) return;
    const scope = reviewScope;
    const tripId = summary.trip.id;
    const vehicleId = summary.trip.vehicle_id;
    const driverId = summary.trip.driver_id;
    const targets = groupActionableRows(group).filter(
      (row) =>
        complianceReviewDecisionActions(
          applyOptimisticDecision(row, localDecisionByKey[optimisticKey(scope, row.key)]),
        ).canApprove,
    );
    if (targets.length === 0) return;
    // Paint Approved before the network round-trip so the tab badge does not wait on the queue.
    setLocalDecisionByKey((prev) => {
      const next = { ...prev };
      for (const row of targets) next[optimisticKey(scope, row.key)] = recordOptimisticDecision(row, "verified");
      return next;
    });
    setBusy(true);
    setGroupBusy({ group, decision: "verified" });
    const approved: ComplianceDocRow[] = [];
    try {
      const results = await Promise.all(
        targets.map(async (row) => ({ row, ok: await writeApproval(row, false) })),
      );
      const failedKeys: string[] = [];
      for (const { row, ok } of results) {
        if (ok) approved.push(row);
        else failedKeys.push(optimisticKey(scope, row.key));
      }
      if (failedKeys.length > 0) {
        setLocalDecisionByKey((prev) => {
          const next = { ...prev };
          for (const key of failedKeys) delete next[key];
          return next;
        });
      }
    } finally {
      setGroupBusy(null);
      setBusy(false);
    }
    if (approved.length === 0) return;
    if (scope === "trip") onChanged({ type: "tripDocuments", tripId });
    else if (scope === "vehicle" && vehicleId) onChanged({ type: "vehicleDocuments", vehicleId });
    else if (scope === "driver" && driverId) onChanged({ type: "driverDocuments", driverId });
    void autoVerifyIfRequiredApproved(approved.map((row) => row.key));
  };

  const openDecline = (target: ComplianceReviewGroup) => {
    setDeclineTarget(target);
    setDeclineOpen(true);
  };

  const declineWithReason = async (reason: string) => {
    if (!summary || busy) return;
    const target = declineTarget;
    if (!ensureCanModerate("Can't decline", "Decline")) return;
    const note = reason.trim();
    if (!note) {
      alertMessage("Can't decline", "A rejection reason is required.");
        return;
      }

    const targets = groupActionableRows(target).filter(
      (row) =>
        complianceReviewDecisionActions(
          applyOptimisticDecision(row, localDecisionByKey[optimisticKey(reviewScope, row.key)]),
        ).canDecline,
    );
    if (targets.length === 0) {
      setDeclineOpen(false);
      return;
    }
    setDeclineOpen(false);
    setBusy(true);
    setGroupBusy({ group: target, decision: "rejected" });
    const declined: ComplianceDocRow[] = [];
    try {
      for (const row of targets) {
        if (!(await writeDecline(row, note))) break;
        declined.push(row);
      }
    } finally {
      if (declined.length > 0) {
        setLocalDecisionByKey((prev) => {
          const next = { ...prev };
          for (const row of declined) {
            next[optimisticKey(reviewScope, row.key)] = recordOptimisticDecision(row, "rejected", note);
          }
          return next;
        });
      }
      setGroupBusy(null);
      setBusy(false);
    }
  };

  const declineSingleRow = async (reason: string) => {
    if (!summary || busy || !rowDeclineTarget) return;
    if (!ensureCanModerate("Can't decline", "Decline")) return;
    const note = reason.trim();
    if (!note) {
      alertMessage("Can't decline", "A rejection reason is required.");
      return;
    }
    const displayed = applyOptimisticDecision(
      rowDeclineTarget,
      localDecisionByKey[optimisticKey(reviewScope, rowDeclineTarget.key)],
    );
    const ids = singleComplianceRowDeclineIds(displayed, listRows, reviewScope);
    const selectedId = displayed.doc?.id ?? displayed.entityDoc?.id;
    if (ids.length !== 1 || !selectedId || ids[0] !== selectedId) {
      setRowDeclineTarget(null);
      return;
    }
    setRowDeclineTarget(null);
    setBusy(true);
    try {
      if (await writeDecline(displayed, note)) {
        setLocalDecisionByKey((prev) => ({
          ...prev,
          [optimisticKey(reviewScope, displayed.key)]: recordOptimisticDecision(displayed, "rejected", note),
        }));
      }
    } finally {
      setBusy(false);
    }
  };

  const approveSingleRow = async (row: ComplianceDocRow) => {
    if (!summary || busy) return;
    if (!ensureCanModerate("Can't approve", "Approve")) return;
    const displayed = applyOptimisticDecision(row, localDecisionByKey[optimisticKey(reviewScope, row.key)]);
    if (!complianceReviewDecisionActions(displayed).canApprove) return;
    setBusy(true);
    try {
      if (await writeApproval(displayed)) {
        setLocalDecisionByKey((prev) => ({
          ...prev,
          [optimisticKey(reviewScope, displayed.key)]: recordOptimisticDecision(displayed, "verified"),
        }));
        void autoVerifyIfRequiredApproved([displayed.key]);
      }
    } finally {
      setBusy(false);
    }
  };

  const docTitle = activeRow
    ? isFinanceMode
      ? labelForFinanceDocType(activeRow.type)
      : labelForDocType(activeRow.type)
    : "No document";
  const isPdf = (previewMime ?? "").includes("pdf");
  const readiness = summary ? deriveComplianceQueueReadiness(summary) : null;
  const typedLines = typedDetailsLines(activeRow);
  const vaultHeaderNumbers = activeRow
    ? complianceVaultDocNumbers(summary?.documents ?? [], activeRow.type)
    : [];
  const typedPrimary = typedLines ? primaryTypedLine(typedLines)?.value : undefined;
  const previewHeaderFacts = formatDocumentHeaderFacts({
    numbers:
      vaultHeaderNumbers.length > 0
        ? vaultHeaderNumbers
        : typedPrimary
          ? [typedPrimary]
          : [],
    category: activeRow?.type,
    expiryDate:
      activeRow?.entityDoc?.expiry_date ??
      typedLines?.find((line) => /valid/i.test(line.label))?.value ??
      null,
  });
  const activeDecisionRow = activeRow
    ? applyOptimisticDecision(activeRow, localDecisionByKey[optimisticKey(reviewScope, activeRow.key)])
    : null;
  const showRowDecline = Boolean(
    activeDecisionRow &&
      canShowSingleRowDecline({
        canVerify,
        hideDocumentDecisions,
        row: activeDecisionRow,
        scope: reviewScope,
      }),
  );
  const showRowApprove = Boolean(
    canVerify &&
      !hideDocumentDecisions &&
      activeDecisionRow &&
      canModerateComplianceRow(activeDecisionRow, reviewScope) &&
      complianceReviewDecisionActions(activeDecisionRow).canApprove,
  );
  const rowDecisionButtons = complianceDecisionButtonState(activeDecisionRow);
  const financeBankSelected =
    isFinanceMode && checklistSelectedRow?.type === "bank_docs";
  const showBankPayeeDetails = Boolean(summary && !PRE_VERIFIED_STAGES.has(summary.stage));
  const supplierBankAccountRows =
    financeBankSelected && supplierBankProof
      ? (
          [
            ...(showBankPayeeDetails
              ? [{ label: "Beneficiary", value: supplierBankProof.beneficiaryName?.trim() || "" }]
              : []),
            {
              label: "Account number",
              value: supplierBankProof.accountNumber?.trim() || "",
            },
            { label: "IFSC", value: supplierBankProof.ifsc?.trim() || "" },
            { label: "Bank name", value: supplierBankProof.bankName?.trim() || "" },
            ...(showBankPayeeDetails
              ? [{ label: "Branch", value: supplierBankProof.branchName?.trim() || "" }]
              : []),
          ] as { label: string; value: string }[]
        ).filter((row) => row.value.length > 0)
      : [];
  const showSupplierBankPanel =
    financeBankSelected &&
    (supplierBankAccountRows.length > 0 ||
      Boolean(supplierBankProof?.detailLine?.trim()) ||
      Boolean(supplierBankProof?.onFile) ||
      supplierBankLoading);
  const supplierBankVerified =
    (supplierBankProof?.status ?? "").toLowerCase() === "verified" ||
    checklistSelectedRow?.status === "verified";
  const supplierLabelForBank =
    (supplierNameByTripId[summary?.trip.id ?? ""] ?? summary?.trip.supplier_name)?.trim() || "Supplier";
  const showPay = Boolean(
    canManageFinance && readiness?.paymentReady && summary && (onConfirmPayment || onPay),
  );
  const readyPaymentCategory = readiness?.readyCategory ?? null;
  // Hide Reject once any advance is on file (Finance-posted, including before verify).
  // Who may reject is decided by the page: onRejectCompliance is only passed to
  // Compliance (mark verified) or Finance (trip_compliance.finance.reject). It
  // used to also require canVerify, which hid Reject from Finance entirely.
  const showReject = Boolean(
    summary?.complianceVerifiedAt &&
      !isComplianceVerifiedRejected(summary) &&
      !summary.advance &&
      !summary.advanceBeforeVerification &&
      !summary.balance &&
      onRejectCompliance,
  );
  const isCompliancePendingStage = summary?.stage === "compliance_pending";
  /** Compliance Pending look (no Finance / Advance / POD) — trip stage or the page filter. */
  const compliancePendingView = isCompliancePendingStage || compliancePendingQueue;
  const tabMarkedApproved = useMemo(() => {
    const none = { finance: false, trip: false, vehicle: false, driver: false };
    if (!summary || !isCompliancePendingStage || summary.complianceVerifiedAt) return none;
    const overlay = (rows: ComplianceDocRow[], scope: DocTab) =>
      rows.map((row) => applyOptimisticDecision(row, localDecisionByKey[optimisticKey(scope, row.key)]));
    return {
      finance: false,
      trip: complianceTabMarkedApproved(overlay(deriveTripVaultReviewRows(summary.documents), "trip"), "trip"),
      vehicle: summary.trip.vehicle_id
        ? complianceTabMarkedApproved(
            overlay(deriveEntityComplianceRows(COMPLIANCE_VEHICLE_DOCUMENT_TYPES, summary.vehicleDocuments), "vehicle"),
            "vehicle",
          )
        : false,
      driver: summary.trip.driver_id
        ? complianceTabMarkedApproved(
            overlay(deriveEntityComplianceRows(COMPLIANCE_DRIVER_DOCUMENT_TYPES, summary.driverDocuments), "driver"),
            "driver",
          )
        : false,
    };
  }, [isCompliancePendingStage, localDecisionByKey, summary]);
  /** Declined documents on the Trip / Vehicle / Driver tabs — prefill for the trip Decline. */
  const tripDeclinePrefill = useMemo(() => {
    if (!summary) return null;
    const items: { label: string; reason: string }[] = [];
    const collect = (rows: ComplianceDocRow[], scope: DocTab, prefix: string) => {
      for (const row of rows) {
        const reason = complianceRowDeclineReason(row, localDecisionByKey[optimisticKey(scope, row.key)]);
        if (reason) items.push({ label: `${prefix}${labelForDocType(row.type)}`, reason });
      }
    };
    collect(deriveTripVaultReviewRows(summary.documents), "trip", "");
    if (summary.trip.vehicle_id) {
      collect(deriveEntityComplianceRows(COMPLIANCE_VEHICLE_DOCUMENT_TYPES, summary.vehicleDocuments), "vehicle", "Vehicle ");
    }
    if (summary.trip.driver_id) {
      collect(deriveEntityComplianceRows(COMPLIANCE_DRIVER_DOCUMENT_TYPES, summary.driverDocuments), "driver", "Driver ");
    }
    if (items.length === 0) return null;
    return {
      ...mergeDeclinedDocumentReasons(items),
      summaryText: groupDeclinedReasonLines(items).join("\n"),
    };
  }, [localDecisionByKey, summary]);
  const allTabsApproved =
    tabMarkedApproved.trip &&
    tabMarkedApproved.vehicle &&
    tabMarkedApproved.driver;
  /** Hold or reject still with Ground Ops: Compliance can look, not act (DB refuses Verify too). */
  const waitingForGroundOps = Boolean(summary && isComplianceAwaitingResubmit(summary));
  const showPendingTripActions = Boolean(
    isCompliancePendingStage && summary && !summary.complianceVerifiedAt && !waitingForGroundOps,
  );
  /** Verified Reject: trip still has verified_at, but must be re-verified to leave Declined by finance. */
  // Re-verify only after Ground Ops resubmitted (the database refuses it before).
  const showFinanceDeclineReVerify = Boolean(
    summary &&
      isFinanceDeclinedTrip(summary) &&
      !isComplianceAwaitingResubmit(summary) &&
      onMarkComplianceVerified,
  );
  const showResubmit = Boolean(
    onResubmitCompliance &&
      summary &&
      isComplianceHoldAwaitingResubmit(summary),
  ) || Boolean(
    onResubmitCompliance &&
      summary &&
      isActiveFinanceReject(summary) &&
      !summary.advance &&
      !summary.balance &&
      !summary.advanceBeforeVerification,
  );
  /**
   * Resubmit needs LR / E-way / Invoice present and not rejected (DB gate).
   * On a Compliance Hold, required vehicle / driver files must also be attached
   * — a replace/upload is enough; missing expiry no longer blocks Resubmit.
   */
  const resubmitBlockedExplain = summary ? explainResubmitBlocked(summary) : null;
  const resubmitBlockedByMissingDocs = Boolean(
    summary && isResubmitBlockedByMissingDocs(summary),
  );

  const resubmitSinceIso = summary?.complianceDeclinedAt?.trim() || "";
  const resubmitTripId = summary?.trip.id ?? "";
  const resubmitOrgId = organizationId || summary?.trip.organization_id || "";

  useEffect(() => {
    if (!resubmitOpen || !summary || !resubmitTripId) {
      setResubmitChangeLog(null);
      setResubmitChangeLogReady(false);
      return;
    }
    if (!resubmitSinceIso) {
      setResubmitChangeLog({ sinceIso: "", items: [] });
      setResubmitChangeLogReady(true);
      return;
    }
    let cancelled = false;
    setResubmitChangeLogReady(false);
    const entityIds = [
      resubmitTripId,
      summary.trip.vehicle_id,
      summary.trip.driver_id,
      ...summary.documents.map((doc) => doc.id),
      ...summary.vehicleDocuments.map((doc) => doc.id),
      ...summary.driverDocuments.map((doc) => doc.id),
    ].filter((id): id is string => Boolean(id));
    const live = resubmitChangeLogFromLiveDocs({
      sinceIso: resubmitSinceIso,
      tripDocuments: summary.documents,
      entityDocuments: [...summary.vehicleDocuments, ...summary.driverDocuments],
    });

    void (async () => {
      let audits: DocumentAuditMilestoneRow[] = [];
      if (resubmitOrgId && entityIds.length > 0) {
        const { data, error } = await supabase()
          .from("document_audit_log")
          .select(
            "id, document_id, action, actor_id, created_at, entity_id, entity_type, notes, metadata",
          )
          .eq("organization_id", resubmitOrgId)
          .in("entity_id", entityIds)
          .gte("created_at", resubmitSinceIso)
          .order("created_at", { ascending: true })
          .limit(120);
        if (!error && data) {
          audits = data as DocumentAuditMilestoneRow[];
        }
      }
      if (cancelled) return;
      setResubmitChangeLog(
        mergeResubmitChangeLog(
          resubmitSinceIso,
          resubmitChangeLogFromAudits(audits, resubmitSinceIso),
          live,
        ),
      );
      setResubmitChangeLogReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // Live docs + decline time drive the log; reopen refreshes when Resubmit opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- summary identity churns; use concrete keys
  }, [
    resubmitOpen,
    resubmitOrgId,
    resubmitSinceIso,
    resubmitTripId,
    summary?.documents,
    summary?.driverDocuments,
    summary?.trip.driver_id,
    summary?.trip.vehicle_id,
    summary?.vehicleDocuments,
  ]);
  /** Ground Ops resubmit note (includes change log) for Compliance / Finance verify. */
  const reviewerResubmitNote =
    summary?.complianceResubmitNote?.trim() &&
    summary.complianceResubmittedAt &&
    summary.complianceDeclinedAt &&
    Date.parse(summary.complianceResubmittedAt) >= Date.parse(summary.complianceDeclinedAt)
      ? summary.complianceResubmitNote.trim()
      : "";

  const showMarkVerified = Boolean(
    !isCompliancePendingStage &&
      !showFinanceDeclineReVerify &&
      !waitingForGroundOps &&
      onMarkComplianceVerified &&
      summary &&
      !summary.complianceVerifiedAt &&
      readiness?.requiredDocs.markVerifiedReady,
  );
  const vaultCopy = TAB_VAULT_COPY[tab];
  const listMissingRows = listRows.filter((row) => row.status === "missing");
  const missingRequiredCount = listMissingRows.filter((row) => row.required).length;
  const missingOptionalCount = listMissingRows.length - missingRequiredCount;
  const uploadedCount = listRows.filter(hasFile).length;
  const onFilePreviewHint = mobileExclusive ? " — tap to preview" : " — preview below";
  const missingHeadline = isFinanceMode
    ? listMissingRows.length === 0
      ? uploadedCount > 0
        ? `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} on file${onFilePreviewHint}`
        : supplierBankLoading
          ? "Loading supplier Banking…"
          : "No Trip Details documents yet"
      : missingRequiredCount > 0
        ? `${missingRequiredCount} required document${missingRequiredCount === 1 ? "" : "s"} not uploaded`
        : `${listMissingRows.length} document${listMissingRows.length === 1 ? "" : "s"} not uploaded`
    : listMissingRows.length === 0
      ? uploadedCount > 0
        ? `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} on file${onFilePreviewHint}`
        : "No documents in this vault yet"
      : missingRequiredCount > 0
        ? `${missingRequiredCount} required document${missingRequiredCount === 1 ? "" : "s"} not uploaded`
        : `${listMissingRows.length} document${listMissingRows.length === 1 ? "" : "s"} not uploaded`;
  const documentsOnFile = listMissingRows.length === 0 && uploadedCount > 0;
  const documentsMissing = listMissingRows.length > 0;
  const missingSubline = isFinanceMode
    ? "Memo · Other Documents · Bank Docs synced from supplier Banking"
    : listMissingRows.length === 0
      ? "Preview a file in the panel, or Add to upload more"
      : missingOptionalCount > 0 && missingRequiredCount > 0
        ? `Plus ${missingOptionalCount} optional from this ${vaultCopy.vaultLabel.toLowerCase()}`
        : vaultCopy.vaultHint;
  /** Upload / Replace in place: file picker → vault write → refetch. No review sheet. */
  /** LR upload dialog (shared with the Trips hub) for the selected trip. */
  const [lrDialogOpen, setLrDialogOpen] = useState(false);
  const uploadVaultDocument = useCallback(
    async (row: ComplianceDocRow) => {
      if (!summary) return;
      if (!actorId) {
        alertMessage("Can't upload", "Sign in again, then try Upload.");
        return;
      }
      if (uploadingFinanceType) return;
      if (groundOpsDocumentLock && !isFinanceMode && tab === "trip" && hasFile(row)) {
        const lock = groundOpsDocumentLockReason({
          trip: {
            status: summary.trip.status,
            compliance_verified_at: summary.complianceVerifiedAt,
            compliance_declined_at: summary.complianceDeclinedAt,
            compliance_resubmitted_at: summary.complianceResubmittedAt ?? null,
            finance_verified_at: summary.financeVerifiedAt ?? null,
          },
          documentStatus: row.doc?.status,
          advancePosted: Boolean(summary.advance || summary.advanceBeforeVerification),
          ownRecentUpload: isOwnRecentUpload(row.doc, actorId),
        });
        if (lock) {
          alertMessage("Can't upload", groundOpsDocumentLockLabel(lock));
          return;
        }
      }
      // LR: same dialog as the Trips hub (LR number + copies, duplicate check),
      // so the number is never left empty after an upload from here.
      if (row.type === "lr" && !isFinanceMode) {
        setChecklistKey(row.key);
        setLrDialogOpen(true);
        return;
      }
      const scope: DocTab = isFinanceMode ? "trip" : tab;
      const entityId =
        scope === "vehicle" ? summary.trip.vehicle_id : scope === "driver" ? summary.trip.driver_id : null;
      if (scope !== "trip" && !entityId) {
        alertMessage("Nothing to upload", vaultCopy.unassignedHint);
        return;
      }
      setUploadingFinanceType(row.key);
      setChecklistKey(row.key);
      try {
        const files = await pickComplianceVaultFiles(row.type);
        if (files.length === 0) return;
        const rowLabel = isFinanceMode
          ? labelForFinanceDocType(row.type)
          : labelForDocType(row.type);
        const existingPreview = listRows
          .filter((item) => item.type === row.type && hasFile(item))
          .map((item) =>
            compliancePreviewFileFromRow(item, rowLabel, canEditFiles && !uploadingFinanceType),
          );
        const drafts: VaultCategoryPreviewFile[] = files.map((file, index) => ({
          id: `draft-${Date.now()}-${index}`,
          fileName: file.fileName,
          categoryLabel: rowLabel,
          previewUri: localVaultFilePreviewUri(file),
          mimeHint: file.mimeType,
          deleteKind: "trip",
        }));
        setCategoryPreview({
          files: [...existingPreview, ...drafts],
          index: existingPreview.length,
          type: row.type,
        });
        setFilesModalType(null);
        if (mobileExclusive) setMobileDocPane("list");
        setScreenOpen(false);

        let expiryDate: string | null = null;
        if (scope !== "trip") {
          const current = row.entityDoc?.expiry_date?.trim() ?? "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(current)) {
            expiryDate = current;
          } else if (documentRequiresExpiry(row.type)) {
            const entered = (await promptExpiryDate(row.type))?.trim() ?? "";
            if (!entered) {
              setCategoryPreview(null);
              return;
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(entered)) {
              alertMessage("Invalid expiry date", "Use YYYY-MM-DD (for example 2027-03-15).");
              return;
            }
            expiryDate = entered;
          }
        }

        for (const [index, file] of files.entries()) {
          await uploadComplianceVaultFile({
            scope,
            type: row.type,
            tripId: summary.trip.id,
            organizationId,
            actorId,
            vehicleId: summary.trip.vehicle_id ?? null,
            entityId,
            existing: index > 0 ? row.entityDoc : null,
            append: index > 0,
            skipVehicleVault: groundOpsDocumentLock,
            file,
            expiryDate,
          });
        }
        invalidateCompliancePreviewCache(
          listRows
            .filter((item) => item.type === row.type)
            .map((item) => item.doc?.storage_path ?? item.entityDoc?.storage_path),
        );
        previewCacheRef.current.clear();
        setPreviewUrl(null);
        setPreviewEpoch((value) => value + 1);
        focusUploadTypeRef.current = row.type;
        resetPreviewView();
        if (mobileExclusive) setMobileDocPane("list");
        setScreenOpen(false);
        onChanged(
          scope === "vehicle" && entityId
            ? { type: "vehicleDocuments", vehicleId: entityId }
            : scope === "driver" && entityId
              ? { type: "driverDocuments", driverId: entityId }
              : { type: "tripDocuments", tripId: summary.trip.id },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed. Try again.";
        alertMessage("Couldn't upload document", message);
      } finally {
        setUploadingFinanceType(null);
      }
    },
    [
      actorId,
      canEditFiles,
      groundOpsDocumentLock,
      isFinanceMode,
      listRows,
      mobileExclusive,
      onChanged,
      organizationId,
      promptExpiryDate,
      summary,
      resetPreviewView,
      tab,
      uploadingFinanceType,
      vaultCopy.unassignedHint,
    ],
  );
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  /** Insurance / FC / licence file on file without the expiry date the checklist needs. */
  const entityRowNeedsExpiry = (row: ComplianceDocRow): boolean =>
    Boolean(
      row.entityDoc &&
        documentRequiresExpiry(row.type) &&
        row.entityDoc.storage_path &&
        row.entityDoc.status !== "rejected" &&
        !row.entityDoc.expiry_date?.trim(),
    );
  /** Saved straight on the entity_documents row (vault-JSON files must be re-uploaded). */
  const canSetEntityExpiry = (row: ComplianceDocRow): boolean =>
    Boolean(
      row.entityDoc &&
        (row.entityDoc.source ?? "entity") === "entity" &&
        UUID_RE.test(row.entityDoc.id),
    );
  const [savingExpiryKey, setSavingExpiryKey] = useState<string | null>(null);
  const addEntityExpiry = useCallback(
    async (row: ComplianceDocRow) => {
      const doc = row.entityDoc;
      if (!summary || !doc || savingExpiryKey) return;
      const entered = (await promptExpiryDate(row.type))?.trim() ?? "";
      if (!entered) return;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entered)) {
        alertMessage("Invalid expiry date", "Use YYYY-MM-DD (for example 2027-03-15).");
        return;
      }
      setSavingExpiryKey(row.key);
      try {
        const { error } = await updateEntityDocumentExpiry(doc.id, entered);
        if (error) {
          alertMessage("Couldn't save expiry date", error.message);
          return;
        }
        onChanged(
          doc.entity_type === "driver"
            ? { type: "driverDocuments", driverId: doc.entity_id }
            : { type: "vehicleDocuments", vehicleId: doc.entity_id },
        );
      } finally {
        setSavingExpiryKey(null);
      }
    },
    [onChanged, promptExpiryDate, savingExpiryKey, summary],
  );

  // The files dialog belongs to one trip and tab.
  useEffect(() => {
    setFilesModalType(null);
    setCategoryPreview(null);
    filesModalReturnRef.current = null;
  }, [summary?.trip.id, tab, financeList]);

  const categoryPreviewType = categoryPreview?.type ?? null;
  useEffect(() => {
    if (!categoryPreviewType) return;
    const label = isFinanceMode
      ? labelForFinanceDocType(categoryPreviewType)
      : labelForDocType(categoryPreviewType);
    const next = listRows
      .filter((item) => item.type === categoryPreviewType && hasFile(item))
      .map((item) => compliancePreviewFileFromRow(item, label, canEditFiles));
    setCategoryPreview((current) => {
      if (!current || current.type !== categoryPreviewType) return current;
      const drafts = current.files.filter((file) => String(file.id).startsWith("draft-"));
      const files = uploadingFinanceType ? [...next, ...drafts] : next.length > 0 ? next : current.files;
      if (
        files.length === current.files.length &&
        files.every(
          (file, index) =>
            file.id === current.files[index]?.id &&
            file.storagePath === current.files[index]?.storagePath,
        )
      ) {
        return current;
      }
      return {
        ...current,
        files,
        index: Math.min(current.index, Math.max(0, files.length - 1)),
      };
    });
  }, [canEditFiles, categoryPreviewType, isFinanceMode, listRows, uploadingFinanceType]);

  /** Trip-scope file as the delete helper's row shape. */
  const tripDocumentForDelete = (row: ComplianceDocRow): TripDocumentRow | null =>
    row.doc
      ? ({
          id: row.doc.id,
          trip_id: row.doc.trip_id,
          file_name: row.doc.file_name,
          storage_path: row.doc.storage_path,
          mime_type: row.doc.mime_type ?? null,
          size_bytes: null,
          uploaded_at: row.doc.uploaded_at,
          uploaded_by: row.doc.uploaded_by ?? null,
          document_type: row.doc.document_type,
        } as TripDocumentRow)
      : null;

  /**
   * Replace one trip file in place: same row, new file, status back to
   * pending, old version kept in the audit log. No second row is created.
   */
  const _replaceTripFile = async (row: ComplianceDocRow) => {
    if (!summary || !row.doc || !actorId) return;
    setFileActionKey(row.key);
    try {
      const file = await pickComplianceVaultFile(row.type);
      if (!file) return;
      const { error } = await uploadTripDocument(
        summary.trip.id,
        actorId,
        file,
        row.type as TripDocumentType,
        row.doc.document_number ?? undefined,
        { replaceDocumentId: row.doc.id, organizationId },
      );
      if (error) {
        alertMessage("Couldn't replace file", error.message);
        return;
      }
      invalidateCompliancePreviewCache([row.doc.storage_path]);
      previewCacheRef.current.clear();
      setPreviewUrl(null);
      setPreviewEpoch((value) => value + 1);
      onChanged({ type: "tripDocuments", tripId: summary.trip.id });
    } catch (err) {
      alertMessage("Couldn't replace file", err instanceof Error ? err.message : "Replace failed. Try again.");
    } finally {
      setFileActionKey(null);
    }
  };

  const removeTripFile = async (row: ComplianceDocRow, label: string) => {
    const old = tripDocumentForDelete(row);
    if (!summary || !old) return;
    const ok = await confirmAction("Remove file?", `${label} (${old.file_name}) will be deleted from this trip.`, "Remove");
    if (!ok) return;
    setFileActionKey(row.key);
    try {
      const { error } = await deleteTripDocument(old);
      if (error) {
        alertMessage("Couldn't remove file", error.message);
        return;
      }
      onChanged({ type: "tripDocuments", tripId: summary.trip.id });
    } finally {
      setFileActionKey(null);
    }
  };

  const removeEntityFile = async (row: ComplianceDocRow, label: string) => {
    const doc = row.entityDoc;
    if (!summary || !doc || doc.entity_type === "supplier") return;
    const place = doc.entity_type === "driver" ? "driver" : "vehicle";
    const ok = await confirmAction(
      "Remove file?",
      `${label} will be deleted from this ${place} profile.`,
      "Remove",
    );
    if (!ok) return;
    setFileActionKey(row.key);
    try {
      const { error } = await deleteComplianceDocument(doc.id, doc.storage_path);
      if (error) {
        alertMessage("Couldn't remove file", error.message);
        return;
      }
      onChanged(entityDocumentChange(doc));
    } finally {
      setFileActionKey(null);
    }
  };

  const previewChecklistRow = useCallback((row: ComplianceDocRow) => {
    setChecklistPreviewMode("document");
    setChecklistKey(row.key);
    if (!hasFile(row)) return;
    resetPreviewView();
    if (mobileExclusive) setMobileDocPane("preview");
  }, [mobileExclusive, resetPreviewView]);
  const financeMemoRow = useMemo(
    () => financeRows.find((row) => row.type === "memo" && hasFile(row)) ?? null,
    [financeRows],
  );
  /** Advance panel Memo "Preview": show the memo in this viewer, not a raw new tab. */
  const previewFinanceMemo = useCallback(() => {
    if (!financeMemoRow) return;
    setDocFilter("finance");
    previewChecklistRow(financeMemoRow);
  }, [financeMemoRow, previewChecklistRow]);
  const openDocumentUploadFromDetails = useCallback(
    (target: { vault: string; type?: string }) => {
      const vault = target.vault.trim().toLowerCase();
      if (vault === "finance") {
        setDocFilter("finance");
        setChecklistPreviewMode("document");
      } else if (vault === "vehicle") {
        setDocFilter("vehicle");
        setChecklistPreviewMode("document");
      } else if (vault === "driver") {
        setDocFilter("driver");
        setChecklistPreviewMode("document");
      } else {
        setDocFilter("trip");
        setChecklistPreviewMode("document");
      }
      if (target.type) focusUploadTypeRef.current = target.type;
      resetPreviewView();
      setScreenOpen(false);
    },
    [resetPreviewView],
  );
  const _tabMissingCounts = useMemo(() => {
    if (!summary) return { all: 0, trip: 0, vehicle: 0, driver: 0, finance: 0 };
    const finance = financeRowsFor(summary, hideCommercials);
    const trip = deriveTripVaultReviewRows(summary.documents).filter((row) => row.status === "missing").length;
    const vehicle = summary.trip.vehicle_id
        ? deriveEntityComplianceRows(COMPLIANCE_VEHICLE_DOCUMENT_TYPES, summary.vehicleDocuments).filter(
            (row) => row.status === "missing",
          ).length
      : 0;
    const driver = summary.trip.driver_id
        ? deriveEntityComplianceRows(COMPLIANCE_DRIVER_DOCUMENT_TYPES, summary.driverDocuments).filter(
            (row) => row.status === "missing",
          ).length
      : 0;
    const financeMissing = finance.filter((row) => row.status === "missing").length;
    return {
      all: trip + vehicle + driver + financeMissing,
      trip,
      vehicle,
      driver,
      finance: financeMissing,
    };
  }, [summary, hideCommercials]);

  const renderChecklistRow = (row: ComplianceDocRow) => {
    const displayRow = applyOptimisticDecision(row, localDecisionByKey[optimisticKey(reviewScope, row.key)]);
    const rowHasFile = hasFile(displayRow);
    // Grey and inert unless the file exists AND this person may view documents.
    const canOpenRowFiles = rowHasFile && canViewDocuments;
    const selected =
      checklistPreviewMode === "document" &&
      checklistKey === displayRow.key;
    const rowLabel =
      isFinanceMode ||
      (COMPLIANCE_FINANCE_DOCUMENT_TYPES as readonly string[]).includes(displayRow.type)
        ? labelForFinanceDocType(displayRow.type)
        : labelForDocType(displayRow.type);
    // One row per type; every file of the type opens in the files dialog.
    const typeFiles = listRows
      .filter((item) => item.type === displayRow.type && hasFile(item))
      .map((item) => applyOptimisticDecision(item, localDecisionByKey[optimisticKey(reviewScope, item.key)]));
    // Single-file rows only; a multi-file type shows each reason in its files dialog.
    const declineReason =
      typeFiles.length > 1
        ? null
        : complianceRowDeclineReason(row, localDecisionByKey[optimisticKey(reviewScope, row.key)]);
    const vaultDetail = isFinanceMode ? financeVaultDetailLine(displayRow) : null;
    const isBankDocs = isFinanceMode && displayRow.type === "bank_docs";
    const bankFromSupplier =
      isBankDocs &&
      Boolean(
        displayRow.entityDoc?.source === "supplier-kyc" || supplierBankProof?.onFile,
      );
    const vaultNumbers =
      reviewScope === "trip"
        ? complianceVaultDocNumbers(summary?.documents ?? [], displayRow.type)
        : [];
    // Memo sits with finance commercials — surface supplier rate on the card.
    const memoSupplierRateFact =
      displayRow.type === "memo" && !hideCommercials && summary?.trip
        ? (() => {
            const commercial = summary.trip as TripCommercialFacts;
            if (commercial.supplier_rate_basis === "per_mt") {
              const perMt = supplierRatePerMtLabel(commercial);
              return {
                label: "Supplier rate",
                value: perMt !== "—" ? `${perMt}/MT` : formatTripInr(commercial.supplier_rate),
              };
            }
            return {
              label: "Supplier rate",
              value: formatTripInr(
                supplierCostTotal(commercial) ?? commercial.supplier_rate,
              ),
            };
          })()
        : null;
    const typePreviews = typeFiles
      .map((item) => vaultPreviewForRow(item, organizationId, summary?.trip.id ?? null, rowLabel))
      .filter((item): item is VaultChooserPreview => Boolean(item));
    const entityType =
      displayRow.type === "license" || displayRow.type === "aadhaar"
        ? "driver"
        : ["rc", "insurance", "fitness", "permit", "pollution", "road_tax"].includes(
              displayRow.type,
            )
          ? "vehicle"
          : "client";
    // Insurance / FC / licence rows without an expiry date (release 2026-10-23).
    const needsExpiry = !isFinanceMode && entityRowNeedsExpiry(displayRow);
    const expiryIso =
      typeFiles
        .map((item) => item.entityDoc?.expiry_date?.trim() ?? "")
        .find((value) => Boolean(value)) ||
      displayRow.entityDoc?.expiry_date?.trim() ||
      null;
    const meta = [
      declineReason ? `Reason: ${declineReason}` : null,
      isBankDocs && supplierBankLoading ? "Fetching supplier Banking…" : null,
      bankFromSupplier && displayRow.status !== "missing" ? "Synced from supplier Banking" : null,
      vaultDetail && vaultNumbers.length === 0 ? vaultDetail : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
  return (
      <View
        key={displayRow.key}
        style={[
          styles.checklistVaultRow,
          selected && styles.checklistVaultRowSelected,
        ]}
      >
        <VaultChooserNotifyRow
          label={rowLabel}
          meta={meta}
          onFile={rowHasFile}
          canUpload={canEditFiles && !uploadingFinanceType && !complianceTypeAddLockReason(displayRow.type)}
          entityType={entityType}
          required={displayRow.required}
          actionText={
            vaultNumbers.length > 0 ? vaultNumbers.join(" · ") : undefined
          }
          detailFact={memoSupplierRateFact}
          expiryDate={expiryIso}
          needsExpiry={documentRequiresExpiry(displayRow.type)}
          preview={typePreviews[0] ?? null}
          previews={typePreviews}
          onPreview={() => {
            if (!canOpenRowFiles) return;
            previewChecklistRow(typeFiles[0] ?? displayRow);
            setScreenOpen(false);
          }}
          onPreviewAt={(index) => {
            if (!canOpenRowFiles) return;
            previewChecklistRow(typeFiles[index] ?? displayRow);
            setScreenOpen(false);
          }}
          onEdit={() => {
            if (!canOpenRowFiles) return;
            setCategoryPreview({
              files: typeFiles.map((item) =>
                compliancePreviewFileFromRow(item, rowLabel, canEditFiles),
              ),
              index: 0,
              type: displayRow.type,
            });
            setFilesModalType(null);
            setScreenOpen(false);
            if (mobileExclusive) setMobileDocPane("list");
          }}
          onAdd={() => void uploadVaultDocument(row)}
          onOpenFull={(index) => {
            const target = typeFiles[index] ?? displayRow;
            previewChecklistRow(target);
            setScreenOpen(true);
          }}
        />
        {canEditFiles && needsExpiry && canSetEntityExpiry(displayRow) ? (
          <Pressable
            style={(state: HoverPressState) => [
              styles.missingUploadBtn,
              styles.checklistExpiryBtn,
              WEB_POINTER,
              WEB_TRANSITION,
              savingExpiryKey === displayRow.key && styles.btnDisabled,
              isHovered(state) && !savingExpiryKey && styles.missingUploadBtnHover,
            ]}
            disabled={Boolean(savingExpiryKey)}
            onPress={() => void addEntityExpiry(displayRow)}
            accessibilityRole="button"
            accessibilityLabel={`Add expiry date for ${rowLabel}`}
            accessibilityState={{ busy: savingExpiryKey === displayRow.key }}
          >
            {savingExpiryKey === displayRow.key ? (
              <ActivityIndicator size="small" color={Theme.buttonDarkText} />
            ) : null}
            <Text style={styles.missingUploadBtnText}>
              {savingExpiryKey === displayRow.key ? "Saving…" : "Add expiry"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderReviewGroupHeader = (group: ComplianceReviewGroup, total: number) => {
    const state = group === "required" ? requiredGroupState : optionalGroupState;
    const title = group === "required" ? "REQUIRED DOCUMENTS" : "OPTIONAL DOCUMENTS";
    const plural = total === 1 ? "" : "s";
    const meta = !state
      ? `${total} document${plural}`
      : state.phase === "awaiting_uploads"
        ? `${state.total - state.missing} of ${state.total} uploaded · upload all to review`
        : state.phase === "approved"
          ? `All ${state.total} approved`
          : state.phase === "declined"
            ? "Declined · replace the files or approve"
            : `${state.total} uploaded · ready`;
    const showActions = Boolean(
      canVerify &&
      !hideDocumentDecisions &&
      !waitingForGroundOps &&
      summary?.stage !== "pending_for_docs" &&
      state &&
      (state.phase === "review" || state.phase === "declined"),
    );
    const approving = groupBusy?.group === group && groupBusy.decision === "verified";
    const declining = groupBusy?.group === group && groupBusy.decision === "rejected";
    const declined = state?.phase === "declined";
    const groupLabel = group === "required" ? "required" : "optional";
    return (
      <View style={[styles.reviewGroupHeader, denseChecklist && styles.reviewGroupHeaderDense]}>
        <View style={styles.reviewGroupCopy}>
          <Text style={styles.reviewGroupTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text
            style={[
              styles.reviewGroupMeta,
              state?.phase === "approved" && styles.reviewGroupMetaApproved,
              declined && styles.reviewGroupMetaDeclined,
            ]}
            numberOfLines={1}
          >
            {meta}
          </Text>
        </View>
        {state?.phase === "approved" && !hideDocumentDecisions ? (
          <View style={styles.reviewGroupApprovedPill} accessibilityLabel={`All ${groupLabel} documents approved`}>
            <Check size={12} color={Theme.accentGold} strokeWidth={2.8} />
            <Text style={styles.reviewGroupApprovedText}>Approved</Text>
          </View>
        ) : null}
        {showActions && state ? (
          <View style={styles.reviewGroupActions}>
            <TouchableOpacity
              style={[
                styles.reviewGroupDecline,
                declined && styles.reviewGroupDeclineActive,
                (!state.canDecline || busy) && !declined && styles.btnDisabled,
              ]}
              activeOpacity={0.8}
              disabled={busy || !state.canDecline}
              onPress={() => openDecline(group)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`Decline all ${groupLabel} documents`}
              accessibilityState={{ disabled: busy || !state.canDecline, selected: declined }}
            >
              {declining ? (
                <ActivityIndicator size="small" color={Theme.actionBtnInk} />
              ) : (
                <Text style={[styles.reviewGroupDeclineText, declined && styles.reviewGroupDeclineTextActive]}>
                  {declined ? "Declined" : "Decline"}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reviewGroupApprove, (!state.canApprove || busy) && styles.btnDisabled]}
              activeOpacity={0.85}
              disabled={busy || !state.canApprove}
              onPress={() => setApproveConfirm(group)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`Approve all ${groupLabel} documents`}
              accessibilityState={{ disabled: busy || !state.canApprove }}
            >
              {approving ? (
                <ActivityIndicator size="small" color={Theme.buttonDarkText} />
              ) : (
                <Text style={styles.reviewGroupApproveText}>Approve</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  /** Trip / Ground Ops lock for one file: same rules as the former files dialog (the database enforces them too). */
  const complianceFileLockReason = (row: ComplianceDocRow): string | null => {
    const isTripFile = Boolean(row.doc);
    const entityDoc = row.entityDoc;
    const isOwnedEntityFile =
      Boolean(entityDoc) &&
      !isTripFile &&
      entityDoc?.entity_type !== "supplier" &&
      entityDoc?.source !== "supplier-kyc";
    if (!isTripFile && !isOwnedEntityFile) return null;
    if (row.status === "verified") return "Approved files are locked";
    const groundOpsLock =
      groundOpsDocumentLock && summary && isTripFile
        ? groundOpsDocumentLockReason({
            trip: {
              status: summary.trip.status,
              compliance_verified_at: summary.complianceVerifiedAt,
              compliance_declined_at: summary.complianceDeclinedAt,
              compliance_resubmitted_at: summary.complianceResubmittedAt ?? null,
              finance_verified_at: summary.financeVerifiedAt ?? null,
            },
            documentStatus: row.doc?.status,
            advancePosted: Boolean(summary.advance || summary.advanceBeforeVerification),
            ownRecentUpload: isOwnRecentUpload(row.doc, actorId),
          })
        : null;
    if (groundOpsLock) return groundOpsDocumentLockLabel(groundOpsLock);
    const verifiedLock = Boolean(
      summary?.complianceVerifiedAt &&
        !isComplianceAwaitingResubmit(summary) &&
        REQUIRED_COMPLIANCE_DOCUMENT_TYPES.includes(row.type),
    );
    return verifiedLock ? "Locked after the trip is verified" : null;
  };

  /**
   * Ground Ops may not add another file over a locked type; a rejected file or a
   * trip back for resubmit reopens it (only a file that is neither rejected nor
   * this user's own recent upload blocks adding).
   */
  const complianceTypeAddLockReason = (type: string): string | null => {
    if (!groundOpsDocumentLock || !summary) return null;
    const blocking = listRows.filter(
      (row) =>
        row.type === type &&
        row.doc &&
        row.doc.status !== "rejected" &&
        !isOwnRecentUpload(row.doc, actorId),
    );
    if (blocking.length === 0) return null;
    const lock = groundOpsDocumentLockReason({
      trip: {
        status: summary.trip.status,
        compliance_verified_at: summary.complianceVerifiedAt,
        compliance_declined_at: summary.complianceDeclinedAt,
        compliance_resubmitted_at: summary.complianceResubmittedAt ?? null,
        finance_verified_at: summary.financeVerifiedAt ?? null,
      },
      advancePosted: Boolean(summary.advance || summary.advanceBeforeVerification),
    });
    return lock ? groundOpsDocumentLockLabel(lock) : null;
  };

  const mobileListOnly = mobileExclusive && !mobileReviewing;
  const mobileDetailOnly = mobileExclusive && mobileReviewing;
  const splitEnabled = !stacked && !mobileExclusive;

  return (
    <View
      style={[
        styles.workspace,
        stacked && styles.workspaceStacked,
        mobileExclusive && styles.workspaceMobile,
        style,
      ]}
    >
      {mobileDetailOnly && mobileDocPane !== "preview" ? pageHeader : null}
      {mobileDetailOnly ? null : (
      <View
        style={[
          styles.listPane,
          !mobileExclusive && styles.listPaneFill,
          stacked && !mobileExclusive && styles.listPaneStacked,
          mobileExclusive && styles.listPaneMobile,
          hideDocumentPanes && !showValidationPane && styles.listPaneFull,
        ]}
      >
        {mobileExclusive ? null : listHeader}
        {summaries.length === 0 ? (
          mobileExclusive ? (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listEmptyMobileContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {listHeader}
              <View style={styles.listEmptyMobileBody}>
                <NoTripsFoundEmpty compact={false} />
              </View>
            </ScrollView>
          ) : (
          <View style={styles.listEmpty}>
            <NoTripsFoundEmpty compact={stacked} />
          </View>
          )
        ) : (
        <ScrollView
          ref={listRef}
          style={styles.listScroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          contentContainerStyle={[styles.listContent, mobileExclusive && styles.listContentMobile]}
          scrollEventThrottle={16}
          onScroll={onListScroll}
          onLayout={(event) => {
            listViewportH.current = event.nativeEvent.layout.height;
            fillListIfShort();
          }}
          onContentSizeChange={(_width, height) => {
            listContentH.current = height;
            fillListIfShort();
          }}
        >
          {mobileExclusive ? listHeader : null}
          {listWindowItems.map((item) => (
            <View
              key={item.trip.id}
              onLayout={
                !mobileExclusive && item.trip.id === selectedTripId
                  ? (event) => {
                      if (scrolledTripId.current === selectedTripId) return;
                      scrolledTripId.current = selectedTripId;
                      listRef.current?.scrollTo({
                        y: Math.max(0, event.nativeEvent.layout.y - 8),
                        animated: true,
                      });
                    }
                  : undefined
              }
            >
              <View style={hubMobileListCanvasStyles.cardWrap}>
                <ComplianceTripCard
                summary={item}
                  compact
                  selected={!mobileExclusive && item.trip.id === summary?.trip.id}
                  onReviewDocuments={(group) => {
                    selectListTrip(item.trip.id);
                    onReviewTripDocs?.(item.trip.id, null, group);
                  }}
                  onViewTrip={() => selectListTrip(item.trip.id)}
                  onOpenDetails={() => selectListTrip(item.trip.id)}
                  onPay={onPay ? () => onPay(item) : undefined}
                  onMarkComplianceVerified={
                    onMarkComplianceVerified
                      ? () => onMarkComplianceVerified(item.trip.id)
                      : undefined
                  }
                  canManageFinance={canManageFinance}
                  onOpenActivityLog={
                    onOpenActivityLog ? () => onOpenActivityLog(item) : undefined
                  }
                />
              </View>
            </View>
          ))}
          {listLoadingMore ? (
            <View style={styles.listLoadMore} accessibilityLabel="Loading more trips">
              <ActivityIndicator size="small" color={Theme.textMuted} />
            </View>
          ) : null}
          {listHasMore && !listLoadingMore ? (
            <View
              style={styles.listLoadSentinel}
              onLayout={() => fillListIfShort()}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}
          {listAllLoaded && summaries.length > COMPLIANCE_QUEUE_WINDOW_SIZE ? (
            <Text style={styles.listLoadEnd}>All trips loaded</Text>
          ) : null}
        </ScrollView>
        )}
      </View>
      )}

      {mobileListOnly ? null : podVerificationLayout && summary ? (
        <View style={[styles.previewPane, styles.podLogPane, mobileExclusive && styles.podLogPaneMobile]}>
          <PodVerificationPane
            summary={summary}
            organizationId={organizationId}
            actorId={actorId}
            canManage={canManagePod}
            tripFacts={tripFacts}
            courierLrOptions={courierLrOptions}
            stacked={stacked}
            mobileExclusive={mobileExclusive}
            chargesReview={chargesReview}
            onChanged={(tripId) => void onChanged({ type: "hardCopyPod", tripId })}
            onChargesSaved={onChargesSaved}
            onPodNotFound={(tripId) => {
              void onChanged({ type: "podNotFound", tripId });
              void onChanged({ type: "hardCopyPod", tripId });
              onPodNotFound?.(tripId);
            }}
            onOpenActivityLog={onOpenActivityLog ? () => onOpenActivityLog(summary) : undefined}
          />
                    </View>
      ) : settlementLayout && summary ? (
        <View style={[styles.previewPane, styles.podLogPane, mobileExclusive && styles.podLogPaneMobile]}>
          <PodVerificationPane
            summary={summary}
            organizationId={organizationId}
            actorId={actorId}
            canManage={canManageFinance || canManagePod}
            tripFacts={tripFacts}
            courierLrOptions={courierLrOptions}
            stacked={stacked}
            mobileExclusive={mobileExclusive}
            settlementMode
            finalSettlement={finalSettlement}
            onOpenActivityLog={onOpenActivityLog ? () => onOpenActivityLog(summary) : undefined}
            onChanged={(tripId) => void onChanged({ type: "hardCopyPod", tripId })}
            onRevalidated={(tripId) => {
              void onChanged({ type: "podRevalidate", tripId });
              void onChanged({ type: "hardCopyPod", tripId });
              onRevalidated?.(tripId);
            }}
            onProceededToSettlement={(tripId) => {
              void onChanged({ type: "settlementReleased", tripId });
              void onChanged({ type: "hardCopyPod", tripId });
              onProceededToSettlement?.(tripId);
            }}
            onPayBalance={(amount) => onPayBalance?.(summary, amount)}
            canPayBalance={canManageFinance && !summary.balance}
            payingBalance={paymentSubmitting}
          />
          </View>
      ) : showValidationPane ? (
        <View style={[styles.previewPane, styles.podLogPane, mobileExclusive && styles.podLogPaneMobile]}>
          {summary ? (
            <PodClientValidationPanel
              organizationId={organizationId}
              actorId={actorId}
              tripId={summary.trip.id}
              displayId={getTripDisplayNumber(summary.trip, organizationId || null)}
              startDate={summary.trip.pickup_date ?? summary.trip.started_at ?? null}
              deliveryDate={summary.trip.completed_at ?? null}
              clientName={summary.trip.client_name?.trim() || ""}
              routeLabel={[summary.trip.pickup_area?.trim(), summary.trip.drop_location?.trim()]
                .filter(Boolean)
                .join(" → ")}
              clientPrice={Number(summary.trip.client_price) || 0}
              supplierRate={Number(summary.trip.supplier_rate) || 0}
              supplierRateBasis={
                (summary.trip as { supplier_rate_basis?: string | null }).supplier_rate_basis ?? null
              }
              loadTons={summary.trip.load_tons ?? null}
              tripOrganizationId={summary.trip.organization_id}
              ibond={summary.hardCopyPod.ibond === true}
              reviewMode={chargesReview}
              onSaved={() => {
                const tripId = summary.trip.id;
                void onChanged({ type: "podChargesSaved", tripId });
                void onChanged({ type: "tripFlags", tripId });
                onChargesSaved?.(tripId);
              }}
            />
          ) : (
            <View style={styles.emptyStage}>
              <NoDocumentPreviewEmpty
                compact={stacked}
                title="No trip selected"
                hint="Select a trip to review its charges."
              />
                </View>
            )}
          </View>
      ) : showHardCopyPodLog && !hideDocumentPanes ? (
        <View style={[styles.detailColumn, stacked && styles.detailColumnStacked]}>
          {detailHeader}
          <View style={[styles.previewPane, styles.podLogPane, styles.detailPaneFill, mobileExclusive && styles.podLogPaneMobile]}>
          {summary && showLogHardCopyPod ? (
            <PodVerificationPane
              key={summary.trip.id}
              summary={summary}
              organizationId={organizationId}
              actorId={actorId}
              canManage={canManagePod}
              tripFacts={tripFacts}
              courierLrOptions={courierLrOptions}
              stacked={stacked}
              mobileExclusive={mobileExclusive}
              previewOnly
              onChanged={(tripId) => void onChanged({ type: "hardCopyPod", tripId })}
              onOpenActivityLog={onOpenActivityLog ? () => onOpenActivityLog(summary) : undefined}
            />
          ) : (
            <View style={styles.emptyStage}>
              <NoDocumentPreviewEmpty
                compact={stacked}
                title="No trip selected"
                hint="Select an Awaiting POD trip to log its hard copy POD."
              />
              </View>
          )}
            </View>
        </View>
      ) : hideDocumentPanes ? null : (
      <View style={[styles.previewPane, mobileExclusive && styles.podLogPaneMobile]}>
        <View style={styles.stage}>
          {showDocumentShell ? (
            <View
                      style={[
                styles.checklistStage,
                stacked && styles.checklistStageStacked,
                mobileExclusive && styles.checklistStageMobile,
              ]}
            >
              <AdjustableSplitLayout
                storageKey="compliance.documentCards"
                enabled={splitEnabled}
                stacked={stacked || mobileExclusive}
                sizedPane="start"
                defaultSize={420}
                defaultRatio={0.5}
                minSize={280}
                maxSize={720}
                start={
                  mobileExclusive && mobileDocPane === "preview" ? null : (
                        <ScrollView
                          scrollEnabled
                          style={[
                  styles.checklistListPane,
                  splitEnabled && styles.checklistListPaneSplit,
                  stacked && styles.checklistListPaneStacked,
                  mobileExclusive && styles.checklistListPaneMobile,
                ]}
                          contentContainerStyle={styles.checklistPageScroll}
                          keyboardShouldPersistTaps="handled"
                          showsVerticalScrollIndicator
                          nestedScrollEnabled
              >
                <View style={[styles.checklistPanelToolbar, styles.checklistPanelToolbarMobile]}>
                    <View style={styles.docScopeTabRow} accessibilityRole="tablist">
                      {(
                        [
                          { key: "all" as const, label: "All" },
                          ...(showFinanceTab && !compliancePendingView
                            ? [{ key: "finance" as const, label: "Finance" }]
                            : []),
                          ...TABS,
                        ] as const
                      ).map((item) => {
                        const active = docFilter === item.key;
              return (
                <Pressable
                  key={item.key}
                            onPress={() => applyDocFilter(item.key)}
                            style={(state: HoverPressState) => [
                              styles.docScopeTab,
                              active && styles.docScopeTabActive,
                              WEB_POINTER,
                              isHovered(state) && !active && styles.docScopeTabHover,
                            ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                            accessibilityLabel={`Show ${item.label} documents`}
                          >
                            <Text
                              style={[styles.docScopeTabText, active && styles.docScopeTabTextActive]}
                              numberOfLines={1}
                            >
                              {item.label}
                      </Text>
                </Pressable>
              );
            })}
          </View>
                    {summary && onOpenActivityLog ? (
                      <ComplianceActivityLogButton hub onPress={() => onOpenActivityLog(summary)} />
            ) : null}
                </View>
            {showEntityUnassigned ? (
                  <View style={[styles.missingHeader, styles.missingHeaderMobile]}>
                    <Text style={styles.missingTitle}>{vaultCopy.unassignedTitle}</Text>
                    <Text style={[styles.missingHint, styles.missingHintMobile]}>
                      {vaultCopy.unassignedHint}
                </Text>
              </View>
            ) : (
              <>
                    <View style={[styles.missingHeader, styles.missingHeaderMobile]}>
                      <View style={[styles.missingTitleRow, styles.missingTitleRowMobile]}>
                        <Text style={styles.missingTitle}>
                          {isFinanceMode ? "Trip details" : "Documents to upload"}
                        </Text>
                        <View
                      style={[
                            styles.missingCountChip,
                            documentsMissing && styles.missingCountChipNeed,
                            documentsOnFile && styles.missingCountChipReady,
                          ]}
                    >
                      <Text
                        style={[
                              styles.missingCountChipText,
                              documentsMissing && styles.missingCountChipTextNeed,
                              documentsOnFile && styles.missingCountChipTextReady,
                        ]}
                        numberOfLines={1}
                      >
                            {listMissingRows.length > 0
                              ? `${listMissingRows.length} to upload`
                        : `${uploadedCount} on file`}
                      </Text>
                  </View>
                </View>
                      <Text
                          style={[
                          styles.missingSubtitle,
                          documentsOnFile && styles.missingSubtitleReady,
                          documentsMissing && styles.missingSubtitleMissing,
                        ]}
                        numberOfLines={2}
                      >
                    {missingHeadline}
                  </Text>
                          <Text
                    style={[styles.missingHint, styles.missingHintMobile]}
                    numberOfLines={2}
                  >
                    {missingSubline}
                  </Text>
                </View>
                    {verifyNotice ? (
                      <View
                            style={[
                          styles.verifyNotice,
                          verifyNotice.tone === "success" && styles.verifyNoticeSuccess,
                        ]}
                        accessibilityLiveRegion="polite"
                      >
                        {verifyNotice.tone === "progress" ? (
                          <ActivityIndicator size="small" color={Theme.positive} />
                        ) : (
                          <View style={styles.verifyNoticeIcon}>
                            <Check size={11} color={Theme.cardWhite} strokeWidth={3} />
                          </View>
                        )}
                        <Text style={styles.verifyNoticeText} numberOfLines={2}>
                          {verifyNotice.text}
                          </Text>
                        </View>
                      ) : null}
                <View
                  style={[
                    styles.checklistDocsContent,
                    styles.checklistDocsContentMobile,
                  ]}
                >
                    {showGroupedReview
                      ? (["required", "optional"] as const).map((group) => {
                          const requiredTypes = new Set(
                            listRows.filter((row) => row.required).map((row) => row.type),
                          );
                          const groupRows = listRows.filter((row) => {
                            const withRequiredType = requiredTypes.has(row.type);
                            return group === "required" ? withRequiredType : !withRequiredType;
                          });
                          if (groupRows.length === 0) return null;
                      return (
                            <View
                              key={group}
                              style={[styles.reviewGroup, group === "optional" && styles.reviewGroupSpaced]}
                            >
                              {renderReviewGroupHeader(group, groupRows.length)}
                              {firstRowPerType(groupRows).map(renderChecklistRow)}
                            </View>
                          );
                        })
                      : firstRowPerType(listRows).map(renderChecklistRow)}
                </View>
                    <View
                      style={[
                        styles.checklistPreviewActionsSection,
                        mobileExclusive && styles.checklistPreviewActionsSectionMobile,
                      ]}
                    >
                      <View style={styles.checklistPreviewActionsGrid}>
                        <Pressable
                          style={(state: HoverPressState) => {
                            const active = checklistPreviewMode === "document";
                            return [
                              styles.checklistModeBtn,
                              WEB_POINTER,
                              WEB_TRANSITION,
                              isHovered(state) && !active && styles.checklistModeBtnHover,
                              active && styles.checklistModeBtnSelected,
                            ];
                          }}
                          onPress={() => {
                            setChecklistPreviewMode("document");
                            if (!checklistKey && previewable[0]) {
                              setChecklistKey(previewable[0].key);
                            }
                            if (mobileExclusive) setMobileDocPane("preview");
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: checklistPreviewMode === "document" }}
                          accessibilityLabel="Preview documents"
                        >
                          <Text
                            style={[
                              styles.checklistModeBtnText,
                              checklistPreviewMode === "document" && styles.checklistModeBtnTextSelected,
                            ]}
                            numberOfLines={1}
                          >
                            Preview
                          </Text>
                        </Pressable>
                        <Pressable
                          style={(state: HoverPressState) => {
                            const active = checklistPreviewMode === "trip";
                            return [
                              styles.checklistModeBtn,
                              WEB_POINTER,
                              WEB_TRANSITION,
                              isHovered(state) && !active && styles.checklistModeBtnHover,
                              active && styles.checklistModeBtnSelected,
                            ];
                          }}
                          onPress={() => {
                            setChecklistPreviewMode("trip");
                            if (mobileExclusive) setMobileDocPane("preview");
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: checklistPreviewMode === "trip" }}
                          accessibilityLabel="Show trip details"
                            >
                              <Text
                                style={[
                              styles.checklistModeBtnText,
                              checklistPreviewMode === "trip" && styles.checklistModeBtnTextSelected,
                                ]}
                            numberOfLines={1}
                              >
                            Trip Detail
                              </Text>
                        </Pressable>
                        {showFinanceTab && !compliancePendingView && !hideCommercials ? (
                          <Pressable
                            style={(state: HoverPressState) => {
                              const active = checklistPreviewMode === "advance";
                              return [
                                styles.checklistModeBtn,
                                WEB_POINTER,
                                WEB_TRANSITION,
                                isHovered(state) && !active && styles.checklistModeBtnHover,
                                active && styles.checklistModeBtnSelected,
                              ];
                            }}
                            onPress={() => {
                              setChecklistPreviewMode("advance");
                              if (mobileExclusive) setMobileDocPane("preview");
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: checklistPreviewMode === "advance" }}
                            accessibilityLabel="Show advance payment details"
                            >
                              <Text
                        style={[
                                styles.checklistModeBtnText,
                                checklistPreviewMode === "advance" && styles.checklistModeBtnTextSelected,
                              ]}
                              numberOfLines={1}
                            >
                              Advance Payment
                              </Text>
                          </Pressable>
                        ) : null}
                        {canManagePod &&
                        showHardcopyPodButton &&
                        !isPendingDocsTrip &&
                        !compliancePendingView ? (
                        <Pressable
                            style={(state: HoverPressState) => [
                              styles.checklistModeBtn,
                              WEB_POINTER,
                              WEB_TRANSITION,
                              isHovered(state) && styles.checklistModeBtnHover,
                            ]}
                            disabled={!summary}
                            onPress={() => setPodOpen(true)}
                          accessibilityRole="button"
                            accessibilityLabel="Log hardcopy POD"
                        >
                            <Text style={styles.checklistModeBtnText} numberOfLines={1}>
                              Hardcopy POD
                            </Text>
                          </Pressable>
                        ) : null}
                        {showMarkVerified && summary ? (
                          <Pressable
                            style={(state: HoverPressState) => [
                              styles.checklistModeBtn,
                              styles.checklistModeBtnActive,
                              WEB_POINTER,
                              WEB_TRANSITION,
                              isHovered(state) && styles.checklistModeBtnActiveHover,
                            ]}
                            disabled={markingVerified}
                            onPress={() => {
                              setMarkingVerified(true);
                              void onMarkComplianceVerified?.(summary.trip.id).finally(() =>
                                setMarkingVerified(false),
                              );
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Mark compliance verified"
                            >
                              <Text
                              style={[styles.checklistModeBtnText, styles.checklistModeBtnTextActive]}
                            numberOfLines={1}
                          >
                              {markingVerified ? "Verifying…" : "Mark verified"}
                          </Text>
                        </Pressable>
                        ) : null}
                      </View>
                      {reviewerResubmitNote &&
                      (showPendingTripActions || showFinanceDeclineReVerify || showMarkVerified) ? (
                        <View
                          style={styles.reviewerResubmitNote}
                          accessibilityRole="summary"
                          accessibilityLabel={`Ground Ops resubmit note. ${reviewerResubmitNote}`}
                        >
                          <Text style={styles.reviewerResubmitNoteLabel}>
                            Ground Ops resubmit note
                          </Text>
                          <Text style={styles.reviewerResubmitNoteText}>{reviewerResubmitNote}</Text>
                        </View>
                      ) : null}
                      {(showPendingTripActions || showFinanceDeclineReVerify) &&
                      onMarkComplianceVerified &&
                      summary ? (
                        <View style={styles.checklistPreviewTripActions}>
                          <TouchableOpacity
                            style={[styles.verifyTripBtn, markingVerified && styles.btnDisabled]}
                            activeOpacity={0.85}
                            disabled={markingVerified}
                            onPress={() => {
                              if (showPendingTripActions && !allTabsApproved) {
                                alertMessage(
                                  "Can't verify",
                                  "Approve the required documents on Trip, Vehicle, and Driver first.",
                                );
                                return;
                              }
                              if (
                                showFinanceDeclineReVerify &&
                                !readiness?.requiredDocs.markVerifiedReady
                              ) {
                                alertMessage(
                                  "Can't verify",
                                  "Approve the required documents first, then Verify to return this trip to Verified.",
                                );
                                return;
                              }
                              setMarkingVerified(true);
                              void onMarkComplianceVerified(summary.trip.id).finally(() =>
                                setMarkingVerified(false),
                              );
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={
                              showFinanceDeclineReVerify
                                ? "Verify trip and return to the Verified stage"
                                : "Verify trip and move to the next stage"
                            }
                          >
                            {markingVerified ? (
                              <ActivityIndicator size="small" color={Theme.cardWhite} />
                            ) : (
                              <Text style={styles.verifyTripBtnText}>Verify</Text>
                            )}
                          </TouchableOpacity>
                          {showPendingTripActions && onDeclineCompliance ? (
                            <TouchableOpacity
                              style={styles.declineTripBtn}
                              activeOpacity={0.85}
                              onPress={() => setTripDeclineOpen(true)}
                              accessibilityRole="button"
                              accessibilityLabel="Decline trip compliance"
                            >
                              <Text style={styles.declineTripBtnText}>Decline</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                      {summary?.financeFlaggedAt && (onClearFinanceFlag || onRejectCompliance) ? (
                        <View style={styles.checklistPreviewTripActions}>
                          <Text style={styles.flagTitle} numberOfLines={2}>
                            {`Finance flag: ${summary.financeFlagNote?.trim() || "no note"}`}
                          </Text>
                          {onRejectCompliance ? (
                    <TouchableOpacity
                              style={styles.declineTripBtn}
                              activeOpacity={0.85}
                              onPress={() => setRejectOpen(true)}
                      accessibilityRole="button"
                              accessibilityLabel="Reject trip compliance"
                            >
                              <Text style={styles.declineTripBtnText}>Reject</Text>
                            </TouchableOpacity>
                          ) : null}
                          {onClearFinanceFlag ? (
                            <TouchableOpacity
                              style={styles.verifyTripBtn}
                              activeOpacity={0.85}
                              onPress={() => void onClearFinanceFlag(summary.trip.id)}
                              accessibilityRole="button"
                              accessibilityLabel="Clear finance flag"
                            >
                              <Text style={styles.verifyTripBtnText}>Clear flag</Text>
                    </TouchableOpacity>
                          ) : null}
                      </View>
                      ) : null}
                      {showResubmit && summary && onResubmitCompliance ? (
                        <View style={styles.resubmitActionBlock}>
                          {resubmitBlockedExplain ? (
                            <View
                              style={styles.resubmitBlockedBanner}
                              accessibilityRole="text"
                              accessibilityLabel={`Resubmit disabled. ${resubmitBlockedExplain.why}. ${resubmitBlockedExplain.action}`}
                            >
                              <Text style={styles.resubmitBlockedWhy}>
                                Resubmit disabled — {resubmitBlockedExplain.why}
                              </Text>
                              <Text style={styles.resubmitBlockedAction}>
                                Action required: {resubmitBlockedExplain.action}
                              </Text>
                            </View>
                          ) : null}
                          <View style={styles.checklistPreviewTripActions}>
                            <TouchableOpacity
                              style={[
                                styles.verifyTripBtn,
                                (resubmitting || resubmitBlockedByMissingDocs) &&
                                  styles.btnDisabled,
                              ]}
                              activeOpacity={0.85}
                              disabled={resubmitting}
                              onPress={() => {
                                if (resubmitBlockedExplain) {
                                  alertMessage(
                                    "Resubmit disabled",
                                    `${resubmitBlockedExplain.why}.\n\nAction required: ${resubmitBlockedExplain.action}`,
                                  );
                                  return;
                                }
                                setResubmitOpen(true);
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={
                                resubmitBlockedExplain
                                  ? `Resubmit disabled. ${resubmitBlockedExplain.why}. ${resubmitBlockedExplain.action}`
                                  : "Resubmit trip for review"
                              }
                              accessibilityState={{
                                disabled: resubmitting || resubmitBlockedByMissingDocs,
                              }}
                            >
                              {resubmitting ? (
                                <ActivityIndicator size="small" color={Theme.cardWhite} />
                              ) : (
                                <Text style={styles.verifyTripBtnText}>Resubmit</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </>
                )}
              </ScrollView>
                  )
                }
                end={
                  mobileExclusive && mobileDocPane === "list" ? null : (
              <View
                        style={[
                  styles.checklistPreviewPane,
                  splitEnabled && styles.checklistPreviewPaneSplit,
                  stacked && styles.checklistPreviewPaneStacked,
                  mobileExclusive && styles.checklistPreviewPaneMobile,
                ]}
              >
                {mobileExclusive && mobileDocPane === "preview" && checklistPreviewMode !== "document" ? (
                    <TouchableOpacity
                    onPress={() => setMobileDocPane("list")}
                    style={styles.mobilePreviewBack}
                    accessibilityRole="button"
                    accessibilityLabel="Back to documents"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <FontAwesome name="chevron-left" size={16} color="#212121" />
                    <Text style={styles.mobilePreviewBackText}>Documents</Text>
                    </TouchableOpacity>
                ) : null}
                {(() => {
                  const previewingDocument =
                    checklistPreviewMode === "document";
                  const toolsEnabled = Boolean(previewUrl);
                  const canExpand = Boolean(previewUrl || typedLines);
                  const expandColor = canExpand ? Theme.textPrimaryDark : Theme.textMuted;
                  const toolColor = toolsEnabled ? Theme.textPrimaryDark : Theme.textMuted;
                  const previewPos = previewable.findIndex((row) => row.key === checklistKey);
                  const previewOrdinal = previewPos >= 0 ? previewPos + 1 : previewable.length > 0 ? 1 : 0;
                  const showSideNav =
                    previewingDocument && previewable.length > 1;
                  return (
                    <>
                {previewingDocument ? (
                  <>
                  <View style={styles.previewNav}>
                    {mobileExclusive ? (
                      <TouchableOpacity
                        onPress={() => setMobileDocPane("list")}
                        style={styles.previewNavBack}
                        accessibilityRole="button"
                        accessibilityLabel="Back to documents"
                      >
                        <FontAwesome name="chevron-left" size={16} color="#212121" />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.previewNavBack} />
                    )}
                    <View style={styles.previewNavCopy}>
                      <Text style={styles.previewNavTitle} numberOfLines={1}>
                        {docTitle}
                  </Text>
                      {previewHeaderFacts ? (
                        <Text style={styles.previewNavMeta} numberOfLines={1}>
                          {previewHeaderFacts}
                        </Text>
                      ) : null}
                      {previewable.length > 0 ? (
                        <Text style={styles.previewNavMeta} numberOfLines={1}>
                          {previewOrdinal} of {previewable.length}
                        </Text>
                      ) : null}
                </View>
                    <View style={styles.previewNavTools}>
                      <Pressable
                        style={[styles.previewNavTool, !toolsEnabled && styles.previewToolBtnDisabled]}
                        onPress={() => {
                          setRotation((value) => (value + 90) % 360);
                          setZoom(1);
                          setToolLabel("rotate");
                        }}
                        disabled={!toolsEnabled}
                        accessibilityRole="button"
                        accessibilityLabel="Rotate"
                      >
                        <RotateCwSquare size={16} color={toolColor} strokeWidth={2.1} />
                      </Pressable>
                      <Pressable
                        style={[styles.previewNavTool, !toolsEnabled && styles.previewToolBtnDisabled]}
                        onPress={() => setZoom((value) => clampPreviewZoom(value - 0.25))}
                        disabled={!toolsEnabled}
                        accessibilityRole="button"
                        accessibilityLabel="Zoom out"
                      >
                        <Minus size={16} color={toolColor} />
                      </Pressable>
                      <Pressable
                        style={[styles.previewNavTool, !toolsEnabled && styles.previewToolBtnDisabled]}
                        onPress={() => setZoom((value) => clampPreviewZoom(value + 0.25))}
                        disabled={!toolsEnabled}
                        accessibilityRole="button"
                        accessibilityLabel="Zoom in"
                      >
                        <Plus size={16} color={toolColor} />
                      </Pressable>
                      <Pressable
                        style={[styles.previewNavTool, !canExpand && styles.previewToolBtnDisabled]}
                        onPress={() => setScreenOpen(true)}
                        disabled={!canExpand}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${docTitle} full screen`}
                      >
                        <Maximize2 size={16} color={expandColor} />
                      </Pressable>
              </View>
                  </View>
                  {showRowDecline || showRowApprove ? (
                    <View style={styles.rowDecisionBar}>
                      {showRowDecline ? (
                        <TouchableOpacity
                          style={[
                            styles.reviewGroupDecline,
                            rowDecisionButtons.declineActive && styles.reviewGroupDeclineActive,
                            busy && styles.btnDisabled,
                          ]}
                          activeOpacity={0.85}
                          disabled={busy}
                          onPress={() => activeDecisionRow && setRowDeclineTarget(activeDecisionRow)}
                          accessibilityRole="button"
                          accessibilityLabel={`Decline ${docTitle}`}
                        >
                          <Text
                            style={[
                              styles.reviewGroupDeclineText,
                              rowDecisionButtons.declineActive && styles.reviewGroupDeclineTextActive,
                            ]}
                          >
                            {rowDecisionButtons.declineLabel}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {showRowApprove ? (
                        <TouchableOpacity
                          style={[styles.reviewGroupApprove, busy && styles.btnDisabled]}
                          activeOpacity={0.85}
                          disabled={busy}
                          onPress={() => {
                            if (activeDecisionRow) void approveSingleRow(activeDecisionRow);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Approve ${docTitle}`}
                        >
                          <Text style={styles.reviewGroupApproveText}>{rowDecisionButtons.approveLabel}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                  </>
                ) : null}
                <View style={[styles.checklistPreviewBody, styles.checklistPreviewBodyMobile]}>
                  {checklistPreviewMode === "trip" && summary ? (
                    <ScrollView
                      style={styles.tripDetailsScroll}
                      contentContainerStyle={styles.tripDetailsScrollContent}
                      keyboardShouldPersistTaps="handled"
                    >
                    <ChecklistTripDetailsPanel
                      summary={summary}
                      truckType={
                        summary.trip.vehicle_id
                          ? truckTypeByVehicleId[summary.trip.vehicle_id] ?? null
                          : null
                      }
                      supplierName={supplierNameByTripId[summary.trip.id] ?? null}
                        onOpenDocumentUpload={openDocumentUploadFromDetails}
                      hideCommercials={hideCommercials}
                        onOpenTrip={onOpenTrip}
                        onOpenSupplier={onOpenSupplier}
                    />
                    </ScrollView>
                  ) : checklistPreviewMode === "advance" && summary && !compliancePendingView && !hideCommercials ? (
                    <ScrollView
                      style={styles.tripDetailsScroll}
                      contentContainerStyle={styles.advancePaymentScrollContent}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator
                    >
                    <ChecklistAdvancePaymentPanel
                      summary={summary}
                      supplierName={supplierNameByTripId[summary.trip.id] ?? null}
                      onPreviewMemo={financeMemoRow ? previewFinanceMemo : undefined}
                      readiness={readiness}
                      canPay={showPay}
                      paymentCategory={readyPaymentCategory}
                      paymentSubmitting={paymentSubmitting}
                      onConfirmPayment={onConfirmPayment}
                      onOpenPayModal={onConfirmPayment ? undefined : onPay}
                      onReject={showReject ? () => setRejectOpen(true) : undefined}
                      onFlag={onFlagForCompliance ? () => setFlagOpen(true) : undefined}
                      onClearFlag={onClearFinanceFlag ? () => void onClearFinanceFlag(summary.trip.id) : undefined}
                      // A rejected trip is not payable or approvable until Compliance
                      // verifies it again (compliance_cleared() enforces the same).
                      onFinanceVerify={
                        canManageFinance && onFinanceVerify && !isComplianceVerifiedRejected(summary)
                          ? () => void onFinanceVerify(summary.trip.id)
                          : undefined
                      }
                      onUndoFinanceVerify={
                        canManageFinance && onUndoFinanceVerify
                          ? () => void onUndoFinanceVerify(summary.trip.id)
                          : undefined
                      }
                      financeVerifySubmitting={financeVerifySubmitting}
                      onUpdateUtr={
                        canManageFinance
                          ? async (target, transactionId, utr, category) => {
                              const { error } = await updateCompliancePaymentReference({
                                tripId: target.trip.id,
                                transactionId,
                                category,
                                utr,
                              });
                              if (error) throw error;
                              onChanged({ type: "payment", tripId: target.trip.id });
                            }
                          : undefined
                      }
                      onUpdatePaidAt={
                        canManageFinance
                          ? async (target, transactionId, transactionDate, category) => {
                              const { error } = await updateCompliancePaymentTransactionDate({
                                tripId: target.trip.id,
                                transactionId,
                                category,
                                transactionDate,
                              });
                              if (error) throw error;
                              onChanged({ type: "payment", tripId: target.trip.id });
                            }
                          : undefined
                      }
                    />
                    </ScrollView>
                  ) : showEntityUnassigned ? (
                    <View style={styles.checklistPreviewEmpty}>
                      <Text style={styles.checklistPreviewEmptyTitle}>{vaultCopy.unassignedTitle}</Text>
                      <Text style={styles.checklistPreviewEmptyHint}>{vaultCopy.unassignedHint}</Text>
                    </View>
                  ) : (
                    <View style={styles.previewStageRow}>
                      {typedLines && canViewDocuments && !previewUrl ? (
                        <TypedDetailsPreview
                          title={docTitle}
                          lines={typedLines}
                          insetForSideNav={showSideNav}
                          bindScrollRails={!screenOpen}
                        />
                      ) : previewUrl || showSupplierBankPanel ? (
                        <View style={styles.checklistBankPreviewWrap}>
                          {previewUrl ? (
                            <View style={styles.checklistBankPreviewDoc}>
                              <OriginalDocumentPreview
                                uri={previewUrl}
                                isPdf={isPdf}
                                zoom={zoom}
                                rotation={rotation}
                                label={docTitle}
                                onZoomChange={setZoom}
                              />
                            </View>
                          ) : null}
                          {showSupplierBankPanel ? (
                    <ScrollView
                              style={
                                previewUrl
                                  ? styles.checklistBankDetailsScroll
                                  : styles.checklistBankDetailsScrollSolo
                              }
                              contentContainerStyle={styles.checklistBankDetailsContent}
                      showsVerticalScrollIndicator={false}
                    >
                              <View style={styles.bankCardHeader}>
                                <View style={styles.bankCardHeaderCopy}>
                                  <Text style={styles.checklistBankDetailsTitle}>Bank account</Text>
                                  <Text style={styles.checklistBankDetailsHint} numberOfLines={1}>
                                    Payout account from {supplierLabelForBank}
                                  </Text>
                                </View>
                                {supplierBankProof?.detailLine ? (
                                  <Text style={styles.bankCardMeta} numberOfLines={2}>
                                    {supplierBankProof.detailLine}
                                  </Text>
                                ) : null}
                              </View>
                              {supplierBankLoading && supplierBankAccountRows.length === 0 ? (
                                <ActivityIndicator color={Theme.textPrimaryDark} style={{ marginVertical: 12 }} />
                              ) : (
                                <View style={styles.bankFieldsGrid}>
                                  {supplierBankAccountRows.map((row) => (
                                    <View key={row.label} style={styles.bankFieldCell}>
                                      <Text style={styles.bankFieldLabel}>{row.label}</Text>
                                      <Text style={styles.bankFieldValue} numberOfLines={1}>
                                        {row.value}
                                      </Text>
                        </View>
                      ))}
                                  {supplierBankAccountRows.length === 0 ? (
                                    <Text style={styles.checklistBankDetailsHint}>
                                      No payout account on file yet. Save bank details on the supplier profile.
                                    </Text>
                                  ) : null}
                                </View>
                              )}
                              <View style={styles.bankProofSection}>
                                <Text style={styles.bankProofLabel}>Proof document</Text>
                                <View style={styles.bankProofRow}>
                                  <View style={styles.bankProofCopy}>
                                    <Text style={styles.bankProofTitle} numberOfLines={1}>
                                      {supplierBankProof?.fileName?.trim() ||
                                        (previewUrl ? "Bank proof" : "No proof uploaded")}
                                    </Text>
                                    {supplierBankVerified ? (
                                      <View style={styles.bankVerifiedChip}>
                                        <Text style={styles.bankVerifiedChipText}>Verified</Text>
                                      </View>
                                    ) : supplierBankProof?.previewPath ? (
                                      <View style={styles.bankPendingChip}>
                                        <Text style={styles.bankPendingChipText}>On file</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                  <Text style={styles.bankProofHint} numberOfLines={1}>
                                    Synced from supplier Banking
                                  </Text>
                                </View>
                              </View>
                    </ScrollView>
                          ) : null}
                        </View>
                  ) : loadingPreview ? (
                    <View style={styles.checklistPreviewEmpty}>
                      <ActivityIndicator color={Theme.textPrimaryDark} />
                      <Text style={styles.checklistPreviewLoadingText}>Loading document…</Text>
                    </View>
                  ) : (
                    <View style={styles.checklistPreviewEmpty}>
                      <Text style={styles.checklistPreviewEmptyTitle}>
                        {previewError
                          ? previewError
                          : checklistSelectedRow
                            ? `${
                                isFinanceMode
                                  ? labelForFinanceDocType(checklistSelectedRow.type)
                                  : labelForDocType(checklistSelectedRow.type)
                              } has no file to preview`
                            : "Select a document to preview"}
                      </Text>
                      <Text style={styles.checklistPreviewEmptyHint}>
                        {previewError
                          ? "Try the eye icon again, or reopen this trip."
                          : "Tap the eye icon on an uploaded document, or use Trip Detail / Advance Payment."}
                      </Text>
                    </View>
                  )}
                      {showSideNav ? (
                        <>
                          <View style={styles.docSideNavOverlayLeft} pointerEvents="box-none">
                            <DocSideNavButton direction="prev" onPress={goPrev} tone="light" />
                </View>
                          <View style={styles.docSideNavOverlayRight} pointerEvents="box-none">
                            <DocSideNavButton direction="next" onPress={goNext} tone="light" />
              </View>
                        </>
                      ) : null}
            </View>
                  )}
            </View>
                    </>
                  );
                })()}
                  </View>
                  )
                }
              />
            </View>
          ) : (
            <View style={styles.emptyStage}>
              <NoDocumentPreviewEmpty
                compact={stacked}
                title="No document to preview"
                hint="Select a trip to view its compliance documents here."
              />
            </View>
          )}
        </View>

        {showEntityUnassigned ? (
          <View style={styles.decisionRow}>
            <View style={styles.missingFooterMeta}>
              <Text style={styles.missingFooterText} numberOfLines={1}>
                {vaultCopy.vaultLabel} · unavailable
              </Text>
            </View>
          </View>
            ) : null}
        </View>
        )}
        <DocumentScreen
          visible={screenOpen}
          uri={previewUrl}
          isPdf={isPdf}
          title={docTitle}
          documentKey={`${activeRow?.key ?? ""}:${activePreviewPath ?? ""}`}
          documentVersion={
            activeRow?.entityDoc?.created_at ??
            activeRow?.doc?.uploaded_at ??
            String(previewEpoch)
          }
          emptyHint={previewError}
        presentation="page"
        onClose={() => {
          setScreenOpen(false);
          filesModalReturnRef.current = null;
          if (mobileExclusive) setMobileDocPane("list");
        }}
        onPrev={goPrev}
        onNext={goNext}
        canNavigate={previewable.length > 1}
        typedLines={typedLines}
        resolving={loadingPreview}
        headerFacts={previewHeaderFacts || null}
        navLabel={
          previewable.length > 0
            ? `${Math.max(
                1,
                previewable.findIndex((row) => row.key === checklistKey) + 1,
              )} of ${previewable.length}`
            : null
        }
      />
      <ThemedAlertModal
        visible={approveConfirm != null}
        title={
          approveConfirm === "optional"
            ? "Approve optional documents?"
            : "Approve required documents?"
        }
        message={
          approveConfirm === "optional"
            ? `Mark every optional ${isFinanceMode ? "Trip Details" : TABS.find((item) => item.key === tab)?.label ?? "Trip"} document on this tab as verified.`
            : `Mark every required ${isFinanceMode ? "Trip Details" : TABS.find((item) => item.key === tab)?.label ?? "Trip"} document on this tab as verified.`
        }
        okText="Approve"
        okVariant="primary"
        secondaryText="Cancel"
        onSecondary={() => setApproveConfirm(null)}
        onRequestClose={() => setApproveConfirm(null)}
        onOk={() => {
          const group = approveConfirm;
          setApproveConfirm(null);
          if (group) void approveGroup(group);
        }}
      />
      <ComplianceDeclineModal
        visible={declineOpen}
        title={`Decline ${reviewScope === "trip" ? "" : `${reviewScope} `}${declineTarget} documents`}
        presets={complianceDeclineSectionsForScope(reviewScope)}
        submitLabel="Decline"
        tripLabel={
          summary
            ? getTripDisplayNumber(summary.trip, summary.trip.organization_id ?? null)
            : "Trip"
        }
        onCancel={() => setDeclineOpen(false)}
        onSubmit={async (reason) => {
          await declineWithReason(reason);
        }}
      />
      <ComplianceDeclineModal
        visible={rowDeclineTarget != null}
        title={`Decline ${
          rowDeclineTarget
            ? isFinanceMode || (COMPLIANCE_FINANCE_DOCUMENT_TYPES as readonly string[]).includes(rowDeclineTarget.type)
              ? labelForFinanceDocType(rowDeclineTarget.type)
              : labelForDocType(rowDeclineTarget.type)
            : "document"
        }`}
        presets={complianceDeclineSectionsForScope(reviewScope)}
        submitLabel="Decline"
        tripLabel={
          summary
            ? getTripDisplayNumber(summary.trip, summary.trip.organization_id ?? null)
            : "Trip"
        }
        onCancel={() => setRowDeclineTarget(null)}
        onSubmit={async (reason) => {
          await declineSingleRow(reason);
        }}
      />
      <VaultCategoryPreviewModal
        visible={Boolean(categoryPreview)}
        files={categoryPreview?.files ?? []}
        index={categoryPreview?.index ?? 0}
        onIndexChange={(index) =>
          setCategoryPreview((current) => (current ? { ...current, index } : current))
        }
        onClose={() => {
          setCategoryPreview(null);
          setScreenOpen(false);
          if (mobileExclusive) setMobileDocPane("list");
        }}
        onAdd={
          canEditFiles && categoryPreview
            ? () => {
                const addLock = complianceTypeAddLockReason(categoryPreview.type);
                if (addLock) {
                  alertMessage("Document locked", addLock);
                  return;
                }
                const row =
                  listRows.find((item) => item.type === categoryPreview.type) ??
                  displayListRows.find((item) => item.type === categoryPreview.type);
                if (row) void uploadVaultDocument(row);
              }
            : undefined
        }
        onDelete={
          canEditFiles
            ? (file) => {
                if (String(file.id).startsWith("draft-")) {
                  setCategoryPreview((current) => {
                    if (!current) return current;
                    const next = current.files.filter((item) => item.id !== file.id);
                    if (next.length === 0) return null;
                    return {
                      ...current,
                      files: next,
                      index: Math.min(current.index, next.length - 1),
                    };
                  });
                  return;
                }
                const row = listRows.find((item) => item.key === file.id);
                if (!row) return;
                const fileLock = complianceFileLockReason(row);
                if (fileLock) {
                  alertMessage("Document locked", fileLock);
                  return;
                }
                const label = file.fileName || file.categoryLabel;
                if (row.doc) {
                  void removeTripFile(row, label);
                  return;
                }
                void removeEntityFile(row, label);
              }
            : undefined
        }
        onResolveUrl={async (file) => {
          if (file.previewUri?.trim()) return file.previewUri.trim();
          const path = file.storagePath?.trim();
          if (!path) return null;
          if (/^https?:\/\//i.test(path) || path.startsWith("blob:") || path.startsWith("data:")) {
            return path;
          }
          return signCompliancePreviewUrl({
            storagePath: path,
            source: compliancePreviewSourceForVaultFile(file),
            organizationId,
            entityId:
              file.driverKind
                ? summary?.trip.driver_id ?? null
                : file.complianceType
                  ? summary?.trip.vehicle_id ?? null
                  : summary?.trip.id ?? null,
            docType: file.category,
          });
        }}
        onSaveExpiry={async (file, isoDate) => {
          if (!file.documentId) return;
          const { error } = await updateEntityDocumentExpiry(file.documentId, isoDate);
          if (error) {
            alertMessage("Could not save date", error.message);
            return;
          }
          setCategoryPreview((current) =>
            current
              ? {
                  ...current,
                  files: current.files.map((item) =>
                    item.id === file.id ? { ...item, expiryDate: isoDate } : item,
                  ),
                }
              : current,
          );
          if (summary) {
            onChanged(
              file.driverKind && summary.trip.driver_id
                ? { type: "driverDocuments", driverId: summary.trip.driver_id }
                : file.complianceType && summary.trip.vehicle_id
                  ? { type: "vehicleDocuments", vehicleId: summary.trip.vehicle_id }
                  : { type: "tripDocuments", tripId: summary.trip.id },
            );
          }
        }}
      />
      <ComplianceDeclineModal
        visible={flagOpen}
        title="Flag to Compliance"
        fieldLabel="Note (optional)"
        placeholder="What should Compliance check?"
        submitLabel="Flag"
        presets={FINANCE_FLAG_REASON_SECTIONS}
        tripLabel={
          summary
            ? getTripDisplayNumber(summary.trip, summary.trip.organization_id ?? null)
            : "Trip"
        }
        onCancel={() => setFlagOpen(false)}
        onSubmit={async (note) => {
          if (!summary || !onFlagForCompliance) return;
          await onFlagForCompliance(summary.trip.id, note);
          setFlagOpen(false);
        }}
      />
      <ComplianceDeclineModal
        visible={resubmitOpen}
        title="Resubmit for review"
        fieldLabel="What did you fix?"
        placeholder="e.g. Invoice copy re-uploaded and checked"
        submitLabel="Resubmit"
        context={
          summary?.complianceDeclineReason?.trim()
            ? {
                label: isComplianceHoldAwaitingResubmit(summary) ? "Hold reason" : "Reject reason",
                text: summary.complianceDeclineReason.trim(),
              }
            : null
        }
        changeLogLoading={resubmitOpen && !resubmitChangeLogReady}
        changeLog={
          resubmitChangeLogReady
            ? {
                title: "Changes since hold / reject",
                items: dedupeResubmitChangeItems(resubmitChangeLog?.items ?? []).map((item) => ({
                  kind: item.kind,
                  text: formatResubmitChangeItemLine(item),
                })),
                noteBlock: resubmitChangeLog
                  ? formatResubmitChangeLogBlock(resubmitChangeLog)
                  : "",
              }
            : null
        }
        tripLabel={
          summary
            ? getTripDisplayNumber(summary.trip, summary.trip.organization_id ?? null)
            : "Trip"
        }
        onCancel={() => setResubmitOpen(false)}
        onSubmit={async (note) => {
          if (!summary || !onResubmitCompliance) return;
          setResubmitting(true);
          try {
            await onResubmitCompliance(summary.trip.id, note);
            setResubmitOpen(false);
          } finally {
            setResubmitting(false);
          }
        }}
      />
      <ComplianceDeclineModal
        visible={tripDeclineOpen}
        presets={COMPLIANCE_DECLINE_REASON_SECTIONS}
        initialSelected={tripDeclinePrefill?.selected}
        initialNote={tripDeclinePrefill?.note}
        context={
          tripDeclinePrefill
            ? { label: "Declined documents", text: tripDeclinePrefill.summaryText }
            : null
        }
        tripLabel={
          summary
            ? getTripDisplayNumber(summary.trip, summary.trip.organization_id ?? null)
            : "Trip"
        }
        onCancel={() => setTripDeclineOpen(false)}
        onSubmit={async (reason) => {
          if (!summary || !onDeclineCompliance) return;
          await onDeclineCompliance(summary.trip.id, reason);
          setTripDeclineOpen(false);
        }}
      />
      <ComplianceRejectRemarkModal
        visible={rejectOpen}
        tripLabel={
          summary
            ? getTripDisplayNumber(summary.trip, summary.trip.organization_id ?? null)
            : "Trip"
        }
        onCancel={() => setRejectOpen(false)}
        onSubmit={async (reason) => {
          if (!summary || !onRejectCompliance) return;
          await onRejectCompliance(summary.trip.id, reason);
          setRejectOpen(false);
        }}
      />
      {summary && lrDialogOpen ? (
        <HubTripLrUpdateModal
          visible
          tripId={summary.trip.id}
          organizationId={organizationId}
          tripOrganizationId={summary.trip.organization_id ?? organizationId}
          actorId={actorId ?? ""}
          existingLabel={
            summary.documents
              .filter((doc) => doc.document_type === "lr" && doc.status !== "rejected")
              .map((doc) => parseLrFieldValues(doc.document_number).lrNumber.trim())
              .find(Boolean) ?? ""
          }
          onClose={() => setLrDialogOpen(false)}
          onSubmitted={() => {
            focusUploadTypeRef.current = "lr";
            onChanged({ type: "tripDocuments", tripId: summary.trip.id });
          }}
        />
      ) : null}
      <ComplianceExpiryDateModal
        visible={expiryPrompt != null}
        docLabel={expiryPrompt ? labelForDocType(expiryPrompt.docType) : "Document"}
        onCancel={() => {
          expiryPrompt?.resolve(null);
          setExpiryPrompt(null);
        }}
        onSubmit={(isoDate) => {
          expiryPrompt?.resolve(isoDate);
          setExpiryPrompt(null);
        }}
      />
      {summary ? (
        <ComplianceHardCopyPodSheet
          visible={podOpen && showLogHardCopyPod}
          onClose={() => setPodOpen(false)}
          summary={summary}
          organizationId={organizationId || null}
          canManage={canManagePod || showLogHardCopyPod}
          lrOptions={courierLrOptions}
          tripFacts={tripFacts}
          headerEnd={
            onOpenActivityLog ? (
              <ComplianceActivityLogButton compact onPress={() => onOpenActivityLog(summary)} />
            ) : null
          }
          onChanged={async (ids) => {
            await Promise.all(ids.map((tripId) => onChanged({ type: "hardCopyPod", tripId })));
          }}
        />
      ) : null}
    </View>
  );
}

function TripDetailFact({
  label,
  value,
  emphasize,
  wide,
  columns = 2,
  layout = "grid",
  last = false,
  onPress,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  wide?: boolean;
  columns?: 2 | 3;
  layout?: "grid" | "list";
  last?: boolean;
  onPress?: () => void;
}) {
  const ValueText = (
        <Text
          style={[
            layout === "list" ? styles.tripFactRowValue : styles.tripFactValue,
            emphasize && styles.tripFactValueEmphasize,
            onPress ? styles.tripFactValueLink : null,
          ]}
          selectable={!onPress}
          onPress={onPress}
        >
        {value}
      </Text>
  );
  if (layout === "list") {
  return (
      <View style={[styles.tripFactRow, last && styles.tripFactRowLast]}>
        <Text style={styles.tripFactRowLabel} numberOfLines={1}>
          {label}
        </Text>
        {ValueText}
    </View>
  );
}

            return (
                    <View
                      style={[
        styles.tripFactCell,
        columns === 3 ? styles.tripFactCellThird : styles.tripFactCellHalf,
        wide && styles.tripFactCellWide,
                      ]}
                    >
      <Text style={styles.tripFactLabel} numberOfLines={1}>
        {label}
                      </Text>
      {ValueText}
                    </View>
  );
}

function TripDetailAnimatedIcon({ children }: { children: React.ReactNode }) {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);
  const translateY = drift.interpolate({
    inputRange: [0, 1],
    outputRange: [1.5, -1.5],
  });
  return <Animated.View style={{ transform: [{ translateY }] }}>{children}</Animated.View>;
}

function TripDetailSection({
  title,
  icon: Icon,
  iconColor = Theme.complianceRoutePickup,
  iconWash = Theme.complianceIconWash,
  children,
  columns,
  factLayout = "grid",
  style,
}: {
  title: string;
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  iconColor?: string;
  iconWash?: string;
  children: React.ReactNode;
  columns: 2 | 3;
  factLayout?: "grid" | "list";
  style?: StyleProp<ViewStyle>;
}) {
  const items = React.Children.toArray(children);
  return (
    <View style={[styles.tripDetailSection, style]}>
      <View style={styles.tripDetailSectionHeader}>
        {Icon ? (
          <View style={[styles.tripDetailSectionIconWell, { backgroundColor: iconWash }]}>
            <TripDetailAnimatedIcon>
              <Icon size={13} color={iconColor} strokeWidth={2.1} />
            </TripDetailAnimatedIcon>
                  </View>
        ) : null}
        <Text style={styles.tripDetailSectionTitle} numberOfLines={1}>
          {title}
                  </Text>
                </View>
      <View style={factLayout === "list" ? styles.tripFactList : styles.tripFactGrid}>
        {items.map((child, index) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(
            child as React.ReactElement<{
              columns?: 2 | 3;
              layout?: "grid" | "list";
              last?: boolean;
            }>,
            {
              columns,
              layout: factLayout,
              last: index === items.length - 1,
            },
          );
        })}
      </View>
    </View>
  );
}

type TripCommercialFacts = {
  client_price?: number | null;
  supplier_rate?: number | null;
  margin?: number | null;
  load_tons?: number | null;
  sale_rate_basis?: string | null;
  sale_unit_rate?: number | null;
  supplier_rate_basis?: string | null;
};

function formatTripInr(value: number | null | undefined): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatLoadedWeight(tons: number | null | undefined): string {
  const value = Number(tons);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `${value.toLocaleString("en-IN", { maximumFractionDigits: 3 })} MT`;
}

/**
 * Rate per MT only when the client actually priced per MT. A per-trip rate is
 * never divided by the load (Finance: Apollo is per trip, not per MT).
 */
function clientRatePerMtLabel(trip: TripCommercialFacts): string {
  if (trip.sale_rate_basis !== "per_mt") return "—";
  const unit = Number(trip.sale_unit_rate);
  if (Number.isFinite(unit) && unit > 0) return formatTripInr(unit);
  const tons = Number(trip.load_tons);
  const price = Number(trip.client_price);
  if (Number.isFinite(tons) && tons > 0 && Number.isFinite(price) && price > 0) {
    return formatTripInr(price / tons);
  }
  return "—";
}

/** Supplier rate per MT only when the supplier priced per MT. */
function supplierRatePerMtLabel(trip: TripCommercialFacts): string {
  if (trip.supplier_rate_basis !== "per_mt") return "—";
  const rate = Number(trip.supplier_rate);
  if (!Number.isFinite(rate) || rate <= 0) return "—";
  return formatTripInr(rate);
}

function supplierCostTotal(trip: TripCommercialFacts): number | null {
  const rate = Number(trip.supplier_rate);
  if (!Number.isFinite(rate)) return null;
  if (trip.supplier_rate_basis === "per_mt") {
    const tons = Number(trip.load_tons);
    if (Number.isFinite(tons) && tons > 0) return rate * tons;
    return null;
  }
  return rate;
}

function profitLabels(trip: TripCommercialFacts): { profit: string; percent: string } {
  const client = Number(trip.client_price);
  const cost = supplierCostTotal(trip);
  const storedMargin = Number(trip.margin);
  const profit =
    Number.isFinite(client) && cost != null
      ? client - cost
      : Number.isFinite(storedMargin)
        ? storedMargin
        : null;
  if (profit == null || !Number.isFinite(profit)) {
    return { profit: "—", percent: "—" };
  }
  const percent =
    Number.isFinite(client) && client > 0 ? `${((profit / client) * 100).toFixed(1)}%` : "—";
  return { profit: formatTripInr(profit), percent };
}

type TripDocChipKind = "missing" | "pending" | "accepted";
type TripMissingDocItem = {
  name: string;
  type: string;
  vault: string;
  required: boolean;
  kind: TripDocChipKind;
};
type TripDocGroup = { label: string; items: TripMissingDocItem[] };
type TripDocOverview = {
  missing: number;
  pending: number;
  accepted: number;
  total: number;
  missingItems: TripMissingDocItem[];
  missingGroups: TripDocGroup[];
  pendingGroups: TripDocGroup[];
  acceptedGroups: TripDocGroup[];
};

/** Finance document rows; Ground Ops (hideCommercials) never see the supplier's Bank Docs. */
function financeRowsFor(summary: ComplianceTripSummary, hideCommercials: boolean): ComplianceDocRow[] {
  const rows = deriveFinanceDocumentRows(summary.documents);
  return hideCommercials ? rows.filter((row) => row.type !== "bank_docs") : rows;
}

function tripDocumentGroups(summary: ComplianceTripSummary, hideCommercials = false): Array<{
  label: string;
  rows: ComplianceDocRow[];
  finance?: boolean;
}> {
  const groups: Array<{ label: string; rows: ComplianceDocRow[]; finance?: boolean }> = [
    {
      label: "Finance",
      rows: financeRowsFor(summary, hideCommercials),
      finance: true,
    },
    { label: "Trip", rows: deriveTripVaultReviewRows(summary.documents) },
  ];
  if (summary.trip.vehicle_id) {
    groups.push({
      label: "Vehicle",
      rows: deriveEntityComplianceRows(
        COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
        summary.vehicleDocuments,
      ),
    });
  }
  if (summary.trip.driver_id) {
    groups.push({
      label: "Driver",
      rows: deriveEntityComplianceRows(
        COMPLIANCE_DRIVER_DOCUMENT_TYPES,
        summary.driverDocuments,
      ),
    });
  }
  return groups;
}

function tripDocumentOverview(summary: ComplianceTripSummary, hideCommercials = false): TripDocOverview {
  const missingItems: TripMissingDocItem[] = [];
  const missingGroups: TripDocGroup[] = [];
  const pendingGroups: TripDocGroup[] = [];
  const acceptedGroups: TripDocGroup[] = [];
  let missing = 0;
  let pending = 0;
  let accepted = 0;
  let total = 0;
  for (const group of tripDocumentGroups(summary, hideCommercials)) {
    total += group.rows.length;
    const missingInGroup: TripMissingDocItem[] = [];
    const pendingInGroup: TripMissingDocItem[] = [];
    const acceptedInGroup: TripMissingDocItem[] = [];
    for (const row of group.rows) {
      const item = {
        name: group.finance ? labelForFinanceDocType(row.type) : labelForDocType(row.type),
        type: row.type,
        vault: group.label,
        required: row.required,
        kind: "missing" as TripDocChipKind,
      };
      if (row.status === "missing") {
        missing += 1;
        missingInGroup.push(item);
        missingItems.push(item);
      } else if (row.status === "verified") {
        accepted += 1;
        acceptedInGroup.push({ ...item, kind: "accepted" });
      } else {
        pending += 1;
        pendingInGroup.push({ ...item, kind: "pending" });
      }
    }
    if (missingInGroup.length > 0) missingGroups.push({ label: group.label, items: missingInGroup });
    if (pendingInGroup.length > 0) pendingGroups.push({ label: group.label, items: pendingInGroup });
    if (acceptedInGroup.length > 0) acceptedGroups.push({ label: group.label, items: acceptedInGroup });
  }
  return {
    missing,
    pending,
    accepted,
    total,
    missingItems,
    missingGroups,
    pendingGroups,
    acceptedGroups,
  };
}

function docNumberForType(
  documents: ComplianceTripSummary["documents"],
  type: string,
): string | null {
  const matches = documents.filter((doc) => (doc.document_type ?? "").toLowerCase() === type);
  if (matches.length === 0) return null;
  const latest = [...matches].sort((a, b) => (b.uploaded_at ?? "").localeCompare(a.uploaded_at ?? ""))[0];
  const raw = latest?.document_number ?? null;
  if (type === "lr") return formatLrVaultNumberLabel(raw);
  if (type === "invoice") return formatInvoiceVaultNumberLabel(raw);
  return raw?.trim() || null;
}

function ChecklistTripDetailsPanel({
  summary,
  truckType,
  supplierName,
  onOpenDocumentUpload,
  hideCommercials = false,
  onOpenTrip,
  onOpenSupplier,
}: {
  summary: ComplianceTripSummary;
  truckType: string | null;
  supplierName: string | null;
  onOpenDocumentUpload?: (target: { vault: string; type?: string }) => void;
  /** Ground Ops: drop the Rates and Banking cards (and never fetch the supplier bank account). */
  hideCommercials?: boolean;
  onOpenTrip?: (tripId: string) => void;
  onOpenSupplier?: (supplierId: string) => void;
}) {
  const trip = summary.trip;
  const commercial = trip as typeof trip & TripCommercialFacts;
  const customerName = trip.client_name?.trim() || "—";
  const supplierLabel = (supplierName ?? trip.supplier_name)?.trim() || "—";
  const origin = splitHubRouteLocationDisplay(trip.pickup_area ?? "");
  const dest = splitHubRouteLocationDisplay(trip.drop_location ?? "");
  const vehicle =
    formatIndianVehicleNumber(trip.vehicle_display_number?.trim() || "").trim() ||
    trip.vehicle_display_number?.trim() ||
    "—";
  const truckLabel = truckType?.trim() || "—";
  const inTransitAt = formatComplianceTimestamp(trip.started_at);
  const executionModel = getTripExecutionModel(trip);
  const isAsset = executionModel === "asset";
  const routeLine = `${origin.city || "—"}${origin.state ? `, ${origin.state}` : ""} → ${dest.city || "—"}${
    dest.state ? `, ${dest.state}` : ""
  }`;
  const salesInvoice = docNumberForType(summary.documents, "invoice") ?? "—";
  const lrNo = docNumberForType(summary.documents, "lr") ?? "—";
  const { profit, percent: profitPercent } = profitLabels(commercial);

  const [bankDetails, setBankDetails] = useState<{
    accountNumber: string;
    beneficiaryName: string;
    ifsc: string;
    bankName: string;
    branchName: string;
  } | null>(null);

  const payeeDetails = !PRE_VERIFIED_STAGES.has(summary.stage);
  const [bankRevision, setBankRevision] = useState(0);
  useEffect(() => {
    const supplierId = (trip.supplier_id ?? "").trim();
    if (!payeeDetails || !supplierId) return;
    return subscribeSupplierBankChanged((changedId) => {
      if (changedId === supplierId) setBankRevision((n) => n + 1);
    });
  }, [payeeDetails, trip.supplier_id]);

  useEffect(() => {
    let cancelled = false;
    const orgId = (trip.organization_id ?? "").trim();
    const supplierId = (trip.supplier_id ?? "").trim();
    if (!orgId || !supplierId || hideCommercials) {
      setBankDetails(null);
      return;
    }
    void getSupplierBankAccount(orgId, supplierId).then(async ({ account }) => {
      if (cancelled) return;
      if (!account) {
        setBankDetails(null);
        return;
      }
      // Beneficiary = the bank account holder only — never the supplier's company name.
      const fallbackBeneficiary = "—";
      if (!payeeDetails) {
        setBankDetails({
          accountNumber: account.account_number?.trim() || "—",
          beneficiaryName: fallbackBeneficiary,
          ifsc: account.ifsc_code?.trim() || "—",
          bankName: account.bank_name?.trim() || "—",
          branchName: account.bank_name?.trim() || "—",
        });
        return;
      }
      const branch = await resolveBankBranch(account.branch_name, account.ifsc_code);
      if (cancelled) return;
      setBankDetails({
        accountNumber: account.account_number?.trim() || "—",
        beneficiaryName: account.beneficiary_name?.trim() || fallbackBeneficiary,
        ifsc: account.ifsc_code?.trim() || "—",
        bankName: account.bank_name?.trim() || "—",
        branchName: branch || "—",
      });
    });
    return () => {
      cancelled = true;
    };
  }, [trip.organization_id, trip.supplier_id, supplierLabel, payeeDetails, bankRevision, hideCommercials]);

  const tripId = getTripDisplayNumber(trip, trip.organization_id ?? null);
  const beneficiary = bankDetails?.beneficiaryName ?? "—";
  const supplierRate = formatTripInr(supplierCostTotal(commercial) ?? commercial.supplier_rate);
  const clientRate = formatTripInr(commercial.client_price);
  const loadedWeight = formatLoadedWeight(commercial.load_tons);
  const accountNumber = bankDetails?.accountNumber ?? "—";
  const ifsc = bankDetails?.ifsc ?? "—";
  const branch = bankDetails?.branchName ?? "—";
  const docOverview = tripDocumentOverview(summary, hideCommercials);
  const requiredStillMissing = docOverview.missingGroups.some((group) =>
    group.items.some((item) => item.required),
  );
  const nextStep = requiredStillMissing
    ? "Upload the required documents. This trip can move to the next stage once they are accepted."
    : docOverview.pending > 0
      ? "Review the pending documents. This trip is ready for the next stage once they are accepted."
      : "Required documents are accepted. This trip is ready for the next stage.";
  const [paneWidth, setPaneWidth] = useState(0);
  const [docChipKind, setDocChipKind] = useState<TripDocChipKind>("missing");
  useEffect(() => {
    setDocChipKind("missing");
  }, [trip.id]);
  /** Side-by-side card pairs when the preview pane is wide enough. */
  const pairCards = paneWidth >= 400;
  const tripColumns: 2 | 3 = paneWidth >= 520 ? 3 : 2;
  const missingChipColumns: 2 | 3 = paneWidth >= 480 ? 3 : 2;
  const selectedDocGroups =
    docChipKind === "pending"
      ? docOverview.pendingGroups
      : docChipKind === "accepted"
        ? docOverview.acceptedGroups
        : docOverview.missingGroups;
  const selectedDocEmpty =
    docChipKind === "pending"
      ? "No documents pending"
      : docChipKind === "accepted"
        ? "No documents accepted"
        : "All documents on file";

  return (
    <View
      style={styles.tripDetailsPanel}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        setPaneWidth((prev) => (prev === next ? prev : next));
      }}
    >
      <TripDetailSection
        title="Trip"
        icon={Truck}
        iconColor={Theme.complianceRoutePickup}
        iconWash={Theme.complianceIconWash}
        columns={tripColumns}
        style={styles.tripDetailSectionLead}
      >
        <TripDetailFact
          label="Trip ID"
          value={tripId}
          onPress={onOpenTrip ? () => onOpenTrip(trip.id) : undefined}
        />
        <TripDetailFact label="Vehicle" value={vehicle} />
        {tripColumns === 3 ? <TripDetailFact label="Truck type" value={truckLabel} /> : null}
        <TripDetailFact label="Route" value={routeLine} wide />
        {tripColumns === 2 ? <TripDetailFact label="Truck type" value={truckLabel} /> : null}
        <TripDetailFact label="Model" value={isAsset ? "Asset" : "Aggregate"} />
        <TripDetailFact label="In-transit" value={inTransitAt} />
        <TripDetailFact label="Loaded weight" value={loadedWeight} />
      </TripDetailSection>

      <View style={[styles.tripDetailPairRow, !pairCards && styles.tripDetailPairRowStack]}>
        <TripDetailSection
          title="Parties"
          icon={Users}
          iconColor={Theme.complianceStageInfoFg}
          iconWash={Theme.complianceStageInfoBg}
          columns={2}
          factLayout="list"
          style={[styles.tripDetailSectionPair, !pairCards && styles.tripDetailSectionPairFull]}
        >
          <TripDetailFact label="Customer" value={customerName} />
          <TripDetailFact
            label="Supplier"
            value={supplierLabel}
            onPress={
              onOpenSupplier && trip.supplier_id
                ? () => onOpenSupplier(trip.supplier_id!)
                : undefined
            }
          />
        </TripDetailSection>
        <TripDetailSection
          title="Documents"
          icon={FileText}
          iconColor={Theme.complianceStageBalanceFg}
          iconWash={Theme.complianceStageBalanceBg}
          columns={2}
          factLayout="list"
          style={[styles.tripDetailSectionPair, !pairCards && styles.tripDetailSectionPairFull]}
        >
          <TripDetailFact label="LR no" value={lrNo} />
          <TripDetailFact label="Client sales invoice" value={salesInvoice} />
        </TripDetailSection>
      </View>

      {hideCommercials ? null : (
      <View style={[styles.tripDetailPairRow, !pairCards && styles.tripDetailPairRowStack]}>
        <TripDetailSection
          title="Rates"
          icon={Banknote}
          iconColor={Theme.complianceDocOkFg}
          iconWash={Theme.complianceDocOkBg}
          columns={2}
          style={[styles.tripDetailSectionPair, !pairCards && styles.tripDetailSectionPairFull]}
        >
          <TripDetailFact label="Supplier rate" value={supplierRate} />
          <TripDetailFact label="Supplier / MT" value={supplierRatePerMtLabel(commercial)} />
          <TripDetailFact label="Client rate" value={clientRate} />
          <TripDetailFact label="Client / MT" value={clientRatePerMtLabel(commercial)} />
          <TripDetailFact label="Profit" value={profit} emphasize />
          <TripDetailFact label="Profit %" value={profitPercent} emphasize />
        </TripDetailSection>
        <TripDetailSection
          title="Banking"
          icon={Landmark}
          iconColor={Theme.accentBrown}
          iconWash={Theme.accentBrownWash}
          columns={2}
          factLayout="list"
          style={[styles.tripDetailSectionPair, !pairCards && styles.tripDetailSectionPairFull]}
        >
          <TripDetailFact label="Beneficiary" value={beneficiary} />
          <TripDetailFact label="Account number" value={accountNumber} />
          <TripDetailFact label="IFSC" value={ifsc} />
          {payeeDetails ? (
            <TripDetailFact label="Bank name" value={bankDetails?.bankName ?? "—"} />
          ) : null}
          <TripDetailFact label="Branch" value={branch} />
        </TripDetailSection>
      </View>
      )}

      <View style={styles.tripDetailInsightCard}>
        <View style={styles.tripDetailSectionHeader}>
          <View style={[styles.tripDetailSectionIconWell, { backgroundColor: Theme.complianceStagePendingBg }]}>
            <TripDetailAnimatedIcon>
              <NotebookText size={13} color={Theme.complianceStagePendingFg} strokeWidth={2.1} />
            </TripDetailAnimatedIcon>
          </View>
          <Text style={styles.tripDetailSectionTitle} numberOfLines={1}>
            Summary & interpretation
          </Text>
        </View>
        <View style={styles.tripDetailInsightBody}>
          <Text style={styles.tripDetailNextStep}>{nextStep}</Text>
          <View style={styles.tripDetailStatRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show missing documents"
              accessibilityState={{ selected: docChipKind === "missing" }}
              onPress={() => setDocChipKind("missing")}
              style={[styles.tripDetailStatTile, styles.tripDetailStatTileMissing]}
            >
              <View style={styles.tripDetailStatHead}>
                <TripDetailAnimatedIcon>
                  <FileText size={11} color={Theme.complianceDocNeedFg} strokeWidth={2.1} />
                </TripDetailAnimatedIcon>
                <Text style={[styles.tripDetailStatLabel, styles.tripDetailStatLabelMissing]} numberOfLines={1}>
                  Docs missing
                </Text>
              </View>
              <Text style={[styles.tripDetailStatValue, styles.tripDetailStatValueMissing]}>
                {docOverview.missing}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show pending documents"
              accessibilityState={{ selected: docChipKind === "pending" }}
              onPress={() => setDocChipKind("pending")}
              style={[styles.tripDetailStatTile, styles.tripDetailStatTilePending]}
            >
              <View style={styles.tripDetailStatHead}>
                <TripDetailAnimatedIcon>
                  <Clock size={11} color={Theme.complianceStagePendingFg} strokeWidth={2.1} />
                </TripDetailAnimatedIcon>
                <Text style={[styles.tripDetailStatLabel, styles.tripDetailStatLabelPending]} numberOfLines={1}>
                  Docs pending
                </Text>
              </View>
              <Text style={[styles.tripDetailStatValue, styles.tripDetailStatValuePending]}>
                {docOverview.pending}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show accepted documents"
              accessibilityState={{ selected: docChipKind === "accepted" }}
              onPress={() => setDocChipKind("accepted")}
              style={[styles.tripDetailStatTile, styles.tripDetailStatTileAccepted]}
            >
              <View style={styles.tripDetailStatHead}>
                <TripDetailAnimatedIcon>
                  <CircleCheck size={11} color={Theme.complianceDocOkFg} strokeWidth={2.1} />
                </TripDetailAnimatedIcon>
                <Text style={[styles.tripDetailStatLabel, styles.tripDetailStatLabelAccepted]} numberOfLines={1}>
                  Docs accepted
                </Text>
              </View>
              <Text style={[styles.tripDetailStatValue, styles.tripDetailStatValueAccepted]}>
                {docOverview.accepted}
                <Text style={styles.tripDetailStatTotal}>/{docOverview.total}</Text>
              </Text>
            </Pressable>
          </View>

          {selectedDocGroups.length > 0 ? (
            <View style={styles.tripDetailDocGroups}>
              {selectedDocGroups.map((group) => (
                <View key={group.label} style={styles.tripDetailDocGroup}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${group.label} documents`}
                    onPress={() => onOpenDocumentUpload?.({ vault: group.label })}
                    style={styles.tripDetailDocGroupLabelHit}
                  >
                    <Text style={styles.tripDetailDocGroupLabel}>{group.label}</Text>
                  </Pressable>
                  <View style={styles.tripDetailMissingWrap}>
                    {group.items.map((item, index) => {
                      const chipTone =
                        item.kind === "accepted"
                          ? "accepted"
                          : item.kind === "pending" || !item.required
                            ? "optional"
                            : "required";
                      return (
                      <Pressable
                        key={`${group.label}-${item.name}-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${group.label} to upload ${item.name}`}
                        onPress={() =>
                          onOpenDocumentUpload?.({ vault: group.label, type: item.type })
                        }
                        style={[
                          styles.tripDetailMissingChip,
                          missingChipColumns === 3
                            ? styles.tripDetailMissingChipThird
                            : styles.tripDetailMissingChipHalf,
                          chipTone === "accepted"
                            ? styles.tripDetailMissingChipAccepted
                            : chipTone === "required"
                              ? styles.tripDetailMissingChipRequired
                              : styles.tripDetailMissingChipOptional,
                        ]}
                      >
                        <FileText
                          size={8}
                          color={
                            chipTone === "accepted"
                              ? Theme.complianceDocOkFg
                              : chipTone === "required"
                                ? Theme.complianceDocNeedFg
                                : Theme.complianceGroupWarningFg
                          }
                          strokeWidth={2.1}
                        />
                        <Text
                          style={[
                            styles.tripDetailMissingChipTitle,
                            chipTone === "accepted"
                              ? styles.tripDetailMissingChipTitleAccepted
                              : chipTone === "required"
                                ? styles.tripDetailMissingChipTitleRequired
                                : styles.tripDetailMissingChipTitleOptional,
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <Text style={styles.tripDetailMissingChipMeta} numberOfLines={1}>
                          {item.kind === "accepted"
                            ? "Accepted"
                            : item.kind === "pending"
                              ? "Pending"
                              : item.required
                                ? "Required"
                                : "Optional"}
                        </Text>
                      </Pressable>
                      );
                    })}
                  </View>
          </View>
        ))}
      </View>
          ) : (
            <Text style={styles.tripDetailMissingEmpty}>{selectedDocEmpty}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function ChecklistAdvancePaymentPanel({
  summary,
  readiness,
  canPay,
  paymentCategory,
  paymentSubmitting,
  onConfirmPayment,
  onOpenPayModal,
  onReject,
  onFlag,
  onClearFlag,
  onFinanceVerify,
  onUndoFinanceVerify,
  financeVerifySubmitting = false,
  onUpdateUtr,
  onUpdatePaidAt,
  supplierName,
  onPreviewMemo,
}: {
  summary: ComplianceTripSummary;
  /** Resolved supplier display name for the "Paid to" card. */
  supplierName: string | null;
  /** Memo "Preview" opens the in-app viewer (zoom / rotate). */
  onPreviewMemo?: () => void;
  /** Edit only the UTR of the posted advance. Rejects with a user-facing error. */
  onUpdateUtr?: (
    summary: ComplianceTripSummary,
    transactionId: string,
    utr: string,
    category: AdvanceUtrTarget,
  ) => Promise<void>;
  /** Edit only the Paid at date of the posted advance. */
  onUpdatePaidAt?: (
    summary: ComplianceTripSummary,
    transactionId: string,
    transactionDate: string,
    category: AdvanceUtrTarget,
  ) => Promise<void>;
  readiness: ReturnType<typeof deriveComplianceQueueReadiness> | null;
  canPay: boolean;
  paymentCategory: ComplianceLedgerCategory | null;
  paymentSubmitting: boolean;
  onConfirmPayment?: (
    summary: ComplianceTripSummary,
    category: ComplianceLedgerCategory,
    values: CompliancePaymentConfirmValues,
  ) => void | Promise<void>;
  onOpenPayModal?: (summary: ComplianceTripSummary) => void;
  /** Trip-level compliance Reject (opens the remark modal). */
  onReject?: () => void;
  /** Finance: Flag to Compliance (opens the flag dialog). */
  onFlag?: () => void;
  /** Compliance: clear the finance flag. */
  onClearFlag?: () => void;
  /** Finance staff: approve a Compliance Verified trip. */
  onFinanceVerify?: () => void;
  /** Finance staff: undo Finance Verify while no advance is posted. */
  onUndoFinanceVerify?: () => void;
  financeVerifySubmitting?: boolean;
}) {
  const advance = summary.advance;
  const advanceBeforeVerification = summary.advanceBeforeVerification ?? null;
  const partyLabel =
    (supplierName ?? summary.trip.supplier_name)?.trim() || "party";
  const lane = readiness?.advance ?? null;
  // Advance Verification: read-only review of the payment values before Finance Verify.
  const flagged = !advance && Boolean(summary.financeFlaggedAt);
  const showReviewForm =
    !flagged &&
    !advance && !advanceBeforeVerification && Boolean(summary.complianceVerifiedAt) && !summary.financeVerifiedAt;
  const statusLabel = advance
    ? "Advance processed"
    : flagged
      ? "Flagged for Compliance"
    : showReviewForm
      ? "Finance review"
      : lane?.status === "ready"
      ? "Ready to pay"
      : lane?.status === "blocked"
        ? "Blocked"
        : "Not posted";
  const statusTone: "ready" | "posted" | "blocked" | "pending" = advance
    ? "posted"
    : flagged
      ? "blocked"
    : showReviewForm
      ? "pending"
      : lane?.status === "ready"
      ? "ready"
      : lane?.status === "blocked"
        ? "blocked"
        : "pending";
  const advanceBlockers =
    !advance && lane?.status === "blocked"
      ? (readiness?.blockerLines ?? []).filter((line) => {
          const lower = line.toLowerCase();
          // Balance-only messaging is noise on the advance panel.
          if (lower.includes("before the balance")) return false;
          // Amount / log are shown in ComplianceAdvanceCreditCard instead.
          if (advanceBeforeVerification && lower.includes("finance has posted")) return false;
          // The Finance Verify button below says this already.
          if (onFinanceVerify && lower.includes("waiting for approve advance")) return false;
          return true;
        })
      : [];
  const showInlineForm =
    !flagged &&
    !advance &&
    canPay &&
    paymentCategory === "compliance_advance" &&
    Boolean(onConfirmPayment);
  const showPayFallback = !advance && canPay && !showInlineForm && Boolean(onOpenPayModal);
  // Fallback button only when the review form is not shown (e.g. advance posted before verify).
  const showFinanceVerify =
    !advance &&
    !showReviewForm &&
    Boolean(summary.complianceVerifiedAt) &&
    !summary.financeVerifiedAt &&
    Boolean(onFinanceVerify);
  const showUndoFinanceVerify = !advance && Boolean(summary.financeVerifiedAt) && Boolean(onUndoFinanceVerify);

  const showArt =
    !advance &&
    !showInlineForm &&
    !showReviewForm;

  return (
    <View style={[styles.checklistAdvancePanel, advance && styles.checklistAdvancePanelPosted]}>
      <View style={styles.checklistAdvanceLead}>
      <Text style={styles.checklistInfoTitle}>Advance payment</Text>
        <Text style={styles.checklistInfoHint} numberOfLines={2}>
          {showInlineForm
            ? "Review the calculation and confirm to post through Finance"
            : showReviewForm
              ? "Check the values, then Approve Advance"
              : "Payment status for this trip's compliance advance"}
        </Text>

        {!advance ? (
          <View style={styles.checklistAdvanceStatusCard}>
            <Text style={styles.checklistAdvanceStatusLabel}>Status</Text>
            <View
              style={[
                styles.checklistAdvanceStatusPill,
                statusTone === "ready" && styles.checklistAdvanceStatusPillReady,
                statusTone === "posted" && styles.checklistAdvanceStatusPillPosted,
                statusTone === "blocked" && styles.checklistAdvanceStatusPillBlocked,
                statusTone === "pending" && styles.checklistAdvanceStatusPillPending,
              ]}
            >
              <View
                style={[
                  styles.checklistAdvanceStatusDot,
                  statusTone === "ready" && styles.checklistAdvanceStatusDotReady,
                  statusTone === "posted" && styles.checklistAdvanceStatusDotPosted,
                  statusTone === "blocked" && styles.checklistAdvanceStatusDotBlocked,
                  statusTone === "pending" && styles.checklistAdvanceStatusDotPending,
                ]}
              />
              <Text
                style={[
                  styles.checklistAdvanceStatusText,
                  statusTone === "ready" && styles.checklistAdvanceStatusTextReady,
                  statusTone === "posted" && styles.checklistAdvanceStatusTextPosted,
                  statusTone === "blocked" && styles.checklistAdvanceStatusTextBlocked,
                  statusTone === "pending" && styles.checklistAdvanceStatusTextPending,
                ]}
                numberOfLines={1}
              >
                {statusLabel}
              </Text>
            </View>
            </View>
        ) : null}
            </View>

      {advance ? (
        <ComplianceAdvancePaidDetails
          advance={advance}
          tripId={summary.trip.id}
          partyName={partyLabel}
          trip={!PRE_VERIFIED_STAGES.has(summary.stage) ? summary.trip : undefined}
          supplierName={supplierName}
          onUpdateUtr={
            onUpdateUtr
              ? (transactionId, utr, category) => onUpdateUtr(summary, transactionId, utr, category)
              : undefined
          }
          onUpdatePaidAt={
            onUpdatePaidAt
              ? (transactionId, transactionDate, category) =>
                  onUpdatePaidAt(summary, transactionId, transactionDate, category)
              : undefined
          }
        />
      ) : null}
      {!advance && advanceBeforeVerification ? (
        <ComplianceAdvanceCreditCard
          payment={advanceBeforeVerification}
          partyName={partyLabel}
          tone="blocked"
          footer={
            <Text style={styles.checklistAdvanceCreditFooter}>
              Finance has posted this advance. Mark the trip verified to continue — Compliance does not post payments.
            </Text>
          }
        />
      ) : null}

      {showInlineForm ? (
        <View style={styles.checklistAdvanceFormCard}>
          <CompliancePaymentConfirmModal
            presentation="inline"
            visible
            summary={summary}
            category="compliance_advance"
            submitting={paymentSubmitting}
            onConfirm={(values) => {
              void onConfirmPayment?.(summary, "compliance_advance", values);
            }}
            onReject={onReject}
            onFlag={onFlag}
            onPreviewMemo={onPreviewMemo}
          />
            </View>
      ) : null}

      {flagged ? (
        <View style={styles.checklistAdvanceFormCard}>
          <Text style={styles.flagTitle}>Flagged for Compliance review</Text>
          <Text style={styles.flagNote}>{summary.financeFlagNote?.trim() || "No note"}</Text>
          <Text style={styles.flagHint}>
            The advance is blocked until Compliance clears the flag or rejects the trip.
          </Text>
          {onClearFlag ? (
            <TouchableOpacity
              style={[styles.checklistPayBtn, styles.checklistAdvancePayFallback]}
              activeOpacity={0.85}
              onPress={onClearFlag}
              accessibilityRole="button"
              accessibilityLabel="Clear finance flag"
            >
              <Text style={styles.checklistPayBtnText}>Clear flag</Text>
            </TouchableOpacity>
          ) : null}
            </View>
      ) : null}

      {showReviewForm ? (
        <View style={styles.checklistAdvanceFormCard}>
          <CompliancePaymentConfirmModal
            presentation="inline"
            visible
            readOnly
            summary={summary}
            category="compliance_advance"
            submitting={false}
            onConfirm={() => undefined}
            onReject={onReject}
            onFlag={onFlag}
            onFinanceVerify={onFinanceVerify}
            financeVerifySubmitting={financeVerifySubmitting}
            onPreviewMemo={onPreviewMemo}
              />
            </View>
      ) : null}

      {!showInlineForm && !showReviewForm && (showPayFallback || onReject || showFinanceVerify) ? (
        <View style={styles.checklistAdvanceActionsRow}>
          {onReject ? (
        <TouchableOpacity
              style={styles.checklistAdvanceRejectBtn}
              activeOpacity={0.8}
              onPress={onReject}
              accessibilityRole="button"
              accessibilityLabel="Reject trip compliance"
            >
              <Text style={styles.checklistAdvanceRejectText}>Reject</Text>
            </TouchableOpacity>
          ) : null}
          {showFinanceVerify ? (
            <TouchableOpacity
              style={[styles.checklistPayBtn, styles.checklistAdvancePayFallback]}
          activeOpacity={0.85}
              onPress={onFinanceVerify}
              disabled={financeVerifySubmitting}
              accessibilityRole="button"
              accessibilityLabel="Approve advance"
              accessibilityState={{ disabled: financeVerifySubmitting, busy: financeVerifySubmitting }}
            >
              <Text style={styles.checklistPayBtnText}>
                {financeVerifySubmitting ? "Approving…" : "Approve Advance"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {showPayFallback ? (
            <TouchableOpacity
              style={[styles.checklistPayBtn, styles.checklistAdvancePayFallback]}
              activeOpacity={0.85}
              onPress={() => onOpenPayModal?.(summary)}
          accessibilityRole="button"
          accessibilityLabel="Pay advance"
        >
          <Text style={styles.checklistPayBtnText}>Pay advance</Text>
        </TouchableOpacity>
      ) : null}
        </View>
      ) : null}

      {advanceBlockers.length > 0 && !showReviewForm ? (
        <View style={styles.checklistBlockerBox}>
          {advanceBlockers.slice(0, 3).map((line) => (
            <Text key={line} style={styles.checklistBlockerText} numberOfLines={2}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {showUndoFinanceVerify ? (
        <View style={styles.checklistRejectedPayRow}>
          <Text style={styles.checklistRejectedPayHint} numberOfLines={2}>
            Advance approved. Undo is possible until the advance is posted.
          </Text>
          <TouchableOpacity
            style={styles.checklistRejectedPayBtn}
            activeOpacity={0.85}
            onPress={onUndoFinanceVerify}
            disabled={financeVerifySubmitting}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Undo advance approval"
            accessibilityState={{ disabled: financeVerifySubmitting, busy: financeVerifySubmitting }}
          >
            <Text style={styles.checklistRejectedPayBtnText}>
              {financeVerifySubmitting ? "Undoing…" : "Undo approval"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showArt ? (
        <View style={styles.checklistAdvanceArtSlot} pointerEvents="none">
          <ComplianceAdvancePaymentArt />
        </View>
      ) : null}
    </View>
  );
}

const _TripListRow = React.memo(function TripListRow({
  summary,
  selected,
  organizationId,
  truckType,
  supplierName,
  partyAvatar,
  onSelect,
  podOnly = false,
  onOpenActivityLog,
}: {
  summary: ComplianceTripSummary;
  selected: boolean;
  organizationId: string;
  truckType: string | null;
  supplierName: string | null;
  partyAvatar: ListCardPartyAvatar | null;
  onSelect: (tripId: string) => void;
  /** Debit control: POD facts only — no compliance / finance badges, holds or flags. */
  podOnly?: boolean;
  onOpenActivityLog?: () => void;
}) {
  const router = useRouter();
  const trip = summary.trip;
  const verification = verificationStatusVisual(summary);
  const tripStatus = tripOpsStatusBadge(trip.status, trip);
  const debitStatus = podDebitStatusVisual(summary);
  const isRejected =
    !podOnly && (isFinanceDeclinedTrip(summary) || isComplianceDeclineActive(summary));
  // Finance reject fixed by Ground Ops and back with Finance: tag it until the advance posts.
  const resubmittedToFinance = !podOnly && !summary.advance && isResubmittedFinanceReject(summary);
  const declineRemark = isRejected
    ? summary.complianceDeclineReason?.trim() || ""
    : resubmittedToFinance && summary.complianceDeclineReason?.trim()
      ? `Rejected: ${summary.complianceDeclineReason.trim()}`
      : "";
  const waitingNote = isRejected && isComplianceAwaitingResubmit(summary);
  // Ground Ops' answer, only when it belongs to the latest decline / reject.
  const resubmitNote =
    (isRejected || resubmittedToFinance) &&
    summary.complianceResubmitNote?.trim() &&
    summary.complianceResubmittedAt &&
    summary.complianceDeclinedAt &&
    Date.parse(summary.complianceResubmittedAt) >= Date.parse(summary.complianceDeclinedAt)
      ? summary.complianceResubmitNote.trim()
      : "";
  const customerName = trip.client_name?.trim() || "—";
  const supplierLabel = (supplierName ?? trip.supplier_name)?.trim() || "—";
  const vehicle =
    formatIndianVehicleNumber(trip.vehicle_display_number?.trim() || "").trim() ||
    trip.vehicle_display_number?.trim() ||
    "—";
  const truckLabel = truckType?.trim() || "—";
  const inTransitAt = formatComplianceTimestamp(trip.started_at);
  const executionModel = getTripExecutionModel(trip);
  const lrReceipt = lrReceiptForTrip(
    summary.hardCopyPod.lrNumbers ?? [],
    summary.hardCopyPod.receivedLrNumbers ?? [],
  );
  const showLrReceipt =
    (summary.hardCopyPod.lrNumbers?.length ?? 0) > 0 &&
    (tripAppearsInAwaitingPod(summary) || lrReceipt.kind !== "none");
  const isAsset = executionModel === "asset";
  const headerName = partyAvatar?.name || (supplierLabel !== "—" ? supplierLabel : customerName);
  const partyEntityType = partyAvatar?.entityType ?? (trip.supplier_id ? "supplier" : "client");
  const partyIntegrated = partyAvatar?.isIntegrated ?? false;
  const partyAvatarUrl = partyAvatar?.avatarUrl ?? null;
  const partyAvatarSeed = partyAvatar?.avatarSeed ?? null;
  const partyOrgImageUrl = partyAvatar?.organizationImageUrl ?? null;
  const headerSeed = partyAvatar?.initialsColorSeed ?? trip.supplier_id ?? trip.client_id ?? trip.id;
  const supplierId = (trip.supplier_id ?? "").trim();
  const clientId = (trip.client_id ?? "").trim();
  const partyId = (partyAvatar?.partyId ?? (partyEntityType === "supplier" ? supplierId : clientId)).trim();
  const { can: canSurface } = useMemberAccess();
  const canOpenSupplier =
    partyEntityType === "supplier" &&
    canSurface("sales.suppliers.detail") &&
    Boolean(partyId) &&
    headerName.toLowerCase() !== "own fleet";
  const canOpenClient =
    partyEntityType === "client" &&
    canSurface("sales.clients.detail") &&
    Boolean(partyId);
  const canOpenParty = canOpenSupplier || canOpenClient;
  const ignoreCardSelectRef = useRef(false);
  const tripIdLabel = getTripDisplayNumber(trip, organizationId || null);
  const metaParts = [tripIdLabel, inTransitAt].filter((part) => part && part !== "—");

  const suppressCardSelect = useCallback(() => {
    ignoreCardSelectRef.current = true;
    const clear = () => {
      ignoreCardSelectRef.current = false;
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(clear);
    } else {
      setTimeout(clear, 0);
    }
  }, []);

  const stopNestedPress = useCallback(
    (event?: GestureResponderEvent) => {
      event?.stopPropagation?.();
      const native = event?.nativeEvent as
        | { stopImmediatePropagation?: () => void; stopPropagation?: () => void }
        | undefined;
      native?.stopImmediatePropagation?.();
      native?.stopPropagation?.();
      suppressCardSelect();
    },
    [suppressCardSelect],
  );

  const openPartyProfile = useCallback(
    (event?: GestureResponderEvent) => {
      stopNestedPress(event);
      if (canOpenSupplier) {
        router.push(ROUTES.supplierDetail(partyId) as Href);
        return;
      }
      if (canOpenClient) {
        router.push(ROUTES.clientDetail(partyId) as Href);
      }
    },
    [canOpenClient, canOpenSupplier, partyId, router, stopNestedPress],
  );

  const openTripOperations = useCallback(
    (event?: GestureResponderEvent) => {
      stopNestedPress(event);
      router.push(ROUTES.tripDetail(trip.id) as Href);
    },
    [router, stopNestedPress, trip.id],
  );

  const webStopBubble =
    Platform.OS === "web"
      ? {
          onClick: (event: { stopPropagation: () => void }) => {
            event.stopPropagation();
          },
        }
      : null;

  return (
    <Pressable
      onPress={() => {
        if (ignoreCardSelectRef.current) return;
        onSelect(trip.id);
      }}
      style={(state: HoverPressState) => [
        styles.row,
        WEB_POINTER,
        WEB_TRANSITION,
        isHovered(state) && !selected && !isRejected && styles.rowHover,
        selected && styles.rowSelected,
        isRejected && styles.rowRejected,
        selected && isRejected && styles.rowRejectedSelected,
        isHovered(state) && selected && !isRejected && styles.rowSelectedHover,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${headerName}, ${tripIdLabel}, ${verification.label}`}
    >
      {selected && !isRejected ? <View style={styles.rowSelectedBar} /> : null}
      <View style={styles.rowHead}>
        <Pressable
          onPress={canOpenParty ? openPartyProfile : undefined}
          disabled={!canOpenParty}
          style={(state: HoverPressState) => [
            styles.rowAvatarHit,
            canOpenParty && WEB_POINTER,
            canOpenParty && WEB_TRANSITION,
            canOpenParty && isHovered(state) && styles.rowAvatarHitHover,
            canOpenParty && state.pressed && styles.rowPartyHitPressed,
          ]}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          accessibilityRole={canOpenParty ? "link" : "none"}
          accessibilityLabel={
            canOpenParty ? `Open ${headerName} ${partyEntityType} details` : undefined
          }
          accessibilityState={{ disabled: !canOpenParty }}
          {...webStopBubble}
        >
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCore}>
        <PartyAvatar
          name={headerName}
                entityType={partyEntityType}
                size={LIST_CARD_AVATAR}
                shape="circle"
                isIntegrated={partyIntegrated}
          initialsColorSeed={headerSeed}
                avatarUrl={partyAvatarUrl}
                avatarSeed={partyAvatarSeed}
                organizationImageUrl={partyOrgImageUrl}
              />
            </View>
            <View
              style={[
                styles.avatarDot,
                selected && styles.avatarDotSelected,
                isRejected && styles.avatarDotRejected,
                !selected && !isRejected && styles.avatarDotIdle,
              ]}
            />
          </View>
        </Pressable>
        <View style={styles.rowPartyBlock}>
          <View style={styles.nameRow}>
            <View style={styles.rowNameHit}>
              <Text
                style={[
                  styles.client,
                  selected && styles.clientSelected,
                  isRejected && styles.clientRejected,
                ]}
                numberOfLines={2}
              >
                {headerName}
                <Text style={styles.headlineAction}>
                  {`  ${isAsset ? "Asset trip" : "Aggregate trip"}`}
                </Text>
            </Text>
          </View>
            {onOpenActivityLog ? (
              <View {...webStopBubble}>
                <ComplianceActivityLogButton
                  compact
                  onPress={() => {
                    suppressCardSelect();
                    onOpenActivityLog();
                  }}
                />
        </View>
            ) : null}
      </View>
          {metaParts.length > 0 ? (
            <Text style={[styles.rowMetaLine, selected && styles.tripIdSelected]} numberOfLines={1}>
              {metaParts.join(" · ")}
            </Text>
          ) : null}

          {declineRemark ? (
            <Text style={styles.rejectReasonLine} numberOfLines={2}>
              {declineRemark}
          </Text>
          ) : null}
          {resubmitNote ? (
            <View
              style={styles.resubmitNoteBlock}
              accessibilityLabel={`Resubmitted. ${resubmitNote}`}
            >
              <Text style={styles.resubmitNoteLabel}>Resubmitted</Text>
              <Text style={styles.resubmitNoteLine}>{resubmitNote}</Text>
            </View>
          ) : waitingNote ? (
            <Text style={styles.resubmitNoteLine} numberOfLines={1}>
              Waiting for Ground Ops to resubmit
            </Text>
          ) : null}
          {summary.financeFlaggedAt && !podOnly ? (
            <Text style={styles.rejectReasonLine} numberOfLines={2}>
              {`Finance flag: ${summary.financeFlagNote?.trim() || "no note"}`}
          </Text>
          ) : null}
        </View>
      </View>

          <View style={[styles.detailCard, isRejected && styles.factsRejected]}>
            <LoadCardRouteRow
              origin={trip.pickup_area ?? ""}
              destination={trip.drop_location ?? ""}
              compact
              style={styles.route}
            />
            <View style={styles.facts}>
        <View style={styles.factCell}>
          <Text style={[styles.factLabel, selected && styles.factLabelSelected]}>Customer</Text>
          <Text style={[styles.factValue, selected && styles.factValueSelected]} numberOfLines={1}>
            {customerName}
          </Text>
        </View>
        <View style={[styles.factCell, styles.factCellEnd]}>
                <Text style={[styles.factLabel, selected && styles.factLabelSelected]}>Vehicle</Text>
                <Text style={[styles.factValue, styles.alignEnd, selected && styles.factValueSelected]} numberOfLines={1}>
            {vehicle}
          </Text>
        </View>
              {truckLabel !== "—" ? (
                <View style={styles.factCellWide}>
                  <Text style={[styles.factLabel, selected && styles.factLabelSelected]}>Truck</Text>
                  <Text style={[styles.factValue, selected && styles.factValueSelected]} numberOfLines={1}>
            {truckLabel}
          </Text>
        </View>
              ) : null}
            </View>
            {showLrReceipt ? (
              <View style={styles.lrReceipt}>
                <Text
                  style={[styles.lrReceiptLine, selected && styles.lrReceiptLineSelected]}
                  numberOfLines={1}
                >
                  <Text style={[styles.lrReceiptLabel, selected && styles.lrReceiptLabelSelected]}>
                    Received LRs{" "}
                  </Text>
                  {lrReceipt.received.join(", ") || "—"}
                </Text>
                <Text
                  style={[styles.lrReceiptLine, selected && styles.lrReceiptLineSelected]}
                  numberOfLines={1}
                >
                  <Text style={[styles.lrReceiptLabel, selected && styles.lrReceiptLabelSelected]}>
                    Pending LRs{" "}
                  </Text>
                  {lrReceipt.pending.join(", ") || "—"}
          </Text>
        </View>
            ) : null}
            <View style={styles.rowFooter}>
              <View style={styles.rowFooterPills}>
                {tripStatus ? (
                  <View
                    style={[styles.statusPill, { backgroundColor: tripStatus.tone.bg }]}
                    accessibilityLabel={`Trip status ${tripStatus.label}`}
                  >
                    <Text style={[styles.statusText, { color: tripStatus.tone.fg }]} numberOfLines={1}>
                      {tripStatus.label}
                    </Text>
                  </View>
                ) : null}
                {debitStatus ? (
                  <View
                    style={[styles.statusPill, { backgroundColor: debitStatus.tone.bg }]}
                    accessibilityLabel={debitStatus.label}
                  >
                    <Text style={[styles.statusText, { color: debitStatus.tone.fg }]} numberOfLines={1}>
                      {debitStatus.label}
                    </Text>
                  </View>
                ) : null}
                {podOnly ? null : (
                  <>
                    {resubmittedToFinance ? (
                      <View
                        style={[styles.statusPill, { backgroundColor: Theme.complianceStagePendingBg }]}
                        accessibilityLabel="Resubmitted by Ground Ops"
                      >
                        <Text style={[styles.statusText, { color: Theme.complianceStagePendingFg }]} numberOfLines={1}>
                          Resubmitted
                        </Text>
                      </View>
                    ) : null}
                    <View style={[styles.statusPill, { backgroundColor: verification.tone.bg }]}>
                      <Text style={[styles.statusText, { color: verification.tone.fg }]} numberOfLines={1}>
                        {verification.label}
                      </Text>
                    </View>
                  </>
                )}
                <View style={[styles.modelTag, isAsset ? styles.modelTagAsset : styles.modelTagAggregate]}>
                  <Text
                    style={[
                      styles.modelTagText,
                      isAsset ? styles.modelTagTextAsset : styles.modelTagTextAggregate,
                    ]}
                  >
                    {isAsset ? "Asset" : "Aggregate"}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={openTripOperations}
                style={({ pressed }) => [
                  alertRegistryActionStyles.ghostBtn,
                  styles.rowFooterAction,
                  pressed && styles.rowPartyHitPressed,
                ]}
                accessibilityRole="link"
                accessibilityLabel={`Open trip ${tripIdLabel} in Trip Operations`}
                {...webStopBubble}
              >
                <Text style={[alertRegistryActionStyles.ghostBtnText, styles.rowFooterActionText]}>
                  Open trip
                </Text>
              </Pressable>
            </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  workspace: { flex: 1, minHeight: 0, flexDirection: "row", alignItems: "stretch", gap: 12, overflow: "hidden", backgroundColor: HUB_MOBILE_LIST_CANVAS_BG },
  workspaceStacked: { flexDirection: "column", gap: 16 },
  workspaceMobile: { gap: 0, backgroundColor: HUB_MOBILE_LIST_CANVAS_BG, overflow: "visible" },
  listPane: {
    width: 420,
    maxWidth: "42%",
    flexShrink: 0,
    minHeight: 0,
    alignSelf: "stretch",
    backgroundColor: HUB_MOBILE_LIST_CANVAS_BG,
    borderRadius: 0,
    borderWidth: 0,
    overflow: "visible",
  },
  listPaneFill: { height: "100%" },
  listPaneStacked: { width: "100%", maxWidth: "100%", height: "42%", maxHeight: "42%" },
  listPaneMobile: {
    width: "100%",
    maxWidth: "100%",
    flex: 1,
    minHeight: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    overflow: "visible",
  },


  /** Debit control: no checklist / preview, the trip list takes the row. */
  listPaneFull: { flex: 1, width: "auto", maxWidth: "100%", height: "100%", maxHeight: "100%" },
  listEmpty: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  listEmptyMobileContent: {
    flexGrow: 1,
    backgroundColor: HUB_MOBILE_LIST_CANVAS_BG,
  },
  listEmptyMobileBody: {
    flexGrow: 1,
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  listScroll: { flex: 1, minHeight: 0, backgroundColor: HUB_MOBILE_LIST_CANVAS_BG },
  listContent: { paddingTop: 10, paddingBottom: 16, paddingHorizontal: 12, gap: 0, backgroundColor: HUB_MOBILE_LIST_CANVAS_BG },
  listContentMobile: {
    flexGrow: 0,
    paddingTop: 10,
    paddingBottom: 28,
    paddingHorizontal: Layout.screenPaddingHorizontal,
    backgroundColor: HUB_MOBILE_LIST_CANVAS_BG,
  },
  listLoadMore: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  listLoadSentinel: {
    height: 1,
  },
  listLoadEnd: {
    paddingTop: 8,
    paddingBottom: 10,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  row: {
    position: "relative",
    overflow: "hidden",
    flexDirection: "column",
    alignItems: "stretch",
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  rowHover: {
    backgroundColor: Theme.tableRowHover,
    borderBottomColor: Theme.complianceHoverBorder,
  },
  rowSelected: {
    backgroundColor: Theme.brandBlueSoft,
    borderBottomColor: Theme.complianceBulk,
  },
  rowSelectedBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: Theme.complianceBulk,
  },
  rowSelectedHover: {
    backgroundColor: Theme.brandBlueSoft,
    borderBottomColor: Theme.complianceBulk,
  },
  rowRejected: {
    borderBottomColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.complianceStageDocsBg,
  },
  rowRejectedSelected: {
    borderBottomColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.complianceStageDocsBg,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "stretch",
    width: "100%",
    gap: 8,
  },
  rowAvatarHit: {
    width: LIST_CARD_AVATAR,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    flexShrink: 0,
    alignSelf: "flex-start",
    paddingTop: 1,
    borderRadius: LIST_CARD_AVATAR / 2,
  },
  rowAvatarHitHover: {
    opacity: 0.88,
    transform: [{ scale: 1.08 }],
  },
  avatarWrap: {
    width: LIST_CARD_AVATAR,
    height: LIST_CARD_AVATAR,
    position: "relative",
    flexShrink: 0,
    alignSelf: "flex-start",
    overflow: "visible",
  },
  avatarCore: {
    width: LIST_CARD_AVATAR,
    height: LIST_CARD_AVATAR,
    borderRadius: LIST_CARD_AVATAR / 2,
    overflow: "hidden",
  },
  avatarDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: LIST_CARD_AVATAR_DOT,
    height: LIST_CARD_AVATAR_DOT,
    borderRadius: LIST_CARD_AVATAR_DOT / 2,
    borderWidth: 1.5,
    borderColor: Theme.cardWhite,
    zIndex: 2,
  },
  avatarDotIdle: {
    backgroundColor: Theme.positive,
  },
  avatarDotSelected: {
    backgroundColor: Theme.actionBtnInk,
  },
  avatarDotRejected: {
    backgroundColor: Theme.destructive,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  rowNameHit: {
    flex: 1,
    minWidth: 0,
  },
  rowMeta: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 4,
  },
  lrReceipt: { gap: 1 },
  lrReceiptLine: {
    fontSize: 11,
    lineHeight: 15,
    color: Theme.textPrimaryDark,
  },
  lrReceiptLineSelected: { color: Theme.complianceTripCardOnSelected },
  lrReceiptLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  lrReceiptLabelSelected: { color: Theme.complianceTripCardMutedOnSelected },
  rejectReasonLine: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.complianceStageDocsFg,
    lineHeight: 13,
  },
  resubmitNoteBlock: {
    gap: 2,
    marginTop: 2,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: Theme.positiveMuted,
  },
  resubmitNoteLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: Theme.positive,
    textTransform: "uppercase",
  },
  resubmitNoteLine: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 13,
  },
  clientRejected: {
    color: Theme.complianceStageDocsFg,
  },
  factsRejected: {
    borderColor: Theme.complianceStageDocsFg,
  },
  rowPartyBlock: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    gap: 2,
    paddingTop: 1,
  },
  rowPartyHitPressed: { opacity: 0.85 },
  client: {
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: Theme.actionBtnInk,
    ...WEB_COPY,
  },
  headlineAction: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "500",
    letterSpacing: 0,
    color: Theme.textMuted,
    ...WEB_COPY,
  },
  rowMetaLine: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "400",
    letterSpacing: 0,
    color: Theme.textMuted,
    ...WEB_COPY,
    minWidth: 0,
    flexShrink: 1,
  },
  clientSelected: { color: Theme.complianceTripCardOnSelected },
  detailCard: {
    alignSelf: "stretch",
    width: "100%",
    maxWidth: "100%",
    backgroundColor: Theme.cardWhite,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  rowFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    width: "100%",
    minWidth: 0,
  },
  rowFooterPills: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  rowFooterAction: {
    flexShrink: 0,
  },
  rowFooterActionText: {
    letterSpacing: 0,
    ...WEB_COPY,
  },
  idLine: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  idLineTrail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  tripIdEyeBtn: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tripId: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0,
  },
  tripIdSelected: { color: Theme.complianceTripCardMutedOnSelected },
  modelTag: {
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modelTagAsset: { backgroundColor: Theme.positiveMuted },
  modelTagAggregate: { backgroundColor: Theme.complianceStageInfoBg },
  modelTagText: { fontSize: 9, fontWeight: "500", letterSpacing: 0, lineHeight: 11, ...WEB_COPY },
  modelTagTextAsset: { color: Theme.darkGreen },
  modelTagTextAggregate: { color: Theme.complianceStageInfoFg },
  statusPill: {
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0,
    lineHeight: 11,
    ...WEB_COPY,
  },
  route: {
    marginTop: 0,
    marginBottom: 0,
    width: "100%",
    alignSelf: "stretch",
  },
  alignEnd: { textAlign: "right" },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    width: "100%",
    rowGap: 6,
    columnGap: 0,
  },
  factsSelected: { backgroundColor: Theme.complianceSelectedWash },
  factCell: {
    width: "50%",
    minWidth: 0,
    gap: 2,
    paddingRight: 10,
  },
  factCellEnd: { paddingRight: 0, paddingLeft: 10, alignItems: "flex-end" },
  factCellWide: {
    width: "100%",
    minWidth: 0,
    gap: 2,
  },
  factLabel: {
    fontSize: 10,
    fontWeight: "400",
    letterSpacing: 0,
    color: Theme.textMuted,
    lineHeight: 13,
    ...WEB_COPY,
  },
  factLabelSelected: { color: Theme.complianceTripCardMutedOnSelected },
  factValue: {
    width: "100%",
    fontSize: 11,
    fontWeight: "500",
    color: Theme.actionBtnInk,
    lineHeight: 15,
    letterSpacing: 0,
    ...WEB_COPY,
  },
  factValueSelected: { color: Theme.complianceTripCardOnSelected },
  detailColumn: { flex: 1, minWidth: 0, minHeight: 0, gap: 8 },
  detailColumnStacked: { width: "100%", flex: 1 },
  detailPaneFill: { flex: 1 },
  podLogPane: { paddingHorizontal: 0, paddingVertical: 0, overflow: "hidden" },
  podLogPaneMobile: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  previewPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: "#F5F5F5",
    borderRadius: 0,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 0,
  },
  tabRow: { flexShrink: 0, height: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tabGroup: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 },
  tab: {
    height: 22,
    minHeight: 22,
    maxHeight: 22,
    minWidth: 58,
    paddingVertical: 0,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    overflow: "hidden",
  },
  tabHover: {
    backgroundColor: Theme.surface,
    borderColor: Theme.complianceHoverBorder,
  },
  tabActive: { backgroundColor: Theme.buttonDark, borderColor: Theme.buttonDark },
  tabActiveHover: {
    ...(Platform.OS === "web"
      ? { boxShadow: `0 4px 10px ${Theme.complianceCardShadow}` }
      : null),
  },
  tabText: { fontSize: 11, fontWeight: "500", lineHeight: 14, textAlign: "center", color: Theme.textPrimaryDark },
  tabTextActive: { color: Theme.buttonDarkText, fontWeight: "600" },
  tabBadge: {
    minWidth: 14,
    height: 14,
    borderRadius: 999,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceStageDocsBg,
  },
  tabBadgeActive: { backgroundColor: Theme.accentGold },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 11,
    color: Theme.complianceStageDocsFg,
  },
  tabBadgeTextActive: { color: Theme.buttonDark },
  stage: {
    flex: 1,
    minHeight: 0,
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
    overflow: "hidden",
  },
  openLayer: {
    ...StyleSheet.absoluteFillObject,
    cursor: "zoom-in",
  } as unknown as ViewStyle,
  screenRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.overlayBackdrop,
  },
  screenRootPage: {
    backgroundColor: Theme.darkSurface,
  },
  screenBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  screenSheet: {
    maxWidth: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
  },
  screenSheetPage: {
    borderRadius: 0,
    borderWidth: 0,
    maxWidth: "100%",
    overflow: "visible",
  },
  screenBar: {
    minHeight: 48,
    height: 48,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Theme.cardWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
    zIndex: 6,
  },
  screenBarCompact: {
    height: "auto",
    minHeight: 48,
    flexWrap: "wrap",
    paddingVertical: 8,
  },
  screenTitleBlock: { flex: 1, minWidth: 80, gap: 1 },
  screenTitle: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  screenSubtitle: { fontSize: 11, fontWeight: "500", color: Theme.textSecondary },
  screenTools: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
    flexShrink: 0,
  },
  screenNavFooter: {
    justifyContent: "flex-end",
    paddingRight: 16,
  },
  screenStageRow: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    backgroundColor: Theme.compliancePageBg,
  },
  screenStageRowPage: {
    backgroundColor: Theme.darkSurface,
  },
  screenStage: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
  },
  screenStagePage: {
    backgroundColor: Theme.darkBackground,
  },
  screenStageTyped: {
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  screenPage: { width: "100%", height: "100%" },
  screenFile: { width: "100%", height: "100%" },
  screenLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    zIndex: 2,
  },
  screenLoadingText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textOnDarkMuted,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  typedPreviewShell: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    backgroundColor: Theme.compliancePreviewCanvas,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  /** Header + entries share one centred column; wide web screens stop stretching the cards. */
  typedPreviewColumn: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    maxWidth: 960,
    alignSelf: "center",
    gap: 8,
  },
  typedPreviewScrollDark: {
    backgroundColor: Theme.darkSurface,
  },
  typedPreviewContentWithNav: {
    paddingHorizontal: 56,
  },
  typedPreviewHeader: {
    flexShrink: 0,
    // Same right edge as the entry cards (typedPreviewScrollContent leaves 18 for the rail).
    marginRight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  typedPreviewHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonDark,
  },
  typedPreviewHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  typedPreviewKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  typedPreviewTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  typedPreviewMeta: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  typedPreviewChips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  typedChip: {
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.complianceStageBalanceBg,
  },
  typedChipMuted: {
    backgroundColor: Theme.complianceStagePendingBg,
  },
  typedChipText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  typedPreviewScrollStage: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    position: "relative",
    overflow: "hidden",
  },
  typedPreviewScroll: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    height: "100%",
  },
  typedPreviewScrollContent: {
    gap: 12,
    paddingBottom: 16,
    paddingRight: 18,
    flexGrow: 0,
  },
  typedPreviewRow: {
    flexGrow: 0,
    flexShrink: 0,
    // Single column: space between stacked entry cards (grid rows use their own gap).
    gap: 8,
  },
  typedPreviewRowGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  typedEntryCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 168,
    flexDirection: "row",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)" } as ViewStyle,
      default: {
        shadowColor: Theme.textPrimaryDark,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
      },
    }),
  },
  typedEntryAccent: {
    width: 4,
    alignSelf: "stretch",
    backgroundColor: Theme.complianceStageBalanceFg,
  },
  typedEntryAccentOk: { backgroundColor: Theme.complianceStageSuccessFg },
  typedEntryAccentSoon: { backgroundColor: Theme.complianceStagePendingFg },
  typedEntryAccentExpired: { backgroundColor: Theme.complianceStageDocsFg },
  typedEntryInner: {
    flex: 1,
    minWidth: 0,
  },
  typedEntryCardSpacer: {
    flex: 1,
    minWidth: 0,
  },
  typedEntryHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceCardBorder,
    backgroundColor: Theme.compliancePageBg,
  },
  typedEntryIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.buttonDark,
    marginTop: 2,
  },
  typedEntryIndexText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: Theme.buttonDarkText,
  },
  typedEntryHeadingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  typedEntryKicker: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.45,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  typedEntryHeading: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  typedStatusPill: {
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  typedStatusOk: { backgroundColor: Theme.complianceStageSuccessBg },
  typedStatusSoon: { backgroundColor: Theme.complianceStagePendingBg },
  typedStatusExpired: { backgroundColor: Theme.complianceStageDocsBg },
  typedStatusNeutral: { backgroundColor: Theme.complianceStageBalanceBg },
  typedStatusText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  typedStatusTextOk: { color: Theme.complianceStageSuccessFg },
  typedStatusTextSoon: { color: Theme.complianceStagePendingFg },
  typedStatusTextExpired: { color: Theme.complianceStageDocsFg },
  typedStatusTextNeutral: { color: Theme.complianceStageBalanceFg },
  typedFactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  typedFact: {
    width: "47%",
    flexGrow: 1,
    minWidth: 108,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
    gap: 3,
  },
  typedFactWide: {
    width: "100%",
  },
  typedFactLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  typedFactValue: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  typedFieldRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typedFieldRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceCardBorder,
  },
  typedFieldLabel: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "46%",
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 13,
    letterSpacing: 0.2,
    color: Theme.textMuted,
  },
  typedValueTabular: { fontVariant: ["tabular-nums"] },
  typedFieldValue: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
    color: Theme.textPrimaryDark,
    textAlign: "right",
    ...(Platform.OS === "web" ? ({ whiteSpace: "nowrap" } as unknown as TextStyle) : null),
  },
  docSideNavOverlayLeft: {
    position: "absolute",
    left: 10,
    top: "50%",
    width: 44,
    height: 44,
    marginTop: -22,
    zIndex: 40,
    elevation: 40,
  },
  docSideNavOverlayRight: {
    position: "absolute",
    right: 10,
    top: "50%",
    width: 44,
    height: 44,
    marginTop: -22,
    zIndex: 40,
    elevation: 40,
  },
  docSideNavOverlayScreen: {
    bottom: 0,
  },
  docSideNavBtn: {
    width: 44,
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    // Ensure the control receives clicks even when a rotated image paints underneath.
    zIndex: 41,
    elevation: 41,
  },
  docSideNavBtnDark: {
    backgroundColor: Theme.darkInputBg,
    borderColor: Theme.borderOnDark,
  },
  docSideNavBtnDisabled: {
    opacity: 0.4,
  },
  previewTools: { flexShrink: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
  podBtn: {
    ...complianceActionButtonStyles.ghost,
    flexShrink: 0,
  },
  podBtnText: {
    ...complianceActionButtonStyles.ghostText,
  },
  zoomBar: {
    flexShrink: 0,
    height: 22,
    minHeight: 22,
    maxHeight: 22,
    paddingVertical: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderRadius: 999,
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    overflow: "hidden",
  },
  zoomBtn: { width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  zoomLabel: { fontSize: 10, fontWeight: "500", lineHeight: 12, color: Theme.textPrimaryDark, minWidth: 32, textAlign: "center" },
  stageBody: { flex: 1, minHeight: 0, width: "100%" },
  stageScroll: { flex: 1, width: "100%", minHeight: 0 },
  stageFill: { width: "100%", height: "100%" },
  stageScrollCenter: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  stageScrollStart: { flexGrow: 1, alignItems: "flex-start", justifyContent: "flex-start" },
  typedCard: {
    minWidth: 280,
    maxWidth: 420,
    width: "100%",
    padding: 16,
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  emptyStage: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 24,
  },
  missingListScroll: { flexGrow: 0, flexShrink: 1, flexBasis: "auto" },
  checklistStage: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
    paddingHorizontal: 6,
    paddingBottom: 6,
    paddingTop: 2,
  },
  checklistStageStacked: {
    flexDirection: "column",
    gap: 12,
  },
  checklistStageMobile: {
    paddingHorizontal: 0,
    paddingBottom: 0,
    gap: 0,
  },
  checklistListPaneMobile: {
    width: "100%",
    maxWidth: "100%",
    maxHeight: "100%",
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "#F5F5F5",
    overflow: "visible",
  },
  checklistPageScroll: {
    flexGrow: 1,
    paddingBottom: 48,
    paddingHorizontal: 0,
    gap: 10,
    backgroundColor: "#F5F5F5",
  },
  checklistPreviewPaneMobile: {
    width: "100%",
    maxWidth: "100%",
    minHeight: 0,
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "#F5F5F5",
  },
  mobilePreviewBack: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 44,
    paddingHorizontal: 14,
    gap: 4,
    backgroundColor: Theme.screenBackground,
  },
  mobilePreviewBackText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#212121",
    letterSpacing: -0.2,
  },
  previewNav: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  previewNavBack: {
    width: 36,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  previewNavCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 2,
  },
  previewNavTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0,
  },
  previewNavMeta: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#9E9E9E",
  },
  previewNavTools: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 2,
  },
  previewNavTool: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistListPane: {
    flex: 1,
    minWidth: 0,
    width: "auto",
    maxWidth: "100%",
    alignSelf: "stretch",
    minHeight: 0,
    flexDirection: "column",
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "#F5F5F5",
    overflow: "hidden",
  },
  checklistListPaneSplit: { width: "100%", maxWidth: "100%", flex: 1 },
  checklistListPaneStacked: {
    width: "100%",
    maxWidth: "100%",
    maxHeight: "46%",
    flexShrink: 1,
  },
  checklistPanelToolbar: {
    flexShrink: 0,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.complianceTripCardBg,
  },
  checklistPanelToolbarMobile: {
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderBottomWidth: 0,
    backgroundColor: Theme.screenBackground,
  },
  docScopeTabRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 14,
    backgroundColor: Theme.screenBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEEEEE",
  },
  docScopeTab: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    minHeight: 40,
  },
  docScopeTabActive: {
    borderBottomColor: "#212121",
  },
  docScopeTabHover: {
    opacity: 0.72,
  },
  docScopeTabText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#9E9E9E",
  },
  docScopeTabTextActive: {
    fontWeight: "600",
    color: "#212121",
  },
  checklistPanelTabsScrollMobile: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    width: "auto",
  },
  checklistPanelTabsScroll: {
    flex: 1,
    minWidth: 0,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  checklistPanelTabs: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
    height: 32,
    paddingLeft: 14,
    paddingRight: 6,
    gap: 4,
  },
  checklistPanelTab: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    height: 26,
    minHeight: 26,
    maxHeight: 26,
    minWidth: 72,
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 4,
    gap: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 999,
    backgroundColor: Theme.surface,
    overflow: "visible",
  },
  checklistPanelTabText: {
    flexShrink: 0,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
  },
  checklistPanelTabBadge: {
    minWidth: 12,
    height: 12,
    paddingHorizontal: 3,
    borderRadius: 999,
  },
  checklistPanelTabBadgeText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
  },
  checklistToolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 6,
  },
  checklistToolbarActionsMobile: {
    marginLeft: 0,
    alignSelf: "center",
    height: 32,
    justifyContent: "center",
  },
  /** Document rows only. Scrolls so the last row and preview actions stay reachable. */
  checklistDocs: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  checklistDocsContent: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 10,
  },
  checklistDocsContentMobile: {
    paddingHorizontal: 14,
    paddingTop: 4,
    backgroundColor: "transparent",
  },
  checklistVaultRow: {
    borderRadius: 12,
    overflow: "hidden",
  },
  checklistExpiryBtn: {
    alignSelf: "flex-start",
    marginLeft: 12,
    marginBottom: 8,
  },
  checklistVaultRowHover: {
    backgroundColor: Theme.complianceSelectedWash,
  },
  checklistVaultRowSelected: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardSelectedBorder,
    backgroundColor: Theme.complianceSelectedWash,
  },
  /** Compact illustration slot — sized to the preview card, not clipped. */
  checklistListGapArt: {
    flexGrow: 0,
    flexShrink: 0,
    height: 80,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  checklistPreviewActionsSection: {
    flexShrink: 0,
    gap: 6,
    marginHorizontal: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  checklistPreviewActionsSectionMobile: {
    marginHorizontal: 0,
    marginBottom: 4,
    paddingHorizontal: 0,
    paddingTop: 10,
    paddingBottom: 4,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  checklistPreviewActionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
  },
  checklistPreviewActionsLabel: {
    flexShrink: 0,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: Theme.textMuted,
  },
  checklistPreviewActionsGrid: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "flex-end",
    alignSelf: "stretch",
    width: "100%",
    gap: 8,
  },
  checklistPreviewTripActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    alignSelf: "stretch",
    width: "100%",
    gap: 8,
  },
  resubmitActionBlock: {
    alignSelf: "stretch",
    width: "100%",
    gap: 8,
  },
  resubmitBlockedBanner: {
    alignSelf: "stretch",
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Theme.warningMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.warning,
    gap: 4,
  },
  resubmitBlockedWhy: {
    color: Theme.textPrimaryDark,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  resubmitBlockedAction: {
    color: Theme.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  reviewerResubmitNote: {
    alignSelf: "stretch",
    width: "100%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Theme.positiveMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.positive,
    gap: 4,
    marginBottom: 8,
  },
  reviewerResubmitNoteLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.positive,
    textTransform: "uppercase",
  },
  reviewerResubmitNoteText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 17,
  },
  tabApprovedBadge: {
    height: 16,
    paddingHorizontal: 6,
    backgroundColor: Theme.positive,
  },
  tabApprovedBadgeText: {
    color: Theme.cardWhite,
    fontSize: 8,
  },
  verifyTripBtn: {
    ...complianceActionButtonStyles.primary,
    flexGrow: 0,
  },
  verifyTripBtnText: {
    ...complianceActionButtonStyles.primaryText,
  },
  declineTripBtn: {
    ...complianceActionButtonStyles.ghost,
    flexGrow: 0,
  },
  declineTripBtnText: {
    ...complianceActionButtonStyles.ghostText,
  },
  checklistModeBtn: {
    ...complianceActionButtonStyles.ghost,
    flexGrow: 0,
    flexShrink: 0,
  },
  checklistModeBtnHover: {
    backgroundColor: Theme.surface,
    borderColor: Theme.actionBtnGhostBorder,
  },
  checklistModeBtnSelected: {
    ...complianceActionButtonStyles.primary,
    flexGrow: 0,
    flexShrink: 0,
  },
  checklistModeBtnActive: {
    ...complianceActionButtonStyles.primary,
    flexGrow: 0,
    flexShrink: 0,
  },
  checklistModeBtnActiveHover: {
    backgroundColor: Theme.actionBtnInk,
  },
  checklistModeBtnText: {
    ...complianceActionButtonStyles.ghostText,
    textAlign: "center",
  },
  checklistModeBtnTextSelected: {
    ...complianceActionButtonStyles.primaryText,
  },
  checklistModeBtnTextActive: {
    ...complianceActionButtonStyles.primaryText,
  },
  checklistInfoScroll: {
    flex: 1,
    minHeight: 0,
  },
  checklistInfoContent: {
    flexGrow: 1,
    padding: 12,
    paddingBottom: 12,
    gap: 10,
  },
  checklistAdvancePanel: {
    minHeight: 0,
    overflow: "visible",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  checklistAdvancePanelPosted: {
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  checklistAdvanceLead: {
    flexShrink: 0,
    gap: 4,
  },
  checklistAdvanceArtSlot: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    width: "100%",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    paddingTop: 4,
    paddingRight: 12,
    paddingBottom: 4,
    backgroundColor: "transparent",
  },
  // Scrolls inside tripDetailsScroll instead of clipping on smaller screens.
  tripDetailsScroll: { flex: 1, minHeight: 0 },
  tripDetailsScrollContent: { flexGrow: 1, paddingBottom: 24 },
  advancePaymentScrollContent: { flexGrow: 1, paddingBottom: 32 },
  tripDetailsPanel: {
    flexGrow: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  tripDetailSectionLead: {
    flexGrow: 0,
    flexShrink: 0,
  },
  tripDetailInsightCard: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  tripDetailNextStep: {
    flexShrink: 0,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  tripDetailInsightBody: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    flexDirection: "column",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 6,
    overflow: "hidden",
  },
  tripDetailStatRow: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "wrap",
    gap: 6,
  },
  tripDetailStatTile: {
    flexGrow: 0,
    flexShrink: 0,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 0,
    ...Platform.select({
      web: { cursor: "pointer" } as ViewStyle,
      default: {},
    }),
  },
  tripDetailStatTileMissing: {
    backgroundColor: Theme.complianceDocNeedBg,
    borderColor: Theme.complianceGroupDangerDot,
  },
  tripDetailStatTilePending: {
    backgroundColor: Theme.complianceStagePendingBg,
    borderColor: Theme.complianceGroupWarningDot,
  },
  tripDetailStatTileAccepted: {
    backgroundColor: Theme.complianceDocOkBg,
    borderColor: Theme.complianceVerifiedPillBorder,
  },
  tripDetailStatHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  tripDetailStatLabel: {
    flexGrow: 0,
    flexShrink: 0,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  tripDetailStatLabelMissing: {
    color: Theme.complianceDocNeedFg,
  },
  tripDetailStatLabelPending: {
    color: Theme.complianceStagePendingFg,
  },
  tripDetailStatLabelAccepted: {
    color: Theme.complianceDocOkFg,
  },
  tripDetailStatValue: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
    lineHeight: 15,
    fontVariant: ["tabular-nums"],
  },
  tripDetailStatValueMissing: {
    color: Theme.complianceDocNeedFg,
  },
  tripDetailStatValuePending: {
    color: Theme.complianceStagePendingFg,
  },
  tripDetailStatValueAccepted: {
    color: Theme.complianceDocOkFg,
  },
  tripDetailStatTotal: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.complianceGroupSuccessFg,
  },
  tripDetailDocGroups: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    gap: 2,
    overflow: "hidden",
  },
  tripDetailDocGroup: {
    gap: 1,
    flexShrink: 1,
  },
  tripDetailDocGroupLabelHit: {
    alignSelf: "flex-start",
    ...Platform.select({
      web: { cursor: "pointer" } as ViewStyle,
      default: {},
    }),
  },
  tripDetailDocGroupLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
  tripDetailMissingWrap: {
    flexGrow: 0,
    flexShrink: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    rowGap: 3,
    columnGap: 3,
    backgroundColor: Theme.cardWhite,
  },
  tripDetailMissingChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    maxWidth: "32%",
    height: 18,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 0,
    ...Platform.select({
      web: { cursor: "pointer" } as ViewStyle,
      default: {},
    }),
  },
  tripDetailMissingChipThird: {
    flexGrow: 0,
    flexShrink: 1,
  },
  tripDetailMissingChipHalf: {
    flexGrow: 0,
    flexShrink: 1,
    maxWidth: "48%",
  },
  tripDetailMissingChipRequired: {
    backgroundColor: Theme.complianceDocNeedBg,
    borderColor: Theme.complianceGroupDangerDot,
  },
  tripDetailMissingChipOptional: {
    backgroundColor: Theme.complianceGroupWarningBg,
    borderColor: Theme.complianceGroupWarningDot,
  },
  tripDetailMissingChipAccepted: {
    backgroundColor: Theme.complianceDocOkBg,
    borderColor: Theme.complianceVerifiedPillBorder,
  },
  tripDetailMissingChipTitle: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
  },
  tripDetailMissingChipTitleRequired: {
    color: Theme.complianceDocNeedFg,
  },
  tripDetailMissingChipTitleOptional: {
    color: Theme.complianceGroupWarningFg,
  },
  tripDetailMissingChipTitleAccepted: {
    color: Theme.complianceDocOkFg,
  },
  tripDetailMissingChipMeta: {
    flexShrink: 0,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  tripDetailMissingEmpty: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.complianceDocOkFg,
  },
  tripDetailInsightColumns: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    overflow: "hidden",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
    paddingTop: 6,
  },
  tripDetailInsightColumnsStack: {
    flexDirection: "column",
  },
  tripDetailInsightBlock: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    gap: 4,
    overflow: "hidden",
  },
  tripDetailInsightBlockSplit: {
    paddingLeft: 10,
    marginLeft: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.complianceTripCardBorder,
  },
  tripDetailInsightKicker: {
    flexShrink: 0,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  tripDetailInsightPoints: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
  },
  tripDetailInsightPointCell: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "50%",
    maxWidth: "50%",
    minWidth: 0,
    paddingRight: 8,
    paddingVertical: 2,
  },
  tripDetailInsightPointLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.2,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 1,
  },
  tripDetailInsightPointValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 16,
  },
  checklistInfoTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.35,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  checklistInfoHint: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  tripDetailSection: {
    flexDirection: "column",
    flexShrink: 1,
    minHeight: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    minWidth: 0,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  tripDetailSectionPair: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  tripDetailSectionPairFull: {
    width: "100%",
  },
  tripDetailPairRow: {
    flexGrow: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  tripDetailPairRowStack: {
    flexDirection: "column",
  },
  tripDetailSectionHeader: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  tripDetailSectionIconWell: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tripDetailSectionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0.1,
    color: Theme.textPrimaryDark,
  },
  tripFactGrid: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    alignItems: "flex-start",
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 6,
  },
  tripFactList: {
    flexGrow: 1,
    flexShrink: 1,
    paddingBottom: 2,
  },
  tripFactRow: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 26,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripFactRowLast: {
    borderBottomWidth: 0,
  },
  tripFactRowLabel: {
    flexGrow: 0,
    flexShrink: 0,
    width: 120,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  tripFactRowValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  tripFactCell: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 0,
    justifyContent: "flex-start",
  },
  tripFactCellHalf: {
    width: "50%",
  },
  tripFactCellThird: {
    width: "33.333%",
  },
  tripFactCellWide: {
    width: "100%",
    paddingVertical: 2,
  },
  tripFactLabel: {
    height: 12,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 2,
  },
  tripFactValue: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    lineHeight: 14,
    fontVariant: ["tabular-nums"],
  },
  tripFactValueLink: {
    color: Theme.brandBlueInk,
    textDecorationLine: "underline",
  },
  tripFactValueEmphasize: {
    fontWeight: "700",
    color: Theme.darkGreen,
  },
  checklistAdvanceStatusCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  flagTitle: { fontSize: 13, fontWeight: "700", color: Theme.complianceGroupDangerFg },
  flagNote: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  flagHint: { fontSize: 11, color: Theme.textMuted },
  checklistAdvanceFormCard: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    minWidth: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 8,
    overflow: "hidden",
  },
  checklistAdvanceStatusLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  checklistAdvanceStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "70%",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  checklistAdvanceStatusPillReady: {
    backgroundColor: Theme.positiveMuted,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  checklistAdvanceStatusPillPosted: {
    backgroundColor: Theme.compliancePageBg,
    borderColor: Theme.complianceTripCardBorder,
  },
  checklistAdvanceStatusPillBlocked: {
    backgroundColor: Theme.complianceStageDocsBg,
    borderColor: Theme.complianceStageDocsFg,
  },
  checklistAdvanceStatusPillPending: {
    backgroundColor: Theme.compliancePageBg,
    borderColor: Theme.complianceTripCardBorder,
  },
  checklistAdvanceStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  checklistAdvanceStatusDotReady: { backgroundColor: Theme.darkGreen },
  checklistAdvanceStatusDotPosted: { backgroundColor: Theme.textSecondary },
  checklistAdvanceStatusDotBlocked: { backgroundColor: Theme.complianceStageDocsFg },
  checklistAdvanceStatusDotPending: { backgroundColor: Theme.textMuted },
  checklistAdvanceStatusText: {
    flexShrink: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  checklistAdvanceStatusTextReady: { color: Theme.darkGreen },
  checklistAdvanceStatusTextPosted: { color: Theme.textPrimaryDark },
  checklistAdvanceStatusTextBlocked: { color: Theme.complianceStageDocsFg },
  checklistAdvanceStatusTextPending: { color: Theme.textSecondary },
  checklistInfoCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  checklistPayBtn: {
    ...complianceActionButtonStyles.primary,
    alignSelf: "flex-end",
  },
  checklistPayBtnText: {
    ...complianceActionButtonStyles.primaryText,
  },
  checklistAdvanceCreditFooter: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.complianceStageDocsFg,
    lineHeight: 16,
  },
  checklistBlockerBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.complianceStageDocsBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  checklistBlockerText: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.complianceStageDocsFg,
    lineHeight: 12,
  },
  checklistRejectedPayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 2,
  },
  checklistRejectedPayHint: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: "500",
    lineHeight: 14,
    color: Theme.textMuted,
  },
  checklistRejectedPayBtn: {
    ...complianceActionButtonStyles.primary,
    flexShrink: 0,
  },
  checklistRejectedPayBtnText: {
    ...complianceActionButtonStyles.primaryText,
    letterSpacing: 0.2,
  },
  checklistBankPreviewWrap: {
    flex: 1,
    minHeight: 0,
    gap: 8,
  },
  checklistBankPreviewDoc: {
    flex: 1,
    minWidth: 0,
    minHeight: 120,
    backgroundColor: Theme.compliancePreviewCanvas,
    overflow: "hidden",
    borderRadius: 8,
  },
  previewStageRow: {
    flex: 1,
    minHeight: 0,
    position: "relative",
    overflow: "visible",
  },
  previewStageContent: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  previewCanvas: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    backgroundColor: Theme.compliancePreviewCanvas,
    overflow: "hidden",
    borderRadius: 8,
  },
  previewPanSurface: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  previewScrollXDock: {
    position: "absolute",
    left: 12,
    right: 30,
    bottom: 6,
    height: 22,
    zIndex: 8,
  },
  previewCanvasHovered: {
    backgroundColor: Theme.compliancePageBg,
  },
  previewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  previewLiveLayer: {
    ...(Platform.OS === "web"
      ? ({ willChange: "transform", backfaceVisibility: "hidden" } as ViewStyle)
      : null),
  },
  previewAlign: {
    flex: 1,
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: PREVIEW_CANVAS_PAD,
    overflow: "hidden",
  },
  previewPageSheet: {
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceTripCardBorder,
  },
  previewToolbar: {
    flexShrink: 0,
    minHeight: 36,
    height: 36,
    paddingHorizontal: 8,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  previewZoomLabel: {
    minWidth: 44,
    height: 28,
    paddingHorizontal: 8,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 28,
    color: Theme.textPrimaryDark,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceTripCardBorder,
    ...WEB_COPY,
  },
  previewPageLabel: {
    minWidth: 64,
    paddingHorizontal: 10,
  },
  previewZoomLabelDisabled: {
    color: Theme.textMuted,
  },
  previewToolbarTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  previewToolbarActions: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  previewToolBtn: {
    minWidth: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
  },
  previewRotateBtn: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
  },
  previewToolBtnNamed: {
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewToolName: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  previewZoomCluster: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    flexShrink: 0,
    height: 28,
    borderRadius: 8,
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    overflow: "hidden",
  },
  previewPageCluster: {
    minWidth: 128,
    paddingHorizontal: 2,
  },
  previewZoomBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  previewToolBtnDisabled: {
    opacity: 0.45,
  },
  previewFooter: {
    flexShrink: 0,
    height: 24,
    paddingLeft: 8,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  previewScrollRowX: {
    flex: 1,
    minWidth: 0,
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewScrollRowXActive: {
    gap: 6,
  },
  previewScrollRowY: {
    position: "absolute",
    top: 10,
    bottom: 36,
    right: 4,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    zIndex: 8,
  },
  previewScrollRowYActive: {
    gap: 6,
  },
  previewScrollHitX: {
    flex: 1,
    minWidth: 0,
    height: 16,
    justifyContent: "center",
  },
  previewScrollHitY: {
    flex: 1,
    minHeight: 0,
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  previewScrollTrackX: {
    height: 6,
    width: "100%",
    borderRadius: 3,
    backgroundColor: Theme.complianceScrollRail,
    overflow: "hidden",
  },
  previewScrollTrackY: {
    width: 6,
    height: "100%",
    borderRadius: 3,
    backgroundColor: Theme.complianceScrollRail,
    overflow: "hidden",
  },
  previewScrollThumb: {
    position: "absolute",
    borderRadius: 2,
    backgroundColor: Theme.complianceScrollThumb,
  },
  previewScrollArrow: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
  },
  previewScrollArrowX: {
    flexShrink: 0,
  },
  previewScrollArrowY: {
    flexShrink: 0,
  },
  previewScrollArrowHidden: {
    opacity: 0,
  },
  previewScrollArrowDisabled: {
    opacity: 0.4,
  },
  previewFooterMeta: {
    flexShrink: 0,
    minWidth: 44,
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "right",
  },
  checklistBankDetailsScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 200,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.compliancePageBg,
  },
  checklistBankDetailsScrollSolo: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Theme.compliancePageBg,
  },
  checklistBankDetailsContent: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 6,
  },
  checklistBankDetailsTitle: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  checklistBankDetailsHint: {
    fontSize: 9,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: -2,
    marginBottom: 2,
  },
  bankCardHeader: {
    gap: 4,
    marginBottom: 4,
  },
  bankCardHeaderCopy: {
    gap: 2,
  },
  bankCardMeta: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "left",
  },
  bankFieldsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    alignItems: "stretch",
  },
  bankFieldCell: {
    minWidth: 110,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 110,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    justifyContent: "center",
  },
  bankFieldLabel: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.35,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  bankFieldValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
    fontVariant: ["tabular-nums"],
  },
  bankProofSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
    gap: 6,
  },
  bankProofLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  bankProofRow: {
    gap: 4,
  },
  bankProofCopy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  bankProofTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    flexShrink: 1,
  },
  bankProofHint: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  bankVerifiedChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
  },
  bankVerifiedChipText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.darkGreen,
  },
  bankPendingChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
  },
  bankPendingChipText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textSecondary,
  },
  bankSourceHint: {
    fontSize: 9,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 1,
  },
  missingListContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 14,
  },
  missingHeader: {
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
  },
  missingHeaderMobile: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 0,
    backgroundColor: "transparent",
  },
  missingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
  },
  missingTitleRowMobile: {
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  missingTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: Theme.buttonDark,
  },
  missingCountChip: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Theme.complianceStageInfoBg,
  },
  missingCountChipNeed: {
    backgroundColor: Theme.complianceStageDocsBg,
  },
  missingCountChipReady: {
    backgroundColor: Theme.complianceStageSuccessBg,
  },
  missingCountChipText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    color: Theme.complianceStageInfoFg,
  },
  missingCountChipTextNeed: {
    color: Theme.complianceStageDocsFg,
  },
  missingCountChipTextReady: {
    color: Theme.complianceStageSuccessFg,
  },
  missingSubtitle: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    marginTop: 2,
    color: Theme.textSecondary,
  },
  missingSubtitleReady: {
    color: Theme.buttonDark,
  },
  missingSubtitleMissing: {
    color: Theme.complianceStageDocsFg,
  },
  missingHint: {
    fontSize: 9,
    fontWeight: "400",
    lineHeight: 12,
    marginTop: 1,
    color: Theme.textMuted,
  },
  missingHintMobile: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
    marginTop: 2,
  },
  missingCard: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.complianceTripCardBg,
    overflow: "hidden",
  },
  missingRow: {
    minHeight: 44,
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderLeftWidth: 2,
    borderLeftColor: Theme.cardWhite,
  },
  missingRowDense: {
    minHeight: 36,
    paddingVertical: 3,
  },
  missingRowHover: {
    backgroundColor: Theme.complianceHoverBg,
    borderLeftColor: Theme.complianceHoverBorder,
  },
  missingRowSelected: {
    backgroundColor: Theme.complianceSelectedWash,
    borderLeftColor: Theme.complianceTripCardSelectedBorder,
  },
  missingRowSelectedHover: {
    backgroundColor: Theme.compliancePageBg,
  },
  missingRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
  },
  missingRowCopy: { flex: 1, minWidth: 0, gap: 2 },
  missingRowActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  missingDocName: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Theme.textPrimaryDark,
  },
  missingScopeTag: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  missingScopeRequired: { backgroundColor: Theme.complianceStageDocsBg },
  missingScopeOptional: { backgroundColor: Theme.complianceStageInfoBg },
  missingScopeText: { fontSize: 8, fontWeight: "600", letterSpacing: 0.2, lineHeight: 11 },
  missingScopeTextRequired: { color: Theme.complianceStageDocsFg },
  missingScopeTextOptional: { color: Theme.complianceStageInfoFg },
  missingStatus: { fontSize: 9, fontWeight: "400", color: Theme.textMuted, marginTop: 1 },
  missingEyeBtn: {
    ...complianceActionButtonStyles.icon,
  },
  missingEyeBtnDisabled: { opacity: 0.4 },
  missingEyeBtnHover: {
    backgroundColor: Theme.surface,
    borderColor: Theme.actionBtnGhostBorder,
  },
  missingUploadBtn: {
    ...complianceActionButtonStyles.primary,
  },
  missingUploadBtnHover: {
    backgroundColor: Theme.actionBtnInk,
  },
  missingUploadBtnText: {
    ...complianceActionButtonStyles.primaryText,
  },
  checklistPreviewPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: "#F5F5F5",
    overflow: "hidden",
  },
  checklistPreviewPaneSplit: { width: "100%", maxWidth: "100%" },
  checklistPreviewPaneStacked: {
    width: "100%",
    maxWidth: "100%",
    minHeight: 220,
    flex: 1,
  },
  checklistPreviewBody: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: Theme.compliancePreviewCanvas,
  },
  checklistPreviewBodyMobile: {
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  checklistDecisionBar: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  checklistDecisionNavGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  checklistDecisionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checklistDecisionSpacer: {
    flex: 1,
    minWidth: 8,
  },
  checklistAdvanceActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  checklistAdvanceRejectBtn: {
    ...complianceActionButtonStyles.ghost,
  },
  checklistAdvanceRejectText: {
    ...complianceActionButtonStyles.ghostText,
  },
  checklistAdvancePayFallback: {
    ...complianceActionButtonStyles.primary,
    flexGrow: 0,
  },
  checklistDecisionNav: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistPreviewEmpty: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 8,
  },
  checklistPreviewEmptyTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  checklistPreviewEmptyHint: {
    fontSize: 9,
    lineHeight: 12,
    color: Theme.textMuted,
    textAlign: "center",
    maxWidth: 240,
  },
  checklistPreviewLoadingText: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    textAlign: "center",
  },
  missingFooterMeta: { flex: 1, minWidth: 0, paddingRight: 8 },
  missingFooterText: { fontSize: 9, fontWeight: "400", color: Theme.textMuted },
  missingPreviewOpenBtn: {
    ...complianceActionButtonStyles.ghost,
  },
  missingPreviewOpenBtnText: {
    ...complianceActionButtonStyles.ghostText,
  },
  navPill: {
    flexShrink: 1,
    minWidth: 0,
    height: 22,
    minHeight: 22,
    maxHeight: 22,
    paddingVertical: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: Theme.cardWhite,
    borderRadius: 999,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    overflow: "hidden",
  },
  navLabel: { fontSize: 11, fontWeight: "500", lineHeight: 14, color: Theme.textPrimaryDark, maxWidth: 88 },
  decisionRow: {
    flexShrink: 0,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    zIndex: 2,
  },
  declineBtn: {
    ...complianceActionButtonStyles.ghost,
  },
  declineText: {
    ...complianceActionButtonStyles.ghostText,
  },
  approveBtn: {
    ...complianceActionButtonStyles.primary,
  },
  approveText: {
    ...complianceActionButtonStyles.primaryText,
  },
  actionEnd: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  payBtn: {
    ...complianceActionButtonStyles.primary,
  },
  payText: {
    ...complianceActionButtonStyles.primaryText,
  },
  navBtn: {
    ...complianceActionButtonStyles.ghost,
  },
  navBtnText: { ...complianceActionButtonStyles.ghostText },
  btnDisabled: { opacity: 0.45 },
  reviewGroup: { width: "100%", flexShrink: 1, minHeight: 0 },
  reviewGroupSpaced: {
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
  },
  reviewGroupHeader: {
    minHeight: 40,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Theme.compliancePageBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
  },
  reviewGroupHeaderDense: {
    minHeight: 32,
    paddingVertical: 2,
  },
  reviewGroupCopy: { flex: 1, minWidth: 0, gap: 1 },
  reviewGroupTitle: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: Theme.textMuted,
  },
  reviewGroupMeta: { fontSize: 10, lineHeight: 13, fontWeight: "600", color: Theme.buttonDark },
  reviewGroupMetaApproved: { color: Theme.positive },
  reviewGroupMetaDeclined: { color: Theme.complianceStageDocsFg },
  reviewGroupActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  reviewGroupDecline: {
    ...complianceActionButtonStyles.ghost,
  },
  reviewGroupDeclineActive: {
    ...complianceActionButtonStyles.primary,
  },
  reviewGroupDeclineText: {
    ...complianceActionButtonStyles.ghostText,
  },
  reviewGroupDeclineTextActive: {
    ...complianceActionButtonStyles.primaryText,
  },
  reviewGroupApprove: {
    ...complianceActionButtonStyles.primary,
  },
  reviewGroupApproveText: {
    ...complianceActionButtonStyles.primaryText,
  },
  rowDecisionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  reviewGroupApprovedPill: {
    ...complianceActionButtonStyles.primary,
    flexDirection: "row",
    gap: 4,
    flexShrink: 0,
  },
  reviewGroupApprovedText: {
    ...complianceActionButtonStyles.primaryText,
  },
  verifyNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 10,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
    backgroundColor: Theme.positiveMutedDark,
  },
  verifyNoticeSuccess: { backgroundColor: Theme.positiveMuted },
  verifyNoticeIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
  },
  verifyNoticeText: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: "600", color: Theme.positive },
});
