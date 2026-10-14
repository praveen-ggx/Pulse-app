import {
  includedChargeTotal,
  netChargeTotal,
  resolveIndentType,
  vendorCostAfterIbond,
  advanceDocumentCostAmount,
  chargeLinesFromBase,
  parseChargeInput,
  chargeLinesFromDraft,
  isTripOpenForValidation,
  selectableReceivedTripIds,
  readPodValidationPayload,
  displayedClientValue,
} from "@/features/debit-control/utils/podChargeTotals.util";
import { canMarkPodInward } from "@/features/debit-control/utils/podInwardForm.util";
import {
  EMPTY_CHARGE_LINES,
  IBOND_DEDUCTIBLE_COST,
  type DebitControlReceivedTrip,
} from "@/features/debit-control/utils/debitControlPod.model";

describe("pod charge totals", () => {
  it("sums included charges and leaves delay, damage, and missing out of the total", () => {
    const total = includedChargeTotal({
      ...EMPTY_CHARGE_LINES,
      cost: 1000,
      loading: 100,
      halting: 50,
      unloading: 25,
      extraPoint: 10,
      other: 5,
      specialApproval: 20,
      delay: 999,
      damage: 999,
      productMissing: 999,
    });
    expect(total).toBe(1210);
  });

  it("deducts delay, damage, and product missing from the total", () => {
    const total = netChargeTotal({
      ...EMPTY_CHARGE_LINES,
      cost: 10000,
      loading: 500,
      delay: 500,
      damage: 200,
      productMissing: 100,
      podDelaySubmission: 50,
      documentCost: 200,
    });
    expect(total).toBe(9450);
  });

  it("shows only the document cost recorded when the advance was processed", () => {
    expect(advanceDocumentCostAmount(150)).toBe(150);
    expect(advanceDocumentCostAmount(0)).toBe(0);
    expect(advanceDocumentCostAmount(null)).toBe(0);
  });

  it("rejects blank-looking garbage and accepts an empty field as zero", () => {
    expect(parseChargeInput("")).toBe(0);
    expect(parseChargeInput("  ")).toBe(0);
    expect(parseChargeInput("12.5")).toBe(12.5);
    expect(parseChargeInput("-1")).toBeNull();
    expect(parseChargeInput("12.345")).toBeNull();
    expect(parseChargeInput("abc")).toBeNull();
  });

  it("blocks confirm when any charge field is not a valid amount", () => {
    const draft = {
      cost: "100",
      loading: "",
      halting: "",
      unloading: "",
      extraPoint: "",
      other: "nope",
      specialApproval: "",
      delay: "",
      damage: "",
      productMissing: "",
      podDelaySubmission: "",
      documentCost: "",
      ibondDeductible: "",
    };
    const parsed = chargeLinesFromDraft(draft);
    expect(parsed.lines).toBeNull();
    if (parsed.lines === null) expect(parsed.invalidKeys).toEqual(["other"]);
  });

  it("maps a lane to Contract or Spot and a trip without a lane to Adhoc", () => {
    expect(resolveIndentType({ laneId: null, isSpotRate: false })).toBe("Adhoc");
    expect(resolveIndentType({ laneId: "lane-1", isSpotRate: false })).toBe("Contract");
    expect(resolveIndentType({ laneId: "lane-1", isSpotRate: true })).toBe("Spot");
  });

  it("keeps validated trips out of the selection", () => {
    const trips = [
      { id: "a", validatedAt: null },
      { id: "b", validatedAt: "2026-10-01T00:00:00Z" },
    ];
    expect(selectableReceivedTripIds(trips)).toEqual(["a"]);
    expect(isTripOpenForValidation(trips[1])).toBe(false);
  });

  it("shows the validated total once it is stored, otherwise the trip price", () => {
    const trip = {
      totalClientValue: 1500,
      clientPrice: 1000,
    } as DebitControlReceivedTrip;
    expect(displayedClientValue(trip)).toBe(1500);
    expect(displayedClientValue({ ...trip, totalClientValue: null })).toBe(1000);
  });

  it("deducts the IBond amount once through vendor POD delay submission", () => {
    expect(vendorCostAfterIbond(57000, true)).toBe(55500);
    expect(vendorCostAfterIbond(57000, true)).toBe(55500);
    expect(vendorCostAfterIbond(57000, false)).toBe(57000);
    const once = netChargeTotal({
      ...EMPTY_CHARGE_LINES,
      cost: 57000,
      podDelaySubmission: 200 + IBOND_DEDUCTIBLE_COST,
      ibondDeductible: 0,
    });
    const stored = readPodValidationPayload({
      client: chargeLinesFromBase(57000),
      vendor: {
        ...chargeLinesFromBase(57000),
        podDelaySubmission: IBOND_DEDUCTIBLE_COST,
        ibondDeductible: 0,
      },
    });
    expect(once).toBe(55300);
    expect(stored?.totalVendorValue).toBe(55500);
    expect(stored?.vendorCharges.podDelaySubmission).toBe(IBOND_DEDUCTIBLE_COST);
    expect(stored?.vendorCharges.ibondDeductible).toBe(0);
    expect(netChargeTotal(stored?.vendorCharges ?? EMPTY_CHARGE_LINES)).toBe(55500);
  });

  it("rebuilds totals from stored charge lines so the table matches the formula", () => {
    const read = readPodValidationPayload({
      remarks: "Checked",
      client_invoice_number: "INV-1",
      client: { ...chargeLinesFromBase(800), loading: 20, delay: 50 },
      vendor: { ...chargeLinesFromBase(600), damage: 10 },
    });
    expect(read?.totalClientValue).toBe(770);
    expect(read?.totalVendorValue).toBe(590);
    expect(read?.remarks).toBe("Checked");
    expect(read?.clientInvoiceNumber).toBe("INV-1");
  });
});

describe("pod inward form", () => {
  it("requires received date, courier name, and docket number", () => {
    expect(
      canMarkPodInward({
        receivedDate: "",
        courierName: "",
        docketNumber: "",
      }),
    ).toBe(false);
    expect(
      canMarkPodInward({
        receivedDate: "2026-10-05",
        courierName: "  DTDC ",
        docketNumber: "AWB1",
      }),
    ).toBe(true);
    expect(
      canMarkPodInward({
        receivedDate: "2026-02-31",
        courierName: "DTDC",
        docketNumber: "AWB1",
      }),
    ).toBe(false);
  });
});
