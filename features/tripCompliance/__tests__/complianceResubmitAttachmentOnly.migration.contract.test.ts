/**
 * Static contract for 20271029223000_compliance_resubmit_attachment_only.sql.
 * Not a database test — nothing here is applied to any project.
 */
import { readFileSync } from "fs";
import { join } from "path";

const NAME = "20271029223000_compliance_resubmit_attachment_only.sql";
const sql = readFileSync(join(process.cwd(), "supabase/migrations", NAME), "utf8")
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n");

function body(fn: string): string {
  const start = sql.indexOf(`function public.${fn}(`);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf("$$;", start));
}

describe("compliance resubmit attachment-only migration", () => {
  it("sorts after flow hardening and is not a midnight version", () => {
    expect(NAME > "20271008117000_compliance_flow_hardening.sql").toBe(true);
    expect(NAME > "20271029174500_entity_documents_audit_insert_metadata.sql").toBe(true);
    expect(NAME.slice(8, 14)).not.toBe("000000");
  });

  it("keeps trip storage checks and vehicle types, without calendar expiry gates", () => {
    const files = body("compliance_missing_required_files");
    expect(files).toContain("storage.objects");
    expect(files).toContain("'trip-documents'");
    expect(files).toContain("array['rc', 'insurance', 'fitness']");
    expect(files).toContain("driver_kyc_documents");
    expect(files).toContain("not in ('rejected', 'replaced')");
    expect(files).not.toContain("expiry_date >= current_date");
    expect(files).not.toContain("expiryDate");
    expect(files).not.toContain("current_date");
  });
});
