// tripComplianceBulkPayment.service.ts transitively imports finance.service.ts
// -> AuthContext -> @sentry/react-native, which Jest can't parse (ESM, no
// transform configured for that package). Mocking finance.service here keeps
// this suite to the pure CSV-parsing logic it actually exercises.
jest.mock("@/features/finance/services/finance.service", () => ({
  createLedgerEntry: jest.fn(),
  updateLedgerEntry: jest.fn(),
}));

import { blockedTripCanBeReleased, bulkHoldAlerts, existingCompliancePayment, explainBulkPostError, parseComplianceBulkPaymentCsv } from "@/features/tripCompliance/services/tripComplianceBulkPayment.service";

describe("bulkHoldAlerts", () => {
  const documents = {
    total: 3,
    verified: 1,
    pending: 0,
    missing: 1,
    rejected: 0,
    missingLabels: ["E-way Bill"],
    pendingLabels: [],
    rejectedLabels: [],
    nextAction: "Upload E-way Bill",
    markVerifiedReady: false,
  };

  it("names compliance and the pending document, and still allows approval to proceed", () => {
    const alerts = bulkHoldAlerts("compliance_advance", { compliance_verified_at: null, finance_verified_at: null, pod_received_at: null }, documents);
    expect(alerts.map((alert) => alert.title)).toEqual(["Compliance pending", "Documents pending", "Advance pending"]);
    expect(alerts[1]?.detail).toBe("E-way Bill missing");
    expect(blockedTripCanBeReleased(alerts.map((alert) => alert.title).join(" · "))).toBe(true);
  });

  it("lets a missing POD be approved so the balance can proceed", () => {
    const alerts = bulkHoldAlerts(
      "compliance_balance",
      { compliance_verified_at: "2026-01-01", finance_verified_at: "2026-01-01", pod_received_at: null },
      { ...documents, missingLabels: [] },
    );
    expect(alerts[0]?.title).toBe("POD pending");
    expect(blockedTripCanBeReleased(alerts.map((alert) => alert.title).join(" · "))).toBe(true);
  });
});

describe("explainBulkPostError", () => {
  it("turns the rate-mismatch refusal into a sentence the operator can act on", () => {
    expect(explainBulkPostError("trip terms changed after approval; reapprove the advance")).toBe(
      "This payment was not posted. The trip rate did not match the approved advance. Confirm the file again.",
    );
  });
});

describe("existingCompliancePayment", () => {
  it("keeps the latest posted date and amount, and counts every existing row", () => {
    const payment = existingCompliancePayment([
      { transaction_date: "2026-09-01", amount_out: 4000 },
      { transaction_date: "2026-09-08", amount_out: 8000, created_at: "2026-09-08T10:00:00.000Z" },
    ]);
    expect(payment).toEqual({ date: "2026-09-08", amount: 8000, count: 2 });
  });
});

describe("blockedTripCanBeReleased", () => {
  it("lets a missing document, an unapproved advance, or a missing POD be approved, and leaves a posted payment blocked", () => {
    expect(blockedTripCanBeReleased("E-way Bill missing")).toBe(true);
    expect(blockedTripCanBeReleased("Advance not approved yet")).toBe(true);
    expect(blockedTripCanBeReleased("Hard-copy POD has not been marked received.")).toBe(true);
    expect(blockedTripCanBeReleased("An advance payment has already been posted for this trip.")).toBe(false);
    expect(blockedTripCanBeReleased("Advance payment must be posted before the balance payment.")).toBe(false);
  });
});

describe("parseComplianceBulkPaymentCsv", () => {
  it("parses a well-formed CSV with a header row", () => {
    const csv = [
      "Trip ID,Amount,Mode,Date,UTR,Remarks",
      "trip-1,5000,UPI,2026-09-01,UTR001,first",
      "trip-2,7500,CASH,,,second",
    ].join("\n");
    const rows = parseComplianceBulkPaymentCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      rowIndex: 2,
      tripId: "trip-1",
      amount: 5000,
      paymentModeId: "UPI",
      date: "2026-09-01",
      utr: "UTR001",
      remarks: "first",
    });
    expect(rows[1]).toMatchObject({
      rowIndex: 3,
      tripId: "trip-2",
      amount: 7500,
      paymentModeId: "CASH",
      date: undefined,
      utr: undefined,
      remarks: "second",
    });
  });

  it("skips note lines that start with #", () => {
    const csv = [
      "# compliance payment post",
      "# Trip ID: Trip code from the export",
      "Trip ID,Amount,Mode,Date,UTR,Remarks",
      "trip-1,9000,UPI,2026-09-08,HDFC123456,Loading advance",
    ].join("\n");
    const rows = parseComplianceBulkPaymentCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].tripId).toBe("trip-1");
    expect(rows[0].rowIndex).toBe(4);
  });

  it("returns an empty array for a header-only or empty file (malformed CSV)", () => {
    expect(parseComplianceBulkPaymentCsv("Trip ID,Amount,Mode,Date,UTR,Remarks")).toEqual([]);
    expect(parseComplianceBulkPaymentCsv("")).toEqual([]);
  });

  it("carries forward an unparsable amount as NaN for validation to reject, rather than throwing", () => {
    const csv = "Trip ID,Amount,Mode,Date,UTR,Remarks\ntrip-1,not-a-number,UPI,,,";
    const rows = parseComplianceBulkPaymentCsv(csv);
    expect(rows).toHaveLength(1);
    expect(Number.isNaN(rows[0].amount)).toBe(true);
  });

  it("reads Mode from its own column and accepts a posted label", () => {
    const csv = [
      "Remarks,Mode,Trip ID,Date,Amount,UTR",
      "Loading advance,Bank Transfer,trip-1,2026-09-08,9000,HDFC123456",
    ].join("\n");
    const rows = parseComplianceBulkPaymentCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tripId: "trip-1",
      amount: 9000,
      paymentModeId: "BANK",
      date: "2026-09-08",
      utr: "HDFC123456",
      remarks: "Loading advance",
    });
  });
});
