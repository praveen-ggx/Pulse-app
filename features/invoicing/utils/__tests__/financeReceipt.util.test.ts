import { allocateOldestFirst, receiptAllocationProblems } from "@/features/invoicing/utils/financeReceipt.util";

describe("allocateOldestFirst", () => {
  it("fills invoices in order and stops at each outstanding", () => {
    expect(
      allocateOldestFirst(1000, [
        { id: "a", outstanding: 400 },
        { id: "b", outstanding: 450.5 },
        { id: "c", outstanding: 900 },
      ]),
    ).toEqual([
      { id: "a", amount: 400 },
      { id: "b", amount: 450.5 },
      { id: "c", amount: 149.5 },
    ]);
  });
  it("leaves the rest unallocated when invoices run out", () => {
    expect(allocateOldestFirst(1000, [{ id: "a", outstanding: 300 }])).toEqual([{ id: "a", amount: 300 }]);
  });
  it("ignores settled invoices and non-positive amounts", () => {
    expect(allocateOldestFirst(0, [{ id: "a", outstanding: 300 }])).toEqual([]);
    expect(allocateOldestFirst(50, [{ id: "a", outstanding: 0 }, { id: "b", outstanding: 10 }])).toEqual([{ id: "b", amount: 10 }]);
  });
});

describe("receiptAllocationProblems", () => {
  const outstanding = { a: 400, b: 600 };
  it("accepts bank + TDS covering the applied amounts", () => {
    expect(receiptAllocationProblems({ bank: 900, tds: 100, allocations: [{ invoiceId: "a", amount: 400 }, { invoiceId: "b", amount: 600 }], outstanding })).toEqual([]);
  });
  it("flags more applied than the receipt", () => {
    expect(receiptAllocationProblems({ bank: 300, tds: 0, allocations: [{ invoiceId: "a", amount: 400 }], outstanding })).toContain(
      "More is applied than the receipt total (bank + TDS).",
    );
  });
  it("flags more than an invoice's outstanding", () => {
    expect(receiptAllocationProblems({ bank: 1000, tds: 0, allocations: [{ invoiceId: "a", amount: 400.01 }], outstanding })).toContain(
      "An applied amount is more than that invoice's outstanding balance.",
    );
  });
  it("needs a bank amount and a known invoice", () => {
    const problems = receiptAllocationProblems({ bank: 0, tds: -1, allocations: [{ invoiceId: "zz", amount: 1 }], outstanding });
    expect(problems).toEqual(
      expect.arrayContaining(["Enter the amount received in the bank.", "TDS must be zero or more.", "An invoice in this receipt is no longer open."]),
    );
  });
});
