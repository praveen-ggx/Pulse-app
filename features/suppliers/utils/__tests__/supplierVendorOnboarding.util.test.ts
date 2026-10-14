import type { SupplierKycDocument } from "@/features/suppliers/types/supplierManagement.types";
import {
  REGISTRATION_NUMBER_FIELD,
  VENDOR_VAULT_SECTIONS,
  docsForSection,
  financialYearChoices,
  financialYearOf,
  financialYearOptions,
  isValidFinancialYear,
  latestDocOfType,
  latestDocOfTypes,
  maskAadhaar,
  formatAadhaarNumber,
  maskAccountNumber,
  normalizeVendorStatus,
  parsePercentage,
  validateVendorNumber,
  validateVendorStatusChange,
} from "@/features/suppliers/utils/supplierVendorOnboarding.util";

function doc(partial: Partial<SupplierKycDocument> & Pick<SupplierKycDocument, "id" | "doc_type">): SupplierKycDocument {
  return { status: "pending", version_number: 1, ...partial };
}

describe("vendor number validation", () => {
  it("accepts valid numbers and treats empty as not provided", () => {
    expect(validateVendorNumber("pan", "abcde1234f")).toBeNull();
    expect(validateVendorNumber("aadhaar", "2345 6789 0123")).toBeNull();
    expect(validateVendorNumber("aadhaar", "012345678901")).toBeNull();
    expect(validateVendorNumber("ifsc", "hdfc0001234")).toBeNull();
    expect(validateVendorNumber("gstin", "29ABCDE1234F1Z5")).toBeNull();
    expect(validateVendorNumber("udyam", "UDYAM-KA-01-0012345")).toBeNull();
    expect(validateVendorNumber("account", "123456789012")).toBeNull();
    expect(validateVendorNumber("pan", "  ")).toBeNull();
  });

  it("formats Aadhaar as four-digit groups and keeps leading zeros", () => {
    expect(formatAadhaarNumber("577645670912")).toBe("5776 4567 0912");
    expect(formatAadhaarNumber("012345678901")).toBe("0123 4567 8901");
    expect(formatAadhaarNumber("5776 4567 0912")).toBe("5776 4567 0912");
  });

  it("rejects malformed numbers", () => {
    expect(validateVendorNumber("pan", "ABCD1234F")).toMatch(/PAN/);
    expect(validateVendorNumber("aadhaar", "12345678901")).toMatch(/Aadhaar/);
    expect(validateVendorNumber("ifsc", "HDFC1001234")).toMatch(/IFSC/);
    expect(validateVendorNumber("gstin", "29ABCDE1234F1X5")).toMatch(/GSTIN/);
    expect(validateVendorNumber("udyam", "UDYAM-KA-1-12345")).toMatch(/Udyam/);
    expect(validateVendorNumber("account", "12AB")).toMatch(/Account/);
  });

  it("accepts varied Gumasta licence formats but rejects junk", () => {
    expect(validateVendorNumber("gumasta", "760012345/Commercial II")).toBeNull();
    expect(validateVendorNumber("gumasta", "MH-SE-2026-00123")).toBeNull();
    expect(validateVendorNumber("gumasta", "12")).toMatch(/Gumasta/);
  });

  it("stores each registration kind in the right supplier column", () => {
    expect(REGISTRATION_NUMBER_FIELD).toEqual({
      gstin: "gstin",
      udyam: "msme_number",
      msme: "msme_number",
      gumasta: "gumasta_number",
    });
    expect(VENDOR_VAULT_SECTIONS.find((s) => s.id === "registration")?.docTypes).toContain("gumasta");
  });
});

describe("masking", () => {
  it("shows only the last 4 digits", () => {
    expect(maskAadhaar("234567890123")).toBe("XXXX XXXX 0123");
    expect(maskAadhaar(null)).toBe("");
    expect(maskAccountNumber("123456789012")).toBe("XXXXXXXX9012");
    expect(maskAccountNumber("1234")).toBe("1234");
  });
});

describe("financial year", () => {
  it("uses April–March", () => {
    expect(financialYearOf(new Date(2026, 3, 1))).toBe("2026-27");
    expect(financialYearOf(new Date(2027, 2, 31))).toBe("2026-27");
    expect(financialYearOf(new Date(2026, 2, 31))).toBe("2025-26");
    expect(financialYearOf(new Date(2099, 5, 1))).toBe("2099-00");
  });

  it("lists next, current, then previous years", () => {
    expect(financialYearOptions(new Date(2026, 8, 28), 2)).toEqual(["2027-28", "2026-27", "2025-26", "2024-25"]);
  });

  it("rolls the next year forward when the financial year ends", () => {
    expect(financialYearOf(new Date(2027, 2, 31))).toBe("2026-27");
    expect(financialYearOf(new Date(2027, 3, 1))).toBe("2027-28");
    expect(financialYearOptions(new Date(2027, 3, 1), 3)[0]).toBe("2028-29");
    expect(financialYearOptions(new Date(2028, 3, 1), 3).slice(0, 2)).toEqual(["2029-30", "2028-29"]);
  });

  it("keeps saved years that are older than the recent window", () => {
    expect(financialYearChoices(new Date(2028, 3, 1), ["2020-21"], 3)).toContain("2020-21");
    expect(financialYearChoices(new Date(2028, 3, 1), ["2020-21"], 3)[0]).toBe("2029-30");
  });

  it("validates the FY format", () => {
    expect(isValidFinancialYear("2026-27")).toBe(true);
    expect(isValidFinancialYear("2099-00")).toBe(true);
    expect(isValidFinancialYear("2026-28")).toBe(false);
    expect(isValidFinancialYear("26-27")).toBe(false);
  });
});

describe("percentages", () => {
  it("parses 0–100 with up to 2 decimals", () => {
    expect(parsePercentage("30")).toBe(30);
    expect(parsePercentage("1.5")).toBe(1.5);
    expect(parsePercentage("0")).toBe(0);
    expect(parsePercentage("100")).toBe(100);
    expect(parsePercentage("100.01")).toBeNull();
    expect(parsePercentage("-1")).toBeNull();
    expect(parsePercentage("abc")).toBeNull();
    expect(parsePercentage("1.234")).toBeNull();
  });

  it("accepts an optional trailing %", () => {
    expect(parsePercentage("2%")).toBe(2);
    expect(parsePercentage("1%")).toBe(1);
    expect(parsePercentage(" 1.5 % ")).toBe(1.5);
    expect(parsePercentage("100%")).toBe(100);
    expect(parsePercentage("%")).toBeNull();
    expect(parsePercentage("abc%")).toBeNull();
  });
});

describe("vendor status", () => {
  it("defaults unknown values to active", () => {
    expect(normalizeVendorStatus(null)).toBe("active");
    expect(normalizeVendorStatus("weird")).toBe("active");
    expect(normalizeVendorStatus("blacklisted")).toBe("blacklisted");
  });

  it("requires a reason only for blacklisting", () => {
    expect(validateVendorStatusChange("blacklisted", " ")).toMatch(/reason/);
    expect(validateVendorStatusChange("blacklisted", "Fake documents")).toBeNull();
    expect(validateVendorStatusChange("inactive", "")).toBeNull();
  });
});

describe("vault sections", () => {
  const other = VENDOR_VAULT_SECTIONS.find((s) => s.id === "other")!;

  it("keeps every uploaded file of a multi section, oldest first", () => {
    const docs = [
      doc({ id: "b", doc_type: "other", created_at: "2026-09-02T00:00:00Z" }),
      doc({ id: "a", doc_type: "other", created_at: "2026-09-01T00:00:00Z" }),
      doc({ id: "x", doc_type: "pan", created_at: "2026-09-03T00:00:00Z" }),
    ];
    expect(docsForSection(docs, other).map((d) => d.id)).toEqual(["a", "b"]);
    expect(other.requiresName).toBe(true);
  });

  it("picks the latest version of a single-file doc", () => {
    const docs = [
      doc({ id: "v1", doc_type: "pan", version_number: 1 }),
      doc({ id: "v2", doc_type: "pan", version_number: 2 }),
    ];
    expect(latestDocOfType(docs, "pan")?.id).toBe("v2");
  });

  it("picks the most recently updated bank proof across proof types", () => {
    const docs = [
      doc({ id: "cheque", doc_type: "cancelled_cheque", updated_at: "2026-09-01T00:00:00Z" }),
      doc({ id: "stmt", doc_type: "bank_statement", updated_at: "2026-09-05T00:00:00Z" }),
    ];
    expect(latestDocOfTypes(docs, ["cancelled_cheque", "bank_statement", "bank_proof_other"])?.id).toBe("stmt");
  });
});
