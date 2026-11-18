/**
 * 20271012203000 is frozen (2026-11-17): applying it would CREATE OR REPLACE
 * fn_trip_documents_storage_allowed with an older body and revert the live
 * definition from 20271110133819. The historical set
 * trip-documents-storage-party.versions names only that version.
 *
 * These tests run the push tool's own frozen gate (build_release_snapshot in
 * scripts/lib/migration-release-set.sh) offline, with an empty migration list:
 * a set that names a frozen version must stop at the gate; every other set must
 * pass the gate (it then stops at the Local-only check, which needs a database).
 */
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const REPO = path.join(__dirname, "../../..");
const SETS = path.join(REPO, "supabase/release-sets");
const MIGRATIONS = path.join(REPO, "supabase/migrations");
const LIB = path.join(REPO, "scripts/lib/migration-release-set.sh");

const versionsIn = (file: string) =>
  fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => /^\d{14}$/.test(l));

const frozen = versionsIn(path.join(SETS, "FROZEN.versions"));
const releaseSets = fs.readdirSync(SETS).filter((f) => f.endsWith(".versions") && f !== "FROZEN.versions");

/** Run the real frozen gate for one set; returns the gate's stderr. */
function runGate(setFile: string): string {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "frozen-gate-"));
  const list = path.join(work, "list.txt");
  fs.writeFileSync(list, "");
  try {
    execFileSync(
      "bash",
      ["-c", 'source "$1"; build_release_snapshot "$2" "$3" "$4" "$5" "$6"', "gate", LIB, REPO, list,
        path.join(SETS, setFile), path.join(SETS, "FROZEN.versions"), path.join(work, "dest")],
      { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
    );
    return "";
  } catch (e) {
    return String((e as { stderr?: string }).stderr ?? "");
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

describe("FROZEN.versions", () => {
  it("freezes 20271012203000 and keeps the existing entries", () => {
    expect(frozen).toEqual(["20271005130000", "20271012203000"]);
  });

  it("documents why 20271012203000 is frozen: it redefines the live storage permission function", () => {
    const old = fs.readdirSync(MIGRATIONS).find((f) => f.startsWith("20271012203000_"))!;
    const live = fs.readdirSync(MIGRATIONS).find((f) => f.startsWith("20271110133819_"))!;
    const def = /CREATE OR REPLACE FUNCTION public\.fn_trip_documents_storage_allowed\(/;
    expect(fs.readFileSync(path.join(MIGRATIONS, old), "utf8")).toMatch(def);
    expect(fs.readFileSync(path.join(MIGRATIONS, live), "utf8")).toMatch(def);
    expect(old < live).toBe(true);
  });
});

describe("push tool frozen gate (offline)", () => {
  it("refuses trip-documents-storage-party.versions", () => {
    expect(versionsIn(path.join(SETS, "trip-documents-storage-party.versions"))).toEqual(["20271012203000"]);
    expect(runGate("trip-documents-storage-party.versions")).toContain(
      "ERROR: release set names frozen version 20271012203000",
    );
  });

  it("only historical sets name a frozen version", () => {
    const naming = releaseSets.filter((f) => versionsIn(path.join(SETS, f)).some((v) => frozen.includes(v)));
    expect(naming).toEqual(["trip-documents-storage-party.versions"]);
  });

  it("every other release set passes the frozen gate", () => {
    const others = releaseSets.filter((f) => f !== "trip-documents-storage-party.versions");
    expect(others.length).toBeGreaterThan(10);
    for (const f of others) {
      const err = runGate(f);
      expect(err).not.toContain("names frozen version");
      // Past the gate, an empty migration list stops at the Local-only check (or an empty set).
      expect(err).toMatch(/is not Local-only on the linked list|release set is empty/);
    }
  });
});
