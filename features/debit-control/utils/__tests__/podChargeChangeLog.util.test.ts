import { EMPTY_CHARGE_LINES } from "@/features/debit-control/utils/debitControlPod.model";
import {
  describePodChargeChange,
  podChargeChangeTitle,
} from "@/features/debit-control/utils/podChargeChangeLog.util";

describe("describePodChargeChange", () => {
  it("treats the first save as saved", () => {
    expect(
      describePodChargeChange({
        previous: null,
        next: { client: { ...EMPTY_CHARGE_LINES, delay: 200 }, vendor: EMPTY_CHARGE_LINES },
      }),
    ).toMatchObject({
      action: "saved",
      changed: true,
    });
  });

  it("logs a removal when exception charges are cleared", () => {
    expect(
      describePodChargeChange({
        previous: {
          client: { ...EMPTY_CHARGE_LINES, delay: 200 },
          vendor: EMPTY_CHARGE_LINES,
        },
        next: { client: EMPTY_CHARGE_LINES, vendor: EMPTY_CHARGE_LINES, noDebit: true },
      }),
    ).toMatchObject({
      action: "removed",
      changed: true,
    });
    expect(podChargeChangeTitle("removed")).toBe("removed POD charges");
  });

  it("logs an update when amounts change", () => {
    expect(
      describePodChargeChange({
        previous: {
          client: { ...EMPTY_CHARGE_LINES, delay: 200 },
          vendor: EMPTY_CHARGE_LINES,
        },
        next: { client: { ...EMPTY_CHARGE_LINES, delay: 350 }, vendor: EMPTY_CHARGE_LINES },
      }),
    ).toMatchObject({
      action: "updated",
      changed: true,
    });
  });

  it("skips a no-op save", () => {
    expect(
      describePodChargeChange({
        previous: {
          client: { ...EMPTY_CHARGE_LINES, loading: 40 },
          vendor: { ...EMPTY_CHARGE_LINES, loading: 40 },
        },
        next: {
          client: { ...EMPTY_CHARGE_LINES, loading: 40 },
          vendor: { ...EMPTY_CHARGE_LINES, loading: 40 },
        },
      }),
    ).toMatchObject({ changed: false });
  });
});
