import {
  COMPLIANCE_DECLINE_REASON_SECTIONS,
  complianceDeclineSectionsForScope,
  composeComplianceDeclineReason,
  groupDeclinedReasonLines,
  mergeDeclinedDocumentReasons,
  parseComplianceDeclineReason,
} from "@/features/tripCompliance/utils/complianceDeclineReason.util";

describe("decline reason prefill", () => {
  it("parses a composed reason back into presets and note", () => {
    const text = composeComplianceDeclineReason(["E-way bill expired", "Blurry / unreadable"], "LR shows TN12");
    expect(parseComplianceDeclineReason(text)).toEqual({
      selected: ["Blurry / unreadable", "E-way bill expired"],
      note: "LR shows TN12",
    });
  });

  it("treats free text with no presets as the note", () => {
    expect(parseComplianceDeclineReason("wrong truck")).toEqual({ selected: [], note: "wrong truck" });
    expect(parseComplianceDeclineReason(null)).toEqual({ selected: [], note: "" });
  });

  it("merges declined documents across tabs", () => {
    expect(
      mergeDeclinedDocumentReasons([
        { label: "Invoice", reason: "Blurry / unreadable" },
        { label: "Vehicle RC", reason: "Vehicle document expired (RC / Insurance / FC); Note: expired in Aug" },
        { label: "Driver Licence", reason: "Blurry / unreadable" },
      ]),
    ).toEqual({
      selected: ["Blurry / unreadable", "Vehicle document expired (RC / Insurance / FC)"],
      note: "Vehicle RC: expired in Aug",
    });
  });

  it("groups documents that share a reason", () => {
    expect(
      groupDeclinedReasonLines([
        { label: "LR", reason: "Driver licence missing" },
        { label: "E-way Bill", reason: "Driver licence missing" },
        { label: "Invoice", reason: "Driver licence missing" },
      ]),
    ).toEqual(["Driver licence missing — LR, E-way Bill, Invoice"]);
  });

  it("shows only the reasons that fit each tab", () => {
    const options = (scope: "trip" | "vehicle" | "driver") =>
      complianceDeclineSectionsForScope(scope).flatMap((section) => section.options);
    const all = new Set(COMPLIANCE_DECLINE_REASON_SECTIONS.flatMap((section) => section.options));
    for (const scope of ["trip", "vehicle", "driver"] as const) {
      expect(options(scope).every((option) => all.has(option))).toBe(true);
    }
    expect(options("driver")).toContain("Driver licence missing");
    expect(options("driver")).not.toContain("LR missing");
    expect(options("trip")).not.toContain("Driver licence missing");
    expect(options("vehicle")).not.toContain("Driver licence expired");
  });
});
