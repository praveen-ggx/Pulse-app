import Theme from "@/constants/Theme";
import {
  guessCompliancePreviewMime,
  signCompliancePreviewUrl,
} from "@/features/tripCompliance/services/complianceDocumentView.service";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import {
  fetchOrganizationPayoutAccounts,
  type OrganizationPayoutAccount,
} from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  isCashPaymentMode,
  normalizeComplianceUtr,
  validateComplianceUtr,
} from "@/features/tripCompliance/utils/compliancePaymentReference.util";
import {
  toComplianceTransactionDateInput,
  validateComplianceTransactionDate,
} from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import { alertMessage } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import { getDocumentChargeConfig } from "@/features/organization/services/documentCharges.service";
import { formatSlabRange } from "@/features/organization/utils/documentChargeSlabs.util";
import {
  COMPLIANCE_DEFAULT_ADVANCE_PERCENT,
  computeCompliancePaymentAmount,
  computeComplianceTdsAmount,
  resolveComplianceDocumentationCharge,
  resolveComplianceTdsRate,
  type ComplianceDocumentChargeConfig,
} from "@/features/tripCompliance/utils/compliancePaymentAmount.util";
import { classifyTripDocument } from "@/features/tripCompliance/utils/tripDocumentClassification.util";
import { formatTruckTypeWithSize } from "@/features/tripCompliance/utils/complianceTruckType.util";
import {
  getVendorOnboardingProfile,
  listSupplierTdsRates,
} from "@/features/suppliers/services/supplierVendorOnboarding.service";
import {
  getSupplierById,
  getSupplierDetails,
} from "@/features/suppliers/services/suppliers.service";
import { financialYearOf } from "@/features/suppliers/utils/supplierVendorOnboarding.util";
import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import {
  getVehicleById,
  getVehicleForTripViewer,
} from "@/features/vehicles/services/vehicles.service";
import { PAYMENT_MODES } from "@/lib/paymentModes";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, Eye } from "lucide-react-native";
import React, { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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

type PaymentTripFacts = TripRow & {
  sale_unit_rate?: number | null;
  sale_rate_basis?: string | null;
  supplier_rate_basis?: string | null;
};

function formatInr(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function supplierCostTotal(trip: PaymentTripFacts): number | null {
  const rate = Number(trip.supplier_rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (trip.supplier_rate_basis === "per_mt") {
    const tons = Number(trip.load_tons);
    if (Number.isFinite(tons) && tons > 0) return rate * tons;
    return null;
  }
  return rate;
}

/** Base supplier freight for this Compliance payment category (Record payment “revised cost”). */
function baseFreightAmount(
  trip: PaymentTripFacts | undefined,
  category: ComplianceLedgerCategory | null,
  advancePaid: number | null | undefined,
): number | null {
  if (!trip) return null;
  const total = supplierCostTotal(trip);
  if (total == null) return null;
  if (category === "compliance_balance") {
    const paid = Number(advancePaid);
    if (Number.isFinite(paid) && paid > 0) {
      return Math.max(0, total - paid);
    }
  }
  return total;
}

const INLINE_TWO_COLUMN_MIN_WIDTH = 380;
/** Modal sheet uses the same side-by-side card layout as Advance Payment (reference). */
const MODAL_MAX_WIDTH = 760;
const MODAL_TWO_COLUMN_MIN_WIDTH = 560;
/** Inline action buttons are drawn 36pt tall; keep the touch target at 44pt. */
const INLINE_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 };

function FactRow({
  label,
  value,
  emphasize,
  compact,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        styles.factRow,
        emphasize && styles.factRowEmphasize,
        compact && styles.factRowCompact,
        compact && emphasize && styles.factRowEmphasizeCompact,
      ]}
    >
      <Text
        style={[
          styles.factLabel,
          emphasize && styles.factLabelEmphasize,
          compact && styles.factLabelCompact,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.factValue,
          emphasize && styles.factValueEmphasize,
          compact && styles.factValueCompact,
        ]}
        numberOfLines={compact ? 1 : 2}
      >
        {value}
      </Text>
    </View>
  );
}

function sanitizePercentInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return cleaned.slice(0, 5);
  return `${parts[0].slice(0, 3)}.${parts.slice(1).join("").slice(0, 2)}`;
}

export type CompliancePaymentConfirmValues = {
  amount: number;
  paymentModeId: string;
  paymentModeLabel: string;
  utr?: string;
  /** YYYY-MM-DD, required. */
  transactionDate?: string;
  /** Optional org bank account the money left from, e.g. "HDFC Bank ••1234". */
  paidFromLabel?: string;
  /** entity_bank_accounts id of that account (stored on the ledger row). */
  paidFromAccountId?: string;
  remark?: string;
};

/** Typing aid: keeps digits only and inserts the slashes, e.g. "1010" → "10/10/". */
function formatTxnDateTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** "DD/MM/YYYY" → "YYYY-MM-DD", or "" while incomplete. */
function txnDisplayToIso(display: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

/** "YYYY-MM-DD" → "DD/MM/YYYY". */
function txnIsoToDisplay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function txnIsoToDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date();
}

/**
 * Transaction date input: type DD/MM/YYYY (slashes added automatically) or
 * pick from the calendar (browser picker on web, native picker on iOS/Android).
 */
function TxnDateInput({
  value,
  onChange,
  disabled,
  hasError,
}: {
  value: string;
  onChange: (display: string) => void;
  disabled: boolean;
  hasError: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date>(new Date());
  const webInputRef = useRef<{ showPicker?: () => void; click?: () => void } | null>(null);
  const iso = txnDisplayToIso(value);
  // Same window as validateComplianceTransactionDate: up to one day ahead.
  const latestDate = new Date();
  latestDate.setDate(latestDate.getDate() + 1);
  const latestIso = toComplianceTransactionDateInput(latestDate.toISOString());

  const openPicker = () => {
    if (disabled) return;
    if (Platform.OS === "web") {
      const input = webInputRef.current;
      try {
        if (input?.showPicker) input.showPicker();
        else input?.click?.();
      } catch {
        input?.click?.();
      }
      return;
    }
    setIosDraft(txnIsoToDate(iso));
    setPickerOpen(true);
  };

  return (
    <View>
      <View style={[styles.dateShell, hasError && styles.textFieldError]}>
        <TextInput
          style={styles.dateText}
          value={value}
          onChangeText={(text) => onChange(formatTxnDateTyping(text))}
          editable={!disabled}
          keyboardType="number-pad"
          maxLength={10}
          autoCorrect={false}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={Theme.textMuted}
          accessibilityLabel="Transaction date"
        />
        <Pressable
          onPress={openPicker}
          disabled={disabled}
          style={styles.dateIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Pick transaction date"
        >
          <Calendar size={16} color={Theme.textMuted} strokeWidth={2.2} />
          {Platform.OS === "web"
            ? createElement("input", {
                ref: webInputRef,
                type: "date",
                tabIndex: -1,
                "aria-hidden": true,
                value: iso,
                max: latestIso,
                onChange: (e: { target?: { value?: string } }) => {
                  const next = String(e?.target?.value ?? "");
                  if (next) onChange(txnIsoToDisplay(next));
                },
                style: {
                  position: "absolute",
                  inset: 0,
                  opacity: 0,
                  pointerEvents: "none",
                  border: "none",
                  padding: 0,
                },
              })
            : null}
        </Pressable>
      </View>
      {pickerOpen && Platform.OS === "android" ? (
        <DateTimePicker
          value={txnIsoToDate(iso)}
          mode="date"
          display="default"
          maximumDate={latestDate}
          onChange={(event, date) => {
            setPickerOpen(false);
            if (event.type === "set" && date) {
              onChange(txnIsoToDisplay(toComplianceTransactionDateInput(date.toISOString())));
            }
          }}
        />
      ) : null}
      {Platform.OS === "ios" ? (
        <Modal visible={pickerOpen} transparent animationType="slide">
          <Pressable style={styles.dateBackdrop} onPress={() => setPickerOpen(false)}>
            <View style={styles.dateSheet} onStartShouldSetResponder={() => true}>
              <View style={styles.dateSheetHeader}>
                <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                  <Text style={styles.dateSheetMuted}>Cancel</Text>
                </Pressable>
                <Text style={styles.dateSheetTitle}>Transaction date</Text>
                <Pressable
                  onPress={() => {
                    onChange(txnIsoToDisplay(toComplianceTransactionDateInput(iosDraft.toISOString())));
                    setPickerOpen(false);
                  }}
                  hitSlop={10}
                >
                  <Text style={styles.dateSheetDone}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={iosDraft}
                mode="date"
                display="spinner"
                maximumDate={latestDate}
                onChange={(_, date) => date && setIosDraft(date)}
              />
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

/** Ledger notes for a confirmed payment: remark plus the optional "Paid from" account. */
export function compliancePaymentNotes(values: CompliancePaymentConfirmValues): string | undefined {
  const parts = [
    values.remark?.trim(),
    values.paidFromLabel ? `Paid from: ${values.paidFromLabel}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

export function CompliancePaymentConfirmModal({
  visible,
  summary,
  category,
  submitting,
  onCancel,
  onConfirm,
  onReject,
  onFlag,
  presentation = "modal",
  readOnly = false,
  onFinanceVerify,
  financeVerifySubmitting = false,
}: {
  visible: boolean;
  summary: ComplianceTripSummary | null;
  category: ComplianceLedgerCategory | null;
  submitting: boolean;
  onCancel?: () => void;
  onConfirm: (values: CompliancePaymentConfirmValues) => void;
  /** Inline only: trip-level Reject shown beside Confirm payment. */
  onReject?: () => void;
  /** Inline only: Finance "Flag to Compliance" (Finance cannot Reject). */
  onFlag?: () => void;
  /** `inline` embeds the form in the Advance Payment panel (no popup). */
  presentation?: "modal" | "inline";
  /**
   * Inline only: Advance Verification review. Same values, nothing editable,
   * no payment mode; Finance Verify replaces Confirm payment.
   */
  readOnly?: boolean;
  onFinanceVerify?: () => void;
  financeVerifySubmitting?: boolean;
}) {
  const { height, width: windowWidth } = useWindowDimensions();
  const isInline = presentation === "inline";
  const [advancePercentText, setAdvancePercentText] = useState(
    String(COMPLIANCE_DEFAULT_ADVANCE_PERCENT),
  );
  const [modeId, setModeId] = useState<string>("UPI");
  const [utrText, setUtrText] = useState("");
  const [txnDateText, setTxnDateText] = useState("");
  const [paidFromId, setPaidFromId] = useState<string | null>(null);
  const [payoutAccounts, setPayoutAccounts] = useState<OrganizationPayoutAccount[]>([]);
  const [truckType, setTruckType] = useState<string | null>(null);
  const [supplierLabel, setSupplierLabel] = useState<string | null>(null);
  const [memoOpening, setMemoOpening] = useState(false);
  const [tdsRatePercent, setTdsRatePercent] = useState<number | null>(null);
  const [tdsRateFy, setTdsRateFy] = useState<string | null>(null);
  const [tdsLoading, setTdsLoading] = useState(false);
  const [docChargeConfig, setDocChargeConfig] =
    useState<ComplianceDocumentChargeConfig | null>(null);
  const [docChargeLoading, setDocChargeLoading] = useState(false);
  const [inlineWidth, setInlineWidth] = useState(0);
  const modalContentWidth = Math.min(windowWidth - 32, MODAL_MAX_WIDTH);
  const twoColumn = isInline
    ? inlineWidth >= INLINE_TWO_COLUMN_MIN_WIDTH
    : modalContentWidth >= MODAL_TWO_COLUMN_MIN_WIDTH;

  const trip = summary?.trip as PaymentTripFacts | undefined;
  const categoryLabel =
    category === "compliance_balance" ? "balance" : "advance";
  const isAdvance = category !== "compliance_balance";
  const baseFreight = useMemo(
    () => baseFreightAmount(trip, category, summary?.advance?.amount),
    [trip, category, summary?.advance?.amount],
  );
  const baseFreightLabel = baseFreight != null ? formatInr(baseFreight) : "—";
  const docCharge = useMemo(
    () =>
      isAdvance
        ? resolveComplianceDocumentationCharge(docChargeConfig, baseFreight)
        : null,
    [isAdvance, docChargeConfig, baseFreight],
  );
  const documentationCharges = docCharge?.amount ?? 0;
  const docChargeApplied =
    docCharge?.reason === "slab" && documentationCharges > 0;
  const docChargeMeta = !docCharge
    ? "Deducted with the advance"
    : docCharge.reason === "slab" && docCharge.slab
      ? `Slab ₹${formatSlabRange(docCharge.slab)} · on base freight`
      : docCharge.reason === "no_slab"
        ? "No slab covers this base freight"
        : docCharge.reason === "no_freight"
          ? "Base freight not set"
          : "Document charges are off for this org";
  const tdsAmount = useMemo(
    () => computeComplianceTdsAmount(baseFreight ?? 0, tdsRatePercent),
    [baseFreight, tdsRatePercent],
  );
  const advancePercent = Number(advancePercentText);
  const computedAmount = useMemo(() => {
    if (baseFreight == null) return 0;
    return computeCompliancePaymentAmount({
      baseFreight,
      advancePercent: Number.isFinite(advancePercent) ? advancePercent : 0,
      documentationCharges,
      tdsAmount,
    });
  }, [baseFreight, advancePercent, documentationCharges, tdsAmount]);
  const tripLabel = trip
    ? getTripDisplayNumber(trip, trip.organization_id ?? null)
    : "—";
  const percentLabel = isAdvance ? "Advance %" : "Settlement %";
  const currentFy = useMemo(() => financialYearOf(new Date()), []);
  const tdsHasRate = tdsRatePercent != null && tdsRatePercent > 0;

  const memoDocument =
    summary?.documents.find(
      (doc) =>
        (doc.document_type ?? "").toLowerCase() === "memo" &&
        classifyTripDocument(doc).hasBinary,
    ) ?? null;

  useEffect(() => {
    if (visible) {
      setAdvancePercentText(
        String(isAdvance ? COMPLIANCE_DEFAULT_ADVANCE_PERCENT : 100),
      );
      setModeId("UPI");
      setUtrText("");
      setTxnDateText(txnIsoToDisplay(toComplianceTransactionDateInput(new Date().toISOString())));
      setPaidFromId(null);
    } else {
      setMemoOpening(false);
      setTdsRatePercent(null);
      setTdsRateFy(null);
    }
  }, [visible, summary?.trip.id, category, isAdvance]);

  useEffect(() => {
    const vehicleId = trip?.vehicle_id?.trim();
    const orgId = trip?.organization_id?.trim();
    if (!visible || !trip || !vehicleId || !orgId) {
      setTruckType(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const owned = await getVehicleById(orgId, vehicleId);
      const ownedType = formatTruckTypeWithSize(owned.vehicle?.vehicle_type, owned.vehicle?.vehicle_size);
      if (ownedType) {
        if (!cancelled) setTruckType(ownedType);
        return;
      }
      const shared = await getVehicleForTripViewer(vehicleId, trip.id, orgId);
      if (!cancelled)
        setTruckType(formatTruckTypeWithSize(shared.vehicle?.vehicle_type, shared.vehicle?.vehicle_size) || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, trip]);

  useEffect(() => {
    const supplierId = trip?.supplier_id?.trim();
    const orgId = trip?.organization_id?.trim();
    const fallback = trip?.supplier_name?.trim() || null;
    if (!visible || !supplierId) {
      setSupplierLabel(fallback);
      return;
    }
    let cancelled = false;
    void (async () => {
      let label = "";
      const details = await getSupplierDetails(supplierId);
      label =
        details.supplier?.name?.trim() ||
        details.supplier?.company_name?.trim() ||
        details.supplier?.contact_person?.trim() ||
        "";
      if (!label && orgId) {
        const owned = await getSupplierById(orgId, supplierId);
        label =
          owned.supplier?.name?.trim() ||
          owned.supplier?.company_name?.trim() ||
          owned.supplier?.contact_person?.trim() ||
          "";
      }
      if (!cancelled) setSupplierLabel(label || fallback);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, trip?.supplier_id, trip?.organization_id, trip?.supplier_name]);

  /** Load vendor advance % + FY TDS rate from supplier vault (source of truth). */
  useEffect(() => {
    const supplierId = trip?.supplier_id?.trim();
    const orgId = trip?.organization_id?.trim();
    if (!visible || !supplierId || !orgId) {
      setTdsRatePercent(null);
      setTdsRateFy(null);
      setTdsLoading(false);
      return;
    }
    let cancelled = false;
    setTdsLoading(true);
    void (async () => {
      const [tds, profile] = await Promise.all([
        listSupplierTdsRates(orgId, supplierId),
        getVendorOnboardingProfile(orgId, supplierId),
      ]);
      if (cancelled) return;
      const resolved = resolveComplianceTdsRate(tds.rates);
      setTdsRatePercent(resolved?.ratePercent ?? null);
      setTdsRateFy(resolved?.financialYear ?? null);
      const adv = profile.profile?.advance_percentage;
      const vendorPct =
        adv != null && Number.isFinite(Number(adv)) ? Number(adv) : null;
      if (isAdvance && vendorPct != null) {
        setAdvancePercentText(String(vendorPct));
      }
      setTdsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, trip?.supplier_id, trip?.organization_id, isAdvance]);

  /** Org Document Charge Slabs (Workspace → Settings → Document Charges). */
  useEffect(() => {
    const orgId = trip?.organization_id?.trim();
    if (!visible || !orgId || !isAdvance) {
      setDocChargeConfig(null);
      setDocChargeLoading(false);
      return;
    }
    let cancelled = false;
    setDocChargeLoading(true);
    void (async () => {
      const { data } = await getDocumentChargeConfig(orgId);
      if (cancelled) return;
      setDocChargeConfig(data);
      setDocChargeLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, trip?.organization_id, isAdvance]);

  useEffect(() => {
    const orgId = trip?.organization_id?.trim();
    if (!visible || readOnly || !orgId) return;
    let cancelled = false;
    void fetchOrganizationPayoutAccounts(orgId).then((rows) => {
      if (!cancelled) setPayoutAccounts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, readOnly, trip?.organization_id]);

  const amountOk = computedAmount > 0;
  const mode = PAYMENT_MODES.find((item) => item.id === modeId);
  const isCash = isCashPaymentMode(mode?.id);
  const utrError = isCash ? null : validateComplianceUtr(utrText);
  const txnDateIso = txnDisplayToIso(txnDateText);
  const txnDateError = !txnDateText.trim()
    ? "Enter a transaction date."
    : !txnDateIso
      ? "Use DD/MM/YYYY."
      : validateComplianceTransactionDate(txnDateIso);
  const paidFrom = payoutAccounts.find((item) => item.id === paidFromId) ?? null;
  const canSubmit =
    amountOk &&
    !!mode &&
    !utrError &&
    !txnDateError &&
    !submitting &&
    !docChargeLoading &&
    !!summary &&
    !!category;

  const openMemoPreview = async () => {
    const path = memoDocument?.storage_path?.trim();
    const orgId = trip?.organization_id?.trim();
    if (!path || !orgId) {
      alertMessage("Memo document", "This trip has no memo file to preview.");
      return;
    }
    setMemoOpening(true);
    try {
      const url = await signCompliancePreviewUrl({
        storagePath: path,
        source: "trip",
        sourceEntityDocumentId: memoDocument?.source_entity_document_id,
        organizationId: orgId,
        docType: "memo",
      });
      if (!url) {
        alertMessage("Memo document", "This trip has no memo file to preview.");
        return;
      }
      // Keep preview out of DocumentScreen to avoid a Workspace ↔ Modal import cycle.
      void guessCompliancePreviewMime(
        memoDocument?.file_name || path,
        memoDocument?.mime_type,
      );
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const supported = await Linking.canOpenURL(url);
        if (!supported) {
          alertMessage(
            "Memo document",
            "Could not open the memo preview on this device.",
          );
          return;
        }
        await Linking.openURL(url);
      }
    } finally {
      setMemoOpening(false);
    }
  };

  const article = categoryLabel === "advance" ? "an" : "a";
  const confirmText = amountOk
    ? `Confirm ${categoryLabel} payment of ₹${computedAmount.toLocaleString("en-IN")}`
    : `Confirm ${categoryLabel} payment`;

  const introText = (
    <Text style={[styles.body, isInline && styles.bodyInline]} numberOfLines={isInline ? 2 : undefined}>
      {readOnly
        ? "Check these values. Approve Advance moves the trip to Advance Payment, where the advance is posted."
        : `You are about to post ${article} ${categoryLabel} payment through the Finance ledger.`}
    </Text>
  );

  const factsCard = (
    <View style={[styles.factCard, isInline && styles.factCardInline]}>
      <FactRow compact={isInline} label="Supplier" value={supplierLabel?.trim() || "—"} />
      <FactRow compact={isInline} label="Customer name" value={trip?.client_name?.trim() || "—"} />
      <FactRow compact={isInline} label="Truck type" value={truckType?.trim() || "—"} />
      <FactRow compact={isInline} label="Trip" value={tripLabel} />
      <FactRow compact={isInline} label="Category" value={categoryLabel} />
      <FactRow compact={isInline} label="Base freight" value={baseFreightLabel} emphasize />
      <View style={[styles.factRow, isInline && styles.factRowCompact]}>
        <Text style={[styles.factLabel, isInline && styles.factLabelCompact]}>Memo</Text>
        <View style={styles.docAction}>
          <Pressable
            style={[
              styles.eyeBtn,
              isInline && styles.eyeBtnInline,
              (!memoDocument || memoOpening || submitting) && styles.eyeBtnDisabled,
            ]}
            onPress={() => void openMemoPreview()}
            disabled={memoOpening || submitting || !memoDocument}
            accessibilityRole="button"
            accessibilityLabel="Preview memo document"
            accessibilityState={{
              disabled: !memoDocument || memoOpening || submitting,
            }}
          >
            {memoOpening ? (
              <ActivityIndicator size="small" color={Theme.textPrimaryDark} />
            ) : (
              <>
                <Eye size={isInline ? 12 : 13} color={Theme.textPrimaryDark} strokeWidth={2.2} />
                <Text style={styles.eyeText}>Preview</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );

  const calcCard = (
    <View style={[styles.calcCard, isInline && styles.calcCardInline]}>
      <Text style={styles.calcTitle}>Amount calculation</Text>
      <Text style={[styles.calcHint, isInline && styles.calcHintInline]} numberOfLines={isInline ? 1 : undefined}>
        (Base freight × {percentLabel}) − Documentation charges − TDS
      </Text>

      <View style={[styles.calcRow, isInline && styles.calcRowInline]}>
        <Text style={[styles.calcLabel, styles.calcLabelGrow]}>Base freight</Text>
        <Text style={styles.calcValue}>{baseFreightLabel}</Text>
      </View>

      <View style={[styles.calcRow, isInline && styles.calcRowInline]}>
        <Text style={[styles.calcLabel, styles.calcLabelGrow]}>{percentLabel}</Text>
        <View style={[styles.pctField, isInline && styles.pctFieldInline]}>
          <TextInput
            style={styles.pctInput}
            keyboardType="numeric"
            value={advancePercentText}
            onChangeText={(text) => setAdvancePercentText(sanitizePercentInput(text))}
            editable={!submitting && !readOnly}
            selectTextOnFocus
            accessibilityLabel={percentLabel}
            placeholder="90"
            placeholderTextColor={Theme.textMuted}
          />
          <Text style={styles.pctSuffix}>%</Text>
        </View>
      </View>

      <View style={[styles.calcRowTds, isInline && styles.calcRowTdsInline]}>
        <View style={styles.calcLabelBlock}>
          <Text style={styles.calcLabel}>Documentation charges</Text>
          <Text style={styles.calcMeta} numberOfLines={1}>
            {docChargeLoading ? "Fetching charge slabs…" : docChargeMeta}
          </Text>
        </View>
        <View style={styles.tdsValueBlock}>
          {docChargeLoading ? (
            <ActivityIndicator size="small" color={Theme.textMuted} />
          ) : (
            <Text
              style={[
                styles.calcValue,
                styles.tdsAmountValue,
                !docChargeApplied && styles.calcValueMuted,
              ]}
            >
              {formatInr(documentationCharges)}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.calcRowTds, isInline && styles.calcRowTdsInline]}>
        <View style={styles.calcLabelBlock}>
          <Text style={styles.calcLabel}>TDS amount</Text>
          {tdsLoading ? (
            <Text style={styles.calcMeta}>Fetching vendor rate…</Text>
          ) : tdsHasRate ? (
            <Text style={styles.calcMeta} numberOfLines={1}>
              FY {tdsRateFy} · {tdsRatePercent}% of base freight
            </Text>
          ) : (
            <Text style={styles.calcMeta} numberOfLines={1}>
              No TDS rate for FY {currentFy}
            </Text>
          )}
        </View>
        <View style={styles.tdsValueBlock}>
          {tdsHasRate ? (
            <View style={styles.tdsRateChip}>
              <Text style={styles.tdsRateChipText}>{tdsRatePercent}%</Text>
            </View>
          ) : null}
          {tdsLoading ? (
            <ActivityIndicator size="small" color={Theme.textMuted} />
          ) : (
            <Text
              style={[
                styles.calcValue,
                !tdsHasRate && styles.calcValueMuted,
                tdsHasRate && styles.tdsAmountValue,
              ]}
            >
              {formatInr(tdsAmount)}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.amountResult, isInline && styles.amountResultInline]}>
        <View style={styles.amountResultCopy}>
          <Text style={styles.amountResultLabel}>
            {isAdvance ? "Final advance payable (₹)" : "Final balance payable (₹)"}
          </Text>
          <Text style={styles.amountResultHint} numberOfLines={1}>
            {tdsHasRate
              ? "Auto-calculated · TDS from vendor vault"
              : "Auto-calculated · editable % above"}
          </Text>
        </View>
        <Text
          style={[styles.amountResultValue, isInline && styles.amountResultValueInline]}
          numberOfLines={1}
        >
          {formatInr(computedAmount)}
        </Text>
      </View>
    </View>
  );

  const detailsRow = (
    <View style={[styles.columns, twoColumn && styles.columnsWide, isInline && styles.columnsInline]}>
      <View style={[styles.column, twoColumn && styles.columnWide, isInline && styles.columnInline]}>
        {factsCard}
      </View>
      <View style={[styles.column, twoColumn && styles.columnWide, isInline && styles.columnInline]}>
        {calcCard}
      </View>
    </View>
  );

  const modeField = (
    <View style={[styles.field, isInline && styles.fieldInline]}>
      <Text style={styles.label}>Payment mode</Text>
      <View style={styles.modeRow}>
        {PAYMENT_MODES.slice(0, 4).map((item) => {
          const selected = modeId === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setModeId(item.id)}
              style={[styles.modeChip, isInline && styles.modeChipInline, selected && styles.modeChipOn]}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[styles.modeChipText, selected && styles.modeChipTextOn]}
                numberOfLines={1}
              >
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.paymentInputsRow}>
        <View style={styles.paymentInputCell}>
          <Text style={styles.label}>{isCash ? "UTR / reference (optional)" : "UTR / reference *"}</Text>
          <TextInput
            style={[styles.textField, !!utrText && !!utrError && styles.textFieldError]}
            value={utrText}
            onChangeText={(text) => setUtrText(normalizeComplianceUtr(text))}
            editable={!submitting}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Bank UTR"
            placeholderTextColor={Theme.textMuted}
            accessibilityLabel="UTR / reference number"
          />
          {utrText && utrError ? <Text style={styles.fieldError}>{utrError}</Text> : null}
        </View>
        <View style={styles.paymentInputCell}>
          <Text style={styles.label}>Transaction date *</Text>
          <TxnDateInput
            value={txnDateText}
            onChange={setTxnDateText}
            disabled={submitting}
            hasError={!!txnDateText && !!txnDateError}
          />
          {txnDateText.length >= 10 && txnDateError ? <Text style={styles.fieldError}>{txnDateError}</Text> : null}
        </View>
      </View>
      {payoutAccounts.length > 0 ? (
        <>
          <Text style={styles.label}>Paid from (optional)</Text>
          <View style={[styles.modeRow, styles.wrapRow]}>
            {payoutAccounts.map((item) => {
              const selected = paidFromId === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setPaidFromId(selected ? null : item.id)}
                  style={[styles.modeChip, isInline && styles.modeChipInline, selected && styles.modeChipOn]}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[styles.modeChipText, selected && styles.modeChipTextOn]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );

  const actionsRow = (
    <View style={[styles.actions, (onReject || onCancel || onFlag) && styles.actionsWithSecondary]}>
      {onCancel && !(isInline && onReject) ? (
        <Pressable
          style={[styles.cancelBtn, submitting && styles.confirmBtnDisabled]}
          onPress={onCancel}
          disabled={submitting}
          hitSlop={isInline ? INLINE_ACTION_HIT_SLOP : undefined}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      ) : null}
      {isInline && onReject ? (
        <Pressable
          style={({ pressed }) => [
            styles.rejectBtn,
            styles.rejectBtnInline,
            pressed && styles.rejectBtnPressed,
            submitting && styles.confirmBtnDisabled,
          ]}
          onPress={onReject}
          disabled={submitting}
          hitSlop={INLINE_ACTION_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Reject trip compliance"
        >
          <Text style={styles.rejectText}>Reject</Text>
        </Pressable>
      ) : null}
      {isInline && onFlag ? (
        <Pressable
          style={({ pressed }) => [
            styles.rejectBtn,
            styles.rejectBtnInline,
            pressed && styles.rejectBtnPressed,
            submitting && styles.confirmBtnDisabled,
          ]}
          onPress={onFlag}
          disabled={submitting}
          hitSlop={INLINE_ACTION_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Flag to Compliance"
        >
          <Text style={styles.rejectText}>Flag to Compliance</Text>
        </Pressable>
      ) : null}
      {readOnly ? (
        onFinanceVerify ? (
          <Pressable
            style={[
              styles.confirmBtn,
              isInline && styles.confirmBtnInline,
              financeVerifySubmitting && styles.confirmBtnDisabled,
            ]}
            disabled={financeVerifySubmitting}
            hitSlop={isInline ? INLINE_ACTION_HIT_SLOP : undefined}
            accessibilityRole="button"
            accessibilityLabel="Approve advance"
            onPress={onFinanceVerify}
          >
            {financeVerifySubmitting ? (
              <ActivityIndicator color={Theme.buttonDarkText} />
            ) : (
              <Text style={styles.confirmText}>Approve Advance</Text>
            )}
          </Pressable>
        ) : null
      ) : (
      <Pressable
        style={[
          styles.confirmBtn,
          isInline && styles.confirmBtnInline,
          !canSubmit && styles.confirmBtnDisabled,
        ]}
        disabled={!canSubmit}
        hitSlop={isInline ? INLINE_ACTION_HIT_SLOP : undefined}
        accessibilityRole="button"
        accessibilityLabel={confirmText}
        onPress={() => {
          if (!mode || !canSubmit) return;
          onConfirm({
            amount: computedAmount,
            paymentModeId: mode.id,
            paymentModeLabel: mode.name,
            utr: isCash ? undefined : normalizeComplianceUtr(utrText),
            transactionDate: txnDateIso,
            paidFromLabel: paidFrom?.label,
            paidFromAccountId: paidFrom?.id,
          });
        }}
      >
        {submitting ? (
          <ActivityIndicator color={Theme.buttonDarkText} />
        ) : (
          <Text style={styles.confirmText}>Confirm payment</Text>
        )}
      </Pressable>
      )}
    </View>
  );

  if (isInline) {
    if (!visible || !summary || !category) return null;
    return (
      <View
        style={styles.inlineRoot}
        onLayout={(event) => setInlineWidth(event.nativeEvent.layout.width)}
      >
        {introText}
        {/* Values scroll instead of being clipped on smaller screens; actions stay pinned. */}
        <ScrollView
          style={styles.inlineScroll}
          contentContainerStyle={styles.inlineScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {detailsRow}
          {readOnly ? null : modeField}
        </ScrollView>
        <View style={[styles.actionsBar, styles.actionsBarInline]}>{actionsRow}</View>
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={submitting ? undefined : onCancel}
        />
        <View
          style={[
            styles.sheet,
            {
              width: modalContentWidth,
              maxHeight: Math.min(height - 32, twoColumn ? 720 : 680),
            },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.title}>Confirm payment</Text>
              {introText}
            </View>
            {detailsRow}
            {modeField}
            <View style={styles.actionsBar}>{actionsRow}</View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.18)",
      },
      default: {
        elevation: 8,
      },
    }),
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    gap: 14,
  },
  modalHeader: { gap: 6 },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: Theme.textPrimaryDark,
  },
  body: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textMuted,
    lineHeight: 17,
  },
  bodyInline: {
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 14,
  },
  inlineRoot: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    minWidth: 0,
    paddingTop: 2,
    paddingBottom: 2,
    gap: 6,
  },
  columns: { gap: 12 },
  columnsWide: { flexDirection: "row", alignItems: "stretch" },
  columnsInline: { gap: 8 },
  column: { minWidth: 0 },
  columnWide: { flex: 1, flexBasis: 0 },
  columnInline: { minWidth: 0 },
  inlineScroll: { flex: 1, minHeight: 0 },
  inlineScrollContent: { gap: 6, paddingBottom: 4 },
  factCard: {
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: Theme.compliancePageBg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
  },
  factCardInline: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 0,
  },
  factRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  factRowCompact: {
    minHeight: 24,
    gap: 8,
  },
  factRowEmphasize: {
    minHeight: 36,
    marginTop: 2,
    marginBottom: 2,
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceCardBorder,
  },
  factRowEmphasizeCompact: {
    minHeight: 26,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 2,
  },
  factLabel: {
    flexShrink: 0,
    width: 118,
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  factLabelCompact: {
    width: 96,
    fontSize: 11,
  },
  factLabelEmphasize: {
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  factValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  factValueEmphasize: {
    fontSize: 14,
    fontWeight: "800",
    color: Theme.darkGreen,
  },
  factValueCompact: {
    fontSize: 12,
  },
  docAction: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  eyeBtn: {
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
  },
  eyeBtnInline: {
    height: 26,
    paddingHorizontal: 8,
  },
  eyeBtnDisabled: { opacity: 0.45 },
  eyeText: { fontSize: 11, fontWeight: "600", color: Theme.textPrimaryDark },
  calcCard: {
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 8,
  },
  calcCardInline: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 4,
  },
  calcTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: Theme.textPrimaryDark,
    textTransform: "uppercase",
  },
  calcHint: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: -4,
    lineHeight: 14,
  },
  calcHintInline: {
    marginTop: 0,
    lineHeight: 13,
  },
  calcRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  calcRowInline: {
    minHeight: 26,
  },
  calcRowTds: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 2,
  },
  calcRowTdsInline: {
    minHeight: 30,
    paddingVertical: 0,
  },
  calcLabelBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  calcLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  calcLabelGrow: {
    flex: 1,
    minWidth: 0,
  },
  calcMeta: {
    fontSize: 10,
    fontWeight: "500",
    color: Theme.textSecondary,
    letterSpacing: 0.1,
  },
  calcValue: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  calcValueMuted: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "right",
  },
  tdsValueBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flexShrink: 0,
  },
  tdsRateChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.positiveMuted,
    borderWidth: 1,
    borderColor: Theme.positiveMutedDarkBorder,
  },
  tdsRateChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.darkGreen,
    letterSpacing: 0.2,
  },
  tdsAmountValue: {
    minWidth: 68,
    color: Theme.textPrimaryDark,
  },
  pctField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 34,
    minWidth: 92,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.compliancePageBg,
  },
  pctFieldInline: {
    height: 28,
    minWidth: 80,
    paddingHorizontal: 8,
  },
  pctInput: {
    flex: 1,
    minWidth: 36,
    paddingVertical: 0,
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  pctSuffix: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textMuted,
  },
  amountResult: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceCardBorder,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  amountResultInline: {
    marginTop: 2,
    paddingTop: 8,
  },
  amountResultCopy: { flex: 1, minWidth: 0, gap: 2 },
  amountResultLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.1,
  },
  amountResultHint: {
    fontSize: 10,
    fontWeight: "400",
    color: Theme.textMuted,
  },
  amountResultValue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: Theme.darkGreen,
  },
  amountResultValueInline: {
    fontSize: 18,
  },
  field: { gap: 8 },
  fieldInline: { flexShrink: 0, gap: 4 },
  label: { fontSize: 12, fontWeight: "600", color: Theme.textMuted },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  wrapRow: { flexWrap: "wrap" },
  paymentInputsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  paymentInputCell: { flexGrow: 1, flexBasis: 180, gap: 4 },
  textField: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    backgroundColor: Theme.backgroundInput,
  },
  dateShell: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    borderWidth: 1,
    borderColor: Theme.borderInput,
    borderRadius: 8,
    backgroundColor: Theme.backgroundInput,
  },
  dateText: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    fontSize: 14,
    color: Theme.textPrimaryDark,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  } as never,
  dateIconBtn: {
    width: 44,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dateBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: Theme.overlayBackdrop },
  dateSheet: { backgroundColor: Theme.cardWhite, paddingBottom: 24 },
  dateSheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dateSheetTitle: { fontSize: 15, fontWeight: "700", color: Theme.textPrimaryDark },
  dateSheetMuted: { fontSize: 15, color: Theme.textMuted },
  dateSheetDone: { fontSize: 15, fontWeight: "700", color: Theme.textPrimaryDark },
  textFieldError: { borderColor: Theme.destructive },
  fieldError: { fontSize: 11, color: Theme.destructive },
  modeChip: {
    flex: 1,
    minWidth: 0,
    height: 40,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  modeChipInline: {
    height: 32,
    borderRadius: 8,
  },
  modeChipOn: {
    backgroundColor: Theme.buttonDark,
    borderColor: Theme.buttonDark,
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textMuted,
    textAlign: "center",
  },
  modeChipTextOn: { color: Theme.buttonDarkText },
  actionsBar: {
    alignItems: "center",
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.complianceCardBorder,
  },
  actionsBarInline: {
    flexShrink: 0,
    paddingTop: 8,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  actionsWithSecondary: { gap: 12 },
  rejectBtn: {
    minWidth: 104,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Theme.complianceStageDocsFg,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnInline: {
    height: 36,
    minWidth: 96,
    paddingHorizontal: 16,
  },
  rejectBtnPressed: { opacity: 0.8 },
  rejectText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: Theme.complianceStageDocsFg,
  },
  cancelBtn: {
    minWidth: 104,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.complianceCardBorder,
    backgroundColor: Theme.cardWhite,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: { fontSize: 13, fontWeight: "600", color: Theme.textPrimaryDark },
  confirmBtn: {
    minWidth: 168,
    height: 40,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: Theme.positive,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnInline: {
    height: 36,
    minWidth: 148,
    paddingHorizontal: 16,
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.buttonDarkText,
    textAlign: "center",
  },
});
