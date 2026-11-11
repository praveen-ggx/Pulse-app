/**
 * Postgres rejects any function call with more than 100 arguments (54023).
 * Inside PL/pgSQL the statement is only parsed when it runs, so CREATE
 * FUNCTION succeeds and the failure shows up on every call in production.
 * 20271104142208 shipped a 104-argument jsonb_build_object this way and broke
 * get_trip_detail_bundle until 20261110113008 split it.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(__dirname, "..");
const PG_MAX_FUNCTION_ARGS = 100;

/** Superseded definitions that are already applied and must not be edited. */
const KNOWN_SUPERSEDED = new Set(["20271104142208_get_trip_detail_bundle_operational_codes.sql"]);

const CALL = /\b(jsonb?_build_object|json_build_object|jsonb?_build_array|concat_ws|concat|format)\s*\(/gi;

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

export function oversizedCalls(sql: string): Array<{ fn: string; args: number }> {
  const s = stripComments(sql);
  const out: Array<{ fn: string; args: number }> = [];
  for (const m of s.matchAll(CALL)) {
    let i = (m.index ?? 0) + m[0].length;
    let depth = 1;
    let args = 1;
    let quoted = false;
    while (depth > 0 && i < s.length) {
      const c = s[i];
      if (c === "'") quoted = !quoted;
      else if (!quoted) {
        if (c === "(") depth += 1;
        else if (c === ")") depth -= 1;
        else if (c === "," && depth === 1) args += 1;
      }
      i += 1;
    }
    if (args > PG_MAX_FUNCTION_ARGS) out.push({ fn: m[1], args });
  }
  return out;
}

describe("migration function-call argument limit", () => {
  it("detects a call over the limit", () => {
    const pairs = Array.from({ length: 51 }, (_, k) => `'k${k}', ${k}`).join(", ");
    expect(oversizedCalls(`select jsonb_build_object(${pairs});`)).toEqual([
      { fn: "jsonb_build_object", args: 102 },
    ]);
  });

  it("no migration passes more than 100 arguments to one function call", () => {
    const offenders = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && !KNOWN_SUPERSEDED.has(f))
      .flatMap((f) =>
        oversizedCalls(readFileSync(join(MIGRATIONS_DIR, f), "utf8")).map((c) => `${f}: ${c.fn}(${c.args} args)`),
      );
    expect(offenders).toEqual([]);
  });

  it("the hotfix keeps every get_trip_detail_bundle trip key", () => {
    const keys = (sql: string) =>
      new Set(
        [...stripComments(sql).matchAll(/'([a-z_]+)',\s+/g)].map((m) => m[1]),
      );
    const before = keys(
      readFileSync(join(MIGRATIONS_DIR, "20271104142208_get_trip_detail_bundle_operational_codes.sql"), "utf8"),
    );
    const after = keys(readFileSync(join(MIGRATIONS_DIR, "20261110113008_fix_trip_detail_bundle_arg_limit.sql"), "utf8"));
    expect([...before].filter((k) => !after.has(k))).toEqual([]);
  });
});
