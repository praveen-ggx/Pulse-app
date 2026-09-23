import { LoadingIndicator } from "@/components/LoadingIndicator";
import Layout from "@/constants/Layout";
import Theme from "@/constants/Theme";
import { useTabBarAwareScrollProps } from "@/contexts/DemoTabBarScrollContext";
import { InvoiceTripCnDnGroup } from "@/features/invoicing/components/InvoiceTripCnDnGroup";
import { TripCompletionOrPodTags } from "@/features/trips/components/TripPodStatusTags";
import { tripIsDeliveredStatus } from "@/features/trips/services/tripDocumentLrPod.service";
import { useInvoiceDraftClientsQuery } from "@/features/invoicing/hooks/useInvoiceDraftClients";
import {
  invoiceOnlyCharges,
  invoiceTripAdjustedAmount,
  mergeInvoiceChargesWithTripCnDn,
} from "@/features/invoicing/services/invoiceCnDn.service";
import type {
  AdditionalCharge,
  InvoicePayload,
  InvoicingTripView,
} from "@/features/invoicing/services/invoicing.service";
import type { InvoiceIssuerIdentity } from "@/features/invoicing/services/invoiceIssuerIdentity.service";
import {
  buildInvoiceDraftModel,
  displayInvoicePreviewDate,
  formatInvoicePreviewDate,
  invoiceDraftTaxDisplay,
  uniqueTripClientIds,
  type InvoiceDraftModel,
} from "@/features/invoicing/services/invoicePreviewModel.service";
import {
  invoicePreviewCanSaveDraft,
  resolveInvoicePreviewItemSource,
} from "@/features/invoicing/utils/financeInvoicePreview.util";
import { ProvisionAdjustmentModal } from "@/features/trips/components/trip-detail/adjustment/ProvisionAdjustmentModal";
import {
  addTripAdjustment,
  updateTripAdjustment,
  type TripAdjustment,
} from "@/features/trips/services/tripAdjustments";
import {
  adjustmentsForTripId,
  useInvalidateTripFinanceAdjustments,
  useTripFinanceAdjustmentsMap,
} from "@/lib/queries/useTripFinanceAdjustmentsQuery";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useMemo, useState } from "react";
import {
    Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useLayoutInsets } from "@/lib/layoutInsets";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface InvoicePreviewPanelProps {
  onClose?: () => void;
  onPreview: (params: Record<string, string>) => void; // Changed from onFinalize to onPreview
  /** Parent execute screen owns persist. Preview route stays mutation-free. */
  onIssue?: (args: { internalIds: string[]; payload: InvoicePayload }) => void;
  isFinalizing: boolean; // This will now represent the state of PDF generation/navigation
  isIssuing?: boolean;
  activeClient: string | null;
  selectedTrips: InvoicingTripView[];
  isStandalone?: boolean;
  issuer: InvoiceIssuerIdentity | null;
  workspaceOrgId?: string | null;
  previewExpanded?: boolean;
  onToggleExpand?: () => void;
  onEditClient?: (clientId: string) => void;
  /** UI gate only — does not change executeInvoiceCreation. */
  invoiceBuildBlockedReason?: string | null;
  /** UI gate only — Issue still revalidates policy in executeInvoiceCreation. */
  invoiceIssueBlockedReason?: string | null;
  density?: "default" | "compact";
  onSaveDraft?: () => void;
  saveDraftLabel?: string;
  readOnly?: boolean;
  /** Canonical draft from Manual Invoice — same InvoiceDraftModel as trip preview. */
  externalDraft?: InvoiceDraftModel | null;
  onIssueExternal?: () => void;
}

const PAYMENT_TERMS_OPTIONS = [
  "Due on Receipt",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
];

export function InvoicePreviewPanel({
  onClose,
  onPreview, // Changed from onFinalize
  onIssue,
  isFinalizing,
  isIssuing = false,
  activeClient,
  selectedTrips,
  isStandalone = false,
  issuer,
  workspaceOrgId = null,
  previewExpanded = false,
  onToggleExpand,
  onEditClient,
  invoiceBuildBlockedReason = null,
  invoiceIssueBlockedReason = null,
  density = "default",
  onSaveDraft,
  saveDraftLabel = "Save as Draft",
  readOnly = false,
  externalDraft = null,
  onIssueExternal,
}: InvoicePreviewPanelProps) {
  const insets = useSafeAreaInsets();
  const layout = useLayoutInsets();
  const tabBarScrollProps = useTabBarAwareScrollProps();

  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [notes, setNotes] = useState("");

  const [includeGst, setIncludeGst] = useState(false);
  const [gstRate, setGstRate] = useState(5);
  const [includeFuel, setIncludeFuel] = useState(false);
  const [fuelRate, setFuelRate] = useState(2.5);
  const [additionalCharges, setAdditionalCharges] = useState<
    AdditionalCharge[]
  >([]);
  const [previewDate] = useState(() => formatInvoicePreviewDate(new Date()));
  const [cnDnTrip, setCnDnTrip] = useState<InvoicingTripView | null>(null);
  const [cnDnEdit, setCnDnEdit] = useState<TripAdjustment | null>(null);
  const [showSplit, setShowSplit] = useState(true);

  const selectedTripInternalIds = useMemo(
    () => selectedTrips.map((t) => t.internal_id).filter(Boolean),
    [selectedTrips],
  );
  const { record: tripAdjustmentsRecord } = useTripFinanceAdjustmentsMap(
    workspaceOrgId,
    selectedTripInternalIds,
  );
  const invalidateTripAdjustments = useInvalidateTripFinanceAdjustments();

  const clientIds = useMemo(
    () => uniqueTripClientIds(selectedTrips),
    [selectedTrips],
  );
  const { data: fetchedClients = [] } = useInvoiceDraftClientsQuery(
    workspaceOrgId,
    clientIds,
  );

  const invoiceConfig = useMemo(
    () => ({
      includeGst,
      gstRate,
      includeFuel,
      fuelRate,
      additionalCharges: mergeInvoiceChargesWithTripCnDn(
        additionalCharges,
        selectedTrips,
        tripAdjustmentsRecord,
      ),
    }),
    [
      additionalCharges,
      fuelRate,
      gstRate,
      includeFuel,
      includeGst,
      selectedTrips,
      tripAdjustmentsRecord,
    ],
  );

  const draft = useMemo(() => {
    if (externalDraft) return externalDraft;
    if (!issuer || selectedTrips.length === 0) return null;
    return buildInvoiceDraftModel({
      issuer,
      trips: selectedTrips,
      config: invoiceConfig,
      previewDate,
      paymentTerms,
      notes,
      fetchedClients,
      displayNameFallback: activeClient,
    });
  }, [
    activeClient,
    fetchedClients,
    invoiceConfig,
    issuer,
    notes,
    paymentTerms,
    previewDate,
    selectedTrips,
    externalDraft,
  ]);

  const taxDisplay = draft ? invoiceDraftTaxDisplay(draft.tax) : null;
  const canSaveDraft = invoicePreviewCanSaveDraft({
    hasExternalDraft: Boolean(externalDraft),
    selectedTripCount: selectedTrips.length,
  });
  const previewLines = draft?.lines ?? [];
  const invoiceNumberLabel = draft?.invoice_number_label ?? "DRAFT";
  const previewItemSource = resolveInvoicePreviewItemSource({
    selectedTripCount: selectedTrips.length,
    draftLineCount: previewLines.length,
  });

  const handleAddCharge = useCallback((tripId?: string) => {
    setAdditionalCharges((prev) => {
      if (!tripId) {
        const hasEmptyGlobal = prev.some(
          (c) => !c.tripId && c.description.trim() === "" && Math.abs(c.amount) === 0,
        );
        if (hasEmptyGlobal) return prev;
      }
      return [
        ...prev,
        { id: Date.now().toString(), description: "", amount: 0, tripId },
      ];
    });
  }, []);

  const handleUpdateCharge = useCallback(
    (id: string, field: "description" | "amount", value: string | number) => {
      setAdditionalCharges((prev) =>
        prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
      );
    },
    [],
  );

  const handleRemoveCharge = useCallback((id: string) => {
    setAdditionalCharges((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const closeCnDnModal = useCallback(() => {
    setCnDnTrip(null);
    setCnDnEdit(null);
  }, []);

  const handleSaveTripCnDn = useCallback(
    async (params: {
      type: "revenue" | "cost";
      impact: "plus" | "minus";
      amount: number;
      reason: string;
    }) => {
      const tripId = cnDnTrip?.internal_id?.trim();
      const orgId = workspaceOrgId?.trim();
      if (!tripId || !orgId) {
        Alert.alert(
          "Credit / debit note",
          "This trip is not linked, so the note cannot be saved to finance.",
        );
        return;
      }
      await addTripAdjustment(
        tripId,
        {
          type: "revenue",
          impact: params.impact,
          amount: params.amount,
          reason: params.reason,
        },
        { organizationId: orgId, missionKey: cnDnTrip?.id ?? null },
      );
      await invalidateTripAdjustments();
    },
    [cnDnTrip, invalidateTripAdjustments, workspaceOrgId],
  );

  const handleUpdateTripCnDn = useCallback(
    async (
      adjustmentId: string,
      params: {
        type: "revenue" | "cost";
        impact: "plus" | "minus";
        amount: number;
        reason: string;
      },
    ) => {
      const tripId = cnDnTrip?.internal_id?.trim();
      if (!tripId) return;
      await updateTripAdjustment(tripId, adjustmentId, {
        type: "revenue",
        impact: params.impact,
        amount: params.amount,
        reason: params.reason,
      });
      await invalidateTripAdjustments();
    },
    [cnDnTrip, invalidateTripAdjustments],
  );

  const formatCurrency = (val: number) => {
    return (
      "₹" +
      val.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  const handleInitiatePreview = async () => {
    if (invoiceBuildBlockedReason) return;
    if (selectedTrips.length === 0) return;

    const params = {
      activeClient: activeClient || "",
      selectedTripIds: JSON.stringify(
        selectedTrips.map((t) => t.internal_id || t.id),
      ),
      paymentTerms,
      notes,
      includeGst: includeGst.toString(),
      gstRate: gstRate.toString(),
      includeFuel: includeFuel.toString(),
      fuelRate: fuelRate.toString(),
      additionalCharges: JSON.stringify(invoiceOnlyCharges(additionalCharges)),
      previewDate,
      showSplit: showSplit ? "true" : "false",
    };
    onPreview(params);
  };

  const issueBlocked =
    !onIssue ||
    isIssuing ||
    isFinalizing ||
    (!externalDraft && selectedTrips.length === 0) ||
    Boolean(invoiceBuildBlockedReason) ||
    Boolean(invoiceIssueBlockedReason) ||
    !draft ||
    draft.tax.status === "blocked";

  const handleIssueInvoice = () => {
    if (issueBlocked || !draft) return;
    if (externalDraft && onIssueExternal) {
      onIssueExternal();
      return;
    }
    if (!onIssue) return;
    const internalIds = selectedTrips
      .map((t) => t.internal_id || t.id)
      .filter((id) => Boolean(id));
    if (internalIds.length === 0) return;
    onIssue({
      internalIds,
      payload: {
        notes,
        paymentTerms,
        includeGst,
        gstRate,
        includeFuel,
        fuelRate,
        additionalCharges: invoiceOnlyCharges(additionalCharges),
        clientName: activeClient ?? undefined,
        calculations: {
          subtotal: draft.tax.taxable_base,
          sgst: draft.tax.sgst_amount,
          cgst: draft.tax.cgst_amount,
          igst: draft.tax.igst_amount,
          totalAmount: draft.tax.total_amount,
        },
      },
    });
  };

  const globalCharges = additionalCharges.filter((c) => !c.tripId);
  const primaryTrip = selectedTrips[0] ?? null;
  const routeParts = primaryTrip?.route
    ? primaryTrip.route.split(/\s*->\s*|\s*→\s*/).map((p) => p.trim())
    : [];
  const pickupLabel = routeParts[0] || "—";
  const deliveryLabel = routeParts[1] || routeParts[0] || "—";
  const customerLabel =
    draft?.client.legal_name ||
    draft?.client.display_name ||
    activeClient ||
    "Select a customer…";
  const dueDateLabel = draft?.indicative_due_date
    ? displayInvoicePreviewDate(draft.indicative_due_date)
    : "—";
  const invoiceDateLabel = displayInvoicePreviewDate(previewDate);

  return (
    <View
      style={[
        styles.sheet,
        density === "compact" && styles.sheetCompact,
        !isStandalone &&
          density !== "compact" && {
            paddingTop: insets.top > 0 ? insets.top : 16,
          },
      ]}
    >
      <View style={[styles.header, density === "compact" && styles.headerCompact]}>
        <View style={styles.headerCopy}>
          <View style={styles.headerTitleRow}>
            {onClose ? (
              <Pressable
                style={styles.backBtn}
                onPress={onClose}
                disabled={isFinalizing}
                accessibilityRole="button"
                accessibilityLabel="Close invoice draft"
                hitSlop={Layout.touchTargetHitSlop}
              >
                <FontAwesome
                  name="arrow-left"
                  size={14}
                  color={Theme.textPrimaryDark}
                />
              </Pressable>
            ) : null}
            <Text
              style={[
                styles.headerTitle,
                density === "compact" && styles.headerTitleCompact,
              ]}
            >
              {externalDraft && !readOnly
                ? "Manual Invoice Preview"
                : "Invoice Preview"}
            </Text>
            <View style={styles.draftBadge}>
              <Text style={styles.draftBadgeText}>
                {readOnly ? invoiceNumberLabel : "Draft"}
              </Text>
            </View>
          </View>
          <Text style={styles.headerSub}>
            {readOnly
              ? `${customerLabel} · Preview date ${invoiceDateLabel}`
              : `${customerLabel} · Preview date ${invoiceDateLabel} · Number assigned on issue`}
          </Text>
        </View>
        <View style={styles.headerActions}>
          {onToggleExpand ? (
            <Pressable
              style={styles.headerIconBtn}
              onPress={onToggleExpand}
              accessibilityRole="button"
              accessibilityLabel={
                previewExpanded ? "Restore preview size" : "Expand preview"
              }
            >
              <FontAwesome
                name={previewExpanded ? "compress" : "expand"}
                size={16}
                color={Theme.textPrimaryDark}
              />
            </Pressable>
          ) : null}
          {onClose ? (
            <Pressable
              style={styles.headerIconBtn}
              onPress={onClose}
              disabled={isFinalizing}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <FontAwesome
                name="times"
                size={18}
                color={Theme.textPrimaryDark}
              />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          previewExpanded && styles.bodyContentExpanded,
        ]}
        {...tabBarScrollProps}
      >
        <View
          style={[
            styles.document,
            previewExpanded && styles.documentExpanded,
          ]}
        >
        {/* Customer Details — form field grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Details</Text>
          <View style={styles.customerNameBlock}>
            <View style={styles.fieldLabelRow}>
              <Text style={[styles.fieldLabel, styles.fieldLabelFlush]}>
                Customer Name
              </Text>
              {draft?.client.client_id && onEditClient ? (
                <Pressable
                  style={styles.editClientBtn}
                  onPress={() => onEditClient(draft.client.client_id!)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit client details"
                  hitSlop={Layout.touchTargetHitSlop}
                >
                  <FontAwesome name="pencil" size={11} color={Theme.primary} />
                  <Text style={styles.editClientBtnText}>Edit</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.fieldValueBox}>
              <Text style={styles.fieldValueText} numberOfLines={1}>
                {customerLabel}
              </Text>
            </View>
            {draft?.client.billing_address || draft?.client.gstin ? (
              <Text style={styles.fieldHint} numberOfLines={2}>
                {[
                  draft.client.billing_address,
                  draft.client.gstin ? `GSTIN ${draft.client.gstin}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}
          </View>
          <View style={styles.fieldGridMeta}>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Invoice Number</Text>
              <View style={[styles.fieldValueBox, styles.fieldValueMuted]}>
                <Text style={styles.fieldValueMutedText} numberOfLines={1}>
                  {invoiceNumberLabel}
                </Text>
              </View>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Terms</Text>
              <View style={styles.settingsSelectWrap}>
                <Pressable
                  style={styles.settingsSelect}
                  onPress={() => setShowTermsModal((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel="Payment terms"
                >
                  <Text style={styles.settingsSelectText}>{paymentTerms}</Text>
                  <FontAwesome
                    name={showTermsModal ? "chevron-up" : "chevron-down"}
                    size={12}
                    color={Theme.textMuted}
                  />
                </Pressable>
                {Platform.OS === "web" ? (
                  showTermsModal ? (
                    <View style={styles.webTermsDropdown}>
                      {PAYMENT_TERMS_OPTIONS.map((term) => (
                        <Pressable
                          key={term}
                          style={styles.termOption}
                          onPress={() => {
                            setPaymentTerms(term);
                            setShowTermsModal(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.termOptionText,
                              paymentTerms === term && styles.termOptionActive,
                            ]}
                          >
                            {term}
                          </Text>
                          {paymentTerms === term ? (
                            <FontAwesome
                              name="check"
                              size={14}
                              color={Theme.primary}
                            />
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null
                ) : (
                  <Modal
                    visible={showTermsModal}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowTermsModal(false)}
                  >
                    <Pressable
                      style={styles.modalOverlay}
                      onPress={() => setShowTermsModal(false)}
                    >
                      <Pressable
                        style={styles.termsModalContent}
                        onPress={() => {}}
                      >
                        {PAYMENT_TERMS_OPTIONS.map((term) => (
                          <Pressable
                            key={term}
                            style={styles.termOption}
                            onPress={() => {
                              setPaymentTerms(term);
                              setShowTermsModal(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.termOptionText,
                                paymentTerms === term &&
                                  styles.termOptionActive,
                              ]}
                            >
                              {term}
                            </Text>
                            {paymentTerms === term ? (
                              <FontAwesome
                                name="check"
                                size={14}
                                color={Theme.primary}
                              />
                            ) : null}
                          </Pressable>
                        ))}
                      </Pressable>
                    </Pressable>
                  </Modal>
                )}
              </View>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Due Date</Text>
              <View style={styles.fieldValueBox}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {dueDateLabel}
                </Text>
              </View>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Invoice Date</Text>
              <View style={styles.fieldValueBox}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {invoiceDateLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Transport Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transport Details</Text>
          <View style={styles.fieldGrid}>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Consignor</Text>
              <View style={styles.fieldValueBox}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {issuer?.businessName || "—"}
                </Text>
              </View>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Consignee</Text>
              <View style={styles.fieldValueBox}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {customerLabel}
                </Text>
              </View>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Trip ID</Text>
              <View style={styles.fieldValueBox}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {primaryTrip?.id || "—"}
                </Text>
              </View>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Trip Date</Text>
              <View style={styles.fieldValueBox}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {primaryTrip?.date || "—"}
                </Text>
              </View>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Pickup Location</Text>
              <View style={styles.fieldValueBox}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {primaryTrip ? pickupLabel : "—"}
                </Text>
              </View>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Delivery Location</Text>
              <View style={styles.fieldValueBox}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {primaryTrip ? deliveryLabel : "—"}
                </Text>
              </View>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>Issuer State</Text>
              <View style={styles.fieldValueBox}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {issuer?.state || "—"}
                </Text>
              </View>
            </View>
            <View style={styles.fieldCell}>
              <Text style={styles.fieldLabel}>GSTIN</Text>
              <View style={styles.fieldValueBox}>
                <Text style={styles.fieldValueText} numberOfLines={1}>
                  {issuer?.gstNotApplicable
                    ? "Not applicable"
                    : issuer?.gstin || "—"}
                </Text>
              </View>
            </View>
          </View>
          {selectedTrips.length > 1 ? (
            <Text style={styles.fieldHint}>
              Showing transport for the first of {selectedTrips.length} selected
              trips. All trips appear in Items below.
            </Text>
          ) : null}
        </View>

        {/* Items table */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
              Items
            </Text>
            {selectedTrips.length > 0 ? (
              <View style={styles.splitToggleRow}>
                <Pressable
                  style={[
                    styles.splitToggleBtn,
                    showSplit && styles.splitToggleBtnOn,
                  ]}
                  onPress={() => setShowSplit(true)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: showSplit }}
                  accessibilityLabel="Show split"
                >
                  <Text
                    style={[
                      styles.splitToggleText,
                      showSplit && styles.splitToggleTextOn,
                    ]}
                  >
                    Show split
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.splitToggleBtn,
                    !showSplit && styles.splitToggleBtnOn,
                  ]}
                  onPress={() => setShowSplit(false)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !showSplit }}
                  accessibilityLabel="No split"
                >
                  <Text
                    style={[
                      styles.splitToggleText,
                      !showSplit && styles.splitToggleTextOn,
                    ]}
                  >
                    No split
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.itemsTable}>
            <View style={styles.itemsHead}>
              <Text style={[styles.itemsHeadCell, styles.colIndex]}>#</Text>
              <Text style={[styles.itemsHeadCell, styles.colDesc]}>
                Description / Trip
              </Text>
              <Text style={[styles.itemsHeadCell, styles.colRoute]}>Route</Text>
              <Text style={[styles.itemsHeadCell, styles.colStatus]}>
                Status
              </Text>
              <Text
                style={[
                  styles.itemsHeadCell,
                  styles.colAmount,
                  styles.itemsHeadRight,
                ]}
              >
                Amount
              </Text>
            </View>

            {globalCharges.map((charge, index) => (
              <View key={charge.id} style={styles.chargeRow}>
                <Text style={[styles.itemsBodyCell, styles.colIndex]}>
                  {index + 1}
                </Text>
                <View style={[styles.chargeContentCol, styles.colDesc]}>
                  <TextInput
                    style={styles.chargeInput}
                    value={charge.description}
                    onChangeText={(t) =>
                      handleUpdateCharge(charge.id, "description", t)
                    }
                    placeholder="Enter description"
                    placeholderTextColor={Theme.textMuted}
                  />
                  <Text style={styles.chargeHint} numberOfLines={1}>
                    Global adjustment
                  </Text>
                </View>
                <View style={[styles.chargeActionsRow, styles.colAmountWide]}>
                  <View style={styles.chargeTypeToggle}>
                    <Pressable
                      style={[
                        styles.chargeTypeBtn,
                        !Object.is(charge.amount, -0) && charge.amount >= 0
                          ? styles.chargeTypeBtnAdd
                          : null,
                      ]}
                      onPress={() =>
                        handleUpdateCharge(
                          charge.id,
                          "amount",
                          Math.abs(charge.amount),
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.chargeTypeText,
                          !Object.is(charge.amount, -0) && charge.amount >= 0
                            ? styles.chargeTypeTextAdd
                            : null,
                        ]}
                      >
                        Add
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.chargeTypeBtn,
                        Object.is(charge.amount, -0) || charge.amount < 0
                          ? styles.chargeTypeBtnMinus
                          : null,
                      ]}
                      onPress={() =>
                        handleUpdateCharge(
                          charge.id,
                          "amount",
                          Object.is(charge.amount, 0)
                            ? -0
                            : -Math.abs(charge.amount),
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.chargeTypeText,
                          Object.is(charge.amount, -0) || charge.amount < 0
                            ? styles.chargeTypeTextMinus
                            : null,
                        ]}
                      >
                        Minus
                      </Text>
                    </Pressable>
                  </View>
                  <View style={styles.chargeAmountWrapper}>
                    <Text style={styles.chargeCurrencySymbol}>₹</Text>
                    <TextInput
                      style={styles.chargeAmountInput}
                      value={Math.abs(charge.amount).toString()}
                      onChangeText={(t) => {
                        const val = parseFloat(t) || 0;
                        const isNeg =
                          Object.is(charge.amount, -0) || charge.amount < 0;
                        handleUpdateCharge(
                          charge.id,
                          "amount",
                          isNeg ? (val === 0 ? -0 : -val) : val,
                        );
                      }}
                      keyboardType="numeric"
                    />
                  </View>
                  <Pressable
                    style={styles.removeChargeBtn}
                    onPress={() => handleRemoveCharge(charge.id)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove charge"
                  >
                    <FontAwesome
                      name="trash-o"
                      size={14}
                      color={Theme.negative}
                    />
                  </Pressable>
                </View>
              </View>
            ))}

            {previewItemSource === "draft-lines" ? (
              previewLines.map((line, index) => (
                <View
                  key={`${line.trip_ref ?? line.description}-${index}`}
                  style={styles.tripItemWrapper}
                  accessibilityLabel={`Preview line ${index + 1}`}
                >
                  <View style={styles.tripItem}>
                    <Text style={[styles.itemsBodyCell, styles.colIndex]}>
                      {index + 1}
                    </Text>
                    <View style={[styles.tripItemMeta, styles.colDesc]}>
                      <Text style={styles.tripItemId} numberOfLines={2}>
                        {line.description}
                      </Text>
                      <Text style={styles.tripItemDate} numberOfLines={1}>
                        {[line.trip_ref, line.hsn_sac ? `HSN ${line.hsn_sac}` : null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </Text>
                    </View>
                    <Text style={[styles.itemsBodyCell, styles.colRoute]} numberOfLines={1}>
                      {line.qty} × {line.rate}
                    </Text>
                    <Text style={[styles.itemsBodyCell, styles.colStatus]}>
                      {line.line_type}
                    </Text>
                    <Text
                      style={[
                        styles.itemsBodyCell,
                        styles.colAmount,
                        styles.itemsHeadRight,
                      ]}
                    >
                      {formatCurrency(line.taxable_value)}
                    </Text>
                  </View>
                </View>
              ))
            ) : previewItemSource === "empty" ? (
              <View style={styles.emptyTrips}>
                <FontAwesome
                  name="file-text-o"
                  size={22}
                  color={Theme.borderMedium}
                  style={{ marginBottom: 8 }}
                />
                <Text style={styles.emptyTripsText}>
                  Select one or more eligible trips or enter manual lines.
                </Text>
              </View>
            ) : (
              selectedTrips.map((trip, index) => {
                const tripNotes = adjustmentsForTripId(
                  tripAdjustmentsRecord,
                  trip.internal_id,
                );
                const revised = invoiceTripAdjustedAmount(
                  trip.amount,
                  tripNotes,
                );
                const hasSplit = Math.abs(revised - trip.amount) >= 0.005;
                const rowNum = globalCharges.length + index + 1;
                return (
                  <View key={trip.id} style={styles.tripItemWrapper}>
                    <View style={styles.tripItem}>
                      <Text style={[styles.itemsBodyCell, styles.colIndex]}>
                        {rowNum}
                      </Text>
                      <View style={[styles.tripItemMeta, styles.colDesc]}>
                        <Text style={styles.tripItemId} numberOfLines={1}>
                          {trip.id}
                        </Text>
                        <Text style={styles.tripItemDate} numberOfLines={1}>
                          {trip.date}
                        </Text>
                      </View>
                      <Text
                        style={[styles.tripItemRoute, styles.colRoute]}
                        numberOfLines={2}
                      >
                        {trip.route}
                      </Text>
                      <View style={[styles.tripItemPodRow, styles.colStatus]}>
                        <TripCompletionOrPodTags
                          compact
                          tripCompleted={tripIsDeliveredStatus(trip.tripStatus)}
                          softCopyReceived={Boolean(trip.digitalPodPresent)}
                          hardCopyReceived={Boolean(trip.physicalPodReceived)}
                        />
                      </View>
                      <View style={[styles.tripItemAmounts, styles.colAmount]}>
                        <Text style={styles.tripItemAmount}>
                          {formatCurrency(revised)}
                        </Text>
                        {showSplit && hasSplit ? (
                          <Text style={styles.tripItemBaseAmount}>
                            Freight {formatCurrency(trip.amount)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <InvoiceTripCnDnGroup
                      trip={trip}
                      adjustments={tripNotes}
                      showBreakdown={showSplit}
                      onAdd={() => {
                        setCnDnEdit(null);
                        setCnDnTrip(trip);
                      }}
                      onEdit={(adj) => {
                        setCnDnEdit(adj);
                        setCnDnTrip(trip);
                      }}
                    />
                  </View>
                );
              })
            )}
          </View>

          <Pressable
            style={styles.addChargeBtn}
            onPress={() => handleAddCharge()}
            accessibilityRole="button"
            accessibilityLabel="Add item"
          >
            <FontAwesome name="plus" size={12} color={Theme.analyticsHeroBg} />
            <Text style={styles.addChargeText}>Add Item</Text>
          </Pressable>
        </View>

        {/* Terms & Conditions */}
        <View style={[styles.section, styles.settingsBlock]}>
          <Text style={styles.sectionTitle}>Terms & Conditions</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add special instructions, PO references, or payment notes…"
            placeholderTextColor={Theme.textMuted}
            multiline
            numberOfLines={3}
          />

          <View style={styles.settingsToggles}>
            <Pressable
              style={styles.checkboxRow}
              onPress={() => setIncludeGst(!includeGst)}
            >
              <View
                style={[styles.checkbox, includeGst && styles.checkboxActive]}
              >
                {includeGst && (
                  <FontAwesome
                    name="check"
                    size={10}
                    color={Theme.screenBackground}
                  />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Apply GST</Text>
              {includeGst && (
                <View style={styles.rateInputWrap}>
                  <TextInput
                    style={styles.rateInput}
                    value={String(gstRate)}
                    onChangeText={(t) => setGstRate(Number.parseFloat(t) || 0)}
                    keyboardType="numeric"
                  />
                  <Text style={styles.rateSuffix}>%</Text>
                </View>
              )}
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => setIncludeFuel(!includeFuel)}
            >
              <View
                style={[styles.checkbox, includeFuel && styles.checkboxActive]}
              >
                {includeFuel && (
                  <FontAwesome
                    name="check"
                    size={10}
                    color={Theme.screenBackground}
                  />
                )}
              </View>
              <Text style={styles.checkboxLabel}>Fuel Surcharge</Text>
              {includeFuel && (
                <View style={styles.rateInputWrap}>
                  <TextInput
                    style={styles.rateInput}
                    value={String(fuelRate)}
                    onChangeText={(t) => setFuelRate(Number.parseFloat(t) || 0)}
                    keyboardType="numeric"
                  />
                  <Text style={styles.rateSuffix}>%</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.calcBlock}>
          {taxDisplay?.warning ? (
            <Text style={styles.taxWarning}>{taxDisplay.warning}</Text>
          ) : null}
          {(taxDisplay?.rows ?? []).map((row) => (
            <View
              key={row.key}
              style={[
                styles.calcRow,
                row.key === "taxable" ? styles.calcRowTaxable : null,
              ]}
            >
              <Text
                style={
                  row.key === "taxable"
                    ? styles.calcLabelSubtotal
                    : styles.calcLabel
                }
              >
                {row.label}
              </Text>
              <Text
                style={
                  row.key === "taxable" ? styles.calcValSubtotal : styles.calcVal
                }
              >
                {row.value}
              </Text>
            </View>
          ))}
          <View style={styles.calcSubtotal} />
          <View style={styles.calcTotalRow}>
            <View>
              <Text style={styles.calcTotalLabel}>Total Amount</Text>
              <Text style={styles.calcTotalSub}>
                {readOnly ? invoiceNumberLabel : "Draft — not issued"}
              </Text>
            </View>
            <Text style={styles.calcTotalVal}>
              {formatCurrency(draft?.tax.total_amount ?? 0)}
            </Text>
          </View>
        </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          invoiceBuildBlockedReason ? styles.footerBlocked : null,
          {
            paddingBottom: isStandalone
              ? layout.scrollBottomPadding(12)
              : insets.bottom + 16,
          },
        ]}
      >
        {invoiceBuildBlockedReason ? (
          <Text style={styles.buildGateReason}>{invoiceBuildBlockedReason}</Text>
        ) : invoiceIssueBlockedReason ? (
          <Text style={styles.buildGateReason}>{invoiceIssueBlockedReason}</Text>
        ) : null}
        {readOnly ? null : (
        <Pressable
          style={[
            styles.footerBtnSecondary,
            (isFinalizing ||
              isIssuing ||
              !canSaveDraft) &&
              styles.btnDisabled,
          ]}
          onPress={onSaveDraft ?? handleInitiatePreview}
          disabled={
            isFinalizing ||
            isIssuing ||
            !canSaveDraft
          }
          accessibilityLabel={
            invoiceBuildBlockedReason ??
            (onSaveDraft ? saveDraftLabel : "Preview draft")
          }
        >
          {isFinalizing ? (
            <LoadingIndicator color={Theme.analyticsHeroBg} size="small" />
          ) : (
            <>
              <FontAwesome
                name="file-text-o"
                size={13}
                color={Theme.analyticsHeroBg}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.footerBtnSecondaryText}>
                {onSaveDraft ? saveDraftLabel : "Preview draft"}
              </Text>
            </>
          )}
        </Pressable>
        )}
        {readOnly ? (
          <Pressable
            style={styles.footerBtnPrimary}
            onPress={handleInitiatePreview}
            disabled={selectedTrips.length === 0}
            accessibilityLabel="Download PDF"
          >
            <Text style={styles.footerBtnPrimaryText}>Download PDF</Text>
          </Pressable>
        ) : (
        <Pressable
          style={[
            styles.footerBtnPrimary,
            issueBlocked && styles.btnDisabled,
          ]}
          onPress={handleIssueInvoice}
          disabled={issueBlocked}
          accessibilityLabel="Issue Invoice"
        >
          {isIssuing ? (
            <LoadingIndicator color={Theme.screenBackground} size="small" />
          ) : (
            <Text style={styles.footerBtnPrimaryText}>Issue Invoice</Text>
          )}
        </Pressable>
        )}
      </View>
      <ProvisionAdjustmentModal
        visible={cnDnTrip != null}
        side="client"
        onClose={closeCnDnModal}
        onSave={handleSaveTripCnDn}
        onUpdate={handleUpdateTripCnDn}
        editTarget={cnDnEdit}
        tripCode={cnDnTrip?.id}
        partyLabel={activeClient}
        clientName={activeClient || cnDnTrip?.client || "Client"}
        supplierName={cnDnTrip?.supplier_name || "Supplier"}
        sales={cnDnTrip?.amount ?? 0}
        adjSales={invoiceTripAdjustedAmount(
          cnDnTrip?.amount ?? 0,
          cnDnTrip
            ? adjustmentsForTripId(tripAdjustmentsRecord, cnDnTrip.internal_id)
            : [],
        )}
        cost={0}
        adjCost={0}
        revenueSideDelta={
          cnDnTrip
            ? invoiceTripAdjustedAmount(
                cnDnTrip.amount,
                adjustmentsForTripId(tripAdjustmentsRecord, cnDnTrip.internal_id),
              ) - cnDnTrip.amount
            : 0
        }
        costSideDelta={0}
        adjustments={
          cnDnTrip
            ? adjustmentsForTripId(tripAdjustmentsRecord, cnDnTrip.internal_id)
            : []
        }
        lineMetaLabel={(adj) =>
          (adj.reason ?? "").trim() ||
          (adj.impact === "minus" ? "Credit note" : "Debit note")
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: Theme.analyticsCanvas,
    flex: 1,
  },
  sheetCompact: {
    backgroundColor: Theme.screenBackground,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 16,
    minHeight: 68,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderMedium,
    backgroundColor: Theme.cardWhite,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: -0.3,
  },
  headerCompact: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 8,
    minHeight: 44,
  },
  headerTitleCompact: {
    fontSize: 13,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  draftBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: Theme.brandBlueSoft,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  draftBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.analyticsHeroBg,
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginTop: 6,
    lineHeight: 17,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  headerIconBtn: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },

  body: { flex: 1, backgroundColor: Theme.analyticsCanvas },
  bodyContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 16,
    flexGrow: 1,
  },
  bodyContentExpanded: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  document: {
    width: "100%",
    flexGrow: 1,
    alignSelf: "stretch",
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    paddingHorizontal: 20,
    paddingVertical: 22,
    gap: 0,
  },
  documentExpanded: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
  },

  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  sectionTitleInline: {
    marginBottom: 0,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textSecondary,
    marginBottom: 6,
  },
  fieldLabelFlush: {
    marginBottom: 0,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  fieldHint: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
    lineHeight: 15,
  },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    ...(Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          alignItems: "start",
        } as unknown as ViewStyle)
      : null),
  },
  fieldGridMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 14,
    ...(Platform.OS === "web"
      ? ({
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          alignItems: "start",
        } as unknown as ViewStyle)
      : null),
  },
  customerNameBlock: {
    width: "100%",
    minWidth: 0,
  },
  fieldCell: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 140,
    maxWidth: "100%",
    ...(Platform.OS === "web"
      ? ({
          width: "100%",
          flexBasis: "auto",
          minWidth: 0,
        } as unknown as ViewStyle)
      : null),
  },
  fieldCellWide: {
    flexBasis: 220,
    minWidth: 180,
    ...(Platform.OS === "web"
      ? ({
          gridColumn: "1 / -1",
          flexBasis: "auto",
          minWidth: 0,
        } as unknown as ViewStyle)
      : null),
  },
  fieldValueBox: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 6,
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  fieldValueMuted: {
    backgroundColor: Theme.surface,
  },
  fieldValueText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  fieldValueMutedText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  editClientBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 2,
    marginBottom: 0,
  },
  editClientBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.analyticsHeroBg,
  },

  clientName: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 4,
  },
  clientAddress: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textRouteCard,
    marginBottom: 2,
    lineHeight: 17,
  },

  itemsTable: {
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Theme.cardWhite,
  },
  itemsHead: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.brandBlueSoft,
    borderBottomWidth: 1,
    borderBottomColor: Theme.borderMedium,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  itemsHeadCell: {
    fontSize: 11,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    letterSpacing: 0.2,
  },
  itemsHeadRight: {
    textAlign: "right",
  },
  itemsBodyCell: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textSecondary,
  },
  colIndex: {
    width: 28,
    flexShrink: 0,
  },
  colDesc: {
    flex: 1.4,
    minWidth: 100,
  },
  colRoute: {
    flex: 1.3,
    minWidth: 90,
  },
  colStatus: {
    flex: 0.9,
    minWidth: 72,
  },
  colAmount: {
    width: 96,
    flexShrink: 0,
    alignItems: "flex-end",
  },
  colAmountWide: {
    flexShrink: 0,
    marginLeft: "auto",
  },

  addChargeBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginTop: 10,
  },
  addChargeText: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.analyticsHeroBg,
  },

  chargeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
    backgroundColor: Theme.cardWhite,
  },
  chargeContentCol: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 100,
  },
  chargeActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  chargeInput: {
    width: "100%",
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    padding: 0,
    margin: 0,
    minHeight: 20,
  },
  chargeHint: {
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: 2,
  },

  chargeTypeToggle: {
    flexDirection: "row",
    backgroundColor: Theme.surfaceGray,
    padding: 2,
    borderRadius: 6,
  },
  chargeTypeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 32,
    borderRadius: 4,
    justifyContent: "center",
  },
  chargeTypeBtnAdd: {
    backgroundColor: Theme.cardWhite,
  },
  chargeTypeBtnMinus: {
    backgroundColor: Theme.cardWhite,
  },
  chargeTypeText: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  chargeTypeTextAdd: { color: Theme.positive },
  chargeTypeTextMinus: { color: Theme.negative },

  chargeAmountWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    width: 78,
  },
  chargeCurrencySymbol: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textMuted,
    marginRight: 2,
  },
  chargeAmountInput: {
    width: 48,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    padding: 0,
    margin: 0,
  },
  removeChargeBtn: {
    width: Layout.minTouchTargetSize,
    height: Layout.minTouchTargetSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },

  splitToggleRow: {
    flexDirection: "row",
    alignSelf: "flex-end",
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  splitToggleBtn: {
    minHeight: 32,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: "transparent",
  },
  splitToggleBtnOn: {
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  splitToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: Theme.textRouteCard,
  },
  splitToggleTextOn: {
    color: Theme.textPrimaryDark,
  },
  emptyTrips: {
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  emptyTripsText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  tripItemWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceBorder,
  },
  tripItem: {
    backgroundColor: Theme.cardWhite,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  tripItemMeta: { minWidth: 0 },
  tripItemAmounts: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  tripItemId: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
    marginBottom: 2,
  },
  tripItemDate: {
    fontSize: 11,
    fontWeight: "500",
    color: Theme.textMuted,
  },
  tripItemRoute: {
    fontSize: 12,
    fontWeight: "500",
    color: Theme.textRouteCard,
    lineHeight: 17,
    minWidth: 0,
  },
  tripItemPodRow: {
    minWidth: 0,
    paddingTop: 2,
  },
  tripItemAmount: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
    textAlign: "right",
  },
  tripItemBaseAmount: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "400",
    color: Theme.textMuted,
    textAlign: "right",
  },

  calcBlock: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  calcRowTaxable: {
    marginBottom: 12,
  },
  calcLabel: { fontSize: 13, color: Theme.textRouteCard, fontWeight: "500" },
  calcVal: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  calcSubtotal: {
    borderTopWidth: 1,
    borderTopColor: Theme.borderMedium,
    marginVertical: 8,
  },
  calcLabelSubtotal: {
    fontSize: 13,
    fontWeight: "700",
    color: Theme.textPrimaryDark,
  },
  calcValSubtotal: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },
  taxWarning: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.warning,
    marginBottom: 12,
  },
  calcTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingTop: 4,
  },
  calcTotalLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textMuted,
  },
  calcTotalSub: {
    fontSize: 12,
    fontWeight: "400",
    color: Theme.textMuted,
    marginTop: 2,
  },
  calcTotalVal: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: Theme.textPrimaryDark,
  },

  settingsBlock: {
    position: "relative",
    overflow: "visible",
    zIndex: 10,
  },
  settingsSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 42,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  settingsSelectWrap: {
    position: "relative",
    zIndex: 1000,
  },
  settingsSelectText: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
  },
  notesInput: {
    backgroundColor: Theme.cardWhite,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textPrimaryDark,
    minHeight: 88,
    textAlignVertical: "top",
    position: "relative",
    zIndex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  settingsToggles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceBorder,
    paddingTop: 14,
    marginTop: 14,
    position: "relative",
    zIndex: 1,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: Layout.minTouchTargetSize,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.cardWhite,
  },
  checkboxActive: {
    backgroundColor: Theme.analyticsHeroBg,
    borderColor: Theme.analyticsHeroBg,
  },
  checkboxLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimary,
  },
  rateInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Theme.cardWhite,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rateInput: {
    width: 36,
    fontSize: 13,
    fontWeight: "500",
    color: Theme.textPrimaryDark,
    textAlign: "right",
    padding: 0,
    margin: 0,
  },
  rateSuffix: {
    fontSize: 13,
    fontWeight: "400",
    color: Theme.textMuted,
    marginLeft: 2,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: Theme.cardWhite,
    borderTopWidth: 1,
    borderTopColor: Theme.borderMedium,
  },
  footerBlocked: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  buildGateReason: {
    fontSize: 13,
    fontWeight: "600",
    color: Theme.textSecondary,
    textAlign: "center",
  },
  footerBtnSecondary: {
    minWidth: 140,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Theme.cardWhite,
    borderWidth: 1.5,
    borderColor: Theme.analyticsHeroBg,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  footerBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.analyticsHeroBg,
  },
  footerBtnPrimary: {
    minWidth: 148,
    minHeight: Layout.minTouchTargetSize,
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: Theme.analyticsHeroBg,
    borderWidth: 0,
    borderColor: Theme.analyticsHeroBg,
    borderRadius: 8,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  footerBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: Theme.screenBackground,
  },
  btnDisabled: { opacity: 0.5 },

  modalOverlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: "center",
    paddingHorizontal: Layout.screenPaddingHorizontal,
  },
  termsModalContent: {
    backgroundColor: Theme.cardWhite,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
  },
  termOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: Layout.minTouchTargetSize,
  },
  termOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: Theme.textPrimaryDark,
  },
  termOptionActive: { color: Theme.analyticsHeroBg, fontWeight: "700" },
  webTermsDropdown: {
    position: "absolute" as const,
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: Theme.cardWhite,
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: Theme.borderMedium,
    shadowColor: Theme.textPrimaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 24,
    zIndex: 9999,
  },
});
