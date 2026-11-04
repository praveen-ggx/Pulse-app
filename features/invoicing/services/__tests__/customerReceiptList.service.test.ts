/**
 * The receipt list reads trip-ledger receipts and the legacy invoice snapshot.
 * Invoices are scoped by `org_id` (the invoices column); `organization_id` does
 * not exist on invoices and made the read fail with HTTP 400.
 */
const calls: { table: string; eq: [string, unknown][] }[] = [];
function chain(table: string, result: { data: unknown[]; error: null }) {
  const entry = { table, eq: [] as [string, unknown][] };
  calls.push(entry);
  const c: Record<string, unknown> = {};
  for (const name of ["select", "in", "order"]) c[name] = () => c;
  c.eq = (column: string, value: unknown) => {
    entry.eq.push([column, value]);
    return c;
  };
  c.limit = () => Promise.resolve(result);
  return c;
}
const mockFrom = jest.fn((table: string) =>
  chain(table, table === "invoices"
    ? { data: [{ id: "i1", invoice_number: "INV/9", invoice_date: "2026-11-01", tax_snapshot: { receipt_applied: 500 }, client_id: "client", client_name: "C" }], error: null }
    : { data: [], error: null }),
);
jest.mock("@/lib/supabase", () => ({ supabase: () => ({ from: mockFrom }) }));

import { fetchCustomerReceipts } from "@/features/invoicing/services/customerReceiptList.service";

beforeEach(() => {
  calls.length = 0;
  mockFrom.mockClear();
});

it("scopes invoices by org_id and transactions by organization_id", async () => {
  const result = await fetchCustomerReceipts({ orgId: "org-1", clientId: "client", clientName: "C" });
  expect(result.error).toBeNull();
  const invoices = calls.find((call) => call.table === "invoices")!;
  const transactions = calls.find((call) => call.table === "transactions")!;
  expect(invoices.eq).toContainEqual(["org_id", "org-1"]);
  expect(invoices.eq.map(([column]) => column)).not.toContain("organization_id");
  expect(transactions.eq).toContainEqual(["organization_id", "org-1"]);
  expect(result.receipts.some((receipt) => receipt.invoiceNumber === "INV/9")).toBe(true);
});

it("only reads: no insert, update or delete", async () => {
  await fetchCustomerReceipts({ orgId: "org-1", clientId: "client", clientName: "C" });
  for (const call of calls) expect(["transactions", "invoices"]).toContain(call.table);
  const source = require("fs").readFileSync(require("path").join(__dirname, "..", "customerReceiptList.service.ts"), "utf8");
  expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
});
