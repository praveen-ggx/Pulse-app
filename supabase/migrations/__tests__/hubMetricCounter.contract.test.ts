import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const MIGRATIONS = join(__dirname, "..");

function migrationSql(): string {
  const names = readdirSync(MIGRATIONS).filter((name) =>
    name.endsWith("_hub_metric_counter.sql"),
  );
  expect(names).toEqual(["20271111164000_hub_metric_counter.sql"]);
  return readFileSync(join(MIGRATIONS, names[0]), "utf8");
}

function functionBodies(sql: string): string[] {
  return sql
    .split(/CREATE (?:OR REPLACE )?FUNCTION/i)
    .slice(1)
    .map((body) => body.split(/\$\$;\s*$/m)[0] ?? body);
}

describe("hub metric counter migration", () => {
  const sql = migrationSql();
  const bodies = functionBodies(sql);

  it("creates the projection disabled and does not enable it", () => {
    expect(sql).toMatch(/CREATE TRIGGER zzz_hub_project/);
    expect(sql).toMatch(/DISABLE TRIGGER zzz_hub_project/);
    expect(sql).not.toMatch(/ENABLE TRIGGER/);
  });

  it("places stripes with immutable md5 and keeps that placement in reconciliation", () => {
    expect(sql).toMatch(/CREATE FUNCTION public\.hub_metric_stripe[\s\S]*IMMUTABLE/);
    expect(sql).toMatch(/RETURNS smallint/);
    expect(sql).toMatch(/stripe smallint NOT NULL/);
    expect(sql).toMatch(/md5\(p_trip_id::text\)/);
    expect(sql).toMatch(/% 16/);
    expect(sql).not.toMatch(/hashtext/i);
    expect(sql).toMatch(/public\.hub_metric_stripe\(t\.id\)/);
    expect(sql).toMatch(/ON CONFLICT \(organization_id, bucket, stripe\)/);
    expect(sql).toMatch(/generate_series\(0, 15\)/);
    expect(sql).not.toMatch(/CASE WHEN s = 0/i);
    expect(sql).not.toMatch(/stripe = 0/);
    expect(sql).toMatch(/ORDER BY organization_id/);
    expect(sql).toMatch(/FROM public\.organizations o/);
    expect(sql).toMatch(/s\.linked_organization_id/);
  });

  it("keeps the frozen contribution rules", () => {
    expect(sql).toMatch(/tr\.deleted_at IS NULL/);
    expect(sql).toMatch(/tr\.indent_id IS NOT NULL/);
    expect(sql).toMatch(/m\.source = 'mover_asset'/);
    expect(sql).toMatch(/m\.source_indent_id = tr\.indent_id/);
    expect(sql).toMatch(/'history'/);
    expect(sql).not.toMatch(/trip_documents/);
    expect(sql).not.toMatch(/delivered_docs_pending/);
  });

  it("swallows only the named projection failures", () => {
    expect(sql).toMatch(/ERRCODE = 'P0H01'/);
    expect(sql).toMatch(/SQLSTATE 'P0H01'/);
    expect(sql).toMatch(/lock_not_available/);
    expect(sql).toMatch(/deadlock_detected/);
    expect(sql).toMatch(/check_violation/);
    expect(sql).not.toMatch(/P0001/);
    expect(sql).not.toMatch(/WHEN OTHERS/);
    for (const body of bodies) {
      expect(body).not.toMatch(/lock_timeout/);
    }
    expect(sql).toMatch(/SQLSTATE '57014'/);
    expect(sql).toMatch(/SQLSTATE '57P01'/);
    expect(sql).toMatch(/SQLSTATE '57P02'/);
    expect(sql).toMatch(/SQLSTATE '57P03'/);
  });

  it("leaves the scan RPC and the mover function untouched", () => {
    expect(sql).not.toMatch(/count_org_hub_metrics/);
    expect(sql).not.toMatch(/fn_sync_mover_asset_trip_status/);
  });

  it("publishes an unread counter RPC that refuses ground-ops and sourcing", () => {
    expect(sql).toMatch(/CREATE FUNCTION public\.get_org_hub_metrics_counter\(p_org_id uuid\)/);
    expect(sql).toMatch(/public\.is_org_member\(p_org_id\)/);
    expect(sql).toMatch(/AND COALESCE\(om\.permissions ->> 'platformRole', ''\) IN \('ground_ops', 'sourcing'\)/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_org_hub_metrics_counter\(uuid\) TO authenticated, service_role/,
    );
    expect(sql).toMatch(/get_org_hub_metrics_counter\(uuid\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/hub_reconcile_metric_counters\(\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/hub_org_metric_oracle\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).not.toMatch(/get_org_hub_metrics_counter\(uuid\) TO anon/);
    const rpc = sql.split("CREATE FUNCTION public.get_org_hub_metrics_counter")[1] ?? "";
    expect(rpc).toMatch(/FROM public\.hub_metric_counter/);
    expect(rpc).not.toMatch(/FROM public\.trips/);
    expect(sql).toMatch(/CREATE FUNCTION public\.hub_org_metric_oracle\(p_org uuid\)/);
    expect(sql).toMatch(/CROSS JOIN LATERAL public\.hub_metric_contrib\(t\)/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.hub_org_metric_oracle\(uuid\) TO service_role/);
    expect(sql).not.toMatch(/hub_org_metric_oracle\(uuid\) TO authenticated/);
  });

  it("starts DDL with a bounded lock wait and enables RLS on both tables", () => {
    expect(sql.trimStart().startsWith("--")).toBe(true);
    expect(sql).toMatch(/SET LOCAL lock_timeout = '5s';/);
    expect(sql).toMatch(/ALTER TABLE public\.hub_metric_counter ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.hub_metric_fault ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.hub_metric_counter FROM PUBLIC, anon, authenticated/);
  });

  it("names the projection after every other trips AFTER trigger", () => {
    const events: { at: number; name: string; kind: "drop" | "before" | "after" }[] = [];
    const drop = /DROP TRIGGER IF EXISTS\s+(\w+)\s+ON\s+(?:public\.)?trips/gi;
    const create = /CREATE(?: OR REPLACE)? TRIGGER\s+(\w+)\s+(BEFORE|AFTER)\b([\s\S]*?)EXECUTE (?:FUNCTION|PROCEDURE)/gi;
    for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
      const text = readFileSync(join(MIGRATIONS, file), "utf8");
      const found: { at: number; name: string; kind: "drop" | "before" | "after" }[] = [];
      for (const match of text.matchAll(drop)) found.push({ at: match.index ?? 0, name: match[1], kind: "drop" });
      for (const match of text.matchAll(create)) {
        if (!/\bON\s+(?:public\.)?trips\b/i.test(match[3])) continue;
        found.push({
          at: match.index ?? 0,
          name: match[1],
          kind: match[2].toUpperCase() === "AFTER" ? "after" : "before",
        });
      }
      found.sort((a, b) => a.at - b.at);
      events.push(...found);
    }
    const after = new Set<string>();
    for (const event of events) {
      if (event.kind === "drop" || event.kind === "before") after.delete(event.name);
      else after.add(event.name);
    }
    const ordered = [...after].sort();
    expect(ordered[ordered.length - 1]).toBe("zzz_hub_project");
  });
});
