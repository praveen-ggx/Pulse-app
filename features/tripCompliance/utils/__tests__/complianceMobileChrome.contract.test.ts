import { readFileSync } from "fs";
import { join } from "path";

const chrome = readFileSync(
  join(process.cwd(), "features/tripCompliance/components/ComplianceMobileChrome.tsx"),
  "utf8",
);
const screen = readFileSync(join(process.cwd(), "app/compliance/index.tsx"), "utf8");

describe("Compliance mobile chrome", () => {
  it("reuses hub mobile header, tabs, and search", () => {
    expect(chrome).toContain("HubMobileScreenHeader");
    expect(chrome).toContain("HubMobileUnderlineTab");
    expect(chrome).toContain("HubMobileSearchRow");
  });

  it("is wired on the queue below the 768px breakpoint only", () => {
    expect(screen).toContain("isComplianceMobileViewport");
    expect(screen).toContain("<ComplianceMobileChrome");
    expect(screen).toContain("isMobile ? (");
  });
});
