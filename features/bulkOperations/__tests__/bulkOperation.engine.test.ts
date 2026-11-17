jest.mock("@/features/finance/services/finance.service", () => ({
  createLedgerEntry: jest.fn(),
  updateLedgerEntry: jest.fn(),
}));

import {
  buildWritablePatch,
  bulkFileExceedsLimit,
  bulkFingerprint,
  canPerformBulkAction,
  decideDuplicateBatch,
  mappingIssues,
  parseBulkCsv,
  staleFields,
  suggestMapping,
  summarizeOutcomes,
  templateCsv,
  unmappedHeaders,
} from "@/features/bulkOperations/utils/bulkOperation.engine.util";
import {
  compliancePaymentBulkPermissions,
  paymentFieldTemplate,
} from "@/features/tripCompliance/paymentBulk/compliancePaymentField.adapter";

const template = paymentFieldTemplate(["utr", "transactionDate"]);

describe("bulk operation engine", () => {
  it("recognises export headers and leaves unused columns unmapped", () => {
    const sheet = parseBulkCsv("# compliance-payment-field-update 1\nTrip ID,AMOUNT,UTR\nTRP-1,9000,HDFC123456\n");
    const mapping = suggestMapping(sheet.headers, template.fields);
    expect(mapping.tripId).toBe("Trip ID");
    expect(mapping.utr).toBe("UTR");
    expect(mapping.transactionDate).toBeNull();
    expect(unmappedHeaders(sheet.headers, mapping)).toEqual(["AMOUNT"]);
    expect(mappingIssues(template, mapping).map((issue) => issue.field)).toEqual(["transactionDate"]);
  });

  it("versions the downloadable template and gives an example row", () => {
    const csv = templateCsv(template);
    expect(csv.startsWith("# compliance-payment-field-update 1")).toBe(true);
    expect(csv).toContain("TRP-1001");
    expect(csv).toContain("HDFC123456");
  });

  it("does not let a repeated upload or a live execution write again", () => {
    expect(decideDuplicateBatch(null)).toBe("create");
    expect(decideDuplicateBatch("completed")).toBe("replay");
    expect(decideDuplicateBatch("partial")).toBe("review_existing");
    expect(decideDuplicateBatch("failed")).toBe("review_existing");
    expect(decideDuplicateBatch("executing")).toBe("in_progress");
    expect(decideDuplicateBatch("confirmed")).toBe("in_progress");
    expect(bulkFingerprint(["a", "b"])).toBe(bulkFingerprint(["a", "b"]));
    expect(bulkFingerprint(["a", "b"])).not.toBe(bulkFingerprint(["a", "c"]));
  });

  it("keeps amount and mode out of the write and detects a stale UTR", () => {
    const patch = buildWritablePatch(
      ["utr", "amount", "mode"],
      ["amount", "mode"],
      { utr: "OLD123456", amount: "100", mode: "UPI" },
      { utr: "NEW123456", amount: "1", mode: "CASH" },
    );
    expect(patch).toEqual({ utr: "NEW123456" });
    expect(staleFields({ utr: "OLD123456" }, { utr: "OTHER1234" }, ["utr"])).toEqual(["utr"]);
  });

  it("rejects a file over 1 MB before any payment is touched", () => {
    expect(bulkFileExceedsLimit(1024 * 1024)).toBe(false);
    expect(bulkFileExceedsLimit(1024 * 1024 + 1)).toBe(true);
  });

  it("separates review from execute and records a partial failure", () => {
    const view = new Set(["trip_compliance.finance.view"]);
    expect(canPerformBulkAction("review", compliancePaymentBulkPermissions, view)).toBe(true);
    expect(canPerformBulkAction("execute", compliancePaymentBulkPermissions, view)).toBe(false);
    expect(canPerformBulkAction("correct", compliancePaymentBulkPermissions, view)).toBe(false);
    expect(summarizeOutcomes(["applied", "failed", "stale"])).toBe("partial");
    expect(summarizeOutcomes(["applied", "already_applied"])).toBe("completed");
    expect(summarizeOutcomes(["failed"])).toBe("failed");
  });
});
