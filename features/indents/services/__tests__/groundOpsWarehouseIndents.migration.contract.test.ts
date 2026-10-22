/**
 * Static contract for Ground Ops warehouse-scoped indent reads. Not a database
 * test; nothing here is applied anywhere.
 */
import { readFileSync } from "fs";
import { join } from "path";

const FILE = "20261022100607_ground_ops_warehouse_indents_read.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", FILE), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

describe("ground_ops_warehouse_indents_read migration", () => {
  it("has a real timestamp, never the sibling repo's 000000 slot", () => {
    expect(FILE.slice(8, 14)).not.toBe("000000");
  });

  it("adds a SELECT-only policy for active Ground Ops members", () => {
    expect(sql).toMatch(/create policy indents_ground_ops_select_assigned on public\.indents\s+for select\s+to authenticated/);
    expect(sql).toContain("coalesce(om.permissions ->> 'platformRole', '') = 'ground_ops'");
    expect(sql).toContain("om.status = 'active'");
    // Never a write path for Ground Ops.
    expect(sql).not.toMatch(/for (all|insert|update|delete)/i);
    expect(sql).not.toMatch(/"Org members can manage indents"/);
  });

  it("uses the same warehouse rule as Ground Ops trips", () => {
    expect(sql).toContain("public.ground_ops_can_see_trip(indents.organization_id, indents.id)");
    expect(sql).toContain("public.ground_ops_can_see_trip(p_org_id, id)");
  });

  it("filters the hub delta for Ground Ops instead of returning nothing", () => {
    expect(sql).toContain("and (not v_ground_ops or public.ground_ops_can_see_trip(p_org_id, id))");
    expect(sql).not.toMatch(/then\s+return jsonb_build_object\(\s*'changed', '\[\]'::jsonb,[\s\S]*?end if;\s*select/);
    expect(sql).toContain("if not public.is_org_member(p_org_id) then");
    expect(sql).toMatch(/security definer\s+set search_path = public/);
  });
});
