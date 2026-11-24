import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/gowtham-v1037-driver.versions");

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

describe("gowtham-v1037-driver release set", () => {
  it("lists exactly the eleven driver migrations in order", () => {
    const { versions } = parse();
    expect(versions).toEqual([
      "20271113100000",
      "20271113101500",
      "20271113103000",
      "20271113104500",
      "20271113110000",
      "20271117120100",
      "20271117120200",
      "20271117120300",
      "20271117120400",
      "20271118120000",
      "20271118120100",
    ]);
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

  it("pins the migration file by SHA-256", () => {
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
