// tripComplianceBulkPayment.service.ts transitively imports finance.service.ts
// -> AuthContext -> @sentry/react-native, which Jest can't parse (ESM, no
// transform configured for that package). Mocking finance.service here keeps
// this suite to the pure CSV-parsing logic it actually exercises.
jest.mock("@/features/finance/services/finance.service", () => ({
  createLedgerEntry: jest.fn(),
  updateLedgerEntry: jest.fn(),
}));

import { parseComplianceBulkPaymentCsv } from "@/features/tripCompliance/services/tripComplianceBulkPayment.service";

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
