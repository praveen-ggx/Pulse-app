import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/trip-status-authz.versions");

const APPROVED = [
  "20261109144113",
  "20261110023000",
  "20261110083407",
  "20271108094500",
];

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

describe("trip-status-authz release set", () => {
  it("lists the four authorization migrations in timestamp order", () => {
    const { versions } = parse();
    expect(versions).toEqual(APPROVED);
    expect(versions.every((version) => !version.endsWith("000000"))).toBe(true);
    const earlier = fs.readFileSync(
      path.join(migrations, "../release-sets/prod-2026-11-10.versions"),
      "utf8",
    );
    expect(earlier).not.toContain("20261110023000");
    expect(earlier).not.toContain("20261110083407");
    expect(earlier).not.toContain("20271108094500");
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

  it("pins each migration file by SHA-256", () => {
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
