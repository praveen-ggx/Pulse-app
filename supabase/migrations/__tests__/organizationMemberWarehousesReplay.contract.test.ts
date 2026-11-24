import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const prerequisite = fs.readFileSync(
  path.join(migrations, "20261029170000_organization_member_warehouses_before_department_manager.sql"),
  "utf8",
);
const restore = fs.readFileSync(
  path.join(migrations, "20270917100030_restore_warehouse_assignment_admin_policy.sql"),
  "utf8",
);

describe("trips.owner_vehicle_id clean-replay order", () => {
  const column = fs.readFileSync(
    path.join(migrations, "20261114110000_trips_owner_vehicle_id_before_plate_link.sql"),
    "utf8",
  );

  it("adds the nullable trip foreign key before the plate-link backfill", () => {
    expect("20261114110000" < "20261114111733").toBe(true);
    expect("20261114110000" < "20270211100000").toBe(true);
    expect(column).toContain(
      "ADD COLUMN IF NOT EXISTS owner_vehicle_id uuid",
    );
    expect(column).toContain("REFERENCES public.owner_vehicles(id) ON DELETE SET NULL");
    expect(column).not.toContain("CREATE OR REPLACE FUNCTION");
    expect(column).not.toMatch(/GRANT[\s\S]*TO anon/i);
  });
});

describe("direct quote names return type clean-replay order", () => {
  const prep = fs.readFileSync(
    path.join(migrations, "20261113104000_direct_quote_names_return_before_pool_reissue.sql"),
    "utf8",
  );

  it("adds counter_amount and drops only the older return type", () => {
    expect("20261113104000" > "20261113100000").toBe(true);
    expect("20261113104000" < "20261113104714").toBe(true);
    expect("20261113104000" < "20270111000000").toBe(true);
    expect(prep).toContain("ADD COLUMN IF NOT EXISTS counter_amount numeric(12, 2)");
    expect(prep).toContain("position('counter_amount' in pg_get_function_result(p.oid)) = 0");
    expect(prep).not.toMatch(/GRANT[\s\S]*TO anon/i);
  });
});

describe("is_org_staff clean-replay order", () => {
  const early = fs.readFileSync(
    path.join(migrations, "20261113100000_is_org_staff_before_pool_bid_policy.sql"),
    "utf8",
  );
  const later = fs.readFileSync(path.join(migrations, "20270916120000_is_org_staff.sql"), "utf8");

  it("installs the same staff predicate before the pool-bid policy", () => {
    expect("20261113100000" < "20261113104714").toBe(true);
    expect("20261113100000" < "20270916120000").toBe(true);
    expect(early).toContain("CREATE OR REPLACE FUNCTION public.is_org_staff(org_id uuid)");
    expect(early).toContain("SECURITY DEFINER");
    expect(early).toContain("SET search_path TO ''");
    expect(early).toContain("ARRAY['owner','admin','member','dispatcher','finance']");
    expect(early).not.toMatch(/GRANT[\s\S]*TO anon/i);
    expect(later).toContain("ARRAY['owner','admin','member','dispatcher','finance']");
  });
});

describe("indent award_revoked_at clean-replay order", () => {
  const column = fs.readFileSync(
    path.join(migrations, "20261112140000_indents_award_revoked_at_before_reference.sql"),
    "utf8",
  );

  it("adds the nullable column before the SQL function that reads it", () => {
    expect("20261112140000" < "20261112144350").toBe(true);
    expect("20261112140000" < "20270925214500").toBe(true);
    expect(column).toContain("ADD COLUMN IF NOT EXISTS award_revoked_at timestamptz");
    expect(column).not.toContain("CREATE TRIGGER");
    expect(column).not.toMatch(/GRANT[\s\S]*TO anon/i);
  });
});

describe("organization_member_warehouses clean-replay order", () => {
  it("creates the table before the department-manager policy migration", () => {
    expect("20261029170000" < "20261029171316").toBe(true);
    expect(prerequisite).toContain(
      "CREATE TABLE IF NOT EXISTS public.organization_member_warehouses",
    );
    expect(prerequisite).toContain(
      "organization_member_id uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE",
    );
    expect(prerequisite).toContain(
      "warehouse_id uuid NOT NULL REFERENCES public.client_warehouses(id) ON DELETE CASCADE",
    );
    expect(prerequisite).toContain("UNIQUE (organization_member_id, warehouse_id)");
    expect(prerequisite).toContain("ENABLE ROW LEVEL SECURITY");
    expect(prerequisite).not.toMatch(/GRANT[\s\S]*TO anon/i);
    expect(prerequisite).not.toContain("CREATE POLICY");
  });

  it("restores owner/admin writes after the ground-ops file recreates the staff policy", () => {
    expect("20270917100030" > "20270917100000").toBe(true);
    expect("20270917100030" < "20270917100100").toBe(true);
    expect(restore).toContain('DROP POLICY IF EXISTS "org_member_warehouses_staff_manage"');
    expect(restore).toContain('CREATE POLICY "org_member_warehouses_admin_manage"');
    expect(restore).toContain("public.is_org_admin(om.organization_id)");
    expect(restore).toContain('CREATE POLICY "org_member_warehouses_manager_select"');
    expect(restore).toContain("public.can_manage_member(organization_member_id)");
    expect(restore).not.toContain('CREATE POLICY "org_member_warehouses_staff_manage"');
    expect(restore).not.toMatch(/GRANT[\s\S]*TO anon/i);
  });
});
