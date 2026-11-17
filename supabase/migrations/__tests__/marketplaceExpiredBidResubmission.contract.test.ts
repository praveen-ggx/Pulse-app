import fs from "fs";
import path from "path";

const FILE = "20271117144500_marketplace_expired_bid_resubmission.sql";
const sql = fs.readFileSync(path.join(__dirname, "..", FILE), "utf8");

describe("marketplace expired bid resubmission", () => {
  it("closes an expired pending bid instead of editing it, then inserts a new one", () => {
    expect(sql).toMatch(/^SET LOCAL lock_timeout = '5s';$/m);
    expect(sql).toContain("SET status = 'expired'");
    expect(sql).toContain("AND expires_at <= pg_catalog.now()");
    expect(sql).not.toMatch(/SET expires_at\s*=/);
    expect(sql).toContain("INSERT INTO public.market_bids");
    expect(sql).toContain("status = 'accepted'");
    expect(sql).toContain("bid_locked: an existing decided bid cannot be changed");
  });

  it("keeps one pending bid per carrier and load, and points the lane attach at that index", () => {
    expect(sql).toContain("DROP CONSTRAINT market_bids_indent_id_bidder_user_id_key");
    expect(sql).toContain("CREATE UNIQUE INDEX market_bids_one_pending_per_carrier_idx");
    expect(sql).toContain("WHERE status = 'pending'");
    expect(sql).toContain(
      "ON CONFLICT (indent_id, bidder_user_id) WHERE status = 'pending' DO NOTHING",
    );
    expect(sql).toContain("'expired'::text");
  });
});
