import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const indexSql = fs.readFileSync(
  path.join(migrations, "20271114185200_indent_lane_index_without_revoked_pool_key.sql"),
  "utf8",
);
const poolKeySql = fs.readFileSync(
  path.join(migrations, "20271006181500_pooled_marketplace_manifests_and_sponsored_classifier.sql"),
  "utf8",
);
const laneOffersSql = fs.readFileSync(
  path.join(migrations, "20271113091500_lane_offers_for_indent.sql"),
  "utf8",
);

const TRIM =
  String.raw`E' \t\n\u000B\f\r\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF'`;

describe("indent lane index does not call revoked _pool_key", () => {
  it("bounds lock waits and replaces the live indent index", () => {
    const lock = indexSql.indexOf("SET LOCAL lock_timeout = '5s';");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(indexSql.indexOf("CREATE "));
    expect(indexSql).toContain("DROP INDEX IF EXISTS public.indents_org_pool_key_live_idx;");
    expect(indexSql).toContain(
      "public.standing_lane_key(pickup_area, drop_location, vehicle_type)",
    );
    expect(indexSql).not.toContain("public._pool_key(");
  });

  it("keeps _pool_key revoked and grants only the inlined lane key", () => {
    expect(poolKeySql).toContain(
      "REVOKE ALL ON FUNCTION public._pool_key(text, text, text) FROM PUBLIC, anon, authenticated;",
    );
    expect(indexSql).toContain(
      "REVOKE ALL ON FUNCTION public.standing_lane_key(text, text, text) FROM PUBLIC, anon;",
    );
    expect(indexSql).toContain(
      "GRANT EXECUTE ON FUNCTION public.standing_lane_key(text, text, text) TO authenticated, service_role;",
    );
    expect(indexSql).not.toContain("GRANT EXECUTE ON FUNCTION public._pool_key");
    expect(indexSql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.standing_lane_key[\s\S]*\banon\b/);
  });

  it("uses the same trim set as _pool_key_part and still returns null for a blank part", () => {
    expect(poolKeySql).toContain(TRIM);
    expect(indexSql.match(new RegExp(TRIM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBe(3);
    expect(indexSql).toContain("WHEN k.pickup = '' OR k.drop = '' OR k.vehicle = '' THEN NULL");
  });

  it("explains the production index that still calls the revoked helper", () => {
    expect(laneOffersSql).toContain(
      "public._pool_key(pickup_area, drop_location, vehicle_type)",
    );
  });
});
