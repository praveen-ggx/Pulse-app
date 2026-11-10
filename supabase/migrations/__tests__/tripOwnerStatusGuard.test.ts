import fs from "fs";
import path from "path";

const file = path.join(
  __dirname,
  "../20261110023000_trip_owner_status_action_guard.sql",
);
const sql = fs.readFileSync(file, "utf8");

describe("trip owner status action guard", () => {
  it("uses a non-midnight timestamp after the simulate restore", () => {
    expect(path.basename(file).slice(0, 14) > "20261109144113").toBe(true);
    expect(path.basename(file).slice(8, 14)).not.toBe("000000");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(sql).not.toContain("20261106121132");
    expect(sql).not.toContain("20261109144113");
  });

  it("rejects delivered revoke and integrated cancel before the row is returned", () => {
    expect(sql).toContain("BEFORE UPDATE ON public.trips");
    expect(sql).toContain("trip_revoke_delivered_owner_only");
    expect(sql).toContain("trip_cancel_owner_only");
    expect(sql).toContain("trip_cancel_not_eligible");
    expect(sql).toContain("'completed', 'delivered', 'done'");
    expect(sql).toContain("OLD.indent_id IS NOT NULL");
    expect(sql).toContain("OLD.supplier_id IS NOT NULL");
    expect(sql).toContain("current_user IS DISTINCT FROM 'authenticated'");
  });

  it("does not treat simulate as owner-only and leaves the release set untouched", () => {
    expect(sql).not.toContain("ownerAdminOnly");
    expect(sql).not.toContain("tripops.trips.simulate");
    const set = fs.readFileSync(
      path.join(__dirname, "../../release-sets/prod-2026-11-10.versions"),
      "utf8",
    );
    expect(set).not.toContain("20261110023000");
    expect(set).toContain("20261109144113");
  });
});
