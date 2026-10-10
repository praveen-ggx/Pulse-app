import {
  COMPLIANCE_REJECT_REASON_OPTIONS,
  complianceRejectQueueDestination,
  complianceRejectQueuePathLabel,
  composeComplianceRejectReason,
} from "@/features/tripCompliance/utils/complianceRejectReason.util";

describe("composeComplianceRejectReason", () => {
  it("returns a single preset label", () => {
    expect(composeComplianceRejectReason(["memo_missing"], "")).toBe("Memo missing");
    expect(composeComplianceRejectReason(["truck_no_mismatch"], "ignored")).toBe(
      "Truck No mismatch",
    );
  });

  it("joins multiple presets in stable order", () => {
    expect(
      composeComplianceRejectReason(["vendor_rate_mismatch", "memo_missing"], ""),
    ).toBe("Memo missing; Vendor rate mismatch");
  });

  it("uses Other free text when Other is selected", () => {
    expect(composeComplianceRejectReason(["other"], "  Custom note  ")).toBe("Custom note");
    expect(composeComplianceRejectReason(["other"], "   ")).toBeNull();
    expect(
      composeComplianceRejectReason(["memo_missing", "other"], "Blurry scan"),
    ).toBe("Memo missing; Blurry scan");
  });

  it("returns null when nothing is selected", () => {
    expect(composeComplianceRejectReason([], "x")).toBeNull();
  });

  it("exposes the six product options", () => {
    expect(COMPLIANCE_REJECT_REASON_OPTIONS.map((o) => o.id)).toEqual([
      "memo_missing",
      "truck_no_mismatch",
      "vendor_mismatch",
      "client_date_mismatch",
      "vendor_rate_mismatch",
      "other",
    ]);
  });
});

describe("complianceRejectQueueDestination", () => {
  it("sends document presets to Pending Docs", () => {
    expect(complianceRejectQueueDestination("Truck No mismatch")).toBe("pending_for_docs");
    expect(complianceRejectQueueDestination("Client date mismatch")).toBe("pending_for_docs");
  });

  it("sends memo / vendor presets to Compliance Pending", () => {
    expect(complianceRejectQueueDestination("Memo missing")).toBe("compliance_pending");
    expect(complianceRejectQueueDestination("Vendor mismatch")).toBe("compliance_pending");
    expect(complianceRejectQueueDestination("Vendor rate mismatch")).toBe("compliance_pending");
  });

  it("prefers Pending Docs when a docs preset is mixed with a finance preset", () => {
    expect(complianceRejectQueueDestination("Memo missing; Truck No mismatch")).toBe("pending_for_docs");
  });

  it("routes free-text document notes to Pending Docs", () => {
    expect(complianceRejectQueueDestination("document pending")).toBe("pending_for_docs");
    expect(complianceRejectQueueDestination("Blurry LR scan")).toBe("pending_for_docs");
  });

  it("defaults other commercial notes to Compliance Pending", () => {
    expect(complianceRejectQueueDestination("Rate not agreed")).toBe("compliance_pending");
    expect(complianceRejectQueueDestination(null)).toBe("compliance_pending");
  });
});

describe("complianceRejectQueuePathLabel", () => {
  it("names the Declined by finance queue for toasts and navigation", () => {
    expect(complianceRejectQueuePathLabel("Truck No mismatch")).toBe(
      "Pending Docs → Declined by finance",
    );
    expect(complianceRejectQueuePathLabel("Memo missing")).toBe(
      "Ready to Verify → Declined by finance",
    );
  });
});
