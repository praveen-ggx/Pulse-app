/**
 * In-memory PostgREST stand-in for pagination tests (not a test file itself).
 *
 * Behaves like the prod API where it matters for "read everything" loops:
 * filters (eq / neq / in / is / not-is-null / gt), `order` on one column,
 * `limit`, `range`, and a server-side `max_rows` cap applied to every response
 * without an error. Filters are evaluated when the request resolves, so
 * `beforeResponse` can insert/delete rows "between pages".
 */
export type FakeRow = Record<string, unknown>;

export type FakeRequest = {
  table: string;
  filters: string[];
  afterId: string | null;
  limit: number | null;
  /** Ids sent in an `.in(col, …)` filter, by column. */
  inSizes: Record<string, number>;
  /** Patch of an `.update(…)` request. */
  update?: FakeRow;
};

type Result = { data: unknown; error: { message: string; code?: string } | null };

export function createFakePostgrest(options: { maxRows?: number } = {}) {
  const maxRows = options.maxRows ?? 1000;
  const tables: Record<string, FakeRow[]> = {};
  const requests: FakeRequest[] = [];
  const state: {
    beforeResponse: ((req: FakeRequest, requestNumber: number) => void) | null;
    failRequest: ((req: FakeRequest, requestNumber: number) => boolean) | null;
    rpc: ((name: string, args: Record<string, unknown>) => Result) | null;
  } = { beforeResponse: null, failRequest: null, rpc: null };

  function from(table: string) {
    const req: FakeRequest = { table, filters: [], afterId: null, limit: null, inSizes: {} };
    const predicates: Array<(row: FakeRow) => boolean> = [];
    let orderColumn: string | null = null;
    let range: [number, number] | null = null;
    let single = false;
    const builder: Record<string, unknown> = {};

    builder.select = () => builder;
    builder.update = (patch: FakeRow) => {
      req.update = patch;
      return builder;
    };
    builder.eq = (col: string, val: unknown) => {
      req.filters.push(`${col}=eq.${String(val)}`);
      predicates.push((row) => row[col] === val);
      return builder;
    };
    builder.neq = (col: string, val: unknown) => {
      req.filters.push(`${col}=neq.${String(val)}`);
      predicates.push((row) => row[col] !== val);
      return builder;
    };
    builder.in = (col: string, vals: unknown[]) => {
      req.filters.push(`${col}=in.(${vals.length})`);
      req.inSizes[col] = vals.length;
      predicates.push((row) => vals.includes(row[col]));
      return builder;
    };
    builder.is = (col: string, val: null) => {
      req.filters.push(`${col}=is.${String(val)}`);
      predicates.push((row) => (row[col] ?? null) === val);
      return builder;
    };
    builder.not = (col: string, op: string, val: null) => {
      if (op !== "is" || val !== null) throw new Error(`fake: unsupported not(${col}, ${op})`);
      req.filters.push(`${col}=not.is.null`);
      predicates.push((row) => row[col] != null);
      return builder;
    };
    builder.gt = (col: string, val: string) => {
      req.filters.push(`${col}=gt.${val}`);
      if (col === "id") req.afterId = val;
      predicates.push((row) => String(row[col]) > val);
      return builder;
    };
    builder.order = (col: string) => {
      orderColumn = col;
      return builder;
    };
    builder.limit = (n: number) => {
      req.limit = n;
      return builder;
    };
    builder.range = (fromIndex: number, toIndex: number) => {
      range = [fromIndex, toIndex];
      return builder;
    };
    builder.maybeSingle = () => {
      single = true;
      return builder;
    };
    builder.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) => {
      requests.push(req);
      const n = requests.length;
      state.beforeResponse?.(req, n);
      if (state.failRequest?.(req, n)) {
        return Promise.resolve<Result>({ data: null, error: { message: "fake page failure" } }).then(resolve, reject);
      }
      let rows = (tables[table] ?? []).filter((row) => predicates.every((p) => p(row)));
      if (req.update) {
        for (const row of rows) Object.assign(row, req.update);
        return Promise.resolve<Result>({ data: null, error: null }).then(resolve, reject);
      }
      if (orderColumn) {
        const col = orderColumn;
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0));
      }
      if (range) rows = rows.slice(range[0], range[1] + 1);
      if (req.limit != null) rows = rows.slice(0, req.limit);
      rows = rows.slice(0, maxRows);
      const data = single ? (rows[0] ?? null) : rows.map((row) => ({ ...row }));
      return Promise.resolve<Result>({ data, error: null }).then(resolve, reject);
    };
    return builder;
  }

  const client = {
    from,
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise.resolve(
        state.rpc?.(name, args) ?? { data: null, error: { message: "fake: rpc not found", code: "PGRST202" } },
      ),
  };

  return { client, tables, requests, state };
}

/** Lowercase uuid whose string order equals numeric order of `n`. */
export function fakeUuid(n: number, prefix = 0): string {
  const hex = n.toString(16).padStart(12, "0");
  return `${prefix.toString(16).padStart(8, "0")}-0000-4000-8000-${hex}`;
}

/** Deterministic shuffle so insertion order never matches id order. */
export function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  let seed = 7;
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
