/**
 * Compliance panel embedded in the existing Trip Detail screen (Phase 14) —
 * follows the exact prop-driven, self-contained pattern already used by
 * TripPodStatusSection right above its insertion point. Not a second Trip
 * Detail page; this only renders when Compliance is enabled + permitted.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Theme from "@/constants/Theme";
import { alertMessage } from "@/features/tripCompliance/utils/crossPlatformAlert.util";
import { supabase } from "@/lib/supabase";
import { PAYMENT_MODES } from "@/lib/paymentModes";
import { describeStopProofDocument } from "@/features/driver/job-card/deliveryProof";
import { type TripDocumentRow } from "@/features/trips/services/tripDocuments.service";
import { resolveTripDocumentPreviewUrl } from "@/features/tripCompliance/services/vehicleDocumentReuse.service";
import { markTripHardCopyPodReceived } from "@/features/trips/services/tripDocumentLrPod.service";
import { syncHardCopyPodRecord } from "@/lib/queries/invalidateHardCopyPodCaches";
import { useQueryClient } from "@tanstack/react-query";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
  canMarkComplianceVerified,
  fetchComplianceTransactions,
  toPaymentSummary,
} from "@/features/tripCompliance/services/tripComplianceRead.service";
import {
  markTripComplianceVerified,
  postCompliancePayment,
  setTripDocumentVerification,
  updateCompliancePaymentUtr,
} from "@/features/tripCompliance/services/tripComplianceWrite.service";
import type {
  CompliancePaymentSummary,
  ComplianceDocumentRow,
  ComplianceDocumentStatus,
  ComplianceTripSummary,
} from "@/features/tripCompliance/tripCompliance.types";
import { ComplianceInputModal, type ComplianceInputField } from "@/features/tripCompliance/components/ComplianceInputModal";
import { CompliancePaymentConfirmModal } from "@/features/tripCompliance/components/CompliancePaymentConfirmModal";
import { ComplianceDocumentTable } from "@/features/tripCompliance/components/ComplianceDocumentTable";
import { VehicleDocumentReuseSection } from "@/features/tripCompliance/components/VehicleDocumentReuseSection";
import { emptyComplianceChecklist } from "@/features/tripCompliance/utils/complianceChecklist.util";
import type { ComplianceLedgerCategory } from "@/features/tripCompliance/services/tripComplianceWrite.service";

type Props = {
  trip: TripRow;
  organizationId: string;
  actorId: string | null;
  tripDocuments: TripDocumentRow[];
  tripDelivered: boolean;
  complianceVerifiedAt: string | null;
  hardCopyPodReceived: boolean;
  canVerifyDocuments: boolean;
  canMarkVerified: boolean;
  canManagePod: boolean;
  canManageFinance: boolean;
  onUpdated: () => void;
};

const REJECT_FIELDS: ComplianceInputField[] = [
  { key: "reason", label: "Reason for rejection", placeholder: "e.g. Illegible LR copy", required: true },
];
const POD_FIELDS: ComplianceInputField[] = [
  { key: "courier", label: "Courier", placeholder: "e.g. BlueDart", required: true },
  { key: "awb", label: "AWB / tracking number", required: true },
  { key: "receivedBy", label: "Received by", required: true },
];
const PAYMENT_FIELDS: ComplianceInputField[] = [
  { key: "amount", label: "Amount (₹)", keyboardType: "numeric", required: true },
  {
    key: "mode",
    label: `Payment mode (${PAYMENT_MODES.map((m) => m.id).join(" / ")})`,
    placeholder: "UPI",
    required: true,
  },
  { key: "utr", label: "UTR / reference (skip for Cash)" },
];

type ModalKind = "reject" | "pod" | "advance" | "balance" | "editAdvance" | "editBalance" | null;

function PaymentSummaryRow({
  label,
  payment,
  onEdit,
}: {
  label: string;
  payment: CompliancePaymentSummary;
  onEdit?: () => void;
}) {
  return (
    <View style={styles.paymentRow}>
      <View style={styles.paymentHeaderRow}>
        <Text style={styles.subheader}>{label}</Text>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit}>
            <Text style={styles.editLink}>Edit UTR</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.muted}>
        ₹{payment.amount.toLocaleString("en-IN")} · {payment.paymentMode ?? "—"}
        {payment.utr ? ` · UTR ${payment.utr}` : ""} · {payment.paidAt}
      </Text>
    </View>
  );
}

export function ComplianceSection({
  trip,
  organizationId,
  actorId,
  tripDocuments,
  tripDelivered,
  complianceVerifiedAt,
  hardCopyPodReceived,
  canVerifyDocuments,
  canMarkVerified,
  canManagePod,
  canManageFinance,
  onUpdated,
}: Props) {
  const queryClient = useQueryClient();
  const tripId = trip.id;
  const [complianceById, setComplianceById] = useState<
    Record<string, Pick<ComplianceDocumentRow, "status" | "verified_by" | "verified_at" | "rejection_reason">>
  >({});
  const [loadingCompliance, setLoadingCompliance] = useState(true);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [markingVerified, setMarkingVerified] = useState(false);
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [modalDoc, setModalDoc] = useState<ComplianceDocumentRow | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payments, setPayments] = useState<{
    advance: CompliancePaymentSummary | null;
    balance: CompliancePaymentSummary | null;
  }>({ advance: null, balance: null });
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);
  const [payCategory, setPayCategory] = useState<ComplianceLedgerCategory | null>(null);
  const [paying, setPaying] = useState(false);

  // Advance/balance are read straight from canonical `transactions`
  // (ledger_category) — never duplicated locally beyond this render cache.
  useEffect(() => {
    let cancelled = false;
    fetchComplianceTransactions([tripId]).then((byTrip) => {
      if (cancelled) return;
      const bucket = byTrip.get(tripId) ?? { advance: [], balance: [] };
      setPayments({
        advance: toPaymentSummary(bucket.advance),
        balance: toPaymentSummary(bucket.balance),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [tripId, paymentsRefreshKey]);

  // One small, trip-scoped query for the 4 compliance columns — Trip Detail
  // is a single-trip page, so this isn't N+1; kept separate from the shared,
  // 24-call-site getDocumentsByTripId() to avoid touching that broader path.
  useEffect(() => {
    let cancelled = false;
    setLoadingCompliance(true);
    supabase()
      .from("trip_documents")
      .select("id, status, verified_by, verified_at, rejection_reason")
      .eq("trip_id", tripId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Pre-migration: columns don't exist yet — treat everything as pending.
          setComplianceById({});
        } else {
          const map: typeof complianceById = {};
          for (const row of data ?? []) {
            map[row.id as string] = {
              status: (row.status as ComplianceDocumentStatus) ?? "pending",
              verified_by: row.verified_by as string | null,
              verified_at: row.verified_at as string | null,
              rejection_reason: row.rejection_reason as string | null,
            };
          }
          setComplianceById(map);
        }
        setLoadingCompliance(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const documents: ComplianceDocumentRow[] = useMemo(
    () =>
      tripDocuments.map((d) => ({
        id: d.id,
        trip_id: d.trip_id,
        document_type: d.document_type,
        file_name: d.file_name,
        storage_path: d.storage_path,
        uploaded_at: d.uploaded_at,
        status: complianceById[d.id]?.status ?? "pending",
        verified_by: complianceById[d.id]?.verified_by ?? null,
        verified_at: complianceById[d.id]?.verified_at ?? null,
        rejection_reason: complianceById[d.id]?.rejection_reason ?? null,
        mime_type: d.mime_type,
        document_number: d.document_number,
        source_entity_document_id: d.source_entity_document_id ?? null,
      })),
    [tripDocuments, complianceById],
  );

  const paymentSummary: ComplianceTripSummary = useMemo(
    () => ({
      trip,
      stage: "compliance_verified",
      documents,
      vehicleDocuments: [],
      driverDocuments: [],
      documentCounts: { total: documents.length, verified: 0, rejected: 0, pending: 0 },
      checklist: emptyComplianceChecklist(),
      complianceVerifiedAt,
      complianceVerifiedBy: null,
      complianceDecision: null,
      complianceExceptionReason: null,
      complianceOutstandingSummary: null,
      // Payment-modal summary only; decline state isn't loaded here.
      complianceDeclinedAt: null,
      complianceDeclinedBy: null,
      complianceDeclineReason: null,
      advance: payments.advance,
      balance: payments.balance,
      hardCopyPod: {
        received: hardCopyPodReceived,
        receivedAt: null,
        courier: null,
        awbNumber: null,
        receivedBy: null,
      },
    }),
    [trip, documents, complianceVerifiedAt, payments, hardCopyPodReceived],
  );

  const verifyCheck = canMarkComplianceVerified(documents);

  const handlePreview = useCallback(async (doc: ComplianceDocumentRow) => {
    const stopProof = describeStopProofDocument({
      fileName: doc.file_name,
      mimeType: doc.mime_type,
      documentNumber: doc.document_number,
      storagePath: doc.storage_path,
    });
    if (stopProof) {
      alertMessage(
        stopProof.label,
        stopProof.note ??
          (stopProof.kind === "pickup"
            ? "Pickup place was recorded without a photo."
            : "Delivery place was recorded without a photo."),
      );
      return;
    }
    const url = await resolveTripDocumentPreviewUrl({
      storagePath: doc.storage_path,
      sourceEntityDocumentId: doc.source_entity_document_id,
      organizationId,
    });
    if (url) void Linking.openURL(url);
    else alertMessage("Couldn't preview document", "This file is not available.");
  }, [organizationId]);

  const handleVerify = useCallback(
    async (doc: ComplianceDocumentRow) => {
      if (!actorId) return;
      setBusyDocId(doc.id);
      const { error } = await setTripDocumentVerification({
        document: doc,
        organizationId,
        actorId,
        status: "verified",
      });
      setBusyDocId(null);
      if (error) {
        alertMessage("Couldn't verify document", error.message);
        return;
      }
      onUpdated();
    },
    [actorId, organizationId, onUpdated],
  );

  const handleMarkVerified = useCallback(async () => {
    if (!actorId) return;
    setMarkingVerified(true);
    const { error } = await markTripComplianceVerified({ tripId, actorId });
    setMarkingVerified(false);
    if (error) {
      alertMessage("Compliance not verified", error.message);
      return;
    }
    onUpdated();
  }, [actorId, tripId, documents, onUpdated]);

  const closeModal = useCallback(() => {
    setModalKind(null);
    setModalDoc(null);
  }, []);

  const handleModalSubmit = useCallback(
    async (values: Record<string, string>) => {
      setSubmitting(true);
      try {
        if (modalKind === "reject" && modalDoc && actorId) {
          const { error } = await setTripDocumentVerification({
            document: modalDoc,
            organizationId,
            actorId,
            status: "rejected",
            rejectionReason: values.reason,
          });
          if (error) throw error;
        } else if (modalKind === "pod") {
          const { error } = await markTripHardCopyPodReceived(tripId, {
            courier: values.courier,
            awbNumber: values.awb,
            receivedBy: values.receivedBy,
          });
          if (error) throw error;
          await syncHardCopyPodRecord(queryClient, {
            tripId,
            organizationId,
          });
        } else if (modalKind === "editAdvance" || modalKind === "editBalance") {
          const existing = modalKind === "editAdvance" ? payments.advance : payments.balance;
          if (!existing) throw new Error("Payment not found");
          const amount = Number(values.amount);
          if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
          const modeId = values.mode.trim().toUpperCase();
          const mode = PAYMENT_MODES.find((m) => m.id === modeId);
          if (!mode) throw new Error(`Unknown payment mode "${values.mode}"`);
          const { error } = await updateCompliancePaymentUtr({
            organizationId,
            transactionId: existing.transactionId,
            trip,
            category: modalKind === "editAdvance" ? "compliance_advance" : "compliance_balance",
            amount,
            paymentModeId: mode.id,
            paymentModeLabel: mode.name,
            utr: values.utr,
          });
          if (error) throw error;
          setPaymentsRefreshKey((k) => k + 1);
        }
        closeModal();
        onUpdated();
      } catch (e) {
        alertMessage("Couldn't save", (e as Error).message);
      } finally {
        setSubmitting(false);
      }
    },
    [modalKind, modalDoc, actorId, organizationId, tripId, trip, payments, closeModal, onUpdated, queryClient],
  );

  const modalConfig: { title: string; fields: ComplianceInputField[] } | null =
    modalKind === "reject"
      ? { title: "Reject document", fields: REJECT_FIELDS }
      : modalKind === "pod"
        ? { title: "Mark hard copy POD received", fields: POD_FIELDS }
        : modalKind === "editAdvance"
          ? { title: "Update Advance Payment UTR", fields: PAYMENT_FIELDS }
          : modalKind === "editBalance"
            ? { title: "Update Balance Payment UTR", fields: PAYMENT_FIELDS }
            : null;

  return (
    <View style={styles.card}>
      <Text style={styles.header}>Compliance</Text>

      {complianceVerifiedAt ? (
        <Text style={styles.verifiedBanner}>✓ Compliance Verified</Text>
      ) : (
        <Text style={styles.pendingBanner}>
          Ready to Verify — trip documents are awaiting compliance verification. This does not
          block the trip.
        </Text>
      )}

      {loadingCompliance ? (
        <ActivityIndicator size="small" color={Theme.textMuted} />
      ) : (
        <ComplianceDocumentTable
          tripId={tripId}
          organizationId={organizationId}
          actorId={actorId}
          documents={documents}
          canVerify={canVerifyDocuments}
          busyDocId={busyDocId}
          onPreview={handlePreview}
          onVerify={handleVerify}
          onReject={(doc) => {
            setModalDoc(doc);
            setModalKind("reject");
          }}
          onUploaded={onUpdated}
        />
      )}

      {trip.vehicle_id ? (
        <VehicleDocumentReuseSection
          tripId={tripId}
          organizationId={organizationId}
          vehicleId={trip.vehicle_id}
          actorId={actorId}
          canUseExistingDocument={canVerifyDocuments}
          canUploadFresh={canVerifyDocuments}
          onUpdated={onUpdated}
        />
      ) : null}

      {canMarkVerified && !complianceVerifiedAt ? (
        <TouchableOpacity
          disabled={!verifyCheck.ok || markingVerified}
          onPress={handleMarkVerified}
          style={[styles.primaryBtn, !verifyCheck.ok && styles.primaryBtnDisabled]}
        >
          <Text style={styles.primaryBtnText}>
            {verifyCheck.ok
              ? "Mark Compliance Verified"
              : `Mark Compliance Verified (missing: ${verifyCheck.missing.join(", ")})`}
          </Text>
        </TouchableOpacity>
      ) : null}

      {complianceVerifiedAt ? (
        <View style={styles.podRow}>
          <Text style={styles.subheader}>Advance Payment</Text>
          {payments.advance ? (
            <PaymentSummaryRow
              label="ADVANCE PAYMENT PROCESSED"
              payment={payments.advance}
              onEdit={canManageFinance ? () => setModalKind("editAdvance") : undefined}
            />
          ) : canManageFinance ? (
            <TouchableOpacity onPress={() => setPayCategory("compliance_advance")} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Initiate Advance Payment</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.muted}>Awaiting Finance to initiate advance payment.</Text>
          )}
        </View>
      ) : null}

      {tripDelivered ? (
        <View style={styles.podRow}>
          <Text style={styles.subheader}>Hard Copy POD</Text>
          {hardCopyPodReceived ? (
            <Text style={styles.verifiedBanner}>✓ Hard copy POD received</Text>
          ) : canManagePod ? (
            <TouchableOpacity onPress={() => setModalKind("pod")} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Mark Hard Copy Received</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.muted}>Awaiting physical POD.</Text>
          )}
        </View>
      ) : null}

      {hardCopyPodReceived ? (
        <View style={styles.podRow}>
          <Text style={styles.subheader}>Balance Payment</Text>
          {payments.balance ? (
            <PaymentSummaryRow
              label="PAYMENT SETTLED"
              payment={payments.balance}
              onEdit={canManageFinance ? () => setModalKind("editBalance") : undefined}
            />
          ) : canManageFinance ? (
            <TouchableOpacity onPress={() => setPayCategory("compliance_balance")} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Process Balance Payment</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.muted}>Balance pending.</Text>
          )}
        </View>
      ) : null}

      <ComplianceInputModal
        visible={modalConfig != null}
        title={modalConfig?.title ?? ""}
        fields={modalConfig?.fields ?? []}
        confirmLabel={submitting ? "Saving…" : "Confirm"}
        onCancel={closeModal}
        onSubmit={handleModalSubmit}
      />
      <CompliancePaymentConfirmModal
        visible={payCategory != null}
        summary={paymentSummary}
        category={payCategory}
        submitting={paying}
        onCancel={() => {
          if (!paying) setPayCategory(null);
        }}
        onConfirm={async (values) => {
          if (!payCategory) return;
          setPaying(true);
          const { error } = await postCompliancePayment({
            organizationId,
            trip,
            category: payCategory,
            amount: values.amount,
            paymentModeId: values.paymentModeId,
            paymentModeLabel: values.paymentModeLabel,
            utr: values.utr,
            notes: values.remark,
          });
          setPaying(false);
          if (error) {
            alertMessage("Couldn't post payment", error.message);
            return;
          }
          setPayCategory(null);
          setPaymentsRefreshKey((k) => k + 1);
          onUpdated();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 8,
  },
  header: { fontSize: 15, fontWeight: "700", color: Theme.textPrimary },
  subheader: { fontSize: 13, fontWeight: "600", color: Theme.textPrimary, marginBottom: 4 },
  pendingBanner: { fontSize: 12, color: "#92600a", backgroundColor: "#fff7e6", padding: 8, borderRadius: 8 },
  verifiedBanner: { fontSize: 12, color: "#0f9d58", fontWeight: "600" },
  muted: { fontSize: 12, color: Theme.textMuted },
  primaryBtn: {
    marginTop: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  primaryBtnDisabled: { backgroundColor: "#C7CAD1" },
  primaryBtnText: { fontSize: 12, color: "#FFFFFF", fontWeight: "700" },
  podRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: "#F1F2F6", paddingTop: 8 },
  paymentRow: { gap: 2 },
  paymentHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  editLink: { fontSize: 11, color: "#2563eb", fontWeight: "600" },
});
