import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/marketplace-lane-rate.versions");
const FILE = "20271114201500_marketplace_lane_rate_opt_in.sql";
const sql = fs.readFileSync(path.join(migrations, FILE), "utf8");

function fnBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$", sql.indexOf("BEGIN", start));
  return sql.slice(start, end);
}

function parseSet() {
  const lines = fs.readFileSync(setFile, "utf8").split("\n").map((line) => line.trim());
  const versions: string[] = [];
  const sums = new Map<string, { sha: string; file: string }>();
  lines.forEach((line, i) => {
    if (line === "" || line.startsWith("#")) return;
    versions.push(line);
    const pinned = /^# sha256 ([0-9a-f]{64}) {2}(\S+\.sql)$/.exec(lines[i - 1] ?? "");
    if (pinned) sums.set(line, { sha: pinned[1], file: pinned[2] });
  });
  return { versions, sums };
}

describe("marketplace-lane-rate release set", () => {
  it("applies the standing-lane trigger, opt-in, bootstrap, 48-hour commitment and bid expiry in order, off-midnight, not frozen", () => {
    const { versions, sums } = parseSet();
    expect(versions).toEqual([
      "20271114173800",
      "20271114174600",
      "20271114201500",
      "20271116144500",
      "20271117013000",
      "20271117021500",
      "20271117144500",
    ]);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort()).toEqual(versions);
    expect(versions.every((v) => !v.endsWith("000000"))).toBe(true);
    const frozen = fs
      .readFileSync(path.join(migrations, "../release-sets/FROZEN.versions"), "utf8")
      .split("\n")
      .map((line) => line.trim());
    for (const version of versions) {
      expect(frozen).not.toContain(version);
      const pinned = sums.get(version);
      expect(pinned).toBeDefined();
      const actual = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(migrations, pinned!.file)))
        .digest("hex");
      expect(actual).toBe(pinned!.sha);
    }
  });
});

describe("marketplace lane rate opt-in", () => {
  it("never calls the revoked _pool_key helpers", () => {
    expect(sql).not.toMatch(/public\._pool_key(_part)?\s*\(/);
  });

  it("future loads receive only live opt-in rates, never other pending bids", () => {
    const apply = fnBody("apply_standing_lane_bids");
    expect(apply).toContain("FROM public.market_lane_bid_commits c");
    expect(apply).toContain("market_lane_commit_is_live");
    expect(apply).not.toMatch(/FROM public\.market_bids/);
  });

  it("does not re-place an offer the carrier has or had on the load", () => {
    const attach = fnBody("_attach_market_lane_commit");
    expect(attach).toMatch(/FROM public\.market_bids mb\s+WHERE mb\.indent_id = p_indent_id/);
    expect(attach).not.toMatch(/mb\.status\s*(=|IN)/);
    expect(attach).toContain("FROM public.direct_quotes dq");
    expect(attach).toContain("v_org = v_commit.bidder_organization_id");
    expect(attach).toContain("indent_is_sponsored_reach_row");
  });

  it("an indent write never fails because a lane rate could not attach", () => {
    const trg = fnBody("trg_apply_standing_lane_bids");
    expect(trg).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
  });

  it("commit is staff-gated, bounded, and covers loads that already exist", () => {
    const commit = fnBody("commit_marketplace_lane_rate");
    expect(commit).toContain("public.is_org_staff(p_org_id)");
    expect(commit).toContain("p_vehicle_limit > 200");
    expect(commit).toContain("interval '90 days'");
    expect(commit).toContain("SET status = 'superseded'");
    expect(commit).toContain("_attach_market_lane_commit(v_commit_id, v_indent_id)");
  });

  it("awards consume a vehicle; an ended rate leaves the bid awardable", () => {
    const accept = fnBody("tg_market_lane_commit_on_bid_accept");
    expect(accept).toContain("awarded_count = v_next");
    expect(accept).toContain("NEW.lane_commit_id := NULL");
    expect(accept).not.toMatch(/RAISE EXCEPTION/);
  });

  it("app users cannot call the internal attach or apply functions directly", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public._attach_market_lane_commit(uuid, uuid) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.apply_standing_lane_bids(uuid) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toMatch(/^SET LOCAL lock_timeout = '5s';$/m);
  });
});
