import { groupCustomerReceipts } from "@/features/invoicing/utils/customerReceiptList.util";

describe("customer receipt list", () => {
  it("groups bank and TDS lines for the same invoice into one receipt", () => {
    const receipts = groupCustomerReceipts([
      {
        id: "1",
        tripId: "t1",
        description: "Customer receipt UTR1 · INV/2026-27/00001 · trip LR 1 [[QMETA:{}]]",
        amount: 100000,
        date: "2026-11-03",
        createdAt: "2026-11-03T10:01:02.000Z",
        category: "customer_receipt",
        reference: "UTR1",
      },
      {
        id: "2",
        tripId: "t1",
        description: "TDS deducted by customer UTR1 · INV/2026-27/00001 · trip LR 1",
        amount: 2000,
        date: "2026-11-03",
        createdAt: "2026-11-03T10:01:03.000Z",
        category: "tds_receivable",
        reference: "UTR1",
      },
      {
        id: "3",
        tripId: "t2",
        description: "Customer receipt UTR1 · INV/2026-27/00001 · trip LR 2",
        amount: 80000,
        date: "2026-11-03",
        createdAt: "2026-11-03T10:01:04.000Z",
        category: "customer_receipt",
        reference: "UTR1",
      },
    ]);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      reference: "UTR1",
      invoiceNumber: "INV/2026-27/00001",
      bank: 180000,
      tds: 2000,
      total: 182000,
    });
    expect(receipts[0]?.trips).toEqual([
      { tripId: "t1", label: "LR 1", bank: 100000, tds: 2000 },
      { tripId: "t2", label: "LR 2", bank: 80000, tds: 0 },
    ]);
  });

  it("ignores ledger rows that are not customer receipts", () => {
    expect(
      groupCustomerReceipts([
        {
          id: "x",
          tripId: null,
          description: "Supplier payment",
          amount: 50,
          date: "2026-11-03",
          createdAt: null,
          category: "supplier_payment",
          reference: null,
        },
      ]),
    ).toEqual([]);
  });
});
