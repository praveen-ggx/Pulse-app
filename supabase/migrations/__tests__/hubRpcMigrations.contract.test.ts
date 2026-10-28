import { readFileSync } from "fs";
import { join } from "path";

const GET_TRIPS = "20271027155318_get_trips_for_org_date_range.sql";
const COUNT_ORG = "20271027155402_count_org_hub_metrics.sql";

function readMigration(name: string): string {
  return readFileSync(join(__dirname, "..", name), "utf8");
}

describe("get_trips_for_org date-range migration", () => {
  const sql = readMigration(GET_TRIPS);

  it("keeps 2-arg defaults so p_org_id-only and (org, backlog) still bind", () => {
    expect(sql).toMatch(/p_include_compliance_backlog boolean default false/i);
    expect(sql).toMatch(/p_from date default null/i);
    expect(sql).toMatch(/p_to date default null/i);
  });

  it("uses either pickup or Asia/Kolkata created day, not pickup-only", () => {
    expect(sql).toMatch(/tr\.pickup_date BETWEEN p_from AND p_to/);
    expect(sql).toMatch(/timezone\('Asia\/Kolkata', tr\.created_at\)\)::date BETWEEN p_from AND p_to/);
    expect(sql).toMatch(/OR tr\.pickup_date BETWEEN/);
  });

  it("keeps the live 400 cap and documents the dated 2000 safety cap", () => {
    expect(sql).toMatch(/r\.rn <= 400/);
    expect(sql).toMatch(/r\.rn <= 2000/);
    expect(sql).not.toMatch(/no 400 cap/i);
  });

  it("preserves org, supplier, Ground Ops, backlog, and is_org_member rules", () => {
    expect(sql).toMatch(/public\.is_org_member\(p_org_id\)/);
    expect(sql).toMatch(/s\.linked_organization_id = p_org_id/);
    expect(sql).toMatch(/platformRole/);
    expect(sql).toMatch(/p_include_compliance_backlog/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO anon, authenticated, service_role/i);
  });

  it("drops the live 2-arg identity in the same file as CREATE and notifies PostgREST", () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.get_trips_for_org\(uuid, boolean\)/i);
    expect(sql).toMatch(/CREATE FUNCTION public\.get_trips_for_org/i);
    expect(sql).toMatch(/NOTIFY pgrst, 'reload schema'/);
    expect(sql.indexOf("DROP FUNCTION")).toBeLessThan(sql.search(/create function/i));
  });
});

describe("count_org_hub_metrics migration", () => {
  const sql = readMigration(COUNT_ORG);

  it("fails closed unless the caller is an org member", () => {
    expect(sql).toMatch(/NOT public\.is_org_member\(p_org_id\)/);
    expect(sql).toMatch(/RETURN NULL/);
  });

  it("does not alias delivered_docs_pending to trips_completed", () => {
    expect(sql).toMatch(/AS delivered_docs_pending/);
    expect(sql).not.toMatch(/trips_completed[\s\S]{0,40}AS delivered_docs_pending/);
    expect(sql).toMatch(/FROM public\.trip_documents d WHERE d\.trip_id = t\.id/);
  });

  it("uses the same org / supplier / Ground Ops visibility as get_trips_for_org", () => {
    expect(sql).toMatch(/s\.linked_organization_id = p_org_id/);
    expect(sql).toMatch(/source = 'mover_asset'/);
    expect(sql).toMatch(/platformRole/);
    expect(sql).toMatch(/organization_member_warehouses/);
  });

  it("is DEFINER with least-privilege execute (no anon, no PUBLIC)", () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.count_org_hub_metrics\(uuid\) FROM PUBLIC/i);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.count_org_hub_metrics\(uuid\) TO authenticated, service_role/i,
    );
    expect(sql).not.toMatch(/TO anon, authenticated/);
  });
});
