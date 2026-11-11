import fs from "fs";
import os from "os";
import path from "path";
import {
  SNAPSHOT_SQL,
  appendSnapshotFile,
  collectOnce,
  createSnapshotSampler,
  diffCounters,
  diffSnapshots,
  serializeSnapshot,
  type Db,
  type Snapshot,
} from "../pgSnapshot";

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    collectedAt: "2026-10-28T09:11:00.000Z",
    postmasterStart: "2026-10-28T08:00:00.000Z",
    tables: [
      {
        schemaname: "public",
        relname: "trips",
        n_tup_ins: 10,
        n_tup_upd: 4,
        n_tup_hot_upd: 3,
        n_tup_del: 1,
      },
    ],
    bgwriter: { buffers_clean: 20, maxwritten_clean: 1, buffers_alloc: 50, stats_reset: "2026-10-01T00:00:00.000Z" },
    checkpointer: { num_timed: 8, num_requested: 0, buffers_written: 75, stats_reset: "2026-10-01T00:00:00.000Z" },
    database: {
      xact_commit: 100,
      xact_rollback: 2,
      tup_returned: 1000,
      tup_fetched: 800,
      tup_inserted: 10,
      tup_updated: 4,
      tup_deleted: 1,
      conflicts: 0,
      temp_files: 0,
      temp_bytes: 0,
      deadlocks: 0,
      stats_reset: "2026-10-01T00:00:00.000Z",
    },
    statements: [{ queryid: "111", calls: 5, rows: 20, wal_bytes: 1000, total_exec_time: 12 }],
    activity: [],
    missing: [],
    errors: [],
    ...overrides,
  };
}

describe("pg snapshot deltas", () => {
  it("subtracts counters and leaves a first-seen relation without a delta", () => {
    const diff = diffCounters({ n_tup_upd: 4 }, { n_tup_upd: 7, n_tup_ins: 1 });
    expect(diff.reset).toBe(false);
    expect(diff.deltas).toEqual([
      { key: "n_tup_upd", delta: 3, reset: false },
      { key: "n_tup_ins", delta: null, reset: false },
    ]);
  });

  it("does not emit a negative delta when a counter goes backwards", () => {
    const current = snapshot({
      collectedAt: "2026-10-28T09:16:00.000Z",
      tables: [
        {
          schemaname: "public",
          relname: "trips",
          n_tup_ins: 2,
          n_tup_upd: 1,
          n_tup_hot_upd: 0,
          n_tup_del: 0,
        },
      ],
    });
    const delta = diffSnapshots(snapshot(), current);
    expect(delta.restarted).toBe(false);
    expect(delta.counterResets).toContain("tables:public.trips");
    expect(delta.tables[0].deltas.every((row) => row.delta == null && row.reset)).toBe(true);
  });

  it("treats a new postmaster start as a restart and drops deltas", () => {
    const current = snapshot({
      collectedAt: "2026-10-28T10:28:00.000Z",
      postmasterStart: "2026-10-28T10:27:49.000Z",
      checkpointer: { num_timed: 1, num_requested: 0, buffers_written: 16, stats_reset: "2026-10-28T10:27:49.000Z" },
    });
    const delta = diffSnapshots(snapshot(), current);
    expect(delta.restarted).toBe(true);
    expect(delta.tables).toEqual([]);
    expect(delta.statements).toEqual([]);
    expect(delta.checkpointer).toBeNull();
    expect(delta.counterResets).toEqual(
      expect.arrayContaining(["tables", "statements", "bgwriter", "checkpointer", "database"]),
    );
  });

  it("keeps table deltas when a view is missing", () => {
    const previous = snapshot();
    const current = snapshot({
      collectedAt: "2026-10-28T09:16:00.000Z",
      bgwriter: null,
      missing: ["bgwriter"],
      tables: [
        {
          schemaname: "public",
          relname: "trips",
          n_tup_ins: 12,
          n_tup_upd: 9,
          n_tup_hot_upd: 7,
          n_tup_del: 1,
        },
      ],
    });
    const delta = diffSnapshots(previous, current);
    expect(delta.bgwriter).toBeNull();
    expect(delta.tables[0].deltas.find((row) => row.key === "n_tup_upd")?.delta).toBe(5);
    expect(delta.counterResets).toEqual([]);
  });
});

describe("pg snapshot collection", () => {
  it("records a failed view and still returns the views that succeeded", async () => {
    const db: Db = {
      async query(sql) {
        if (sql === SNAPSHOT_SQL.statements) throw new Error("permission denied for view pg_stat_statements");
        if (sql === SNAPSHOT_SQL.postmaster) return [{ postmaster_start: "2026-10-28T08:00:00.000Z" }];
        if (sql === SNAPSHOT_SQL.tables) {
          return [{ schemaname: "public", relname: "trips", n_tup_ins: 1, n_tup_upd: 2, n_tup_hot_upd: 2, n_tup_del: 0 }];
        }
        if (sql === SNAPSHOT_SQL.bgwriter) {
          return [{ buffers_clean: 1, maxwritten_clean: 0, buffers_alloc: 3, stats_reset: "2026-10-01T00:00:00.000Z" }];
        }
        if (sql === SNAPSHOT_SQL.checkpointer) {
          return [{ num_timed: 1, num_requested: 0, buffers_written: 4, stats_reset: "2026-10-01T00:00:00.000Z" }];
        }
        if (sql === SNAPSHOT_SQL.database) {
          return [{
            xact_commit: 1, xact_rollback: 0, tup_returned: 1, tup_fetched: 1,
            tup_inserted: 1, tup_updated: 0, tup_deleted: 0, conflicts: 0,
            temp_files: 0, temp_bytes: 0, deadlocks: 0, stats_reset: null,
          }];
        }
        if (sql === SNAPSHOT_SQL.activity) {
          return [{
            state: "idle in transaction",
            backend_type: "client backend",
            wait_event_type: "Client",
            wait_event: "ClientRead",
            n: 11,
            max_xact_age_ms: 15000,
            max_query_age_ms: null,
            idle_in_transaction: 11,
          }];
        }
        throw new Error(`unexpected sql: ${sql}`);
      },
    };

    const snap = await collectOnce(db, "2026-10-28T09:16:00.000Z");
    expect(snap.missing).toEqual(["statements"]);
    expect(snap.errors[0]).toMatch(/permission denied/);
    expect(snap.tables[0].relname).toBe("trips");
    expect(snap.activity[0].idle_in_transaction).toBe(11);
    expect(JSON.stringify(snap)).not.toMatch(/SELECT|query_text|document_number/i);
  });

  it("does not select query text or reset statistics", () => {
    const sql = Object.values(SNAPSHOT_SQL).join("\n");
    expect(sql).not.toMatch(/\bquery\b/i);
    expect(sql).not.toMatch(/pg_stat_statements_reset|pg_stat_reset/i);
    expect(sql).toMatch(/queryid/);
    expect(sql).toMatch(/wal_bytes/);
  });

  it("appends a snapshot line that can be diffed after a process restart", () => {
    const first = snapshot();
    const second = snapshot({
      collectedAt: "2026-10-28T09:16:00.000Z",
      checkpointer: { num_timed: 9, num_requested: 0, buffers_written: 233, stats_reset: "2026-10-01T00:00:00.000Z" },
    });
    const lines = [serializeSnapshot(first, null), serializeSnapshot(second, first)];
    const parsed = lines.map((line) => JSON.parse(line) as { delta: { checkpointer: { key: string; delta: number }[] } | null });
    expect(parsed[0].delta).toBeNull();
    expect(parsed[1].delta?.checkpointer?.find((row) => row.key === "buffers_written")?.delta).toBe(158);
  });

  it("keeps the other sections when the statements view exceeds its timeout", async () => {
    const db: Db = {
      async query(sql) {
        if (sql === SNAPSHOT_SQL.statements) return new Promise(() => {});
        if (sql === SNAPSHOT_SQL.postmaster) return [{ postmaster_start: "2026-10-28T08:00:00.000Z" }];
        if (sql === SNAPSHOT_SQL.tables) {
          return [{ schemaname: "public", relname: "trips", n_tup_ins: 1, n_tup_upd: 2, n_tup_hot_upd: 2, n_tup_del: 0 }];
        }
        if (sql === SNAPSHOT_SQL.bgwriter) return [{ buffers_clean: 1, maxwritten_clean: 0, buffers_alloc: 1, stats_reset: null }];
        if (sql === SNAPSHOT_SQL.checkpointer) return [{ num_timed: 1, num_requested: 0, buffers_written: 1, stats_reset: null }];
        if (sql === SNAPSHOT_SQL.database) return [{ xact_commit: 1, xact_rollback: 0, tup_returned: 0, tup_fetched: 0, tup_inserted: 0, tup_updated: 0, tup_deleted: 0, conflicts: 0, temp_files: 0, temp_bytes: 0, deadlocks: 0, stats_reset: null }];
        if (sql === SNAPSHOT_SQL.activity) return [];
        throw new Error(`unexpected sql: ${sql}`);
      },
    };
    const snap = await collectOnce(db, "2026-10-28T09:16:00.000Z", 30);
    expect(snap.missing).toEqual(["statements"]);
    expect(snap.errors[0]).toMatch(/timed out after 30ms/);
    expect(snap.tables).toHaveLength(1);
    expect(snap.checkpointer?.buffers_written).toBe(1);
  });

  it("skips a second collect while the first is still running", async () => {
    let release: (() => void) | null = null;
    let calls = 0;
    const db: Db = {
      async query() {
        calls += 1;
        if (calls === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return [{ statement_timeout: "0" }];
      },
    };
    const sampler = createSnapshotSampler(db, { timeoutMs: 50 });
    const first = sampler.collect("2026-10-28T09:16:00.000Z");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await sampler.collect("2026-10-28T09:17:00.000Z");
    expect(second).toEqual({ skipped: true, reason: "overlap" });
    release?.();
    const finished = await first;
    expect(finished.skipped).toBe(false);
  });

  it("writes the snapshot line to an absolute file outside the database", () => {
    const file = path.join(os.tmpdir(), `pulse-pg-snapshot-${process.pid}.jsonl`);
    fs.rmSync(file, { force: true });
    const snap = snapshot();
    appendSnapshotFile(file, snap, null);
    const stored = fs.readFileSync(file, "utf8");
    fs.rmSync(file, { force: true });
    expect(stored).toContain("\"relname\":\"trips\"");
    expect(stored).not.toContain("document_number");
    expect(() => appendSnapshotFile("relative.jsonl", snap, null)).toThrow(/absolute/);
  });

  it("does not schedule itself", () => {
    const source = fs.readFileSync(path.join(__dirname, "../pgSnapshot.ts"), "utf8");
    expect(source).not.toMatch(/setInterval|cron\.schedule|pg_cron/);
  });
});
