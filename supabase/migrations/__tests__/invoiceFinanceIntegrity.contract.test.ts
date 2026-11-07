import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Static contract for 20271103231500_invoice_finance_integrity.sql. Behaviour is
 * proven against a real database by supabase/tests/invoice_finance_controls.sql
 * and supabase/tests/invoice_finance_concurrency.sh; this guards the file shape.
 */
const DIR = join(__dirname, "..");
const FILE = "20271103231500_invoice_finance_integrity.sql";
const SQL = readFileSync(join(DIR, FILE), "utf8");

function functionBodies(): Map<string, string> {
  const out = new Map<string, string>();
  const re = /CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SQL))) {
    const end = SQL.indexOf("\n$$;", m.index);
    out.set(m[1]!, SQL.slice(m.index, end));
  }
  return out;
}
const BODIES = functionBodies();

describe("finance integrity migration", () => {
  it("sorts after the finance controls migration and is not a midnight timestamp", () => {
    const versions = readdirSync(DIR).filter((f) => /^\d{14}_/.test(f)).map((f) => f.slice(0, 14)).sort();
    expect(versions.indexOf("20271103231500")).toBeGreaterThan(versions.indexOf("20271103220000"));
    expect(FILE.slice(8, 14)).not.toBe("000000");
  });

  it("every security definer function pins its search_path", () => {
    for (const [name, body] of BODIES) {
      if (/SECURITY DEFINER/.test(body)) {
        expect([name, /SET search_path = (''|public)/.test(body)]).toEqual([name, true]);
      }
    }
  });

  it("every public RPC checks the caller before reading", () => {
    const rpcs = [
      "record_customer_receipt", "link_trip_receipt_to_invoice_payment", "trip_ledger_receipts_for_invoicing",
      "org_receivables_aging", "invoice_register", "invoice_payment_register", "invoice_collections_summary",
      "customer_ledger_entries", "customer_finance_ledger", "invoice_payment_receipt", "invoice_credit_note_register",
      "import_bank_statement", "match_bank_line", "unmatch_bank_line", "bank_reconciliation_lines",
      "bank_reconciliation_history", "invoice_finance_history", "customer_invoice_receivables", "invoice_payment_summaries",
    ];
    for (const name of rpcs) {
      const body = BODIES.get(name);
      expect([name, Boolean(body)]).toEqual([name, true]);
      const guarded = /assert_invoice_payment_(reader|authority)\(p_org_id\)|record_invoice_payment_core\(/.test(body!);
      expect([name, guarded]).toEqual([name, true]);
    }
  });

  it("writes need finance authority, reads need membership", () => {
    for (const name of ["import_bank_statement", "match_bank_line", "unmatch_bank_line", "link_trip_receipt_to_invoice_payment", "record_invoice_payment_core"]) {
      expect([name, BODIES.get(name)!.includes("assert_invoice_payment_authority(p_org_id)")]).toEqual([name, true]);
    }
  });

  it("grants client RPCs to authenticated only, never anon", () => {
    expect(SQL).toMatch(/EXECUTE format\('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_sig\)/);
    expect(SQL).toMatch(/EXECUTE format\('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig\)/);
    expect(SQL).not.toMatch(/GRANT [^;]* TO anon/);
  });

  it("internal helpers are revoked from client roles", () => {
    for (const sig of [
      "record_invoice_payment_core(uuid, uuid, date, numeric, numeric, text, text, uuid, text, text, text, jsonb, uuid)",
      "apply_invoice_payment_allocations(uuid, uuid, jsonb)",
      "customer_ledger_rows(uuid, uuid)",
      "invoice_credited_amount(uuid, uuid)",
      "invoice_settled_amount(uuid, uuid)",
    ]) {
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
    }
  });

  it("allocation limit subtracts credit notes", () => {
    expect(BODIES.get("apply_invoice_payment_allocations")).toMatch(/v_received \+ v_credited \+ v_amount, 2\) > round\(v_invoice\.total_amount, 2\)/);
  });

  it("issued invoices are guarded against direct client writes, definer RPCs are not", () => {
    const guard = BODIES.get("invoices_issued_guard")!;
    expect(guard).toContain("current_user NOT IN ('authenticated', 'anon')");
    expect(guard).toContain("issued invoice amounts and identity are immutable");
    expect(guard).toContain("issued invoice status changes only through finance operations");
    expect(SQL).toMatch(/CREATE TRIGGER invoices_issued_guard\s+BEFORE UPDATE OR DELETE ON public\.invoices/);
  });

  it("one bank line per receipt, enforced by a unique index", () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX invoice_bank_lines_one_line_per_payment\s+ON public\.invoice_bank_lines \(org_id, matched_payment_id\)\s+WHERE status = 'matched'/);
  });

  it("never writes the trip ledger or creates payments from bank lines", () => {
    expect(SQL).not.toMatch(/(INSERT INTO|UPDATE|DELETE FROM)\s+public\.transactions/i);
    expect(BODIES.get("import_bank_statement")).not.toMatch(/invoice_payments/);
  });

  it("does not rewrite issued invoice totals", () => {
    expect(SQL).not.toMatch(/UPDATE public\.invoices\s+SET[^;]*total_amount/i);
  });

  it("does not create indexes on existing large tables (no blocking index build)", () => {
    const targets = Array.from(SQL.matchAll(/CREATE (?:UNIQUE )?INDEX \w+\s+ON public\.(\w+)/g), (m) => m[1]);
    for (const table of targets) {
      expect(["invoice_payments", "invoice_bank_lines", "invoice_credit_notes", "invoice_credit_note_lines", "invoice_control_events"]).toContain(table);
    }
  });
});
