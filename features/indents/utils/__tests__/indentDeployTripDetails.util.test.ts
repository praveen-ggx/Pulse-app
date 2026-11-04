import {
  indentWeightKgToTonsInput,
  isDeployTripDetailsReady,
} from "@/features/indents/utils/indentDeployTripDetails.util";
import { computeClientPrice } from "@/features/clients/utils/saleRateSnapshot.util";

describe("isDeployTripDetailsReady", () => {
  it("is ready with a valid date even when weight/type/product are empty", () => {
    expect(isDeployTripDetailsReady("2026-08-25", "", "", "")).toBe(true);
  });

  it("is not ready with an invalid date", () => {
    expect(isDeployTripDetailsReady("25-08-2026", "16", "Taurus", "Steel")).toBe(
      false,
    );
  });
});

describe("indentWeightKgToTonsInput", () => {
  it("keeps kilogram precision instead of rounding to 2 decimal MT", () => {
    expect(indentWeightKgToTonsInput(29877)).toBe("29.877");
  });

  it("feeds the exact tons into per-MT client price", () => {
    const tons = Number(indentWeightKgToTonsInput(29877));
    expect(
      computeClientPrice({ basis: "per_mt", unitRate: 2520, tons }),
    ).toBe(75290.04);
  });
});
