import {
    buildComplianceOutstandingSummary,
    canApproveComplianceWithException,
    canMarkComplianceVerified,
    deriveComplianceStage,
    isAdvancePostedAfterVerification,
    stripLedgerMetaTag,
    summarizeComplianceTrip,
    tripAppearsInAwaitingPod,
} from "@/features/tripCompliance/services/tripComplianceRead.service";
import { shouldShowPaymentStatusPill } from "@/features/tripCompliance/utils/complianceCardVisual.util";
import { deriveComplianceQueueReadiness } from "@/features/tripCompliance/utils/complianceReadiness.util";
import type {
    ComplianceDocumentRow,
    ComplianceEntityDocument,
    ComplianceTripFlags,
    ComplianceTripInputs,
} from "@/features/tripCompliance/tripCompliance.types";
import type { TripRow } from "@/features/trips/services/trips.service";

const PAYMENT = {
  amount: 1000,
  paymentMode: "UPI",
  utr: "UTR123",
  paidAt: "2026-09-01",
  actorId: "user-1",
  transactionId: "txn-1",
};

describe("deriveComplianceStage", () => {
  it("is PENDING_FOR_DOCS when no documents exist", () => {
    expect(
      deriveComplianceStage({
        documentCount: 0,
        complianceVerifiedAt: null,
        advance: null,
        tripStatus: "loading",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("pending_for_docs");
  });

  it("stays PENDING_FOR_DOCS when a required vehicle or driver file is still missing", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        missingRequiredCount: 0,
        missingRequiredEntityCount: 1,
        complianceVerifiedAt: null,
        advance: null,
        tripStatus: "loading",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("pending_for_docs");
  });

  it("is COMPLIANCE_PENDING once required trip, vehicle, and driver files are on file", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        missingRequiredCount: 0,
        missingRequiredEntityCount: 0,
        complianceVerifiedAt: null,
        advance: null,
        tripStatus: "loading",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("compliance_pending");
  });

  it("is COMPLIANCE_PENDING once docs exist but none are verified", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        complianceVerifiedAt: null,
        advance: null,
        tripStatus: "loading",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("compliance_pending");
  });

  it("never blocks on trip status — a trip already IN_TRANSIT with compliance still pending stays COMPLIANCE_PENDING, not an error state", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        complianceVerifiedAt: null,
        advance: null,
        tripStatus: "in_transit",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("compliance_pending");
  });

  it("is COMPLIANCE_VERIFIED once verified and no advance posted yet", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        complianceVerifiedAt: "2026-09-01T00:00:00Z",
        advance: null,
        tripStatus: "loading",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("compliance_verified");
  });

  it("moves to ADVANCE_PAYMENT_PROCESSED once a verified trip has an advance posted", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        complianceVerifiedAt: "2026-09-01T00:00:00Z",
        advance: PAYMENT,
        tripStatus: "in_transit",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("advance_payment_processed");
  });

  it("moves to PENDING_FOR_DOCS when required vehicle docs are expired (even with advance)", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        missingRequiredCount: 0,
        hasExpiredRequiredVehicleDocs: true,
        complianceVerifiedAt: "2026-09-01T00:00:00Z",
        advance: PAYMENT,
        tripStatus: "in_transit",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("pending_for_docs");
  });

  it("keeps an unverified Delivered trip in Pending Docs when vehicle docs are expired", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        missingRequiredCount: 0,
        hasExpiredRequiredVehicleDocs: true,
        complianceVerifiedAt: null,
        advance: null,
        tripStatus: "delivered",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("pending_for_docs");
  });

  it("keeps a verified Delivered trip in Awaiting POD even when vehicle docs are expired", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        missingRequiredCount: 0,
        hasExpiredRequiredVehicleDocs: true,
        complianceVerifiedAt: "2026-09-01T00:00:00Z",
        advance: null,
        tripStatus: "delivered",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("hard_copy_pod_received");
  });

  it("keeps an unverified delivered trip with missing docs in Pending Docs", () => {
    expect(
      deriveComplianceStage({
        documentCount: 0,
        missingRequiredCount: 3,
        complianceVerifiedAt: null,
        advance: null,
        tripStatus: "completed",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("pending_for_docs");
  });

  it("keeps an unverified delivered trip with every required doc in Compliance Pending", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        missingRequiredCount: 0,
        missingRequiredEntityCount: 0,
        complianceVerifiedAt: null,
        advance: null,
        tripStatus: "delivered",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("compliance_pending");
  });

  it("does not move an unverified trip to Balance Pending when hard-copy POD is marked", () => {
    expect(
      deriveComplianceStage({
        documentCount: 0,
        complianceVerifiedAt: null,
        advance: null,
        tripStatus: "done",
        hardCopyReceived: true,
        balance: null,
      }),
    ).toBe("pending_for_docs");
  });

  it("keeps PAYMENT_SETTLED when balance exists even if vehicle docs expired", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        hasExpiredRequiredVehicleDocs: true,
        complianceVerifiedAt: "2026-09-01T00:00:00Z",
        advance: PAYMENT,
        tripStatus: "completed",
        hardCopyReceived: true,
        balance: PAYMENT,
      }),
    ).toBe("payment_settled");
  });

  it("keeps an undelivered trip with amount_paid in Pending Docs instead of Awaiting POD", () => {
    expect(
      deriveComplianceStage({
        documentCount: 0,
        complianceVerifiedAt: null,
        advance: PAYMENT,
        tripStatus: "assigned",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("pending_for_docs");
  });

  it("keeps a completed unverified trip with docs in Compliance Pending even when an advance exists", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        missingRequiredCount: 0,
        complianceVerifiedAt: null,
        advance: PAYMENT,
        tripStatus: "completed",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("compliance_pending");
  });

  it("is AWAITING_POD (exclusive) once delivered and verified until hard-copy POD is marked received, even with an advance", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        complianceVerifiedAt: "2026-09-01T00:00:00Z",
        advance: PAYMENT,
        tripStatus: "delivered",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("hard_copy_pod_received");
  });

  it("is HARD_COPY_POD_RECEIVED once delivered with no advance and hard-copy POD not yet marked", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        complianceVerifiedAt: "2026-09-01T00:00:00Z",
        advance: null,
        tripStatus: "delivered",
        hardCopyReceived: false,
        balance: null,
      }),
    ).toBe("hard_copy_pod_received");
  });

  it("is BALANCE_PENDING once hard-copy POD marked received but no balance posted", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        complianceVerifiedAt: "2026-09-01T00:00:00Z",
        advance: PAYMENT,
        tripStatus: "delivered",
        hardCopyReceived: true,
        balance: null,
      }),
    ).toBe("balance_pending");
  });

  it("is PAYMENT_SETTLED once balance is posted", () => {
    expect(
      deriveComplianceStage({
        documentCount: 3,
        complianceVerifiedAt: "2026-09-01T00:00:00Z",
        advance: PAYMENT,
        tripStatus: "delivered",
        hardCopyReceived: true,
        balance: PAYMENT,
      }),
    ).toBe("payment_settled");
  });
});

describe("summarizeComplianceTrip — unverified trips stay off Awaiting POD", () => {
  function inputs(partial: Partial<ComplianceTripInputs> & Pick<ComplianceTripInputs, "trip">): ComplianceTripInputs {
    return {
      documents: [],
      flags: null,
      taggedAdvance: null,
      balance: null,
      vehicleDocuments: [],
      driverDocuments: [],
      vaultVehicleId: null,
      ...partial,
    };
  }

  it("keeps an at-destination trip with only a soft POD in Pending Docs until required docs and verify", () => {
    const summary = summarizeComplianceTrip(
      inputs({
        trip: {
          id: "trip-drop",
          organization_id: "org-1",
          status: "at_drop",
          driver_id: "driver-1",
        } as TripRow,
        documents: [
          {
            id: "pod-1",
            trip_id: "trip-drop",
            document_type: "pod",
            file_name: "pod.pdf",
            storage_path: "pod.pdf",
            uploaded_at: "2026-09-20",
            status: "pending",
            verified_by: null,
            verified_at: null,
            rejection_reason: null,
          },
        ],
      }),
    );
    expect(summary.stage).toBe("pending_for_docs");
    expect(tripAppearsInAwaitingPod(summary)).toBe(true);
  });

  it("leaves an at-destination trip without a soft POD out of Awaiting POD", () => {
    const summary = summarizeComplianceTrip(
      inputs({
        trip: {
          id: "trip-drop",
          organization_id: "org-1",
          status: "unloading",
          driver_id: "driver-1",
        } as TripRow,
      }),
    );
    expect(summary.stage).not.toBe("hard_copy_pod_received");
    expect(tripAppearsInAwaitingPod(summary)).toBe(false);
  });

  it("lists a completed unverified trip in Awaiting POD as well as Compliance Pending", () => {
    const summary = summarizeComplianceTrip(
      inputs({
        trip: {
          id: "trip-done",
          organization_id: "org-1",
          status: "delivered",
          driver_id: "driver-1",
        } as TripRow,
        documents: ["lr", "eway_bill", "invoice"].map((type) => ({
          id: `trip-done-${type}`,
          trip_id: "trip-done",
          document_type: type,
          file_name: `${type}.pdf`,
          storage_path: `${type}.pdf`,
          uploaded_at: "2026-09-20",
          status: "pending" as const,
          verified_by: null,
          verified_at: null,
          rejection_reason: null,
        })),
        vehicleDocuments: ["rc", "insurance", "fitness"].map((doc_type) => ({
          id: `v-${doc_type}`,
          entity_type: "vehicle" as const,
          entity_id: "v1",
          doc_type,
          status: "pending",
          storage_path: `${doc_type}.pdf`,
          expiry_date: "2027-01-01",
          verified_at: null,
          notes: null,
          created_at: "2026-09-01",
        })),
        driverDocuments: [
          {
            id: "d-license",
            entity_type: "driver" as const,
            entity_id: "d1",
            doc_type: "license",
            status: "pending",
            storage_path: "license.pdf",
            expiry_date: "2027-01-01",
            verified_at: null,
            notes: null,
            created_at: "2026-09-01",
          },
        ],
      }),
    );
    expect(summary.stage).toBe("compliance_pending");
    expect(tripAppearsInAwaitingPod(summary)).toBe(true);
  });
});

describe("stripLedgerMetaTag", () => {
  it("drops the trailing QMETA tag from a parsed payment mode", () => {
    expect(
      stripLedgerMetaTag('UPI [[QMETA:{"trip_number":"BKG-bvtx24","category":"Compliance Advance"}]]'),
    ).toBe("UPI");
    expect(stripLedgerMetaTag("NEFT")).toBe("NEFT");
    expect(stripLedgerMetaTag('[[QMETA:{"trip_number":"T1"}]]')).toBeNull();
    expect(stripLedgerMetaTag(null)).toBeNull();
  });
});

describe("isAdvancePostedAfterVerification", () => {
  it("counts an advance posted at or after verification", () => {
    expect(isAdvancePostedAfterVerification({ postedAt: "2026-10-05T08:39:04Z" }, "2026-10-05T07:55:16Z")).toBe(true);
    expect(isAdvancePostedAfterVerification({ postedAt: "2026-10-05T07:55:16Z" }, "2026-10-05T07:55:16Z")).toBe(true);
  });

  it("still reports ordering when posted before verification (legacy helper; counting no longer uses this)", () => {
    expect(isAdvancePostedAfterVerification({ postedAt: "2026-10-01T11:14:07Z" }, "2026-10-02T00:00:00Z")).toBe(false);
  });

  it("trusts a row with no posting time", () => {
    expect(isAdvancePostedAfterVerification({ postedAt: null }, "2026-10-02T00:00:00Z")).toBe(true);
    expect(isAdvancePostedAfterVerification({}, "2026-10-02T00:00:00Z")).toBe(true);
  });
});

describe("summarizeComplianceTrip — the advance is paid from Verified", () => {
  const FLAGS: ComplianceTripFlags = {
    compliance_verified_at: null,
    compliance_verified_by: null,
    compliance_decision: null,
    compliance_exception_reason: null,
    compliance_outstanding_summary: null,
    compliance_declined_at: null,
    compliance_declined_by: null,
    compliance_decline_reason: null,
    pod_hard_copy_courier: null,
    pod_hard_copy_awb_number: null,
    pod_hard_copy_received_by: null,
    pod_received_at: null,
  };
  const ADVANCE = { ...PAYMENT, amount: 114500, transactionId: "578b883e", postedAt: "2026-10-01T11:14:07Z" };

  function entityDoc(entityType: "vehicle" | "driver", entityId: string, docType: string): ComplianceEntityDocument {
    return {
      id: `${entityType}-${docType}`,
      organization_id: "org-1",
      entity_type: entityType,
      entity_id: entityId,
      doc_type: docType,
      doc_label: null,
      doc_number: null,
      issued_date: null,
      expiry_date: "2030-01-01",
      issued_by: null,
      status: "verified",
      storage_path: `org-1/${entityType}/${docType}.pdf`,
      notes: null,
      verified_by: null,
      verified_at: null,
      created_by: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    } as ComplianceEntityDocument;
  }

  // Shaped like SAT812GOGTRIP000504 on preprod: in transit, never verified, yet a
  // compliance_advance row was posted on 2026-10-01.
  function summary(opts: {
    verifiedAt?: string | null;
    amountPaid?: number;
    tagged?: boolean;
    postedAt?: string;
    podReceivedAt?: string;
  }) {
    return summarizeComplianceTrip({
      trip: {
        id: "trip-504",
        organization_id: "org-1",
        status: "in_transit",
        amount_paid: opts.amountPaid ?? 0,
        updated_at: "2026-10-01T03:45:44Z",
        created_at: "2026-09-30T13:12:55Z",
      } as unknown as TripRow,
      documents: ["lr", "eway_bill", "invoice"].map((type) =>
        doc({ id: `d-${type}`, trip_id: "trip-504", document_type: type, status: "verified", verified_at: "2026-10-01" }),
      ),
      flags: {
        ...FLAGS,
        compliance_verified_at: opts.verifiedAt ?? null,
        pod_received_at: opts.podReceivedAt ?? null,
      },
      taggedAdvance:
        opts.tagged === false ? null : { ...ADVANCE, postedAt: opts.postedAt ?? ADVANCE.postedAt },
      balance: null,
      vehicleDocuments: ["rc", "insurance", "fitness"].map((type) => entityDoc("vehicle", "v1", type)),
      driverDocuments: [entityDoc("driver", "d1", "license")],
      vaultVehicleId: null,
    });
  }

  it("keeps an unverified trip with a stale compliance_advance on Compliance Pending, with no Advance Processed pill", () => {
    const s = summary({});
    expect(s.stage).toBe("compliance_pending");
    expect(s.advance).toBeNull();
    expect(shouldShowPaymentStatusPill(s)).toBe(false);
  });

  it("does not treat a Finance receipt (amount_paid) as an advance on an unverified trip", () => {
    const s = summary({ tagged: false, amountPaid: 114500 });
    expect(s.stage).toBe("compliance_pending");
    expect(s.advance).toBeNull();
  });

  it("offers no advance payment for an unverified trip", () => {
    const readiness = deriveComplianceQueueReadiness(summary({}));
    expect(readiness.paymentReady).toBe(false);
    expect(readiness.advance.status).toBe("blocked");
  });

  it("counts a Finance advance posted before verification once the trip is verified", () => {
    const s = summary({ verifiedAt: "2026-10-02T00:00:00Z" });
    expect(s.stage).toBe("advance_payment_processed");
    expect(s.advance?.amount).toBe(114500);
    expect(s.advanceBeforeVerification).toBeNull();
    expect(shouldShowPaymentStatusPill(s)).toBe(true);
  });

  it("opens Balance Pending when a pre-verify Finance advance is on file and hard-copy POD is received", () => {
    const s = summary({
      verifiedAt: "2026-10-02T00:00:00Z",
      podReceivedAt: "2026-10-03T00:00:00Z",
    });
    // Undelivered + hard copy + counted advance → balance lane.
    expect(s.stage).toBe("balance_pending");
    expect(s.advance?.amount).toBe(114500);
  });

  it("treats a verified trip with a Finance advance as advance posted (no reverse/re-post block)", () => {
    const readiness = deriveComplianceQueueReadiness(summary({ verifiedAt: "2026-10-02T00:00:00Z" }));
    expect(readiness.paymentReady).toBe(false);
    expect(readiness.advance.status).toBe("posted");
    expect(readiness.advance.reason).toMatch(/Advance posted/i);
  });

  it("keeps a verified trip with only a Finance receipt in Verified, ready for the advance, even with the POD received", () => {
    const s = summary({
      verifiedAt: "2026-10-02T00:00:00Z",
      tagged: false,
      amountPaid: 114500,
      podReceivedAt: "2026-10-03T00:00:00Z",
    });
    expect(s.stage).toBe("compliance_verified");
    expect(s.advance).toBeNull();
    // Advance waits for Finance's Approve Advance (finance_verified_at).
    expect(deriveComplianceQueueReadiness(s).readyCategory).toBeNull();
  });

  it("counts an advance posted after verification (exception approval sets the same column)", () => {
    const s = summary({ verifiedAt: "2026-10-02T00:00:00Z", postedAt: "2026-10-02T09:00:00Z" });
    // Post-verify advance moves the exclusive stage to Advance Processed.
    expect(s.stage).toBe("advance_payment_processed");
    expect(s.advance?.amount).toBe(114500);
    expect(s.advanceBeforeVerification).toBeNull();
    expect(shouldShowPaymentStatusPill(s)).toBe(true);
  });
});

function doc(overrides: Partial<ComplianceDocumentRow>): ComplianceDocumentRow {
  return {
    id: overrides.id ?? "doc-1",
    trip_id: "trip-1",
    document_type: "lr",
    file_name: "f.pdf",
    storage_path: "path",
    uploaded_at: "2026-09-01",
    status: "pending",
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    ...overrides,
  };
}

describe("canMarkComplianceVerified", () => {
  it("fails when required document types are missing entirely", () => {
    const result = canMarkComplianceVerified([doc({ document_type: "lr", status: "verified" })]);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("invoice");
  });

  it("fails when a required document type exists but isn't verified", () => {
    const result = canMarkComplianceVerified([
      doc({ id: "1", document_type: "lr", status: "verified" }),
      doc({ id: "2", document_type: "invoice", status: "pending" }),
      doc({ id: "3", document_type: "eway_bill", status: "verified" }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["invoice"]);
  });

  it("passes only once LR, e-way bill, and invoice are verified", () => {
    const result = canMarkComplianceVerified([
      doc({ id: "1", document_type: "lr", status: "verified" }),
      doc({ id: "2", document_type: "invoice", status: "verified" }),
      doc({ id: "3", document_type: "eway_bill", status: "verified" }),
    ]);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });
});

describe("buildComplianceOutstandingSummary", () => {
  it("captures a missing required document (no row at all)", () => {
    const result = buildComplianceOutstandingSummary([
      doc({ id: "1", document_type: "lr", status: "verified" }),
      doc({ id: "2", document_type: "invoice", status: "verified" }),
    ]);
    expect(result.missing).toEqual(["eway_bill"]);
    expect(result.pending_verification).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("captures a pending-verification required document", () => {
    const result = buildComplianceOutstandingSummary([
      doc({ id: "1", document_type: "lr", status: "verified" }),
      doc({ id: "2", document_type: "invoice", status: "pending" }),
      doc({ id: "3", document_type: "eway_bill", status: "verified" }),
    ]);
    expect(result.pending_verification).toEqual(["invoice"]);
    expect(result.missing).toEqual([]);
  });

  it("captures a rejected required document", () => {
    const result = buildComplianceOutstandingSummary([
      doc({ id: "1", document_type: "lr", status: "verified" }),
      doc({ id: "2", document_type: "invoice", status: "rejected" }),
      doc({ id: "3", document_type: "eway_bill", status: "verified" }),
    ]);
    expect(result.rejected).toEqual(["invoice"]);
  });

  it("is empty once every required type is verified", () => {
    const result = buildComplianceOutstandingSummary([
      doc({ id: "1", document_type: "lr", status: "verified" }),
      doc({ id: "2", document_type: "invoice", status: "verified" }),
      doc({ id: "3", document_type: "eway_bill", status: "verified" }),
    ]);
    expect(result).toEqual({ missing: [], pending_verification: [], rejected: [] });
  });
});

describe("canApproveComplianceWithException", () => {
  it("is eligible when the trip has outstanding required docs and hasn't been decided", () => {
    const result = canApproveComplianceWithException({
      documents: [doc({ id: "1", document_type: "lr", status: "verified" })],
      complianceVerifiedAt: null,
    });
    expect(result.ok).toBe(true);
    expect(result.outstanding.missing).toEqual(expect.arrayContaining(["invoice", "eway_bill"]));
  });

  it("is not eligible once every required doc is verified — normal approval applies instead", () => {
    const result = canApproveComplianceWithException({
      documents: [
        doc({ id: "1", document_type: "lr", status: "verified" }),
        doc({ id: "2", document_type: "invoice", status: "verified" }),
        doc({ id: "3", document_type: "eway_bill", status: "verified" }),
      ],
      complianceVerifiedAt: null,
    });
    expect(result.ok).toBe(false);
  });

  it("is not eligible once the trip already has a compliance decision", () => {
    const result = canApproveComplianceWithException({
      documents: [doc({ id: "1", document_type: "lr", status: "verified" })],
      complianceVerifiedAt: "2026-09-01T00:00:00Z",
    });
    expect(result.ok).toBe(false);
  });
});
