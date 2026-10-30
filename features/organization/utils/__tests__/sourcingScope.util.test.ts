import {
  indentInSourcingScope,
  sourcingClientIdsFromPermissions,
  sourcingScopeIsEmpty,
  tripInSourcingScope,
  type SourcingScope,
} from "@/features/organization/utils/sourcingScope.util";
import { buildMemberPermissions } from "@/features/organization/utils/teamInviteRoles.util";
import { defaultSurfacesForRole } from "@/lib/memberSurfaces";
import { getCapabilitiesFromProfile } from "@/lib/capabilities";

const scope = (
  clientIds: string[],
  warehouseIds: string[],
  indentIds: string[] = [],
): SourcingScope => ({
  clientIds: new Set(clientIds),
  warehouseIds: new Set(warehouseIds),
  indentIds: new Set(indentIds),
});

describe("Sourcing scope — indents", () => {
  const s = scope(["client-a"], ["wh-1"]);

  it("includes an indent of an assigned client, even with no warehouse", () => {
    expect(indentInSourcingScope(s, { id: "i1", client_id: "client-a", warehouse_id: null })).toBe(true);
  });

  it("includes an indent of an assigned warehouse of another client (union)", () => {
    expect(indentInSourcingScope(s, { id: "i2", client_id: "client-b", warehouse_id: "wh-1" })).toBe(true);
  });

  it("excludes other clients / warehouses and unlinked indents", () => {
    expect(indentInSourcingScope(s, { id: "i3", client_id: "client-b", warehouse_id: "wh-2" })).toBe(false);
    expect(indentInSourcingScope(s, { id: "i4", client_id: null, warehouse_id: null })).toBe(false);
  });

  it("nothing assigned → nothing in scope", () => {
    const empty = scope([], []);
    expect(sourcingScopeIsEmpty(empty)).toBe(true);
    expect(indentInSourcingScope(empty, { id: "i1", client_id: "client-a", warehouse_id: "wh-1" })).toBe(false);
  });
});

describe("Sourcing scope — trips", () => {
  const s = scope(["client-a"], ["wh-1"], ["ind-in"]);

  it("follows the trip's indent (active or source)", () => {
    expect(tripInSourcingScope(s, { indent_id: "ind-in", client_id: "client-z" })).toBe(true);
    expect(tripInSourcingScope(s, { indent_id: null, source_indent_id: "ind-in" })).toBe(true);
  });

  it("an out-of-scope indent hides the trip even when the client matches", () => {
    expect(tripInSourcingScope(s, { indent_id: "ind-out", client_id: "client-a" })).toBe(false);
  });

  it("a trip with no indent shows only for an assigned client", () => {
    expect(tripInSourcingScope(s, { indent_id: null, client_id: "client-a" })).toBe(true);
    expect(tripInSourcingScope(s, { indent_id: null, client_id: "client-b" })).toBe(false);
    expect(tripInSourcingScope(s, { indent_id: null, client_id: null })).toBe(false);
  });
});

describe("Sourcing scope — stored clients", () => {
  const HYBRID = getCapabilitiesFromProfile({ role: "user" }, "HYBRID");

  it("reads only string ids from permissions.clientIds", () => {
    expect(sourcingClientIdsFromPermissions({ clientIds: ["a", "", 3, "b"] })).toEqual(["a", "b"]);
    expect(sourcingClientIdsFromPermissions(null)).toEqual([]);
  });

  it("saves clientIds for Sourcing only, de-duplicated", () => {
    const sourcing = buildMemberPermissions({
      platformRole: "sourcing",
      surfaces: defaultSurfacesForRole("sourcing", HYBRID),
      orgCaps: HYBRID,
      clientIds: ["a", "a", "b"],
    });
    expect(sourcing.clientIds).toEqual(["a", "b"]);

    const sales = buildMemberPermissions({
      platformRole: "sales",
      surfaces: defaultSurfacesForRole("sales", HYBRID),
      orgCaps: HYBRID,
      clientIds: ["a"],
    });
    expect(sales.clientIds).toBeUndefined();
  });
});
