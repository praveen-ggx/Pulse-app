import {
  complianceCountLabel,
  complianceExportBlockedMessage,
  complianceIncompleteBannerText,
} from "@/features/tripCompliance/utils/complianceIncomplete.util";

describe("complianceIncomplete wording", () => {
  it("banner: loading and failed say how many of how many are loaded", () => {
    expect(complianceIncompleteBannerText({ loaded: 40, total: 312, failed: false })).toBe("Loading trips… 40 of 312");
    expect(complianceIncompleteBannerText({ loaded: 40, total: 312, failed: true })).toBe(
      "Showing 40 of 312 trips. Couldn't load the rest.",
    );
  });

  it("banner: a failed refresh with every trip loaded does not claim trips are missing", () => {
    expect(complianceIncompleteBannerText({ loaded: 312, total: 312, failed: true })).toBe(
      "Some trips couldn't be refreshed.",
    );
  });

  it("export message names the loaded and total counts", () => {
    expect(complianceExportBlockedMessage({ loaded: 40, total: 312, failed: true })).toBe(
      "Queue incomplete (40 of 312 trips loaded). Retry loading before exporting.",
    );
  });

  it("count label gets a + only while incomplete", () => {
    expect(complianceCountLabel(12, false)).toBe("12");
    expect(complianceCountLabel(12, true)).toBe("12+");
    expect(complianceCountLabel(0, true)).toBe("0+");
  });
});
