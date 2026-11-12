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
  it("lists only the lane offers migration, off-midnight and not frozen", () => {
    const { versions } = parse();
    expect(versions).toEqual(["20271113091500"]);
    const frozen = fs
      .readFileSync(path.join(migrations, "../release-sets/FROZEN.versions"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d{14}$/.test(line));
    expect(frozen).not.toContain("20271113091500");
  });

  it("pins the migration file by SHA-256", () => {
    const pinned = parse().sums.get("20271113091500");
    expect(pinned?.file).toBe(FILE);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, FILE))).digest("hex");
    expect(actual).toBe(pinned?.sha);
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
});
