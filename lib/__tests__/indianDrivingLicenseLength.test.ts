/**
 * Indian DL entry: licences don't share one layout (most are 15 chars like
 * TN01 20200001234, AP issues 16, older / other states mix letters, digits and
 * "/"), so typing and the Continue gate accept any 6–20 letters / digits / "/".
 *
 * Also locks down the earlier bug: the typing layer and the Continue gate must
 * agree, or Continue stays disabled on a number the field let you type.
 */
import {
  appendIndianDlChar,
  applyIndianDlKeystroke,
  getIndianDlNormalizedLength,
  isIndianDrivingLicenseComplete,
  isIndianDrivingLicenseFormatValid,
  sanitizeIndianDlTextInput,
  INDIAN_DL_MAX_LENGTH,
  INDIAN_DL_MIN_LENGTH,
} from "@/lib/indianDrivingLicenseInput.util";

const norm = (s: string) => s.trim().toUpperCase().replace(/[\s-]/g, "");

const AP_16 = "AP00219960000365"; // the number reported from the field
const TN_15 = "TN0120200001234";
const MIXED = "MH12AB2010001234"; // letters after the state code
const OLD_SLASH = "DL/123/2009"; // older slash-separated layout

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

  it.each([MIXED, OLD_SLASH, "1234AB5678"])("keeps letters and digits anywhere: %s", (raw) => {
    expect(norm(applyIndianDlKeystroke(raw))).toBe(norm(raw));
  });

  it("types letters after the state code one key at a time", () => {
    let v = "";
    for (const ch of MIXED) v = appendIndianDlChar(v, ch);
    expect(norm(v)).toBe(MIXED);
  });

  it("caps at 20 so a stray keypress cannot run on forever", () => {
    expect(INDIAN_DL_MAX_LENGTH).toBe(20);
    expect(
      getIndianDlNormalizedLength(applyIndianDlKeystroke("A".repeat(25))),
    ).toBe(INDIAN_DL_MAX_LENGTH);
  });

  it("treats 6+ chars as complete", () => {
    expect(INDIAN_DL_MIN_LENGTH).toBe(6);
    expect(isIndianDrivingLicenseComplete(TN_15)).toBe(true);
    expect(isIndianDrivingLicenseComplete("AB123")).toBe(false);
  });

  it("free-text sanitizer uppercases and keeps letters, digits, space, - and /", () => {
    expect(sanitizeIndianDlTextInput("mh12 ab-2010/1234")).toBe("MH12 AB-2010/1234");
    expect(sanitizeIndianDlTextInput("TN01#2020@0001234")).toBe("TN0120200001234");
  });
});

describe("Indian DL — Continue gate", () => {
  it.each([
    ["AP 16-char, as typed", "AP00 219960000365", true],
    ["AP 16-char, unspaced", AP_16, true],
    ["TN 15-char, as typed", "TN01 20200001234", true],
    ["TN 15-char, unspaced", TN_15, true],
    ["14 chars", "AP00 2199600003", true],
    ["17 chars", "AP00 2199600003651", true],
    ["digit in state block", "A100 219960000365", true],
    ["letters in serial", "AP00 21996000036X", true],
    ["letters after state code", MIXED, true],
    ["older slash layout", OLD_SLASH, true],
    ["hyphenated", "MH-12-2010-0001234", true],
    ["5 chars (too short)", "AB123", false],
    ["21 chars (too long)", "A".repeat(21), false],
    ["symbols", "TN01#2020", false],
  ])("%s -> %s", (_label, input, expected) => {
    expect(isIndianDrivingLicenseFormatValid(input)).toBe(expected);
  });

  it("accepts every licence the keypad lets you finish typing", () => {
    for (const raw of [AP_16, TN_15, MIXED, OLD_SLASH, "AP0021996000036"]) {
      const typed = applyIndianDlKeystroke(raw);
      expect(isIndianDrivingLicenseComplete(typed)).toBe(true);
      // The two layers must agree — this is exactly what broke before.
      expect(isIndianDrivingLicenseFormatValid(typed)).toBe(true);
    }
  });
});
