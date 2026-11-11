import { DocumentDateCalendar } from "@/components/DocumentDateCalendar";
import {
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import { HUB_MOBILE_COMMERCE_REF } from "@/components/hub/hubMobileTicketTokens";
import Layout from "@/constants/Layout";
import { Theme } from "@/constants/Theme";
import { signCompliancePreviewUrl } from "@/features/tripCompliance/services/complianceDocumentView.service";
import {
  formatVaultDocDate,
  isPdfTripDoc,
  vaultDocDateToIso,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import { EwayBillZoomPreview } from "@/features/trips/components/trip-detail/EwayBillZoomPreview";
import { VaultDocThumb } from "@/features/trips/components/trip-detail/VaultDocThumb";
import { isInlinePreviewUri } from "@/features/trips/utils/storagePreviewObjectUrl.util";
import {
  buildEwayBillStripRows,
  clampEwayBillNumber,
  EMPTY_EWAY_FIELD_VALUES,
  EWAY_BILL_NUMBER_MAX_DIGITS,
  ewayExpiryLabel,
  ewayExpiryTone,
  isEwayBillMetaPath,
  type EwayBillStripRow,
  type EwayFieldValues,
} from "@/features/trips/services/ewayBillFields.util";
import { fetchAdjustmentActorNames } from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentAddedLog.util";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { formatLedgerDateTime } from "@/lib/format";
import Feather from "@expo/vector-icons/Feather";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SHOP = HUB_MOBILE_COMMERCE_REF;

const WEB_POINTER: ViewStyle | null =
  Platform.OS === "web" ? ({ cursor: "pointer" } as ViewStyle) : null;

const HUG_BTN: ViewStyle = {
  alignSelf: "flex-start",
  flexGrow: 0,
  flexShrink: 0,
  minWidth: 0,
  width: "auto",
};

const WEB_COPY =
  Platform.OS === "web"
    ? ({ whiteSpace: "pre-wrap", letterSpacing: 0 } as const)
    : ({ letterSpacing: 0 } as const);

export { buildEwayBillStripRows };
export type { EwayBillStripRow, EwayFieldValues };

type Props = {
  rows: EwayBillStripRow[];
  onView: (rowId: string) => void;
  /** Upload e-way bill PDF/image — shown immediately before the View (eye) icon. */
  onUpload?: (rowId: string) => void;
  canUpload?: boolean;
  canEdit?: boolean;
  onSave?: (values: EwayFieldValues[]) => Promise<boolean>;
  /** Delete the uploaded file for this row so a correct bill can be added. */
  onRemoveDocument?: (row: EwayBillStripRow) => void;
  /** Same notification card on phone and desktop. Pass `table` only for the old grid. */
  variant?: "table" | "feed";
  compact?: boolean;
};

const EMPTY_ROW: EwayBillStripRow = {
  id: "eway-empty",
  entryIndex: 0,
  ewayNo: "—",
  createdDate: "—",
  validTill: "—",
  docNo: "—",
  canView: false,
  updatedAt: null,
  updatedById: null,
  previewPath: null,
  previewUri: null,
  previewFileName: null,
  previewMime: null,
};

function ewayUpdateTimeLabel(iso?: string | null): string {
  const stamp = formatLedgerDateTime(iso);
  return stamp === "—" ? "" : stamp;
}

function EwayTinyPreview({
  row,
  organizationId,
  onPress,
  width,
  height,
}: {
  row: EwayBillStripRow;
  organizationId?: string | null;
  onPress: () => void;
  width: number;
  height: number;
}) {
  const readyUri = row.previewUri?.trim() || "";
  const storagePath = row.previewPath?.trim() || "";
  const [uri, setUri] = useState<string | null>(readyUri || null);
  const [pending, setPending] = useState(!readyUri && !!storagePath);

  useEffect(() => {
    const ready = row.previewUri?.trim() || "";
    if (ready) {
      setUri(ready);
      setPending(false);
      return;
    }
    const path = row.previewPath?.trim() || "";
    if (!path || path.startsWith("ref:")) {
      setUri(null);
      setPending(false);
      return;
    }
    if (isInlinePreviewUri(path)) {
      setUri(path);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    void signCompliancePreviewUrl({
      storagePath: path,
      source: "trip",
      organizationId,
    }).then((signed) => {
      if (cancelled) return;
      setUri(signed);
      setPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId, row.previewPath, row.previewUri]);

  const pdf = isPdfTripDoc({
    fileName: row.previewFileName,
    mimeType: row.previewMime,
    storagePath: row.previewPath,
  });

  return (
    <Pressable
      onPress={onPress}
      style={[styles.tinyPreview, { width, height }]}
      accessibilityRole="button"
      accessibilityLabel={`Preview e-way bill${row.ewayNo !== "—" ? ` ${row.ewayNo}` : ""}`}
    >
      {uri ? (
        <VaultDocThumb
          uri={uri}
          isPdf={pdf}
          fileName={row.previewFileName}
          sizing="cover"
          style={styles.tinyThumb}
        />
      ) : pending ? (
        <View style={styles.tinyLoading}>
          <ActivityIndicator size="small" color={Theme.actionBtnInk} />
        </View>
      ) : (
        <View style={styles.tinyFallback}>
          <Feather name="file-text" size={18} color={SHOP.muted} />
        </View>
      )}
    </Pressable>
  );
}

function displayToDraft(value: string): string {
  return value === "—" ? "" : value;
}

function rowToDraft(row: EwayBillStripRow): EwayFieldValues {
  return {
    ewayNo: clampEwayBillNumber(displayToDraft(row.ewayNo)),
    createdDate: displayToDraft(row.createdDate),
    validTill: displayToDraft(row.validTill),
    docNo: displayToDraft(row.docNo),
  };
}

function rowsToEntries(rows: EwayBillStripRow[]): EwayFieldValues[] {
  return rows
    .filter((row) => row.id !== EMPTY_ROW.id)
    .map(rowToDraft)
    .filter(
      (entry) =>
        entry.ewayNo || entry.createdDate || entry.validTill || entry.docNo,
    );
}

function toIsoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyEwayDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function ewayRemainingLabel(iso: string): string {
  const target = new Date(`${iso}T12:00:00`).getTime();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const remaining = Math.round((target - today.getTime()) / 86_400_000);
  if (remaining < 0) return "Already expired";
  if (remaining === 0) return "Expires today";
  if (remaining === 1) return "Valid for 1 day";
  if (remaining < 60) return `Valid for ${remaining} days`;
  return `Valid for ${Math.round(remaining / 30)} months`;
}

function addDaysIso(fromIso: string, days: number): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(fromIso)
    ? new Date(`${fromIso}T12:00:00`)
    : new Date();
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

const VALID_TILL_SPANS = [
  { id: "1d", label: "1 day", days: 1 },
  { id: "3d", label: "3 days", days: 3 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "15d", label: "15 days", days: 15 },
] as const;

export function CompactValidTillCalendar({
  selectedIso,
  onSelect,
  minDate,
  maxDate,
}: {
  selectedIso: string;
  onSelect: (iso: string) => void;
  minDate?: string;
  maxDate?: string;
}) {
  return (
    <View style={styles.compactCal}>
      <DocumentDateCalendar
        selectedIso={selectedIso}
        minDate={minDate}
        maxDate={maxDate}
        onSelect={onSelect}
      />
    </View>
  );
}

function EwayDatePreviewField({
  label,
  emptyHint,
  selectedIso,
  open,
  onToggle,
  onSelect,
  minDate,
  maxDate,
  chips,
}: {
  label: string;
  emptyHint: string;
  selectedIso: string;
  open: boolean;
  onToggle: () => void;
  onSelect: (iso: string) => void;
  minDate?: string;
  maxDate?: string;
  chips?: readonly { id: string; label: string; days: number }[];
}) {
  const pretty = prettyEwayDate(selectedIso);
  const hasDate = Boolean(pretty);
  const calendarIso = selectedIso || toIsoToday();

  return (
    <View style={styles.datePreviewCard}>
      <Pressable
        onPress={onToggle}
        style={styles.datePreviewHead}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${pretty || emptyHint}`}
      >
        <View style={styles.datePreviewIcon}>
          <Feather name="calendar" size={16} color={Theme.brandBlueInk} />
        </View>
        <View style={styles.datePreviewCopy}>
          <Text style={[styles.datePreviewLabel, WEB_COPY]}>{label}</Text>
          <Text
            style={[styles.datePreviewValue, WEB_COPY, !hasDate && styles.datePreviewEmpty]}
            numberOfLines={1}
          >
            {pretty || emptyHint}
          </Text>
          {hasDate && label === "Valid till" ? (
            <Text style={[styles.datePreviewMeta, WEB_COPY]}>
              {ewayRemainingLabel(selectedIso)}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.datePreviewToggle, WEB_COPY]}>{open ? "Hide" : "Adjust"}</Text>
      </Pressable>
      {open ? (
        <View style={styles.datePreviewBody}>
          {chips && chips.length > 0 ? (
            <View style={styles.dateChipRow}>
              {chips.map((chip) => {
                const chipIso = addDaysIso(minDate || toIsoToday(), chip.days);
                const active = selectedIso === chipIso;
                return (
                  <Pressable
                    key={chip.id}
                    onPress={() => onSelect(chipIso)}
                    style={[styles.dateChip, active && styles.dateChipActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${label} ${chip.label}`}
                  >
                    <Text style={[styles.dateChipText, WEB_COPY, active && styles.dateChipTextActive]}>
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <CompactValidTillCalendar
            selectedIso={calendarIso}
            minDate={minDate}
            maxDate={maxDate}
            onSelect={onSelect}
          />
        </View>
      ) : null}
    </View>
  );
}

function ewayOrderStatus(
  row: EwayBillStripRow,
  expiry: string | null,
  expiryTone: ReturnType<typeof ewayExpiryTone>,
): { label: string; color: string; soft: string } {
  if (expiryTone === "expired") {
    return { label: "Expired", color: SHOP.danger, soft: SHOP.dangerSoft };
  }
  if (expiryTone === "soon" || expiry) {
    return { label: "Expiring", color: SHOP.warning, soft: SHOP.warningSoft };
  }
  if (row.canView || (row.ewayNo && row.ewayNo !== "—")) {
    return { label: "On file", color: SHOP.success, soft: SHOP.successSoft };
  }
  return { label: "Pending", color: SHOP.warning, soft: SHOP.warningSoft };
}

export function EwayBillLrStrip({
  rows,
  onView: _onView,
  onUpload,
  canUpload,
  canEdit,
  onSave,
  onRemoveDocument,
  variant = "feed",
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { currentOrganization } = useOrganization();
  const auth = useAuth();
  const currentUserId = auth.user?.uid ?? auth.profile?.uid ?? null;
  const currentUserName =
    auth.profile?.full_name?.trim() ||
    auth.profile?.displayName?.trim() ||
    auth.user?.displayName?.trim() ||
    null;
  const desktopSheet = windowWidth >= 640;
  const displayRows = rows.length > 0 ? rows : [EMPTY_ROW];
  const updaterIds = useMemo(
    () => displayRows.map((row) => row.updatedById),
    [displayRows],
  );
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const ids = updaterIds.filter((id): id is string => Boolean(id?.trim()));
    if (ids.length === 0) {
      setActorNames({});
      return;
    }
    void fetchAdjustmentActorNames(ids, currentOrganization?.id).then((map) => {
      if (!cancelled) setActorNames(map);
    });
    return () => {
      cancelled = true;
    };
  }, [updaterIds, currentOrganization?.id]);

  const resolveUpdaterName = (row: EwayBillStripRow): string => {
    const id = row.updatedById?.trim();
    if (id && actorNames[id]?.trim()) return actorNames[id].trim();
    if (id && currentUserId === id && currentUserName) return currentUserName;
    if (id) return "Team member";
    return "";
  };
  const showEdit = !!canEdit && !!onSave;
  const showUpload = !!canUpload && !!onUpload;
  const [zoomRow, setZoomRow] = useState<EwayBillStripRow | null>(null);
  const openZoomPreview = (row: EwayBillStripRow) => {
    if (!row.canView && !row.previewPath?.trim() && !row.previewUri?.trim()) return;
    setZoomRow(row);
  };
  const [editing, setEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | "new">(0);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<
    null | "createdDate" | "validTill"
  >(null);
  const [draft, setDraft] = useState<EwayFieldValues>({
    ...EMPTY_EWAY_FIELD_VALUES,
  });
  const createdDateIso = vaultDocDateToIso(draft.createdDate) ?? "";
  const validTillIso = vaultDocDateToIso(draft.validTill) ?? "";
  const existingEntries = rowsToEntries(displayRows);
  const canRemove =
    editingIndex !== "new" && existingEntries.length > 1;

  const applyDraftDate = (field: "createdDate" | "validTill", iso: string) => {
    setDraft((prev) => ({
      ...prev,
      [field]: formatVaultDocDate(iso) ?? iso,
    }));
  };

  const openEditor = (row: EwayBillStripRow) => {
    const next = rowToDraft(row);
    setDraft(next);
    setEditingIndex(row.id === EMPTY_ROW.id ? "new" : row.entryIndex);
    setShowDatePicker(next.validTill ? null : "validTill");
    setEditing(true);
  };

  const openAdd = () => {
    setDraft({ ...EMPTY_EWAY_FIELD_VALUES });
    setEditingIndex("new");
    setShowDatePicker("validTill");
    setEditing(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setShowDatePicker(null);
    setEditing(false);
  };

  const buildNextEntries = (mode: "save" | "remove"): EwayFieldValues[] => {
    if (mode === "remove") {
      if (editingIndex === "new") return existingEntries;
      return existingEntries.filter((_, index) => index !== editingIndex);
    }
    if (editingIndex === "new") return [...existingEntries, draft];
    if (existingEntries.length === 0) return [draft];
    return existingEntries.map((entry, index) =>
      index === editingIndex ? draft : entry,
    );
  };

  const saveEditor = async (mode: "save" | "remove" = "save") => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      const ok = await onSave(buildNextEntries(mode));
      if (ok) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const feed = variant === "feed";

  return (
    <View
      style={feed ? styles.feedWrap : styles.wrap}
      accessibilityLabel="E-way bill"
    >
      {feed ? (
        <>
          <Text style={[styles.sectionTitle, WEB_COPY]}>E-way Bill</Text>
          <View style={styles.feedGrid}>
          {displayRows.map((row) => {
            const expiry = ewayExpiryLabel(row.validTill);
            const expiryTone = ewayExpiryTone(expiry);
            const status = ewayOrderStatus(row, expiry, expiryTone);
            const hasNumber = Boolean(row.ewayNo && row.ewayNo !== "—");
            const updaterName = resolveUpdaterName(row);
            const updatedAtLabel = ewayUpdateTimeLabel(row.updatedAt);
            const thumbW = desktopSheet ? 64 : 52;
            const thumbH = desktopSheet ? 80 : 68;
            const helper =
              expiry ||
              (row.validTill !== "—" ? `Valid till ${row.validTill}` : null) ||
              "Add the e-way number to continue";
            const canRemoveFile =
              showEdit &&
              !!onRemoveDocument &&
              Boolean(
                row.documentId ||
                  (row.previewPath && !isEwayBillMetaPath(row.previewPath)),
              );
            const helperBlocked = expiryTone === "expired" || expiryTone === "soon";
            return (
              <View key={row.id} style={styles.feedCell}>
              <View style={[styles.orderCard, styles.orderCardGrid, desktopSheet && styles.orderCardDesktop]}>
                <View style={styles.statusRow}>
                  <View style={[styles.statusMark, { backgroundColor: status.soft }]}>
                    <Feather name="check" size={11} color={status.color} />
                  </View>
                  <View style={styles.statusCopy}>
                    <Text style={[styles.statusTitle, WEB_COPY, { color: status.color }]} numberOfLines={1}>
                      {status.label}
                    </Text>
                    <Text style={[styles.statusWhen, WEB_COPY]} numberOfLines={1}>
                      {updatedAtLabel ? `On ${updatedAtLabel}` : "Awaiting update"}
                    </Text>
                  </View>
                </View>

                <View style={styles.productRow}>
                <Pressable
                  onPress={() => {
                    if (row.canView) openZoomPreview(row);
                  }}
                  disabled={!row.canView}
                  style={[styles.productMain, WEB_POINTER]}
                  accessibilityRole={row.canView ? "button" : "none"}
                  accessibilityLabel={
                    hasNumber ? `E-way bill ${row.ewayNo}` : "E-way bill details"
                  }
                >
                  <EwayTinyPreview
                    row={row}
                    organizationId={currentOrganization?.id}
                    onPress={() => {
                      if (row.canView) openZoomPreview(row);
                    }}
                    width={thumbW}
                    height={thumbH}
                  />
                  <View style={styles.productCopy}>
                    <Text style={[styles.productTitle, WEB_COPY]} numberOfLines={1}>
                      {hasNumber ? row.ewayNo : "E-way bill"}
                    </Text>
                    <Text style={[styles.productSub, WEB_COPY]} numberOfLines={1}>
                      {row.docNo !== "—"
                        ? `Doc ${row.docNo}`
                        : "Document number pending"}
                    </Text>
                    <Text style={[styles.productMeta, WEB_COPY]} numberOfLines={1}>
                      {[
                        row.validTill !== "—" ? `Valid till ${row.validTill}` : null,
                        updaterName ? `by ${updaterName}` : null,
                      ]
                        .filter(Boolean)
                        .join("  ·  ") || "Add number and validity"}
                    </Text>
                  </View>
                </Pressable>

                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => openZoomPreview(row)}
                    disabled={!row.canView}
                    style={[
                      styles.actionChip,
                      WEB_POINTER,
                      !row.canView && styles.actionChipDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Preview e-way bill"
                    accessibilityState={{ disabled: !row.canView }}
                  >
                    <Feather
                      name="eye"
                      size={14}
                      color={row.canView ? SHOP.ink : SHOP.muted}
                    />
                    <Text
                      style={[
                        styles.actionChipLabel,
                        WEB_COPY,
                        !row.canView && styles.actionChipLabelMuted,
                      ]}
                    >
                      Preview
                    </Text>
                  </Pressable>
                  {showEdit ? (
                    <Pressable
                      onPress={() => openEditor(row)}
                      style={[styles.actionChip, WEB_POINTER]}
                      accessibilityRole="button"
                      accessibilityLabel="Edit e-way bill details"
                    >
                      <Feather name="edit-2" size={13} color={SHOP.ink} />
                      <Text style={[styles.actionChipLabel, WEB_COPY]}>Edit</Text>
                    </Pressable>
                  ) : null}
                  {canRemoveFile ? (
                    <Pressable
                      onPress={() => onRemoveDocument?.(row)}
                      style={[styles.actionChip, WEB_POINTER]}
                      accessibilityRole="button"
                      accessibilityLabel="Remove e-way bill"
                    >
                      <Feather name="trash-2" size={13} color={SHOP.ink} />
                      <Text style={[styles.actionChipLabel, WEB_COPY]}>Remove</Text>
                    </Pressable>
                  ) : null}
                  {showUpload ? (
                    <Pressable
                      onPress={() => onUpload?.(row.id)}
                      style={[styles.actionChip, WEB_POINTER]}
                      accessibilityRole="button"
                      accessibilityLabel="Upload e-way bill"
                    >
                      <Feather name="upload" size={13} color={SHOP.ink} />
                      <Text style={[styles.actionChipLabel, WEB_COPY]}>Upload</Text>
                    </Pressable>
                  ) : null}
                </View>
                </View>

                <View style={styles.helperRow}>
                  <Feather
                    name="check"
                    size={12}
                    color={helperBlocked ? status.color : SHOP.success}
                  />
                  <Text
                    style={[
                      styles.helperText,
                      WEB_COPY,
                      helperBlocked && { color: status.color, fontWeight: "600" },
                    ]}
                    numberOfLines={2}
                  >
                    {helper}
                  </Text>
                </View>
              </View>
              </View>
            );
          })}
          </View>
          {showEdit && !editing ? (
            <View style={styles.feedAddRow}>
              <Pressable
                onPress={openAdd}
                style={[styles.addChip, WEB_POINTER]}
                accessibilityRole="button"
                accessibilityLabel="Add e-way number"
              >
                <Feather name="plus" size={14} color={SHOP.ink} />
                <Text style={[styles.addChipLabel, WEB_COPY]}>Add e-way number</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.table}>
            <View style={styles.header}>
              <Text style={[styles.headCell, styles.colEway]}>E-way No</Text>
              <Text style={[styles.headCell, styles.colDate]}>Created date</Text>
              <Text style={[styles.headCell, styles.colDate]}>Valid till</Text>
              <Text style={[styles.headCell, styles.colDoc]}>Doc No</Text>
              {showUpload ? (
                <Text style={[styles.headCell, styles.colAction]}>Upload</Text>
              ) : null}
              <Text style={[styles.headCell, styles.colAction]}>View</Text>
              {showEdit ? (
                <Text style={[styles.headCell, styles.colAction]}>Edit</Text>
              ) : null}
            </View>
            {displayRows.map((row) => {
              const expiry = ewayExpiryLabel(row.validTill);
              const expiryTone = ewayExpiryTone(expiry);
              return (
                <View key={row.id} style={styles.dataRow}>
                  <View style={styles.colEway}>
                    <Text style={styles.cell} numberOfLines={1}>
                      {row.ewayNo}
                    </Text>
                    {ewayUpdateTimeLabel(row.updatedAt) || resolveUpdaterName(row) ? (
                      <Text style={styles.logMeta} numberOfLines={2}>
                        {[
                          ewayUpdateTimeLabel(row.updatedAt),
                          resolveUpdaterName(row)
                            ? `by ${resolveUpdaterName(row)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.cell, styles.colDate]} numberOfLines={1}>
                    {row.createdDate}
                  </Text>
                  <View style={styles.colDate}>
                    <Text style={styles.cell} numberOfLines={1}>
                      {row.validTill}
                    </Text>
                    {expiry ? (
                      <Text
                        style={[
                          styles.expiryText,
                          expiryTone === "ok" && styles.expiryOk,
                          expiryTone === "expired" && styles.expiryExpired,
                        ]}
                        numberOfLines={1}
                      >
                        {expiry}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.cell, styles.colDoc]} numberOfLines={1}>
                    {row.docNo}
                  </Text>
                  {showUpload ? (
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => onUpload?.(row.id)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={
                        row.canView
                          ? `Upload another e-way bill document${row.ewayNo !== "—" ? ` for ${row.ewayNo}` : ""}`
                          : `Upload e-way bill document${row.ewayNo !== "—" ? ` for ${row.ewayNo}` : ""}`
                      }
                      hitSlop={{
                        top: Layout.touchTargetHitSlop,
                        bottom: Layout.touchTargetHitSlop,
                        left: Layout.touchTargetHitSlop,
                        right: Layout.touchTargetHitSlop,
                      }}
                    >
                      <Feather name="upload" size={16} color={Theme.primary} />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={() => openZoomPreview(row)}
                    disabled={!row.canView}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={
                      row.canView
                        ? `Preview uploaded document${row.ewayNo !== "—" ? ` ${row.ewayNo}` : ""}`
                        : "No document to preview"
                    }
                    hitSlop={{
                      top: Layout.touchTargetHitSlop,
                      bottom: Layout.touchTargetHitSlop,
                      left: Layout.touchTargetHitSlop,
                      right: Layout.touchTargetHitSlop,
                    }}
                  >
                    <Feather
                      name="eye"
                      size={16}
                      color={row.canView ? Theme.primary : Theme.textMuted}
                    />
                  </TouchableOpacity>
                  {showEdit ? (
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => openEditor(row)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="Enter e-way bill details"
                      hitSlop={{
                        top: Layout.touchTargetHitSlop,
                        bottom: Layout.touchTargetHitSlop,
                        left: Layout.touchTargetHitSlop,
                        right: Layout.touchTargetHitSlop,
                      }}
                    >
                      <Feather name="edit-2" size={15} color={Theme.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
          {showEdit ? (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={openAdd}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add e-way number"
            >
              <Feather name="plus" size={14} color={Theme.primary} />
              <Text style={styles.addBtnText}>Add e-way number</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}

      <EwayBillZoomPreview
        row={zoomRow}
        organizationId={currentOrganization?.id}
        onClose={() => setZoomRow(null)}
      />

      <Modal
        visible={editing}
        animationType="fade"
        transparent
        onRequestClose={closeEditor}
      >
        <View style={[styles.modalRoot, { minHeight: windowHeight }]}>
          <Pressable style={styles.modalBackdrop} onPress={closeEditor} />
          <KeyboardAvoidingView
            style={styles.modalCenter}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.modalCard,
                desktopSheet ? styles.modalCardDesktop : styles.modalCardPhone,
                {
                  marginTop: Math.max(insets.top, 16),
                  marginBottom: Math.max(insets.bottom, 16),
                  maxHeight:
                    windowHeight -
                    Math.max(insets.top, 16) -
                    Math.max(insets.bottom, 16),
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={[styles.modalTitle, WEB_COPY]}>
                    {editingIndex === "new" ? "Add e-way bill" : "E-way bill"}
                  </Text>
                  <Text style={[styles.modalSubtitle, WEB_COPY]}>
                    Fill these if the number and date did not come from the document.
                  </Text>
                </View>
                <Pressable
                  onPress={closeEditor}
                  disabled={saving}
                  style={styles.modalClose}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close e-way bill editor"
                >
                  <Feather name="x" size={18} color={Theme.textMuted} />
                </Pressable>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalBody}
              >
                <View style={styles.fieldWrap}>
                  <Text style={[styles.fieldLabel, WEB_COPY]}>E-way No</Text>
                  <TextInput
                    style={[styles.fieldInput, WEB_COPY]}
                    value={draft.ewayNo}
                    onChangeText={(ewayNo) =>
                      setDraft((prev) => ({
                        ...prev,
                        ewayNo: clampEwayBillNumber(ewayNo),
                      }))
                    }
                    placeholder="12-digit e-way number"
                    placeholderTextColor={Theme.textMuted}
                    keyboardType="number-pad"
                    maxLength={EWAY_BILL_NUMBER_MAX_DIGITS}
                    autoCorrect={false}
                    editable={!saving}
                  />
                </View>
                <EwayDatePreviewField
                  label="Created date"
                  emptyHint="Issue date on the bill"
                  selectedIso={createdDateIso}
                  open={!saving && showDatePicker === "createdDate"}
                  onToggle={() => {
                    if (saving) return;
                    setShowDatePicker((open) =>
                      open === "createdDate" ? null : "createdDate",
                    );
                  }}
                  onSelect={(iso) => applyDraftDate("createdDate", iso)}
                  maxDate={toIsoToday()}
                />
                <EwayDatePreviewField
                  label="Valid till"
                  emptyHint="When this e-way expires"
                  selectedIso={validTillIso}
                  open={!saving && showDatePicker === "validTill"}
                  onToggle={() => {
                    if (saving) return;
                    setShowDatePicker((open) =>
                      open === "validTill" ? null : "validTill",
                    );
                  }}
                  onSelect={(iso) => applyDraftDate("validTill", iso)}
                  minDate={createdDateIso || toIsoToday()}
                  chips={VALID_TILL_SPANS}
                />
                <View style={styles.fieldWrap}>
                  <Text style={[styles.fieldLabel, WEB_COPY]}>Doc No</Text>
                  <TextInput
                    style={[styles.fieldInput, WEB_COPY]}
                    value={draft.docNo}
                    onChangeText={(docNo) => setDraft((prev) => ({ ...prev, docNo }))}
                    placeholder="E-way document number"
                    placeholderTextColor={Theme.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!saving}
                  />
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                {canRemove ? (
                  <RegistryGhostButton
                    label="Remove"
                    onPress={() => void saveEditor("remove")}
                    disabled={saving}
                    style={HUG_BTN}
                  />
                ) : null}
                <View style={styles.modalActionsEnd}>
                  <RegistryGhostButton
                    label="Cancel"
                    onPress={closeEditor}
                    disabled={saving}
                    style={HUG_BTN}
                  />
                  <RegistryPrimaryButton
                    label={saving ? "Saving" : "Save"}
                    onPress={() => void saveEditor("save")}
                    disabled={saving}
                    style={HUG_BTN}
                  />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignSelf: "stretch",
    marginTop: 10,
    gap: 8,
  },
  feedWrap: {
    width: "100%",
    alignSelf: "stretch",
    gap: 10,
  },
  feedGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
    marginHorizontal: -6,
  },
  feedCell: {
    width: "50%",
    paddingHorizontal: 6,
    paddingBottom: 12,
    minWidth: 0,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: SHOP.ink,
    paddingHorizontal: 2,
    paddingTop: 4,
  },
  orderCard: {
    width: "100%",
  },
  orderCardGrid: {
    flex: 1,
    height: "100%",
    minWidth: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: SHOP.cardRadius,
    borderWidth: 1,
    borderColor: SHOP.hairline,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    ...Platform.select({
      web: { boxShadow: "0 1px 4px rgba(40, 44, 63, 0.06)" } as ViewStyle,
      default: {
        shadowColor: SHOP.ink,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  orderCardDesktop: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusMark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  statusTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  statusWhen: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "400",
    color: SHOP.muted,
  },
  productRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 10,
    minWidth: 0,
  },
  productMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  productCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  productTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: SHOP.ink,
    letterSpacing: -0.15,
    fontVariant: ["tabular-nums"],
  },
  productSub: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
    color: SHOP.muted,
  },
  productMeta: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 8,
  },
  actionChip: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 72,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SHOP.hairline,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 6,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionChipDisabled: {
    opacity: 0.45,
  },
  actionChipLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    color: SHOP.ink,
    textAlign: "center",
  },
  actionChipLabelMuted: {
    color: SHOP.muted,
  },
  helperRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  helperText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: SHOP.ink,
  },
  tinyPreview: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Theme.compliancePreviewCanvas,
    flexShrink: 0,
  },
  tinyThumb: {
    width: "100%",
    height: "100%",
  },
  tinyLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tinyFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePageBg,
  },
  feedAddRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  addChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SHOP.hairline,
    backgroundColor: Theme.cardWhite,
  },
  addChipLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: SHOP.ink,
  },
  table: {
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.brandBlueWashSubtle,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 6,
  },
  headCell: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.primary,
    letterSpacing: 0.2,
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
    minHeight: Layout.minTouchTargetSize,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  addBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 4,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.primary,
  },
  cell: {
    fontSize: 11,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  expiryText: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    color: Theme.warning,
  },
  logMeta: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  expiryOk: {
    color: Theme.positive,
  },
  expiryExpired: {
    color: Theme.negative,
  },
  colEway: {
    flex: 1.1,
    minWidth: 0,
  },
  colDate: {
    flex: 0.95,
    minWidth: 0,
  },
  colDoc: {
    flex: 1,
    minWidth: 0,
  },
  // 48: "Upload" header fits on one line; icons stay centred under their headers.
  colAction: {
    width: 48,
    textAlign: "center",
  },
  iconBtn: {
    width: 48,
    minHeight: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
  },
  modalRoot: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Theme.overlayBackdrop,
  },
  modalCenter: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  modalCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    zIndex: 1,
    gap: 12,
  },
  modalCardPhone: {
    alignSelf: "stretch",
    width: "100%",
  },
  modalCardDesktop: {
    alignSelf: "center",
    width: 440,
    maxWidth: "100%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  modalHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.actionBtnGhostBorder,
    flexShrink: 0,
  },
  modalBody: {
    gap: 12,
    paddingBottom: 4,
  },
  modalTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  modalSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: Theme.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.cardWhite,
    minHeight: Layout.minTouchTargetSize,
  },
  datePreviewCard: {
    borderWidth: 1.5,
    borderColor: Theme.surfaceBorder,
    borderRadius: 14,
    backgroundColor: Theme.brandBlueWashSubtle,
    overflow: "hidden",
  },
  datePreviewHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: Layout.minTouchTargetSize,
  },
  datePreviewIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
    flexShrink: 0,
  },
  datePreviewCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  datePreviewLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  datePreviewValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  datePreviewEmpty: {
    fontWeight: "600",
    color: Theme.textMuted,
  },
  datePreviewMeta: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: Theme.primary,
  },
  datePreviewToggle: {
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: Theme.brandBlueInk,
  },
  datePreviewBody: {
    paddingHorizontal: 10,
    paddingBottom: 12,
    gap: 10,
  },
  dateChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  dateChip: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  dateChipActive: {
    backgroundColor: Theme.accentGold,
    borderColor: Theme.accentGold,
  },
  dateChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  dateChipTextActive: {
    color: Theme.brandBlueInk,
  },
  compactCal: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: Theme.cardWhite,
  },
  compactCalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  compactCalNav: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  compactCalMonth: {
    fontSize: 12,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  compactCalWeek: {
    flexDirection: "row",
    marginBottom: 2,
  },
  compactCalWeekText: {
    flex: 1,
    textAlign: "center",
    fontSize: 9,
    fontWeight: "800",
    color: Theme.textMuted,
  },
  compactCalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  compactCalDay: {
    width: "14.2857%",
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  compactCalDaySelected: {
    backgroundColor: Theme.primary,
  },
  compactCalDayText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  compactCalDayMuted: {
    color: Theme.textMuted,
  },
  compactCalDayToday: {
    color: Theme.primary,
  },
  compactCalDayTextSelected: {
    color: Theme.textOnPrimary,
    fontWeight: "800",
  },
  modalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
  },
  modalActionsEnd: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginLeft: "auto",
  },
});
