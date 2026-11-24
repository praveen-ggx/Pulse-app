import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const releaseSets = path.join(migrations, "../release-sets");
const setFile = path.join(releaseSets, "compliance-direct-on-exchange-trips.versions");
const FILE = "20261122124730_compliance_payments_post_directly_on_exchange_trips.sql";

function parse(file: string) {
  const lines = fs.readFileSync(file, "utf8").split("\n").map((line) => line.trim());
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

const sql = fs.readFileSync(path.join(migrations, FILE), "utf8");
const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION"), sql.indexOf("UPDATE public.exchange_payments"));

describe("compliance-direct-on-exchange-trips set", () => {
  it("lists exactly the one migration, not frozen, pinned by SHA-256", () => {
    const { versions, sums } = parse(setFile);
    expect(versions).toEqual(["20261122124730"]);
    expect(versions[0].endsWith("000000")).toBe(false);
    const frozen = fs
      .readFileSync(path.join(releaseSets, "FROZEN.versions"), "utf8")
      .split("\n")
      .map((line) => line.trim());
    expect(frozen).not.toContain("20261122124730");
    const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(migrations, FILE))).digest("hex");
    expect(sums.get("20261122124730")).toEqual({ sha: actual, file: FILE });
  });

  it("lets only compliance advance / balance skip the Exchange routing checks", () => {
    const exempt = fn.indexOf("IF NEW.ledger_category IN ('compliance_advance', 'compliance_balance') THEN");
    expect(exempt).toBeGreaterThan(0);
    // Exchange entries and the Marketplace fee party are checked before the exemption.
    expect(fn.indexOf("Pulse Exchange entries post to Finance only after the other side confirms them")).toBeLessThan(exempt);
    // The two routing checks come after it and are kept.
    expect(fn.indexOf("payments with a Marketplace partner you are not connected to")).toBeGreaterThan(exempt);
    expect(fn.indexOf("this trip settles through Pulse Exchange")).toBeGreaterThan(exempt);
    expect(fn).toMatch(/\nBEGIN\n/);
  });

  it("cancels only open payer claims on trips paid through Compliance", () => {
    const cleanup = sql.slice(sql.indexOf("UPDATE public.exchange_payments"));
    expect(cleanup).toMatch(/SET status = 'cancelled'/);
    expect(cleanup).toMatch(/ep\.status = 'claimed'/);
    expect(cleanup).toMatch(/ep\.claimed_by_side = 'payer'/);
    expect(cleanup).toMatch(/pr\.payment_type IN \('advance', 'balance'\)/);
    expect(cleanup).not.toMatch(/DELETE/i);
  });
});
