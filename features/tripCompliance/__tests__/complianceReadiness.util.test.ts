import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  deriveComplianceQueueReadiness,
  isComplianceAwaitingPod,
  isCompliancePaymentPending,
  summarizeRequiredTripDocuments,
} from "@/features/tripCompliance/utils/complianceReadiness.util";
import { classifyPreviewFailure } from "@/features/tripCompliance/utils/compliancePreviewFailure.util";
import { groupComplianceReviewRows } from "@/features/tripCompliance/utils/complianceDocumentRows.util";

function summaryFixture(overrides: Partial<ComplianceTripSummary> = {}): ComplianceTripSummary {
  return {
    trip: {
      id: "trip-1",
      booking_ref: "T-1",
      client_name: "Acme",
      status: "delivered",
    } as ComplianceTripSummary["trip"],
    stage: "compliance_pending",
    documents: [],
    vehicleDocuments: [],
    driverDocuments: [],
    documentCounts: { total: 0, verified: 0, rejected: 0, pending: 0 },
    checklist: { groups: [] as never, verified: 0, total: 11, tone: "danger" } as ComplianceTripSummary["checklist"],
    complianceVerifiedAt: null,
    complianceVerifiedBy: null,
    advance: null,
    balance: null,
    hardCopyPod: { received: false, receivedAt: null, courier: null, awbNumber: null, receivedBy: null },
    ...overrides,
  };
}

describe("deriveComplianceQueueReadiness", () => {
  it("blocks advance until compliance is marked verified", () => {
    const readiness = deriveComplianceQueueReadiness(summaryFixture());
    expect(readiness.paymentReady).toBe(false);
    expect(readiness.advance.status).toBe("blocked");
    expect(readiness.complianceVerificationIncomplete).toBe(true);
    expect(readiness.missingRequired).toEqual(["LR", "E-way Bill", "Invoice"]);
  });

  it("marks advance ready when verification is complete and no advance exists", () => {
    const readiness = deriveComplianceQueueReadiness(
      summaryFixture({
        complianceVerifiedAt: "2026-09-01",
        financeVerifiedAt: "2026-09-01",
        documents: ["lr", "eway_bill", "invoice"].map((type) => ({
          id: type,
          trip_id: "trip-1",
          document_type: type,
          file_name: `${type}.pdf`,
          storage_path: type,
          uploaded_at: "2026-09-01",
          status: "verified" as const,
          verified_by: "u1",
          verified_at: "2026-09-01",
          rejection_reason: null,
        })),
      }),
    );
    expect(readiness.requiredDocsVerified).toBe(true);
    expect(readiness.advance.status).toBe("ready");
    expect(readiness.paymentReady).toBe(true);
    expect(readiness.readyCategory).toBe("compliance_advance");
  });

  it("allows advance when an older decline was cleared by re-verification", () => {
    const verifiedDocs = ["lr", "eway_bill", "invoice"].map((type) => ({
      id: type,
      trip_id: "trip-1",
      document_type: type,
      file_name: `${type}.pdf`,
      storage_path: type,
      uploaded_at: "2026-09-01",
      status: "verified" as const,
      verified_by: "u1",
      verified_at: "2026-09-01",
      rejection_reason: null,
    }));
    const reVerified = deriveComplianceQueueReadiness(
      summaryFixture({
        documents: verifiedDocs,
        complianceDeclinedAt: "2026-09-01T09:00:00Z",
        complianceDeclineReason: "Document pending",
        complianceVerifiedAt: "2026-09-02T09:00:00Z",
        financeVerifiedAt: "2026-09-02T10:00:00Z",
      }),
    );
    expect(reVerified.advance.status).toBe("ready");
    expect(reVerified.blockerLines).not.toContain("Rejected: Document pending");

    const rejectedAfterVerify = deriveComplianceQueueReadiness(
      summaryFixture({
        documents: verifiedDocs,
        complianceVerifiedAt: "2026-09-01T09:00:00Z",
        complianceDeclinedAt: "2026-09-02T09:00:00Z",
        complianceDeclineReason: "Document pending",
      }),
    );
    expect(rejectedAfterVerify.advance.status).toBe("blocked");
    expect(rejectedAfterVerify.advance.reason).toBe("Rejected: Document pending");
  });

  it("lists delivered Advance Processed trips under Awaiting POD", () => {
    const paid = { amount: 1000, paymentMode: "UPI", utr: null, paidAt: "2026-09-01", actorId: "u1", transactionId: "t1" };
    const delivered = summaryFixture({ stage: "advance_payment_processed", advance: paid });
    const inTransit = summaryFixture({
      stage: "advance_payment_processed",
      advance: paid,
      trip: { ...summaryFixture().trip, status: "in_transit" },
    });
    expect(isComplianceAwaitingPod(delivered)).toBe(true);
    expect(isComplianceAwaitingPod(inTransit)).toBe(false);
    expect(isComplianceAwaitingPod(summaryFixture({ stage: "balance_pending", advance: paid }))).toBe(false);
  });

  it("flags payment-pending across stages until advance is posted", () => {
    const verified = summaryFixture({
      stage: "compliance_verified",
      complianceVerifiedAt: "2026-09-01",
    });
    expect(isCompliancePaymentPending(verified)).toBe(true);
    expect(
      isCompliancePaymentPending(
        summaryFixture({
          stage: "hard_copy_pod_received",
          complianceVerifiedAt: "2026-09-01",
          advance: {
            amount: 1000,
            paymentMode: "UPI",
            utr: "UTR",
            paidAt: "2026-09-01",
            actorId: "u1",
            transactionId: "txn-1",
          },
        }),
      ),
    ).toBe(false);
    expect(isCompliancePaymentPending(summaryFixture({ stage: "compliance_pending" }))).toBe(false);
  });

  it("alerts and blocks payment when RC or insurance is expired", () => {
    const readiness = deriveComplianceQueueReadiness(
      summaryFixture({
        complianceVerifiedAt: "2026-09-01",
        documents: ["lr", "eway_bill", "invoice"].map((type) => ({
          id: type,
          trip_id: "trip-1",
          document_type: type,
          file_name: `${type}.pdf`,
          storage_path: type,
          uploaded_at: "2026-09-01",
          status: "verified" as const,
          verified_by: "u1",
          verified_at: "2026-09-01",
          rejection_reason: null,
        })),
        vehicleDocuments: [
          {
            id: "v-rc",
            entity_type: "vehicle",
            entity_id: "v1",
            doc_type: "rc",
            status: "active",
            storage_path: "org/v1/rc.pdf",
            expiry_date: "2020-01-01",
            verified_at: null,
            notes: null,
            created_at: "2026-01-01",
          },
          {
            id: "v-ins",
            entity_type: "vehicle",
            entity_id: "v1",
            doc_type: "insurance",
            status: "active",
            storage_path: "org/v1/insurance.pdf",
            expiry_date: "2020-06-01",
            verified_at: null,
            notes: null,
            created_at: "2026-01-01",
          },
        ],
      }),
    );
    expect(readiness.expiredVehicleDocs).toEqual(["RC", "Insurance"]);
    expect(readiness.paymentReady).toBe(false);
    expect(readiness.nextAction).toBe("Replace expired RC");
    expect(readiness.blockerLines.some((line) => line.includes("Expired: RC, Insurance"))).toBe(true);
  });

  it("does not treat on-file pending docs as verified", () => {
    const readiness = deriveComplianceQueueReadiness(
      summaryFixture({
        documents: ["lr", "eway_bill", "invoice"].map((type) => ({
          id: type,
          trip_id: "trip-1",
          document_type: type,
          file_name: `${type}.pdf`,
          storage_path: type,
          uploaded_at: "2026-09-01",
          status: "pending" as const,
          verified_by: null,
          verified_at: null,
          rejection_reason: null,
        })),
      }),
    );
    expect(readiness.requiredDocsVerified).toBe(false);
    expect(readiness.pendingVerification).toEqual(["LR", "E-way Bill", "Invoice"]);
    expect(readiness.requiredDocs.verified).toBe(0);
    expect(readiness.requiredDocs.pending).toBe(3);
    expect(readiness.nextAction).toBe("Review LR");
  });
});

describe("summarizeRequiredTripDocuments", () => {
  it("counts verified separately from on-file pending and additional POD", () => {
    const summary = summarizeRequiredTripDocuments([
      {
        id: "lr",
        trip_id: "trip-1",
        document_type: "lr",
        file_name: "lr.pdf",
        storage_path: "lr",
        uploaded_at: "2026-09-01",
        status: "verified",
        verified_by: "u1",
        verified_at: "2026-09-01",
        rejection_reason: null,
      },
      {
        id: "eway",
        trip_id: "trip-1",
        document_type: "eway_bill",
        file_name: "ew.pdf",
        storage_path: "ew",
        uploaded_at: "2026-09-01",
        status: "pending",
        verified_by: null,
        verified_at: null,
        rejection_reason: null,
      },
      {
        id: "pod",
        trip_id: "trip-1",
        document_type: "pod",
        file_name: "pod.pdf",
        storage_path: "pod",
        uploaded_at: "2026-09-01",
        status: "verified",
        verified_by: "u1",
        verified_at: "2026-09-01",
        rejection_reason: null,
      },
    ]);
    expect(summary).toMatchObject({
      total: 3,
      verified: 1,
      pending: 1,
      missing: 1,
      rejected: 0,
      missingLabels: ["Invoice"],
      pendingLabels: ["E-way Bill"],
      markVerifiedReady: false,
      nextAction: "Upload Invoice",
    });
  });
});

describe("classifyPreviewFailure", () => {
  it("classifies missing, permission, and signed-url failures", () => {
    expect(classifyPreviewFailure({ hasStoragePath: false }).kind).toBe("missing");
    expect(classifyPreviewFailure({ hasStoragePath: true, error: new Error("JWT expired 403") }).kind).toBe(
      "permission_denied",
    );
    expect(classifyPreviewFailure({ hasStoragePath: true, url: null }).kind).toBe("signed_url_failed");
  });

  it("does not treat text/plain as a previewable user document", () => {
    expect(
      classifyPreviewFailure({
        hasStoragePath: true,
        url: "https://example.com/file.txt",
        mime: "text/plain",
      }).kind,
    ).toBe("unsupported");
  });
});

describe("groupComplianceReviewRows", () => {
  it("splits rejected, missing, pending, and verified", () => {
    const grouped = groupComplianceReviewRows([
      { key: "lr", type: "lr", required: true, status: "rejected", doc: null, entityDoc: null },
      { key: "invoice", type: "invoice", required: true, status: "missing", doc: null, entityDoc: null },
      { key: "eway_bill", type: "eway_bill", required: true, status: "pending", doc: null, entityDoc: null },
      { key: "pod", type: "pod", required: false, status: "verified", doc: null, entityDoc: null },
    ]);
    expect(grouped.needsAction.map((r) => r.type)).toEqual(["lr"]);
    expect(grouped.missing.map((r) => r.type)).toEqual(["invoice"]);
    expect(grouped.pending.map((r) => r.type)).toEqual(["eway_bill"]);
    expect(grouped.verified.map((r) => r.type)).toEqual(["pod"]);
  });
});
