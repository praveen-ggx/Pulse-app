import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20271012181500_trip_document_client_linked_org_access.sql"),
  "utf8",
);

describe("trip document client-linked access migration", () => {
  it("grants client access only through a non-null linked organization", () => {
    expect(sql).toContain("c.linked_organization_id IS NOT NULL");
    expect(sql).not.toContain("c.organization_id");
    expect(sql).toContain("s.linked_organization_id IS NOT NULL");
    expect(sql).toContain("d.user_id = (SELECT auth.uid())");
  });

  it("does not treat read access as update access", () => {
    expect(sql).toContain("USING (public.can_write_trip_document_as_counterparty(trip_id))");
    expect(sql).toContain("WITH CHECK (public.can_write_trip_document_as_counterparty(trip_id))");
    expect(sql).not.toContain("can_read_trip_document(trip_id)");
  });

  it("revokes anonymous execute on the batch reader and the new helpers", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.get_trip_documents_lr_pod_batch(uuid[]) FROM PUBLIC, anon;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.can_write_trip_document_as_counterparty(uuid) FROM PUBLIC, anon;",
    );
    expect(sql).not.toContain("storage.objects");
  });

  it("excludes ground ops from the manager column bypass", () => {
    expect(sql).toContain("COALESCE(om.permissions ->> 'platformRole', '') <> 'ground_ops'");
    expect(sql).toContain("has_member_surface(v_org, 'trip_compliance.documents.verify')");
  });

  it("requires a file replacement before a non-manager can change status", () => {
    expect(sql).toContain("NEW.status IS DISTINCT FROM OLD.status AND NOT v_file_replaced");
    expect(sql).toContain("NEW.verified_by IS NULL");
    expect(sql).toContain("NEW.verified_at IS NULL");
    expect(sql).toContain("NEW.rejection_reason IS NULL");
    expect(sql).toContain("document_number stays editable");
  });

  it("requires managers to clear verification metadata when demoting to pending", () => {
    const guard = sql.slice(sql.indexOf("Demotion to pending"));
    expect(guard).toContain("NEW.status = 'pending'");
    expect(guard).toContain("NEW.verified_by IS NOT NULL");
    expect(guard).toContain("NEW.verified_at IS NOT NULL");
    expect(guard).toContain("NEW.rejection_reason IS NOT NULL");
    expect(guard.indexOf("not authorized to change document status without clearing verification")).toBeLessThan(
      guard.indexOf("IF v_manager OR v_verifier THEN"),
    );
  });
});
