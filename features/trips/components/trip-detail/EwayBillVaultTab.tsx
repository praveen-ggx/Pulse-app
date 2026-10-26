import { DocumentDateCalendar } from "@/components/DocumentDateCalendar";
import {
  AlertRegistrySignalCard,
} from "@/components/AlertRegistrySignalCard";
import {
  RegistryCardActions,
  RegistryGhostButton,
  RegistryPrimaryButton,
} from "@/components/AlertRegistryCardActions";
import Layout from "@/constants/Layout";
import { Theme } from "@/constants/Theme";
import type { RegistryStatusTone } from "@/lib/alertRegistry/registryAlertPresentation.util";
import {
  formatVaultDocDate,
  vaultDocDateToIso,
} from "@/features/trips/components/trip-detail/tripDocTypes";
import {
  buildEwayBillStripRows,
  clampEwayBillNumber,
  EMPTY_EWAY_FIELD_VALUES,
  EWAY_BILL_NUMBER_MAX_DIGITS,
  ewayExpiryLabel,
  ewayExpiryTone,
  type EwayBillStripRow,
  type EwayFieldValues,
} from "@/features/trips/services/ewayBillFields.util";
import Feather from "@expo/vector-icons/Feather";
import { useMemo, useState } from "react";
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

const HUG_BTN: ViewStyle = {
  alignSelf: "flex-start",
  flexGrow: 0,
  flexShrink: 0,
  minWidth: 0,
  width: "auto",
};
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  /** Notification cards (vault) vs the legacy table. */
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
};

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
          <Text style={styles.datePreviewLabel}>{label}</Text>
          <Text
            style={[styles.datePreviewValue, !hasDate && styles.datePreviewEmpty]}
            numberOfLines={1}
          >
            {pretty || emptyHint}
          </Text>
          {hasDate && label === "Valid till" ? (
            <Text style={styles.datePreviewMeta}>{ewayRemainingLabel(selectedIso)}</Text>
          ) : null}
        </View>
        <Text style={styles.datePreviewToggle}>{open ? "Hide" : "Adjust"}</Text>
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
                    <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>
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

function ewayStatusPill(
  row: EwayBillStripRow,
  expiry: string | null,
  expiryTone: ReturnType<typeof ewayExpiryTone>,
): { label: string; tone: RegistryStatusTone } {
  if (expiryTone === "expired") return { label: "Expired", tone: "danger" };
  if (expiry) return { label: "Expiring", tone: "warning" };
  if (row.canView || (row.ewayNo && row.ewayNo !== "—")) {
    return { label: "On file", tone: "success" };
  }
  return { label: "Pending", tone: "warning" };
}

export function EwayBillLrStrip({
  rows,
  onView,
  onUpload,
  canUpload,
  canEdit,
  onSave,
  variant = "table",
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const displayRows = rows.length > 0 ? rows : [EMPTY_ROW];
  const showEdit = !!canEdit && !!onSave;
  const showUpload = !!canUpload && !!onUpload;
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
          {displayRows.map((row) => {
            const expiry = ewayExpiryLabel(row.validTill);
            const expiryTone = ewayExpiryTone(expiry);
            const hasNumber = Boolean(row.ewayNo && row.ewayNo !== "—");
            const primaryAdd = () => {
              if (showUpload) {
                onUpload?.(row.id);
                return;
              }
              if (showEdit) openEditor(row);
            };
            return (
              <AlertRegistrySignalCard
                key={row.id}
                variant="feed"
                isUnread={!hasNumber}
                avatar={{
                  name: hasNumber ? row.ewayNo : "E-way bill",
                  entityType: "client",
                  initialsColorSeed: row.id,
                }}
                actorName={hasNumber ? row.ewayNo : "E-way bill"}
                actionText={
                  hasNumber ? "is on file for this trip" : "needs an e-way number"
                }
                detailTitle={hasNumber ? row.ewayNo : "E-way bill"}
                detailSubtitle={
                  [
                    row.docNo !== "—" ? row.docNo : null,
                    row.validTill !== "—" ? `Valid till ${row.validTill}` : null,
                    expiry,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Add the e-way number to continue"
                }
                timeLabel={row.createdDate !== "—" ? row.createdDate : "Vault"}
                contextLabel="Documents"
                statusPill={ewayStatusPill(row, expiry, expiryTone)}
                footer={
                  <RegistryCardActions>
                    <RegistryGhostButton
                      label="Preview"
                      disabled={!row.canView}
                      onPress={() => onView(row.id)}
                      style={HUG_BTN}
                    />
                    {showUpload || showEdit ? (
                      <RegistryPrimaryButton
                        label="Add"
                        onPress={primaryAdd}
                        style={HUG_BTN}
                      />
                    ) : null}
                  </RegistryCardActions>
                }
              />
            );
          })}
          {showEdit ? (
            <View style={styles.feedAddRow}>
              <RegistryPrimaryButton
                label="Add e-way number"
                onPress={openAdd}
                style={HUG_BTN}
              />
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
                  <Text style={[styles.cell, styles.colEway]} numberOfLines={1}>
                    {row.ewayNo}
                  </Text>
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
                    onPress={() => onView(row.id)}
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

      <Modal
        visible={editing}
        animationType="fade"
        transparent
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeEditor} />
          <View
            style={[
              styles.modalCard,
              {
                marginTop: insets.top + Layout.headerPaddingBelowInset,
                marginBottom: insets.bottom + Layout.modalBottomPadding,
                maxHeight:
                  windowHeight -
                  insets.top -
                  insets.bottom -
                  Layout.headerPaddingBelowInset -
                  Layout.modalBottomPadding,
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalBody}
            >
            <Text style={styles.modalTitle}>
              {editingIndex === "new" ? "Add e-way bill" : "E-way bill"}
            </Text>
            <Text style={styles.modalSubtitle}>
              Fill these if the number and date did not come from the document.
            </Text>
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>E-way No</Text>
              <TextInput
                style={styles.fieldInput}
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
              <Text style={styles.fieldLabel}>Doc No</Text>
              <TextInput
                style={styles.fieldInput}
                value={draft.docNo}
                onChangeText={(docNo) => setDraft((prev) => ({ ...prev, docNo }))}
                placeholder="E-way document number"
                placeholderTextColor={Theme.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!saving}
              />
            </View>
            <View style={styles.modalActions}>
              {canRemove ? (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => void saveEditor("remove")}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Remove e-way bill"
                >
                  <Text style={styles.removeBtnText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={closeEditor}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel e-way bill edit"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => void saveEditor("save")}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Save e-way bill details"
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Theme.buttonPrimaryText} />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  },
  feedAddRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.cardWhite,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderLight,
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
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Theme.overlayBackdrop,
  },
  modalCard: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.surfaceBorder,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    zIndex: 1,
  },
  modalBody: {
    gap: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Theme.textPrimaryDark,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    marginTop: -4,
  },
  fieldWrap: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
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
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.textMuted,
  },
  datePreviewValue: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
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
    fontSize: 11,
    fontWeight: "800",
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
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 6,
  },
  cancelBtn: {
    minHeight: Layout.minTouchTargetSize,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  removeBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.teslaRed,
  },
  saveBtn: {
    minHeight: Layout.minTouchTargetSize,
    minWidth: 88,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Theme.buttonPrimaryRadius,
    backgroundColor: Theme.buttonPrimary,
    borderWidth: Theme.buttonPrimaryBorderWidth,
    borderColor: Theme.buttonPrimaryBorder,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: Theme.buttonPrimaryText,
  },
});
