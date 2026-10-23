import Layout from "@/constants/Layout";
import { Theme } from "@/constants/Theme";
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
} from "react-native";
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

function isoFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromIso(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T12:00:00`);
  return new Date();
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

function monthCells(year: number, month: number): Array<{
  iso: string;
  day: number;
  inMonth: boolean;
}> {
  const firstWeekday = new Date(year, month, 1).getDay();
  const gridStart = new Date(year, month, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
    );
    return {
      iso: isoFromDate(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
}

export function CompactValidTillCalendar({
  selectedIso,
  onSelect,
}: {
  selectedIso: string;
  onSelect: (iso: string) => void;
}) {
  const pivot = selectedIso ? dateFromIso(selectedIso) : new Date();
  const [year, setYear] = useState(pivot.getFullYear());
  const [month, setMonth] = useState(pivot.getMonth());
  const cells = useMemo(() => monthCells(year, month), [year, month]);
  const todayIso = isoFromDate(new Date());

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  return (
    <View style={styles.compactCal}>
      <View style={styles.compactCalHeader}>
        <TouchableOpacity
          style={styles.compactCalNav}
          onPress={() => shiftMonth(-1)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={{
            top: Layout.touchTargetHitSlop,
            bottom: Layout.touchTargetHitSlop,
            left: Layout.touchTargetHitSlop,
            right: Layout.touchTargetHitSlop,
          }}
        >
          <Feather name="chevron-left" size={14} color={Theme.primary} />
        </TouchableOpacity>
        <Text style={styles.compactCalMonth}>{monthLabel(year, month)}</Text>
        <TouchableOpacity
          style={styles.compactCalNav}
          onPress={() => shiftMonth(1)}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={{
            top: Layout.touchTargetHitSlop,
            bottom: Layout.touchTargetHitSlop,
            left: Layout.touchTargetHitSlop,
            right: Layout.touchTargetHitSlop,
          }}
        >
          <Feather name="chevron-right" size={14} color={Theme.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.compactCalWeek}>
        {WEEKDAYS.map((day) => (
          <Text key={day} style={styles.compactCalWeekText}>
            {day}
          </Text>
        ))}
      </View>
      <View style={styles.compactCalGrid}>
        {cells.map((cell) => {
          const selected = cell.iso === selectedIso;
          const today = cell.iso === todayIso;
          return (
            <TouchableOpacity
              key={cell.iso}
              style={[
                styles.compactCalDay,
                selected && styles.compactCalDaySelected,
              ]}
              onPress={() => onSelect(cell.iso)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${cell.iso}`}
            >
              <Text
                style={[
                  styles.compactCalDayText,
                  !cell.inMonth && styles.compactCalDayMuted,
                  today && !selected && styles.compactCalDayToday,
                  selected && styles.compactCalDayTextSelected,
                ]}
              >
                {cell.day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function EwayBillLrStrip({
  rows,
  onView,
  onUpload,
  canUpload,
  canEdit,
  onSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  /** Phone: 7 columns leave ~40pt per text column, so each row becomes a card. */
  const compact = windowWidth < 560;
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
    setDraft(rowToDraft(row));
    setEditingIndex(row.id === EMPTY_ROW.id ? "new" : row.entryIndex);
    setShowDatePicker(null);
    setEditing(true);
  };

  const openAdd = () => {
    setDraft({ ...EMPTY_EWAY_FIELD_VALUES });
    setEditingIndex("new");
    setShowDatePicker(null);
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

  const hitSlop = {
    top: Layout.touchTargetHitSlop,
    bottom: Layout.touchTargetHitSlop,
    left: Layout.touchTargetHitSlop,
    right: Layout.touchTargetHitSlop,
  };

  const renderActions = (row: EwayBillStripRow) => (
    <>
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
          hitSlop={hitSlop}
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
        hitSlop={hitSlop}
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
          hitSlop={hitSlop}
        >
          <Feather name="edit-2" size={15} color={Theme.primary} />
        </TouchableOpacity>
      ) : null}
    </>
  );

  const renderExpiry = (row: EwayBillStripRow) => {
    const expiry = ewayExpiryLabel(row.validTill);
    if (!expiry) return null;
    const expiryTone = ewayExpiryTone(expiry);
    return (
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
    );
  };

  return (
    <View style={styles.wrap} accessibilityLabel="E-way bill">
      {compact ? (
        <View style={styles.table}>
          <View style={styles.header}>
            <Text style={styles.headCell}>E-way bill</Text>
          </View>
          {displayRows.map((row) => (
            <View key={row.id} style={styles.compactRow}>
              <View style={styles.compactTop}>
                <View style={styles.compactNumber}>
                  <Text style={styles.compactLabel}>E-way No</Text>
                  <Text style={styles.compactNumberText} numberOfLines={1}>
                    {row.ewayNo}
                  </Text>
                </View>
                <View style={styles.compactActions}>{renderActions(row)}</View>
              </View>
              <View style={styles.compactFields}>
                <View style={styles.compactField}>
                  <Text style={styles.compactLabel}>Created date</Text>
                  <Text style={styles.cell} numberOfLines={1}>
                    {row.createdDate}
                  </Text>
                </View>
                <View style={styles.compactField}>
                  <Text style={styles.compactLabel}>Valid till</Text>
                  <Text style={styles.cell} numberOfLines={1}>
                    {row.validTill}
                  </Text>
                  {renderExpiry(row)}
                </View>
                <View style={styles.compactField}>
                  <Text style={styles.compactLabel}>Doc No</Text>
                  <Text style={styles.cell} numberOfLines={1}>
                    {row.docNo}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
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
      )}
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
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Created date</Text>
              <Pressable
                style={styles.dateField}
                onPress={() => {
                  if (saving) return;
                  setShowDatePicker((open) =>
                    open === "createdDate" ? null : "createdDate",
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel="Pick created date"
              >
                <View style={styles.dateFieldInner}>
                  <Text
                    style={
                      draft.createdDate
                        ? styles.dateFieldText
                        : styles.dateFieldPlaceholder
                    }
                    numberOfLines={1}
                  >
                    {draft.createdDate || "Pick date"}
                  </Text>
                  <Feather name="calendar" size={16} color={Theme.primary} />
                </View>
              </Pressable>
              {showDatePicker === "createdDate" ? (
                <CompactValidTillCalendar
                  selectedIso={createdDateIso}
                  onSelect={(iso) => {
                    applyDraftDate("createdDate", iso);
                    setShowDatePicker(null);
                  }}
                />
              ) : null}
            </View>
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Valid till</Text>
              <Pressable
                style={styles.dateField}
                onPress={() => {
                  if (saving) return;
                  setShowDatePicker((open) =>
                    open === "validTill" ? null : "validTill",
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel="Pick valid till date"
              >
                <View style={styles.dateFieldInner}>
                  <Text
                    style={
                      draft.validTill
                        ? styles.dateFieldText
                        : styles.dateFieldPlaceholder
                    }
                    numberOfLines={1}
                  >
                    {draft.validTill || "Pick date"}
                  </Text>
                  <Feather name="calendar" size={16} color={Theme.primary} />
                </View>
              </Pressable>
              {showDatePicker === "validTill" ? (
                <CompactValidTillCalendar
                  selectedIso={validTillIso}
                  onSelect={(iso) => {
                    applyDraftDate("validTill", iso);
                    setShowDatePicker(null);
                  }}
                />
              ) : null}
            </View>
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
  /** Phone card per e-way row (`compact`). */
  compactRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: Theme.borderLight,
  },
  compactTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactNumber: {
    flex: 1,
    minWidth: 0,
  },
  compactNumberText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  compactActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  compactFields: {
    flexDirection: "row",
    gap: 8,
  },
  compactField: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  compactLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Theme.textMuted,
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
  dateField: {
    position: "relative",
    borderWidth: 1.5,
    borderColor: Theme.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: Layout.minTouchTargetSize,
    backgroundColor: Theme.cardWhite,
    justifyContent: "center",
  },
  dateFieldInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dateFieldText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  dateFieldPlaceholder: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  compactCal: {
    alignSelf: "stretch",
    maxWidth: 260,
    borderWidth: 1,
    borderColor: Theme.borderLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: Theme.surface,
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
