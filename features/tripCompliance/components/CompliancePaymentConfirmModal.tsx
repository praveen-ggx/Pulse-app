import { HUB_MOBILE_COMMERCE_REF } from "@/components/hub/hubMobileTicketTokens";
import { ledgerPaymentModeVisual } from "@/components/ledger/ledgerPaymentVisuals";
import { LedgerSyncPalette } from "@/constants/LedgerSyncPalette";
import Theme from "@/constants/Theme";
import { getDocumentChargeConfig } from "@/features/organization/services/documentCharges.service";
import { formatSlabRange } from "@/features/organization/utils/documentChargeSlabs.util";
import {
  getVendorOnboardingProfile,
  listSupplierTdsRates,
} from "@/features/suppliers/services/supplierVendorOnboarding.service";
import { financialYearOf } from "@/features/suppliers/utils/supplierVendorOnboarding.util";
import {
  getSupplierById,
  getSupplierDetails,
} from "@/features/suppliers/services/suppliers.service";
import {
  guessCompliancePreviewMime,
  signCompliancePreviewUrl,
} from "@/features/tripCompliance/services/complianceDocumentView.service";
import {
  fetchOrganizationPayoutAccounts,
  type OrganizationPayoutAccount,
} from "@/features/tripCompliance/services/tripComplianceRead.service";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  COMPLIANCE_DEFAULT_ADVANCE_PERCENT,
  computeCompliancePaymentAmount,
  computeComplianceTdsAmount,
  resolveComplianceDocumentationCharge,
  resolveComplianceTdsRate,
  type ComplianceDocumentChargeConfig,
} from "@/features/tripCompliance/utils/compliancePaymentAmount.util";
import {
  toComplianceTransactionDateInput,
  validateComplianceTransactionDate,
} from "@/features/tripCompliance/utils/compliancePaymentDate.util";
import {
  isCashPaymentMode,
  normalizeComplianceUtr,
  validateComplianceUtr,
} from "@/features/tripCompliance/utils/compliancePaymentReference.util";
import { formatTruckTypeWithSize } from "@/features/tripCompliance/utils/complianceTruckType.util";
import { alertMessage } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import {
  COMPLIANCE_ACTION_BTN,
  complianceActionButtonStyles,
} from "@/features/tripCompliance/utils/complianceActionButton.util";
import { classifyTripDocument } from "@/features/tripCompliance/utils/tripDocumentClassification.util";
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
import { Banknote, Calendar, Clock, Eye, Hash, Route } from "lucide-react-native";
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

const SHOP = HUB_MOBILE_COMMERCE_REF;

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

/** Client rate per MT, only when the client priced per MT. */
function clientRatePerMt(trip: PaymentTripFacts | undefined): number | null {
  if (!trip || trip.sale_rate_basis !== "per_mt") return null;
  const unit = Number(trip.sale_unit_rate);
  if (Number.isFinite(unit) && unit > 0) return unit;
  const tons = Number(trip.load_tons);
  const price = Number(trip.client_price);
  if (Number.isFinite(tons) && tons > 0 && Number.isFinite(price) && price > 0) return price / tons;
  return null;
}

/** Supplier rate per MT, only when the supplier priced per MT. */
function supplierRatePerMt(trip: PaymentTripFacts | undefined): number | null {
  if (!trip || trip.supplier_rate_basis !== "per_mt") return null;
  const rate = Number(trip.supplier_rate);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
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

const INLINE_TWO_COLUMN_MIN_WIDTH = 640;
/** Modal sheet uses the same side-by-side card layout as Advance Payment (reference). */
const MODAL_MAX_WIDTH = 760;
const MODAL_TWO_COLUMN_MIN_WIDTH = 560;
/** Inline action buttons are drawn 36pt tall; keep the touch target at 44pt. */
const INLINE_ACTION_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 };

function LedgerSectionHead({
  icon,
  iconTone = "mode",
  title,
  hint,
}: {
  icon: React.ReactNode;
  iconTone?: "mode" | "ref" | "date" | "amount" | "trip";
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.ledgerHead}>
      <View
        style={[
          styles.ledgerIcon,
          iconTone === "mode" && styles.ledgerIconMode,
          iconTone === "ref" && styles.ledgerIconRef,
          iconTone === "date" && styles.ledgerIconDate,
          iconTone === "amount" && styles.ledgerIconAmount,
          iconTone === "trip" && styles.ledgerIconTrip,
        ]}
      >
        {icon}
      </View>
      <View style={styles.ledgerHeadText}>
        <Text style={styles.ledgerEyebrow}>{title}</Text>
        {hint ? <Text style={styles.ledgerHint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

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
          compact && emphasize && styles.factValueEmphasizeCompact,
        ]}
        numberOfLines={3}
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
  compact = false,
}: {
  value: string;
  onChange: (display: string) => void;
  disabled: boolean;
  hasError: boolean;
  compact?: boolean;
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
      <View style={[styles.dateShell, compact && styles.dateShellInline, hasError && styles.textFieldError]}>
        <TextInput
          style={[styles.dateText, compact && styles.dateTextInline]}
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
  onPreviewMemo,
  suggestedAmount = null,
}: {
  visible: boolean;
  summary: ComplianceTripSummary | null;
  category: ComplianceLedgerCategory | null;
  submitting: boolean;
  onCancel?: () => void;
  onConfirm: (values: CompliancePaymentConfirmValues) => void;
  /** Inline only: trip-level Reject shown beside Confirm payment. */
  onReject?: () => void;
  /** Inline only: Finance "Flag to Compliance". Unused since Finance got Reject (12 Oct); kept for old callers. */
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
  /** Opens the memo in the workspace viewer (zoom / rotate) instead of a new tab. */
  onPreviewMemo?: () => void;
  /** Final Settlement remaining payable after CN / DN. Used for balance only. */
  suggestedAmount?: number | null;
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
  const clientPerMt = clientRatePerMt(trip);
  const supplierPerMt = supplierRatePerMt(trip);
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
    if (!isAdvance && suggestedAmount != null && Number.isFinite(suggestedAmount) && suggestedAmount > 0) {
      return Math.round(suggestedAmount * 100) / 100;
    }
    if (baseFreight == null) return 0;
    return computeCompliancePaymentAmount({
      baseFreight,
      advancePercent: Number.isFinite(advancePercent) ? advancePercent : 0,
      documentationCharges,
      tdsAmount,
    });
  }, [isAdvance, suggestedAmount, baseFreight, advancePercent, documentationCharges, tdsAmount]);
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
    if (onPreviewMemo) {
      onPreviewMemo();
      return;
    }
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

  const todayIso = toComplianceTransactionDateInput(new Date().toISOString());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayIso = toComplianceTransactionDateInput(yesterdayDate.toISOString());
  const txnIso = txnDisplayToIso(txnDateText);

  const factsCard = (
    <View style={[styles.factCard, isInline && styles.factCardInline, styles.ledgerCard]}>
      <LedgerSectionHead
        icon={<Route size={15} color={Theme.primary} strokeWidth={2.2} />}
        iconTone="trip"
        title="Trip"
        hint="Settlement context for this ledger post"
      />
      <FactRow compact={isInline} label="Supplier" value={supplierLabel?.trim() || "—"} />
      <FactRow compact={isInline} label="Customer name" value={trip?.client_name?.trim() || "—"} />
      <FactRow compact={isInline} label="Truck type" value={truckType?.trim() || "—"} />
      <FactRow compact={isInline} label="Trip" value={tripLabel} />
      <FactRow compact={isInline} label="Category" value={categoryLabel} />
      {clientPerMt != null ? (
        <FactRow compact={isInline} label="Client rate / MT" value={formatInr(clientPerMt)} />
      ) : null}
      {supplierPerMt != null ? (
        <FactRow compact={isInline} label="Supplier rate / MT" value={formatInr(supplierPerMt)} />
      ) : null}
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
                <Eye size={isInline ? 12 : 13} color={SHOP.ink} strokeWidth={2.2} />
                <Text style={[styles.eyeText, isInline && styles.eyeTextInline]}>Preview</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );

  const calcCard = (
    <View style={[styles.calcCard, isInline && styles.calcCardInline, styles.ledgerCard]}>
      <LedgerSectionHead
        icon={<Banknote size={15} color={Theme.darkGreen} strokeWidth={2.2} />}
        iconTone="amount"
        title="Amount calculation"
        hint={`(Base freight × ${percentLabel}) − Documentation charges − TDS`}
      />

      <View style={[styles.calcRow, isInline && styles.calcRowInline]}>
        <Text style={[styles.calcLabel, styles.calcLabelGrow, isInline && styles.calcLabelInline]}>Base freight</Text>
        <Text style={[styles.calcValue, isInline && styles.calcValueInline]}>{baseFreightLabel}</Text>
      </View>

      <View style={[styles.calcRow, isInline && styles.calcRowInline]}>
        <Text style={[styles.calcLabel, styles.calcLabelGrow, isInline && styles.calcLabelInline]}>{percentLabel}</Text>
        <View style={[styles.pctField, isInline && styles.pctFieldInline]}>
          <TextInput
            style={[styles.pctInput, isInline && styles.pctInputInline]}
            keyboardType="numeric"
            value={advancePercentText}
            onChangeText={(text) => setAdvancePercentText(sanitizePercentInput(text))}
            editable={!submitting && !readOnly}
            selectTextOnFocus
            accessibilityLabel={percentLabel}
            placeholder="90"
            placeholderTextColor={Theme.textMuted}
          />
          <Text style={[styles.pctSuffix, isInline && styles.pctSuffixInline]}>%</Text>
        </View>
      </View>

      <View style={[styles.calcRowTds, isInline && styles.calcRowTdsInline]}>
        <View style={styles.calcLabelBlock}>
          <Text style={[styles.calcLabel, isInline && styles.calcLabelInline]}>Documentation charges</Text>
          <Text style={[styles.calcMeta, isInline && styles.calcMetaInline]} numberOfLines={2}>
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
                isInline && styles.calcValueInline,
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
          <Text style={[styles.calcLabel, isInline && styles.calcLabelInline]}>TDS amount</Text>
          {tdsLoading ? (
            <Text style={[styles.calcMeta, isInline && styles.calcMetaInline]}>Fetching vendor rate…</Text>
          ) : tdsHasRate ? (
            <Text style={[styles.calcMeta, isInline && styles.calcMetaInline]} numberOfLines={1}>
              FY {tdsRateFy} · {tdsRatePercent}% of base freight
            </Text>
          ) : (
            <Text style={[styles.calcMeta, isInline && styles.calcMetaInline]} numberOfLines={1}>
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
                isInline && styles.calcValueInline,
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
          <Text
            style={[styles.amountResultLabel, isInline && styles.amountResultLabelInline]}
            numberOfLines={1}
          >
            {isAdvance ? "Final advance payable" : "Final balance payable"}
          </Text>
          <Text style={styles.amountResultHint} numberOfLines={2}>
            {tdsHasRate
              ? "Auto-calculated · TDS from vendor vault"
              : "Auto-calculated · editable % above"}
          </Text>
        </View>
        <View style={styles.amountHeroValue}>
          <Text style={styles.amountRupee}>₹</Text>
          <Text
            style={[styles.amountResultValue, isInline && styles.amountResultValueInline]}
            numberOfLines={1}
          >
            {computedAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </Text>
        </View>
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
    <View style={[styles.field, styles.ledgerCard, isInline && styles.fieldInline, isInline && styles.fieldFill]}>
      <View style={[styles.paymentBody, isInline && styles.paymentBodyFill]}>
        <View style={isInline ? styles.paymentBand : undefined}>
        <LedgerSectionHead
          icon={<Banknote size={15} color={Theme.darkGreen} strokeWidth={2.2} />}
          iconTone="mode"
          title="Payment mode"
          hint="How this money moved"
        />
        <View style={styles.modeTileRow}>
          {PAYMENT_MODES.slice(0, 4).map((item) => {
            const visual = ledgerPaymentModeVisual(item.id);
            const selected = modeId === item.id;
            const ModeIcon = visual.Icon;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (!submitting) setModeId(item.id);
                }}
                disabled={submitting}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={visual.label}
                style={[
                  styles.modeChoice,
                  selected && { borderColor: visual.color, backgroundColor: visual.tint },
                ]}
              >
                <ModeIcon size={15} color={selected ? visual.color : Theme.textPrimaryDark} strokeWidth={2.1} />
                <Text
                  style={[styles.modeChoiceLabel, selected && { color: visual.color }]}
                  numberOfLines={1}
                >
                  {visual.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
        </View>
        <View style={isInline ? styles.paymentBand : undefined}>
        <LedgerSectionHead
          icon={<Hash size={15} color={Theme.primary} strokeWidth={2.2} />}
          iconTone="ref"
          title="Reference / UTR"
          hint={isCash ? "Optional for cash payments" : "NEFT / UPI / bank transaction reference"}
        />
        <View style={[styles.ledgerInputWrap, !!utrText && !!utrError && styles.textFieldError]}>
          <TextInput
            style={styles.ledgerInput}
            value={utrText}
            onChangeText={(text) => setUtrText(normalizeComplianceUtr(text))}
            editable={!submitting}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={isCash ? "UTR or reference (optional)" : "Enter UTR or bank reference"}
            placeholderTextColor={LedgerSyncPalette.muted}
            accessibilityLabel="UTR / reference number"
          />
        </View>
        {utrText && utrError ? <Text style={styles.fieldError}>{utrError}</Text> : null}
        </View>
        <View style={isInline ? styles.paymentBand : undefined}>
        <LedgerSectionHead
          icon={<Clock size={15} color={LedgerSyncPalette.ink} strokeWidth={2.2} />}
          iconTone="date"
          title="Sync date"
          hint="When this payment was made"
        />
        <View style={styles.dateInlineRow}>
          <Pressable
            onPress={() => !submitting && setTxnDateText(txnIsoToDisplay(todayIso))}
            style={[styles.datePreset, txnIso === todayIso && styles.datePresetOn]}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Today"
          >
            <Text style={[styles.datePresetText, txnIso === todayIso && styles.datePresetTextOn]}>
              Today
            </Text>
          </Pressable>
          <Pressable
            onPress={() => !submitting && setTxnDateText(txnIsoToDisplay(yesterdayIso))}
            style={[styles.datePreset, txnIso === yesterdayIso && styles.datePresetOn]}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Yesterday"
          >
            <Text style={[styles.datePresetText, txnIso === yesterdayIso && styles.datePresetTextOn]}>
              Yesterday
            </Text>
          </Pressable>
          <View style={styles.dateFieldGrow}>
            <TxnDateInput
              value={txnDateText}
              onChange={setTxnDateText}
              disabled={submitting}
              hasError={!!txnDateText && !!txnDateError}
              compact={isInline}
            />
          </View>
        </View>
        {txnDateText.length >= 10 && txnDateError ? <Text style={styles.fieldError}>{txnDateError}</Text> : null}
        </View>
        {payoutAccounts.length > 0 ? (
          <>
            <Text style={styles.paidFromLabel}>Paid from (optional)</Text>
            <View style={[styles.modeRow, styles.wrapRow]}>
              {payoutAccounts.map((item) => {
                const selected = paidFromId === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setPaidFromId(selected ? null : item.id)}
                    style={[styles.paidFromChip, selected && styles.paidFromChipOn]}
                    disabled={submitting}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text
                      style={[styles.paidFromChipText, selected && styles.paidFromChipTextOn]}
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
          <Text style={[styles.rejectText, isInline && styles.rejectTextInline]}>Reject</Text>
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
          <Text style={[styles.confirmText, isInline && styles.confirmTextInline]}>Confirm payment</Text>
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
        {readOnly ? null : (
        <View style={styles.inlineHeader}>
          <Text style={styles.inlineTitle}>Confirm payment</Text>
          {introText}
        </View>
        )}
        <View style={styles.inlineStack}>
          {detailsRow}
          {readOnly ? null : modeField}
          <View style={[styles.actionsBar, styles.actionsBarInline]}>{actionsRow}</View>
        </View>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 12,
  },
  modalHeader: { gap: 4 },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: SHOP.ink,
  },
  body: {
    fontSize: 12,
    fontWeight: "500",
    color: SHOP.muted,
    lineHeight: 16,
  },
  bodyInline: {
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 14,
  },
  inlineRoot: {
    width: "100%",
    minWidth: 0,
    paddingTop: 2,
    paddingBottom: 0,
    gap: 8,
    backgroundColor: "transparent",
  },
  inlineStack: {
    width: "100%",
    minWidth: 0,
    gap: 10,
  },
  inlineHeader: {
    flexShrink: 0,
    gap: 2,
    paddingHorizontal: 2,
  },
  inlineTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: LedgerSyncPalette.ink,
  },
  ledgerCard: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  ledgerHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 0,
    paddingBottom: 2,
  },
  ledgerHeadText: { flex: 1, minWidth: 0, gap: 2 },
  ledgerIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ledgerIconMode: { backgroundColor: "rgba(16,185,129,0.08)" },
  ledgerIconRef: { backgroundColor: "rgba(99,102,241,0.08)" },
  ledgerIconDate: { backgroundColor: LedgerSyncPalette.page },
  ledgerIconAmount: { backgroundColor: "rgba(16,185,129,0.08)" },
  ledgerIconTrip: { backgroundColor: Theme.primaryLight },
  ledgerEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: LedgerSyncPalette.ink,
    letterSpacing: -0.1,
  },
  ledgerHint: {
    fontSize: 10,
    fontWeight: "500",
    color: LedgerSyncPalette.muted,
    lineHeight: 14,
  },
  modeTileRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    flexWrap: "wrap",
    gap: 8,
  },
  modeTileCell: { flex: 1, minWidth: 0 },
  ledgerInputWrap: {
    backgroundColor: LedgerSyncPalette.page,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  ledgerInput: {
    fontSize: 15,
    fontWeight: "600",
    color: LedgerSyncPalette.ink,
    paddingVertical: 12,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  } as never,
  dateInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    width: "100%",
    minWidth: 0,
  },
  datePreset: {
    height: 32,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LedgerSyncPalette.page,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LedgerSyncPalette.border,
  },
  datePresetOn: {
    backgroundColor: LedgerSyncPalette.ink,
    borderColor: LedgerSyncPalette.ink,
  },
  datePresetText: {
    fontSize: 11,
    fontWeight: "700",
    color: LedgerSyncPalette.ink,
  },
  datePresetTextOn: { color: Theme.cardWhite },
  dateFieldGrow: { flexGrow: 1, flexBasis: 160, minWidth: 140 },
  paidFromLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: LedgerSyncPalette.muted,
  },
  paidFromChip: {
    height: 28,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LedgerSyncPalette.page,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: LedgerSyncPalette.border,
  },
  paidFromChipOn: {
    borderColor: LedgerSyncPalette.ink,
    backgroundColor: Theme.cardWhite,
  },
  paidFromChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: LedgerSyncPalette.muted,
  },
  paidFromChipTextOn: { color: LedgerSyncPalette.ink },
  amountHeroValue: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    flexShrink: 0,
  },
  amountRupee: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.darkGreen,
  },
  columns: { gap: 8 },
  columnsWide: { flexDirection: "row", alignItems: "stretch" },
  columnsInline: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  column: { minWidth: 0 },
  columnWide: { flex: 1, flexBasis: 0 },
  columnInline: { minWidth: 0 },
  inlineScroll: { flex: 1, minHeight: 0 },
  inlineScrollContent: { flexGrow: 1, gap: 8, paddingBottom: 4 },
  factCard: {
    flexGrow: 1,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    paddingBottom: 4,
  },
  factCardInline: {
    paddingBottom: 2,
  },
  factRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.complianceTripCardBorder,
  },
  factRowCompact: {
    minHeight: 22,
    gap: 8,
    paddingVertical: 2,
  },
  factRowEmphasize: {
    minHeight: 26,
    backgroundColor: "#FAFBFC",
  },
  factRowEmphasizeCompact: {
    minHeight: 24,
  },
  factLabel: {
    flexShrink: 0,
    width: 92,
    paddingTop: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
    letterSpacing: 0.25,
    textTransform: "uppercase",
    color: SHOP.muted,
  },
  factLabelCompact: {
    fontSize: 9,
    lineHeight: 12,
  },
  factLabelEmphasize: {
    fontWeight: "600",
    color: SHOP.ink,
  },
  factValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: SHOP.ink,
    textAlign: "right",
  },
  factValueEmphasize: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: Theme.darkGreen,
  },
  factValueCompact: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
  },
  factValueEmphasizeCompact: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: Theme.darkGreen,
  },
  docAction: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  eyeBtn: {
    ...complianceActionButtonStyles.ghost,
    minWidth: 0,
    paddingHorizontal: 8,
    flexDirection: "row",
    gap: 4,
  },
  eyeBtnInline: {
    minHeight: 24,
    paddingHorizontal: 10,
  },
  eyeBtnDisabled: { opacity: 0.45 },
  eyeText: { ...complianceActionButtonStyles.ghostText },
  eyeTextInline: { fontSize: 10, lineHeight: 12 },
  calcCard: {
    flexGrow: 1,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: Theme.complianceTripCardBorder,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
    paddingBottom: 8,
    gap: 0,
  },
  calcCardInline: {
    paddingBottom: 4,
  },
  calcTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: SHOP.ink,
    textTransform: "uppercase",
  },
  calcTitleInline: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
  },
  calcHint: {
    fontSize: 10,
    fontWeight: "500",
    color: SHOP.muted,
    lineHeight: 13,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 2,
  },
  calcHintInline: {
    fontSize: 9,
    lineHeight: 12,
    paddingTop: 4,
    paddingBottom: 1,
  },
  calcRow: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SHOP.hairline,
  },
  calcRowInline: {
    minHeight: 24,
    paddingVertical: 2,
  },
  calcRowTds: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SHOP.hairline,
  },
  calcRowTdsInline: {
    minHeight: 28,
    paddingVertical: 2,
  },
  calcLabelBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  calcLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: SHOP.muted,
  },
  calcLabelInline: {
    fontSize: 10,
    lineHeight: 13,
  },
  calcLabelGrow: {
    flex: 1,
    minWidth: 0,
  },
  calcMeta: {
    fontSize: 10,
    fontWeight: "500",
    color: SHOP.muted,
    letterSpacing: 0.1,
  },
  calcMetaInline: {
    fontSize: 9,
    lineHeight: 12,
  },
  calcValue: {
    fontSize: 12,
    fontWeight: "700",
    color: SHOP.ink,
    textAlign: "right",
  },
  calcValueInline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  calcValueMuted: {
    fontSize: 12,
    fontWeight: "600",
    color: SHOP.muted,
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
    borderRadius: 999,
    backgroundColor: Theme.positiveMuted,
  },
  tdsRateChipText: {
    fontSize: 10,
    fontWeight: "700",
    color: Theme.darkGreen,
    letterSpacing: 0.2,
  },
  tdsAmountValue: {
    minWidth: 68,
    color: SHOP.ink,
  },
  pctField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 28,
    width: 76,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SHOP.hairline,
    backgroundColor: "#F7F7F8",
  },
  pctFieldInline: {
    height: 26,
    width: 72,
    paddingHorizontal: 8,
  },
  pctInput: {
    flex: 1,
    minWidth: 28,
    paddingVertical: 0,
    fontSize: 12,
    fontWeight: "700",
    color: SHOP.ink,
    textAlign: "right",
  },
  pctInputInline: {
    fontSize: 11,
    lineHeight: 14,
  },
  pctSuffix: {
    fontSize: 12,
    fontWeight: "700",
    color: SHOP.muted,
  },
  pctSuffixInline: {
    fontSize: 11,
    lineHeight: 14,
  },
  amountResult: {
    marginTop: 4,
    marginHorizontal: 0,
    marginBottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 0,
    backgroundColor: LedgerSyncPalette.emeraldSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  amountResultInline: {
    marginTop: 8,
    paddingVertical: 8,
  },
  amountResultCopy: { flex: 1, minWidth: 0, gap: 2 },
  amountResultLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: SHOP.ink,
    letterSpacing: 0.1,
  },
  amountResultLabelInline: {
    fontSize: 10,
    lineHeight: 13,
  },
  amountResultHint: {
    fontSize: 10,
    fontWeight: "500",
    color: SHOP.muted,
  },
  amountResultValue: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: Theme.darkGreen,
  },
  amountResultValueInline: {
    fontSize: 22,
    lineHeight: 26,
  },
  field: { gap: 6 },
  fieldInline: {
    flexShrink: 0,
    gap: 10,
    padding: 0,
    overflow: "hidden",
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: Theme.cardWhite,
  },
  fieldFill: { width: "100%", minWidth: 0 },
  paymentBody: {
    gap: 10,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 2,
  },
  paymentBodyFill: { width: "100%", gap: 12 },
  paymentBand: { gap: 8 },
  modeChoice: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 88,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.borderLight,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 8,
  },
  modeChoiceLabel: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    textAlign: "center",
    color: Theme.textSecondary,
  },
  label: { fontSize: 11, fontWeight: "600", color: SHOP.muted },
  labelInline: { fontSize: 10, lineHeight: 13 },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  modeRowInline: {
    padding: 3,
    borderRadius: 8,
    backgroundColor: Theme.liquidPillBg,
    gap: 3,
  },
  wrapRow: { flexWrap: "wrap" },
  paymentInputsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  paymentInputCell: { flexGrow: 1, flexBasis: 220, minWidth: 160, gap: 6 },
  textField: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SHOP.hairline,
    borderRadius: 10,
    fontSize: 14,
    color: SHOP.ink,
    backgroundColor: Theme.cardWhite,
  },
  textFieldInline: {
    minHeight: 32,
    paddingHorizontal: 8,
    fontSize: 11,
    lineHeight: 14,
  },
  dateShell: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SHOP.hairline,
    borderRadius: 10,
    backgroundColor: Theme.cardWhite,
    overflow: "hidden",
  },
  dateShellInline: {
    minHeight: 32,
  },
  dateText: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    fontSize: 13,
    color: SHOP.ink,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  } as never,
  dateTextInline: {
    minHeight: 30,
    fontSize: 11,
    lineHeight: 14,
  },
  dateIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    flexShrink: 0,
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
  dateSheetTitle: { fontSize: 15, fontWeight: "700", color: SHOP.ink },
  dateSheetMuted: { fontSize: 15, color: SHOP.muted },
  dateSheetDone: { fontSize: 15, fontWeight: "700", color: SHOP.ink },
  textFieldError: { borderColor: SHOP.danger },
  fieldError: { fontSize: 11, color: SHOP.danger },
  modeChip: {
    flex: 1,
    minWidth: 0,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 0,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  modeChipInline: {
    height: 24,
    borderRadius: 6,
  },
  modeChipOn: {
    backgroundColor: "#282C3F",
  },
  modeChipText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#696B79",
    textAlign: "center",
    letterSpacing: -0.1,
  },
  modeChipTextInline: {
    fontSize: 10,
    lineHeight: 12,
  },
  modeChipTextOn: { color: Theme.cardWhite },
  actionsBar: {
    alignItems: "center",
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SHOP.hairline,
  },
  actionsBarInline: {
    flexShrink: 0,
    paddingTop: 8,
    paddingHorizontal: 2,
    paddingBottom: 2,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    width: "100%",
  },
  actionsWithSecondary: { gap: 8 },
  rejectBtn: {
    ...complianceActionButtonStyles.ghost,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 72,
    borderColor: Theme.complianceGroupDangerDot,
  },
  rejectBtnInline: {
    minHeight: COMPLIANCE_ACTION_BTN.height,
  },
  rejectBtnPressed: { opacity: 0.8 },
  rejectText: {
    ...complianceActionButtonStyles.ghostText,
    color: SHOP.danger,
  },
  rejectTextInline: {
    fontSize: 10,
    lineHeight: 12,
  },
  cancelBtn: {
    ...complianceActionButtonStyles.ghost,
    flexGrow: 0,
    flexShrink: 0,
  },
  cancelText: { ...complianceActionButtonStyles.ghostText },
  confirmBtn: {
    ...complianceActionButtonStyles.primary,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 128,
    minHeight: 36,
    paddingHorizontal: 16,
    backgroundColor: LedgerSyncPalette.ink,
  },
  confirmBtnInline: {
    minHeight: 32,
  },
  confirmBtnDisabled: { opacity: 0.45 },
  confirmText: {
    ...complianceActionButtonStyles.primaryText,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  confirmTextInline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
});
