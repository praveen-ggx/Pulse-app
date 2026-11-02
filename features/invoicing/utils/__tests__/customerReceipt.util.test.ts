import {
  allocateCustomerReceipt,
  receiptAppliedFromSnapshot,
  planTripReceive,
  previewTripReceipt,
  receiveStatus,
  splitReceiptAmount,
  spreadReceiptAcrossTrips,
  type ReceiptTarget,
} from "@/features/invoicing/utils/customerReceipt.util";

const targets: ReceiptTarget[] = [
  { id: "a", number: "GOG/1", balance: 1000, dueDate: "2026-01-01", bucket: "b90" },
  { id: "b", number: "GOG/2", balance: 400, dueDate: "2026-08-01", bucket: "b0" },
];

describe("customer receipt allocation", () => {
  it("spreads cash and TDS across open invoices, oldest first", () => {
    const result = allocateCustomerReceipt({
      targets,
      cash: 900,
      tds: 200,
      mode: "invoice",
      invoiceIds: [],
      bucket: null,
    });
    expect(result.lines.map((line) => [line.number, line.applied, line.cleared])).toEqual([
      ["GOG/1", 1000, true],
      ["GOG/2", 100, false],
    ]);
    expect(result.unapplied).toBe(0);
  });

  it("keeps an aging capture inside the selected bucket", () => {
    const result = allocateCustomerReceipt({
      targets,
      cash: 5000,
      tds: 0,
      mode: "aging",
      invoiceIds: [],
      bucket: "b0",
    });
    expect(result.lines.map((line) => line.number)).toEqual(["GOG/2"]);
    expect(result.lines[0]?.cleared).toBe(true);
    expect(result.unapplied).toBe(4600);
  });
});

describe("trip share of a grouped invoice receipt", () => {
  it("splits a partial receipt across the trips by sales weight", () => {
    const result = spreadReceiptAcrossTrips({
      applied: 500,
      cash: 400,
      tds: 100,
      trips: [
        { id: "t1", sales: 600 },
        { id: "t2", sales: 400 },
      ],
    });
    expect(result.slices).toEqual([
      { tripId: "t1", applied: 300, cash: 240, tds: 60 },
      { tripId: "t2", applied: 200, cash: 160, tds: 40 },
    ]);
    expect(result.overflow).toEqual({ cash: 0, tds: 0 });
  });

  it("keeps tax above trip freight off the trip", () => {
    const result = spreadReceiptAcrossTrips({
      applied: 1180,
      cash: 1180,
      tds: 0,
      trips: [{ id: "t1", sales: 1000 }],
    });
    expect(result.slices).toEqual([{ tripId: "t1", applied: 1000, cash: 1000, tds: 0 }]);
    expect(result.overflow).toEqual({ cash: 180, tds: 0 });
  });

  it("shows TDS and the bank receivable for an edited trip share", () => {
    expect(splitReceiptAmount(1000, 800, 200)).toEqual({ cash: 800, tds: 200 });
    const rows = previewTripReceipt({
      invoiceId: "inv",
      applied: 1000,
      cash: 800,
      tds: 200,
      trips: [
        { id: "t1", sales: 600, label: "LR 1" },
        { id: "t2", sales: 400, label: "LR 2" },
      ],
      edits: { "inv:t2": "100" },
    });
    expect(rows).toEqual([
      { tripId: "t1", label: "LR 1", applied: 600, cash: 480, tds: 120, edited: false },
      { tripId: "t2", label: "LR 2", applied: 100, cash: 80, tds: 20, edited: true },
    ]);
  });

  it("calculates TDS before the amount to receive and marks a short or excess trip", () => {
    const rows = planTripReceive({
      invoiceId: "inv",
      applied: 1000,
      percent: 2,
      trips: [
        { id: "t1", sales: 600, label: "LR 1" },
        { id: "t2", sales: 400, label: "LR 2" },
      ],
      edits: { "inv:t2": "200" },
    });
    const full = rows[0];
    const short = rows[1];
    expect(full?.status).toBe("paid");
    expect(full?.tds).toBeGreaterThan(0);
    expect(full?.receive).toBeLessThan(full?.due ?? 0);
    expect(short?.status).toBe("partially_paid");
    expect(receiveStatus(400, 500)).toBe("excess");
    expect(rows.find((row) => row.tripId === "t2")?.tds).toBeGreaterThan(0);
  });

  it("reads the amount already applied on an invoice", () => {
    expect(receiptAppliedFromSnapshot({ receipt_applied: 250.5, supply_type: "intra" })).toBe(250.5);
    expect(receiptAppliedFromSnapshot(null)).toBe(0);
  });
});
