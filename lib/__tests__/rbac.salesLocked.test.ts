/**
 * Sales team — FINAL (owner sign-off 2026-10-12, tested with Daisy on gx-pulse).
 * Any change to the Sales preset must update SALES_FINAL on purpose.
 */
import * as fs from "fs";
import * as path from "path";
import { getCapabilitiesFromProfile } from "@/lib/capabilities";
import {
  MEMBER_SURFACE_CATALOG,
  applySurfaceToggle,
  defaultSurfacesForRole,
  memberHasSurface,
  type MemberSurfaceId,
} from "@/lib/memberSurfaces";

const HYBRID = getCapabilitiesFromProfile({ role: "user" }, "HYBRID");

const SALES_FINAL: MemberSurfaceId[] = [
  // Network tab, clients, marketplace
  "sales.tab",
  "sales.clients.view",
  "sales.clients.create",
  "sales.clients.edit",
  "sales.clients.detail",
  "sales.clients.analytics",
  "sales.marketplace.post",
  "sales.marketplace.bid",
  "sales.load_board",
  "sales.chat",
  "sales.network.connect",
  "sales.network.discover",
  "sales.network.stories",
  // Suppliers
  "sales.suppliers.view",
  "sales.suppliers.create",
  "sales.suppliers.edit",
  "sales.suppliers.detail",
  "sales.suppliers.analytics",
  // Indents (incl. award to supplier) + Pulse loads
  "tripops.indents.view",
  "tripops.indents.create",
  "tripops.indents.edit",
  "tripops.indents.cancel",
  "tripops.indents.broadcast",
  "tripops.indents.bid",
  "tripops.indents.award",
  "tripops.indents.allocate",
  "tripops.pulse_loads",
  // Trip booking
  "tripops.tab",
  "tripops.trips.view",
  "tripops.trips.detail",
  "tripops.trips.create_asset",
  "tripops.trips.create_aggregate",
  "tripops.trips.assign",
  "tripops.trips.reassign",
];

/** Gate through the department switches (Network / Trips tab), not by id. */
const INDIRECT = new Set<MemberSurfaceId>(["sales.tab", "tripops.tab"]);

const sales = () => defaultSurfacesForRole("sales", HYBRID);
const effective = (s: ReturnType<typeof sales>) =>
  MEMBER_SURFACE_CATALOG.filter((d) => memberHasSurface(HYBRID, s, d.id)).map((d) => d.id);

describe("Sales team — locked", () => {
  it("grants exactly the signed-off list", () => {
    expect([...effective(sales())].sort()).toEqual([...SALES_FINAL].sort());
  });

  it("can award an indent to a supplier", () => {
    expect(memberHasSurface(HYBRID, sales(), "tripops.indents.award")).toBe(true);
  });

  it("every Sales toggle is enforced somewhere in the app", () => {
    const roots = ["app", "features", "components", "lib", "contexts"];
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__" && entry.name !== "node_modules") walk(p);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && p !== path.join("lib", "memberSurfaces.ts")) {
          sources.push(fs.readFileSync(p, "utf8"));
        }
      }
    };
    roots.forEach(walk);
    const unwired = SALES_FINAL.filter(
      (id) => !INDIRECT.has(id) && !sources.some((src) => src.includes(`"${id}"`) || src.includes(`'${id}'`)),
    );
    expect(unwired).toEqual([]);
  });

  it("switching one toggle off only removes it and what depends on it", () => {
    const base = sales();
    const before = new Set(effective(base));
    for (const id of SALES_FINAL) {
      const after = new Set(effective(applySurfaceToggle(base, id, false, HYBRID)));
      const removed = [...before].filter((x) => !after.has(x));
      const byId = new Map(MEMBER_SURFACE_CATALOG.map((d) => [d.id, d]));
      const dependsOn = (child: MemberSurfaceId): boolean => {
        let cur = byId.get(child)?.requires;
        while (cur) {
          if (cur === id) return true;
          cur = byId.get(cur)?.requires;
        }
        return false;
      };
      const collateral = removed.filter((x) => x !== id && !dependsOn(x));
      expect({ id, collateral }).toEqual({ id, collateral: [] });
      // And it comes back cleanly.
      const restored = new Set(effective(applySurfaceToggle(applySurfaceToggle(base, id, false, HYBRID), id, true, HYBRID)));
      expect(restored.has(id)).toBe(true);
    }
  });
});
