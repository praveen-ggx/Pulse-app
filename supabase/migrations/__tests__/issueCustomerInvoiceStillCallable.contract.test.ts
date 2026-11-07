/**
 * The deployed app (V1.0.1, 67490624) issues invoices through
 * public.issue_customer_invoice. No migration in this tree may leave that function
 * uncallable for `authenticated` (revoked, or dropped without being re-created) until an app build that uses
 * issue_customer_invoice_v2 is live — see docs/runbooks/finance-migration-order.md.
 * When that release is approved, this test is updated in the same change.
 *
 * Replays REVOKE / GRANT / DROP statements on the function in migration order.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const dir = join(__dirname, "..");

function statements(): { file: string; sql: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((file) =>
      readFileSync(join(dir, file), "utf8")
        .replace(/--[^\n]*/g, "")
        .split(";")
        .map((sql) => ({ file, sql: sql.replace(/\s+/g, " ").trim() }))
        .filter(({ sql }) => /issue_customer_invoice\s*\(/i.test(sql) && !/issue_customer_invoice_v2/i.test(sql)),
    );
}

describe("issue_customer_invoice stays callable for the deployed app", () => {
  it("authenticated still holds EXECUTE after all migrations, replayed in order", () => {
    let granted = false;
    const history: string[] = [];
    for (const { file, sql } of statements()) {
      if (/^DROP FUNCTION/i.test(sql)) {
        // Historical signature changes drop and re-create; only a drop that is not
        // followed by a CREATE leaves the function missing.
        granted = false;
        history.push(`${file}: drop`);
      }
      if (/^CREATE( OR REPLACE)? FUNCTION/i.test(sql)) {
        // Supabase default privileges grant EXECUTE to authenticated on new functions.
        granted = true;
      }
      const revoke = /^REVOKE .* ON FUNCTION .* FROM (.+)$/i.exec(sql);
      if (revoke && /\bauthenticated\b/i.test(revoke[1]!)) {
        granted = false;
        history.push(`${file}: revoke from ${revoke[1]}`);
      }
      const grant = /^GRANT .* ON FUNCTION .* TO (.+)$/i.exec(sql);
      if (grant && /\bauthenticated\b/i.test(grant[1]!)) {
        granted = true;
        history.push(`${file}: grant to ${grant[1]}`);
      }
    }
    expect({ granted, last: history.slice(-3) }).toMatchObject({ granted: true });
  });

  it("would catch the retirement migration from the invoice-completeness work", () => {
    const retire =
      "REVOKE EXECUTE ON FUNCTION public.issue_customer_invoice( uuid, uuid, text, uuid[], numeric, numeric, numeric, numeric, numeric, numeric, text, date, date, uuid, uuid, text ) FROM PUBLIC, anon, authenticated";
    const revoke = /^REVOKE .* ON FUNCTION .* FROM (.+)$/i.exec(retire);
    expect(revoke && /\bauthenticated\b/i.test(revoke[1]!)).toBe(true);
  });
});
