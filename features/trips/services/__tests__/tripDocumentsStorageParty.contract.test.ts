import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20271012203000_trip_documents_storage_party_access.sql"),
  "utf8",
);

describe("trip-documents storage party access", () => {
  it("drops the bucket-wide authenticated read and upload policies", () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Allow authenticated reads to trip-documents"');
    expect(sql).toContain('DROP POLICY IF EXISTS "Allow authenticated uploads to trip-documents"');
    expect(sql).toContain('DROP POLICY IF EXISTS "Suppliers can list storage folders"');
  });

  it("limits client and supplier access to a non-null linked organization", () => {
    expect(sql).toContain("c.linked_organization_id IS NOT NULL");
    expect(sql).toContain("s.linked_organization_id IS NOT NULL");
    expect(sql).not.toContain("c.organization_id");
  });

  it("keeps ground ops off insert unless the org toggle and warehouse match", () => {
    expect(sql).toContain("COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'");
    expect(sql).toContain("groundOpsDocUploadEnabled");
    expect(sql).toContain("organization_member_warehouses");
  });

  it("covers trip folders and trip chat folders, and revokes anonymous execute", () => {
    expect(sql).toContain("v_parts[1] = 'trip_chat'");
    expect(sql).toContain("trip_conversations");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.fn_trip_documents_storage_allowed(text, text, uuid) FROM PUBLIC, anon;",
    );
    expect(sql).toContain("NULLIF(btrim(owner_id::text), '')::uuid");
  });
});
