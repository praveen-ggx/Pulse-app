import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION =
  "20271030110000_clear_cancel_reason_on_indent_reactivation_and_award.sql";

function readMigration(): string {
  return readFileSync(join(__dirname, "..", MIGRATION), "utf8");
}

describe("clear cancel_reason on indent reactivation / award", () => {
  const sql = readMigration();

  it("installs a BEFORE trigger that clears cancel_reason on active statuses", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.clear_indent_cancel_reason_on_active_status/i,
    );
    expect(sql).toMatch(
      /trg_clear_indent_cancel_reason_on_active_status/i,
    );
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF status, cancel_reason/i);
    expect(sql).toMatch(/'open', 'broadcast', 'awarded', 'assigned', 'deployed'/);
    expect(sql).toMatch(/NEW\.cancel_reason := NULL/);
  });

  it("repairs existing open/broadcast/awarded rows with leftover cancel_reason", () => {
    expect(sql).toMatch(
      /UPDATE public\.indents[\s\S]*SET cancel_reason = NULL[\s\S]*'awarded'/i,
    );
  });

  it("gates hub fail-reason counters on cancelled/expired status", () => {
    expect(sql).toMatch(
      /lower\(coalesce\(i\.status, ''\)\) IN \('cancelled', 'expired'\)[\s\S]*cancel_reason = 'client_cancelled'/,
    );
    expect(sql).toMatch(
      /lower\(coalesce\(i\.status, ''\)\) IN \('cancelled', 'expired'\)[\s\S]*cancel_reason = 'wrong_entry'/,
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.count_org_hub_metrics/i);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.count_org_hub_metrics\(uuid\) TO authenticated, service_role/i,
    );
  });
});
