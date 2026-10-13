import type { AdvanceProcessedEnrichment } from "@/features/tripCompliance/services/complianceAdvanceProcessed.service";
import type { ComplianceTripSummary } from "@/features/tripCompliance/tripCompliance.types";
import {
  ADVANCE_PROCESSED_EXPORT_HEADERS,
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
