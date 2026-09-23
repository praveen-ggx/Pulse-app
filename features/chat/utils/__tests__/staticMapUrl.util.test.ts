import { isUsableMapCoordinate } from "../staticMapUrl.util";

describe("isUsableMapCoordinate", () => {
  it("rejects null-island and out-of-range points", () => {
    expect(isUsableMapCoordinate(0, 0)).toBe(false);
    expect(isUsableMapCoordinate(91, 10)).toBe(false);
    expect(isUsableMapCoordinate(12.9, 77.6)).toBe(true);
  });
});
