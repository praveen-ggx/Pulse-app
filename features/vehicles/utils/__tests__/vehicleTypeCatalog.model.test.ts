import {
  capacityForPassingTon,
  formatVehicleTypeSelection,
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

  it("flags tons outside the vehicle range", () => {
    expect(tonsOutsideVehicleRange("LCV Open 8 Feet", "2")).toEqual({ min: 0.75, max: 1 });
    expect(tonsOutsideVehicleRange("LCV Open 8 Feet", "1")).toBeNull();
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

  it("replaces capacity only when outside the picked passing ton", () => {
    expect(capacityForPassingTon("7-10 Ton", "0.3")).toBe("10");
    expect(capacityForPassingTon("7-10 Ton", "")).toBe("10");
    expect(capacityForPassingTon("7-10 Ton", "8")).toBeNull();
    expect(capacityForPassingTon("7-10 Ton", "9 TON")).toBeNull();
    expect(capacityForPassingTon(null, "0.3")).toBeNull();
  });
});
