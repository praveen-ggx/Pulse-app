import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/my-org-market-bids-identity.versions");

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

describe("my-org-market-bids-identity release set", () => {
  it("lists only the My Bids identity-until-allocation migration", () => {
    const { versions } = parse();
    expect(versions).toEqual(["20261111105431"]);
    expect(versions.every((version) => !version.endsWith("000000"))).toBe(true);
  });

  it("does not name a frozen version", () => {
    const body = fs.readFileSync(setFile, "utf8");
    const frozen = fs
      .readFileSync(path.join(migrations, "../release-sets/FROZEN.versions"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d{14}$/.test(line));
    for (const version of frozen) expect(body).not.toContain(version);
  });

  it("pins the applied migration file by SHA-256", () => {
    const { versions, sums } = parse();
    const all = fs.readdirSync(migrations);
    for (const version of versions) {
      const files = all.filter((file) => file.startsWith(`${version}_`) && file.endsWith(".sql"));
      expect(files).toHaveLength(1);
      const pinned = sums.get(version);
      expect(pinned?.file).toBe(files[0]);
      const actual = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(migrations, files[0]!)))
        .digest("hex");
      expect(actual).toBe(pinned?.sha);
    }
  });
});
