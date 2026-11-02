import { enrichPlaceSelectionSync } from "../placeCityState.util";

describe("enrichPlaceSelectionSync — operational locality", () => {
  it("prefers sub-city locality over administrative city (Jeedimetla/Hyderabad)", () => {
    const result = enrichPlaceSelectionSync({
      displayName: "Jeedimetla, Hyderabad, Telangana, India",
      lat: 17.5096, lon: 78.4786,
      city: "Hyderabad", state: "Telangana",
      locality: "Jeedimetla", district: "Medchal-Malkajgiri",
    });
    expect(result.city).toBe("Jeedimetla");
    expect(result.label).toBe("Jeedimetla, Telangana");
  });

  it("prefers sub-city locality (Whitefield/Bengaluru)", () => {
    const result = enrichPlaceSelectionSync({
      displayName: "Whitefield, Bengaluru, Karnataka, India",
      lat: 12.9698, lon: 77.7500,
      city: "Bengaluru", state: "Karnataka",
      locality: "Whitefield", district: "Bengaluru Urban",
    });
    expect(result.city).toBe("Whitefield");
    expect(result.label).toBe("Whitefield, Karnataka");
  });

  it("prefers sub-city locality (Tambaram/Chennai)", () => {
    const result = enrichPlaceSelectionSync({
      displayName: "Tambaram, Chennai, Tamil Nadu, India",
      lat: 12.9249, lon: 80.1000,
      city: "Chennai", state: "Tamil Nadu",
      locality: "Tambaram", district: "Chengalpattu",
    });
    expect(result.city).toBe("Tambaram");
    expect(result.label).toBe("Tambaram, Tamil Nadu");
  });

  it("returns city when no distinct locality (Gurgaon, city=district)", () => {
    const result = enrichPlaceSelectionSync({
      displayName: "Gurgaon, Haryana, India",
      lat: 28.4595, lon: 77.0266,
      city: "Gurgaon", state: "Haryana",
      locality: null, district: "Gurgaon",
    });
    expect(result.city).toBe("Gurgaon");
    expect(result.label).toBe("Gurgaon, Haryana");
  });

  it("returns city when locality equals city (Pune)", () => {
    const result = enrichPlaceSelectionSync({
      displayName: "Pune, Maharashtra, India",
      lat: 18.5204, lon: 73.8567,
      city: "Pune", state: "Maharashtra",
      locality: "Pune", district: "Pune",
    });
    expect(result.city).toBe("Pune");
    expect(result.label).toBe("Pune, Maharashtra");
  });

  it("returns city when no locality (Lucknow, city=district)", () => {
    const result = enrichPlaceSelectionSync({
      displayName: "Lucknow, Uttar Pradesh, India",
      lat: 26.8467, lon: 80.9462,
      city: "Lucknow", state: "Uttar Pradesh",
      locality: null, district: "Lucknow",
    });
    expect(result.city).toBe("Lucknow");
    expect(result.label).toBe("Lucknow, Uttar Pradesh");
  });

  it("handles missing state — anchor falls back to city", () => {
    const result = enrichPlaceSelectionSync({
      displayName: "Jeedimetla, Hyderabad",
      lat: 17.5096, lon: 78.4786,
      city: "Hyderabad", state: null,
      locality: "Jeedimetla", district: "Medchal-Malkajgiri",
    });
    expect(result.city).toBe("Jeedimetla");
    expect(result.label).toBe("Jeedimetla, Hyderabad");
  });

  it("parses from displayName when no provider fields", () => {
    const result = enrichPlaceSelectionSync({
      displayName: "Pallavaram, Tamil Nadu",
      lat: 12.9675, lon: 80.1491,
    });
    expect(result.city).toBe("Pallavaram");
    expect(result.label).toBe("Pallavaram, Tamil Nadu");
  });

  it("prefers locality when city equals district (Pallavaram/Chengalpattu)", () => {
    const result = enrichPlaceSelectionSync({
      displayName: "Pallavaram, Chengalpattu, Tamil Nadu",
      lat: 12.9675, lon: 80.1491,
      city: "Chengalpattu", state: "Tamil Nadu",
      locality: "Pallavaram", district: "Chengalpattu",
    });
    expect(result.city).toBe("Pallavaram");
    expect(result.label).toBe("Pallavaram, Tamil Nadu");
  });

  it("handles manual text entry with no structured data", () => {
    const result = enrichPlaceSelectionSync({
      displayName: "Custom Location",
      lat: 0, lon: 0,
    });
    expect(result.city).toBe("Custom Location");
    expect(result.label).toBe("Custom Location");
  });
});
