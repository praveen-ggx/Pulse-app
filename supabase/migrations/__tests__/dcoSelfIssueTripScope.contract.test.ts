import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * Static contract for 20271102183000 (issue_dco_self_receivable trip scope).
 * Live behaviour, including concurrency, is covered by
 * supabase/tests/dco_self_receivable/issue_trip_scope_guards.sql.
 */
const MIGRATIONS = join(__dirname, "..");
const FIX = "20271102183000_dco_self_issue_trip_scope.sql";
const BOOK = "20271102003100_dco_self_financial_book.sql";
const SQL = readFileSync(join(MIGRATIONS, FIX), "utf8");

function issueBody(sql: string): string {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.issue_dco_self_receivable(");
  if (start < 0) throw new Error("issue_dco_self_receivable not found");
  const end = sql.indexOf("\n$$;", start);
  return sql.slice(start, end);
}

function signature(body: string): string {
  return body.slice(0, body.indexOf("RETURNS")).replace(/\s+/g, " ").trim();
}

const BODY = issueBody(SQL);

describe("issue trip scope: forward-only", () => {
  it("sorts after the book migration it replaces a function from", () => {
    expect(FIX.slice(0, 14) > BOOK.slice(0, 14)).toBe(true);
    expect(FIX.slice(8, 14)).not.toBe("000000");
  });

  it("is the last definition of issue_dco_self_receivable", () => {
    const definers = readdirSync(MIGRATIONS)
      .filter((f) => /^\d{14}_.*\.sql$/.test(f))
      .filter((f) => readFileSync(join(MIGRATIONS, f), "utf8").includes("FUNCTION public.issue_dco_self_receivable("))
      .sort();
    expect(definers[definers.length - 1]).toBe(FIX);
  });

  it("keeps the signature, parameter names, grants and response keys", () => {
    const original = issueBody(readFileSync(join(MIGRATIONS, BOOK), "utf8"));
    expect(signature(BODY)).toBe(signature(original));
    expect(BODY).toContain("SECURITY DEFINER");
    expect(BODY).toContain("SET search_path TO public, pg_temp");
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.issue_dco_self_receivable(uuid, numeric, text, uuid, text) FROM PUBLIC, anon;",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.issue_dco_self_receivable(uuid, numeric, text, uuid, text) TO authenticated;",
    );
    expect(SQL).not.toMatch(/GRANT[^;]*TO anon/i);
    for (const key of ["'ok'", "'id'", "'replayed'", "'status'", "'billed_amount'", "'billed_version'"]) {
      expect(BODY).toContain(key);
    }
  });

  it("does not rewrite, void or delete existing receivables", () => {
    const outsideFunction = SQL.replace(BODY, "");
    expect(outsideFunction).not.toMatch(/\b(UPDATE|DELETE FROM|TRUNCATE)\b/i);
    expect(SQL).not.toMatch(/DROP (TABLE|INDEX|FUNCTION)/i);
  });

  it("keeps caller, eligibility, workspace, party and billed checks", () => {
    expect(BODY).toContain("v_uid uuid := auth.uid();");
    expect(BODY).toContain("IF NOT public.is_dco_eligible(v_uid) THEN");
    expect(BODY).toContain("v_ws := public.dco_self_workspace_id(v_uid);");
    expect(BODY).toContain("v_party.workspace_id IS DISTINCT FROM v_ws");
    expect(BODY).toMatch(/IF v_billed <= 0 THEN\s+RAISE EXCEPTION 'dco_self_billed_required'/);
  });
});

describe("issue trip scope: trip authorization", () => {
  const tripBlock = BODY.slice(BODY.indexOf("IF p_trip_id IS NOT NULL THEN"), BODY.indexOf("INSERT INTO public.dco_self_receivables"));

  it("rejects deleted trips and does not reveal whether a trip exists", () => {
    expect(tripBlock).toMatch(/WHERE id = p_trip_id\s+AND deleted_at IS NULL;/);
    expect(BODY).not.toContain("dco_self_trip_not_found");
  });

  it("keeps marketplace trips on Exchange", () => {
    expect(tripBlock).toContain("= 'market_bid'");
    expect(tripBlock).toContain("dco_self_marketplace_denied");
  });

  it("outside the Self workspace requires a DCO operating trip the caller drives", () => {
    const outside = tripBlock.indexOf("IF v_trip.organization_id IS DISTINCT FROM v_ws THEN");
    const mode = tripBlock.indexOf("IF v_trip.operating_mode IS DISTINCT FROM 'DCO' THEN");
    const driver = tripBlock.indexOf("WHERE d.id = v_trip.driver_id\n          AND d.user_id = v_uid");
    expect(outside).toBeGreaterThan(-1);
    expect(mode).toBeGreaterThan(outside);
    expect(driver).toBeGreaterThan(mode);
    expect(tripBlock).toContain("dco_self_fleet_trip_denied");
    expect(tripBlock).toContain("dco_self_trip_denied");
  });

  it("checks the trip before any row is written", () => {
    expect(BODY.indexOf("IF p_trip_id IS NOT NULL THEN")).toBeLessThan(
      BODY.indexOf("INSERT INTO public.dco_self_receivables"),
    );
  });
});

describe("issue trip scope: one active receivable per trip", () => {
  it("adds a partial unique index that excludes void rows", () => {
    expect(SQL).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS dco_self_receivables_active_trip_uidx\s+ON public\.dco_self_receivables \(operational_trip_id\)\s+WHERE operational_trip_id IS NOT NULL AND status <> 'void';/,
    );
  });

  it("stops on existing duplicates before building the index", () => {
    const guard = SQL.indexOf("dco_self_active_trip_duplicates");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(SQL.indexOf("CREATE UNIQUE INDEX"));
  });

  it("replays the same key before the trip-duplicate check", () => {
    expect(BODY.indexOf("WHERE idempotency_key = v_key;")).toBeLessThan(
      BODY.indexOf("RAISE EXCEPTION 'dco_self_trip_already_issued'"),
    );
  });

  it("handles unique violations by constraint and re-raises anything else", () => {
    const handler = BODY.slice(BODY.indexOf("WHEN unique_violation THEN"));
    expect(handler).toContain("GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;");
    expect(handler).toContain("v_constraint = 'dco_self_receivables_idempotency_key'");
    expect(handler).toContain("v_existing.workspace_id IS NOT DISTINCT FROM v_ws");
    expect(handler).toContain("v_constraint = 'dco_self_receivables_active_trip_uidx'");
    expect(handler).toContain("RAISE EXCEPTION 'dco_self_trip_already_issued'");
    expect(handler.trimEnd()).toMatch(/RAISE;\s*END;$/);
  });
});
