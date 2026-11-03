/**
 * Invoice Book capture writes one invoice payment through the RPC and never the
 * trip ledger (transactions) or the invoice row — including when the invoice
 * payment book is missing on the database (fails closed).
 */
const mockRpc = jest.fn();
const mockFrom = jest.fn();
jest.mock("@/lib/supabase", () => ({ supabase: () => ({ rpc: mockRpc, from: mockFrom }) }));
const rpc = mockRpc;
const from = mockFrom;
jest.mock("@/features/finance/services/finance.service", () => ({ createLedgerEntry: jest.fn() }));

import { readFileSync } from "fs";
import { join } from "path";
import { FINANCE_PAYMENTS_UNAVAILABLE, captureCustomerReceipt } from "@/features/invoicing/services/customerReceipt.service";
import { createLedgerEntry } from "@/features/finance/services/finance.service";

const line = (id: string, applied: number, cleared = true) => ({
  id,
  number: `INV/${id}`,
  balance: applied,
  dueDate: null,
  bucket: "current" as const,
  applied,
  remaining: 0,
  cleared,
});

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  (createLedgerEntry as jest.Mock).mockReset();
});

it("records bank + TDS as one receipt with per-invoice allocations", async () => {
  rpc.mockResolvedValue({ data: { payment_id: "p1", receipt_number: "RCT/2026-27/00001", amount: 1000, allocated: 1000, unallocated: 0 }, error: null });
  const result = await captureCustomerReceipt({
    orgId: "org",
    clientId: "client",
    clientName: "Client",
    cash: 900,
    tds: 100,
    reference: " UTR1 ",
    date: "2026-11-03",
    lines: [line("a", 400), line("b", 600)],
    idempotencyKey: "capture-key-1",
    paymentMode: "rtgs",
  });
  expect(result.error).toBeNull();
  expect(result.receiptNumber).toBe("RCT/2026-27/00001");
  expect(result.cleared).toBe(2);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("record_customer_receipt", expect.objectContaining({
    p_org_id: "org",
    p_client_id: "client",
    p_bank_amount: 900,
    p_tds_amount: 100,
    p_payment_mode: "rtgs",
    p_transaction_reference: "UTR1",
    p_idempotency_key: "capture-key-1",
    p_allocations: [{ invoice_id: "a", amount: 400 }, { invoice_id: "b", amount: 600 }],
  }));
  expect(from).not.toHaveBeenCalled();
  expect(createLedgerEntry).not.toHaveBeenCalled();
});

it("records a TDS-only receipt in TDS mode", async () => {
  rpc.mockResolvedValue({ data: { payment_id: "p2", amount: 50 }, error: null });
  await captureCustomerReceipt({
    orgId: "org", clientId: "client", clientName: "C", cash: 0, tds: 50, reference: "", date: "2026-11-03",
    lines: [line("a", 50)], idempotencyKey: "capture-key-2",
  });
  expect(rpc).toHaveBeenCalledWith("record_invoice_payment", expect.objectContaining({ p_amount: 50, p_payment_mode: "tds" }));
  expect(from).not.toHaveBeenCalled();
});

it("refuses a customer without a client record instead of posting to the trip ledger", async () => {
  const result = await captureCustomerReceipt({
    orgId: "org", clientId: "name:Walk-in", clientName: "Walk-in", cash: 100, tds: 0, reference: "", date: "",
    lines: [line("a", 100)], idempotencyKey: "capture-key-3",
  });
  expect(result.error?.message).toMatch(/not linked to a client record/);
  expect(rpc).not.toHaveBeenCalled();
  expect(createLedgerEntry).not.toHaveBeenCalled();
});

describe("fails closed when the invoice payment book is missing", () => {
  const missing = [
    { data: null, error: { message: "Could not find the function public.record_customer_receipt", code: "PGRST202" } },
    { data: null, error: { message: "Could not find the function public.record_customer_receipt in the schema cache" } },
  ];

  it.each(missing)("bank receipt: refused, no trip-ledger entry, no invoice read or update (%#)", async (response) => {
    rpc.mockResolvedValue(response);
    const result = await captureCustomerReceipt({
      orgId: "org",
      clientId: "client",
      clientName: "Epsilon",
      cash: 900,
      tds: 100,
      reference: "UTR9",
      date: "2026-11-03",
      lines: [line("a", 1000)],
      idempotencyKey: "capture-key-missing",
      tripsByInvoice: { a: [{ id: "trip-1", sales: 1000, tripNumber: "1600" }] },
    });
    expect(result.error?.message).toBe(FINANCE_PAYMENTS_UNAVAILABLE);
    expect(result.error?.message).toMatch(/Nothing was recorded/);
    expect(result.error?.message).toMatch(/apply the Finance migrations/);
    expect(result).toMatchObject({ cleared: 0, trips: 0, receiptNumber: null });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(createLedgerEntry).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("TDS-only receipt: refused the same way", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Could not find the function public.record_invoice_payment", code: "PGRST202" } });
    const result = await captureCustomerReceipt({
      orgId: "org", clientId: "client", clientName: "C", cash: 0, tds: 50, reference: "", date: "2026-11-03",
      lines: [line("a", 50)], idempotencyKey: "capture-key-missing-tds",
    });
    expect(result.error?.message).toBe(FINANCE_PAYMENTS_UNAVAILABLE);
    expect(createLedgerEntry).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("other database errors are not treated as a missing book", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "allocation exceeds invoice balance" } });
    const result = await captureCustomerReceipt({
      orgId: "org", clientId: "client", clientName: "C", cash: 100, tds: 0, reference: "", date: "2026-11-03",
      lines: [line("a", 100)], idempotencyKey: "capture-key-other",
    });
    expect(result.error?.message).not.toBe(FINANCE_PAYMENTS_UNAVAILABLE);
    expect(createLedgerEntry).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("the capture module cannot write the trip ledger or invoice rows at all", () => {
    const source = readFileSync(join(__dirname, "..", "customerReceipt.service.ts"), "utf8");
    expect(source).not.toMatch(/createLedgerEntry/);
    expect(source).not.toMatch(/\.from\(/);
    expect(source).not.toMatch(/@\/lib\/supabase/);
    expect(source).not.toMatch(/receipt_applied|tax_snapshot/);
  });
});

it("surfaces the database message for a duplicate reference", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "duplicate transaction reference" } });
  const result = await captureCustomerReceipt({
    orgId: "org", clientId: "client", clientName: "C", cash: 100, tds: 0, reference: "UTR1", date: "2026-11-03",
    lines: [line("a", 100)], idempotencyKey: "capture-key-4",
  });
  expect(result.error?.message).toBe("A receipt with this transaction reference is already recorded.");
});
