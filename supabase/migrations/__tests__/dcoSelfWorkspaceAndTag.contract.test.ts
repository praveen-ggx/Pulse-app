import { readFileSync } from "fs";
import { join } from "path";

function readMigration(name: string): string {
  return readFileSync(join(__dirname, "..", name), "utf8");
}

const ENSURE = readMigration("20271101154500_ensure_dco_workspace.sql");
const QUALIFY = readMigration("20271101184600_ensure_dco_workspace_qualify_returning_id.sql");
const TAG = readMigration("20271101222100_tag_dco_trip_party.sql");
const TAG_NO_NOTES = readMigration("20271102134500_tag_dco_trip_party_no_notes_finance.sql");

describe("ensure_dco_workspace migrations", () => {
  it.each([
    ["154500", ENSURE],
    ["184600", QUALIFY],
  ])("%s is valid on a fresh replay (no bare RETURNING id)", (_label, sql) => {
    expect(sql).toMatch(/#variable_conflict use_column/);
    expect(sql).toMatch(/v_org_id := gen_random_uuid\(\)/);
    expect(sql).not.toMatch(/RETURNING id INTO v_org_id/);
    expect(sql).toMatch(/public\.dco_self_workspace_id\(v_uid\)/);
    expect(sql).toMatch(/operating_model = 'ASSET_BASED'/);
    expect(sql).toMatch(/relationship_status = 'active_employee'/);
    expect(sql).toMatch(/om\.user_id IS DISTINCT FROM p_user_id/);
    expect(sql).toMatch(/is_dco_eligible/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.ensure_dco_workspace\(\) TO authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.dco_self_workspace_id\(uuid\) FROM authenticated/);
  });
});

describe("tag_dco_trip_party isolation", () => {
  it("requires DCO eligibility, assigned driver, DCO operating mode, and Self workspace client", () => {
    expect(TAG).toMatch(/is_dco_eligible\(v_uid\)/);
    expect(TAG).toMatch(/d\.user_id = v_uid/);
    expect(TAG).toMatch(/dco_tag_marketplace_denied/);
    expect(TAG).toMatch(/operating_mode[\s\S]*IS DISTINCT FROM 'DCO'/);
    expect(TAG).toMatch(/dco_tag_fleet_denied/);
    expect(TAG).toMatch(/dco_self_workspace_id\(v_uid\)/);
    expect(TAG).toMatch(/v_client\.organization_id IS DISTINCT FROM v_self/);
    expect(TAG).not.toMatch(/is_org_staff/);
  });

  it("historical intro: persists billed on dco_party_billed and never writes supplier_rate", () => {
    // Immutable applied history — superseded by 20271102134500 forward migration.
    expect(TAG).toMatch(/ADD COLUMN IF NOT EXISTS dco_party_billed numeric/);
    expect(TAG).toMatch(/dco_party_billed = v_billed/);
    expect(TAG).toMatch(/p_billed numeric DEFAULT NULL/);
    expect(TAG).not.toMatch(/supplier_rate\s*=/);
    expect(TAG).toMatch(/driver_ledger_dco_capture_uidx/);
  });

  it("is DEFINER with least-privilege execute", () => {
    expect(TAG).toMatch(/SECURITY DEFINER/);
    expect(TAG).toMatch(/REVOKE ALL ON FUNCTION public\.tag_dco_trip_party\(uuid, uuid, numeric\) FROM PUBLIC/);
    expect(TAG).toMatch(/GRANT EXECUTE ON FUNCTION public\.tag_dco_trip_party\(uuid, uuid, numeric\) TO authenticated/);
  });
});

describe("tag_dco_trip_party no-notes-finance forward migration", () => {
  it("stops writing notes financial markers and clears dco_party_billed", () => {
    expect(TAG_NO_NOTES).toMatch(/dco_party_billed = NULL/);
    expect(TAG_NO_NOTES).toMatch(/'dco_party_billed', NULL/);
    expect(TAG_NO_NOTES).toMatch(/billed_ignored/);
    expect(TAG_NO_NOTES).not.toMatch(/v_marker\s*:=/);
    expect(TAG_NO_NOTES).not.toMatch(/dco_party_billed = v_billed/);
    expect(TAG_NO_NOTES).toMatch(/regexp_replace\([\s\S]*pulse-dco-party/);
    expect(TAG_NO_NOTES).not.toMatch(/supplier_rate\s*=/);
  });

  it("keeps Party B auth gates and least-privilege execute", () => {
    expect(TAG_NO_NOTES).toMatch(/is_dco_eligible\(v_uid\)/);
    expect(TAG_NO_NOTES).toMatch(/d\.user_id = v_uid/);
    expect(TAG_NO_NOTES).toMatch(/dco_tag_marketplace_denied/);
    expect(TAG_NO_NOTES).toMatch(/dco_tag_fleet_denied/);
    expect(TAG_NO_NOTES).toMatch(/dco_self_workspace_id\(v_uid\)/);
    expect(TAG_NO_NOTES).toMatch(/SECURITY DEFINER/);
    expect(TAG_NO_NOTES).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.tag_dco_trip_party\(uuid, uuid, numeric\) TO authenticated/,
    );
  });
});
