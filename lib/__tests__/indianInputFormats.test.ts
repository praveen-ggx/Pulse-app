/**
 * Format picker: "standard" stays strict by default; the extra layouts are only
 * typeable after the user picks them, but a complete value in any supported
 * layout passes validation (so saved records and Continue gates agree).
 */
import {
  applyIndianDlKeystroke,
  detectIndianDlFormat,
  getIndianDlKeyboardKind,
  isIndianDrivingLicenseComplete,
  isIndianDrivingLicenseFormatValid,
} from "@/lib/indianDrivingLicenseInput.util";
import {
  appendIndianVehicleChar,
  applyIndianVehicleKeystroke,
  detectIndianVehicleFormat,
  getIndianVehicleAllowedNext,
  isIndianVehiclePlateValid,
} from "@/lib/indianVehicleInput.util";
import { normalizeVehicleNumberForMatch } from "@/lib/format";
import { validateIndianVehicleNumber } from "@/lib/validation";

const norm = (s: string) => s.replace(/\s/g, "");

describe("Licence format: letter after RTO (TN29Z19940001713)", () => {
  const DL = "TN29Z19940001713";

  it("standard mask drops the letter, so it cannot be typed by default", () => {
    expect(norm(applyIndianDlKeystroke(DL))).not.toBe(DL);
  });

  it("is typed in full once the format is picked", () => {
    expect(norm(applyIndianDlKeystroke(DL, "rtoLetter"))).toBe(DL);
    expect(getIndianDlKeyboardKind(4, "rtoLetter")).toBe("letters");
    expect(getIndianDlKeyboardKind(5, "rtoLetter")).toBe("numbers");
  });

  it("passes validation and is detected", () => {
    expect(isIndianDrivingLicenseFormatValid(DL)).toBe(true);
    expect(isIndianDrivingLicenseComplete("TN29 Z19940001713")).toBe(true);
    expect(detectIndianDlFormat(DL)).toBe("rtoLetter");
    expect(detectIndianDlFormat("TN0120200001234")).toBe("standard");
  });

  it("rejects partial and junk values", () => {
    expect(isIndianDrivingLicenseComplete("TN29Z1994000171")).toBe(false);
    expect(isIndianDrivingLicenseFormatValid("ABCDEF123456")).toBe(false);
    expect(isIndianDrivingLicenseFormatValid("TN29ZZ1994000171")).toBe(false);
  });

  it("accepts Telangana smart-card and old slash licences", () => {
    expect(isIndianDrivingLicenseFormatValid("DLFAP12810371208")).toBe(true);
    expect(isIndianDrivingLicenseFormatValid("1043/HW/1997OD")).toBe(true);
    expect(isIndianDrivingLicenseFormatValid(" 1043/HW/1997OD ")).toBe(true);
    expect(detectIndianDlFormat("DLFAP12810371208")).toBeNull();
    expect(isIndianDrivingLicenseFormatValid("1043/HW")).toBe(false);
    expect(isIndianDrivingLicenseFormatValid("DLFAP1234")).toBe(false);
  });
});

describe("Plate format: no series letter (KA566088)", () => {
  const PLATE = "KA566088";

  it("standard mask cannot type it by default", () => {
    expect(normalizeVehicleNumberForMatch(applyIndianVehicleKeystroke(PLATE))).toBe("KA56");
  });

  it("is typed in full once the format is picked", () => {
    let v = "";
    for (const ch of PLATE) v = appendIndianVehicleChar(v, ch, "noSeries");
    expect(normalizeVehicleNumberForMatch(v)).toBe(PLATE);
    expect(getIndianVehicleAllowedNext("KA56", "noSeries")).toEqual({
      letters: false,
      digits: true,
    });
    expect(getIndianVehicleAllowedNext(PLATE, "noSeries")).toEqual({
      letters: false,
      digits: false,
    });
  });

  it("passes validation and is detected", () => {
    expect(isIndianVehiclePlateValid(PLATE)).toBe(true);
    expect(validateIndianVehicleNumber("KA 56 6088")).toBeNull();
    expect(detectIndianVehicleFormat(PLATE)).toBe("noSeries");
    expect(detectIndianVehicleFormat("TN17AS2202")).toBe("standard");
  });

  it("still rejects junk and partial plates", () => {
    for (const bad of ["ABCDEF", "123456", "KA56608", "KA5660881", "22BH1234AB"]) {
      expect(isIndianVehiclePlateValid(bad)).toBe(false);
    }
  });
});
