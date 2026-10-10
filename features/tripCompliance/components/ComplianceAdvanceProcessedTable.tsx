/**
 * Advance Processed stage — table view. One payment row per trip (supplier bank
 * details, approver, mode, date, amount) with inline Txn Date, Request ID and
 * UTR entry: type in the box, press Enter or ✓. Columns flex to the screen width.
 */
import Theme from "@/constants/Theme";
import { useAdvanceProcessedTable } from "@/features/tripCompliance/hooks/useAdvanceProcessedTable";
import type { AdvanceProcessedEnrichment } from "@/features/tripCompliance/services/complianceAdvanceProcessed.service";
import {
  updateCompliancePaymentReference,
  updateCompliancePaymentRequestId,
  updateCompliancePaymentTransactionDate,
} from "@/features/tripCompliance/services/tripComplianceWrite.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  formatComplianceTxnDate,
  normalizeComplianceTransactionDate,
  toComplianceTransactionDateInput,
  validateComplianceTransactionDate,
} from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import {
  COMPLIANCE_REQUEST_ID_MAX_LENGTH,
  COMPLIANCE_UTR_MAX_LENGTH,
  isCashPaymentMode,
  normalizeComplianceRequestId,
  normalizeComplianceUtr,
  validateComplianceRequestId,
  validateComplianceUtr,
} from "@/features/tripCompliance/utils/compliancePaymentReference.util";
import { latestDocNumber } from "@/features/tripCompliance/utils/complianceVerifiedExport.util";
import { getTripDisplayNumber } from "@/features/trips/services/trips.service";
import { formatIndianVehicleNumber } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, Check, Pencil } from "lucide-react-native";
import React, { createElement, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type EditField = "txnDate" | "requestId" | "utr";

const FIELD_CONFIG: Record<
  EditField,
  {
    placeholder: string;
    maxLength: number;
    normalize: (value: string) => string;
    validate: (value: string) => string | null;
    label: string;
    upperCase?: boolean;
  }
> = {
  txnDate: {
    placeholder: "YYYY-MM-DD",
    maxLength: 10,
    normalize: normalizeComplianceTransactionDate,
    validate: validateComplianceTransactionDate,
    label: "Txn Date",
  },
  requestId: {
    placeholder: "Request ID",
    maxLength: COMPLIANCE_REQUEST_ID_MAX_LENGTH,
    normalize: normalizeComplianceRequestId,
    validate: validateComplianceRequestId,
    label: "Request ID",
    upperCase: true,
  },
  utr: {
    placeholder: "Type UTR",
    maxLength: COMPLIANCE_UTR_MAX_LENGTH,
    normalize: normalizeComplianceUtr,
    validate: validateComplianceUtr,
    label: "UTR",
    upperCase: true,
  },
};

const COL = {
  trip: { flex: 1.25, minWidth: 0 },
  lr: { flex: 0.6, minWidth: 0 },
  truck: { flex: 0.85, minWidth: 0 },
  payType: { flex: 0.65, minWidth: 0 },
  supplier: { flex: 1.1, minWidth: 0 },
  approved: { flex: 0.8, minWidth: 0 },
  beneficiary: { flex: 1.1, minWidth: 0 },
  bank: { flex: 0.85, minWidth: 0 },
  ifsc: { flex: 0.85, minWidth: 0 },
  account: { flex: 0.95, minWidth: 0 },
  branch: { flex: 0.8, minWidth: 0 },
  mode: { flex: 0.55, minWidth: 0 },
  date: { flex: 1.05, minWidth: 132 },
  amount: { flex: 0.75, minWidth: 0 },
  requestId: { flex: 1.0, minWidth: 104 },
  utr: { flex: 1.15, minWidth: 120 },
} satisfies Record<string, ViewStyle>;

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function HeaderCell({ label, style, align, accent }: { label: string; style: ViewStyle; align?: "right"; accent?: boolean }) {
  return (
    <View style={[styles.cell, styles.headerCell, style, accent && styles.headerAccent]}>
      <Text
        style={[styles.headerText, align === "right" && styles.alignRight, accent && styles.headerAccentText]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

function Cell({
  style,
  value,
  sub,
  loading,
  align,
  strong,
  mono,
}: {
  style: ViewStyle;
  value: string;
  sub?: string | null;
  loading?: boolean;
  align?: "right";
  strong?: boolean;
  mono?: boolean;
}) {
  const empty = !value;
  return (
    <View style={[styles.cell, style]}>
      <Text
        style={[
          styles.cellText,
          strong && styles.cellStrong,
          mono && styles.cellMono,
          empty && styles.cellEmpty,
          align === "right" && styles.alignRight,
        ]}
        numberOfLines={2}
        selectable={!empty}
      >
        {loading && empty ? "…" : value || "—"}
      </Text>
      {sub ? (
        <Text style={[styles.cellSub, align === "right" && styles.alignRight]} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

function Checkbox({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.selectCell}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Check size={10} color={Theme.cardWhite} strokeWidth={3} /> : null}
      </View>
    </TouchableOpacity>
  );
}

type EditState = { draft: string; saving: boolean; error: string | null; editing: boolean };
const EMPTY_EDIT: EditState = { draft: "", saving: false, error: null, editing: false };

function parseTxnDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  return new Date();
}

function toTxnIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Compact calendar date control for the Txn Date column (native picker on web). */
function TxnDateCell({
  style,
  saved,
  state,
  disabledLabel,
  onCommit,
  onEdit,
}: {
  style: ViewStyle;
  saved: string;
  state: EditState | undefined;
  disabledLabel: string | null;
  onCommit: (iso: string) => void;
  onEdit: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<string>("");
  const displaySaved = formatComplianceTxnDate(saved);
  const draft = state?.editing ? state.draft : saved;
  const isoValue = /^\d{4}-\d{2}-\d{2}$/.test(draft) ? draft : "";
  const saving = Boolean(state?.saving);
  const showPicker = Boolean(state?.editing) || !saved;

  if (disabledLabel) {
    return (
      <View style={[styles.cell, style]}>
        <Text style={styles.editDisabled} numberOfLines={2}>
          {disabledLabel}
        </Text>
      </View>
    );
  }

  if (!showPicker && saved) {
    return (
      <View style={[styles.cell, style]}>
        <TouchableOpacity
          style={styles.txnDateSaved}
          onPress={onEdit}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Txn Date ${displaySaved}. Edit`}
        >
          <Text style={styles.txnDateValue} numberOfLines={1} selectable>
            {displaySaved}
          </Text>
          <Pencil size={11} color={Theme.textMuted} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    );
  }

  const commit = (next: string) => {
    const normalized = normalizeComplianceTransactionDate(next);
    if (!normalized || validateComplianceTransactionDate(normalized)) return;
    onCommit(normalized);
  };

  return (
    <View style={[styles.cell, style]}>
      {Platform.OS === "web" ? (
        <View style={[styles.txnDateShell, state?.error ? styles.txnDateShellError : null, saving && styles.txnDateShellBusy]}>
          {createElement("input", {
            type: "date",
            value: isoValue,
            disabled: saving,
            lang: "en-IN",
            "aria-label": "Txn Date",
            onChange: (e: { target?: { value?: string } }) => {
              const next = String(e?.target?.value ?? "");
              if (next) commit(next);
            },
            style: {
              flex: 1,
              width: "100%",
              minWidth: 0,
              boxSizing: "border-box",
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: "16px",
              color: Theme.textPrimaryDark,
              fontFamily:
                'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              padding: 0,
              margin: 0,
              minHeight: 18,
              cursor: saving ? "default" : "pointer",
            },
          })}
          {saving ? (
            <ActivityIndicator size="small" color={Theme.textMuted} />
          ) : (
            <Calendar size={12} color={Theme.textMuted} strokeWidth={2.2} />
          )}
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => {
              if (saving) return;
              setIosDraft(isoValue || toTxnIsoDate(new Date()));
              setPickerOpen(true);
            }}
            style={({ pressed }) => [
              styles.txnDateShell,
              state?.error ? styles.txnDateShellError : null,
              saving && styles.txnDateShellBusy,
              pressed && { opacity: 0.9 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Txn Date"
          >
            <Text style={[styles.txnDatePlaceholder, isoValue ? styles.txnDateValue : null]} numberOfLines={1}>
              {isoValue ? formatComplianceTxnDate(isoValue) : "dd/mm/yyyy"}
            </Text>
            {saving ? (
              <ActivityIndicator size="small" color={Theme.textMuted} />
            ) : (
              <Calendar size={12} color={Theme.textMuted} strokeWidth={2.2} />
            )}
          </Pressable>
          {pickerOpen && Platform.OS === "android" ? (
            <DateTimePicker
              value={parseTxnDate(isoValue)}
              mode="date"
              display="default"
              onChange={(e, date) => {
                setPickerOpen(false);
                if (e.type === "set" && date) commit(toTxnIsoDate(date));
              }}
            />
          ) : null}
          {Platform.OS === "ios" ? (
            <Modal visible={pickerOpen} transparent animationType="slide">
              <Pressable style={styles.txnDateBackdrop} onPress={() => setPickerOpen(false)}>
                <View style={styles.txnDateSheet} onStartShouldSetResponder={() => true}>
                  <View style={styles.txnDateSheetHeader}>
                    <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                      <Text style={styles.txnDateSheetMuted}>Cancel</Text>
                    </Pressable>
                    <Text style={styles.txnDateSheetTitle}>Txn Date</Text>
                    <Pressable
                      onPress={() => {
                        commit(iosDraft || toTxnIsoDate(new Date()));
                        setPickerOpen(false);
                      }}
                      hitSlop={10}
                    >
                      <Text style={styles.txnDateSheetDone}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={parseTxnDate(iosDraft || isoValue)}
                    mode="date"
                    display="spinner"
                    onChange={(_, date) => date && setIosDraft(toTxnIsoDate(date))}
                  />
                </View>
              </Pressable>
            </Modal>
          ) : null}
        </>
      )}
      {state?.error ? (
        <Text style={styles.editError} numberOfLines={2}>
          {state.error}
        </Text>
      ) : null}
    </View>
  );
}

function EditableCell({
  field,
  style,
  saved,
  state,
  disabledLabel,
  onChange,
  onSave,
  onEdit,
  onCommitDate,
}: {
  field: EditField;
  style: ViewStyle;
  saved: string;
  state: EditState | undefined;
  disabledLabel: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onEdit: () => void;
  onCommitDate: (iso: string) => void;
}) {
  const config = FIELD_CONFIG[field];
  const displaySaved = saved;
  if (field === "txnDate") {
    return (
      <TxnDateCell
        style={style}
        saved={saved}
        state={state}
        disabledLabel={disabledLabel}
        onCommit={onCommitDate}
        onEdit={onEdit}
      />
    );
  }
  if (disabledLabel) {
    return (
      <View style={[styles.cell, style]}>
        <Text style={styles.editDisabled} numberOfLines={2}>
          {disabledLabel}
        </Text>
      </View>
    );
  }
  if (!state?.editing && saved) {
    return (
      <View style={[styles.cell, style]}>
        <TouchableOpacity
          style={styles.savedChip}
          onPress={onEdit}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`${config.label} ${displaySaved}. Edit`}
        >
          <View style={styles.savedBody}>
            <Text style={styles.savedValue} numberOfLines={2} selectable>
              {displaySaved}
            </Text>
            <View style={styles.savedTag}>
              <Check size={8} color={Theme.complianceStageSuccessFg} strokeWidth={3} />
              <Text style={styles.savedTagText}>Saved</Text>
            </View>
          </View>
          <Pencil size={10} color={Theme.complianceStageSuccessFg} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    );
  }
  const draft = state?.editing ? state.draft : "";
  const dirty = config.normalize(draft).length > 0 && config.normalize(draft) !== saved;
  const idle = !dirty || Boolean(state?.saving);
  return (
    <View style={[styles.cell, style]}>
      <View style={styles.editLine}>
        <TextInput
          value={draft}
          onChangeText={(text) => onChange(config.upperCase ? text.toUpperCase() : text)}
          onSubmitEditing={onSave}
          placeholder={config.placeholder}
          placeholderTextColor={Theme.textMuted}
          autoCapitalize={config.upperCase ? "characters" : "none"}
          autoCorrect={false}
          spellCheck={false}
          maxLength={config.maxLength}
          editable={!state?.saving}
          returnKeyType="done"
          style={[styles.input, state?.error ? styles.inputError : null] as TextStyle[]}
          accessibilityLabel={config.label}
        />
        <TouchableOpacity
          onPress={onSave}
          disabled={idle}
          style={[styles.saveBtn, idle && styles.saveBtnIdle]}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Save ${config.label}`}
        >
          {state?.saving ? (
            <ActivityIndicator size="small" color={Theme.cardWhite} />
          ) : (
            <Check size={13} color={Theme.cardWhite} strokeWidth={3} />
          )}
        </TouchableOpacity>
      </View>
      {state?.error ? (
        <Text style={styles.editError} numberOfLines={2}>
          {state.error}
        </Text>
      ) : null}
    </View>
  );
}

export function ComplianceAdvanceProcessedTable({
  summaries,
  organizationId,
  onOpenTrip,
  onUtrSaved,
}: {
  summaries: ComplianceTripSummary[];
  organizationId: string;
  onOpenTrip: (tripId: string) => void;
  /** After a UTR / Request ID is saved — refresh that trip's payment inputs. */
  onUtrSaved?: (tripId: string) => void;
}) {
  const queryClient = useQueryClient();
  const rows = useMemo(() => summaries.filter((s) => s.advance), [summaries]);
  const { data: enrichment, isPending } = useAdvanceProcessedTable(organizationId, rows);
  const visibleRows = rows;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  /** Saved values shown until refetched data catches up. */
  const [savedLocal, setSavedLocal] = useState<Record<string, string>>({});
  const [bulkSaving, setBulkSaving] = useState(false);

  const editKey = (tripId: string, field: EditField) => `${tripId}:${field}`;

  const savedValue = useCallback(
    (summary: ComplianceTripSummary, info: AdvanceProcessedEnrichment | undefined, field: EditField) => {
      const local = savedLocal[editKey(summary.trip.id, field)];
      if (local != null) return local;
      if (field === "utr") return (info?.payment?.utr ?? summary.advance?.utr ?? "").trim();
      if (field === "txnDate") {
        // Blank until Ops confirms a date in Compliance (Finance posting day is ignored).
        const payment = info?.payment ?? summary.advance;
        if (!payment?.txnDateConfirmed) return "";
        return toComplianceTransactionDateInput(payment.paidAt);
      }
      return (info?.requestId ?? "").trim();
    },
    [savedLocal],
  );

  const patchEdit = (key: string, patch: Partial<EditState>) =>
    setEdits((cur) => ({ ...cur, [key]: { ...(cur[key] ?? EMPTY_EDIT), ...patch } }));

  const saveField = useCallback(
    async (summary: ComplianceTripSummary, field: EditField, draftOverride?: string) => {
      const tripId = summary.trip.id;
      const key = editKey(tripId, field);
      const info = enrichment?.[tripId];
      const config = FIELD_CONFIG[field];
      const value = config.normalize(draftOverride ?? edits[key]?.draft ?? "");
      const invalid = config.validate(value);
      if (invalid) {
        patchEdit(key, { draft: value, editing: true, error: invalid });
        return false;
      }
      if (!info?.transactionId) {
        patchEdit(key, { draft: value, editing: true, error: "Payment not found. Refresh and try again." });
        return false;
      }
      patchEdit(key, { draft: value, editing: true, saving: true, error: null });
      const target = { tripId, transactionId: info.transactionId, category: info.utrCategory };
      const { error } =
        field === "utr"
          ? await updateCompliancePaymentReference({ ...target, utr: value })
          : field === "txnDate"
            ? await updateCompliancePaymentTransactionDate({ ...target, transactionDate: value })
            : await updateCompliancePaymentRequestId({ ...target, requestId: value });
      if (error) {
        patchEdit(key, { saving: false, error: error.message });
        return false;
      }
      setSavedLocal((cur) => ({ ...cur, [key]: value }));
      patchEdit(key, { saving: false, editing: false, draft: value });
      void queryClient.invalidateQueries({ queryKey: ["q", "tripCompliance", "advanceProcessed"] });
      {
        const { syncFinanceComplianceCaches } = await import(
          "@/lib/queries/syncFinanceComplianceCaches"
        );
        syncFinanceComplianceCaches({
          queryClient,
          organizationId,
          tripId,
          includeCompliance: false, // advanceProcessed + onUtrSaved already cover Compliance
        });
      }
      onUtrSaved?.(tripId);
      return true;
    },
    [edits, enrichment, onUtrSaved, organizationId, queryClient],
  );

  const pendingSelected = visibleRows.flatMap((summary) => {
    if (!selected.has(summary.trip.id)) return [];
    return (["txnDate", "requestId", "utr"] as const)
      .filter((field) => {
        const state = edits[editKey(summary.trip.id, field)];
        if (!state?.editing) return false;
        const draft = FIELD_CONFIG[field].normalize(state.draft);
        return draft.length > 0 && draft !== savedValue(summary, enrichment?.[summary.trip.id], field);
      })
      .map((field) => ({ summary, field }));
  });

  const saveSelected = async () => {
    if (bulkSaving) return;
    setBulkSaving(true);
    for (const { summary, field } of pendingSelected) {
      await saveField(summary, field);
    }
    setBulkSaving(false);
  };

  const allSelected = visibleRows.length > 0 && visibleRows.every((s) => selected.has(s.trip.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visibleRows.map((s) => s.trip.id)));
  const toggle = (tripId: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(tripId)) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
  return (
    <View style={styles.wrap}>
      {selected.size > 0 ? (
      <View style={styles.titleBar}>
          <View style={styles.titleRight}>
            <Text style={styles.titleMuted}>{selected.size} selected</Text>
            <TouchableOpacity
              onPress={() => setSelected(new Set())}
              style={styles.titleGhostBtn}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Clear selection"
            >
              <Text style={styles.titleGhostText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void saveSelected()}
              disabled={pendingSelected.length === 0 || bulkSaving}
              style={[styles.titleSaveBtn, (pendingSelected.length === 0 || bulkSaving) && styles.titleSaveBtnIdle]}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel="Save edits for selected trips"
            >
              {bulkSaving ? (
                <ActivityIndicator size="small" color={Theme.cardWhite} />
              ) : (
                <Text style={styles.titleSaveText}>
                  {pendingSelected.length > 0 ? `Save ${pendingSelected.length}` : "Save"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
      </View>
      ) : null}

      <View style={[styles.row, styles.headerRow]}>
        <View style={styles.rowLead}>
          <Checkbox checked={allSelected} onPress={toggleAll} label="Select all trips" />
        </View>
        <HeaderCell label="Trip ID" style={COL.trip} />
        <HeaderCell label="LR No." style={COL.lr} />
        <HeaderCell label="Truck No." style={COL.truck} />
        <HeaderCell label="Payment Type" style={COL.payType} />
        <HeaderCell label="Supplier Name" style={COL.supplier} />
        <HeaderCell label="Approved By" style={COL.approved} />
        <HeaderCell label="Beneficiary" style={COL.beneficiary} />
        <HeaderCell label="Bank Name" style={COL.bank} />
        <HeaderCell label="IFSC" style={COL.ifsc} />
        <HeaderCell label="Account No." style={COL.account} />
        <HeaderCell label="Account Branch" style={COL.branch} />
        <HeaderCell label="Mode" style={COL.mode} />
        <HeaderCell label="Txn Date" style={COL.date} />
        <HeaderCell label="Amount" style={COL.amount} align="right" />
        <View style={styles.headerAccentGroup}>
          <HeaderCell label="Request ID" style={COL.requestId} accent />
          <HeaderCell label="UTR" style={COL.utr} accent />
        </View>
      </View>

      {visibleRows.map((summary, index) => {
        const trip = summary.trip;
        const tripNumber = getTripDisplayNumber(trip, trip.organization_id ?? null);
        const info = enrichment?.[trip.id];
        const loading = isPending && !info;
        const payment = info?.payment ?? summary.advance!;
        const isSelected = selected.has(trip.id);
        const supplier = info?.supplierName || trip.supplier_name || "";
        const beneficiary = info?.beneficiaryName || supplier;
        const noEntry = !loading && info && !info.transactionId;
        const rowLabel = (field: EditField) =>
          loading ? "Loading…" : noEntry ? "Entry not visible to your org" : field === "utr" && isCashPaymentMode(payment.paymentMode) ? "Cash · no UTR" : null;
        const renderEditable = (field: EditField, style: ViewStyle) => {
          const key = editKey(trip.id, field);
          const saved = savedValue(summary, info, field);
          return (
            <EditableCell
              field={field}
              style={style}
              saved={saved}
              state={edits[key]}
              disabledLabel={rowLabel(field)}
              onChange={(value) => patchEdit(key, { draft: value, error: null, editing: true })}
              onEdit={() => patchEdit(key, { draft: saved, editing: true, error: null })}
              onSave={() => void saveField(summary, field)}
              onCommitDate={(iso) => void saveField(summary, "txnDate", iso)}
            />
          );
        };
        return (
          <View
            key={trip.id}
            style={[styles.row, index % 2 === 1 && styles.rowAlt, isSelected && styles.rowSelected]}
          >
            <View style={styles.rowLead}>
              <Checkbox checked={isSelected} onPress={() => toggle(trip.id)} label={`Select trip ${tripNumber}`} />
            </View>
            <View style={[styles.cell, COL.trip]}>
              <TouchableOpacity onPress={() => onOpenTrip(trip.id)} hitSlop={{ top: 8, bottom: 8 }} accessibilityRole="link">
                <Text style={[styles.cellText, styles.tripLink]} numberOfLines={2}>
                  {tripNumber}
                </Text>
              </TouchableOpacity>
              {trip.client_name ? (
                <Text style={styles.cellSub} numberOfLines={1}>
                  {trip.client_name}
                </Text>
              ) : null}
            </View>
            <Cell style={COL.lr} value={latestDocNumber(summary.documents, "lr")} />
            <Cell
              style={COL.truck}
              value={formatIndianVehicleNumber(trip.vehicle_display_number?.trim() || "").trim()}
              strong
            />
            <Cell style={COL.payType} value="Advance" />
            <Cell style={COL.supplier} value={supplier} loading={loading} />
            <Cell style={COL.approved} value={info?.approvedBy ?? ""} loading={loading} />
            <Cell style={COL.beneficiary} value={beneficiary} loading={loading} />
            <Cell style={COL.bank} value={info?.bankName ?? ""} loading={loading} />
            <Cell style={COL.ifsc} value={info?.ifsc ?? ""} loading={loading} mono />
            <Cell style={COL.account} value={info?.accountNumber ?? ""} loading={loading} mono strong />
            <Cell style={COL.branch} value={info?.branch ?? ""} loading={loading} />
            <Cell style={COL.mode} value={payment.paymentMode?.trim() ?? ""} />
            {renderEditable("txnDate", COL.date)}
            <Cell
              style={COL.amount}
              value={formatInr(summary.advance!.amount)}
              sub={info?.extraReceipts ? `${info.extraReceipts + 1} receipts` : null}
              align="right"
              strong
            />
            {renderEditable("requestId", COL.requestId)}
            {renderEditable("utr", COL.utr)}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    minWidth: 0,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: Theme.compliancePayTableTitleBg,
  },
  titleLeft: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0, flexShrink: 1 },
  title: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Theme.compliancePayTableTitleFg,
  },
  titleCount: {
    minWidth: 20,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePayTableUtrHeaderBg,
  },
  titleCountText: { fontSize: 10, fontWeight: "700", color: Theme.compliancePayTableTitleFg },
  titleMuted: { fontSize: 10, fontWeight: "500", color: Theme.compliancePayTableTitleMuted },
  titleRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  titleGhostBtn: { height: 26, paddingHorizontal: 8, justifyContent: "center" },
  titleGhostText: { fontSize: 10, fontWeight: "700", color: Theme.compliancePayTableTitleFg },
  titleSaveBtn: {
    height: 26,
    minWidth: 64,
    paddingHorizontal: 12,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePayTableUtrHeaderBg,
  },
  titleSaveBtnIdle: { opacity: 0.45 },
  titleSaveText: { fontSize: 10, fontWeight: "700", color: Theme.compliancePayTableTitleFg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: Theme.border,
    borderLeftWidth: 3,
    borderLeftColor: Theme.cardWhite,
    paddingRight: 6,
    gap: 6,
    minHeight: 50,
  },
  rowAlt: { backgroundColor: Theme.compliancePageBg, borderLeftColor: Theme.compliancePageBg },
  rowSelected: {
    backgroundColor: Theme.compliancePayTableRowSelectedBg,
    borderLeftColor: Theme.compliancePayTableRowSelectedBorder,
  },
  headerRow: {
    borderTopWidth: 0,
    backgroundColor: Theme.compliancePageBg,
    borderLeftColor: Theme.compliancePageBg,
    minHeight: 38,
    alignItems: "stretch",
  },
  headerCell: { paddingVertical: 6 },
  headerAccentGroup: {
    flexGrow: COL.requestId.flex + COL.utr.flex,
    flexShrink: 1,
    /** The inner gap sits outside flex in data rows; reserving it keeps columns aligned. */
    flexBasis: 6,
    minWidth: COL.requestId.minWidth + COL.utr.minWidth + 6,
    flexDirection: "row",
    gap: 6,
    marginRight: -6,
    paddingRight: 6,
    backgroundColor: Theme.compliancePayTableUtrHeaderBg,
  },
  headerAccent: { alignItems: "center", paddingHorizontal: 4 },
  headerText: {
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12,
    color: Theme.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  headerAccentText: { color: Theme.compliancePayTableTitleFg, textAlign: "center", letterSpacing: 0.5 },
  cell: { justifyContent: "center", gap: 2, paddingVertical: 6 },
  cellText: { fontSize: 11, lineHeight: 14, fontWeight: "500", color: Theme.textPrimary },
  cellStrong: { fontWeight: "700", color: Theme.textPrimaryDark },
  cellMono: { letterSpacing: 0.2, fontVariant: ["tabular-nums"] },
  cellEmpty: { color: Theme.textMuted, fontWeight: "500" },
  cellSub: { fontSize: 9, lineHeight: 12, fontWeight: "500", color: Theme.textMuted },
  alignRight: { textAlign: "right" },
  tripLink: { fontWeight: "700", color: Theme.complianceBulk },
  rowLead: { flexDirection: "row", alignItems: "stretch", flexShrink: 0 },
  selectCell: { width: 30, alignItems: "center", justifyContent: "center", alignSelf: "stretch" },
  checkbox: {
    width: 15,
    height: 15,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Theme.textMuted,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    borderColor: Theme.compliancePayTableRowSelectedBorder,
    backgroundColor: Theme.compliancePayTableRowSelectedBorder,
  },
  editLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: Theme.textPrimaryDark,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  inputError: { borderColor: Theme.complianceStageDocsFg },
  saveBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.compliancePayTableUtrHeaderBg,
  },
  saveBtnIdle: { opacity: 0.3 },
  editError: { fontSize: 9, lineHeight: 11, fontWeight: "600", color: Theme.complianceStageDocsFg },
  editDisabled: { fontSize: 9, lineHeight: 12, fontWeight: "500", color: Theme.textMuted },
  txnDateShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 30,
    width: "100%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
  },
  txnDateShellError: { borderColor: Theme.complianceStageDocsFg },
  txnDateShellBusy: { opacity: 0.7 },
  txnDatePlaceholder: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: Theme.textMuted,
    letterSpacing: 0.2,
  },
  txnDateSaved: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 30,
    width: "100%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Theme.border,
    backgroundColor: Theme.cardWhite,
  },
  txnDateValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  txnDateBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.35)",
  },
  txnDateSheet: {
    backgroundColor: Theme.cardWhite,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  txnDateSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.border,
  },
  txnDateSheetTitle: { fontSize: 14, fontWeight: "700", color: Theme.textPrimaryDark },
  txnDateSheetMuted: { fontSize: 14, fontWeight: "600", color: Theme.textMuted },
  txnDateSheetDone: { fontSize: 14, fontWeight: "700", color: Theme.complianceBulk },
  savedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.complianceVerifiedPillBorder,
    backgroundColor: Theme.complianceStageSuccessBg,
  },
  savedBody: { flex: 1, minWidth: 0, gap: 1 },
  savedValue: { fontSize: 10, fontWeight: "700", letterSpacing: 0.3, color: Theme.textPrimaryDark },
  savedTag: { flexDirection: "row", alignItems: "center", gap: 2 },
  savedTagText: { fontSize: 8, fontWeight: "700", color: Theme.complianceStageSuccessFg },
});
