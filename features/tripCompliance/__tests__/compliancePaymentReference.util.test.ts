import {
  isCashPaymentMode,
  normalizeComplianceUtr,
  readLedgerRequestId,
  validateComplianceRequestId,
  validateComplianceUtr,
  withLedgerDescriptionRequestId,
  withLedgerDescriptionUtr,
} from "@/features/tripCompliance/utils/compliancePaymentReference.util";
import { interpretLedgerRowStructured } from "@/features/finance/ledger/ledgerEntryModel";

describe("compliance UTR helpers", () => {
  it("normalizes and validates bank references", () => {
    expect(normalizeComplianceUtr(" utr 1234 5678 ")).toBe("UTR12345678");
    expect(validateComplianceUtr("")).toMatch(/Enter the UTR/);
    expect(validateComplianceUtr("123")).toMatch(/too short/);
    expect(validateComplianceUtr("HDFC#1234567")).toMatch(/letters, numbers/);
    expect(validateComplianceUtr("hdfc-2026/000123")).toBeNull();
  });

  it("flags cash mode", () => {
    expect(isCashPaymentMode("Cash")).toBe(true);
    expect(isCashPaymentMode("UPI")).toBe(false);
    expect(isCashPaymentMode(null)).toBe(false);
  });

  it("adds a UTR after Mode, keeping notes and the QMETA tag", () => {
    const next = withLedgerDescriptionUtr(
      'Compliance Advance | Mode: UPI | Notes: first trip [[QMETA:{"trip_number":"BKG-1","payment_reference":null}]]',
      "UTR998877",
    );
    expect(next).toBe(
      'Compliance Advance | Mode: UPI | UTR: UTR998877 | Notes: first trip [[QMETA:{"trip_number":"BKG-1","payment_reference":"UTR998877"}]]',
    );
    const parsed = interpretLedgerRowStructured({ description: next });
    expect(parsed.reference_number?.startsWith("UTR998877")).toBe(true);
  });

  it("stores the Request ID after UTR and reads it back", () => {
    const base = 'Compliance Advance | Mode: NEFT | UTR: HDFC123456 | Notes: ok [[QMETA:{"trip_number":"T1"}]]';
    const once = withLedgerDescriptionRequestId(base, "REQ-2026/0042");
    expect(once).toBe(
      'Compliance Advance | Mode: NEFT | UTR: HDFC123456 | Request ID: REQ-2026/0042 | Notes: ok [[QMETA:{"trip_number":"T1"}]]',
    );
    expect(readLedgerRequestId(once)).toBe("REQ-2026/0042");
    const twice = withLedgerDescriptionRequestId(once, "REQ-99");
    expect(readLedgerRequestId(twice)).toBe("REQ-99");
    expect(twice.match(/Request ID:/g)).toHaveLength(1);
    expect(interpretLedgerRowStructured({ description: twice }).reference_number).toBe("HDFC123456");
    expect(readLedgerRequestId(base)).toBeNull();
    expect(validateComplianceRequestId("r1")).toMatch(/too short/);
    expect(validateComplianceRequestId("req 2026_01")).toBeNull();
  });

  it("replaces an existing UTR instead of duplicating it", () => {
    expect(withLedgerDescriptionUtr("Compliance Advance | Mode: NEFT | UTR: OLD123", "NEW456789")).toBe(
      "Compliance Advance | Mode: NEFT | UTR: NEW456789",
    );
  });
});
