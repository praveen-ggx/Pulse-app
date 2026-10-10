/**
 * Manifest Management — Log Hard Copy POD drawer/modal.
 * Reuses trips.pod_* columns + record_trip_hard_copy_pod /
 * log_trip_hard_copy_pod_courier RPCs. Does not create duplicate POD rows.
 */
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { HardCopyPodDateField } from "@/features/trips/components/trip-detail/HardCopyPodDateField";
import { HardCopyPodPhotoUpload } from "@/features/trips/components/trip-detail/HardCopyPodPhotoUpload";
import {
  encodeHardCopyPodComment,
  fetchTripHardCopyPodState,
  loadLrPodIndexByTripIds,
  logTripHardCopyPodCourier,
  markTripHardCopyPodReceived,
  normalizeTripPodId,
  type HardCopyPodReceiptMethod,
  type HardCopyPodStatus,
  type TripHardCopyPodState,
} from "@/features/trips/services/tripDocumentLrPod.service";
import {
  publishHardCopyPodState,
  syncHardCopyPodRecord,
} from "@/lib/queries/invalidateHardCopyPodCaches";
import {
  hardCopyPodLrKey,
  selectedHardCopyPodTripIds,
  type HardCopyPodLrOption,
} from "@/features/trips/utils/hardCopyPodLrSelection.util";
import {
  courierLrReceiptPlan,
  decodeCourierLrRemarks,
  encodeCourierLrRemarks,
  hardCopyPodLrAlreadyReceived,
  lrReceiptForTrip,
} from "@/features/trips/utils/lrReceiptStatus.util";
import Feather from "@expo/vector-icons/Feather";
import { useQueryClient } from "@tanstack/react-query";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HARD_COPY_POD_COURIERS = [
  "BlueDart",
  "DHL",
  "DTDC",
  "Delhivery",
  "FedEx",
  "Ecom Express",
  "Professional Couriers",
  "India Post",
] as const;

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function dateOrToday(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : todayIsoDate();
}

function courierNameOptions(current: string): string[] {
  const saved = current.trim();
  const base: string[] = [...HARD_COPY_POD_COURIERS];
  if (!saved || base.includes(saved)) return base;
  return [saved, ...base];
}

export type { HardCopyPodLrOption };

export type HardCopyPodManifestSummary = {
  manifestId: string;
  clientName: string;
  pickup: string;
  delivery: string;
  driverName: string;
  vehicleLabel: string;
  vehicleType?: string | null;
  vendorName?: string | null;
};

type Mode = "create" | "view" | "mark_received";

function statusLabel(status: HardCopyPodStatus): string {
  if (status === "IN_TRANSIT") return "IN TRANSIT";
  return status;
}

function statusColor(status: HardCopyPodStatus): string {
  if (status === "RECEIVED") return Theme.positive;
  if (status === "IN_TRANSIT") return Theme.warning;
  return Theme.textMuted;
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const raw = String(iso).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00`)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function LogHardCopyPodModal({
  visible,
  onClose,
  tripId,
  organizationId,
  canManage,
  summary,
  initialMode = "create",
  onUpdated,
  lrOptions = [],
  inline = false,
}: {
  visible: boolean;
  /** Render the panel in place (no modal, overlay, or close button). `onClose` fires after save. */
  inline?: boolean;
  onClose: () => void;
  tripId: string;
  organizationId?: string | null;
  canManage: boolean;
  summary: HardCopyPodManifestSummary;
  initialMode?: Mode;
  /** Called with every trip the courier docket was saved for. */
  onUpdated?: (tripIds?: string[]) => void | Promise<void>;
  /**
   * LRs that can share this docket. Trip ID is taken from each LR.
   * The opened trip's own LRs are merged in when this list omits them.
   */
  lrOptions?: HardCopyPodLrOption[];
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isNarrow = width < 720;
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [loadingState, setLoadingState] = useState(false);
  const [saving, setSaving] = useState(false);
  const [podState, setPodState] = useState<TripHardCopyPodState | null>(null);

  const [method, setMethod] = useState<HardCopyPodReceiptMethod | null>(null);
  const [receivedBy, setReceivedBy] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayIsoDate);
  const [receivedTime, setReceivedTime] = useState("");
  const [courierName, setCourierName] = useState("");
  const [awbNumber, setAwbNumber] = useState("");
  const [dispatchDate, setDispatchDate] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(todayIsoDate);
  const [remarks, setRemarks] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lrNumber, setLrNumber] = useState("—");
  const [loadedLrOptions, setLoadedLrOptions] = useState<HardCopyPodLrOption[]>([]);
  const [selectedLrKeys, setSelectedLrKeys] = useState<string[]>([]);
  const [lrQuery, setLrQuery] = useState("");
  const [storedReceivedLrs, setStoredReceivedLrs] = useState<string[]>([]);
  const lrSelectionScope = useRef("");

  const refreshState = useCallback(async () => {
    setLoadingState(true);
    const { error, state } = await fetchTripHardCopyPodState(tripId);
    setLoadingState(false);
    if (error) {
      Alert.alert("Hard Copy POD", error.message);
      return null;
    }
    setPodState(state);
    return state;
  }, [tripId]);

  useEffect(() => {
    if (!visible) {
      setStoredReceivedLrs([]);
      return;
    }
    setMode(initialMode);
    setErrors({});
    void refreshState().then((state) => {
      if (!state) return;
      if (state.status === "RECEIVED") {
        publishHardCopyPodState(queryClient, tripId, state);
      }
      const decodedRemarks = decodeCourierLrRemarks(state.remarks);
      const applyMethod = (next: HardCopyPodReceiptMethod | null) => {
        setMethod(next);
      };
      if (state.status === "RECEIVED" || (state.status === "IN_TRANSIT" && initialMode !== "create")) {
        setMode(initialMode === "mark_received" ? "mark_received" : "view");
        applyMethod(state.receiptMethod);
        setReceivedBy(state.receivedBy ?? "");
        setReceivedDate(state.receivedDate ?? "");
        setReceivedTime(state.receivedTime ?? "");
        setCourierName(state.courier ?? "");
        setAwbNumber(state.awbNumber ?? "");
        setDispatchDate(state.dispatchDate ?? "");
        setExpectedDeliveryDate(state.expectedDeliveryDate ?? "");
        setRemarks(decodedRemarks.text ?? "");
        setStoredReceivedLrs(decodedRemarks.receivedLrs);
      } else if (state.status === "IN_TRANSIT") {
        setMode("create");
        applyMethod(state.receiptMethod === "person" ? "person" : "courier");
        setReceivedBy(state.receivedBy ?? "");
        setReceivedDate(dateOrToday(state.receivedDate));
        setReceivedTime(state.receivedTime ?? "");
        setCourierName(state.courier ?? "");
        setAwbNumber(state.awbNumber ?? "");
        setDispatchDate(state.dispatchDate ?? "");
        setExpectedDeliveryDate(dateOrToday(state.expectedDeliveryDate));
        setRemarks(decodedRemarks.text ?? "");
        setStoredReceivedLrs(decodedRemarks.receivedLrs);
      } else {
        setMode("create");
        applyMethod(null);
        setReceivedBy("");
        setReceivedDate(todayIsoDate());
        setReceivedTime("");
        setCourierName("");
        setAwbNumber("");
        setDispatchDate("");
        setExpectedDeliveryDate(todayIsoDate());
        setRemarks("");
        setStoredReceivedLrs([]);
      }
    });
  }, [visible, initialMode, queryClient, refreshState, tripId]);

  useEffect(() => {
    if (!visible || !tripId.trim()) {
      setLrNumber("—");
      setLoadedLrOptions([]);
      return;
    }
    let cancelled = false;
    const displayId =
      summary.manifestId.trim() && summary.manifestId.trim() !== "—"
        ? summary.manifestId.trim()
        : tripId;
    void loadLrPodIndexByTripIds([tripId]).then((index) => {
      if (cancelled) return;
      const numbers = index.get(normalizeTripPodId(tripId))?.lrNumbers ?? [];
      setLrNumber(numbers.length > 0 ? numbers.join(", ") : "—");
      setLoadedLrOptions(
        numbers.map((lrNumber) => ({
          lrNumber,
          tripId,
          tripDisplayId: displayId,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [visible, tripId, summary.manifestId]);

  const lrChoices = useMemo(() => {
    const byKey = new Map<string, HardCopyPodLrOption>();
    // Passed-in document rows already name the upload trip. The opened-trip
    // index is only a fallback for callers that do not pass those rows.
    const source = lrOptions.length > 0 ? lrOptions : loadedLrOptions;
    for (const option of source) {
      const trip = option.tripId.trim();
      const lr = option.lrNumber.trim();
      if (!trip || !lr || lr === "—") continue;
      const row = {
        lrNumber: lr,
        tripId: trip,
        tripDisplayId: option.tripDisplayId.trim() || trip,
        alreadyReceived: option.alreadyReceived === true,
      };
      byKey.set(hardCopyPodLrKey(row), row);
    }
    return Array.from(byKey.values());
  }, [loadedLrOptions, lrOptions]);

  useEffect(() => {
    if (!visible) {
      lrSelectionScope.current = "";
      setLrQuery("");
      return;
    }
    const scope = `${tripId}|${lrChoices
      .map((option) => `${hardCopyPodLrKey(option)}:${option.alreadyReceived ? 1 : 0}`)
      .join(",")}|${storedReceivedLrs.join(",")}`;
    if (lrSelectionScope.current === scope) return;
    lrSelectionScope.current = scope;
    const own = lrChoices.filter((option) => option.tripId === tripId);
    const pending = own.filter(
      (option) => !hardCopyPodLrAlreadyReceived(option, tripId, storedReceivedLrs),
    );
    const hasPrior = pending.length !== own.length;
    setSelectedLrKeys((hasPrior ? pending : own).map(hardCopyPodLrKey));
  }, [visible, tripId, lrChoices, storedReceivedLrs]);

  const selectedLrRows = useMemo(
    () => lrChoices.filter((option) => selectedLrKeys.includes(hardCopyPodLrKey(option))),
    [lrChoices, selectedLrKeys],
  );

  const tripDisplayId =
    summary.manifestId.trim() && summary.manifestId.trim() !== "—"
      ? summary.manifestId.trim()
      : tripId;
  const cardLrNumber = useMemo(() => {
    const own = lrChoices
      .filter((option) => option.tripId === tripId)
      .map((option) => option.lrNumber.trim())
      .filter(Boolean);
    if (own.length > 0) return Array.from(new Set(own)).join(", ");
    return lrNumber.trim() || "—";
  }, [lrChoices, lrNumber, tripId]);
  const openedLrReceipt = useMemo(() => {
    const own = lrChoices.filter((option) => option.tripId === tripId).map((option) => option.lrNumber);
    const prior = lrChoices
      .filter(
        (option) =>
          option.tripId === tripId && hardCopyPodLrAlreadyReceived(option, tripId, storedReceivedLrs),
      )
      .map((option) => option.lrNumber);
    return lrReceiptForTrip(own.length > 0 ? own : [], [...prior, ...storedReceivedLrs]);
  }, [lrChoices, storedReceivedLrs, tripId]);
  const receivedLrKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const option of lrChoices) {
      if (hardCopyPodLrAlreadyReceived(option, tripId, storedReceivedLrs)) keys.add(hardCopyPodLrKey(option));
    }
    return keys;
  }, [lrChoices, storedReceivedLrs, tripId]);

  const invalidate = useCallback(async (tripIds?: string[]) => {
    const ids = Array.from(
      new Set((tripIds?.length ? tripIds : [tripId]).map((id) => id.trim()).filter(Boolean)),
    );
    await Promise.all(
      ids.map((id) =>
        syncHardCopyPodRecord(queryClient, {
          tripId: id,
          organizationId,
        }),
      ),
    );
    await onUpdated?.(ids);
  }, [onUpdated, organizationId, queryClient, tripId]);

  const validateCreate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!method) {
      next.method = "Select how the hard copy POD was received.";
    } else if (method === "person") {
      if (!receivedBy.trim()) next.receivedBy = "Person name is required.";
      if (!receivedDate.trim()) next.receivedDate = "Received date is required.";
    } else {
      if (lrChoices.length > 0 && selectedLrRows.length === 0) {
        next.lrSelection = "Select at least one LR number.";
      }
      if (!courierName.trim()) next.courierName = "Courier name is required.";
      if (!awbNumber.trim()) next.awbNumber = "Tracking / AWB number is required.";
      if (!expectedDeliveryDate.trim()) {
        next.expectedDeliveryDate = "Received delivery date is required.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [
    awbNumber,
    courierName,
    expectedDeliveryDate,
    lrChoices.length,
    method,
    receivedBy,
    receivedDate,
    selectedLrRows.length,
  ]);

  const validateMarkReceived = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!receivedBy.trim()) next.receivedBy = "Person name is required.";
    if (!receivedDate.trim()) next.receivedDate = "Received date is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [receivedBy, receivedDate]);

  const handleSaveCreate = useCallback(async () => {
    if (!canManage || saving) return;
    if (!validateCreate() || !method) {
      Alert.alert(
        "Hard Copy POD",
        method === "courier"
          ? "Select the LR numbers, then enter courier name, docket number, dispatch date, and received date."
          : "Enter who received the POD and the received date.",
      );
      return;
    }
    setSaving(true);
    if (method === "person") {
      const { error, alreadyReceived } = await markTripHardCopyPodReceived(tripId, {
        receivedBy: receivedBy.trim(),
        comment: encodeHardCopyPodComment({
          remarks,
          receivedDate,
          receivedTime,
          receiptMethod: "person",
        }),
      });
      setSaving(false);
      if (error) {
        Alert.alert("Hard Copy POD", error.message);
        return;
      }
      if (alreadyReceived) {
        Alert.alert(
          "Hard Copy POD",
          "This trip's hard-copy POD was already recorded as received.",
        );
      }
    } else {
      const comment = encodeHardCopyPodComment({
        remarks,
        receiptMethod: "courier",
        dispatchDate,
        expectedDeliveryDate,
      });
      const tripIds = selectedHardCopyPodTripIds(lrChoices, new Set(selectedLrKeys));
      const targets = tripIds.length > 0 ? tripIds : [tripId];
      const selectedKeys = new Set(selectedLrKeys);
      const saved: string[] = [];
      let firstError: string | null = null;
      let already = 0;
      let stayedPartial = 0;
      for (const id of targets) {
        const plan = courierLrReceiptPlan({
          tripId: id,
          options: lrChoices,
          selectedKeys,
          openedTripId: tripId,
          storedReceivedLrs,
        });
        const logged = await logTripHardCopyPodCourier(id, {
          courier: courierName.trim(),
          awbNumber: awbNumber.trim(),
          dispatchDate,
          expectedDeliveryDate: expectedDeliveryDate || null,
          remarks: encodeCourierLrRemarks({ text: remarks, receivedLrs: plan.receivedLrs }),
        });
        if (!plan.complete) {
          if (logged.error) {
            firstError = firstError ?? logged.error.message;
            continue;
          }
          saved.push(id);
          if (logged.alreadyReceived) already += 1;
          else stayedPartial += 1;
          continue;
        }
        const recorded = await markTripHardCopyPodReceived(id, {
          courier: courierName.trim(),
          awbNumber: awbNumber.trim(),
          comment,
        });
        if (recorded.error && logged.error) {
          firstError = firstError ?? recorded.error.message;
          continue;
        }
        saved.push(id);
        if (recorded.alreadyReceived && logged.alreadyReceived) already += 1;
      }
      setSaving(false);
      if (saved.length === 0) {
        Alert.alert("Hard Copy POD", firstError ?? "Couldn't save the courier POD.");
        return;
      }
      await invalidate(saved);
      if (firstError) {
        Alert.alert(
          "Hard Copy POD",
          `Saved ${saved.length} of ${targets.length} trips. ${firstError}`,
        );
      } else if (stayedPartial > 0) {
        Alert.alert(
          "Hard Copy POD",
          stayedPartial === saved.length
            ? "Recorded the received LRs. This trip stays in Partial Received POD until every LR is received."
            : "Recorded the received LRs. Trips that still have a pending LR stay in Partial Received POD.",
        );
      } else if (already === saved.length) {
        Alert.alert(
          "Hard Copy POD",
          "These trips' hard-copy PODs were already marked received.",
        );
      }
      onClose();
      return;
    }
    await invalidate();
    onClose();
  }, [
    awbNumber,
    canManage,
    courierName,
    dispatchDate,
    expectedDeliveryDate,
    invalidate,
    lrChoices,
    method,
    onClose,
    receivedBy,
    receivedDate,
    receivedTime,
    remarks,
    saving,
    selectedLrKeys,
    storedReceivedLrs,
    tripId,
    validateCreate,
  ]);

  const handleConfirmReceived = useCallback(async () => {
    if (!canManage || saving || !validateMarkReceived()) return;
    setSaving(true);
    const { error, alreadyReceived } = await markTripHardCopyPodReceived(tripId, {
      receivedBy: receivedBy.trim(),
      courier: (podState?.courier ?? courierName).trim() || null,
      awbNumber: (podState?.awbNumber ?? awbNumber).trim() || null,
      comment: encodeHardCopyPodComment({
        remarks,
        receivedDate,
        receiptMethod: "courier",
      }),
    });
    setSaving(false);
    if (error) {
      Alert.alert("Hard Copy POD", error.message);
      return;
    }
    if (alreadyReceived) {
      Alert.alert(
        "Hard Copy POD",
        "This trip's hard-copy POD was already recorded as received.",
      );
    }
    await invalidate();
    onClose();
  }, [
    awbNumber,
    canManage,
    courierName,
    invalidate,
    onClose,
    podState?.awbNumber,
    podState?.courier,
    receivedBy,
    receivedDate,
    remarks,
    saving,
    tripId,
    validateMarkReceived,
  ]);

  const panelWidth = useMemo(
    () => (isNarrow ? width : Math.min(440, width * 0.42)),
    [isNarrow, width],
  );

  const title =
    mode === "mark_received"
      ? "Confirm POD Received"
      : mode === "view"
        ? "Hard Copy POD"
        : "Hard Copy POD";

  const subtitle =
    mode === "mark_received"
      ? "Confirm physical receipt of the courier POD."
      : "Record the physical POD receipt for this manifest.";

  const readOnly = mode === "view";
  const showCreateForm = mode === "create";
  const showMarkReceived = mode === "mark_received";
  const compact = inline;

  const panel = (
        <View
          style={[
            styles.panel,
            inline
              ? styles.panelInline
              : {
                  width: isNarrow ? "100%" : panelWidth,
                  maxWidth: isNarrow ? "100%" : 480,
                  paddingTop: isNarrow ? insets.top + 12 : 20,
                  paddingBottom: Math.max(insets.bottom, 16),
                  alignSelf: isNarrow ? "stretch" : "flex-end",
                  height: isNarrow ? "100%" : "100%",
                  borderTopLeftRadius: isNarrow ? 0 : 16,
                  borderBottomLeftRadius: isNarrow ? 0 : 16,
                },
            compact && styles.panelSplit,
            compact && isNarrow && styles.panelSplitStacked,
          ]}
        >
          <View
            style={[
              compact ? styles.splitForm : styles.splitFill,
              compact && isNarrow && styles.splitFormStacked,
            ]}
          >
          <View style={[styles.headerRow, compact && styles.headerRowCompact]}>
            <View style={styles.headerCopy}>
              <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
              <Text style={[styles.subtitle, compact && styles.subtitleCompact]} numberOfLines={2}>
                {subtitle}
              </Text>
            </View>
            {inline ? null : (
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close hard copy POD"
              >
                <Feather name="x" size={18} color={Theme.textMuted} />
              </Pressable>
            )}
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.scrollBody, compact && styles.scrollBodyCompact]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.summaryCard, compact && styles.summaryCardCompact]}>
              <SummaryRow label="Manifest ID" value={summary.manifestId} />
              <SummaryRow label="LR Number" value={cardLrNumber} />
              {openedLrReceipt.received.length + openedLrReceipt.pending.length > 0 ? (
                <>
                  <SummaryRow
                    label="Received LRs"
                    value={openedLrReceipt.received.join(", ") || "—"}
                  />
                  <SummaryRow
                    label="Pending LRs"
                    value={openedLrReceipt.pending.join(", ") || "—"}
                  />
                </>
              ) : null}
              <SummaryRow label="Client" value={summary.clientName} />
              <SummaryRow label="Pickup" value={summary.pickup} />
              <SummaryRow label="Delivery" value={summary.delivery} />
              <SummaryRow label="Driver" value={summary.driverName} />
              <SummaryRow label="Vehicle" value={summary.vehicleLabel} />
              <SummaryRow label="Vehicle Type" value={summary.vehicleType?.trim() || "—"} />
              <SummaryRow label="Vendor Name" value={summary.vendorName?.trim() || "—"} />
            </View>

            {loadingState ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={Theme.analyticsHeroBg} />
            ) : null}

            {readOnly && podState ? (
              <View style={styles.section}>
                <View style={styles.statusPillRow}>
                  <Text style={styles.sectionTitle}>POD Status</Text>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: `${statusColor(podState.status)}18` },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: statusColor(podState.status) },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: statusColor(podState.status) },
                      ]}
                    >
                      {statusLabel(podState.status)}
                    </Text>
                  </View>
                </View>
                <DetailRow
                  label="Receipt Method"
                  value={
                    podState.receiptMethod === "courier"
                      ? "Received by Courier"
                      : podState.receiptMethod === "person"
                        ? "Received by Person"
                        : "—"
                  }
                />
                {podState.receiptMethod === "courier" ? (
                  <>
                    <CourierLrMap
                      rows={
                        lrChoices.filter((option) => option.tripId === tripId).length > 0
                          ? lrChoices.filter((option) => option.tripId === tripId)
                          : [{ lrNumber, tripId, tripDisplayId }]
                      }
                      docket={podState.awbNumber ?? "—"}
                      dispatchDate={formatDisplayDate(podState.dispatchDate)}
                      receivedDate={formatDisplayDate(podState.expectedDeliveryDate)}
                    />
                    <DetailRow label="Courier" value={podState.courier ?? "—"} />
                    <DetailRow label="Tracking / AWB" value={podState.awbNumber ?? "—"} emphasize />
                    <DetailRow
                      label="Dispatch Date"
                      value={formatDisplayDate(podState.dispatchDate)}
                    />
                    <DetailRow
                      label="Received Delivery Date"
                      value={formatDisplayDate(podState.expectedDeliveryDate)}
                    />
                  </>
                ) : null}
                {podState.status === "RECEIVED" ? (
                  <>
                    <DetailRow label="Received By" value={podState.receivedBy ?? "—"} />
                    <DetailRow
                      label="Received Date"
                      value={
                        formatDisplayDate(podState.receivedDate) !== "—"
                          ? formatDisplayDate(podState.receivedDate)
                          : formatDisplayDate(podState.receivedAt)
                      }
                    />
                    {podState.receivedTime ? (
                      <DetailRow label="Received Time" value={podState.receivedTime} />
                    ) : null}
                  </>
                ) : null}
                {podState.remarks ? (
                  <DetailRow label="Remarks" value={podState.remarks} />
                ) : null}

                {compact ? null : (
                  <HardCopyPodPhotoUpload tripId={tripId} canEdit={canManage} />
                )}

                {canManage && podState.status === "IN_TRANSIT" ? (
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => {
                      setMode("mark_received");
                      setReceivedBy("");
                      setReceivedDate("");
                      setRemarks(podState.remarks ?? "");
                      setErrors({});
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Mark as Received"
                  >
                    <Text style={styles.primaryBtnText}>Mark as Received</Text>
                  </Pressable>
                ) : null}

                {canManage && podState.status === "IN_TRANSIT" ? (
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => {
                      setMode("create");
                      setMethod("courier");
                      setErrors({});
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Edit courier POD"
                  >
                    <Text style={styles.secondaryBtnText}>Edit</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {showCreateForm ? (
              <View style={[styles.section, compact && styles.sectionCompact]}>
                <Text style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>
                  How was the hard copy POD received?
                </Text>
                {errors.method ? (
                  <Text style={styles.errorText}>{errors.method}</Text>
                ) : null}
                <View style={styles.segmentRow}>
                  <Pressable
                    style={[
                      styles.segmentCard,
                      compact && styles.segmentCardCompact,
                      method === "person" && styles.segmentCardActive,
                    ]}
                    onPress={() => {
                      setMethod("person");
                      setErrors((e) => {
                        const { method: _m, ...rest } = e;
                        return rest;
                      });
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: method === "person" }}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        method === "person" && styles.radioOuterActive,
                      ]}
                    >
                      {method === "person" ? <View style={styles.radioInner} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          styles.segmentTitle,
                          compact && styles.segmentTitleCompact,
                          method === "person" && styles.segmentTitleActive,
                        ]}
                      >
                        Received by Person
                      </Text>
                      <Text style={[styles.segmentHint, compact && styles.segmentHintCompact]}>
                        Handed over in person
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.segmentCard,
                      compact && styles.segmentCardCompact,
                      method === "courier" && styles.segmentCardActive,
                    ]}
                    onPress={() => {
                      setMethod("courier");
                      setErrors((e) => {
                        const { method: _m, ...rest } = e;
                        return rest;
                      });
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: method === "courier" }}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        method === "courier" && styles.radioOuterActive,
                      ]}
                    >
                      {method === "courier" ? <View style={styles.radioInner} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={[
                          styles.segmentTitle,
                          compact && styles.segmentTitleCompact,
                          method === "courier" && styles.segmentTitleActive,
                        ]}
                      >
                        Received by Courier
                      </Text>
                      <Text style={[styles.segmentHint, compact && styles.segmentHintCompact]}>
                        Dispatched via courier
                      </Text>
                    </View>
                  </Pressable>
                </View>

                {method === "person" ? (
                  <View style={[styles.fields, compact && styles.fieldsCompact]}>
                    <Field
                      label="Received by"
                      required
                      value={receivedBy}
                      onChangeText={setReceivedBy}
                      placeholder="Person name"
                      error={errors.receivedBy}
                    />
                    <View style={styles.dateTimeRow}>
                      <View style={styles.dateTimeCol}>
                        <HardCopyPodDateField
                          label="Received date"
                          required
                          value={receivedDate}
                          onChange={setReceivedDate}
                          error={errors.receivedDate}
                        />
                      </View>
                      <View style={styles.dateTimeCol}>
                        <Field
                          label="Received time"
                          value={receivedTime}
                          onChangeText={setReceivedTime}
                          placeholder="HH:MM"
                        />
                      </View>
                    </View>
                    <View style={styles.dateTimeRow}>
                      <View style={styles.dateTimeCol}>
                        <Field
                          label="Remarks"
                          value={remarks}
                          onChangeText={setRemarks}
                          placeholder="Optional remarks"
                          multiline
                        />
                      </View>
                      {compact ? null : (
                        <View style={styles.dateTimeCol}>
                          <HardCopyPodPhotoUpload tripId={tripId} canEdit={canManage} />
                        </View>
                      )}
                    </View>
                  </View>
                ) : null}

                {method === "courier" ? (
                  <View style={[styles.fields, compact && styles.fieldsCompact]}>
                    <CourierLrPicker
                      options={lrChoices}
                      selectedKeys={selectedLrKeys}
                      receivedKeys={receivedLrKeys}
                      query={lrQuery}
                      onQueryChange={setLrQuery}
                      error={errors.lrSelection}
                      onToggle={(key) => {
                        setSelectedLrKeys((current) =>
                          current.includes(key)
                            ? current.filter((item) => item !== key)
                            : [...current, key],
                        );
                        setErrors((current) => {
                          if (!current.lrSelection) return current;
                          const { lrSelection: _removed, ...rest } = current;
                          return rest;
                        });
                      }}
                    />
                    <CourierLrMap
                      rows={selectedLrRows}
                      docket={awbNumber.trim() || "—"}
                      dispatchDate={formatDisplayDate(dispatchDate)}
                      receivedDate={formatDisplayDate(expectedDeliveryDate)}
                    />
                    <Text style={styles.sharedDocketHint}>
                      Docket number, dispatch date, and received date stay the same for every selected LR.
                    </Text>
                    <CourierNameField
                      value={courierName}
                      error={errors.courierName}
                      onChange={(name) => {
                        setCourierName(name);
                        setErrors((current) => {
                          const { courierName: _removed, ...rest } = current;
                          return rest;
                        });
                      }}
                    />
                    <Field
                      label="Tracking / AWB Number"
                      required
                      value={awbNumber}
                      onChangeText={setAwbNumber}
                      placeholder="Primary courier reference"
                      error={errors.awbNumber}
                      emphasize
                    />
                    <View style={styles.dateTimeRow}>
                      <View style={styles.dateTimeCol}>
                        <HardCopyPodDateField
                          label="Dispatch Date"
                          value={dispatchDate}
                          onChange={setDispatchDate}
                          error={errors.dispatchDate}
                        />
                      </View>
                      <View style={styles.dateTimeCol}>
                        <HardCopyPodDateField
                          label="Received Delivery Date"
                          required
                          value={expectedDeliveryDate}
                          onChange={(iso) => {
                            setExpectedDeliveryDate(iso);
                            setErrors((current) => {
                              if (!current.expectedDeliveryDate) return current;
                              const { expectedDeliveryDate: _removed, ...rest } = current;
                              return rest;
                            });
                          }}
                          error={errors.expectedDeliveryDate}
                        />
                      </View>
                    </View>
                    <View style={styles.dateTimeRow}>
                      <View style={styles.dateTimeCol}>
                        <Field
                          label="Remarks"
                          value={remarks}
                          onChangeText={setRemarks}
                          placeholder="Optional remarks"
                          multiline
                        />
                      </View>
                      {compact ? null : (
                        <View style={styles.dateTimeCol}>
                          <HardCopyPodPhotoUpload tripId={tripId} canEdit={canManage} />
                        </View>
                      )}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {showMarkReceived ? (
              <View style={styles.section}>
                {podState?.courier || podState?.awbNumber ? (
                  <View style={[styles.summaryCard, compact && styles.summaryCardCompact]}>
                    <SummaryRow label="Courier" value={podState.courier ?? "—"} />
                    <SummaryRow
                      label="Tracking"
                      value={podState.awbNumber ?? "—"}
                    />
                  </View>
                ) : null}
                <View style={[styles.fields, compact && styles.fieldsCompact]}>
                  <HardCopyPodDateField
                    label="Received Date"
                    required
                    value={receivedDate}
                    onChange={setReceivedDate}
                    error={errors.receivedDate}
                  />
                  <Field
                    label="Received By"
                    required
                    value={receivedBy}
                    onChangeText={setReceivedBy}
                    placeholder="Person name"
                    error={errors.receivedBy}
                  />
                  <View style={styles.dateTimeRow}>
                    <View style={styles.dateTimeCol}>
                      <Field
                        label="Remarks"
                        value={remarks}
                        onChangeText={setRemarks}
                        placeholder="Optional"
                        multiline
                      />
                    </View>
                    {compact ? null : (
                      <View style={styles.dateTimeCol}>
                        <HardCopyPodPhotoUpload tripId={tripId} canEdit={canManage} />
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, compact && styles.footerCompact]}>
            {showCreateForm && canManage ? (
              <>
                <Pressable
                  style={[styles.secondaryBtn, compact && styles.btnCompact]}
                  onPress={onClose}
                  disabled={saving}
                >
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.primaryBtn,
                    styles.footerPrimary,
                    compact && styles.btnCompact,
                    (!method || saving) && styles.btnDisabled,
                  ]}
                  onPress={() => void handleSaveCreate()}
                  disabled={!method || saving}
                  accessibilityRole="button"
                  accessibilityLabel="Save hard copy POD"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Save</Text>
                  )}
                </Pressable>
              </>
            ) : null}
            {showMarkReceived && canManage ? (
              <>
                <Pressable
                  style={[styles.secondaryBtn, compact && styles.btnCompact]}
                  onPress={() => setMode("view")}
                  disabled={saving}
                >
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.primaryBtn,
                    styles.footerPrimary,
                    compact && styles.btnCompact,
                    saving && styles.btnDisabled,
                  ]}
                  onPress={() => void handleConfirmReceived()}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm Received"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Confirm Received</Text>
                  )}
                </Pressable>
              </>
            ) : null}
            {readOnly ? (
              <Pressable style={[styles.secondaryBtn, { flex: 1 }]} onPress={onClose}>
                <Text style={styles.secondaryBtnText}>Close</Text>
              </Pressable>
            ) : null}
          </View>
          </View>
          {compact ? (
            <View style={[styles.splitPreview, isNarrow && styles.splitPreviewStacked]}>
              <HardCopyPodPhotoUpload tripId={tripId} canEdit={canManage} variant="pane" />
            </View>
          ) : null}
        </View>
  );

  if (inline) return panel;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isNarrow ? "slide" : "fade"}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        {panel}
      </View>
    </Modal>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>
        {value || "—"}
      </Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, emphasize && styles.detailValueEmphasize]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function CourierNameField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (name: string) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const options = courierNameOptions(value);
  const selected = value.trim();

  const choose = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        Courier Name
        <Text style={styles.req}> *</Text>
      </Text>
      {Platform.OS === "web" ? (
        <View style={[styles.input, styles.courierSelect, error ? styles.inputError : null]}>
          {createElement(
            "select",
            {
              value: selected,
              "aria-label": "Courier Name",
              "aria-required": true,
              "aria-invalid": Boolean(error),
              onChange: (event: { target: { value: string } }) => {
                choose(event.target.value);
              },
              style: {
                flex: 1,
                minWidth: 0,
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 14,
                fontWeight: "500",
                color: selected ? Theme.textPrimaryDark : Theme.textMuted,
                fontFamily: "inherit",
                padding: 0,
                margin: 0,
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
              },
            },
            createElement("option", { value: "", disabled: true }, "Select courier"),
            ...options.map((name) =>
              createElement("option", { key: name, value: name }, name),
            ),
          )}
          <View pointerEvents="none">
            <Feather name="chevron-down" size={16} color={Theme.textMuted} />
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          style={[styles.input, styles.courierSelect, error ? styles.inputError : null]}
          accessibilityRole="button"
          accessibilityLabel="Courier Name"
          accessibilityHint="Opens the courier list"
          accessibilityState={{ expanded: open }}
        >
          <Text
            style={[styles.courierValue, !selected && styles.courierPlaceholder]}
            numberOfLines={1}
          >
            {selected || "Select courier"}
          </Text>
          <Feather name="chevron-down" size={16} color={Theme.textMuted} />
        </Pressable>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {Platform.OS === "web" ? null : (
        <Modal
          visible={open}
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={styles.courierBackdrop} onPress={() => setOpen(false)}>
            <View style={styles.courierSheet} onStartShouldSetResponder={() => true}>
              <Text style={styles.courierSheetTitle}>Courier Name</Text>
              <ScrollView keyboardShouldPersistTaps="handled">
                {options.map((name) => {
                  const active = name === selected;
                  return (
                    <Pressable
                      key={name}
                      onPress={() => choose(name)}
                      style={[styles.courierOption, active && styles.courierOptionActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[
                          styles.courierOptionText,
                          active && styles.courierOptionTextActive,
                        ]}
                      >
                        {name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

function CourierLrPicker({
  options,
  selectedKeys,
  receivedKeys,
  query,
  onQueryChange,
  onToggle,
  error,
}: {
  options: HardCopyPodLrOption[];
  selectedKeys: string[];
  receivedKeys: ReadonlySet<string>;
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (key: string) => void;
  error?: string;
}) {
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((option) => {
        const haystack = `${option.lrNumber} ${option.tripDisplayId}`.toLowerCase();
        return haystack.includes(needle);
      })
    : options;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        LR Numbers
        <Text style={styles.req}> *</Text>
      </Text>
      <Text style={styles.lrPickerHint}>
        Select every LR on this docket. Each trip ID is taken from its LR.
      </Text>
      {options.length > 6 ? (
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search LR or trip ID"
          placeholderTextColor={Theme.textMuted}
          accessibilityLabel="Search LR numbers"
        />
      ) : null}
      <ScrollView
        style={styles.lrPickerList}
        contentContainerStyle={styles.lrPickerListContent}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {options.length === 0 ? (
          <Text style={styles.lrPickerEmpty}>No LR numbers are available for this queue.</Text>
        ) : visible.length === 0 ? (
          <Text style={styles.lrPickerEmpty}>No LR numbers match that search.</Text>
        ) : (
          visible.map((option) => {
            const key = hardCopyPodLrKey(option);
            const received = receivedKeys.has(key);
            const selected = received || selectedKeys.includes(key);
            return (
              <Pressable
                key={key}
                onPress={received ? undefined : () => onToggle(key)}
                disabled={received}
                style={[styles.lrPickerRow, selected && styles.lrPickerRowSelected]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: received }}
                accessibilityLabel={`${option.lrNumber}, trip ${option.tripDisplayId}, ${received ? "received" : "pending"}`}
              >
                <View style={[styles.lrCheck, selected && styles.lrCheckSelected]}>
                  {selected ? <Feather name="check" size={12} color={Theme.buttonDarkText} /> : null}
                </View>
                <View style={styles.lrPickerCopy}>
                  <Text style={styles.lrPickerLr} numberOfLines={1}>
                    {option.lrNumber}
                  </Text>
                  <Text style={styles.lrPickerTrip} numberOfLines={1}>
                    {option.tripDisplayId}
                  </Text>
                </View>
                <Text style={received ? styles.lrStatusReceived : styles.lrStatusPending}>
                  {received ? "Received" : "Pending"}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

function CourierLrMap({
  rows,
  docket,
  dispatchDate,
  receivedDate,
}: {
  rows: HardCopyPodLrOption[];
  docket: string;
  dispatchDate: string;
  receivedDate: string;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.lrMap}>
      <Text style={styles.fieldLabel}>Selected LR numbers</Text>
      {rows.map((row) => (
        <View key={hardCopyPodLrKey(row)} style={styles.lrMapCard}>
          <View style={styles.lrMapPair}>
            <Text style={styles.lrMapLabel}>LR Number</Text>
            <Text style={styles.lrMapValue} selectable>
              {row.lrNumber}
            </Text>
          </View>
          <View style={styles.lrMapPair}>
            <Text style={styles.lrMapLabel}>Trip ID</Text>
            <Text style={styles.lrMapValue} selectable>
              {row.tripDisplayId}
            </Text>
          </View>
          <View style={styles.lrMapPair}>
            <Text style={styles.lrMapLabel}>Docket No.</Text>
            <Text style={styles.lrMapValue} selectable>
              {docket || "—"}
            </Text>
          </View>
          <View style={styles.lrMapPair}>
            <Text style={styles.lrMapLabel}>Dispatch Date</Text>
            <Text style={styles.lrMapValue}>{dispatchDate || "—"}</Text>
          </View>
          <View style={styles.lrMapPair}>
            <Text style={styles.lrMapLabel}>Received Date</Text>
            <Text style={styles.lrMapValue}>{receivedDate || "—"}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  multiline,
  error,
  emphasize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  error?: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          emphasize && styles.inputEmphasize,
          error ? styles.inputError : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Theme.textMuted}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.4)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    backgroundColor: Theme.cardWhite,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Theme.borderLight,
    ...Platform.select({
      web: {
        boxShadow: "-8px 0 32px rgba(15,23,42,0.12)",
      } as object,
      default: {
        shadowColor: Theme.shadow,
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 8,
      },
    }),
  },
  panelSplit: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    paddingHorizontal: 8,
  },
  panelSplitStacked: { flexDirection: "column" },
  splitFill: { flex: 1, minWidth: 0, minHeight: 0 },
  splitForm: {
    flex: 1,
    minWidth: 0,
    maxWidth: "46%",
    minHeight: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.complianceTripCardBg,
    overflow: "hidden",
  },
  splitFormStacked: { maxWidth: "100%" },
  splitPreview: {
    flex: 1.2,
    minWidth: 0,
    minHeight: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    padding: 8,
  },
  splitPreviewStacked: { flex: 1, maxWidth: "100%", minWidth: 0, minHeight: 220 },
  panelInline: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 12,
    borderLeftWidth: 0,
    ...Platform.select({
      web: { boxShadow: "none" } as object,
      default: { shadowOpacity: 0, elevation: 0 },
    }),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  headerRowCompact: { paddingHorizontal: 10, marginBottom: 4, alignItems: "center" },
  headerCopy: { flex: 1, minWidth: 0, overflow: "hidden" },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: Theme.analyticsHeroBg,
    letterSpacing: 0.2,
  },
  titleCompact: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textPrimaryDark,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: Theme.textSecondary,
    lineHeight: 18,
  },
  subtitleCompact: { marginTop: 2, fontSize: 10, lineHeight: 13 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surfaceGray,
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 16,
  },
  scrollBodyCompact: { paddingHorizontal: 10, paddingBottom: 8, gap: 8 },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.surfaceGray,
    padding: 12,
    gap: 8,
  },
  summaryCardCompact: { padding: 8, gap: 4, borderRadius: 10 },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  summaryLabel: {
    width: 88,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
    paddingTop: 2,
  },
  summaryValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  section: { gap: 12 },
  sectionCompact: { gap: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  sectionTitleCompact: { fontSize: 11, fontWeight: "600" },
  statusPillRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  segmentRow: { gap: 10 },
  segmentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    padding: 14,
    minHeight: Layout.minTouchTargetSize,
  },
  segmentCardCompact: { padding: 8, minHeight: 40, borderRadius: 10, gap: 8 },
  segmentCardActive: {
    borderColor: Theme.analyticsHeroBg,
    backgroundColor: "rgba(43,49,113,0.06)",
  },
  segmentCardDisabled: { opacity: 0.45 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterActive: { borderColor: Theme.analyticsHeroBg },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.analyticsHeroBg,
  },
  segmentTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  segmentTitleCompact: { fontSize: 12 },
  segmentHintCompact: { fontSize: 10, marginTop: 1 },
  segmentTitleActive: { color: Theme.analyticsHeroBg },
  segmentHint: {
    marginTop: 2,
    fontSize: 12,
    color: Theme.textMuted,
  },
  fields: { gap: 12 },
  fieldsCompact: { gap: 8 },
  dateTimeRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
  },
  dateTimeCol: {
    flex: 1,
    minWidth: 0,
  },
  sharedDocketHint: {
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textMuted,
  },
  lrPickerHint: {
    fontSize: 12,
    lineHeight: 16,
    color: Theme.textSecondary,
  },
  lrPickerList: {
    maxHeight: 220,
  },
  lrPickerListContent: {
    gap: 6,
  },
  lrPickerEmpty: {
    fontSize: 12,
    color: Theme.textMuted,
  },
  lrPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  lrPickerRowSelected: {
    borderColor: Theme.analyticsHeroBg,
    backgroundColor: Theme.surface,
  },
  lrCheck: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  lrCheckSelected: {
    borderColor: Theme.buttonDark,
    backgroundColor: Theme.buttonDark,
  },
  lrPickerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  lrPickerLr: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  lrPickerTrip: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
  },
  lrStatusReceived: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.complianceStageSuccessFg,
  },
  lrStatusPending: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.complianceStagePendingFg,
  },
  lrMap: { gap: 8 },
  lrMapCard: {
    gap: 6,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.surface,
  },
  lrMapPair: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  lrMapLabel: {
    width: 108,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  lrMapValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  field: { gap: 6 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  req: { color: Theme.warning },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Theme.textPrimaryDark,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  inputEmphasize: {
    borderColor: Theme.analyticsHeroBg,
    borderWidth: 1.5,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  inputError: { borderColor: Theme.warning },
  courierSelect: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  courierValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  courierPlaceholder: {
    color: Theme.textMuted,
  },
  courierBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  courierSheet: {
    maxHeight: "70%",
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  courierSheetTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Theme.textMuted,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  courierOption: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  courierOptionActive: {
    backgroundColor: Theme.surfaceGray,
  },
  courierOptionText: {
    fontSize: 15,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  courierOptionTextActive: {
    color: Theme.analyticsHeroBg,
  },
  errorText: {
    fontSize: 11,
    color: Theme.warning,
    fontWeight: "600",
  },
  detailRow: { gap: 2 },
  detailLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  detailValueEmphasize: {
    fontSize: 15,
    fontWeight: "800",
    color: Theme.analyticsHeroBg,
    letterSpacing: 0.4,
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  footerCompact: { gap: 8, paddingHorizontal: 10, paddingTop: 8 },
  btnCompact: { minHeight: 36 },
  primaryBtn: {
    minHeight: Layout.minTouchTargetSize,
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  footerPrimary: { flex: 1.2 },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonPrimaryText,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: Layout.minTouchTargetSize,
    borderRadius: Theme.buttonPrimaryRadius,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  btnDisabled: { opacity: 0.5 },
});
