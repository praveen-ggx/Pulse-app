import { clampSplitSize } from "@/lib/layout/adjustableSplit.util";

describe("clampSplitSize", () => {
  it("keeps the pane inside min, max, and leftover room", () => {
    expect(clampSplitSize(200, 280, 720, 1000, 320)).toBe(280);
    expect(clampSplitSize(900, 280, 720, 1000, 320)).toBe(680);
    expect(clampSplitSize(400, 280, 720, 1000, 320)).toBe(400);
  });
});
