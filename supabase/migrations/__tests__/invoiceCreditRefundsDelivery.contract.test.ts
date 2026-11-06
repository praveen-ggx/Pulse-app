/**
 * Static checks on 20271103234500 / 235000 / 235500. These read the migration
 * files; they are not database tests. Behaviour is proven on a real database by
 * supabase/tests/invoice_credit_refunds.sql, invoice_delivery_dashboard.sql,
 * invoice_finance_concurrency.sh and invoice_finance_legacy_audit.sh.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const dir = join(__dirname, "..");
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const GST = "20271103234500_invoice_credit_gst_and_refunds.sql";
const DASH = "20271103235000_invoice_finance_dashboard.sql";
const OUTBOX = "20271103235500_invoice_delivery_outbox.sql";

describe("finance migrations 234500 / 235000 / 235500", () => {
  const all = readdirSync(dir).filter((f) => f.endsWith(".sql"));

  it("exist once, after the integrity migration, with no midnight timestamps", () => {
    for (const f of [GST, DASH, OUTBOX]) {
      expect(all.filter((x) => x.slice(0, 14) === f.slice(0, 14))).toEqual([f]);
      expect(f.slice(8, 14)).not.toBe("000000");
    }
    const ordered = [...all].sort();
    expect(ordered.indexOf(GST)).toBeGreaterThan(ordered.indexOf("20271103231500_invoice_finance_integrity.sql"));
    expect(ordered.indexOf(DASH)).toBeGreaterThan(ordered.indexOf(GST));
    expect(ordered.indexOf(OUTBOX)).toBeGreaterThan(ordered.indexOf(DASH));
  });

  it("keeps the earlier credit-note signature and refuses caller-sent tax there", () => {
    const sql = read(GST);
    expect(sql).toContain("p_tax_treatment text,");
    expect(sql).toMatch(/issue_invoice_credit_note\(\s*p_org_id uuid,\s*p_invoice_id uuid,\s*p_credit_date date,\s*p_reason text,\s*p_lines jsonb,/);
    expect(sql).toContain("credit note tax is calculated from the invoice");
  });

  it("does not rewrite existing credit notes and makes refunds append-only", () => {
    const sql = read(GST);
    expect(sql).toContain("ADD COLUMN tax_treatment text NOT NULL DEFAULT 'legacy'");
    expect(sql).not.toMatch(/UPDATE public\.invoice_credit_notes/);
    expect(sql).toContain("refunds cannot be deleted");
    expect(sql).toContain("a refund is immutable; reverse it instead");
    expect(sql).toContain("REVOKE ALL ON public.invoice_customer_refunds FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT SELECT ON public.invoice_customer_refunds TO authenticated;");
  });

  it("guards refunds with finance authority and the org lock", () => {
    const sql = read(GST);
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.record_customer_refund("));
    expect(fn.indexOf("assert_invoice_payment_authority")).toBeGreaterThan(0);
    expect(fn.indexOf("pg_advisory_xact_lock(872342")).toBeGreaterThan(0);
    expect(fn).toContain("refund exceeds the refundable balance");
  });

  it("keeps internal helpers away from client roles", () => {
    const sql = read(GST);
    for (const helper of ["invoice_refundable_amount(uuid, text, uuid)", "invoice_payment_refunded_amount(uuid, uuid)", "invoice_credit_refunded_amount(uuid, uuid)"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${helper} FROM PUBLIC, anon, authenticated;`);
    }
  });

  it("dashboard is a bounded reader", () => {
    const sql = read(DASH);
    expect(sql).toContain("assert_invoice_payment_reader");
    expect(sql).toContain("choose a period of up to three years");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.invoice_finance_dashboard(uuid, date, date) FROM PUBLIC, anon;");
  });

  it("delivery outbox sends nothing and keeps the worker service-role only", () => {
    const sql = read(OUTBOX);
    expect(sql).not.toMatch(/net\.http|http_post|cron\.schedule/);
    for (const fn of ["enqueue_invoice_reminders(date)", "claim_invoice_delivery_jobs(integer)", "complete_invoice_delivery_job(uuid, text)", "fail_invoice_delivery_job(uuid, text, boolean)"]) {
      expect(sql).toContain(`'public.${fn}'`);
    }
    expect(sql).toContain("FROM PUBLIC, anon, authenticated', v_sig);");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(sql).toContain("CONSTRAINT invoice_delivery_jobs_once UNIQUE (org_id, dedupe_key)");
  });
});
