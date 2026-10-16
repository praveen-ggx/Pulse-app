/**
 * Indian DL length regression: 15-char (most states) AND 16-char (e.g. AP) must
 * both be typeable AND pass the Continue gate.
 *
 * Bug this locks down: the keypad accepted 16 chars but a separate DL_FORMAT
 * regex demanded exactly 7 trailing digits, so Continue stayed disabled with no
 * visible error (the error only renders on press, and a disabled button can't
 * be pressed).
 */
import {
  applyIndianDlKeystroke,
  getIndianDlNormalizedLength,
  isIndianDrivingLicenseComplete,
  INDIAN_DL_MAX_LENGTH,
  INDIAN_DL_MIN_LENGTH,
} from "@/lib/indianDrivingLicenseInput.util";

/** Mirrors DL_FORMAT / DL_FORMAT_REGEX used by the three driver-entry screens. */
const DL_FORMAT = /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7,8}$/;
const norm = (s: string) => s.trim().toUpperCase().replace(/[\s-]/g, "");

const AP_16 = "AP00219960000365"; // the number reported from the field
const TN_15 = "TN0120200001234";

describe("Indian DL — typing layer", () => {
  it("keeps all 16 chars of an AP licence", () => {
    const typed = applyIndianDlKeystroke(AP_16);
    expect(getIndianDlNormalizedLength(typed)).toBe(16);
    expect(norm(typed)).toBe(AP_16);
  });

  it("keeps all 15 chars of a TN licence", () => {
    const typed = applyIndianDlKeystroke(TN_15);
    expect(getIndianDlNormalizedLength(typed)).toBe(15);
    expect(norm(typed)).toBe(TN_15);
  });

  it("caps at 16 so a stray keypress cannot corrupt the number", () => {
    expect(
      getIndianDlNormalizedLength(applyIndianDlKeystroke(AP_16 + "9")),
    ).toBe(INDIAN_DL_MAX_LENGTH);
  });

  it("treats 15 as already complete", () => {
    expect(isIndianDrivingLicenseComplete(TN_15)).toBe(true);
    expect(INDIAN_DL_MIN_LENGTH).toBe(15);
  });
});

describe("Indian DL — Continue gate (DL_FORMAT)", () => {
  it.each([
    ["AP 16-char, as typed", "AP00 219960000365", true],
    ["AP 16-char, unspaced", AP_16, true],
    ["TN 15-char, as typed", "TN01 20200001234", true],
    ["TN 15-char, unspaced", TN_15, true],
    ["15-char AP", "AP00 21996000036", true],
    ["14 chars (too short)", "AP00 2199600003", false],
    ["17 chars (too long)", "AP00 2199600003651", false],
    ["digit in state block", "A100 219960000365", false],
    ["letters in serial", "AP00 21996000036X", false],
  ])("%s -> %s", (_label, input, expected) => {
    expect(DL_FORMAT.test(norm(input))).toBe(expected);
  });

  it("accepts every licence the keypad lets you finish typing", () => {
    for (const raw of [AP_16, TN_15, "AP0021996000036"]) {
      const typed = applyIndianDlKeystroke(raw);
      expect(isIndianDrivingLicenseComplete(typed)).toBe(true);
      // The two layers must agree — this is exactly what broke before.
      expect(DL_FORMAT.test(norm(typed))).toBe(true);
    }
  });
});
