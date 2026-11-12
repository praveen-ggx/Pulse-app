/**
 * Contract test for migration 20261112061609_compliance_vehicle_vault_by_plate.
 *
 * Verifies the RPC signature, return columns, security properties and
 * authorization model match what the service layer expects.
 */
import * as fs from "fs";
import * as path from "path";

const MIGRATION_FILE = "supabase/migrations/20261112061609_compliance_vehicle_vault_by_plate.sql";

let sql: string;
beforeAll(() => {
  sql = fs.readFileSync(path.resolve(MIGRATION_FILE), "utf-8");
});

describe("get_compliance_vehicle_vault_by_plate RPC contract", () => {
  it("exists and is CREATE OR REPLACE FUNCTION", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION\s+public\.get_compliance_vehicle_vault_by_plate/i);
  });

  it("accepts (uuid, uuid[]) — viewer org + trip ids", () => {
    expect(sql).toMatch(/p_viewer_org_id\s+uuid/);
    expect(sql).toMatch(/p_trip_ids\s+uuid\[\]/);
  });

  it("returns (trip_id, vehicle_id, vehicle_number, documents) — same shape as vault RPC", () => {
    expect(sql).toMatch(/trip_id\s+uuid/);
    expect(sql).toMatch(/vehicle_id\s+uuid/);
    expect(sql).toMatch(/vehicle_number\s+text/);
    expect(sql).toMatch(/documents\s+jsonb/);
  });

  it("is SECURITY DEFINER with safe search_path", () => {
    expect(sql).toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/SET search_path\s*=\s*''/i);
  });

  it("is STABLE (read-only, no side effects)", () => {
    expect(sql).toMatch(/STABLE/i);
  });

  it("authorizes via private.compliance_visible_trips", () => {
    expect(sql).toMatch(/private\.compliance_visible_trips\s*\(\s*p_viewer_org_id/);
  });

  it("filters trips to vehicle_id IS NULL with a non-empty plate", () => {
    expect(sql).toMatch(/tr\.vehicle_id IS NULL/i);
    expect(sql).toMatch(/tr\.vehicle_display_number IS NOT NULL/i);
  });

  it("resolves vehicle org via supplier.linked_organization_id — not arbitrary cross-org", () => {
    expect(sql).toMatch(/s\.linked_organization_id/);
    expect(sql).toMatch(/v\.organization_id\s*=\s*so\.vehicle_org_id/i);
  });

  it("normalizes plate: uppercase + strip non-alphanumeric", () => {
    expect(sql).toMatch(/upper\(regexp_replace\(tr\.vehicle_display_number/);
    expect(sql).toMatch(/upper\(regexp_replace\(v\.vehicle_number/);
    expect(sql).toContain("[^A-Za-z0-9]");
  });

  it("excludes deleted vehicles", () => {
    expect(sql).toMatch(/v\.deleted_at IS NULL/i);
  });

  it("returns exactly one vehicle per trip via DISTINCT ON", () => {
    expect(sql).toMatch(/DISTINCT ON\s*\(\s*so\.trip_id\s*\)/i);
  });

  it("prefers newest vehicle with deterministic tie-breaker", () => {
    expect(sql).toMatch(/ORDER BY\s+so\.trip_id\s*,\s*v\.created_at\s+DESC\s*,\s*v\.id\s+DESC/i);
  });

  it("enforces max 1000 trip ids", () => {
    expect(sql).toMatch(/cardinality\(p_trip_ids\)\s*>\s*1000/);
    expect(sql).toMatch(/ERRCODE\s*=\s*'22023'/);
  });

  it("revokes from PUBLIC and anon, grants to authenticated and service_role", () => {
    expect(sql).toMatch(/REVOKE ALL.*FROM PUBLIC/i);
    expect(sql).toMatch(/REVOKE ALL.*FROM anon/i);
    expect(sql).toMatch(/GRANT EXECUTE.*TO authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE.*TO service_role/i);
  });

  it("does NOT contain service_role access patterns in the function body", () => {
    const bodyMatch = sql.match(/AS \$\$([\s\S]*?)\$\$/);
    expect(bodyMatch).toBeTruthy();
    const body = bodyMatch![1];
    expect(body).not.toMatch(/service_role/i);
    expect(body).not.toMatch(/supabase_admin/i);
  });

  it("uses fully qualified table references", () => {
    const bodyMatch = sql.match(/AS \$\$([\s\S]*?)\$\$/);
    const body = bodyMatch![1];
    expect(body).toMatch(/public\.trips/);
    expect(body).toMatch(/public\.suppliers/);
    expect(body).toMatch(/public\.vehicles/);
    expect(body).toMatch(/private\.compliance_visible_trips/);
  });
});

describe("service integration contract", () => {
  it("callBatchRpc accepts the new RPC name", () => {
    const factsService = fs.readFileSync(
      path.resolve("features/tripCompliance/services/complianceListFacts.service.ts"),
      "utf-8",
    );
    expect(factsService).toContain('"get_compliance_vehicle_vault_by_plate"');
    expect(factsService).toContain("fetchComplianceVehicleVaultByPlate");
  });

  it("plate fallback in tripComplianceRead uses the RPC, not direct .from('vehicles')", () => {
    const readService = fs.readFileSync(
      path.resolve("features/tripCompliance/services/tripComplianceRead.service.ts"),
      "utf-8",
    );
    expect(readService).toContain("fetchComplianceVehicleVaultByPlate");
    const plateFallbackSection = readService.slice(
      readService.indexOf("tripsNeedingVaultPlateFallback"),
      readService.indexOf("return byKey;", readService.indexOf("tripsNeedingVaultPlateFallback")),
    );
    expect(plateFallbackSection).not.toContain('.from("vehicles")');
    expect(plateFallbackSection).not.toContain(".in(");
  });
});
