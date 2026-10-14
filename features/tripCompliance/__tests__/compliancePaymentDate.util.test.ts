import {
  formatComplianceTxnDate,
  isComplianceTxnDateConfirmed,
  normalizeComplianceTransactionDate,
  toComplianceTransactionDateInput,
  validateComplianceTransactionDate,
  withLedgerDescriptionTxnDateConfirmed,
} from "@/features/tripCompliance/utils/compliancePaymentDate.util";

describe("compliancePaymentDate.util", () => {
  it("normalizes ISO and YYYY-MM-DD to a calendar day", () => {
    expect(toComplianceTransactionDateInput("2026-10-05")).toBe("2026-10-05");
    expect(toComplianceTransactionDateInput("2026-10-05T00:00:00.000Z").startsWith("2026-10-")).toBe(true);
    expect(normalizeComplianceTransactionDate(" 2026-10-05 ")).toBe("2026-10-05");
  });

  it("validates dates", () => {
    expect(validateComplianceTransactionDate("")).toMatch(/enter/i);
    expect(validateComplianceTransactionDate("2026-13-01")).toMatch(/valid/i);
    expect(validateComplianceTransactionDate("2026-10-05")).toBeNull();
  });

  it("formats txn dates for the table", () => {
    expect(formatComplianceTxnDate("2026-10-05")).toBe("05 Oct 2026");
    expect(formatComplianceTxnDate(null)).toBe("");
  });

  it("marks and reads Ops confirmation of Paid at / Txn Date on QMETA", () => {
    const base =
      'Compliance Advance | Mode: UPI | Notes: first trip [[QMETA:{"trip_number":"BKG-1","payment_reference":null}]]';
    expect(isComplianceTxnDateConfirmed(base)).toBe(false);
    const confirmed = withLedgerDescriptionTxnDateConfirmed(base);
    expect(isComplianceTxnDateConfirmed(confirmed)).toBe(true);
    expect(confirmed).toContain('"compliance_txn_date_set":true');
    expect(confirmed).toContain("Mode: UPI");
    expect(isComplianceTxnDateConfirmed(null)).toBe(false);
    expect(isComplianceTxnDateConfirmed(withLedgerDescriptionTxnDateConfirmed(""))).toBe(true);
  });
});
