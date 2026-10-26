import { readFileSync } from "fs";
import { join } from "path";

describe("ThemedAlertModal dual actions", () => {
  it("keeps Edit/Done as wrap-or-stack buttons", () => {
    const src = readFileSync(join(__dirname, "../ThemedAlertModal.tsx"), "utf8");
    expect(src).toContain("useWindowDimensions");
    expect(src).toContain("actionsRow");
    expect(src).toContain("actionsStack");
    expect(src).toContain("actionFlex");
    expect(src).toContain("secondaryText");
  });
});
