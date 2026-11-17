import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(__dirname, "../20271118143000_compliance_ops_pipeline_and_hub_tiles.sql"),
  "utf8",
);

describe("compliance ops pipeline and hub tiles", () => {
  it("keeps the public hub keyset signature and adds tile buckets inside it", () => {
    expect(sql).toContain(
      "OR p_bucket NOT IN ('all', 'active', 'history', 'cancelled', 'closed', 'unassigned', 'assigned', 'loading', 'in_transit', 'unloading')",
    );
    expect(sql).toContain("public.hub_tile_match(t.status, t.driver_id IS NOT NULL, p_bucket)");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.list_org_hub_trips_keyset(");
  });

  it("matches the ops pipeline rule and does not reuse p_compliance", () => {
    expect(sql).toContain("lower(coalesce(p_status, '')) <> 'cancelled'");
    expect(sql).toContain("('delivered', 'completed', 'done')");
    expect(sql).toContain("('assigned', 'draft')");
    expect(sql).toContain("'in_progress', 'picked_up', 'pickup', 'loading'");
    expect(sql).toContain("('ground_ops', 'sourcing')");
    expect(sql).toContain("list_compliance_ops_pipeline_keyset");
    expect(sql).not.toMatch(/list_compliance_ops_pipeline_keyset[\s\S]*p_compliance/);
  });

  it("fails a half cursor and grants the pipeline function to authenticated only", () => {
    expect(sql).toContain("'invalid_cursor'");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.list_compliance_ops_pipeline_keyset(uuid, integer, timestamptz, uuid, boolean) FROM PUBLIC, anon;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.list_compliance_ops_pipeline_keyset(uuid, integer, timestamptz, uuid, boolean) TO authenticated, service_role;",
    );
  });
});
