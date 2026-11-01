import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");

function read(name: string) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

describe("driver mode books migrations", () => {
  const indie = read("20271102114500_driver_indie_financial_book.sql");
  const finance = read("20271102120000_dco_self_finance_visibility.sql");

  it("uses non-midnight timestamps and lock_timeout", () => {
    expect("20271102114500".endsWith("000000")).toBe(false);
    expect("20271102120000".endsWith("000000")).toBe(false);
    expect(indie).toMatch(/SET LOCAL lock_timeout = '5s'/);
    expect(finance).toMatch(/SET LOCAL lock_timeout = '5s'/);
  });

  it("keeps indie book keyed by owner_user_id with eligibility gate", () => {
    expect(indie).toMatch(/is_independent_driver_eligible/);
    expect(indie).toMatch(/owner_user_id/);
    expect(indie).toMatch(/CREATE TABLE IF NOT EXISTS public\.driver_indie_receivables/);
    expect(indie).toMatch(/correct_driver_indie_receivable/);
    expect(indie).toMatch(/collect_driver_indie_receivable/);
    expect(indie).toMatch(/party_id uuid NOT NULL/);
    expect(indie).not.toMatch(/CREATE TABLE[\s\S]*party_b_id/);
  });

  it("revokes PUBLIC/anon execute on indie writers", () => {
    expect(indie).toMatch(/REVOKE ALL ON FUNCTION public\.issue_driver_indie_receivable/);
    expect(indie).toMatch(/GRANT EXECUTE ON FUNCTION public\.issue_driver_indie_receivable/);
  });

  it("exposes Finance Self visibility only to authenticated callers", () => {
    expect(finance).toMatch(/list_dco_self_finance_receivables/);
    expect(finance).toMatch(/_dco_self_caller_workspace/);
    expect(finance).toMatch(/REVOKE ALL ON FUNCTION public\.list_dco_self_finance_receivables/);
    expect(finance).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_dco_self_finance_receivables\(\) TO authenticated/);
  });

  it("does not import PR #65 schema names into indie migration", () => {
    expect(indie).not.toMatch(/dco_self_draft/);
    expect(indie).not.toMatch(/offline_receivable_v1/);
  });
});
