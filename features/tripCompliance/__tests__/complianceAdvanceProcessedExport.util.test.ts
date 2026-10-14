import type { AdvanceProcessedEnrichment } from "@/features/tripCompliance/services/complianceAdvanceProcessed.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  ADVANCE_PAYMENT_EXPORT_HEADERS,
  ADVANCE_PROCESSED_EXPORT_HEADERS,
  buildAdvancePaymentPaidRow,
  buildAdvancePaymentPendingRow,
  countAdvancePaymentExport,
  neutralizeFormula,
  buildAdvanceProcessedExportRow,
  buildAdvanceProcessedExportWorksheet,
  countAdvanceProcessedExport,
} from "@/features/tripCompliance/utils/complianceAdvanceProcessedExport.util";

jest.mock("@/features/trips/services/trips.service", () => ({
  getTripDisplayNumber: (trip: { trip_number?: string }) => trip.trip_number ?? "",
}));

function summary(overrides: Partial<ComplianceTripSummary> = {}): ComplianceTripSummary {
  return {
    trip: {
      id: "t1",
      trip_number: "SAT812GOGTRIP000504",
      organization_id: "org",
      supplier_name: "Hema Sai Transport",
      vehicle_display_number: "TN25AP4869",
    },
    documents: [{ document_type: "lr", document_number: "AH1387", uploaded_at: "2026-10-01T00:00:00Z" }],
    advance: {
      transactionId: "txn-1",
      amount: 114500,
      paymentMode: "UPI",
      utr: null,
      paidAt: "2026-10-01T05:30:00Z",
    },
    ...overrides,
  } as unknown as ComplianceTripSummary;
}

const enrichment = {
  transactionId: "txn-1",
  utrCategory: "compliance_advance",
  payment: { transactionId: "txn-1", amount: 114500, paymentMode: "UPI", utr: "HDFC123456", paidAt: "2026-10-01T05:30:00Z" },
  extraReceipts: 0,
  requestId: "REQ-42",
  supplierName: "HEMA SAI TRANSPORT",
  beneficiaryName: "Pravupa Das",
  approvedBy: "Satham Hussain",
  bankName: "HDFC bank",
  ifsc: "HDFC0001234",
  accountNumber: "0234463738282",
  branch: "PARK STREET",
} as unknown as AdvanceProcessedEnrichment;

describe("Advance Processed export", () => {
  it("uses the sheet columns from the reference, in order", () => {
    expect([...ADVANCE_PROCESSED_EXPORT_HEADERS]).toEqual([
      "TRIP ID",
      "LR NO",
      "TRUCK NO",
      "PAYMENT TYPE",
      "REQUEST ID",
      "SUPPLIER NAME",
      "BENEFICIARY NAME",
      "BANK NAME",
      "IFSC",
      "ACCOUNT NUMBER",
      "ACCOUNT BRANCH",
      "MODE",
      "TRANSACTION DATE",
      "AMOUNT",
      "UTR",
    ]);
  });

  it("maps a trip and its payout account into one row", () => {
    const row = buildAdvanceProcessedExportRow(summary(), enrichment);
    expect(row).toMatchObject({
      "TRIP ID": "SAT812GOGTRIP000504",
      "PAYMENT TYPE": "Advance",
      "REQUEST ID": "REQ-42",
      "SUPPLIER NAME": "HEMA SAI TRANSPORT",
      "BENEFICIARY NAME": "Pravupa Das",
      "BANK NAME": "HDFC bank",
      IFSC: "HDFC0001234",
      "ACCOUNT NUMBER": "0234463738282",
      "ACCOUNT BRANCH": "PARK STREET",
      MODE: "UPI",
      "TRANSACTION DATE": "01 Oct 2026",
      AMOUNT: "114500",
      UTR: "HDFC123456",
    });
    expect(row["LR NO"]).toContain("AH1387");
  });

  it("falls back to the trip when enrichment is missing", () => {
    const row = buildAdvanceProcessedExportRow(summary(), undefined);
    expect(row["SUPPLIER NAME"]).toBe("Hema Sai Transport");
    expect(row["BENEFICIARY NAME"]).toBe("");
    expect(row.UTR).toBe("");
    expect(countAdvanceProcessedExport([row, buildAdvanceProcessedExportRow(summary(), enrichment)])).toEqual({
      total: 2,
      withUtr: 1,
      awaitingUtr: 1,
    });
  });

  it("keeps account numbers as text and amount as a number", () => {
    const sheet = buildAdvanceProcessedExportWorksheet([buildAdvanceProcessedExportRow(summary(), enrichment)]);
    expect(sheet.J2).toMatchObject({ t: "s", v: "0234463738282" });
    expect(sheet.N2).toMatchObject({ t: "n", v: 114500 });
    expect(sheet.A1).toMatchObject({ v: "TRIP ID" });
    expect(sheet["!ref"]).toBe("A1:O2");
  });
});

describe("Advance Payment export", () => {
  const bank = {
    name: "Hema Sai Transport",
    beneficiary: "Hema Sai",
    bankName: "HDFC Bank",
    ifsc: "HDFC0001234",
    accountNumber: "001234567890",
    branch: "Guindy",
  };

  it("adds STATUS after the bank-sheet columns", () => {
    expect(ADVANCE_PAYMENT_EXPORT_HEADERS).toEqual([...ADVANCE_PROCESSED_EXPORT_HEADERS, "STATUS"]);
  });

  it("builds a Pending row with the payable and no payment details", () => {
    const row = buildAdvancePaymentPendingRow(summary({ advance: null }), bank, 113600);
    expect(row.STATUS).toBe("Pending");
    expect(row.AMOUNT).toBe("113600");
    expect(row["BENEFICIARY NAME"]).toBe("Hema Sai");
    expect(row["ACCOUNT NUMBER"]).toBe("001234567890");
    expect([row.MODE, row["TRANSACTION DATE"], row.UTR, row["REQUEST ID"]]).toEqual(["", "", "", ""]);
  });

  it("keeps the amount blank when the payable is unknown", () => {
    expect(buildAdvancePaymentPendingRow(summary({ advance: null }), undefined, null).AMOUNT).toBe("");
  });

  it("builds a Paid row from the posted advance and counts both", () => {
    const paid = buildAdvancePaymentPaidRow(summary(), enrichment);
    expect(paid.STATUS).toBe("Paid");
    expect(paid.UTR).toBe("HDFC123456");
    const pending = buildAdvancePaymentPendingRow(summary({ advance: null }), bank, 1);
    expect(countAdvancePaymentExport([pending, paid, paid])).toEqual({ total: 3, paid: 2, pending: 1 });
  });
});

describe("Advance Payment export — request number and formula safety", () => {
  it("puts the issued request number on Pending rows", () => {
    const row = buildAdvancePaymentPendingRow(summary({ advance: null }), undefined, 100, "SAT812-PAY-000020");
    expect(row["REQUEST ID"]).toBe("SAT812-PAY-000020");
  });

  it("neutralizes cells that would run as a formula", () => {
    expect(neutralizeFormula("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(neutralizeFormula("+91 98400")).toBe("'+91 98400");
    expect(neutralizeFormula("-CASH")).toBe("'-CASH");
    expect(neutralizeFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeFormula("SMK LOGISTICS")).toBe("SMK LOGISTICS");
    expect(neutralizeFormula("SAT812-PAY-000001")).toBe("SAT812-PAY-000001");
  });
});
