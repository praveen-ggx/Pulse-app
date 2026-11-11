/**
 * Read-only PostgreSQL snapshot for a future saturation incident.
 *
 * The collector never resets statistics, never reads query text, and writes
 * JSONL outside the database. It does not schedule itself. Call
 * createSnapshotSampler().collect() explicitly. An in-database
 * pg_stat_statements scan has already stalled this project
 * (ops.capture_slow_queries, September 2026); each section is limited to
 * sectionTimeoutMs on a dedicated connection, statements are read last, and
 * a second collect() while one is running is skipped.
 */
import fs from "fs";
import path from "path";

/** Per-section server and client bound. Not a cluster configuration change. */
export const DEFAULT_SECTION_TIMEOUT_MS = 2000;

export const SNAPSHOT_SQL = {
  postmaster: "SELECT pg_postmaster_start_time() AS postmaster_start",
  tables: `
    SELECT schemaname, relname,
           n_tup_ins, n_tup_upd, n_tup_hot_upd, n_tup_del
    FROM pg_stat_user_tables
  `,
  bgwriter: `
    SELECT buffers_clean, maxwritten_clean, buffers_alloc, stats_reset
    FROM pg_stat_bgwriter
  `,
  checkpointer: `
    SELECT num_timed, num_requested, buffers_written, stats_reset
    FROM pg_stat_checkpointer
  `,
  database: `
    SELECT xact_commit, xact_rollback,
           tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted,
           conflicts, temp_files, temp_bytes, deadlocks, stats_reset
    FROM pg_stat_database
    WHERE datname = current_database()
  `,
  statements: `
    SELECT queryid::text AS queryid, calls, rows, wal_bytes, total_exec_time
    FROM extensions.pg_stat_statements
    WHERE queryid IS NOT NULL
    ORDER BY wal_bytes DESC NULLS LAST
    LIMIT 20
  `,
  activity: `
    SELECT COALESCE(state, 'unknown') AS state,
           COALESCE(backend_type, 'unknown') AS backend_type,
           COALESCE(wait_event_type, '') AS wait_event_type,
           COALESCE(wait_event, '') AS wait_event,
           count(*)::bigint AS n,
           max(EXTRACT(EPOCH FROM (clock_timestamp() - xact_start)) * 1000)
             FILTER (WHERE xact_start IS NOT NULL) AS max_xact_age_ms,
           max(EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000)
             FILTER (WHERE state = 'active' AND query_start IS NOT NULL) AS max_query_age_ms,
           count(*) FILTER (WHERE state = 'idle in transaction')::bigint AS idle_in_transaction
    FROM pg_stat_activity
    GROUP BY 1, 2, 3, 4
  `,
} as const;

const COUNTER_KEYS = [
  "n_tup_ins",
  "n_tup_upd",
  "n_tup_hot_upd",
  "n_tup_del",
  "buffers_clean",
  "maxwritten_clean",
  "buffers_alloc",
  "num_timed",
  "num_requested",
  "buffers_written",
  "xact_commit",
  "xact_rollback",
  "tup_returned",
  "tup_fetched",
  "tup_inserted",
  "tup_updated",
  "tup_deleted",
  "conflicts",
  "temp_files",
  "temp_bytes",
  "deadlocks",
  "calls",
  "rows",
  "wal_bytes",
  "total_exec_time",
] as const;

export type Db = {
  query<T extends Record<string, unknown>>(sql: string): Promise<T[]>;
};

export type TableStats = {
  schemaname: string;
  relname: string;
  n_tup_ins: number;
  n_tup_upd: number;
  n_tup_hot_upd: number;
  n_tup_del: number;
};

export type StatementStats = {
  queryid: string;
  calls: number;
  rows: number;
  wal_bytes: number;
  total_exec_time: number;
};

export type ActivityGroup = {
  state: string;
  backend_type: string;
  wait_event_type: string;
  wait_event: string;
  n: number;
  max_xact_age_ms: number | null;
  max_query_age_ms: number | null;
  idle_in_transaction: number;
};

export type Snapshot = {
  collectedAt: string;
  postmasterStart: string | null;
  tables: TableStats[];
  bgwriter: Record<string, number | string | null> | null;
  checkpointer: Record<string, number | string | null> | null;
  database: Record<string, number | string | null> | null;
  statements: StatementStats[];
  activity: ActivityGroup[];
  missing: string[];
  errors: string[];
};

export type CounterDelta = {
  key: string;
  delta: number | null;
  reset: boolean;
};

export type SnapshotDelta = {
  from: string;
  to: string;
  restarted: boolean;
  counterResets: string[];
  tables: Array<{ key: string; deltas: CounterDelta[] }>;
  bgwriter: CounterDelta[] | null;
  checkpointer: CounterDelta[] | null;
  database: CounterDelta[] | null;
  statements: Array<{ queryid: string; deltas: CounterDelta[] }>;
};

type Section<T> = { value: T; error: string | null };

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`expected a finite counter, got ${String(value)}`);
  return n;
}

function nullableNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  return num(value);
}

function stamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function tableKey(row: TableStats): string {
  return `${row.schemaname}.${row.relname}`;
}

export function diffCounters(
  previous: Record<string, number>,
  current: Record<string, number>,
): { deltas: CounterDelta[]; reset: boolean } {
  const deltas: CounterDelta[] = [];
  let reset = false;
  for (const key of Object.keys(current)) {
    if (!Object.prototype.hasOwnProperty.call(previous, key)) {
      deltas.push({ key, delta: null, reset: false });
      continue;
    }
    const before = previous[key];
    const after = current[key];
    if (after < before) {
      reset = true;
      deltas.push({ key, delta: null, reset: true });
    } else {
      deltas.push({ key, delta: after - before, reset: false });
    }
  }
  return { deltas, reset };
}

function numericFields(row: Record<string, number | string | null>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "stats_reset" || typeof value === "string" || value == null) continue;
    out[key] = value;
  }
  return out;
}

function tableFields(row: TableStats): Record<string, number> {
  return {
    n_tup_ins: row.n_tup_ins,
    n_tup_upd: row.n_tup_upd,
    n_tup_hot_upd: row.n_tup_hot_upd,
    n_tup_del: row.n_tup_del,
  };
}

function statementFields(row: StatementStats): Record<string, number> {
  return {
    calls: row.calls,
    rows: row.rows,
    wal_bytes: row.wal_bytes,
    total_exec_time: row.total_exec_time,
  };
}

export function diffSnapshots(previous: Snapshot, current: Snapshot): SnapshotDelta {
  const restarted =
    previous.postmasterStart != null &&
    current.postmasterStart != null &&
    previous.postmasterStart !== current.postmasterStart;
  const counterResets: string[] = [];

  const baseline = <T>(
    label: string,
    before: T | null,
    after: T | null,
    fields: (row: T) => Record<string, number>,
    identity: (row: T) => string,
  ): Array<{ key: string; deltas: CounterDelta[] }> => {
    if (restarted || before == null || after == null) {
      if (restarted) counterResets.push(label);
      return [];
    }
    const prior = new Map<string, T>();
    const rows = Array.isArray(before) ? before : [before];
    const next = Array.isArray(after) ? after : [after];
    for (const row of rows) prior.set(identity(row), row);
    const result: Array<{ key: string; deltas: CounterDelta[] }> = [];
    for (const row of next) {
      const key = identity(row);
      const old = prior.get(key);
      if (!old) {
        result.push({
          key,
          deltas: Object.keys(fields(row)).map((field) => ({ key: field, delta: null, reset: false })),
        });
        continue;
      }
      const diff = diffCounters(fields(old), fields(row));
      if (diff.reset) counterResets.push(`${label}:${key}`);
      result.push({ key, deltas: diff.deltas });
    }
    return result;
  };

  const one = (
    label: string,
    before: Record<string, number | string | null> | null,
    after: Record<string, number | string | null> | null,
  ): CounterDelta[] | null => {
    if (restarted) {
      counterResets.push(label);
      return null;
    }
    if (before == null || after == null) return null;
    const beforeReset = stamp(before.stats_reset);
    const afterReset = stamp(after.stats_reset);
    if (beforeReset !== afterReset) {
      counterResets.push(label);
      return null;
    }
    const diff = diffCounters(numericFields(before), numericFields(after));
    if (diff.reset) counterResets.push(label);
    return diff.deltas;
  };

  return {
    from: previous.collectedAt,
    to: current.collectedAt,
    restarted,
    counterResets,
    tables: baseline("tables", previous.tables, current.tables, tableFields, tableKey),
    bgwriter: one("bgwriter", previous.bgwriter, current.bgwriter),
    checkpointer: one("checkpointer", previous.checkpointer, current.checkpointer),
    database: one("database", previous.database, current.database),
    statements: baseline(
      "statements",
      previous.statements,
      current.statements,
      statementFields,
      (row) => row.queryid,
    ),
  };
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number, name: string): Promise<T> {
  if (timeoutMs <= 0) return work;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name}: timed out after ${timeoutMs}ms`)), timeoutMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function section<T>(
  db: Db,
  name: string,
  sql: string,
  map: (rows: Record<string, unknown>[]) => T,
  timeoutMs: number,
): Promise<Section<T | null>> {
  try {
    const rows = await withTimeout(db.query<Record<string, unknown>>(sql), timeoutMs, name);
    return { value: map(rows), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { value: null, error: `${name}: ${message}` };
  }
}

function mapTable(row: Record<string, unknown>): TableStats {
  return {
    schemaname: String(row.schemaname),
    relname: String(row.relname),
    n_tup_ins: num(row.n_tup_ins),
    n_tup_upd: num(row.n_tup_upd),
    n_tup_hot_upd: num(row.n_tup_hot_upd),
    n_tup_del: num(row.n_tup_del),
  };
}

function mapView(row: Record<string, unknown> | undefined): Record<string, number | string | null> | null {
  if (!row) return null;
  const out: Record<string, number | string | null> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "stats_reset") out[key] = stamp(value);
    else if (COUNTER_KEYS.includes(key as (typeof COUNTER_KEYS)[number])) out[key] = num(value);
  }
  return out;
}

function mapStatement(row: Record<string, unknown>): StatementStats {
  return {
    queryid: String(row.queryid),
    calls: num(row.calls),
    rows: num(row.rows),
    wal_bytes: num(row.wal_bytes),
    total_exec_time: num(row.total_exec_time),
  };
}

function mapActivity(row: Record<string, unknown>): ActivityGroup {
  return {
    state: String(row.state),
    backend_type: String(row.backend_type),
    wait_event_type: String(row.wait_event_type),
    wait_event: String(row.wait_event),
    n: num(row.n),
    max_xact_age_ms: nullableNum(row.max_xact_age_ms),
    max_query_age_ms: nullableNum(row.max_query_age_ms),
    idle_in_transaction: num(row.idle_in_transaction),
  };
}

export async function collectOnce(
  db: Db,
  collectedAt = new Date().toISOString(),
  timeoutMs = DEFAULT_SECTION_TIMEOUT_MS,
): Promise<Snapshot> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0) {
    throw new Error("section timeout must be a non-negative integer");
  }
  // Sequential, statements last. A slow statements view cannot start before
  // the cheap counters are collected, and it cannot run beside them.
  const postmaster = await section(db, "postmaster", SNAPSHOT_SQL.postmaster, (rows) => stamp(rows[0]?.postmaster_start), timeoutMs);
  const tables = await section(db, "tables", SNAPSHOT_SQL.tables, (rows) => rows.map(mapTable), timeoutMs);
  const bgwriter = await section(db, "bgwriter", SNAPSHOT_SQL.bgwriter, (rows) => mapView(rows[0]), timeoutMs);
  const checkpointer = await section(db, "checkpointer", SNAPSHOT_SQL.checkpointer, (rows) => mapView(rows[0]), timeoutMs);
  const database = await section(db, "database", SNAPSHOT_SQL.database, (rows) => mapView(rows[0]), timeoutMs);
  const activity = await section(db, "activity", SNAPSHOT_SQL.activity, (rows) => rows.map(mapActivity), timeoutMs);
  const statements = await section(db, "statements", SNAPSHOT_SQL.statements, (rows) => rows.map(mapStatement), timeoutMs);

  const parts = { postmaster, tables, bgwriter, checkpointer, database, statements, activity };
  const errors = Object.values(parts)
    .map((part) => part.error)
    .filter((error): error is string => error != null);
  const missing = Object.entries(parts)
    .filter(([, part]) => part.value == null)
    .map(([name]) => name);

  return {
    collectedAt,
    postmasterStart: postmaster.value,
    tables: tables.value ?? [],
    bgwriter: bgwriter.value,
    checkpointer: checkpointer.value,
    database: database.value,
    statements: statements.value ?? [],
    activity: activity.value ?? [],
    missing,
    errors,
  };
}

export function serializeSnapshot(snapshot: Snapshot, previous: Snapshot | null): string {
  const delta = previous ? diffSnapshots(previous, snapshot) : null;
  return `${JSON.stringify({ snapshot, delta })}\n`;
}

/** Append one JSON line to a file outside PostgreSQL. The path must be absolute. */
export function appendSnapshotFile(filePath: string, snapshot: Snapshot, previous: Snapshot | null): void {
  if (!path.isAbsolute(filePath)) {
    throw new Error("snapshot file path must be absolute so it is not stored in the database");
  }
  fs.appendFileSync(filePath, serializeSnapshot(snapshot, previous), "utf8");
}

export type SampleResult =
  | { skipped: false; snapshot: Snapshot }
  | { skipped: true; reason: "overlap" };

/**
 * One dedicated connection, one collect at a time. Sets statement_timeout
 * for that session only and restores the previous value. Does not start a timer.
 */
export function createSnapshotSampler(db: Db, options?: { timeoutMs?: number }) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_SECTION_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("section timeout must be a positive integer");
  }
  let running = false;
  return {
    async collect(collectedAt?: string): Promise<SampleResult> {
      if (running) return { skipped: true, reason: "overlap" };
      running = true;
      let previousTimeout = "0";
      try {
        const current = await db.query<{ statement_timeout: string }>(
          "SELECT current_setting('statement_timeout') AS statement_timeout",
        );
        const reported = String(current[0]?.statement_timeout ?? "0");
        previousTimeout = /^[0-9]+(?:ms|s|min|h)?$/.test(reported) ? reported : "0";
        await db.query(`SELECT set_config('statement_timeout', '${timeoutMs}ms', false) AS statement_timeout`);
        const snapshot = await collectOnce(db, collectedAt ?? new Date().toISOString(), timeoutMs);
        return { skipped: false, snapshot };
      } finally {
        try {
          const restored = previousTimeout.replace(/'/g, "''");
          await db.query(`SELECT set_config('statement_timeout', '${restored}', false) AS statement_timeout`);
        } catch {
          // The session is already unusable. Do not start another collect to retry it.
        } finally {
          running = false;
        }
      }
    },
  };
}
