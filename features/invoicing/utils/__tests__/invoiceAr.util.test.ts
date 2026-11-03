import { applyArFilter, applyArSheetFilters, buildArBook, sortArSheet } from "../invoiceAr.util";

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
});
