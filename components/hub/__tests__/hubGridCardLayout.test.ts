import {
  HUB_GRID_MIN_WIDTH,
  hubGridColumnCount,
  hubGridItemStyle,
} from "@/components/hub/hubGridCardLayout";

describe("hubGridColumnCount", () => {
  it("stacks below the desktop hub breakpoint", () => {
    expect(hubGridColumnCount(HUB_GRID_MIN_WIDTH - 1)).toBe(1);
    expect(hubGridColumnCount(820)).toBe(1);
  });

  it("uses 3 columns at the desktop entry width instead of crushing 4", () => {
    expect(hubGridColumnCount(HUB_GRID_MIN_WIDTH)).toBe(3);
    expect(hubGridColumnCount(1180)).toBe(3);
  });

  it("reaches 4 columns only when each card keeps its min width", () => {
    expect(hubGridColumnCount(1280)).toBe(4);
    expect(hubGridColumnCount(1920)).toBe(4);
  });

  it("caps Load Center at 3", () => {
    expect(hubGridColumnCount(1920, 3)).toBe(3);
    expect(hubGridColumnCount(HUB_GRID_MIN_WIDTH, 3)).toBe(3);
  });
});

describe("hubGridItemStyle", () => {
  it("emits equal flex basis for the column count", () => {
    expect(hubGridItemStyle(3).flexBasis).toBe("33.3333%");
    expect(hubGridItemStyle(4).width).toBe("25%");
  });
});
