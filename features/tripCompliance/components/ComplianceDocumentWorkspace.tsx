import { PartyAvatar } from "@/components/PartyAvatar";
import Theme from "@/constants/Theme";
import { rejectDocument, verifyDocument } from "@/features/compliance/services/documents.service";
import { getSupplierBankAccount } from "@/features/suppliers/services/supplierVendorOnboarding.service";
import { resolveBankBranch } from "@/features/suppliers/utils/ifscDirectory.util";
import { subscribeSupplierBankChanged } from "@/features/suppliers/utils/supplierBankEvents.util";
import { ComplianceAdvanceCreditCard } from "@/features/tripCompliance/components/ComplianceAdvanceCreditCard";
import {
  ComplianceAdvancePaidDetails,
  type AdvanceUtrTarget,
} from "@/features/tripCompliance/components/ComplianceAdvancePaidDetails";
import { ComplianceAdvancePaymentArt } from "@/features/tripCompliance/components/ComplianceAdvancePaymentArt";
import { ComplianceChecklistGapArt } from "@/features/tripCompliance/components/ComplianceChecklistGapArt";
import { ComplianceDeclineModal } from "@/features/tripCompliance/components/ComplianceDeclineModal";
import { NoDocumentPreviewEmpty, NoTripsFoundEmpty } from "@/features/tripCompliance/components/ComplianceEmptyState";
import { ComplianceInputModal, type ComplianceInputField } from "@/features/tripCompliance/components/ComplianceInputModal";
import { ComplianceNumberStack } from "@/features/tripCompliance/components/ComplianceNumberStack";
import {
  CompliancePaymentConfirmModal,
  type CompliancePaymentConfirmValues,
} from "@/features/tripCompliance/components/CompliancePaymentConfirmModal";
import { ComplianceRejectRemarkModal } from "@/features/tripCompliance/components/ComplianceRejectRemarkModal";
import { COMPLIANCE_STATUS_META } from "@/features/tripCompliance/components/ComplianceStatusIcon";
import type { ComplianceListTripFacts } from "@/features/tripCompliance/hooks/useComplianceListTripFacts";
import {
  COMPLIANCE_QUEUE_WINDOW_SIZE,
  useComplianceListWindow,
} from "@/features/tripCompliance/hooks/useComplianceListWindow";
import {
  guessCompliancePreviewMime,
  signCompliancePreviewUrl,
} from "@/features/tripCompliance/services/complianceDocumentView.service";
import type { ComplianceChange } from "@/features/tripCompliance/services/compliancePipelineSync.service";
import { tripAppearsInAwaitingPod } from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import { setTripDocumentVerification, updateCompliancePaymentReference, updateCompliancePaymentTransactionDate } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import {
  COMPLIANCE_DRIVER_DOCUMENT_TYPES,
  COMPLIANCE_VEHICLE_DOCUMENT_TYPES,
  documentRequiresExpiry,
  type ComplianceStage,
  type ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import {
  formatComplianceTimestamp,
  isComplianceVerifiedRejected,
  tripOpsStatusBadge,
  verificationStatusVisual,
} from "@/features/tripCompliance/utils/complianceCardVisual.util";
import {
  deriveComplianceDocumentRows,
  deriveEntityComplianceRows,
  deriveFinanceDocumentRows,
  deriveTripVaultReviewRows,
  financeVaultDetailLine,
  labelForDocType,
  labelForFinanceDocType,
  mergeFinanceBankDocsFromSupplier,
  requirementScopeLabel,
  type ComplianceDocRow,
} from "@/features/tripCompliance/utils/complianceDocumentRows.util";
import { deriveComplianceQueueReadiness } from "@/features/tripCompliance/utils/complianceReadiness.util";
import {
  applyOptimisticDecision,
  complianceGroupReviewState,
  complianceReviewDecisionActions,
  complianceTabMarkedApproved,
  recordOptimisticDecision,
  type ComplianceGroupReviewState,
  type OptimisticComplianceDecision,
} from "@/features/tripCompliance/utils/complianceReviewActions.util";
import {
  complianceVaultDocNumbers,
  isComplianceDeclineActive,
  isFinanceDeclinedTrip,
} from "@/features/tripCompliance/utils/complianceTableStatus.util";
import { alertMessage } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import { fetchSupplierBankProofBundle } from "@/features/tripCompliance/utils/supplierBankProof.util";
import { classifyTripDocument, readTypedDetails } from "@/features/tripCompliance/utils/tripDocumentClassification.util";

/** Stages whose bank card stays as it was (no beneficiary / branch, no live refresh). */
const PRE_VERIFIED_STAGES: ReadonlySet<ComplianceStage> = new Set(["pending_for_docs", "compliance_pending"]);

import { PodClientValidationPanel } from "@/features/debit-control/components/PodClientValidationPanel";
import {
  pickComplianceVaultFiles,
  uploadComplianceVaultFile,
} from "@/features/tripCompliance/services/complianceVaultUpload.service";
import { LogHardCopyPodModal, type HardCopyPodLrOption } from "@/features/trips/components/trip-detail/LogHardCopyPodModal";
import {
  formatInvoiceVaultNumberLabel,
  formatLrVaultNumberLabel,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { TripVaultFilePreview } from "@/features/trips/components/trip-detail/TripVaultFilePreview";
import { getTripExecutionModel } from "@/features/trips/domain/tripExecutionModel";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { lrReceiptForTrip } from "@/features/trips/utils/lrReceiptStatus.util";
import { splitHubRouteLocationDisplay } from "@/features/trips/utils/tripLocationDisplay.util";
import { markVehicleDocumentVerified } from "@/features/vehicles/services/vehicleDocuments.service";
import { formatIndianVehicleNumber } from "@/lib/format";
import { ROUTES } from "@/lib/routes";
import { SIGNED_URL_CACHE_TTL_MS, SIGNED_URL_EXPIRY_SEC } from "@/lib/storageSignedUrlCache";
import { Image as ExpoImage } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { Banknote, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleCheck, ClipboardList, Clock, Eye, FileText, Hash, Landmark, Maximize2, Minus, NotebookText, Plus, RefreshCw, RotateCwSquare, Truck, Upload, Users, X } from "lucide-react-native";
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

const DECLINE_FIELDS: ComplianceInputField[] = [
  {
    key: "reason",
    label: "Note — why is this document being declined?",
    placeholder: "Enter reason",
    required: true,
  },
];

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

/** Optimistic decisions survive tab switches. Key includes the tab so trip/vehicle/driver rows cannot collide. */
function optimisticKey(scope: DocTab, rowKey: string): string {
  return `${scope}:${rowKey}`;
}
type ChecklistPreviewMode = "document" | "trip" | "advance" | "finance";
type ComplianceReviewGroup = "required" | "optional";

const TABS: { key: DocTab; label: string }[] = [
  { key: "trip", label: "Trip" },
  { key: "vehicle", label: "Vehicle" },
  { key: "driver", label: "Driver" },
];

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

function typedFieldIcon(label: string) {
  const key = label.trim().toLowerCase();
  if (key.includes("eway") || key.includes("e-way") || key.includes("e way")) return Hash;
  if (key.includes("valid") || key.includes("expiry") || key.includes("expire")) return Clock;
  if (key.includes("date") || key.includes("created") || key.includes("till")) return Calendar;
  if (key.includes("doc") || key.includes("lr") || key.includes("invoice")) return FileText;
  return FileText;
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
  const multiColumn = groups.length >= 2;
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
      <View style={styles.typedPreviewHeader}>
        <View style={styles.typedPreviewHeaderIcon}>
          <ClipboardList size={16} color={Theme.textPrimaryDark} strokeWidth={2.1} />
        </View>
        <View style={styles.typedPreviewHeaderCopy}>
          <Text style={styles.typedPreviewKicker}>Entered details</Text>
          <Text style={styles.typedPreviewTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.typedPreviewMeta} numberOfLines={1}>
            No file on this row
            {entryCount > 1 ? ` · ${entryCount} entries` : lines.length > 0 ? ` · ${lines.length} fields` : ""}
          </Text>
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
              {row.map((group) => (
                <View key={group.key} style={styles.typedEntryCard}>
                  {group.heading ? (
                    <View style={styles.typedEntryHeadingRow}>
                      <View style={styles.typedEntryIndex}>
                        <Text style={styles.typedEntryIndexText}>
                          {group.heading.replace(/^Entry\s+/i, "")}
                        </Text>
                      </View>
                      <Text style={styles.typedEntryHeading} numberOfLines={1}>
                        {group.heading}
                      </Text>
                    </View>
                  ) : null}
                  {group.lines.map((line, index) => {
                    const Icon = typedFieldIcon(line.label);
                    return (
                      <View
                        key={`${group.key}-${line.label}-${index}`}
                        style={[
                          styles.typedFieldRow,
                          index < group.lines.length - 1 && styles.typedFieldRowDivider,
                        ]}
                      >
                        <View style={styles.typedFieldLead}>
                          <View style={styles.typedFieldIcon}>
                            <Icon size={13} color={Theme.textMuted} strokeWidth={2.1} />
                          </View>
                          <Text style={styles.typedFieldLabel} numberOfLines={1}>
                            {line.label}
                          </Text>
                        </View>
                        <Text style={styles.typedFieldValue} numberOfLines={1} selectable>
                          {line.value}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}
              {multiColumn && row.length === 1 ? <View style={styles.typedEntryCardSpacer} /> : null}
            </View>
          ))}
        </ScrollView>
        <PreviewScrollRail axis="y" value={pan.y} max={pan.maxY} onChange={moveY} />
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
  return [
    { scale: scale * fit },
    { rotate: `${normalizePreviewRotation(rotation)}deg` as const },
    { translateX: pan.x },
    { translateY: pan.y },
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

  const limits = useMemo(() => {
    if (box.width < 2 || box.height < 2) return { maxX: 0, maxY: 0 };
    const scaledW = (display?.width ?? box.width) * zoom;
    const scaledH = (display?.height ?? box.height) * zoom;
    return {
      maxX: Math.max(28, Math.abs(scaledW - box.width) / 2, box.width * 0.22),
      maxY: Math.max(28, Math.abs(scaledH - box.height) / 2, box.height * 0.22),
    };
  }, [box.height, box.width, display, zoom]);

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
      if ((top as HTMLElement).closest?.("[data-testid='compliance-preview-scroll-rail']")) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      };
    };

    const onWheel = (event: WheelEvent) => {
      const point = pointInCanvas(event);
      if (!point) return;
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
          ? `${label}. Scroll or click to zoom. Drag to pan when zoomed.`
          : `${label}. Scroll or click to zoom. Drag to pan when zoomed.`
      }
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
      <PreviewScrollRail axis="y" value={pan.y} max={limits.maxY} onChange={moveY} />
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
  canNavigate = false,
  typedLines = null,
  resolving = false,
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
  canNavigate?: boolean;
  /** Details-only docs (e.g. typed E-way) — no binary file. */
  typedLines?: { label: string; value: string }[] | null;
  /** True while the next signed URL is being fetched. */
  resolving?: boolean;
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
            <Text style={styles.screenTitle} numberOfLines={1}>{title}</Text>
            <View style={styles.screenTools}>
              {showPdfPageTools ? (
                <View style={styles.previewZoomCluster}>
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
                  <Text style={styles.previewZoomLabel} accessibilityLabel={pageCount ? `Page ${page} of ${pageCount}` : `Page ${page}`}>
                    {pageCount ? `${page}/${pageCount}` : `${page}`}
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
                    // Use the header Rotate control instead.
                    showToolbar={false}
                    sizing="fit"
                    zoom={pdfViewOwned ? 1 : scale}
                    page={showPdfPageTools ? page : undefined}
                    scrollbar={!pdfViewOwned}
                    interactive={!pdfViewOwned}
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
                  <Text style={styles.screenLoadingText}>No preview available for this document.</Text>
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
  style,
  canManageFinance = false,
  /** False on Compliance Pending queue chip only — hide Finance tab for every trip in that stage. */
  showFinanceTab = true,
  canManagePod = false,
  showHardCopyPodLog = false,
  compliancePendingQueue = false,
  showPodClientValidation = false,
  chargesReview = false,
  onChargesSaved,
  showHardcopyPodButton = false,
  logHardCopyPodRequest = 0,
  courierLrOptions = [],
  onPay,
  onConfirmPayment,
  paymentSubmitting = false,
  onRejectCompliance,
  onDeclineCompliance,
  onMarkComplianceVerified,
  selectedTripId = null,
  chargeFocusTripId = null,
  chargeFocusToken = 0,
  focusTab = null,
  focusToken = 0,
  onReviewTripDocs,
  listHeader = null,
}: {
  summaries: ComplianceTripSummary[];
  /** Resolved by the page for the full queue — one lookup pass, not one per view. */
  tripFacts: ComplianceListTripFacts;
  /** Pinned above the trip cards (e.g. Verified-stage outcome filter). */
  listHeader?: React.ReactNode;
  organizationId: string;
  actorId: string | null;
  canVerify: boolean;
  canViewDocuments: boolean;
  /** Exactly what changed, so the pipeline patches only the affected inputs. */
  onChanged: (change: ComplianceChange) => void;
  stacked?: boolean;
  style?: StyleProp<ViewStyle>;
  canManageFinance?: boolean;
  /**
   * Finance documents tab. Off only while the page filter is Compliance Pending
   * (includes Declined-by-finance trips that still have verified_at).
   */
  showFinanceTab?: boolean;
  /** Log hard-copy POD — Compliance role (and owner/admin) only. */
  canManagePod?: boolean;
  /** True while the POD queue can log hard copy (POD Pending, or All on an awaiting trip). */
  showHardCopyPodLog?: boolean;
  /** True while the Compliance queue filter is Compliance Pending (hides the Finance tab for every listed trip). */
  compliancePendingQueue?: boolean;
  /** True only while the Compliance queue filter is POD Received. */
  showPodClientValidation?: boolean;
  /** Charges stay as text until Edit. */
  chargesReview?: boolean;
  /** POD Received save: parent moves the trip to the next stage. */
  onChargesSaved?: (tripId: string) => void;
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
  /** Decline the whole trip while it is still in Compliance Pending. */
  onDeclineCompliance?: (tripId: string, reason: string) => Promise<void>;
  /** Marks the trip Compliance Verified once all required docs are approved. */
  /** Resolves `false` when verification failed (the handler already alerted). */
  onMarkComplianceVerified?: (tripId: string) => Promise<boolean | void>;
  /** Trip to show when opening the card view from the table. */
  selectedTripId?: string | null;
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
  const [selectedId, setSelectedId] = useState<string | null>(selectedTripId ?? summaries[0]?.trip.id ?? null);
  const [tab, setTab] = useState<DocTab>("trip");
  const [docIndex, setDocIndex] = useState(0);
  const [checklistKey, setChecklistKey] = useState<string | null>(null);
  const [checklistPreviewMode, setChecklistPreviewMode] = useState<ChecklistPreviewMode>("document");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [toolLabel, setToolLabel] = useState<"rotate" | "refresh" | null>(null);
  const resetPreviewView = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setToolLabel("refresh");
  }, []);
  useEffect(() => {
    setToolLabel(null);
  }, [checklistKey]);
  const [screenOpen, setScreenOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingFinanceType, setUploadingFinanceType] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [tripDeclineOpen, setTripDeclineOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [podOpen, setPodOpen] = useState(false);
  const [podLogRound, setPodLogRound] = useState(0);
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
    (tab === "vehicle" && !summary?.trip.vehicle_id) ||
    (tab === "driver" && !summary?.trip.driver_id);
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
    if (!summary || !orgId || !supplierId) {
      setSupplierBankProof(null);
      setSupplierBankLoading(false);
      return;
    }
    setSupplierBankLoading(true);
    void fetchSupplierBankProofBundle(orgId, supplierId)
      .then(async (bundle) => {
        const branchName = PRE_VERIFIED_STAGES.has(summary.stage)
          ? ""
          : await resolveBankBranch(bundle.account?.branch_name, bundle.account?.ifsc_code);
        if (cancelled) return;
        setSupplierBankProof({
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
        });
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
    organizationId,
    summary,
    checklistPreviewMode,
    supplierBankRevision,
  ]);

  const financeRows = useMemo(() => {
    if (!summary) return [];
    const base = deriveFinanceDocumentRows(summary.documents);
    return mergeFinanceBankDocsFromSupplier(base, supplierBankProof);
  }, [summary, supplierBankProof]);
  const isFinanceMode =
    showFinanceTab &&
    checklistPreviewMode === "finance" &&
    summary?.stage !== "compliance_pending" &&
    !compliancePendingQueue;
  const listRows = isFinanceMode ? financeRows : checklistRows;
  /** More than a few rows: tighten padding so the list still fits above the fixed illustration. */
  const denseChecklist = listRows.length >= 4;

  useEffect(() => {
    if (!showFinanceTab && checklistPreviewMode === "finance") {
      setChecklistPreviewMode("document");
    }
  }, [showFinanceTab, checklistPreviewMode]);
  const reviewScope: DocTab = isFinanceMode ? "trip" : tab;
  const displayListRows = useMemo(
    () =>
      listRows.map((row) =>
        applyOptimisticDecision(row, localDecisionByKey[optimisticKey(reviewScope, row.key)]),
      ),
    [listRows, localDecisionByKey, reviewScope],
  );
  /** Each tab (Finance, Trip, Vehicle, Driver) uses the same group Approve. */
  const showGroupedReview = !showEntityUnassigned;
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
    if (isFinanceMode) {
      return financeRows.find((row) => row.key === checklistKey) ?? null;
    }
    return checklistRows.find((row) => row.key === checklistKey) ?? null;
  }, [
    showDocumentShell,
    showEntityUnassigned,
    isFinanceMode,
    checklistRows,
    financeRows,
    checklistKey,
  ]);
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
      setTab("trip");
      setDocIndex(0);
      resetPreviewView();
    },
    [resetPreviewView],
  );

  useEffect(() => {
    if (!focusToken || !focusTab || appliedFocusToken.current === focusToken) return;
    appliedFocusToken.current = focusToken;
    setTab(focusTab);
    setChecklistPreviewMode("document");
    resetPreviewView();
    setScreenOpen(false);
  }, [focusTab, focusToken, resetPreviewView]);

  useEffect(() => {
    setLocalDecisionByKey({});
  }, [summary?.trip.id]);

  useEffect(() => {
    if (compliancePendingQueue) {
      setChecklistPreviewMode((mode) => (mode === "finance" || mode === "advance" ? "document" : mode));
    }
  }, [compliancePendingQueue]);

  useEffect(() => {
    setDocIndex(0);
    resetPreviewView();
    setDeclineOpen(false);
    setRejectOpen(false);
    setExpiryPrompt((prev) => {
      prev?.resolve(null);
      return null;
    });
  }, [summary?.trip.id, tab, resetPreviewView]);

  useEffect(() => {
    setChecklistPreviewMode("document");
  }, [summary?.trip.id]);

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
    const pool = checklistPreviewMode === "finance" ? financeRows : checklistRows;
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
      if (prev && pool.some((row) => row.key === prev)) return prev;
      const byType = prev ? pool.find((row) => row.type === prev) : null;
      if (byType) return byType.key;
      const firstWithFile = pool.find(hasFile);
      const firstMissing = pool.find((row) => row.status === "missing");
      return firstWithFile?.key ?? firstMissing?.key ?? pool[0]?.key ?? null;
    });
  }, [
    showDocumentShell,
    showEntityUnassigned,
    checklistPreviewMode,
    checklistRows,
    financeRows,
    summary?.trip.id,
    tab,
  ]);

  const activePreviewPath =
    activeRow?.doc?.storage_path ?? activeRow?.entityDoc?.storage_path ?? null;
  const activePreviewSource =
    activeRow?.entityDoc?.source === "supplier-kyc" && !activeRow?.doc
      ? "supplier-kyc"
      : reviewScope === "trip"
        ? "trip"
        : activeRow?.entityDoc?.source;
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
      setLoadingPreview(false);
      return;
    }
    const cached = readPreviewCache(previewCacheRef.current, activePreviewPath);
    if (cached) {
      setPreviewUrl(cached.url);
      setPreviewMime(cached.mime);
      setLoadingPreview(false);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
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
  ]);

  // Prefetch the next file so Approve → Next feels instant.
  useEffect(() => {
    if (!canViewDocuments || !organizationId || previewable.length < 2) return;
    const nextRow = previewable[(docIndex + 1) % previewable.length];
    if (nextRow?.doc && !classifyTripDocument(nextRow.doc).hasBinary) return;
    const path = nextRow?.doc?.storage_path ?? nextRow?.entityDoc?.storage_path ?? null;
    if (!path || readPreviewCache(previewCacheRef.current, path)) return;
    let cancelled = false;
    void signCompliancePreviewUrl({
      storagePath: path,
      source:
        nextRow.entityDoc?.source === "supplier-kyc" && !nextRow.doc
          ? "supplier-kyc"
          : reviewScope === "trip"
            ? "trip"
            : nextRow.entityDoc?.source,
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
        setChecklistPreviewMode((prev) => (prev === "finance" ? "finance" : "document"));
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
        setChecklistPreviewMode((mode) => (mode === "finance" ? "finance" : "document"));
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
      const marked = await markVehicleDocumentVerified(organizationId, vehicleId, row.type);
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
      if (sync) onChanged(entityDocumentChange(row.entityDoc));
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
            next[optimisticKey(reviewScope, row.key)] = recordOptimisticDecision(row, "rejected");
          }
          return next;
        });
      }
      setGroupBusy(null);
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
  const showReject = Boolean(
    summary?.complianceVerifiedAt &&
      !isComplianceVerifiedRejected(summary) &&
      !summary.advance &&
      !summary.advanceBeforeVerification &&
      !summary.balance &&
      onRejectCompliance &&
      canVerify,
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
  const allTabsApproved =
    tabMarkedApproved.trip &&
    tabMarkedApproved.vehicle &&
    tabMarkedApproved.driver;
  const showPendingTripActions = Boolean(
    isCompliancePendingStage && summary && !summary.complianceVerifiedAt,
  );
  /** Verified Reject: trip still has verified_at, but must be re-verified to leave Declined by finance. */
  const showFinanceDeclineReVerify = Boolean(
    summary && isFinanceDeclinedTrip(summary) && onMarkComplianceVerified,
  );
  const showMarkVerified = Boolean(
    !isCompliancePendingStage &&
      !showFinanceDeclineReVerify &&
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
  const missingHeadline = isFinanceMode
    ? listMissingRows.length === 0
      ? uploadedCount > 0
        ? `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} on file — preview below`
        : supplierBankLoading
          ? "Loading supplier Banking…"
          : "No Trip Details documents yet"
      : missingRequiredCount > 0
        ? `${missingRequiredCount} required document${missingRequiredCount === 1 ? "" : "s"} not uploaded`
        : `${listMissingRows.length} document${listMissingRows.length === 1 ? "" : "s"} not uploaded`
    : listMissingRows.length === 0
      ? uploadedCount > 0
        ? `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} on file — preview below`
        : "No documents in this vault yet"
      : missingRequiredCount > 0
        ? `${missingRequiredCount} required document${missingRequiredCount === 1 ? "" : "s"} not uploaded`
        : `${listMissingRows.length} document${listMissingRows.length === 1 ? "" : "s"} not uploaded`;
  const missingSubline = isFinanceMode
    ? "Memo · Other Documents · Bank Docs synced from supplier Banking"
    : listMissingRows.length === 0
      ? "Preview a file in the panel, or Add to upload more"
      : missingOptionalCount > 0 && missingRequiredCount > 0
        ? `Plus ${missingOptionalCount} optional from this ${vaultCopy.vaultLabel.toLowerCase()}`
        : vaultCopy.vaultHint;
  /** Upload / Replace in place: file picker → vault write → refetch. No review sheet. */
  const uploadVaultDocument = useCallback(
    async (row: ComplianceDocRow) => {
      if (!summary) return;
      if (!actorId) {
        alertMessage("Can't upload", "Sign in again, then try Upload.");
        return;
      }
      if (uploadingFinanceType) return;
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

        let expiryDate: string | null = null;
        if (scope !== "trip") {
          const current = row.entityDoc?.expiry_date?.trim() ?? "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(current)) {
            expiryDate = current;
          } else if (documentRequiresExpiry(row.type)) {
            const entered = (await promptExpiryDate(row.type))?.trim() ?? "";
            if (!entered) return;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(entered)) {
              alertMessage("Invalid expiry date", "Use YYYY-MM-DD (for example 2027-03-15).");
              return;
            }
            expiryDate = entered;
          }
        }

        const alreadyHasFile = hasFile(row);
        for (const [index, file] of files.entries()) {
          await uploadComplianceVaultFile({
            scope,
            type: row.type,
            tripId: summary.trip.id,
            organizationId,
            actorId,
            vehicleId: summary.trip.vehicle_id ?? null,
            entityId,
            existing: alreadyHasFile || index > 0 ? row.entityDoc : null,
            append: alreadyHasFile || index > 0,
            file,
            expiryDate,
          });
        }
        focusUploadTypeRef.current = row.type;
        resetPreviewView();
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
      isFinanceMode,
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
  const previewChecklistRow = useCallback((row: ComplianceDocRow) => {
    setChecklistPreviewMode((prev) => (prev === "finance" ? "finance" : "document"));
    setChecklistKey(row.key);
    if (!hasFile(row)) return;
    resetPreviewView();
  }, [resetPreviewView]);
  const openDocumentUploadFromDetails = useCallback(
    (target: { vault: string; type?: string }) => {
      const vault = target.vault.trim().toLowerCase();
      if (vault === "finance") {
        setTab("trip");
        setChecklistPreviewMode("finance");
      } else if (vault === "vehicle") {
        setTab("vehicle");
        setChecklistPreviewMode("document");
      } else if (vault === "driver") {
        setTab("driver");
        setChecklistPreviewMode("document");
      } else {
        setTab("trip");
        setChecklistPreviewMode("document");
      }
      if (target.type) focusUploadTypeRef.current = target.type;
      resetPreviewView();
      setScreenOpen(false);
    },
    [resetPreviewView],
  );
  const tabMissingCounts = useMemo(() => {
    if (!summary) return { trip: 0, vehicle: 0, driver: 0, finance: 0 };
    const finance = deriveFinanceDocumentRows(summary.documents);
    return {
      trip: deriveTripVaultReviewRows(summary.documents).filter((row) => row.status === "missing").length,
      vehicle: summary.trip.vehicle_id
        ? deriveEntityComplianceRows(COMPLIANCE_VEHICLE_DOCUMENT_TYPES, summary.vehicleDocuments).filter(
            (row) => row.status === "missing",
          ).length
        : 0,
      driver: summary.trip.driver_id
        ? deriveEntityComplianceRows(COMPLIANCE_DRIVER_DOCUMENT_TYPES, summary.driverDocuments).filter(
            (row) => row.status === "missing",
          ).length
        : 0,
      finance: finance.filter((row) => row.status === "missing").length,
    };
  }, [summary]);

  const renderChecklistRow = (row: ComplianceDocRow, index: number) => {
    const displayRow = applyOptimisticDecision(row, localDecisionByKey[optimisticKey(reviewScope, row.key)]);
    const rowHasFile = hasFile(displayRow);
    const statusMeta = COMPLIANCE_STATUS_META[displayRow.status];
    const selected =
      (checklistPreviewMode === "document" || checklistPreviewMode === "finance") &&
      checklistKey === displayRow.key;
    const uploadLabel = displayRow.status === "missing" ? "Upload" : "Add";
    const rowLabel = isFinanceMode
      ? labelForFinanceDocType(displayRow.type)
      : labelForDocType(displayRow.type);
    const sameTypeRows = listRows.filter((item) => item.type === displayRow.type);
    const typeOrdinal = sameTypeRows.findIndex((item) => item.key === displayRow.key) + 1;
    const rowTitle =
      sameTypeRows.length > 1 && rowHasFile ? `${rowLabel.toUpperCase()} · ${typeOrdinal}` : rowLabel.toUpperCase();
    const fileName = displayRow.doc?.file_name?.trim() || displayRow.entityDoc?.notes?.trim() || "";
    const vaultDetail = isFinanceMode ? financeVaultDetailLine(displayRow) : null;
    const isBankDocs = isFinanceMode && displayRow.type === "bank_docs";
    const bankVerified =
      isBankDocs &&
      (displayRow.status === "verified" ||
        (supplierBankProof?.status ?? "").toLowerCase() === "verified");
    const bankFromSupplier =
      isBankDocs &&
      Boolean(
        displayRow.entityDoc?.source === "supplier-kyc" || supplierBankProof?.onFile,
      );
    const vaultNumbers =
      isCompliancePendingStage && reviewScope === "trip"
        ? complianceVaultDocNumbers(summary?.documents ?? [], displayRow.type)
        : [];
    const statusLabel =
      displayRow.status === "missing"
        ? isBankDocs && supplierBankLoading
          ? "Fetching supplier Banking…"
          : "Not uploaded"
        : vaultDetail
          ? vaultDetail
          : rowHasFile
            ? fileName && !/fields\.json$/i.test(fileName)
              ? `${statusMeta.label} · ${fileName}`
              : `${statusMeta.label} · ready to preview`
            : statusMeta.label;
    return (
      <View
        key={displayRow.key}
        style={[
          styles.missingRow,
          denseChecklist && styles.missingRowDense,
          index > 0 && styles.missingRowBorder,
          selected && styles.missingRowSelected,
        ]}
      >
        <Pressable
          style={styles.missingRowCopy}
          onPress={() => previewChecklistRow(displayRow)}
          accessibilityRole="button"
          accessibilityLabel={`${rowLabel} details`}
        >
          <View style={styles.missingTitleRow}>
            <Text style={styles.missingDocName} numberOfLines={1}>
              {rowTitle}
            </Text>
            {!showGroupedReview ? (
              <View
                style={[
                  styles.missingScopeTag,
                  displayRow.required
                    ? styles.missingScopeRequired
                    : styles.missingScopeOptional,
                ]}
              >
                <Text
                  style={[
                    styles.missingScopeText,
                    displayRow.required
                      ? styles.missingScopeTextRequired
                      : styles.missingScopeTextOptional,
                  ]}
                >
                  {requirementScopeLabel(displayRow.required)}
                </Text>
              </View>
            ) : null}
            {bankVerified ? (
              <View style={styles.bankVerifiedChip}>
                <Text style={styles.bankVerifiedChipText}>Verified</Text>
              </View>
            ) : null}
          </View>
          <ComplianceNumberStack numbers={vaultNumbers} variant="card" />
          {!(bankFromSupplier && displayRow.status !== "missing") ? (
            <Text
              style={[
                styles.missingStatus,
                displayRow.status === "missing" ? null : { color: statusMeta.color },
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          ) : null}
          {bankFromSupplier && displayRow.status !== "missing" ? (
            <Text style={styles.bankSourceHint} numberOfLines={1}>
              Synced from supplier Banking
            </Text>
          ) : null}
        </Pressable>
        <View style={styles.missingRowActions}>
          <TouchableOpacity
            style={[styles.missingEyeBtn, !rowHasFile && styles.missingEyeBtnDisabled]}
            activeOpacity={0.75}
            disabled={!canViewDocuments || !rowHasFile}
            onPress={() => previewChecklistRow(displayRow)}
            accessibilityRole="button"
            accessibilityLabel={`Preview ${rowLabel}`}
            accessibilityState={{ disabled: !rowHasFile }}
          >
            <Eye
              size={12}
              color={rowHasFile ? Theme.textPrimaryDark : Theme.textMuted}
              strokeWidth={2.2}
            />
          </TouchableOpacity>
          {onReviewTripDocs || isFinanceMode ? (
            <TouchableOpacity
              style={[
                styles.missingUploadBtn,
                uploadingFinanceType === displayRow.key && styles.btnDisabled,
              ]}
              activeOpacity={0.8}
              disabled={Boolean(uploadingFinanceType)}
              onPress={() => void uploadVaultDocument(row)}
              accessibilityRole="button"
              accessibilityLabel={`${uploadLabel} ${rowLabel}`}
              accessibilityState={{ busy: uploadingFinanceType === displayRow.key }}
            >
              {uploadingFinanceType === displayRow.key ? (
                <ActivityIndicator size="small" color={Theme.cardWhite} />
              ) : (
                <Upload size={11} color={Theme.cardWhite} strokeWidth={2.4} />
              )}
              <Text style={styles.missingUploadBtnText}>
                {uploadingFinanceType === displayRow.key ? "Uploading…" : uploadLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
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
            : `${state.total} uploaded · ready for review`;
    const showActions = Boolean(
      canVerify &&
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
        {state?.phase === "approved" ? (
          <View style={styles.reviewGroupApprovedPill} accessibilityLabel={`All ${groupLabel} documents approved`}>
            <Check size={12} color={Theme.cardWhite} strokeWidth={2.8} />
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
                <ActivityIndicator size="small" color={Theme.complianceStageDocsFg} />
              ) : (
                <View style={styles.checklistDecisionLabelRow}>
                  <X
                    size={12}
                    color={declined ? Theme.cardWhite : Theme.complianceStageDocsFg}
                    strokeWidth={2.6}
                  />
                  <Text style={[styles.reviewGroupDeclineText, declined && styles.reviewGroupDeclineTextActive]}>
                    {declined ? "Declined" : "Decline"}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reviewGroupApprove, (!state.canApprove || busy) && styles.btnDisabled]}
              activeOpacity={0.85}
              disabled={busy || !state.canApprove}
              onPress={() => void approveGroup(group)}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`Approve all ${groupLabel} documents`}
              accessibilityState={{ disabled: busy || !state.canApprove }}
            >
              {approving ? (
                <ActivityIndicator size="small" color={Theme.cardWhite} />
              ) : (
                <View style={styles.checklistDecisionLabelRow}>
                  <Check size={12} color={Theme.cardWhite} strokeWidth={2.8} />
                  <Text style={styles.reviewGroupApproveText}>Approve</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.workspace, stacked && styles.workspaceStacked, style]}>
      <View style={[styles.listPane, stacked && styles.listPaneStacked]}>
        {listHeader}
        {summaries.length === 0 ? (
          <View style={styles.listEmpty}>
            <NoTripsFoundEmpty compact={stacked} />
          </View>
        ) : (
        <ScrollView
          ref={listRef}
          style={styles.listScroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          contentContainerStyle={styles.listContent}
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
          {listWindowItems.map((item) => (
            <View
              key={item.trip.id}
              onLayout={
                item.trip.id === selectedTripId
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
              <TripListRow
                summary={item}
                selected={item.trip.id === summary?.trip.id}
                organizationId={organizationId}
                truckType={
                  item.trip.vehicle_id
                    ? truckTypeByVehicleId[item.trip.vehicle_id] ?? null
                    : null
                }
                supplierName={supplierNameByTripId[item.trip.id] ?? null}
                onSelect={selectListTrip}
              />
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

      {showValidationPane ? (
        <View style={[styles.previewPane, styles.podLogPane]}>
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
      ) : showHardCopyPodLog ? (
        <View style={[styles.previewPane, styles.podLogPane]}>
          {summary && showLogHardCopyPod ? (
            <LogHardCopyPodModal
              key={`${summary.trip.id}:${podLogRound}`}
              inline
              visible
              onClose={() => setPodLogRound((round) => round + 1)}
              tripId={summary.trip.id}
              organizationId={organizationId || summary.trip.organization_id}
              canManage={canManagePod || showLogHardCopyPod}
              initialMode="create"
              onUpdated={async (tripIds) => {
                const ids = tripIds?.length ? tripIds : [summary.trip.id];
                await Promise.all(ids.map((tripId) => onChanged({ type: "tripFlags", tripId })));
              }}
              lrOptions={courierLrOptions}
              summary={{
                manifestId: getTripDisplayNumber(summary.trip, organizationId || null),
                clientName: summary.trip.client_name?.trim() || "—",
                pickup: summary.trip.pickup_area?.trim() || "—",
                delivery: summary.trip.drop_location?.trim() || "—",
                driverName: summary.trip.driver_display_name?.trim() || "Unassigned",
                vehicleLabel: summary.trip.vehicle_display_number?.trim() || "Pending",
                vehicleType:
                  (summary.trip.vehicle_id
                    ? truckTypeByVehicleId[summary.trip.vehicle_id]
                    : null)?.trim() || "—",
                vendorName:
                  (supplierNameByTripId[summary.trip.id] ?? summary.trip.supplier_name)?.trim() ||
                  "—",
              }}
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
      ) : (
      <View style={styles.previewPane}>
        <View style={styles.stage}>
          {showDocumentShell ? (
            <View style={[styles.checklistStage, stacked && styles.checklistStageStacked]}>
              <View style={[styles.checklistListPane, stacked && styles.checklistListPaneStacked]}>
                <View style={styles.checklistPanelToolbar}>
                  <View style={styles.checklistPanelTabs}>
                    {showFinanceTab && !compliancePendingView ? (
                    <Pressable
                      onPress={() => {
                        setTab("trip");
                        setChecklistPreviewMode("finance");
                        resetPreviewView();
                        setScreenOpen(false);
                      }}
                      style={[
                        styles.tab,
                        styles.checklistPanelTab,
                        checklistPreviewMode === "finance" && styles.tabActive,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: checklistPreviewMode === "finance" }}
                      accessibilityLabel="Show finance documents"
                    >
                      <Text
                        style={[
                          styles.tabText,
                          styles.checklistPanelTabText,
                          checklistPreviewMode === "finance" && styles.tabTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        Finance
                      </Text>
                      {tabMissingCounts.finance > 0 ? (
                        <View
                          style={[
                            styles.tabBadge,
                            styles.checklistPanelTabBadge,
                            checklistPreviewMode === "finance" && styles.tabBadgeActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.tabBadgeText,
                              styles.checklistPanelTabBadgeText,
                              checklistPreviewMode === "finance" && styles.tabBadgeTextActive,
                            ]}
                          >
                            {tabMissingCounts.finance}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                    ) : null}
                    {TABS.map((item) => {
                      const active = tab === item.key && checklistPreviewMode !== "finance";
                      const missingCount = tabMissingCounts[item.key];
                      return (
                        <Pressable
                          key={item.key}
                          onPress={() => {
                            setTab(item.key);
                            setChecklistPreviewMode("document");
                            resetPreviewView();
                            setScreenOpen(false);
                          }}
                          style={[
                            styles.tab,
                            styles.checklistPanelTab,
                            active && styles.tabActive,
                          ]}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: active }}
                        >
                          <Text
                            style={[
                              styles.tabText,
                              styles.checklistPanelTabText,
                              active && styles.tabTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                          {isCompliancePendingStage && tabMarkedApproved[item.key] ? (
                            <View style={[styles.tabBadge, styles.checklistPanelTabBadge, styles.tabApprovedBadge]}>
                              <Text style={[styles.tabBadgeText, styles.checklistPanelTabBadgeText, styles.tabApprovedBadgeText]}>
                                Approved
                              </Text>
                            </View>
                          ) : missingCount > 0 ? (
                            <View
                              style={[
                                styles.tabBadge,
                                styles.checklistPanelTabBadge,
                                active && styles.tabBadgeActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.tabBadgeText,
                                  styles.checklistPanelTabBadgeText,
                                  active && styles.tabBadgeTextActive,
                                ]}
                              >
                                {missingCount}
                              </Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.checklistToolbarActions}>
                    <View style={[styles.missingNavPill, styles.checklistUploadPill]}>
                      <Text style={[styles.missingNavLabel, styles.checklistUploadPillText]} numberOfLines={1}>
                        {showEntityUnassigned
                          ? "Unassigned"
                          : listMissingRows.length > 0
                            ? `${listMissingRows.length} to upload`
                            : `${uploadedCount} on file`}
                      </Text>
                    </View>
                  </View>
                </View>
                {showEntityUnassigned ? (
                  <View style={styles.missingHeader}>
                    <Text style={styles.missingTitle}>{vaultCopy.unassignedTitle}</Text>
                    <Text style={styles.missingHint}>{vaultCopy.unassignedHint}</Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.missingHeader}>
                      <Text style={styles.missingTitle}>
                        {isFinanceMode ? "TRIP DETAILS" : "DOCUMENTS TO UPLOAD"}
                      </Text>
                      <Text style={styles.missingSubtitle} numberOfLines={1}>
                        {missingHeadline}
                      </Text>
                      <Text style={styles.missingHint} numberOfLines={2}>
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
                    <ScrollView
                      style={styles.checklistDocs}
                      contentContainerStyle={styles.checklistDocsContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled"
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
                                {groupRows.map(renderChecklistRow)}
                              </View>
                            );
                          })
                        : listRows.map(renderChecklistRow)}
                    </ScrollView>
                    <View
                      style={styles.checklistListGapArt}
                      pointerEvents="none"
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <ComplianceChecklistGapArt />
                    </View>
                    <View style={styles.checklistPreviewActionsSection}>
                      <View style={styles.checklistPreviewActionsHeader}>
                        <Text style={styles.checklistPreviewActionsLabel}>PREVIEW</Text>
                      </View>
                      <View style={styles.checklistPreviewActionsGrid}>
                        <TouchableOpacity
                          style={[
                            styles.checklistModeBtn,
                            checklistPreviewMode === "trip" && styles.checklistModeBtnSelected,
                          ]}
                          activeOpacity={0.8}
                          onPress={() => setChecklistPreviewMode("trip")}
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
                        </TouchableOpacity>
                        {showFinanceTab && !compliancePendingView ? (
                          <TouchableOpacity
                            style={[
                              styles.checklistModeBtn,
                              checklistPreviewMode === "advance" && styles.checklistModeBtnSelected,
                            ]}
                            activeOpacity={0.8}
                            onPress={() => setChecklistPreviewMode("advance")}
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
                          </TouchableOpacity>
                        ) : null}
                        {canManagePod &&
                        showHardcopyPodButton &&
                        !isPendingDocsTrip &&
                        !compliancePendingView ? (
                          <TouchableOpacity
                            style={styles.checklistModeBtn}
                            activeOpacity={0.8}
                            disabled={!summary}
                            onPress={() => setPodOpen(true)}
                            accessibilityRole="button"
                            accessibilityLabel="Log hardcopy POD"
                          >
                            <Text style={styles.checklistModeBtnText} numberOfLines={1}>
                              Hardcopy POD
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {showMarkVerified && summary ? (
                          <TouchableOpacity
                            style={[styles.checklistModeBtn, styles.checklistModeBtnActive]}
                            activeOpacity={0.8}
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
                          </TouchableOpacity>
                        ) : null}
                      </View>
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
                    </View>
                  </>
                )}
              </View>

              <View style={[styles.checklistPreviewPane, stacked && styles.checklistPreviewPaneStacked]}>
                {(() => {
                  const previewingDocument =
                    checklistPreviewMode === "document" || checklistPreviewMode === "finance";
                  const toolsEnabled = Boolean(previewUrl);
                  const canExpand = Boolean(previewUrl || typedLines);
                  const expandColor = canExpand ? Theme.textPrimaryDark : Theme.textMuted;
                  const toolColor = toolsEnabled ? Theme.textPrimaryDark : Theme.textMuted;
                  const previewPos = previewable.findIndex((row) => row.key === checklistKey);
                  const previewOrdinal = previewPos >= 0 ? previewPos + 1 : previewable.length > 0 ? 1 : 0;
                  const showSideNav =
                    previewingDocument &&
                    previewable.length > 1 &&
                    (Boolean(previewUrl) || Boolean(typedLines) || loadingPreview);
                  return (
                    <>
                {previewingDocument ? (
                  <View style={styles.previewToolbar}>
                    <Text style={styles.previewToolbarTitle} numberOfLines={1}>
                      {docTitle}
                    </Text>
                    <View style={styles.previewToolbarActions}>
                      <Pressable
                        style={[
                          styles.previewRotateBtn,
                          toolLabel === "rotate" && styles.previewToolBtnNamed,
                          !toolsEnabled && styles.previewToolBtnDisabled,
                        ]}
                        onPress={() => {
                          setRotation((value) => (value + 90) % 360);
                          setZoom(1);
                          setToolLabel("rotate");
                        }}
                        disabled={!toolsEnabled}
                        accessibilityRole="button"
                        accessibilityLabel="Rotate"
                        accessibilityState={{ disabled: !toolsEnabled }}
                        {...(Platform.OS === "web" ? { title: "Rotate" } : {})}
                      >
                        <RotateCwSquare size={12} color={toolColor} strokeWidth={2.1} />
                        {toolLabel === "rotate" ? (
                          <Text style={styles.previewToolName}>Rotate</Text>
                        ) : null}
                      </Pressable>
                      <View style={[styles.previewZoomCluster, !toolsEnabled && styles.previewToolBtnDisabled]}>
                        <Pressable
                          style={styles.previewZoomBtn}
                          onPress={() => setZoom((value) => clampPreviewZoom(value - 0.25))}
                          disabled={!toolsEnabled}
                          accessibilityRole="button"
                          accessibilityLabel="Zoom out"
                          accessibilityState={{ disabled: !toolsEnabled }}
                        >
                          <Minus size={12} color={toolColor} />
                        </Pressable>
                        <Text style={[styles.previewZoomLabel, !toolsEnabled && styles.previewZoomLabelDisabled]}>
                          {Math.round(zoom * 100)}%
                        </Text>
                        <Pressable
                          style={styles.previewZoomBtn}
                          onPress={() => setZoom((value) => clampPreviewZoom(value + 0.25))}
                          disabled={!toolsEnabled}
                          accessibilityRole="button"
                          accessibilityLabel="Zoom in"
                          accessibilityState={{ disabled: !toolsEnabled }}
                        >
                          <Plus size={12} color={toolColor} />
                        </Pressable>
                      </View>
                      <Pressable
                        style={[
                          styles.previewToolBtn,
                          toolLabel === "refresh" && styles.previewToolBtnNamed,
                          !toolsEnabled && styles.previewToolBtnDisabled,
                        ]}
                        onPress={resetPreviewView}
                        disabled={!toolsEnabled}
                        accessibilityRole="button"
                        accessibilityLabel="Refresh"
                        accessibilityState={{ disabled: !toolsEnabled }}
                        {...(Platform.OS === "web" ? { title: "Refresh" } : {})}
                      >
                        <RefreshCw size={12} color={toolColor} strokeWidth={2.2} />
                        {toolLabel === "refresh" ? (
                          <Text style={styles.previewToolName}>Refresh</Text>
                        ) : null}
                      </Pressable>
                      <Pressable
                        style={[styles.previewToolBtn, !canExpand && styles.previewToolBtnDisabled]}
                        onPress={() => setScreenOpen(true)}
                        disabled={!canExpand}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${docTitle} full screen`}
                        accessibilityState={{ disabled: !canExpand }}
                        {...(Platform.OS === "web" ? { title: "Full screen" } : {})}
                      >
                        <Maximize2 size={12} color={expandColor} />
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                <View style={styles.checklistPreviewBody}>
                  {checklistPreviewMode === "trip" && summary ? (
                    <ChecklistTripDetailsPanel
                      summary={summary}
                      truckType={
                        summary.trip.vehicle_id
                          ? truckTypeByVehicleId[summary.trip.vehicle_id] ?? null
                          : null
                      }
                      supplierName={supplierNameByTripId[summary.trip.id] ?? null}
                      onOpenDocumentUpload={openDocumentUploadFromDetails}
                    />
                  ) : checklistPreviewMode === "advance" && summary && !compliancePendingView ? (
                    <ChecklistAdvancePaymentPanel
                      summary={summary}
                      supplierName={supplierNameByTripId[summary.trip.id] ?? null}
                      readiness={readiness}
                      canPay={showPay}
                      paymentCategory={readyPaymentCategory}
                      paymentSubmitting={paymentSubmitting}
                      onConfirmPayment={onConfirmPayment}
                      onOpenPayModal={onConfirmPayment ? undefined : onPay}
                      onReject={showReject ? () => setRejectOpen(true) : undefined}
                      canPayRejected={Boolean(
                        canManageFinance &&
                          onConfirmPayment &&
                          isComplianceVerifiedRejected(summary),
                      )}
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
                  ) : showEntityUnassigned ? (
                    <View style={styles.checklistPreviewEmpty}>
                      <Text style={styles.checklistPreviewEmptyTitle}>{vaultCopy.unassignedTitle}</Text>
                      <Text style={styles.checklistPreviewEmptyHint}>{vaultCopy.unassignedHint}</Text>
                    </View>
                  ) : (
                    <View style={styles.previewStageRow}>
                      {loadingPreview ? (
                        <View style={styles.checklistPreviewEmpty}>
                          <ActivityIndicator color={Theme.textPrimaryDark} />
                          <Text style={styles.checklistPreviewLoadingText}>Loading document…</Text>
                        </View>
                      ) : typedLines && canViewDocuments ? (
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
                      ) : (
                        <View style={styles.checklistPreviewEmpty}>
                          <Text style={styles.checklistPreviewEmptyTitle}>
                            {checklistSelectedRow
                              ? `${
                                  isFinanceMode
                                    ? labelForFinanceDocType(checklistSelectedRow.type)
                                    : labelForDocType(checklistSelectedRow.type)
                                } has no file to preview`
                              : "Select a document to preview"}
                          </Text>
                          <Text style={styles.checklistPreviewEmptyHint}>
                            Tap the eye icon on an uploaded document, or use Trip Detail / Advance Payment.
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
                {previewingDocument ? (
                  <PreviewPanFooter
                    label={
                      previewable.length > 0
                        ? `${previewOrdinal} of ${previewable.length}`
                        : "No file on this row"
                    }
                  />
                ) : null}
                    </>
                  );
                })()}
              </View>
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
        presentation="page"
        onClose={() => setScreenOpen(false)}
        onPrev={goPrev}
        onNext={goNext}
        canNavigate={previewable.length > 1}
        typedLines={typedLines}
        resolving={loadingPreview}
        navLabel={
          previewable.length > 0
            ? `${Math.max(
                1,
                previewable.findIndex((row) => row.key === checklistKey) + 1,
              )} of ${previewable.length}`
            : null
        }
      />
      <ComplianceInputModal
        visible={declineOpen}
        title={declineTarget === "required" ? "Decline required documents" : "Decline optional documents"}
        fields={DECLINE_FIELDS}
        confirmLabel="Decline with note"
        onCancel={() => setDeclineOpen(false)}
        onSubmit={(values) => {
          void declineWithReason(values.reason ?? "");
        }}
      />
      <ComplianceDeclineModal
        visible={tripDeclineOpen}
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
      <ComplianceInputModal
        visible={expiryPrompt != null}
        title={`Expiry date — ${expiryPrompt ? labelForDocType(expiryPrompt.docType) : "Document"}`}
        fields={[
          {
            key: "expiry",
            label: "Expiry date (YYYY-MM-DD)",
            placeholder: "2027-03-15",
            required: true,
          },
        ]}
        confirmLabel="Continue"
        onCancel={() => {
          expiryPrompt?.resolve(null);
          setExpiryPrompt(null);
        }}
        onSubmit={(values) => {
          expiryPrompt?.resolve(values.expiry ?? null);
          setExpiryPrompt(null);
        }}
      />
      {summary ? (
        <LogHardCopyPodModal
          visible={podOpen && showLogHardCopyPod}
          onClose={() => setPodOpen(false)}
          tripId={summary.trip.id}
          organizationId={organizationId || summary.trip.organization_id}
          canManage={canManagePod || showLogHardCopyPod}
          initialMode="create"
          onUpdated={async (tripIds) => {
            const ids = tripIds?.length ? tripIds : [summary.trip.id];
            await Promise.all(ids.map((tripId) => onChanged({ type: "tripFlags", tripId })));
          }}
          lrOptions={courierLrOptions}
          summary={{
            manifestId: getTripDisplayNumber(summary.trip, organizationId || null),
            clientName: summary.trip.client_name?.trim() || "—",
            pickup: summary.trip.pickup_area?.trim() || "—",
            delivery: summary.trip.drop_location?.trim() || "—",
            driverName: summary.trip.driver_display_name?.trim() || "Unassigned",
            vehicleLabel: summary.trip.vehicle_display_number?.trim() || "Pending",
            vehicleType:
              (summary.trip.vehicle_id
                ? truckTypeByVehicleId[summary.trip.vehicle_id]
                : null)?.trim() || "—",
            vendorName:
              (supplierNameByTripId[summary.trip.id] ?? summary.trip.supplier_name)?.trim() || "—",
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
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  wide?: boolean;
  columns?: 2 | 3;
  layout?: "grid" | "list";
  last?: boolean;
}) {
  if (layout === "list") {
    return (
      <View style={[styles.tripFactRow, last && styles.tripFactRowLast]}>
        <Text style={styles.tripFactRowLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[styles.tripFactRowValue, emphasize && styles.tripFactValueEmphasize]}
          numberOfLines={2}
        >
          {value}
        </Text>
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
      <Text
        style={[styles.tripFactValue, emphasize && styles.tripFactValueEmphasize]}
        numberOfLines={wide ? 2 : 1}
      >
        {value}
      </Text>
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

function clientRatePerMtLabel(trip: TripCommercialFacts): string {
  const unit = Number(trip.sale_unit_rate);
  if (trip.sale_rate_basis === "per_mt" && Number.isFinite(unit) && unit > 0) {
    return formatTripInr(unit);
  }
  const tons = Number(trip.load_tons);
  const price = Number(trip.client_price);
  if (Number.isFinite(tons) && tons > 0 && Number.isFinite(price) && price > 0) {
    return formatTripInr(price / tons);
  }
  return "—";
}

function supplierRatePerMtLabel(trip: TripCommercialFacts): string {
  const rate = Number(trip.supplier_rate);
  if (!Number.isFinite(rate) || rate <= 0) return "—";
  if (trip.supplier_rate_basis === "per_mt") return formatTripInr(rate);
  const tons = Number(trip.load_tons);
  if (Number.isFinite(tons) && tons > 0) return formatTripInr(rate / tons);
  return "—";
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

function tripDocumentGroups(summary: ComplianceTripSummary): Array<{
  label: string;
  rows: ComplianceDocRow[];
  finance?: boolean;
}> {
  const groups: Array<{ label: string; rows: ComplianceDocRow[]; finance?: boolean }> = [
    {
      label: "Finance",
      rows: deriveFinanceDocumentRows(summary.documents),
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

function tripDocumentOverview(summary: ComplianceTripSummary): TripDocOverview {
  const missingItems: TripMissingDocItem[] = [];
  const missingGroups: TripDocGroup[] = [];
  const pendingGroups: TripDocGroup[] = [];
  const acceptedGroups: TripDocGroup[] = [];
  let missing = 0;
  let pending = 0;
  let accepted = 0;
  let total = 0;
  for (const group of tripDocumentGroups(summary)) {
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
}: {
  summary: ComplianceTripSummary;
  truckType: string | null;
  supplierName: string | null;
  onOpenDocumentUpload?: (target: { vault: string; type?: string }) => void;
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
    if (!orgId || !supplierId) {
      setBankDetails(null);
      return;
    }
    void getSupplierBankAccount(orgId, supplierId).then(async ({ account }) => {
      if (cancelled) return;
      if (!account) {
        setBankDetails(null);
        return;
      }
      const fallbackBeneficiary = supplierLabel !== "—" ? supplierLabel : "—";
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
  }, [trip.organization_id, trip.supplier_id, supplierLabel, payeeDetails, bankRevision]);

  const tripId = getTripDisplayNumber(trip, trip.organization_id ?? null);
  const beneficiary =
    bankDetails?.beneficiaryName ?? (supplierLabel !== "—" ? supplierLabel : "—");
  const supplierRate = formatTripInr(supplierCostTotal(commercial) ?? commercial.supplier_rate);
  const clientRate = formatTripInr(commercial.client_price);
  const loadedWeight = formatLoadedWeight(commercial.load_tons);
  const accountNumber = bankDetails?.accountNumber ?? "—";
  const ifsc = bankDetails?.ifsc ?? "—";
  const branch = bankDetails?.branchName ?? "—";
  const docOverview = tripDocumentOverview(summary);
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
        <TripDetailFact label="Trip ID" value={tripId} />
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
          <TripDetailFact label="Supplier" value={supplierLabel} />
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
  canPayRejected = false,
  onUpdateUtr,
  onUpdatePaidAt,
  supplierName,
}: {
  summary: ComplianceTripSummary;
  /** Resolved supplier display name for the "Paid to" card. */
  supplierName: string | null;
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
  /** Verified + Rejected trip: offer Confirm payment under the blockers anyway. */
  canPayRejected?: boolean;
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
}) {
  const advance = summary.advance;
  const advanceBeforeVerification = summary.advanceBeforeVerification ?? null;
  const partyLabel =
    (supplierName ?? summary.trip.supplier_name)?.trim() || "party";
  const lane = readiness?.advance ?? null;
  const statusLabel = advance
    ? "Advance processed"
    : lane?.status === "ready"
      ? "Ready to pay"
      : lane?.status === "blocked"
        ? "Blocked"
        : "Not posted";
  const statusTone: "ready" | "posted" | "blocked" | "pending" = advance
    ? "posted"
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
          return true;
        })
      : [];
  const showInlineForm =
    !advance &&
    canPay &&
    paymentCategory === "compliance_advance" &&
    Boolean(onConfirmPayment);
  const showPayFallback = !advance && canPay && !showInlineForm && Boolean(onOpenPayModal);
  const rejectedPayAvailable = !advance && !showInlineForm && canPayRejected;
  const [rejectedPayOpen, setRejectedPayOpen] = useState(false);
  useEffect(() => {
    setRejectedPayOpen(false);
  }, [summary.trip.id]);

  const showArt =
    !advance &&
    !showInlineForm &&
    !(rejectedPayAvailable && rejectedPayOpen);

  return (
    <View style={[styles.checklistAdvancePanel, advance && styles.checklistAdvancePanelPosted]}>
      <View style={styles.checklistAdvanceLead}>
        <Text style={styles.checklistInfoTitle}>Advance payment</Text>
        <Text style={styles.checklistInfoHint} numberOfLines={2}>
          {showInlineForm
            ? "Review the calculation and confirm to post through Finance"
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
          />
        </View>
      ) : null}

      {!showInlineForm && (showPayFallback || onReject) ? (
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

      {advanceBlockers.length > 0 ? (
        <View style={styles.checklistBlockerBox}>
          {advanceBlockers.slice(0, 3).map((line) => (
            <Text key={line} style={styles.checklistBlockerText} numberOfLines={2}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      {rejectedPayAvailable && !rejectedPayOpen ? (
        <View style={styles.checklistRejectedPayRow}>
          <Text style={styles.checklistRejectedPayHint} numberOfLines={2}>
            Trip is rejected. You can still post the advance.
          </Text>
          <TouchableOpacity
            style={styles.checklistRejectedPayBtn}
            activeOpacity={0.85}
            onPress={() => setRejectedPayOpen(true)}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Confirm payment for rejected trip"
          >
            <Text style={styles.checklistRejectedPayBtnText}>Confirm payment</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {rejectedPayAvailable && rejectedPayOpen ? (
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
            onCancel={() => setRejectedPayOpen(false)}
          />
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

const TripListRow = React.memo(function TripListRow({
  summary,
  selected,
  organizationId,
  truckType,
  supplierName,
  onSelect,
}: {
  summary: ComplianceTripSummary;
  selected: boolean;
  organizationId: string;
  truckType: string | null;
  supplierName: string | null;
  onSelect: (tripId: string) => void;
}) {
  const router = useRouter();
  const trip = summary.trip;
  const verification = verificationStatusVisual(summary);
  const tripStatus =
    summary.stage === "compliance_pending" ? tripOpsStatusBadge(trip.status) : null;
  const isRejected =
    isFinanceDeclinedTrip(summary) || isComplianceDeclineActive(summary);
  const declineRemark = isRejected
    ? summary.complianceDeclineReason?.trim() || ""
    : "";
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
  const lrReceipt = lrReceiptForTrip(
    summary.hardCopyPod.lrNumbers ?? [],
    summary.hardCopyPod.receivedLrNumbers ?? [],
  );
  const showLrReceipt =
    (summary.hardCopyPod.lrNumbers?.length ?? 0) > 0 &&
    (tripAppearsInAwaitingPod(summary) || lrReceipt.kind !== "none");
  const isAsset = executionModel === "asset";
  const headerName = supplierLabel !== "—" ? supplierLabel : customerName;
  const headerSeed = trip.supplier_id ?? trip.client_id ?? trip.id;
  const supplierId = (trip.supplier_id ?? "").trim();
  const canOpenSupplier =
    Boolean(supplierId) &&
    supplierLabel !== "—" &&
    supplierLabel.toLowerCase() !== "own fleet";
  const tripIdLabel = getTripDisplayNumber(trip, organizationId || null);

  const openSupplierProfile = useCallback(
    (event?: GestureResponderEvent) => {
      event?.stopPropagation?.();
      if (!canOpenSupplier) return;
      router.push(ROUTES.supplierProfile(supplierId) as Href);
    },
    [canOpenSupplier, router, supplierId],
  );

  const openTripOperations = useCallback(
    (event?: GestureResponderEvent) => {
      event?.stopPropagation?.();
      router.push(ROUTES.tripDetail(trip.id) as Href);
    },
    [router, trip.id],
  );

  return (
    <Pressable
      onPress={() => onSelect(trip.id)}
      style={[
        styles.row,
        selected && styles.rowSelected,
        isRejected && styles.rowRejected,
        selected && isRejected && styles.rowRejectedSelected,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${headerName}, ${tripIdLabel}, ${verification.label}`}
    >
      <View style={styles.rowHead}>
        <View style={styles.rowPartyBlock}>
          <Pressable
            onPress={canOpenSupplier ? openSupplierProfile : undefined}
            disabled={!canOpenSupplier}
            style={({ pressed }) => [
              styles.rowSupplierHit,
              canOpenSupplier && pressed && styles.rowPartyHitPressed,
            ]}
            hitSlop={{ top: 6, bottom: 2, left: 4, right: 4 }}
            accessibilityRole={canOpenSupplier ? "link" : "none"}
            accessibilityLabel={
              canOpenSupplier ? `Open ${headerName} supplier profile` : undefined
            }
            accessibilityState={{ disabled: !canOpenSupplier }}
          >
            <PartyAvatar
              name={headerName}
              entityType={trip.supplier_id ? "supplier" : "client"}
              size={26}
              initialsColorSeed={headerSeed}
            />
            <Text
              style={[
                styles.client,
                selected && styles.clientSelected,
                canOpenSupplier && styles.clientLink,
                isRejected && styles.clientRejected,
              ]}
              numberOfLines={1}
            >
              {headerName.toUpperCase()}
            </Text>
          </Pressable>

          <View style={styles.idLine}>
            <Pressable
              onPress={openTripOperations}
              style={({ pressed }) => [
                styles.tripIdHit,
                pressed && styles.rowPartyHitPressed,
              ]}
              hitSlop={{ top: 4, bottom: 6, left: 2, right: 4 }}
              accessibilityRole="link"
              accessibilityLabel={`Open trip ${tripIdLabel} in Trip Operations`}
            >
              <Text
                style={[styles.tripIdLink, selected && styles.tripIdLinkSelected]}
                numberOfLines={1}
              >
                {tripIdLabel}
              </Text>
            </Pressable>
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
        </View>
        <View style={styles.rowMeta}>
          {tripStatus ? (
            <View
              style={[styles.statusPill, { backgroundColor: tripStatus.tone.bg }]}
              accessibilityLabel={`Trip status ${tripStatus.label}`}
            >
              <Text style={[styles.statusText, { color: tripStatus.tone.fg }]} numberOfLines={1}>
                {tripStatus.label.toUpperCase()}
              </Text>
            </View>
          ) : null}
          <View style={[styles.statusPill, { backgroundColor: verification.tone.bg }]}>
            <Text style={[styles.statusText, { color: verification.tone.fg }]} numberOfLines={1}>
              {verification.label.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {declineRemark ? (
        <Text style={styles.rejectReasonLine} numberOfLines={2}>
          {declineRemark}
        </Text>
      ) : null}

      <View style={styles.route}>
        <View style={styles.leg}>
          <Text style={[styles.city, selected && styles.citySelected]} numberOfLines={1}>
            {origin.city || "—"}
          </Text>
          <Text style={[styles.region, selected && styles.regionSelected]} numberOfLines={1}>
            {origin.state || " "}
          </Text>
        </View>
        <View style={styles.arrowSlot}>
          <Text style={[styles.arrow, selected && styles.arrowSelected]}>→</Text>
        </View>
        <View style={[styles.leg, styles.legEnd]}>
          <Text style={[styles.city, styles.alignEnd, selected && styles.citySelected]} numberOfLines={1}>
            {dest.city || "—"}
          </Text>
          <Text style={[styles.region, styles.alignEnd, selected && styles.regionSelected]} numberOfLines={1}>
            {dest.state || " "}
          </Text>
        </View>
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

      <View style={[styles.facts, selected && styles.factsSelected, isRejected && styles.factsRejected]}>
        <View style={styles.factCell}>
          <Text style={[styles.factLabel, selected && styles.factLabelSelected]}>Customer</Text>
          <Text style={[styles.factValue, selected && styles.factValueSelected]} numberOfLines={1}>
            {customerName}
          </Text>
        </View>
        <View style={[styles.factCell, styles.factCellEnd]}>
          <Text style={[styles.factValueBare, styles.alignEnd, selected && styles.factValueSelected]} numberOfLines={1}>
            {vehicle}
          </Text>
        </View>
        <View style={styles.factCell}>
          <Text style={[styles.factValueBare, selected && styles.factValueSelected]} numberOfLines={1}>
            {truckLabel}
          </Text>
        </View>
        <View style={[styles.factCell, styles.factCellEnd]}>
          <Text style={[styles.factValueBare, styles.alignEnd, selected && styles.factValueSelected]} numberOfLines={1}>
            {inTransitAt}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  workspace: { flex: 1, minHeight: 0, flexDirection: "row", alignItems: "stretch", gap: 16, overflow: "hidden" },
  workspaceStacked: { flexDirection: "column" },
  listPane: {
    width: 420,
    maxWidth: "42%",
    flexShrink: 0,
    minHeight: 0,
    height: "100%",
    alignSelf: "stretch",
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    overflow: "hidden",
  },
  listPaneStacked: { width: "100%", maxWidth: "100%", height: "42%", maxHeight: "42%" },
  listEmpty: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  listScroll: { flex: 1 },
  listContent: { padding: 8, gap: 5 },
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.complianceTripCardBg,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 5,
    gap: 3,
  },
  rowSelected: {
    borderWidth: 1.5,
    borderColor: Theme.complianceTripCardSelectedBorder,
    backgroundColor: Theme.complianceTripCardSelectedBg,
  },
  rowRejected: {
    borderColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.complianceStageDocsBg,
  },
  rowRejectedSelected: {
    borderColor: Theme.complianceStageDocsFg,
    borderWidth: 1.5,
    backgroundColor: Theme.complianceStageDocsBg,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  rowMeta: {
    flexShrink: 0,
    maxWidth: "42%",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 4,
    paddingTop: 2,
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
  clientRejected: {
    color: Theme.complianceStageDocsFg,
  },
  factsRejected: {
    borderTopColor: Theme.complianceStageDocsFg,
  },
  rowPartyBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowSupplierHit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    borderRadius: 8,
    paddingVertical: 1,
  },
  rowPartyHitPressed: { opacity: 0.85 },
  client: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Theme.textPrimaryDark,
  },
  clientSelected: { color: Theme.complianceTripCardOnSelected },
  clientLink: {
    color: Theme.complianceBulk,
    textDecorationLine: "underline",
    textDecorationColor: Theme.complianceBulk,
  },
  idLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 34,
    minWidth: 0,
  },
  tripIdHit: {
    flexShrink: 1,
    minWidth: 0,
    borderRadius: 4,
    paddingVertical: 1,
  },
  tripIdLink: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0.1,
    color: Theme.complianceBulk,
    textDecorationLine: "underline",
    textDecorationColor: Theme.complianceBulk,
  },
  tripIdLinkSelected: {
    color: Theme.complianceTripCardOnSelected,
    textDecorationColor: Theme.complianceTripCardOnSelected,
  },
  tripId: { flexShrink: 1, fontSize: 10, fontWeight: "500", color: Theme.textSecondary },
  tripIdSelected: { color: Theme.complianceTripCardMutedOnSelected },
  modelTag: { flexShrink: 0, borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  modelTagAsset: { backgroundColor: Theme.positiveMuted },
  modelTagAggregate: { backgroundColor: Theme.complianceStageInfoBg },
  modelTagText: { fontSize: 8, fontWeight: "600", letterSpacing: 0.2, lineHeight: 11 },
  modelTagTextAsset: { color: Theme.darkGreen },
  modelTagTextAggregate: { color: Theme.complianceStageInfoFg },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.2,
    lineHeight: 11,
  },
  route: { flexDirection: "row", alignItems: "center" },
  leg: { flex: 1, minWidth: 0 },
  legEnd: { alignItems: "flex-end" },
  city: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  citySelected: { color: Theme.complianceTripCardOnSelected },
  region: { fontSize: 9, fontWeight: "400", color: Theme.textMuted, marginTop: 0 },
  regionSelected: { color: Theme.complianceTripCardMutedOnSelected },
  alignEnd: { textAlign: "right", alignSelf: "stretch" },
  arrowSlot: { width: 22, alignItems: "center", justifyContent: "center" },
  arrow: { fontSize: 12, fontWeight: "400", color: Theme.complianceStageInfoFg },
  arrowSelected: { color: Theme.complianceTripCardOnSelected },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    rowGap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
    paddingTop: 4,
  },
  factsSelected: { borderTopColor: Theme.complianceTripCardDividerOnSelected },
  factCell: { width: "50%", paddingRight: 6, minWidth: 0, justifyContent: "flex-end" },
  factCellEnd: { paddingRight: 0, paddingLeft: 6, alignItems: "flex-end" },
  factLabel: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
    lineHeight: 10,
  },
  factLabelSelected: { color: Theme.complianceTripCardMutedOnSelected },
  factValue: { fontSize: 10, fontWeight: "500", color: Theme.textSecondary, lineHeight: 13, marginTop: 1 },
  factValueBare: { fontSize: 10, fontWeight: "500", color: Theme.textSecondary, lineHeight: 13 },
  factValueSelected: { color: Theme.complianceTripCardMutedOnSelected },
  podLogPane: { paddingHorizontal: 0, paddingVertical: 0, overflow: "hidden" },
  previewPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
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
  tabActive: { backgroundColor: Theme.liquidGoodBack, borderColor: Theme.liquidGoodBack },
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
  tabBadgeActive: { backgroundColor: Theme.cardWhite },
  tabBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 11,
    color: Theme.complianceStageDocsFg,
  },
  tabBadgeTextActive: { color: Theme.liquidGoodBack },
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
  screenTitle: { flex: 1, minWidth: 80, fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  screenTools: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto" },
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
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  typedPreviewScrollDark: {
    backgroundColor: Theme.darkSurface,
  },
  typedPreviewContentWithNav: {
    paddingHorizontal: 58,
  },
  typedPreviewHeader: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typedPreviewHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
  },
  typedPreviewHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  typedPreviewKicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  typedPreviewTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  typedPreviewMeta: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
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
    gap: 8,
    paddingBottom: 12,
    paddingRight: 18,
    flexGrow: 0,
  },
  typedPreviewRow: {
    flexGrow: 0,
    flexShrink: 0,
  },
  typedPreviewRowGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  typedEntryCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    overflow: "hidden",
  },
  typedEntryCardSpacer: {
    flex: 1,
    minWidth: 0,
  },
  typedEntryHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceCardBorder,
    backgroundColor: Theme.compliancePageBg,
  },
  typedEntryIndex: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
  },
  typedEntryIndexText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  typedEntryHeading: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  typedFieldRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  typedFieldRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceCardBorder,
  },
  typedFieldLead: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "46%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typedFieldIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
  },
  typedFieldLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
    color: Theme.textMuted,
  },
  typedFieldValue: {
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 15,
    color: Theme.textPrimaryDark,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
    ...(Platform.OS === "web" ? ({ whiteSpace: "nowrap" } as unknown as TextStyle) : null),
  },
  docSideNavOverlayLeft: {
    position: "absolute",
    left: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 40,
    elevation: 40,
  },
  docSideNavOverlayRight: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
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
    flexShrink: 0,
    height: 22,
    minHeight: 22,
    maxHeight: 22,
    paddingVertical: 0,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  podBtnText: {
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
    color: Theme.textPrimaryDark,
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
    gap: 12,
    paddingHorizontal: 6,
    paddingBottom: 6,
    paddingTop: 2,
  },
  checklistStageStacked: {
    flexDirection: "column",
  },
  checklistListPane: {
    width: 360,
    maxWidth: "46%",
    flexShrink: 0,
    alignSelf: "stretch",
    minHeight: 0,
    flexDirection: "column",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.complianceTripCardBg,
    overflow: "hidden",
  },
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
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.complianceTripCardBg,
  },
  checklistPanelTabs: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    padding: 1,
    gap: 0,
    borderRadius: 999,
    backgroundColor: Theme.cardWhite,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  checklistPanelTab: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: 22,
    paddingHorizontal: 6,
    paddingVertical: 0,
    gap: 3,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  checklistPanelTabText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "500",
  },
  checklistPanelTabBadge: {
    minWidth: 14,
    height: 12,
    paddingHorizontal: 4,
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
  checklistUploadPill: {
    flexShrink: 0,
    height: 22,
    paddingHorizontal: 7,
  },
  checklistUploadPillText: {
    fontSize: 8,
  },
  /** Document rows only. Scrolls so the last row and preview actions stay reachable. */
  checklistDocs: {
    flex: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  checklistDocsContent: {
    flexGrow: 1,
    paddingBottom: 4,
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
    flexWrap: "wrap",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 6,
  },
  checklistPreviewTripActions: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 6,
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
    flex: 1,
    minWidth: 0,
    minHeight: 28,
    borderRadius: 7,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  verifyTripBtnText: {
    color: Theme.cardWhite,
    fontSize: 11,
    fontWeight: "700",
  },
  declineTripBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 28,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.negative,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  declineTripBtnText: {
    color: Theme.negative,
    fontSize: 11,
    fontWeight: "700",
  },
  checklistModeBtn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "47%",
    minWidth: 100,
    minHeight: 28,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  checklistModeBtnSelected: {
    backgroundColor: Theme.compliancePageBg,
    borderColor: Theme.textPrimaryDark,
  },
  checklistModeBtnActive: {
    backgroundColor: Theme.buttonDark,
    borderColor: Theme.buttonDark,
  },
  checklistModeBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
    textAlign: "center",
  },
  checklistModeBtnTextSelected: {
    fontWeight: "700",
  },
  checklistModeBtnTextActive: {
    color: Theme.buttonDarkText,
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
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
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
  tripDetailsPanel: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
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
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    letterSpacing: -0.1,
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
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 15,
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
    fontSize: 13,
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
    gap: 3,
    minWidth: 0,
    maxWidth: "32%",
    minHeight: 15,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 4,
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
    fontSize: 8,
    lineHeight: 10,
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
    fontSize: 7,
    lineHeight: 9,
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
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "500",
    letterSpacing: -0.1,
    color: Theme.textPrimaryDark,
  },
  tripFactGrid: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "flex-start",
    alignItems: "flex-start",
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 4,
  },
  tripFactList: {
    flexGrow: 1,
    flexShrink: 1,
    paddingBottom: 2,
  },
  tripFactRow: {
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.borderLight,
  },
  tripFactRowLast: {
    borderBottomWidth: 0,
  },
  tripFactRowLabel: {
    flexGrow: 0,
    flexShrink: 0,
    width: "36%",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "500",
    letterSpacing: 0.25,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  tripFactRowValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
    letterSpacing: -0.1,
    textAlign: "right",
  },
  tripFactCell: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 0,
    justifyContent: "center",
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
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "500",
    letterSpacing: 0.25,
    textTransform: "uppercase",
    color: Theme.textMuted,
    marginBottom: 1,
  },
  tripFactValue: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    lineHeight: 15,
    letterSpacing: -0.1,
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
    fontSize: 11,
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
    height: 36,
    borderRadius: 8,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistPayBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.cardWhite,
    letterSpacing: 0.2,
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
    flexShrink: 0,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Theme.buttonDark,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistRejectedPayBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.buttonDarkText,
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
    height: 32,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  previewZoomLabel: {
    minWidth: 38,
    height: 24,
    paddingHorizontal: 4,
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 24,
    color: Theme.textPrimaryDark,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceTripCardBorder,
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
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  previewToolBtn: {
    minWidth: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
  },
  previewRotateBtn: {
    minWidth: 24,
    height: 24,
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
    alignItems: "center",
    height: 24,
    borderRadius: 6,
    backgroundColor: Theme.compliancePageBg,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    overflow: "hidden",
  },
  previewZoomBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
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
    bottom: 10,
    right: 4,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    zIndex: 6,
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
    gap: 2,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
  },
  missingTitle: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: Theme.textPrimaryDark,
  },
  missingSubtitle: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: 2,
    color: Theme.complianceStageDocsFg,
  },
  missingHint: {
    fontSize: 9,
    fontWeight: "400",
    lineHeight: 12,
    marginTop: 1,
    color: Theme.textMuted,
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
  },
  missingRowDense: {
    minHeight: 36,
    paddingVertical: 3,
  },
  missingRowSelected: {
    backgroundColor: Theme.complianceTripCardSelectedBg,
    borderLeftWidth: 1.5,
    borderLeftColor: Theme.complianceTripCardSelectedBorder,
  },
  missingRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceTripCardBorder,
  },
  missingRowCopy: { flex: 1, minWidth: 0, gap: 2 },
  missingRowActions: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 },
  missingTitleRow: { flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 },
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
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  missingEyeBtnDisabled: { opacity: 0.4 },
  missingUploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 26,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: Theme.positive,
  },
  missingUploadBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.cardWhite,
  },
  checklistPreviewPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  checklistPreviewPaneStacked: {
    minHeight: 220,
    flex: 1,
  },
  checklistPreviewBody: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: Theme.compliancePreviewCanvas,
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
    gap: 10,
  },
  checklistAdvanceRejectBtn: {
    width: 108,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.complianceStageDocsBg,
    alignItems: "center",
    justifyContent: "center",
  },
  checklistAdvanceRejectText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: Theme.complianceStageDocsFg,
  },
  checklistAdvancePayFallback: { flex: 1, height: 44, borderRadius: 12 },
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
  missingNavPill: {
    flexShrink: 0,
    height: 22,
    minHeight: 22,
    maxHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.complianceStageDocsBg,
    alignItems: "center",
    justifyContent: "center",
  },
  missingNavLabel: {
    fontSize: 9,
    fontWeight: "600",
    lineHeight: 11,
    color: Theme.complianceStageDocsFg,
  },
  missingFooterMeta: { flex: 1, minWidth: 0, paddingRight: 8 },
  missingFooterText: { fontSize: 9, fontWeight: "400", color: Theme.textMuted },
  missingPreviewOpenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    height: 26,
    minHeight: 26,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  missingPreviewOpenBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
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
    height: 32,
    minHeight: 32,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.negative,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  declineText: { fontSize: 12, fontWeight: "600", lineHeight: 16, color: Theme.negative },
  approveBtn: {
    height: 32,
    minHeight: 32,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  approveText: { fontSize: 12, fontWeight: "600", lineHeight: 16, color: Theme.cardWhite },
  actionEnd: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 },
  payBtn: {
    height: 32,
    minHeight: 32,
    paddingVertical: 0,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: 1,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  payText: { fontSize: 11, fontWeight: "600", lineHeight: 14, color: Theme.buttonPrimaryText },
  navBtn: {
    height: 22,
    minHeight: 22,
    maxHeight: 22,
    paddingVertical: 0,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    overflow: "hidden",
  },
  navBtnText: { fontSize: 11, fontWeight: "500", lineHeight: 14, color: Theme.textPrimaryDark },
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
  reviewGroupMeta: { fontSize: 10, fontWeight: "500", color: Theme.textPrimaryDark },
  reviewGroupMetaApproved: { color: Theme.positive },
  reviewGroupMetaDeclined: { color: Theme.complianceStageDocsFg },
  reviewGroupActions: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  reviewGroupDecline: {
    minWidth: 80,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewGroupDeclineActive: {
    backgroundColor: Theme.complianceStageDocsFg,
  },
  reviewGroupDeclineText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: Theme.complianceStageDocsFg,
  },
  reviewGroupDeclineTextActive: { color: Theme.cardWhite },
  reviewGroupApprove: {
    minWidth: 84,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
  },
  reviewGroupApproveText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: Theme.cardWhite,
  },
  reviewGroupApprovedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Theme.positive,
    flexShrink: 0,
  },
  reviewGroupApprovedText: { fontSize: 10, fontWeight: "700", color: Theme.cardWhite },
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
