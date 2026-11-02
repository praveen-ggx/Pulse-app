import { readFileSync } from "fs";
import { join } from "path";

const SQL = readFileSync(
  join(__dirname, "..", "20271102003100_dco_self_financial_book.sql"),
  "utf8",
);

describe("dco_self financial book migration", () => {
  it("creates the dedicated book and never writes organisation trip customer fields", () => {
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.dco_self_parties/);
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.dco_self_receivables/);
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.dco_self_receivable_versions/);
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS public\.dco_self_collections/);
    expect(SQL).toMatch(/CONSTRAINT dco_self_receivables_idempotency_key UNIQUE/);
    expect(SQL).toMatch(/CONSTRAINT dco_self_collections_idempotency_key UNIQUE/);
    expect(SQL).toMatch(/issue_dco_self_receivable/);
    expect(SQL).toMatch(/correct_dco_self_receivable/);
    expect(SQL).toMatch(/collect_dco_self_receivable/);
    expect(SQL).toMatch(/dco_self_marketplace_denied/);
    expect(SQL).toMatch(/is_dco_eligible/);
    expect(SQL).not.toMatch(/supplier_rate\s*=/);
    expect(SQL).not.toMatch(/client_id\s*=/);
    expect(SQL).not.toMatch(/dco_party_billed/);
    expect(SQL).not.toMatch(/pulse-dco-party/);
  });

  it("is select-only for authenticated and DEFINER for writes", () => {
    expect(SQL).toMatch(/SECURITY DEFINER/);
    const policies = SQL.match(/CREATE POLICY[\s\S]*?(?=CREATE POLICY|GRANT SELECT|CREATE OR REPLACE FUNCTION public\.upsert)/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/FOR SELECT/);
      expect(policy).not.toMatch(/FOR INSERT/);
      expect(policy).not.toMatch(/FOR UPDATE/);
      expect(policy).not.toMatch(/FOR DELETE/);
    }
  });
});
