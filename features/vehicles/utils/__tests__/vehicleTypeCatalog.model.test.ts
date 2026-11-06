import {
  capacityForPassingTon,
  formatSelectedVehicleTypeLabel,
  formatVehicleTypeSelection,
  loadWeightAllowedRange,
  parseVehicleTypeSelection,
  passingTonForTons,
  tonSuggestionsForRange,
  tonsOutsideVehicleRange,
  vehicleTonRange,
} from "../vehicleTypeCatalog.model";

describe("vehicleTypeCatalog", () => {
  it("stores category + size only", () => {
    expect(formatVehicleTypeSelection({ group: "Open", type: "20 Feet" })).toBe("Open 20 Feet");
    expect(formatVehicleTypeSelection({ group: "LCV Open", type: "8 Feet" })).toBe("LCV Open 8 Feet");
  });

  it("parses LCV groups before Open/Container", () => {
    expect(parseVehicleTypeSelection("LCV Open 8 Feet")).toEqual({ group: "LCV Open", type: "8 Feet" });
    expect(parseVehicleTypeSelection("LCV Container 32 Feet SXL")).toEqual({
      group: "LCV Container",
      type: "32 Feet SXL",
    });
    expect(parseVehicleTypeSelection("Container 32 Feet MXL")).toEqual({
      group: "Container",
      type: "32 Feet MXL",
    });
  });

  it("reads the early dotted format and rejects legacy values", () => {
    expect(parseVehicleTypeSelection("Open · 20 Feet · 7-10 Ton")).toEqual({ group: "Open", type: "20 Feet" });
    expect(parseVehicleTypeSelection("Tata Ace")).toBeNull();
    expect(parseVehicleTypeSelection("Open 8 Feet")).toBeNull();
  });

  it("derives the full ton range of a vehicle", () => {
    expect(vehicleTonRange("Open 20 Feet")).toEqual({ min: 7, max: 15 });
    expect(vehicleTonRange("LCV Open 8 Feet")).toEqual({ min: 0.75, max: 1 });
    expect(vehicleTonRange("Tata Ace")).toBeNull();
  });

  it("uses the container capacities for 32FT SXL and 32FT MXL, and Open for 40FT", () => {
    expect(parseVehicleTypeSelection("Open 40 Feet")).toEqual({
      group: "Open",
      type: "40 Feet",
    });
    expect(parseVehicleTypeSelection("Container 40 Feet")).toEqual({
      group: "Container",
      type: "40 Feet",
    });
    expect(vehicleTonRange("Container 32 Feet SXL")).toEqual({ min: 7, max: 9 });
    expect(vehicleTonRange("LCV Container 32 Feet SXL")).toEqual({ min: 7, max: 9 });
    expect(vehicleTonRange("Container 32 Feet MXL")).toEqual({ min: 15, max: 18 });
    expect(vehicleTonRange("Open 40 Feet")).toEqual({ min: 20, max: 24 });
    // Single-band types: closed field shows catalog max (20-24 Ton → 24 MT), not a hardcoded 20.
    expect(formatSelectedVehicleTypeLabel("Open 40 Feet")).toBe("Open 40 Feet · 24 MT");
    expect(formatSelectedVehicleTypeLabel("Container 32 Feet SXL")).toBe(
      "Container 32 Feet SXL · 9 MT",
    );
    expect(formatSelectedVehicleTypeLabel("Container 32 Feet MXL")).toBe(
      "Container 32 Feet MXL · 18 MT",
    );
    // Multi-band types: no capacity suffix (user picks passing ton in the sheet).
    expect(formatSelectedVehicleTypeLabel("Open 20 Feet")).toBe("Open 20 Feet");
    expect(loadWeightAllowedRange("Open 40 Feet", "20-24 Ton")).toEqual({
      min: 1,
      max: 24,
    });
    expect(tonsOutsideVehicleRange("Open 40 Feet", "22", "20-24 Ton")).toBeNull();
    expect(tonsOutsideVehicleRange("Open 40 Feet", "24", "20-24 Ton")).toBeNull();
    expect(tonsOutsideVehicleRange("Open 40 Feet", "25", "20-24 Ton")).toEqual({
      min: 1,
      max: 24,
    });
  });

  it("allows load weight from 1 MT through capacity max (band min is not a floor)", () => {
    // Container 22 Feet · Upto 10 MT → 1…10 (7 MT must pass; 7.5 band min is not required)
    expect(loadWeightAllowedRange("Container 22 Feet", "7.5-10 Ton")).toEqual({
      min: 1,
      max: 10,
    });
    expect(tonsOutsideVehicleRange("Container 22 Feet", "7", "7.5-10 Ton")).toBeNull();
    expect(tonsOutsideVehicleRange("Container 22 Feet", "1", "7.5-10 Ton")).toBeNull();
    expect(tonsOutsideVehicleRange("Container 22 Feet", "10", "7.5-10 Ton")).toBeNull();
    expect(tonsOutsideVehicleRange("Container 22 Feet", "0.5", "7.5-10 Ton")).toEqual({
      min: 1,
      max: 10,
    });
    expect(tonsOutsideVehicleRange("Container 22 Feet", "10.5", "7.5-10 Ton")).toEqual({
      min: 1,
      max: 10,
    });

    // Decimal loads within 1…max
    expect(tonsOutsideVehicleRange("Container 22 Feet", "1.25", "7.5-10 Ton")).toBeNull();
    expect(tonsOutsideVehicleRange("Container 22 Feet", "7.5", "7.5-10 Ton")).toBeNull();
    expect(tonsOutsideVehicleRange("Container 22 Feet", "9.75", "7.5-10 Ton")).toBeNull();

    // Upto 15 MT band on the same size
    expect(loadWeightAllowedRange("Container 22 Feet", "11-15 Ton")).toEqual({
      min: 1,
      max: 15,
    });
    expect(tonsOutsideVehicleRange("Container 22 Feet", "12", "11-15 Ton")).toBeNull();
    expect(tonsOutsideVehicleRange("Container 22 Feet", "16", "11-15 Ton")).toEqual({
      min: 1,
      max: 15,
    });

    // No passing ton → ceiling is the vehicle's highest band (15 for Container 22 Feet)
    expect(loadWeightAllowedRange("Container 22 Feet")).toEqual({ min: 1, max: 15 });
    expect(tonsOutsideVehicleRange("Container 22 Feet", "14")).toBeNull();
    expect(tonsOutsideVehicleRange("Container 22 Feet", "16")).toEqual({ min: 1, max: 15 });

    // Open 20 Feet max 15; LCV Open 8 Feet max 1; free-text vehicles skip catalog check
    expect(tonsOutsideVehicleRange("Open 20 Feet", "7")).toBeNull();
    expect(tonsOutsideVehicleRange("LCV Open 8 Feet", "1")).toBeNull();
    expect(tonsOutsideVehicleRange("LCV Open 8 Feet", "2")).toEqual({ min: 1, max: 1 });
    expect(tonsOutsideVehicleRange("Tata Ace", "50")).toBeNull();
  });

  it("finds the passing ton that holds a load", () => {
    expect(passingTonForTons({ group: "Open", type: "12 Wheeler" }, "22")).toBe("21-23 Ton");
    expect(passingTonForTons({ group: "Open", type: "12 Wheeler" }, "")).toBeNull();
  });

  it("suggests tons inside a range", () => {
    expect(tonSuggestionsForRange({ min: 7.5, max: 10 })).toEqual(["7.5", "8", "9", "10"]);
    expect(tonSuggestionsForRange({ min: 0.75, max: 1 })).toEqual(["0.75", "1"]);
  });

  it("replaces capacity only when outside 1…max (keeps values below the catalog band min)", () => {
    expect(capacityForPassingTon("7.5-10 Ton", "7")).toBeNull();
    expect(capacityForPassingTon("7.5-10 Ton", "1")).toBeNull();
    expect(capacityForPassingTon("7.5-10 Ton", "0.3")).toBe("10");
    expect(capacityForPassingTon("7.5-10 Ton", "")).toBe("10");
    expect(capacityForPassingTon("7-10 Ton", "8")).toBeNull();
    expect(capacityForPassingTon("7-10 Ton", "9 TON")).toBeNull();
    expect(capacityForPassingTon("7.5-10 Ton", "11")).toBe("10");
    expect(capacityForPassingTon(null, "0.3")).toBeNull();
  });
});
