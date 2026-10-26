import { EMPTY_CHARGE_LINES } from "@/features/debit-control/utils/debitControlPod.model";
import {
  podDebitIdentified,
  podDebitIdentifiedFromPayload,
} from "@/features/debit-control/utils/podExceptionDebit.util";

describe("podExceptionDebit.util", () => {
  it("treats a clean POD as no debit", () => {
    expect(podDebitIdentified(EMPTY_CHARGE_LINES, EMPTY_CHARGE_LINES)).toBe(false);
    expect(
      podDebitIdentifiedFromPayload({
        no_debit: true,
        client: EMPTY_CHARGE_LINES,
        vendor: EMPTY_CHARGE_LINES,
      }),
    ).toBe(false);
  });

  it("flags debit when an exception amount exists", () => {
    expect(
      podDebitIdentified({ ...EMPTY_CHARGE_LINES, damage: 500 }, EMPTY_CHARGE_LINES),
    ).toBe(true);
    expect(
      podDebitIdentifiedFromPayload({
        client: { ...EMPTY_CHARGE_LINES, loading: 200 },
        vendor: EMPTY_CHARGE_LINES,
      }),
    ).toBe(true);
  });
});
