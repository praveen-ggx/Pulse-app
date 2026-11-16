import fs from "fs";
import path from "path";

const FILE = "20271117021500_marketplace_bid_individual_expiry.sql";
const COMMITMENT = "20271117013000_marketplace_lane_commitment_on_pool_rate.sql";
const sql = fs.readFileSync(path.join(__dirname, "..", FILE), "utf8");
const commitment = fs.readFileSync(path.join(__dirname, "..", COMMITMENT), "utf8");

describe("marketplace individual bid expiry", () => {
  it("is a separate migration and does not rewrite the lane commitment", () => {
    expect(sql).toMatch(/^SET LOCAL lock_timeout = '5s';$/m);
    expect(sql).not.toMatch(/commit_marketplace_lane_rate\s*\(|UPDATE public\.market_lane_bid_commits|ALTER TABLE public\.market_lane_bid_commits/);
    expect(commitment).not.toContain("tg_market_bid_set_expiry");
  });

  it("gives each inserted bid 48 hours from its own created_at", () => {
    expect(sql).toContain("NEW.expires_at := coalesce(NEW.created_at, pg_catalog.now()) + interval '48 hours'");
    expect(sql).toContain("BEFORE INSERT ON public.market_bids");
    expect(sql).toContain("created_at + interval '48 hours'");
    expect(sql).toContain("ALTER COLUMN expires_at SET NOT NULL");
  });

  it("refuses a late acceptance and leaves an already accepted bid alone", () => {
    expect(sql).toContain("OLD.status IS DISTINCT FROM 'accepted'");
    expect(sql).toContain("NEW.status = 'accepted'");
    expect(sql).toContain("NEW.expires_at <= pg_catalog.now()");
    expect(sql).toContain("RAISE EXCEPTION 'bid_expired");
    expect(sql).not.toMatch(/status\s*=\s*'expired'|status\s*=\s*'withdrawn'/);
  });

  it("does not let an app session move the clock", () => {
    expect(sql).toContain("auth.uid() IS NOT NULL AND NEW.expires_at IS DISTINCT FROM OLD.expires_at");
    expect(sql).toContain("NEW.expires_at := OLD.expires_at");
  });

  it("returns each bid's own expires_at to the shipper list without widening access", () => {
    const original = fs.readFileSync(
      path.join(__dirname, "..", "20270309030000_market_bids_contact_visibility_fee_gate.sql"),
      "utf8",
    );
    const body = (text: string) => {
      const start = text.indexOf("CREATE FUNCTION public.list_market_bids_for_indent(");
      expect(start).toBeGreaterThanOrEqual(0);
      const asStart = text.indexOf("AS $function$", start);
      return text.slice(asStart, text.indexOf("$function$;", asStart + 13));
    };
    const section = sql.slice(sql.indexOf("DROP FUNCTION IF EXISTS public.list_market_bids_for_indent(uuid);"));
    expect(section).toMatch(/vehicle_capacity\s+text,\s+expires_at\s+timestamptz\s*\)/);
    expect(section).toMatch(/SECURITY DEFINER\s+SET search_path TO ''/);
    expect(section).toContain("REVOKE ALL ON FUNCTION public.list_market_bids_for_indent(uuid) FROM PUBLIC;");
    expect(section).toContain("GRANT EXECUTE ON FUNCTION public.list_market_bids_for_indent(uuid) TO authenticated;");
    expect(body(sql).replace("ov.capacity,\n    mb.expires_at", "ov.capacity")).toBe(body(original));
  });

  it("rolls the shipper list back before the column goes", () => {
    const header = sql.slice(0, sql.indexOf("SET LOCAL lock_timeout"));
    const restore = header.indexOf("20270309030000_market_bids_contact_visibility_fee_gate.sql");
    expect(restore).toBeGreaterThan(0);
    expect(restore).toBeLessThan(header.indexOf("DROP COLUMN IF EXISTS expires_at"));
  });
});
