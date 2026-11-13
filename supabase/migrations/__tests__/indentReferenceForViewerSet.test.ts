import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const releaseSets = path.join(migrations, "../release-sets");
const fullSet = path.join(releaseSets, "indent-reference-for-viewer.versions");
const preprodSet = path.join(releaseSets, "indent-reference-for-viewer-preprod.versions");

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

function frozenVersions(): string[] {
  return fs
    .readFileSync(path.join(releaseSets, "FROZEN.versions"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d{14}$/.test(line));
}

function checkPins(file: string) {
  const { versions, sums } = parse(file);
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
  }
}

describe("indent-reference-for-viewer sets", () => {
  it("full set lists the two migrations in order", () => {
    expect(parse(fullSet).versions).toEqual(["20261112144350", "20261112150640"]);
  });

  it("preprod set lists only the batch migration", () => {
    expect(parse(preprodSet).versions).toEqual(["20261112150640"]);
  });

  it("neither set names a frozen version", () => {
    for (const file of [fullSet, preprodSet]) {
      const body = fs.readFileSync(file, "utf8");
      for (const version of frozenVersions()) expect(body).not.toContain(version);
    }
  });

  it("pins every migration by SHA-256, same hash in both sets", () => {
    checkPins(fullSet);
    checkPins(preprodSet);
    expect(parse(preprodSet).sums.get("20261112150640")?.sha).toBe(
      parse(fullSet).sums.get("20261112150640")?.sha,
    );
  });

  it("migrations only add functions (no table, data or grant-widening changes)", () => {
    const { sums } = parse(fullSet);
    for (const [, { file }] of sums) {
      const sql = fs.readFileSync(path.join(migrations, file), "utf8").replace(/--.*$/gm, "");
      expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.indent_references?_for_viewer\(/);
      expect(sql).not.toMatch(/\b(ALTER TABLE|DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/i);
      expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.indent_references?_for_viewer\((uuid|uuid\[\])\) FROM PUBLIC, anon;/);
    }
  });
});
