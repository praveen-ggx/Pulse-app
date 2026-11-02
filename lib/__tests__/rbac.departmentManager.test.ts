/**
 * Department manager — department-limited toggles (app) and the server mirror
 * in migration 20261029171316. Static contract, nothing is applied here; the
 * allow / deny behaviour runs in supabase/tests/department_manager.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  MEMBER_SURFACE_CATALOG,
  MANAGER_DEPARTMENTS,
  isManagerDepartment,
  managerCanEditMember,
  managerDepartmentOf,
  managerEditableSurfaceIds,
  type MemberSurfaceId,
} from "@/lib/memberSurfaces";
import {
  canBeDepartmentManager,
  isPlatformTeamRole,
  type PlatformTeamRole,
} from "@/features/organization/utils/teamInviteRoles.util";

const FILE = "20261029171316_department_manager_allowlist_and_scope.sql";
const raw = readFileSync(join(process.cwd(), "supabase/migrations", FILE), "utf8");
const sql = raw
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

/** Parse `WHEN 'dept' THEN ARRAY[ ... ]` arms of manager_department_surfaces. */
function sqlAllowlists(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /WHEN '([a-z_]+)' THEN ARRAY\[([\s\S]*?)\]::text\[\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    out[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  }
  return out;
}

const ALL_ROLES: PlatformTeamRole[] = [
  "admin",
  "planner",
  "operator",
  "finance",
  "sales",
  "tripops",
  "ground_ops",
  "vendor_support",
  "debit_control",
  "compliance",
  "sourcing",
  "restricted",
];

const BY_ID = new Map(MEMBER_SURFACE_CATALOG.map((d) => [d.id, d]));

describe("Department manager allowlist (app)", () => {
  it("covers exactly the roles that can hold the manager flag", () => {
    for (const role of ALL_ROLES) {
      expect(isPlatformTeamRole(role)).toBe(true);
      expect(isManagerDepartment(role)).toBe(canBeDepartmentManager(role));
    }
  });

  it.each(MANAGER_DEPARTMENTS)("%s: non-empty, known ids, closed under requires", (dept) => {
    const ids = managerEditableSurfaceIds(dept);
    expect(ids.length).toBeGreaterThan(0);
    const set = new Set<MemberSurfaceId>(ids);
    for (const id of ids) {
      expect(BY_ID.has(id)).toBe(true);
      // Ticking a leaf switches its parents on; a parent outside the list
      // would be a grant the manager may not make.
      const parent = BY_ID.get(id)?.requires;
      if (parent) expect(set.has(parent)).toBe(true);
    }
  });

  it.each(MANAGER_DEPARTMENTS)("%s: never Team or workspace administration", (dept) => {
    for (const id of managerEditableSurfaceIds(dept)) {
      expect(id.startsWith("team.")).toBe(false);
      expect(id.startsWith("workspace.")).toBe(false);
    }
  });

  it("gives no toggles to admin, restricted, legacy or unknown roles", () => {
    for (const role of ["admin", "restricted", "planner", "operator", "", null, "nope"]) {
      expect(managerEditableSurfaceIds(role)).toEqual([]);
    }
  });

  it("keeps departments apart (no Finance toggles for TripOps / Sales / Sourcing)", () => {
    for (const dept of ["tripops", "sales", "sourcing", "ground_ops", "compliance"] as const) {
      expect(managerEditableSurfaceIds(dept).some((id) => id.startsWith("finance."))).toBe(false);
    }
  });
});

describe("migration 20261029171316 — server mirror", () => {
  it("has a real timestamp, never the sibling repo's 000000 slot", () => {
    expect(FILE.slice(8, 14)).not.toBe("000000");
  });

  it("server allowlist equals the app allowlist for every department", () => {
    const server = sqlAllowlists();
    expect(Object.keys(server).sort()).toEqual([...MANAGER_DEPARTMENTS].sort());
    for (const dept of MANAGER_DEPARTMENTS) {
      expect(server[dept]).toEqual(managerEditableSurfaceIds(dept));
    }
  });

  it("set_member_surfaces_as_manager checks every key and resolves the org from the target", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.set_member_surfaces_as_manager"));
    expect(body).toContain("SET search_path = ''");
    expect(body).toContain("surface_not_allowed");
    expect(body).toContain("jsonb_typeof(v_value) <> 'boolean'");
    // Target row first, then the caller's membership in that same org.
    const target = body.indexOf("WHERE id = p_member_id");
    const actor = body.indexOf("WHERE organization_id = v_org_id");
    expect(target).toBeGreaterThan(-1);
    expect(actor).toBeGreaterThan(target);
    expect(body).not.toMatch(/WHERE user_id = v_uid AND status = 'active';/);
  });

  it("scope writes stay inside the manager's own scope", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.set_member_scope_as_manager"));
    expect(body).toContain("public.can_manage_member(p_member_id)");
    expect(body).toContain("warehouse_out_of_scope");
    expect(body).toContain("client_out_of_scope");
    expect(body).toContain("scope_not_supported");
  });

  it("anon can call none of the new or changed functions", () => {
    for (const fn of [
      "manager_department_surfaces(text)",
      "can_manage_member(uuid)",
      "set_member_surfaces_as_manager(uuid, jsonb)",
      "set_member_scope_as_manager(uuid, uuid[], uuid[])",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon;`);
    }
  });

  it("warehouse rows: owner/admin write, managers read teammates, staff policy gone", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "org_member_warehouses_staff_manage"');
    const admin = sql.slice(sql.indexOf('CREATE POLICY "org_member_warehouses_admin_manage"'));
    expect(admin).toContain("public.is_org_admin(om.organization_id)");
    expect(admin.slice(0, admin.indexOf(";"))).not.toContain("is_org_staff");
    expect(sql).toMatch(
      /CREATE POLICY "org_member_warehouses_manager_select"[\s\S]*FOR SELECT TO authenticated[\s\S]*can_manage_member\(organization_member_id\)/,
    );
  });
});

const row = (role: string, perms: Record<string, unknown>, status = "active", user_id = "u-x") => ({
  role,
  status,
  user_id,
  permissions: perms,
});

describe("Department manager rules (Team access / editor)", () => {
  it("managerDepartmentOf: only active flagged members of a manager department", () => {
    expect(managerDepartmentOf(row("member", { platformRole: "sourcing", isDepartmentManager: true }))).toBe("sourcing");
    expect(managerDepartmentOf(row("dispatcher", { platformRole: "tripops", isDepartmentManager: true }))).toBe("tripops");
    expect(managerDepartmentOf(row("member", { platformRole: "sourcing" }))).toBeNull();
    expect(managerDepartmentOf(row("member", { platformRole: "sourcing", isDepartmentManager: true }, "inactive"))).toBeNull();
    expect(managerDepartmentOf(row("admin", { platformRole: "sales", isDepartmentManager: true }))).toBeNull();
    expect(managerDepartmentOf(row("owner", { isDepartmentManager: true }))).toBeNull();
    expect(managerDepartmentOf(row("member", { platformRole: "admin", isDepartmentManager: true }))).toBeNull();
    expect(managerDepartmentOf(row("member", { platformRole: "restricted", isDepartmentManager: true }))).toBeNull();
    expect(managerDepartmentOf(row("member", { isDepartmentManager: true }))).toBeNull();
    expect(managerDepartmentOf(null)).toBeNull();
  });

  it.each(MANAGER_DEPARTMENTS)("%s manager sees and edits only active teammates of %s", (dept) => {
    const teammate = row("member", { platformRole: dept }, "active", "u-2");
    expect(managerCanEditMember(dept, "u-1", teammate)).toBe(true);
    // Never themselves, other departments, inactive / pending, owner / admin / driver.
    expect(managerCanEditMember(dept, "u-2", teammate)).toBe(false);
    const other = MANAGER_DEPARTMENTS.find((d) => d !== dept)!;
    expect(managerCanEditMember(dept, "u-1", row("member", { platformRole: other }, "active", "u-3"))).toBe(false);
    expect(managerCanEditMember(dept, "u-1", row("member", { platformRole: dept }, "inactive", "u-4"))).toBe(false);
    expect(managerCanEditMember(dept, "u-1", row("member", { platformRole: dept }, "pending", "u-5"))).toBe(false);
    for (const r of ["owner", "admin", "driver"]) {
      expect(managerCanEditMember(dept, "u-1", row(r, { platformRole: dept }, "active", "u-6"))).toBe(false);
    }
    expect(managerCanEditMember(dept, "u-1", row("member", {}, "active", "u-7"))).toBe(false);
  });

  it("no manager department → no one is editable", () => {
    expect(managerCanEditMember("admin", "u-1", row("member", { platformRole: "admin" }, "active", "u-2"))).toBe(false);
    expect(managerCanEditMember(null, "u-1", row("member", { platformRole: "sales" }, "active", "u-2"))).toBe(false);
  });
});
