import {
  appendIndianVehicleChar,
  applyIndianVehicleKeystroke,
  getIndianVehicleAllowedNext,
  getIndianVehicleFormatHint,
  getIndianVehicleKeyboardKind,
  getIndianVehicleSegmentGuide,
  getIndianVehicleTextInputKeyboardType,
  isIndianVehiclePlateValid,
} from "@/lib/indianVehicleInput.util";
import {
  formatIndianVehicleNumber,
  formatIndianVehicleNumberInput,
  normalizeVehicleNumberForMatch,
} from "@/lib/format";
import { validateIndianVehicleNumber } from "@/lib/validation";

/** Simulate the custom keypad: one character at a time through the filter. */
function typeOut(plate: string): string {
  let value = "";
  for (const ch of normalizeVehicleNumberForMatch(plate)) {
    value = appendIndianVehicleChar(value, ch);
  }
  return value;
}

/** Two-letter series: AA 00 AA 0000 */
const VALID_TWO_LETTER = [
  "TN17AS2202",
  "TN01CM2026",
  "MH12DE1433",
  "KA05MG1234",
  "HR26DK8337",
  "UP32AB1234",
  "TN18DC2522",
] as const;

/** One-letter series: AA 00 A 0000 (e.g. TN 18 D 2522) */
const VALID_ONE_LETTER = ["TN18D2522", "TN17A2202", "TN01C2026", "TN05C9811"] as const;

describe("Indian vehicle plate entry", () => {
  it.each([...VALID_TWO_LETTER, ...VALID_ONE_LETTER])(
    "types %s without dropping characters",
    (plate) => {
      const typed = typeOut(plate);
      expect(normalizeVehicleNumberForMatch(typed)).toBe(plate);
      expect(isIndianVehiclePlateValid(typed)).toBe(true);
    },
  );

  it.each([...VALID_TWO_LETTER, ...VALID_ONE_LETTER])(
    "accepts %s pasted in one go",
    (plate) => {
      const pasted = applyIndianVehicleKeystroke(plate);
      expect(normalizeVehicleNumberForMatch(pasted)).toBe(plate);
      expect(isIndianVehiclePlateValid(pasted)).toBe(true);
    },
  );

  it.each([...VALID_TWO_LETTER, ...VALID_ONE_LETTER])(
    "validateIndianVehicleNumber accepts %s",
    (plate) => {
      expect(validateIndianVehicleNumber(plate)).toBeNull();
      expect(
        validateIndianVehicleNumber(formatIndianVehicleNumber(plate)),
      ).toBeNull();
    },
  );

  it("formats TN18D2522 as a 1-letter series, not TN18D2522 split as D2 522", () => {
    expect(formatIndianVehicleNumberInput("TN18D2522")).toBe("TN18D2522");
    expect(formatIndianVehicleNumber("TN18D2522")).toBe("TN18D2522");
    expect(formatIndianVehicleNumberInput("TN18DC2522")).toBe("TN18DC2522");
  });

  it("keeps the system keyboard on letters after the first series character so digits still type", () => {
    expect(getIndianVehicleTextInputKeyboardType("TN 18 D")).toBe("default");
    expect(getIndianVehicleAllowedNext("TN 18 D")).toEqual({
      letters: true,
      digits: true,
    });
    expect(appendIndianVehicleChar("TN 18 D", "2")).toBe("TN18D2");
  });

  it.each([
    "",
    "TN",
    "TN17",
    "TN17AS",
    "TN17AS220",
    "TN1AS2202",
    "ABCD",
    "12345",
    "22BH1234AB",
    "TN091234",
  ])("treats incomplete or non-standard %s as invalid", (partial) => {
    expect(isIndianVehiclePlateValid(partial)).toBe(false);
    if (partial.length === 0) {
      expect(validateIndianVehicleNumber(partial)).toBe("Required");
    } else {
      expect(validateIndianVehicleNumber(partial)).toMatch(/valid vehicle number/i);
    }
  });

  it("formats input without spaces", () => {
    expect(formatIndianVehicleNumberInput("tn17as2202")).toBe("TN17AS2202");
    expect(formatIndianVehicleNumberInput("TN17")).toBe("TN17");
    expect(formatIndianVehicleNumberInput("TN17AS")).toBe("TN17AS");
    expect(formatIndianVehicleNumberInput("TN18D")).toBe("TN18D");
  });

  it("formats stored plates for display without spaces and leaves non-Indian values alone", () => {
    expect(formatIndianVehicleNumber("TN17AS2202")).toBe("TN17AS2202");
    expect(formatIndianVehicleNumber("tn 17 as 2202")).toBe("TN17AS2202");
    expect(formatIndianVehicleNumber("TRK-SEED-001")).toBe("TRK-SEED-001");
  });

  it("marks every segment done for a complete 2-letter plate", () => {
    const guide = getIndianVehicleSegmentGuide("TN 17 AS 2202");
    expect(guide.map((s) => s.label)).toEqual(["AA", "00", "A(A)", "0000"]);
    expect(guide.every((s) => s.done)).toBe(true);
  });

  it("marks series done for a complete 1-letter plate", () => {
    const guide = getIndianVehicleSegmentGuide("TN 18 D 2522");
    expect(guide.every((s) => s.done)).toBe(true);
  });

  it("switches keypad by segment", () => {
    expect(getIndianVehicleKeyboardKind("")).toBe("letters");
    expect(getIndianVehicleKeyboardKind("TN")).toBe("numbers");
    expect(getIndianVehicleKeyboardKind("TN17")).toBe("letters");
    expect(getIndianVehicleKeyboardKind("TN17AS")).toBe("numbers");
    expect(getIndianVehicleAllowedNext("TN")).toEqual({
      letters: false,
      digits: true,
    });
    expect(getIndianVehicleAllowedNext("TN17")).toEqual({
      letters: true,
      digits: false,
    });
    expect(getIndianVehicleAllowedNext("TN17AS")).toEqual({
      letters: false,
      digits: true,
    });
  });

  it("rejects a letter during the district segment", () => {
    expect(appendIndianVehicleChar("TN 1", "A")).toBe("TN1");
    expect(appendIndianVehicleChar("TN 17", "A")).toBe("TN17A");
  });

  it("hints match the flexible series mask", () => {
    expect(getIndianVehicleFormatHint("")).toMatch(/state code/i);
    expect(getIndianVehicleFormatHint("TN")).toMatch(/district/i);
    expect(getIndianVehicleFormatHint("TN17")).toMatch(/series/i);
    expect(getIndianVehicleFormatHint("TN17AS")).toMatch(/4 digits/i);
  });
});
