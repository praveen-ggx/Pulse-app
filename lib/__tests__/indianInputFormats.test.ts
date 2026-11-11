/**
 * Format picker: "standard" stays strict by default; the extra layouts are only
 * typeable after the user picks them, but a complete value in any supported
 * layout passes validation (so saved records and Continue gates agree).
 */
import {
  appendIndianDlChar,
  applyIndianDlKeystroke,
  applyIndianDlKeystrokeAutoFormat,
  deleteIndianDlLastChar,
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

  it("does not label a near-miss as the strict layouts", () => {
    // Not standard / RTO-letter; it may still be saved as "other" (as printed).
    expect(detectIndianDlFormat("TN29Z1994000171")).toBe("other");
    expect(detectIndianDlFormat("TN29ZZ1994000171")).toBe("other");
  });

  it("rejects junk that cannot be a licence", () => {
    for (const bad of ["ABCDEF", "123456", "ABCDEF1234", "TN01", "MH04//12345", "AB-12_34567"]) {
      expect(isIndianDrivingLicenseFormatValid(bad)).toBe(false);
    }
  });

  it("accepts Telangana smart-card and old slash licences", () => {
    expect(isIndianDrivingLicenseFormatValid("DLFAP12810371208")).toBe(true);
    expect(isIndianDrivingLicenseFormatValid("1043/HW/1997OD")).toBe(true);
    expect(isIndianDrivingLicenseFormatValid(" 1043/HW/1997OD ")).toBe(true);
    expect(detectIndianDlFormat("DLFAP12810371208")).toBe("other");
    expect(detectIndianDlFormat("1043/HW/1997OD")).toBe("other");
    expect(isIndianDrivingLicenseFormatValid("1043/HW")).toBe(false);
    expect(isIndianDrivingLicenseFormatValid("DLFAP1234")).toBe(false);
  });

  it("types old / smart cards under the Old / smart card option", () => {
    expect(applyIndianDlKeystroke("1043HW1997OD", "other")).toBe("1043/HW/1997OD");
    expect(applyIndianDlKeystroke("1043/hw/1997od", "other")).toBe("1043/HW/1997OD");
    expect(applyIndianDlKeystroke("DLFAP12810371208", "other")).toBe("DLFAP12810371208");
    let v = "";
    for (const ch of "1043HW1997OD") v = appendIndianDlChar(v, ch, "other");
    expect(v).toBe("1043/HW/1997OD");
    expect(deleteIndianDlLastChar("1043/HW/1997OD")).toBe("1043/HW/1997O");
    expect(applyIndianDlKeystroke("TN0120200001234", "standard")).toBe("TN01 20200001234");
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

describe("Licence: any state layout, typed exactly as printed", () => {
  it.each([
    ["Telangana card number only", "803391998"],
    ["Maharashtra old, slashes", "MH04/12345/2005"],
    ["Kerala old, slashes", "KL10/2011/0001234"],
    ["Delhi old", "P03042000123456"],
    ["Tamil Nadu old, slashes", "R/TN/22/001234/2009"],
    ["Telangana smart card", "DLFAP029126912005OD"],
  ])("%s (%s) is accepted and kept as typed", (_label, dl) => {
    expect(isIndianDrivingLicenseFormatValid(dl)).toBe(true);
    expect(applyIndianDlKeystroke(dl, "other")).toBe(dl);
  });

  it("switches layout instead of dropping characters", () => {
    expect(applyIndianDlKeystrokeAutoFormat("803391998", "standard")).toEqual({
      value: "803391998",
      format: "other",
    });
    expect(applyIndianDlKeystrokeAutoFormat("MH04/12345/2005", "standard")).toEqual({
      value: "MH04/12345/2005",
      format: "other",
    });
    expect(applyIndianDlKeystrokeAutoFormat("TN29Z19940001713", "standard")).toEqual({
      value: "TN29 Z19940001713",
      format: "rtoLetter",
    });
  });

  it("keeps the picked layout while the input fits it", () => {
    expect(applyIndianDlKeystrokeAutoFormat("TN01", "standard")).toEqual({
      value: "TN01",
      format: "standard",
    });
    expect(applyIndianDlKeystrokeAutoFormat("TN0120200001234", "standard")).toEqual({
      value: "TN01 20200001234",
      format: "standard",
    });
    // A stray 17th digit is capped, not a reason to switch layout.
    expect(applyIndianDlKeystrokeAutoFormat("AP002199600003651", "standard").format).toBe(
      "standard",
    );
  });

  it("deleting from an old slash licence keeps it unspaced", () => {
    expect(deleteIndianDlLastChar("MH04/12345/2005")).toBe("MH04/12345/200");
  });
});
