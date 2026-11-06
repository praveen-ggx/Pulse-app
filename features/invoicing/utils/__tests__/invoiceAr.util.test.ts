import { applyArFilter, applyArSheetFilters, applyNoteDeltas, buildArBook, sortArSheet } from "../invoiceAr.util";

const NOW = new Date("2026-11-03T00:00:00");

function trip(overrides: Partial<Parameters<typeof buildArBook>[0][number]> = {}) {
  return {
    id: "t1",
    internalId: "t1",
    lr: "AI1025",
    route: "Puducherry → Thrissur",
    date: "2026-08-01",
    sales: 10000,
    invoicedFlag: false,
    physicalPod: false,
    digitalPod: false,
    ...overrides,
  };
}

describe("buildArBook", () => {
  it("splits sales, invoiced, received, and pending", () => {
    const book = buildArBook(
      [
        trip({ id: "open", internalId: "open", sales: 20000, invoicedFlag: true, date: "2026-10-01" }),
        trip({ id: "paid", internalId: "paid", sales: 5000, invoicedFlag: true, date: "2026-09-01" }),
        trip({ id: "open-sale", internalId: "open-sale", sales: 8000, date: "2026-07-01" }),
      ],
      [
        {
          invoiceNumber: "INV-1",
          invoiceDate: "2026-10-01",
          dueDate: "2026-10-15",
          status: "sent",
          totalAmount: 20000,
          tripIds: ["open"],
        },
        {
          invoiceNumber: "INV-2",
          invoiceDate: "2026-09-01",
          dueDate: "2026-09-15",
          status: "paid",
          totalAmount: 5000,
          tripIds: ["paid"],
        },
      ],
      NOW,
    );
    expect(book.sales).toBe(33000);
    expect(book.invoiced).toBe(25000);
    expect(book.received).toBe(5000);
    expect(book.pending).toBe(20000);
    expect(book.uninvoiced).toBe(8000);
    expect(book.openAging.b0).toBe(20000);
    expect(book.uninvoicedAging.b90).toBe(8000);
    expect(book.uninvoicedPod.pending).toEqual({ count: 1, amount: 8000 });
  });

  it("shares a partial receipt across every trip on the invoice", () => {
    const book = buildArBook(
      [
        trip({ id: "a", internalId: "a", sales: 6000, invoicedFlag: true }),
        trip({ id: "b", internalId: "b", sales: 4000, invoicedFlag: true }),
      ],
      [
        {
          invoiceNumber: "INV-1",
          invoiceDate: "2026-10-01",
          dueDate: "2026-10-15",
          status: "sent",
          totalAmount: 10000,
          amountReceived: 5000,
          tripIds: ["a", "b"],
        },
      ],
      NOW,
    );
    const byId = Object.fromEntries(book.lines.map((line) => [line.id, line.received]));
    expect(byId).toEqual({ a: 3000, b: 2000 });
    expect(book.received).toBe(5000);
    expect(book.pending).toBe(5000);
  });

  it("expects the bank credit after the client TDS percent", () => {
    const book = buildArBook(
      [trip({ id: "a", internalId: "a", sales: 10000, invoicedFlag: true })],
      [
        {
          invoiceNumber: "INV-1",
          invoiceDate: "2026-10-01",
          dueDate: "2026-10-15",
          status: "sent",
          totalAmount: 10000,
          tripIds: ["a"],
        },
      ],
      NOW,
      2,
    );
    expect(book.lines[0]?.expectedTds).toBe(200);
    expect(book.lines[0]?.expectedBank).toBe(9800);
  });

  it("cross-filters aging and POD together", () => {
    const book = buildArBook(
      [
        trip({ id: "a", internalId: "a", physicalPod: true, date: "2026-06-01" }),
        trip({ id: "b", internalId: "b", digitalPod: true, date: "2026-10-20" }),
      ],
      [],
      NOW,
    );
    const rows = applyArFilter(book.lines, {
      kpi: "uninvoiced",
      bucket: "b90",
      pod: "received",
      agingScope: "uninvoiced",
    });
    expect(rows.map((row) => row.id)).toEqual(["a"]);
  });

  it("filters and sorts the trip columns like a sheet", () => {
    const book = buildArBook(
      [
        trip({ id: "a", internalId: "a", lr: "100", route: "North", sales: 2000 }),
        trip({ id: "b", internalId: "b", lr: "200", route: "South", sales: 9000 }),
      ],
      [],
      NOW,
    );
    const filtered = applyArSheetFilters(book.lines, { route: ["North"] });
    expect(filtered.map((row) => row.id)).toEqual(["a"]);
    const sorted = sortArSheet(book.lines, { column: "sales", direction: "desc" });
    expect(sorted.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("reconciles pending to issued invoice outstanding, not trip sales", () => {
    const book = buildArBook(
      [
        trip({ id: "unpaid", internalId: "unpaid", sales: 3000, invoicedFlag: true }),
        trip({ id: "partial", internalId: "partial", sales: 6000, invoicedFlag: true }),
        trip({ id: "settled", internalId: "settled", sales: 2500, invoicedFlag: true }),
        trip({ id: "open-trip", internalId: "open-trip", sales: 7000 }),
        trip({ id: "draft-trip", internalId: "draft-trip", sales: 900, invoicedFlag: true }),
        trip({ id: "cancelled-trip", internalId: "cancelled-trip", sales: 1500, invoicedFlag: true }),
      ],
      [
        { invoiceNumber: "UNPAID", invoiceDate: "2026-11-01", dueDate: "2026-11-15", status: "sent", totalAmount: 3000, amountReceived: 0, tripIds: ["unpaid"] },
        { invoiceNumber: "PARTIAL", invoiceDate: "2026-11-01", dueDate: "2026-11-15", status: "sent", totalAmount: 7080, amountReceived: 1020.41, tripIds: ["partial"] },
        { invoiceNumber: "SETTLED", invoiceDate: "2026-11-01", dueDate: "2026-11-15", status: "sent", totalAmount: 2500, amountReceived: 2500, tripIds: ["settled"] },
        { invoiceNumber: "DRAFT", invoiceDate: "2026-11-01", dueDate: null, status: "draft", totalAmount: 900, tripIds: ["draft-trip"] },
        { invoiceNumber: "CANCELLED", invoiceDate: "2026-11-01", dueDate: null, status: "cancelled", totalAmount: 1500, tripIds: ["cancelled-trip"] },
        { invoiceNumber: "MANUAL", invoiceDate: "2026-11-02", dueDate: "2026-11-20", status: "sent", totalAmount: 1180, amountReceived: 180, tripIds: [] },
      ],
      NOW,
    );
    const expected =
      3000 +
      (7080 - 1020.41) +
      0 +
      (1180 - 180);
    expect(book.pending).toBeCloseTo(expected, 2);
    expect(book.uninvoiced).toBe(7000 + 900 + 1500);
    expect(book.lines.find((line) => line.lr === "MANUAL")?.pending).toBe(1000);
    expect(book.lines.some((line) => line.lr === "DRAFT" || line.lr === "CANCELLED")).toBe(false);
  });

  it("reduces outstanding when a credit note is not already inside the invoice", () => {
    const book = buildArBook(
      [trip({ id: "a", internalId: "a", sales: 6000, invoicedFlag: true })],
      [
        {
          invoiceNumber: "GST",
          invoiceDate: "2026-11-01",
          dueDate: "2026-11-15",
          status: "sent",
          totalAmount: 7080,
          amountReceived: 0,
          tripIds: ["a"],
        },
      ],
      NOW,
    );
    const credited = applyNoteDeltas(book, new Map([["a", -1180]]));
    expect(credited.pending).toBe(5900);
  });

  it("restores outstanding when a receipt is reversed", () => {
    const invoice = {
      invoiceNumber: "REV",
      invoiceDate: "2026-11-01",
      dueDate: "2026-11-15",
      status: "sent",
      totalAmount: 5310,
      tripIds: ["fuel"],
    };
    const paid = buildArBook(
      [trip({ id: "fuel", internalId: "fuel", sales: 4000, invoicedFlag: true })],
      [{ ...invoice, amountReceived: 102.04 }],
      NOW,
    );
    const reversed = buildArBook(
      [trip({ id: "fuel", internalId: "fuel", sales: 4000, invoicedFlag: true })],
      [{ ...invoice, amountReceived: 0 }],
      NOW,
    );
    expect(paid.pending).toBeCloseTo(5310 - 102.04, 2);
    expect(reversed.pending).toBe(5310);
  });
});
