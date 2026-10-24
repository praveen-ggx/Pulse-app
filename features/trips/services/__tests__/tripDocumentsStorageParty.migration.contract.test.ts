import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION =
  "supabase/migrations/20271012203000_trip_documents_storage_party_access.sql";
const RELEASE = "supabase/release-sets/trip-documents-storage-party.versions";

const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");
const release = readFileSync(join(process.cwd(), RELEASE), "utf8");

describe("trip-documents storage party policies", () => {
  it("keeps the bucket private and does not disable RLS", () => {
    expect(sql).toMatch(/The bucket stays private/);
    expect(sql).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/ALTER TABLE storage\.objects DISABLE/i);
  });

  it("replaces bucket-wide authenticated SELECT/INSERT policies", () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Allow authenticated reads to trip-documents"/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Allow authenticated uploads to trip-documents"/);
    expect(sql).toMatch(/CREATE POLICY "trip-documents: party select"/);
    expect(sql).toMatch(/CREATE POLICY "trip-documents: party insert"/);
    expect(sql).toMatch(/bucket_id = 'trip-documents'/);
    expect(sql).toMatch(/fn_trip_documents_storage_allowed/);
  });

  it("denies storage work without a signed-in user", () => {
    expect(sql).toMatch(/IF v_uid IS NULL OR p_op NOT IN \('select', 'insert', 'update', 'delete'\) THEN/);
    expect(sql).toMatch(/RETURN false;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_trip_documents_storage_allowed/);
    expect(sql).toMatch(/TO authenticated/);
  });

  it("is the only version in its release set", () => {
    expect(release.trim()).toBe("20271012203000");
  });
});
