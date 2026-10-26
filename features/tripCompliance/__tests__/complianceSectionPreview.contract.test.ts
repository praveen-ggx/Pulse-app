import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(
  join(process.cwd(), "features/tripCompliance/components/ComplianceSection.tsx"),
  "utf8",
);

describe("ComplianceSection preview lifecycle", () => {
  it("holds the preview URL across Linking.openURL and releases it later", () => {
    const preview = source.slice(source.indexOf("const handlePreview"));
    expect(preview).toContain("Linking.openURL(url)");
    expect(preview.indexOf("heldPreviewUrl.current = url")).toBeLessThan(preview.indexOf("Linking.openURL(url)"));
    expect(preview).toContain("setTimeout(() => releaseStoragePreviewUrl(stale), 60_000)");
    expect(source).toContain("setTimeout(() => releaseStoragePreviewUrl(url), 60_000)");
  });
});
