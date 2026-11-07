import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { invoiceAmountMismatch } from "@/features/invoicing/services/invoicing.service";

describe("invoiceAmountMismatch", () => {
  it("accepts freight plus reconciled GST", () => {
    expect(
      invoiceAmountMismatch({
        tripAmounts: [1000, 500],
        subtotal: 1500,
        sgst: 135,
        cgst: 135,
        igst: 0,
        totalAmount: 1770,
      }),
    ).toBeNull();
  });

  it("accepts reverse charge, where the payable total is the taxable base", () => {
    expect(
      invoiceAmountMismatch({
        tripAmounts: [1000],
        subtotal: 1000,
        sgst: 90,
        cgst: 90,
        igst: 0,
        totalAmount: 1000,
      }),
    ).toBeNull();
  });

  it("rejects a subtotal that is not the trip freight", () => {
    expect(
      invoiceAmountMismatch({
        tripAmounts: [1000],
        additionalCharges: [{ amount: 100 }],
        subtotal: 1000,
        sgst: 0,
        cgst: 0,
        igst: 0,
        totalAmount: 1000,
      }),
    ).toMatch(/trip freight/);
  });

  it("keeps the issued-invoice amount check on the database", () => {
    const arithmetic = readFileSync(
      resolve(__dirname, "../../../../supabase/migrations/20271107124500_invoice_amount_integrity.sql"),
      "utf8",
    );
    const freight = readFileSync(
      resolve(__dirname, "../../../../supabase/migrations/20271107140000_invoice_subtotal_matches_trip_freight.sql"),
      "utf8",
    );
    expect(arithmetic).toMatch(/invoice total does not match its tax breakdown/);
    expect(freight).toMatch(/invoice subtotal does not match trip freight/);
    expect(freight).toMatch(/trip_finance_adjustments/);
    expect(freight).toMatch(/invoice_source, 'trip'\) = 'trip'/);
    const gstin = readFileSync(
      resolve(__dirname, "../../../../supabase/migrations/20271107153000_invoice_gstin_place_of_supply.sql"),
      "utf8",
    );
    expect(gstin).toMatch(/a tax invoice needs the organization GSTIN/);
    expect(gstin).toMatch(/intra-state invoice cannot carry IGST/);
    expect(gstin).toMatch(/inter-state invoice cannot carry CGST or SGST/);
    expect(gstin).toMatch(/invoice subtotal does not match trip freight/);
  });

  it("rejects a total that is neither the base nor the base plus tax", () => {
    expect(
      invoiceAmountMismatch({
        tripAmounts: [1000],
        subtotal: 1000,
        sgst: 90,
        cgst: 90,
        igst: 0,
        totalAmount: 50,
      }),
    ).toMatch(/does not reconcile/);
  });
});
