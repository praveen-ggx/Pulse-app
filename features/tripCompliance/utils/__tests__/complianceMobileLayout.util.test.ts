import {
  COMPLIANCE_MOBILE_MAX_WIDTH,
  isComplianceMobileViewport,
} from "../complianceMobileLayout.util";

describe("isComplianceMobileViewport", () => {
  it("treats unset and desktop widths as the table layout", () => {
    expect(isComplianceMobileViewport(0)).toBe(false);
    expect(isComplianceMobileViewport(COMPLIANCE_MOBILE_MAX_WIDTH)).toBe(false);
    expect(isComplianceMobileViewport(1280)).toBe(false);
  });

  it("uses the hub-style compact layout on phones", () => {
    expect(isComplianceMobileViewport(390)).toBe(true);
    expect(isComplianceMobileViewport(767)).toBe(true);
  });
});
