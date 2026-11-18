import { readFileSync } from "fs";
import { join } from "path";

const FILE = "20271118123000_supplier_trips_keyset.sql";

function sql(): string {
  return readFileSync(join(__dirname, "..", FILE), "utf8");
}

describe("supplier trip keyset migration", () => {
  const body = sql();

  it("returns one jsonb page and keeps the legacy set-returning function", () => {
    expect(body).toMatch(/RETURNS jsonb/i);
    expect(body).not.toMatch(/RETURNS SETOF/i);
    expect(body).toMatch(/get_trips_where_org_is_supplier/);
    expect(body).not.toMatch(/DROP FUNCTION[\s\S]*get_trips_where_org_is_supplier\(uuid\)/i);
  });

  it("clamps the page at 250 and orders by created_at then id", () => {
    expect(body).toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 250\), 1\), 250\)/);
    expect(body).toMatch(/ORDER BY sort_created_at DESC NULLS LAST, id DESC/);
    expect(body).toMatch(/'has_more'/);
  });

  it("keeps membership and supplier visibility and does not grant anon", () => {
    expect(body).toMatch(/public\.is_org_member\(p_org_id\)/);
    expect(body).toMatch(/s\.linked_organization_id = p_org_id/);
    expect(body).toMatch(/dq\.bidder_organization_id = p_org_id/);
    expect(body).toMatch(/SECURITY DEFINER/i);
    expect(body).toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/i);
    expect(body).not.toMatch(/TO anon/i);
    expect(body).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/i);
    expect(body).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM anon/i);
  });
});
