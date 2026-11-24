import crypto from "crypto";
import fs from "fs";
import path from "path";

const migrations = path.join(__dirname, "..");
const setFile = path.join(migrations, "../release-sets/entity-documents-superseded-readers.versions");
const rollbackFile = path.join(
  migrations,
  "../release-manual/20261120055411_entity_documents_superseded_readers.rollback.sql",
);

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

describe("entity-documents-superseded-readers release set", () => {
  it("lists only the superseded-readers migration, with a CLI (non-midnight) version", () => {
    const { versions } = parse();
    expect(versions).toEqual(["20261120055411"]);
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

  it("never applies the manual rollback or the cleanup script", () => {
    const applied = fs
      .readFileSync(setFile, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));
    expect(applied.some((line) => /rollback|dedupe|release-manual|scripts\//.test(line))).toBe(false);
    // The rollback lives outside supabase/migrations, so no push can pick it up.
    expect(fs.readdirSync(migrations).some((file) => file.includes("rollback") && file.includes("20261120055411"))).toBe(false);
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

  it("has a manual rollback that restores all four functions and then drops the helper", () => {
    const sql = fs.readFileSync(rollbackFile, "utf8");
    for (const fn of [
      "get_compliance_summary",
      "get_expiring_documents",
      "compute_compliance_score",
      "is_compliance_blocking",
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
    // Restored bodies must not call the helper that the same file drops.
    const dropAt = sql.indexOf("drop function if exists private.entity_document_is_superseded(");
    expect(dropAt).toBeGreaterThan(-1);
    expect(sql.slice(0, dropAt)).not.toContain("entity_document_is_superseded(d.");
    // Summary / expiring keep the adr010 staff gate that production has today.
    expect(sql.match(/public\.is_org_staff\(p_org_id\)/g)?.length).toBe(2);
    expect(sql).not.toMatch(/\b(insert into|update public\.|delete from|truncate|alter table)\b/i);
  });
});
