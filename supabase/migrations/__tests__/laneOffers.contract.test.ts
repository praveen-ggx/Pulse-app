import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/lane-offers.versions");
const FILE = "20271113091500_lane_offers_for_indent.sql";
const sql = fs.readFileSync(path.join(migrations, FILE), "utf8");

function fnBody(name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  return sql.slice(start, end);
}

function parse() {
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

describe("lane-offers release set", () => {
  const DEP_FILE = "20271025183000_network_pool_bid_commits.sql";

  it("lists the pool-commit dependency then lane offers, off-midnight and not frozen", () => {
    const { versions } = parse();
    expect(versions).toEqual(["20271025183000", "20271113091500"]);
    expect(versions.every((version) => !version.endsWith("000000"))).toBe(true);
    const frozen = fs
      .readFileSync(path.join(migrations, "../release-sets/FROZEN.versions"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d{14}$/.test(line));
    for (const version of versions) expect(frozen).not.toContain(version);
  });

  it("pins both migration files by SHA-256", () => {
    const { sums } = parse();
    for (const [version, file] of [
      ["20271025183000", DEP_FILE],
      ["20271113091500", FILE],
    ] as const) {
      const pinned = sums.get(version);
      expect(pinned?.file).toBe(file);
      const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, file))).digest("hex");
      expect(actual).toBe(pinned?.sha);
    }
  });

  it("the dependency creates what lane offers needs", () => {
    const dep = fs.readFileSync(path.join(migrations, DEP_FILE), "utf8");
    expect(dep).toMatch(/CREATE TABLE IF NOT EXISTS public\.network_pool_bid_commits/);
    expect(dep).toMatch(/ADD COLUMN IF NOT EXISTS pool_commit_id uuid/);
    expect(dep).toMatch(/CREATE OR REPLACE FUNCTION public\.network_pool_commit_is_live\(/);
  });

  it("leaves withdraw-network-quotes unchanged (still excludes 20271025183000)", () => {
    const body = fs.readFileSync(path.join(migrations, "../release-sets/withdraw-network-quotes.versions"), "utf8");
    const versions = body.split("\n").map((line) => line.trim()).filter((line) => /^\d{14}$/.test(line));
    expect(versions).toEqual(["20261025154609"]);
  });
});

describe("20271113091500 lane offers contract", () => {
  it("bounds lock waits before any DDL", () => {
    const lock = sql.indexOf("SET LOCAL lock_timeout = '5s';");
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(sql.indexOf("CREATE "));
  });

  it("keeps internal helpers off the API and exposes only the five RPCs to authenticated", () => {
    for (const sig of [
      "_org_network_link_exists(uuid, uuid)",
      "_indent_network_open(uuid)",
      "_indent_marketplace_open(uuid)",
      "_attach_lane_commitments(uuid)",
      "tg_indent_attach_lane_commitments()",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
      expect(sql).not.toContain(`GRANT EXECUTE ON FUNCTION public.${sig}`);
    }
    for (const sig of [
      "attach_lane_commitments_for_indent(uuid)",
      "list_lane_offers_for_indent(uuid, integer, numeric, text)",
      "invite_lane_bidder(uuid, text, uuid)",
      "respond_lane_bid_invite(uuid, boolean)",
      "list_my_lane_bid_invites(integer, timestamptz, uuid)",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated;`);
    }
  });

  it("lane_bid_invites is RLS-protected and read-only to clients", () => {
    expect(sql).toContain("ALTER TABLE public.lane_bid_invites ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain("REVOKE ALL ON TABLE public.lane_bid_invites FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT SELECT ON TABLE public.lane_bid_invites TO authenticated;");
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*lane_bid_invites/);
  });

  it("an accepted invite becomes a normal bid placed by the carrier, never an award", () => {
    const respond = fnBody("respond_lane_bid_invite");
    expect(respond).toContain("public.submit_market_bid(");
    expect(respond).toContain("public.submit_network_quote(");
    const invite = fnBody("invite_lane_bidder");
    expect(invite).not.toMatch(/INSERT INTO public\.market_bids/);
    expect(sql).not.toMatch(/award_(direct_quote|market_bid|indent)/i);
    expect(sql).not.toMatch(/UPDATE public\.indents/);
  });

  it("lists lane offers with a stable keyset, no final cap", () => {
    const list = fnBody("list_lane_offers_for_indent");
    expect(list).toContain('COLLATE "C"');
    expect(list).toContain("(d.amount, d.offer_key) > (p_after_amount, p_after_key COLLATE \"C\")");
    expect(list).toContain("has_more");
    expect(list).toContain("next_cursor");
    expect(list).toContain("total_count");
  });

  it("auto-attach trigger cannot recurse through its own inserts", () => {
    const tg = fnBody("tg_indent_attach_lane_commitments");
    expect(tg).toContain("pg_catalog.pg_trigger_depth() > 1");
    expect(sql).toContain("DROP TRIGGER IF EXISTS trg_indents_attach_lane_commitments ON public.indents;");
  });

  it("only attaches live commitments", () => {
    expect(fnBody("_attach_lane_commitments")).toContain("public.network_pool_commit_is_live(");
  });

  it("Marketplace invites never reveal the shipper or the indent number", () => {
    const invite = fnBody("invite_lane_bidder");
    expect(invite).toContain("'Marketplace rate request'");
    expect(invite).toContain("'kind', 'lane_bid_invite'");
    const mine = fnBody("list_my_lane_bid_invites");
    expect(mine).toMatch(/'indent_number', CASE WHEN p\.channel = 'network'/);
    expect(mine).toMatch(/'shipper_name', CASE WHEN p\.channel = 'network'/);
    expect(sql).toMatch(
      /CREATE POLICY lane_bid_invites_select[\s\S]*?channel = 'network'\s+AND bidder_organization_id IS NOT NULL\s+AND public\.is_org_staff\(bidder_organization_id\)/,
    );
  });

  it("accept re-checks for an existing offer under a lock and supersedes instead of overwriting", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public._lane_bidder_has_active_offer(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;",
    );
    const respond = fnBody("respond_lane_bid_invite");
    expect(respond).toContain("FOR UPDATE");
    expect(respond).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(respond).toContain("public._lane_bidder_has_active_offer(");
    expect(respond).toContain("created_at = pg_catalog.now()");
    expect(respond).toContain("pool_commit_id IS NULL");
    expect(respond).toContain("'lane_invite_conflict'");
    expect(respond).toContain("'superseded'");
    expect(respond).toContain("'already_responded', true");
  });
});
