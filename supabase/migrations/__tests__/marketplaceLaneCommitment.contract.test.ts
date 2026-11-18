import fs from "fs";
import path from "path";

const FILE = "20271117013000_marketplace_lane_commitment_on_pool_rate.sql";
const PINNED = "20271114201500_marketplace_lane_rate_opt_in.sql";
const sql = fs.readFileSync(path.join(__dirname, "..", FILE), "utf8");
const pinned = fs.readFileSync(path.join(__dirname, "..", PINNED), "utf8");

function fnBody(source: string, name: string): string {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("CREATE OR REPLACE FUNCTION", start + 20);
  const dropped = source.indexOf("DROP FUNCTION", start + 20);
  const endCandidates = [next, dropped].filter((n) => n >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : source.length;
  return source.slice(start, end);
}

describe("marketplace lane commitment, 48-hour visibility", () => {
  it("starts with a lock timeout and does not call the revoked pool key or Network quotes", () => {
    expect(sql).toMatch(/^SET LOCAL lock_timeout = '5s';$/m);
    expect(sql).not.toMatch(/public\._pool_key(_part)?\s*\(/);
    expect(sql).not.toMatch(/submit_network_pool_quote|network_pool_bid_commits/);
  });

  it("stores a new commitment for 48 hours from the server clock", () => {
    const commit = fnBody(sql, "commit_marketplace_lane_rate");
    expect(commit).toContain("pg_catalog.now() + interval '48 hours'");
    expect(commit).not.toContain("v_until := p_valid_until");
    expect(commit).toContain("p_renew boolean DEFAULT false");
  });

  it("reuses the same rate without moving the window, and fills loads that have no offer", () => {
    const commit = fnBody(sql, "commit_marketplace_lane_rate");
    expect(commit).toContain("v_found AND v_existing.amount = p_amount AND NOT coalesce(p_renew, false)");
    expect(commit).toContain("v_until := v_existing.valid_until");
    expect(commit).toContain("v_reused := true");
    expect(commit).toContain("_attach_market_lane_commit(v_commit_id, v_indent_id)");
    expect(commit).toContain("ON CONFLICT");
  });

  it("changes the rate on pending bids only and does not extend the window", () => {
    const commit = fnBody(sql, "commit_marketplace_lane_rate");
    expect(commit).toContain("v_rate_changed := v_existing.amount IS DISTINCT FROM p_amount");
    expect(commit).toContain("AND mb.status = 'pending'");
    expect(commit).toContain("ELSE v_existing.valid_until");
    expect(commit).not.toMatch(/status = 'accepted'/);
  });

  it("renews only when the carrier asks, and that starts a new 48-hour window", () => {
    const commit = fnBody(sql, "commit_marketplace_lane_rate");
    expect(commit).toContain("v_renewed := coalesce(p_renew, false)");
    expect(commit).toContain("WHEN v_renewed THEN pg_catalog.now() + interval '48 hours'");
  });

  it("expires a commitment at the boundary and does not revive it for a new load", () => {
    const live = fnBody(sql, "market_lane_commit_is_live");
    const expire = fnBody(sql, "_expire_market_lane_commits");
    const apply = fnBody(sql, "apply_standing_lane_bids");
    expect(live).toContain("p_valid_until > pg_catalog.now()");
    expect(live).not.toMatch(/p_awarded_count\s*<|p_vehicle_limit\s*</);
    expect(expire).toContain("c.valid_until <= pg_catalog.now()");
    expect(expire).toContain("status = 'expired'");
    expect(apply).toContain("_expire_market_lane_commits(v_key)");
    expect(apply).not.toMatch(/status = 'active'\s*,\s*updated_at/);
  });

  it("moves a lane-change withdrawal onto the new lane instead of inserting a second bid", () => {
    const attach = fnBody(sql, "_attach_market_lane_commit");
    expect(attach).toContain("mb.status = 'withdrawn'");
    expect(attach).toContain("oldc.lane_key IS DISTINCT FROM v_key");
    expect(attach).toContain("ON CONFLICT (indent_id, bidder_user_id) DO NOTHING");
  });

  it("withdraws only pending bids when the load leaves the lane", () => {
    const release = fnBody(sql, "_release_stale_market_lane_bids");
    expect(release).toContain("mb.status = 'pending'");
    expect(release).toContain("status = 'withdrawn'");
    expect(release).toContain("c.lane_key IS DISTINCT FROM p_lane_key");
    expect(release).not.toMatch(/accepted/);
  });

  it("does not consume a vehicle or award a load when a bid is accepted", () => {
    const accept = fnBody(sql, "tg_market_lane_commit_on_bid_accept");
    expect(accept).toContain("RETURN NEW");
    expect(accept).not.toMatch(/awarded_count|exhausted|INSERT INTO public\.trips|award_market_bid/);
  });

  it("keeps cancellation from deleting bids that were already placed", () => {
    expect(sql).toContain("Bids already placed, including accepted bids, are not deleted");
    expect(sql).not.toMatch(/DELETE FROM public\.market_bids/);
  });

  it("keeps the indent trigger's failure log in the pinned migration", () => {
    expect(pinned).toContain(
      "RAISE WARNING 'marketplace lane rate attach skipped for indent %: %', NEW.id, SQLERRM;",
    );
    expect(pinned).toContain("An indent write must never fail because a lane rate could not attach.");
  });

  it("keeps the internal helpers off the client role", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public._expire_market_lane_commits(text) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public._release_stale_market_lane_bids(uuid, text) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.apply_standing_lane_bids(uuid) FROM PUBLIC, anon, authenticated;",
    );
  });
});
