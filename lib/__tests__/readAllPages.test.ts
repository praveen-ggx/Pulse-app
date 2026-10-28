import { createFakePostgrest, fakeUuid, shuffled, type FakeRow } from "@/lib/__tests__/fakePostgrest";
import { chunkIdsForRead, READ_ALL_PAGE_SIZE, readAllPages } from "@/lib/pagination";

type Row = { id: string; org: string };

function seed(server: ReturnType<typeof createFakePostgrest>, total: number, org = "org-1"): Row[] {
  const rows = Array.from({ length: total }, (_, i) => ({ id: fakeUuid(i * 10), org }));
  server.tables.items = [...(server.tables.items ?? []), ...shuffled(rows)];
  return rows;
}

function readOrg(server: ReturnType<typeof createFakePostgrest>, org = "org-1") {
  return readAllPages<Row, { message: string }>((afterId, limit) => {
    const q = server.client.from("items") as unknown as {
      select: (c: string) => typeof q;
      eq: (c: string, v: unknown) => typeof q;
      gt: (c: string, v: string) => typeof q;
      order: (c: string, o: { ascending: boolean }) => typeof q;
      limit: (n: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
    };
    let query = q.select("id, org").eq("org", org);
    if (afterId) query = query.gt("id", afterId);
    return query.order("id", { ascending: true }).limit(limit);
  });
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("readAllPages (keyset)", () => {
  it.each([0, 1, 499, 500, 501, 999, 1000, 1001, 1445, 2542])(
    "returns all %i rows once each, with a 1000-row server cap",
    async (total) => {
      const server = createFakePostgrest();
      const rows = seed(server, total);
      const { data, error } = await readOrg(server);
      expect(error).toBeNull();
      expect(ids(data)).toEqual(ids(rows));
      expect(new Set(data.map((r) => r.id)).size).toBe(total);
      // Full pages + the terminating empty page.
      expect(server.requests).toHaveLength(Math.ceil(total / READ_ALL_PAGE_SIZE) + 1);
      expect(server.requests.at(-1)?.afterId ?? null).toBe(total ? data.at(-1)?.id : null);
    },
  );

  it("still reads everything when the server cap is below the page size", async () => {
    const server = createFakePostgrest({ maxRows: 300 });
    const rows = seed(server, 1445);
    const { data, error } = await readOrg(server);
    expect(error).toBeNull();
    expect(ids(data)).toEqual(ids(rows));
    expect(server.requests).toHaveLength(Math.ceil(1445 / 300) + 1);
  });

  it("keeps the tenant filter on every page and never returns another org's rows", async () => {
    const server = createFakePostgrest();
    const mine = seed(server, 1200, "org-1");
    seed(server, 900, "org-2");
    const { data } = await readOrg(server, "org-1");
    expect(ids(data)).toEqual(ids(mine));
    expect(server.requests.every((r) => r.filters.includes("org=eq.org-1"))).toBe(true);
  });

  it("a delete between pages does not shift later pages (no surviving row skipped)", async () => {
    const server = createFakePostgrest();
    const rows = seed(server, 1500);
    server.state.beforeResponse = (_req, n) => {
      if (n === 2) {
        // Delete rows already returned on page 1 and one not yet read.
        const gone = new Set([rows[0].id, rows[10].id, rows[900].id]);
        server.tables.items = (server.tables.items as FakeRow[]).filter((r) => !gone.has(String(r.id)));
      }
    };
    const { data, error } = await readOrg(server);
    expect(error).toBeNull();
    const got = new Set(data.map((r) => r.id));
    expect(got.size).toBe(data.length);
    // Every row that still exists after the delete was returned.
    for (const row of server.tables.items as FakeRow[]) expect(got.has(String(row.id))).toBe(true);
    expect(got.has(rows[900].id)).toBe(false);
  });

  it("an insert between pages: after the cursor is read, before the cursor is not (documented)", async () => {
    const server = createFakePostgrest();
    seed(server, 1200);
    const late = { id: fakeUuid(11_995), org: "org-1" }; // sorts after page 1
    const early = { id: fakeUuid(5), org: "org-1" }; // sorts before the cursor
    server.state.beforeResponse = (_req, n) => {
      if (n === 2) (server.tables.items as FakeRow[]).push(late, early);
    };
    const { data } = await readOrg(server);
    const got = new Set(data.map((r) => r.id));
    expect(got.size).toBe(data.length);
    expect(got.has(late.id)).toBe(true);
    expect(got.has(early.id)).toBe(false);
  });

  it("returns the error and no rows when a later page fails", async () => {
    const server = createFakePostgrest();
    seed(server, 1500);
    server.state.failRequest = (_req, n) => n === 3;
    expect(await readOrg(server)).toEqual({ data: [], error: { message: "fake page failure" } });
  });

  it("errors instead of looping when the cursor does not advance", async () => {
    let calls = 0;
    const page = [{ id: fakeUuid(1) }, { id: fakeUuid(2) }];
    const result = await readAllPages(async () => {
      calls += 1;
      return { data: page, error: null };
    });
    expect(result.data).toEqual([]);
    expect(result.error).toBeInstanceOf(Error);
    expect(calls).toBe(2);
  });
});

describe("chunkIdsForRead", () => {
  it("de-duplicates, drops blanks and chunks", () => {
    const list = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const chunks = chunkIdsForRead([...list, "id-0", ""], 100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(list);
  });
});
