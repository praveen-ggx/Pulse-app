import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20271103213000_invoice_payment_tracking.sql"),
  "utf8",
);

describe("invoice payment tracking migration", () => {
  it("stores INR amounts and keeps issued invoice totals untouched", () => {
    expect(sql).toContain("CREATE TABLE public.invoice_payments");
    expect(sql).toContain("CREATE TABLE public.invoice_payment_allocations");
    expect(sql).toContain("numeric(14,2)");
    expect(sql).not.toMatch(/UPDATE\s+public\.invoices/i);
    expect(sql).not.toMatch(/public\.transactions/);
    expect(sql).not.toContain("amount_paid");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
  });

  it("authorizes an active finance member and isolates the organization", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("assert_invoice_payment_authority");
    expect(sql).toContain("finance_manage");
    expect(sql).toContain("is_org_member(org_id)");
    expect(sql).toContain("not authorized");
    expect(sql).toContain("invoice not found in this organization");
  });

  it("locks rows, rejects drafts, and stops over-allocation", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("draft invoice cannot receive a payment");
    expect(sql).toContain("invoice is not issued");
    expect(sql).toContain("allocation exceeds invoice balance");
    expect(sql).toContain("allocation exceeds payment balance");
    expect(sql).toContain("duplicate transaction reference");
  });

  it("reverses by keeping the original rows and appending an event", () => {
    expect(sql).toContain("invoice payment events are append-only");
    expect(sql).toContain("invoice payments cannot be deleted");
    expect(sql).toContain("'reversed'");
    expect(sql).toContain("previous_status");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.invoice_payments/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.invoice_payment_allocations/i);
  });

  it("derives received and outstanding from confirmed allocations", () => {
    expect(sql).toContain("amount_received");
    expect(sql).toContain("amount_outstanding");
    expect(sql).toContain("'partially_paid'");
    expect(sql).toContain("'overpaid'");
    expect(sql).toContain("status = 'confirmed'");
    expect(sql).toContain("invoice_payment_allocations_confirmed_invoice");
  });
});
