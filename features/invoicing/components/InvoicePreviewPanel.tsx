import {
  PulseInvoiceDocument,
  type PulseInvoiceWidget,
} from "@/features/invoicing/components/PulseInvoiceDocument";
import { useInvoiceDraftClientsQuery } from "@/features/invoicing/hooks/useInvoiceDraftClients";
import { useInvoiceStyleEditor } from "@/features/invoicing/hooks/useInvoiceStyleEditor";
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
  indicativeDueDateFromPreview,
  freightLineDetail,
  presentInvoiceTax,
  uniqueTripClientIds,
  uniqueTripClientNames,
  type InvoiceDraftModel,
} from "@/features/invoicing/services/invoicePreviewModel.service";
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
import Theme from "@/constants/Theme";
import type { IssuedInvoicePresentation } from "@/features/invoicing/utils/savedInvoicePreview.util";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useInvoiceNumberPlan } from "@/features/invoicing/hooks/useInvoiceNumberPlan";
import { useInvoiceWorkspaceBilling } from "@/features/invoicing/hooks/useInvoiceWorkspaceBilling";
import { invoiceLinesForNoteSplit } from "@/features/invoicing/services/invoiceCnDn.service";
import {
  invoicePreviewCanSaveDraft,
  resolveInvoicePreviewItemSource,
} from "@/features/invoicing/utils/financeInvoicePreview.util";
import type { InvoiceDraftSaveSnapshot } from "@/features/invoicing/services/invoiceDraft.service";
import type { IssuedInvoiceListRow } from "@/features/invoicing/services/invoiceList.service";

export interface InvoicePreviewPanelProps {
  onClose?: () => void;
  onPreview: (params: Record<string, string>) => void; // Changed from onFinalize to onPreview
  /** Parent execute screen owns persist. Preview route stays mutation-free. */
  onIssue?: (args: { internalIds: string[]; payload: InvoicePayload }) => void;
  isFinalizing: boolean; // This will now represent the state of PDF generation/navigation
  isIssuing?: boolean;
  activeClient: string | null;
  clientId?: string | null;
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
  onSaveDraft?: (snapshot?: InvoiceDraftSaveSnapshot) => void;
  /** Same draft record as save. The screen opens the Drafts list after it succeeds. */
  onConvertToInvoice?: (snapshot?: InvoiceDraftSaveSnapshot) => void;
  /** Pending trips convert to a draft first. A draft uses Issue Invoice. */
  convertFirst?: boolean;
  saveDraftLabel?: string;
  readOnly?: boolean;
  /** Canonical draft from Manual Invoice — same InvoiceDraftModel as trip preview. */
  externalDraft?: InvoiceDraftModel | null;
  /** Number already stored on this invoice. Sequence edits never replace it. */
  assignedInvoiceNumber?: string | null;
  onIssueExternal?: () => void;
  insights?: readonly PulseInvoiceWidget[];
  /** Stored format for an issued invoice. Preview does not follow the live template. */
  issuedLock?: IssuedInvoicePresentation | null;
  onSaveRevision?: (input: {
    reason: string;
    notes: string;
    paymentTerms: string;
    document: NonNullable<InvoicePayload["document"]>;
  }) => Promise<boolean>;
  /** Issued invoice on the right. Capture uses the same receipt as Accounts Receivable. */
  payableInvoice?: IssuedInvoiceListRow | null;
  payableTrips?: readonly InvoicingTripView[];
  onPaymentRecorded?: () => void;
}

const EMPTY_CHARGES: AdditionalCharge[] = [];

const PAYMENT_TERMS_OPTIONS = [
  "Due on Receipt",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
];

export function InvoicePreviewPanel({
  onClose: _onClose,
  onPreview,
  onIssue,
  isFinalizing,
  isIssuing = false,
  activeClient,
  clientId = null,
  selectedTrips,
  isStandalone: _isStandalone = false,
  issuer,
  workspaceOrgId = null,
  previewExpanded: _previewExpanded = false,
  onToggleExpand: _onToggleExpand,
  onEditClient: _onEditClient,
  invoiceBuildBlockedReason = null,
  invoiceIssueBlockedReason = null,
  density = "default",
  onSaveDraft,
  onConvertToInvoice,
  convertFirst = false,
  saveDraftLabel = "Save as Draft",
  readOnly = false,
  externalDraft = null,
  assignedInvoiceNumber = null,
  onIssueExternal,
  insights: _insights = [],
  issuedLock = null,
  onSaveRevision,
  payableInvoice: _payableInvoice = null,
  payableTrips: _payableTrips = [],
  onPaymentRecorded: _onPaymentRecorded,
}: InvoicePreviewPanelProps) {
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [notes, setNotes] = useState("");
  const [revising, setRevising] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");
  const [reason, setReason] = useState("");
  const includeFuel = false;
  const fuelRate = 2.5;
  const additionalCharges = EMPTY_CHARGES;
  const [previewDate] = useState(() => formatInvoicePreviewDate(new Date()));
  const [cnDnTrip, setCnDnTrip] = useState<InvoicingTripView | null>(null);
  const [cnDnEdit, setCnDnEdit] = useState<TripAdjustment | null>(null);
  const selectedTripInternalIds = useMemo(
    () => selectedTrips.map((t) => t.internal_id).filter(Boolean),
    [selectedTrips],
  );
  const billingTrips = selectedTrips;

  const { record: tripAdjustmentsRecord } = useTripFinanceAdjustmentsMap(
    workspaceOrgId,
    selectedTripInternalIds,
  );
  const invalidateTripAdjustments = useInvalidateTripFinanceAdjustments();

  const clientIds = useMemo(
    () => uniqueTripClientIds(selectedTrips),
    [selectedTrips],
  );
  const clientNames = useMemo(
    () => uniqueTripClientNames(selectedTrips),
    [selectedTrips],
  );
  const { data: fetchedClients = [] } = useInvoiceDraftClientsQuery(
    workspaceOrgId,
    clientIds,
    clientNames,
  );

  const workspaceBilling = useInvoiceWorkspaceBilling(workspaceOrgId, issuer);
  const numberPlan = useInvoiceNumberPlan(
    workspaceOrgId,
    workspaceBilling.billing.legalName || issuer?.businessName,
  );
  const styleClientId = clientId ?? null;
  const styleEditor = useInvoiceStyleEditor({
    orgId: workspaceOrgId,
    clientId: styleClientId,
    clientName: activeClient,
  });
  const frozen = issuedLock != null && externalDraft?.document_kind === "issued";
  const revisingIssued = frozen && revising;
  const showSplit = frozen
    ? issuedLock?.details != null
      ? issuedLock.splitNotes
      : false
    : styleEditor.details.splitNotes !== false;
  const chosenGst = styleEditor.details.gstRate;
  const gstRate = chosenGst === "5" || chosenGst === "12" || chosenGst === "18" ? Number(chosenGst) : 0;
  const includeGst = gstRate > 0;
  const reverseCharge = frozen
    ? issuedLock?.reverseCharge === true
    : !readOnly && includeGst && styleEditor.details.reverseCharge;

  const invoiceConfig = useMemo(
    () => ({
      includeGst,
      gstRate,
      includeFuel,
      fuelRate,
      additionalCharges: mergeInvoiceChargesWithTripCnDn(
        additionalCharges,
        billingTrips,
        tripAdjustmentsRecord,
      ),
    }),
    [
      additionalCharges,
      billingTrips,
      fuelRate,
      gstRate,
      includeFuel,
      includeGst,
      tripAdjustmentsRecord,
    ],
  );

  const draft = useMemo(() => {
    if (externalDraft) return externalDraft;
    if (!issuer || billingTrips.length === 0) return null;
    return buildInvoiceDraftModel({
      issuer,
      trips: billingTrips,
      config: invoiceConfig,
      previewDate,
      paymentTerms,
      notes,
      fetchedClients,
      displayNameFallback: activeClient,
    });
  }, [
    activeClient,
    billingTrips,
    fetchedClients,
    invoiceConfig,
    issuer,
    notes,
    paymentTerms,
    previewDate,
    externalDraft,
  ]);

  useEffect(() => {
    if (!frozen || !externalDraft) return;
    setNotes(externalDraft.notes ?? "");
    setPaymentTerms(externalDraft.payment_terms || "Net 30");
    setRevising(false);
    setReason("");
    setReasonOpen(false);
  }, [
    frozen,
    externalDraft,
    externalDraft?.invoice_number_label,
    externalDraft?.notes,
    externalDraft?.payment_terms,
  ]);

  const taxView = draft ? presentInvoiceTax(draft.tax, reverseCharge) : null;
  const taxDisplay = taxView ? { rows: taxView.rows, warning: taxView.warning } : null;
  const payableAmount = taxView?.payable ?? 0;

  const cnDnBillingAmount = useMemo(() => {
    if (!cnDnTrip) return 0;
    const key = cnDnTrip.internal_id || cnDnTrip.id;
    const billed = billingTrips.find((t) => (t.internal_id || t.id) === key);
    return billed?.amount ?? cnDnTrip.amount ?? 0;
  }, [billingTrips, cnDnTrip]);

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
          type: params.type,
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
        type: params.type,
        impact: params.impact,
        amount: params.amount,
        reason: params.reason,
      });
      await invalidateTripAdjustments();
    },
    [cnDnTrip, invalidateTripAdjustments],
  );

  const handleInitiatePreview = async () => {
    if (invoiceBuildBlockedReason) {
      Alert.alert("Preview", invoiceBuildBlockedReason);
      return;
    }
    if (selectedTrips.length === 0 && !externalDraft) {
      Alert.alert("Preview", "Select one or more trips to open the full invoice.");
      return;
    }
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
      reverseCharge: reverseCharge ? "true" : "false",
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
    const payload = {
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
    };
    if (reverseCharge) payload.calculations.totalAmount = draft.tax.taxable_base;
    onIssue({
      internalIds,
      payload: {
        ...payload,
        document: {
          lines: draft.lines,
          issuer: {
            legal_name: workspaceBilling.billing.legalName || draft.issuer.businessName,
            detail: workspaceBilling.issuerLines,
          },
          client: {
            legal_name: draft.client.legal_name,
            gstin: draft.client.gstin,
            billing_address: draft.client.billing_address,
          },
          tax: {
            presentation: {
              format: styleEditor.format,
              accent: styleEditor.accent,
              splitNotes: styleEditor.details.splitNotes !== false,
              reverseCharge,
              logoUrl: styleEditor.displayLogo,
              details: styleEditor.details,
            },
          },
        },
      },
    });
  };

  const previewItemSource = resolveInvoicePreviewItemSource({
    selectedTripCount: selectedTrips.length,
    draftLineCount: externalDraft?.lines.length ?? draft?.lines.length ?? 0,
  });
  const canSaveDraft = invoicePreviewCanSaveDraft({
    hasExternalDraft: externalDraft != null,
    selectedTripCount: selectedTrips.length,
  });
  const invoiceNumberLabel =
    previewItemSource === "draft-lines"
      ? externalDraft?.invoice_number_label || draft?.invoice_number_label || "Draft"
      : draft?.invoice_number_label || "Draft";
  const customerLabel =
    draft?.client.legal_name ||
    draft?.client.display_name ||
    activeClient ||
    "Select a customer…";
  const invoiceDateIso = draft?.preview_date || previewDate;
  const dueDateLabel = (() => {
    if (frozen && draft?.indicative_due_date) return displayInvoicePreviewDate(draft.indicative_due_date);
    const next = indicativeDueDateFromPreview(invoiceDateIso, paymentTerms);
    return next ? displayInvoicePreviewDate(next) : "—";
  })();
  const invoiceDateLabel =
    frozen && draft?.preview_date
      ? displayInvoicePreviewDate(draft.preview_date)
      : displayInvoicePreviewDate(previewDate);

  const money = (value: number) =>
    `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sourceLines =
    frozen && issuedLock?.details == null
      ? draft?.lines ?? []
      : invoiceLinesForNoteSplit(draft?.lines ?? [], showSplit);
  const documentLines = sourceLines.map((line, index) => ({
    id:
      line.line_type === "freight"
        ? line.trip_id || line.trip_ref || `freight-${index}`
        : `${line.line_type}-${index}`,
    description: line.description,
    detail: freightLineDetail(line, draft?.shipment.trips ?? []),
    qty: String(line.qty),
    rate: money(line.rate),
    amount: money(line.taxable_value),
    actionLabel: !readOnly && line.line_type === "freight" ? "CN/DN" : undefined,
  }));
  const storedIssuerLines =
    issuedLock?.issuerLines.length
      ? issuedLock.issuerLines
      : draft
        ? [...draft.issuer.addressLines, draft.issuer.gstin ? `GSTIN ${draft.issuer.gstin}` : ""]
        : [];
  const issuerDetail = (
    frozen
      ? storedIssuerLines
      : workspaceBilling.issuerLines.length > 0
        ? workspaceBilling.issuerLines
        : storedIssuerLines
  )
    .filter(Boolean)
    .join("\n");
  const shareInput = draft
    ? {
        status: readOnly || frozen ? "issued" as const : "draft" as const,
        organization:
          frozen
            ? draft.issuer.businessName
            : workspaceBilling.billing.legalName || draft.issuer.businessName,
        gstin: frozen ? draft.issuer.gstin : workspaceBilling.billing.gstin,
        cin: frozen ? null : workspaceBilling.billing.cin,
        pan: frozen ? draft.issuer.pan : workspaceBilling.billing.pan,
        address:
          frozen
            ? storedIssuerLines.join(", ")
            : [
                workspaceBilling.billing.address,
                [workspaceBilling.billing.city, workspaceBilling.billing.state, workspaceBilling.billing.pincode]
                  .filter(Boolean)
                  .join(", "),
              ]
                .filter(Boolean)
                .join(", "),
        client: customerLabel,
        invoiceNumber: draft.invoice_number_label || "Draft",
        invoiceDate: invoiceDateLabel,
        dueDate: dueDateLabel,
        amount: money(payableAmount),
        tripCount: frozen ? draft.shipment.trip_count : selectedTrips.length || draft.shipment.trip_count,
      }
    : null;
  const shareSubject = `${readOnly || frozen ? "Invoice" : "Draft invoice"} from ${
    frozen
      ? draft?.issuer.businessName || "Pulse"
      : workspaceBilling.billing.legalName || issuer?.businessName || "Pulse"
  }`;
  const saveRevision = async () => {
    if (!onSaveRevision || !draft || !reason.trim()) return;
    const saved = await onSaveRevision({
      reason: reason.trim(),
      notes,
      paymentTerms,
      document: {
        lines: draft.lines,
        issuer: {
          legal_name: draft.issuer.businessName,
          detail: issuedLock?.issuerLines ?? [],
        },
        client: {
          legal_name: draft.client.legal_name,
          gstin: draft.client.gstin,
          billing_address: draft.client.billing_address,
        },
        tax: {
          presentation: {
            format: issuedLock?.format ?? null,
            accent: issuedLock?.accent ?? null,
            splitNotes: issuedLock?.splitNotes === true,
            reverseCharge: issuedLock?.reverseCharge === true,
            logoUrl: issuedLock?.logoUrl ?? null,
            details: issuedLock?.details ?? null,
          },
        },
      },
    });
    if (saved) {
      setRevising(false);
      setReason("");
    }
  };
  const paperLocked = frozen;
  const saveSnapshot = (): InvoiceDraftSaveSnapshot | undefined => {
    if (!draft || draft.tax.status === "blocked") return undefined;
    return {
      notes,
      paymentTerms,
      gstRate,
      subtotal: draft.tax.taxable_base,
      sgst: draft.tax.sgst_amount,
      cgst: draft.tax.cgst_amount,
      igst: draft.tax.igst_amount,
      totalAmount: reverseCharge ? draft.tax.taxable_base : draft.tax.total_amount,
      tripIds: selectedTrips.map((trip) => trip.internal_id).filter(Boolean),
      invoiceNumber:
        (assignedInvoiceNumber &&
        assignedInvoiceNumber !== "Draft" &&
        !assignedInvoiceNumber.startsWith("DRAFT/")
          ? assignedInvoiceNumber
          : numberPlan.sample) || undefined,
    };
  };
  const billToDetail = draft
    ? [draft.client.billing_address, draft.client.gstin ? `GSTIN ${draft.client.gstin}` : "", draft.client.phone]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <>
      {revisingIssued ? (
        <View style={revisionStyles.editor}>
          <Text style={revisionStyles.kicker}>Revision · {reason}</Text>
          <TextInput
            value={paymentTerms}
            onChangeText={setPaymentTerms}
            placeholder="Payment terms"
            placeholderTextColor={Theme.textSecondary}
            style={revisionStyles.input}
            accessibilityLabel="Revised payment terms"
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes"
            placeholderTextColor={Theme.textSecondary}
            style={[revisionStyles.input, revisionStyles.notes]}
            multiline
            accessibilityLabel="Revised notes"
          />
        </View>
      ) : null}
      <PulseInvoiceDocument
        a4Pages
        compact={density === "compact"}
        invoiceNumber={invoiceNumberLabel}
        invoiceDate={invoiceDateLabel}
        invoiceDateIso={paperLocked ? undefined : invoiceDateIso}
        dueDate={dueDateLabel}
        paymentTerms={paymentTerms}
        paymentOptions={PAYMENT_TERMS_OPTIONS}
        onPaymentTerms={paperLocked || readOnly ? undefined : setPaymentTerms}
        issuerName={
          paperLocked
            ? draft?.issuer.businessName || issuer?.businessName || "Your company"
            : workspaceBilling.billing.legalName || draft?.issuer.businessName || issuer?.businessName || "Your company"
        }
        issuerDetail={issuerDetail}
        billing={paperLocked ? null : workspaceBilling.billing}
        logoUrl={
          paperLocked
            ? issuedLock?.logoUrl ?? draft?.issuer.logoUrl ?? null
            : styleEditor.displayLogo ?? draft?.issuer.logoUrl ?? issuer?.logoUrl ?? null
        }
        styleEditor={paperLocked ? null : styleEditor}
        presentationLock={paperLocked ? { format: issuedLock?.format ?? null, accent: issuedLock?.accent ?? null } : null}
        frozenDetails={paperLocked ? issuedLock?.details ?? null : null}
        settingsHidden={paperLocked}
        settingsInline={false}
        numbering={
          paperLocked
            ? null
            : {
                prefix: numberPlan.prefix,
                start: numberPlan.start,
                sample: numberPlan.sample,
                suggestedPrefix: numberPlan.suggestedPrefix,
                busy: numberPlan.busy,
                configured: numberPlan.configured,
                editing: numberPlan.editing,
                onPrefix: numberPlan.setPrefix,
                onStart: numberPlan.setStart,
                onEdit: numberPlan.beginEdit,
                onCancel: numberPlan.cancelEdit,
                onSave: () => {
                  void numberPlan.save();
                },
              }
        }
        toolbarLabel={paperLocked ? (revisingIssued ? "Revision" : "Issued invoice") : undefined}
        onRevise={
          paperLocked && onSaveRevision
            ? () => {
                setReasonDraft("");
                setReasonOpen(true);
              }
            : undefined
        }
        billToName={customerLabel}
        billToDetail={billToDetail}
        lines={documentLines}
        notes={notes}
        onNotes={paperLocked || readOnly ? undefined : setNotes}
        readOnly={readOnly}
        totals={taxDisplay?.rows ?? []}
        notice={taxDisplay?.warning}
        totalValue={draft ? money(payableAmount) : "₹0.00"}
        widgets={[
          { label: "Balance due", value: draft ? money(payableAmount) : "₹0.00" },
          { label: "Trips", value: String(frozen ? draft?.shipment.trip_count ?? 0 : selectedTrips.length) },
          { label: "Terms", value: paymentTerms || "—" },
        ]}
        onLineAction={
          readOnly
            ? undefined
            : (id) => {
                const trip = selectedTrips.find((item) => item.internal_id === id || item.id === id);
                if (!trip) return;
                setCnDnEdit(null);
                setCnDnTrip(trip);
              }
        }
        includeGst={includeGst}
        onPreview={readOnly ? undefined : () => { void handleInitiatePreview(); }}
        onSave={
          revisingIssued
            ? () => {
                void saveRevision();
              }
            : onSaveDraft && canSaveDraft
              ? () => onSaveDraft(saveSnapshot())
              : undefined
        }
        onConvert={
          !convertFirst || readOnly || revisingIssued || !onConvertToInvoice || !canSaveDraft
            ? undefined
            : () => setConvertOpen(true)
        }
        share={
          shareInput
            ? {
                draft: shareInput,
                email: draft?.client.email,
                phone: draft?.client.phone,
                subject: shareSubject,
              }
            : null
        }
        onIssue={readOnly ? undefined : handleIssueInvoice}
        issueDisabled={issueBlocked}
        saveLabel={revisingIssued ? "Save revision" : saveDraftLabel}
      />
      <Modal visible={convertOpen} transparent animationType="fade" onRequestClose={() => setConvertOpen(false)}>
        <View style={revisionStyles.backdrop}>
          <View style={revisionStyles.card}>
            <Text style={revisionStyles.title}>Convert to invoice</Text>
            <Text style={revisionStyles.body}>
              Save this invoice as a draft. You can issue it from Drafts.
            </Text>
            <View style={revisionStyles.row}>
              <Pressable
                style={revisionStyles.secondary}
                onPress={() => setConvertOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel convert"
              >
                <Text style={revisionStyles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={revisionStyles.primary}
                onPress={() => {
                  const snapshot = saveSnapshot();
                  setConvertOpen(false);
                  if (snapshot) onConvertToInvoice?.(snapshot);
                }}
                accessibilityRole="button"
                accessibilityLabel="Confirm convert to invoice"
              >
                <Text style={revisionStyles.primaryText}>Convert</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={reasonOpen} transparent animationType="fade" onRequestClose={() => setReasonOpen(false)}>
        <View style={revisionStyles.backdrop}>
          <View style={revisionStyles.card}>
            <Text style={revisionStyles.title}>Revise invoice</Text>
            <Text style={revisionStyles.body}>
              The issued invoice stays as it was created. Enter a reason to change notes, payment terms, or the template.
            </Text>
            <TextInput
              value={reasonDraft}
              onChangeText={setReasonDraft}
              placeholder="Reason for revision"
              placeholderTextColor={Theme.textSecondary}
              style={revisionStyles.input}
              accessibilityLabel="Reason for revision"
            />
            <View style={revisionStyles.row}>
              <Pressable style={revisionStyles.secondary} onPress={() => setReasonOpen(false)} accessibilityRole="button">
                <Text style={revisionStyles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[revisionStyles.primary, reasonDraft.trim() ? null : revisionStyles.off]}
                disabled={!reasonDraft.trim()}
                onPress={() => {
                  setReason(reasonDraft.trim());
                  setReasonOpen(false);
                  setRevising(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Continue revision"
              >
                <Text style={revisionStyles.primaryText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
        sales={cnDnBillingAmount}
        adjSales={invoiceTripAdjustedAmount(
          cnDnBillingAmount,
          cnDnTrip
            ? adjustmentsForTripId(tripAdjustmentsRecord, cnDnTrip.internal_id)
            : [],
        )}
        cost={0}
        adjCost={0}
        revenueSideDelta={
          cnDnTrip
            ? invoiceTripAdjustedAmount(
                cnDnBillingAmount,
                adjustmentsForTripId(tripAdjustmentsRecord, cnDnTrip.internal_id),
              ) - cnDnBillingAmount
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
    </>
  );
}

const revisionStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  editor: {
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  kicker: { fontSize: 13, color: Theme.textSecondary },
  notes: { minHeight: 72, textAlignVertical: "top" },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Theme.cardWhite,
    borderRadius: 12,
    padding: 20,
    gap: 12,
  },
  title: { fontSize: 18, color: Theme.textPrimary },
  body: { fontSize: 14, lineHeight: 20, color: Theme.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Theme.textPrimary,
  },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  secondary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  secondaryText: { color: Theme.textPrimary, fontSize: 14 },
  primary: { backgroundColor: Theme.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  primaryText: { color: Theme.buttonDarkText, fontSize: 14 },
  off: { opacity: 0.4 },
});
