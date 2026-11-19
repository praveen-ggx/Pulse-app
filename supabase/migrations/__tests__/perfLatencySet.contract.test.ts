/**
 * perf-latency-2026-11-16: checksums, and the structure the equivalence proofs
 * (supabase/tests/trip_documents_batch_read, supabase/tests/hub_keyset_rows) rely on.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..");
const SET = path.join(__dirname, "../../release-sets/perf-latency-2026-11-16.versions");
const DOCS = "20271116100000_list_trip_documents_for_trips.sql";
const HUB = "20271116100100_hub_keyset_rows_without_counts.sql";
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

describe("perf-latency-2026-11-16 release set", () => {
  const text = fs.readFileSync(SET, "utf8");
  it("lists both versions in order with matching checksums", () => {
    expect([...text.matchAll(/^(\d{14})$/gm)].map((m) => m[1])).toEqual(["20271116100000", "20271116100100"]);
    for (const [, hash, file] of text.matchAll(/^# sha256 ([a-f0-9]{64})\s+(\S+)$/gm)) {
      expect(crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex")).toBe(hash);
    }
  });
});

/** SQL without `--` comments, so prose in headers cannot satisfy or break a check. */
const code = (f: string) => read(f).replace(/--[^\n]*/g, "");

describe("list_trip_documents_for_trips", () => {
  const sql = code(DOCS);
  it("applies both permissive trip policies and every branch of the receipt restriction", () => {
    expect(sql).toContain("public.can_read_trip_document(r.id)");
    expect(sql).toMatch(/om\.role = ANY \(ARRAY\['owner', 'admin', 'member', 'dispatcher', 'finance'\]\)/);
    for (const t of ["trip_fuel_entries", "trip_toll_entries", "trip_other_expenses"]) expect(sql).toContain(`public.${t} e`);
    expect(sql).toContain("d.uploaded_by = v_uid");
    // The invoker-rights helper must not be called from definer context.
    expect(sql).not.toMatch(/_can_read_trip_expense_receipt\s*\(/);
  });
  it("is never executable by anon", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.list_trip_documents_for_trips\(uuid\[\], uuid, integer\) FROM PUBLIC, anon;/);
    expect(sql).not.toMatch(/GRANT[^;]*list_trip_documents_for_trips[^;]*\banon\b/);
  });
});

describe("hub keyset rows", () => {
  const sql = code(HUB);
  const created = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)].map((m) => m[1]);
  it("defines the body once, in the impl, with counts behind p_with_counts", () => {
    expect(created).toEqual(["_list_org_hub_trips_keyset_impl", "list_org_hub_trips_keyset", "list_org_hub_trips_keyset_rows"]);
    expect(sql.match(/IF p_with_counts THEN/g)).toHaveLength(1);
    expect(sql).toContain("SELECT public._list_org_hub_trips_keyset_impl(p_org_id, p_limit, p_before_created_at, p_before_id, p_from, p_to, p_bucket, p_side, p_supplier_id, p_supplier_name, p_vehicle_id, p_vehicle_norm, p_supply, p_attributed, p_client_id, p_driver_id, p_payment, p_load_type, p_compliance, true);");
    expect(sql).toContain("p_compliance, false);");
  });
  it("keeps the public signature and keeps the impl away from clients", () => {
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.list_org_hub_trips_keyset(uuid, integer, timestamptz, uuid, date, date, text, text, uuid, text, uuid, text, text, text, uuid, uuid, text, text, boolean) TO authenticated, service_role;");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\._list_org_hub_trips_keyset_impl\([^)]*\) FROM PUBLIC, anon, authenticated;/);
  });
  it("is the last migration that defines the hub list (later changes go into the impl)", () => {
    const later = fs.readdirSync(ROOT).filter((f) => /^\d{14}_.+\.sql$/.test(f) && f > HUB);
    for (const f of later) {
      expect(read(f)).not.toMatch(/CREATE OR REPLACE FUNCTION public\.list_org_hub_trips_keyset\s*\(/i);
    }
  });
});
