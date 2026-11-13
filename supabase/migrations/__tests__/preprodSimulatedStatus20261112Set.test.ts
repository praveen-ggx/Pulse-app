import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const releaseSets = path.join(migrations, "../release-sets");
const setFile = path.join(releaseSets, "preprod-2026-11-12-simulated-status.versions");

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

describe("preprod-2026-11-12-simulated-status set", () => {
  it("lists only the simulated-status migration", () => {
    expect(parse(setFile).versions).toEqual(["20271111143000"]);
  });

  it("does not name a frozen version", () => {
    const body = fs.readFileSync(setFile, "utf8");
    const frozen = fs
      .readFileSync(path.join(releaseSets, "FROZEN.versions"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^\d{14}$/.test(line));
    for (const version of frozen) expect(body).not.toContain(version);
  });

  it("pins the migration file by SHA-256, same as the prod set", () => {
    const { versions, sums } = parse(setFile);
    const prod = parse(path.join(releaseSets, "prod-2026-11-12-release.versions")).sums;
    const all = fs.readdirSync(migrations);
    for (const version of versions) {
      const files = all.filter((f) => f.startsWith(`${version}_`) && f.endsWith(".sql"));
      expect(files).toHaveLength(1);
      const pinned = sums.get(version);
      expect(pinned?.file).toBe(files[0]);
      const actual = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(migrations, files[0]!)))
        .digest("hex");
      expect(actual).toBe(pinned?.sha);
      expect(prod.get(version)?.sha).toBe(pinned?.sha);
    }
  });
});
