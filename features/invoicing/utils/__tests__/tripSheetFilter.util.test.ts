import type { InvoicingTripView } from "@/features/invoicing/services/invoicing.service";
import {
  applyTripSheetFilters,
  tripSheetChoices,
  tripSheetFilterCount,
} from "@/features/invoicing/utils/tripSheetFilter.util";

function trip(patch: Partial<InvoicingTripView> & Pick<InvoicingTripView, "id">): InvoicingTripView {
  return {
    internal_id: patch.id,
    organization_id: null,
    client_id: null,
    client: "Megha",
    supplier_name: "Srun",
    driver_name: "Ravi",
    route: "Gowdavalli → Siddipet",
    pickup: null,
    delivery: null,
    date: "2026-04-01",
    amount: 50000,
    status: "pending",
    details: "",
    vehicle_number: null,
    load_type: null,
    lr_number: "AH2692",
    checks: { poMatch: false, idConfirmed: false, podReceived: false },
    physicalPodReceived: false,
    digitalPodPresent: false,
    tripStatus: "delivered",
    invoiced: false,
    issuedInvoiceNumber: null,
    inDraft: false,
    draftInvoiceNumber: null,
    ...patch,
  };
}

const label = (row: InvoicingTripView) => (row.invoiced ? "Invoiced" : "Eligible");

describe("trip sheet filters", () => {
  const rows = [
    trip({ id: "BKG-1", route: "Hyderabad → Warangal", amount: 1000, invoiced: true }),
    trip({ id: "BKG-2", supplier_name: "Omega", route: "Hyderabad → Warangal", amount: 2000 }),
    trip({ id: "BKG-3", route: "Gowdavalli → Siddipet", amount: 1000, tripStatus: "in_transit" }),
  ];

  it("keeps rows whose ticked values match every column", () => {
    const filtered = applyTripSheetFilters(
      rows,
      { route: ["Hyderabad → Warangal"], freight: ["₹1,000"] },
      label,
    );
    expect(filtered.map((row) => row.id)).toEqual(["BKG-1"]);
  });

  it("lists a column from the other filters, with blanks last", () => {
    const choices = tripSheetChoices(rows, "pod", { route: ["Hyderabad → Warangal"] }, label);
    expect(choices.map((choice) => choice.value)).toEqual(["Soft missing · Hard pending"]);
    expect(tripSheetChoices(rows, "pod", {}, label).some((choice) => choice.value === "(Blank)")).toBe(true);
    expect(tripSheetFilterCount({ route: ["Hyderabad → Warangal"] })).toBe(1);
  });
});
