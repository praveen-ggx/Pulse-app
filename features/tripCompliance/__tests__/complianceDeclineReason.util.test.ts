import {
  COMPLIANCE_DECLINE_REASON_SECTIONS,
  composeComplianceDeclineReason,
} from "@/features/tripCompliance/utils/complianceDeclineReason.util";

describe("composeComplianceDeclineReason", () => {
  it("returns null when nothing is chosen", () => {
    expect(composeComplianceDeclineReason([], "  ")).toBeNull();
  });

  it("keeps list order and appends the note", () => {
    expect(
      composeComplianceDeclineReason(["E-way bill expired", "Blurry / unreadable"], " LR shows TN12L1137 "),
    ).toBe("Blurry / unreadable; E-way bill expired; Note: LR shows TN12L1137");
  });

  it("uses a note alone as the reason", () => {
    expect(composeComplianceDeclineReason([], "LR blurry")).toBe("LR blurry");
  });

  it("has no duplicate options", () => {
    const all = COMPLIANCE_DECLINE_REASON_SECTIONS.flatMap((section) => section.options);
    expect(new Set(all).size).toBe(all.length);
  });

  it("fits the 500-character limit for a busy pick (two per group plus a note)", () => {
    // Picking everything can exceed 500; the dialog then blocks Decline with a hint.
    const busy = COMPLIANCE_DECLINE_REASON_SECTIONS.flatMap((section) => section.options.slice(0, 2));
    expect((composeComplianceDeclineReason(busy, "LR number differs from invoice") ?? "").length).toBeLessThanOrEqual(500);
  });
});
