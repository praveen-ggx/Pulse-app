import {
  resolveTripDriverDisplayName,
  suggestedNameForPhoneLookup,
} from "@/features/trips/utils/driverDisplayName.util";

describe("resolveTripDriverDisplayName", () => {
  it("keeps the locally saved trip name over the app profile", () => {
    expect(
      resolveTripDriverDisplayName({
        localDisplayName: "ZZ",
        appName: "Suresh Kumar",
        phoneFallback: "9900860472",
      }),
    ).toBe("ZZ");
  });

  it("suggests the app name when no local label is saved", () => {
    expect(
      resolveTripDriverDisplayName({
        localDisplayName: "  ",
        appName: "Suresh Kumar",
        phoneFallback: "9900860472",
      }),
    ).toBe("Suresh Kumar");
  });
});

describe("suggestedNameForPhoneLookup", () => {
  it("fills the app name when the field is still unlocked", () => {
    expect(
      suggestedNameForPhoneLookup({
        currentName: "",
        suggestedAppName: "Ravi",
        nameOwnedLocally: false,
      }),
    ).toBe("Ravi");
  });

  it("does not overwrite a locally edited name for the same phone", () => {
    expect(
      suggestedNameForPhoneLookup({
        currentName: "ZZ",
        suggestedAppName: "Ravi",
        nameOwnedLocally: true,
      }),
    ).toBe("ZZ");
  });

  it("replaces a leftover name when the number changes and lookup finds someone", () => {
    expect(
      suggestedNameForPhoneLookup({
        currentName: "Old leftover",
        suggestedAppName: "Ravi",
        nameOwnedLocally: false,
      }),
    ).toBe("Ravi");
  });
});

describe("trip label vs profile", () => {
  it("never writes the trip label back onto the profile from these helpers", () => {
    const tripLabel = resolveTripDriverDisplayName({
      localDisplayName: "On this trip",
      appName: "Fleet Profile",
    });
    expect(tripLabel).toBe("On this trip");
    expect(
      suggestedNameForPhoneLookup({
        currentName: "On this trip",
        suggestedAppName: "Fleet Profile",
        nameOwnedLocally: true,
      }),
    ).toBe("On this trip");
  });
});
