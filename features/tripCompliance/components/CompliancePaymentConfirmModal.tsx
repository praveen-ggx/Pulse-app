import Theme from "@/constants/Theme";
import {
  guessCompliancePreviewMime,
  signCompliancePreviewUrl,
} from "@/features/tripCompliance/services/complianceDocumentView.service";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
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
import { Eye } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
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
  remark?: string;
};

export function CompliancePaymentConfirmModal({
  visible,
  summary,
  category,
  submitting,
  onCancel,
  onConfirm,
  onReject,
  presentation = "modal",
}: {
  visible: boolean;
  summary: ComplianceTripSummary | null;
  category: ComplianceLedgerCategory | null;
  submitting: boolean;
  onCancel?: () => void;
  onConfirm: (values: CompliancePaymentConfirmValues) => void;
  /** Inline only: trip-level Reject shown beside Confirm payment. */
  onReject?: () => void;
  /** `inline` embeds the form in the Advance Payment panel (no popup). */
  presentation?: "modal" | "inline";
}) {
  const { height, width: windowWidth } = useWindowDimensions();
  const isInline = presentation === "inline";
  const [advancePercentText, setAdvancePercentText] = useState(
    String(COMPLIANCE_DEFAULT_ADVANCE_PERCENT),
  );
  const [modeId, setModeId] = useState<string>("UPI");
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
      const ownedType = owned.vehicle?.vehicle_type?.trim() || "";
      if (ownedType) {
        if (!cancelled) setTruckType(ownedType);
        return;
      }
      const shared = await getVehicleForTripViewer(vehicleId, trip.id, orgId);
      if (!cancelled)
        setTruckType(shared.vehicle?.vehicle_type?.trim() || null);
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

  const amountOk = computedAmount > 0;
  const mode = PAYMENT_MODES.find((item) => item.id === modeId);
  const canSubmit =
    amountOk &&
    !!mode &&
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
      You are about to post {article} {categoryLabel} payment through the Finance ledger. From
      Advance Processed you can send the trip back to Verified if you need to post it again.
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
            editable={!submitting}
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
    </View>
  );

  const actionsRow = (
    <View style={[styles.actions, (onReject || onCancel) && styles.actionsWithSecondary]}>
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
          });
        }}
      >
        {submitting ? (
          <ActivityIndicator color={Theme.buttonDarkText} />
        ) : (
          <Text style={styles.confirmText}>Confirm payment</Text>
        )}
      </Pressable>
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
        {detailsRow}
        {modeField}
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
  columnsInline: { flex: 1, minHeight: 0, gap: 8 },
  column: { minWidth: 0 },
  columnWide: { flex: 1, flexBasis: 0 },
  columnInline: { flex: 1, minHeight: 0 },
  factCard: {
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: Theme.compliancePageBg,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
  },
  factCardInline: {
    flex: 1,
    minHeight: 0,
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 0,
    overflow: "hidden",
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
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 4,
    overflow: "hidden",
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
