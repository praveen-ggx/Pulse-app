import {
  formatAdjustmentAddedAt,
  resolveAdjustmentAddedBy,
} from "@/features/trips/components/trip-detail/adjustment/tripAdjustmentAddedLog.util";

describe("tripAdjustmentAddedLog.util", () => {
  it("formats a timestamp for the added column", () => {
    expect(formatAdjustmentAddedAt("2026-10-25T10:50:00.000Z")).not.toBe("—");
    expect(formatAdjustmentAddedAt(null)).toBe("—");
  });

  it("resolves the adder name when the profile map has it", () => {
    expect(
      resolveAdjustmentAddedBy({ created_by: "u1" }, { u1: "Nihas" }),
    ).toBe("Nihas");
    expect(resolveAdjustmentAddedBy({ created_by: "u1" }, {})).toBe("Team member");
    expect(
      resolveAdjustmentAddedBy({ created_by: "u1", created_by_name: "Sneha" }, {}),
    ).toBe("Sneha");
    expect(
      resolveAdjustmentAddedBy({ created_by: null }, {}, { name: "Nihas" }),
    ).toBe("Nihas");
  });
});
