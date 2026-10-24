import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const BANK =
  "supabase/migrations/20271014184500_entity_bank_accounts_beneficiary_branch.sql";
const REGION = "supabase/migrations/20271014184600_suppliers_primary_region.sql";
const TABLE_CREATE = "supabase/migrations/20261029000005_create_entity_bank_accounts.sql";
const TEAM_SYNC_BANK = "20261005080754";
const RELEASE = "supabase/release-sets/supplier-profile-columns.versions";

const bankSql = readFileSync(join(process.cwd(), BANK), "utf8");
const regionSql = readFileSync(join(process.cwd(), REGION), "utf8");
const release = readFileSync(join(process.cwd(), RELEASE), "utf8");

describe("supplier profile column migrations", () => {
  it("sorts after entity_bank_accounts is created and after each other", () => {
    expect(BANK.localeCompare(TABLE_CREATE)).toBeGreaterThan(0);
    expect(REGION.localeCompare(BANK)).toBeGreaterThan(0);
    expect(BANK.includes("000000")).toBe(false);
    expect(REGION.includes("000000")).toBe(false);
  });

  it("does not reuse the team-sync bank version that sorts before the table exists", () => {
    const versions = readdirSync(join(process.cwd(), "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => name.slice(0, 14));
    expect(versions).not.toContain(TEAM_SYNC_BANK);
  });

  it("adds the two payout columns idempotently", () => {
    expect(bankSql).toMatch(/ALTER TABLE public\.entity_bank_accounts/);
    expect(bankSql).toMatch(/ADD COLUMN IF NOT EXISTS beneficiary_name text/);
    expect(bankSql).toMatch(/ADD COLUMN IF NOT EXISTS branch_name text/);
    expect(bankSql).not.toMatch(/DROP COLUMN/i);
    expect(bankSql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it("adds primary_region with the North/South/East/West check", () => {
    expect(regionSql).toMatch(/ALTER TABLE public\.suppliers/);
    expect(regionSql).toMatch(/ADD COLUMN IF NOT EXISTS primary_region text/);
    expect(regionSql).toMatch(
      /CHECK \(primary_region IS NULL OR primary_region IN \('North', 'South', 'East', 'West'\)\)/,
    );
    expect(regionSql).not.toMatch(/DROP COLUMN/i);
    expect(regionSql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it("is named by its own release set and not frozen", () => {
    expect(release).toMatch(/20271014184500/);
    expect(release).toMatch(/20271014184600/);
    const frozen = readFileSync(
      join(process.cwd(), "supabase/release-sets/FROZEN.versions"),
      "utf8",
    );
    expect(frozen).not.toMatch(/20271014184500|20271014184600/);
  });
});
