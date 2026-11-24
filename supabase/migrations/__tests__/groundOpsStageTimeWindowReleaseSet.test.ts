import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(
  migrations,
  "../release-sets/ground-ops-stage-time-window.versions",
);

// Ground Ops simulate stage time window (nihas V1.0.84). Replaces the
// function from 20271123101500, so it must sort after it.
const APPROVED = ["20271124104457"];

// Never applied to any database (Godrej test receipt migration).
const EXCLUDED = ["20271014184500"];

function parse() {
  const lines = fs.readFileSync(setFile, "utf8").split("\n").map((l) => l.trim());
  const versions: string[] = [];
  const sums = new Map<string, { sha: string; file: string }>();
  lines.forEach((line, i) => {
    if (line === "" || line.startsWith("#")) return;
    versions.push(line);
    const m = /^# sha256 ([0-9a-f]{64}) {2}(\S+\.sql)$/.exec(lines[i - 1] ?? "");
    if (m) sums.set(line, { sha: m[1], file: m[2] });
  });
  return { versions, sums };
}

describe("ground-ops-stage-time-window release set", () => {
  it("lists exactly the approved versions in ascending order", () => {
    const { versions } = parse();
    versions.forEach((v) => expect(v).toMatch(/^\d{14}$/));
    expect(versions).toEqual(APPROVED);
    expect([...versions].sort()).toEqual(versions);
  });

  it("never names an excluded or frozen version", () => {
    const body = fs.readFileSync(setFile, "utf8");
    for (const v of EXCLUDED) expect(body).not.toContain(v);
    const frozen = fs.readFileSync(
      path.join(migrations, "../release-sets/FROZEN.versions"),
      "utf8",
    );
    const { versions } = parse();
    for (const v of versions) expect(frozen).not.toContain(v);
  });

  it("pins each version to one migration file by SHA-256", () => {
    const { versions, sums } = parse();
    const all = fs.readdirSync(migrations);
    for (const v of versions) {
      const files = all.filter((f) => f.startsWith(`${v}_`) && f.endsWith(".sql"));
      expect(files).toHaveLength(1);
      const pinned = sums.get(v);
      expect(pinned?.file).toBe(files[0]);
      const actual = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(migrations, files[0])))
        .digest("hex");
      expect(actual).toBe(pinned?.sha);
    }
  });

  it("uses a real timestamp, never the sibling repo's 000000 slot", () => {
    for (const v of parse().versions) expect(v.endsWith("000000")).toBe(false);
  });
});

describe("20271124104457 ground ops stage time window", () => {
  const read = (name: string) => {
    const file = fs.readdirSync(migrations).find((f) => f.startsWith(`${name}_`))!;
    return fs.readFileSync(path.join(migrations, file), "utf8");
  };
  const next = read("20271124104457");
  const base = read("20271123101500");

  it("sorts after the migration whose function it replaces", () => {
    expect("20271124104457" > "20271123101500").toBe(true);
  });

  it("keeps every existing check of the base function unchanged", () => {
    const raises = (sql: string) =>
      sql.match(/RAISE EXCEPTION \$e\$[^$]+\$e\$/g)?.filter((r) => !/Stage time|Start Trip time/.test(r)) ?? [];
    expect(raises(next)).toEqual(raises(base));
    expect(raises(base).length).toBeGreaterThanOrEqual(6);
    for (const line of [
      "AND COALESCE(permissions ->> $e$platformRole$e$, $e$$e$) = $e$ground_ops$e$;",
      "v_missing := public.ground_ops_missing_mandatory_documents(p_trip_id, v_trip.organization_id);",
      "v_event_at := COALESCE(p_event_at, now());",
      "SECURITY DEFINER",
      "REVOKE ALL ON FUNCTION public.simulate_ground_ops_pickup_status(uuid, text, timestamptz) FROM PUBLIC;",
      "GRANT EXECUTE ON FUNCTION public.simulate_ground_ops_pickup_status(uuid, text, timestamptz) TO authenticated;",
    ]) {
      expect(base).toContain(line);
      expect(next).toContain(line);
    }
  });

  it("blocks future times and Start Trip before pickup only when a time is sent", () => {
    expect(next).toContain("p_event_at timestamptz DEFAULT NULL");
    expect(next).toMatch(/IF p_event_at IS NOT NULL THEN\s+IF p_event_at > now\(\) \+ \$e\$5 minutes\$e\$::interval THEN/);
    expect(next).toContain("Stage time can't be in the future.");
    expect(next).toContain("Start Trip time can't be before the Reached Pickup time");
    expect(next).toContain("v_pickup_at := COALESCE(v_pickup_at, v_trip.started_at);");
    expect(next).not.toMatch(/created_at/);
  });

  it("has no own BEGIN/COMMIT (the CLI wraps the file)", () => {
    expect(next).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });

  it("sets lock_timeout for this file's transaction only (does not leak into later files)", () => {
    expect(next).toMatch(/^SET LOCAL lock_timeout = 5000;$/m);
    expect(next).not.toMatch(/^SET lock_timeout/m);
  });
});
