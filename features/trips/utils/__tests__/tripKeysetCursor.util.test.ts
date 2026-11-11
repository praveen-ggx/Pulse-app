import {
  nextTripKeysetCursor,
  readUntilVisibleTripPage,
  shouldAutoLoadOlderPodPage,
  tripKeysetBeforeFilter,
  TRIP_LIST_EMPTY_PAGE_HOPS,
  TRIP_LIST_PAGE_SIZE,
} from "../tripKeysetCursor.util";

type RawTrip = { created_at: string; id: string; eligible: boolean };

function pageOf(rows: RawTrip[], cursor: { createdAt: string; id: string } | null, pageSize: number) {
  const start = cursor
    ? rows.findIndex(
        (row) =>
          row.created_at < cursor.createdAt ||
          (row.created_at === cursor.createdAt && row.id < cursor.id),
      )
    : 0;
  const slice = rows.slice(start < 0 ? rows.length : start, (start < 0 ? rows.length : start) + pageSize);
  return {
    raw: slice,
    visible: slice.filter((row) => row.eligible),
    nextCursor: nextTripKeysetCursor(slice, pageSize),
  };
}

describe("trip keyset cursor", () => {
  it("uses a quoted created_at and id predicate", () => {
    expect(
      tripKeysetBeforeFilter({
        createdAt: "2026-11-11T08:00:00.000Z",
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
    ).toBe(
      'created_at.lt."2026-11-11T08:00:00.000Z",and(created_at.eq."2026-11-11T08:00:00.000Z",id.lt."bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")',
    );
  });

  it("stops when the page is short", () => {
    expect(
      nextTripKeysetCursor(
        [{ created_at: "2026-11-11T08:00:00.000Z", id: "a" }],
        TRIP_LIST_PAGE_SIZE,
      ),
    ).toBeNull();
  });

  it("cursors the last row of a full page, including a duplicate timestamp", () => {
    const rows = [
      { created_at: "2026-11-11T08:00:00.000Z", id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      { created_at: "2026-11-11T08:00:00.000Z", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    ];
    expect(nextTripKeysetCursor(rows, 2)).toEqual({
      createdAt: "2026-11-11T08:00:00.000Z",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("does not invent a cursor when the tie-breaker is missing", () => {
    expect(
      nextTripKeysetCursor([{ created_at: "2026-11-11T08:00:00.000Z", id: null }], 1),
    ).toBeNull();
  });

  it("keeps reading after pages that contain no eligible rows", async () => {
    const rows: RawTrip[] = [
      ...Array.from({ length: 250 }, (_, index) => ({
        created_at: "2026-11-11T08:00:00.000Z",
        id: `b-${String(300 - index).padStart(3, "0")}`,
        eligible: false,
      })),
      {
        created_at: "2026-11-11T08:00:00.000Z",
        id: "b-001",
        eligible: true,
      },
      {
        created_at: "2026-11-10T08:00:00.000Z",
        id: "a-001",
        eligible: true,
      },
    ];
    const seen: string[] = [];
    let cursor: { createdAt: string; id: string } | null = null;
    while (seen.length < 2) {
      const page = await readUntilVisibleTripPage({
        initialCursor: cursor,
        maxPages: TRIP_LIST_EMPTY_PAGE_HOPS,
        fetchPage: async (current) => {
          const next = pageOf(rows, current, 100);
          return { error: null, visible: next.visible, nextCursor: next.nextCursor };
        },
      });
      expect(page.error).toBeNull();
      seen.push(...page.trips.map((row) => row.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(["b-001", "a-001"]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("stops at the hop cap and keeps the raw cursor", async () => {
    let calls = 0;
    const page = await readUntilVisibleTripPage({
      initialCursor: null,
      maxPages: 3,
      fetchPage: async () => {
        calls += 1;
        return {
          error: null,
          visible: [],
          nextCursor: { createdAt: `2026-11-11T08:00:0${calls}.000Z`, id: `id-${calls}` },
        };
      },
    });
    expect(calls).toBe(3);
    expect(page.trips).toEqual([]);
    expect(page.nextCursor).toEqual({ createdAt: "2026-11-11T08:00:03.000Z", id: "id-3" });
  });

  it("does not request another page once a visible row is found", async () => {
    let calls = 0;
    const page = await readUntilVisibleTripPage({
      initialCursor: null,
      maxPages: 5,
      fetchPage: async () => {
        calls += 1;
        return {
          error: null,
          visible: calls === 2 ? [{ id: "eligible" }] : [],
          nextCursor: { createdAt: "2026-11-11T08:00:00.000Z", id: `id-${calls}` },
        };
      },
    });
    expect(calls).toBe(2);
    expect(page.trips).toEqual([{ id: "eligible" }]);
    expect(page.nextCursor?.id).toBe("id-2");
  });

  it("returns a mid-walk error instead of an empty finished list", async () => {
    const page = await readUntilVisibleTripPage({
      initialCursor: null,
      maxPages: 5,
      fetchPage: async (cursor) => {
        if (cursor) {
          return { error: new Error("page failed"), visible: [], nextCursor: null };
        }
        return {
          error: null,
          visible: [],
          nextCursor: { createdAt: "2026-11-11T08:00:00.000Z", id: "id-1" },
        };
      },
    });
    expect(page.error?.message).toBe("page failed");
    expect(page.trips).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("does not auto-load when a tab already has rows, a fetch failed, or the hop cap is reached", () => {
    const base = {
      hasParty: true,
      visibleCount: 0,
      hasNextPage: true,
      busy: false,
      failed: false,
      hops: 0,
    };
    expect(shouldAutoLoadOlderPodPage(base)).toBe(true);
    expect(shouldAutoLoadOlderPodPage({ ...base, visibleCount: 2 })).toBe(false);
    expect(shouldAutoLoadOlderPodPage({ ...base, failed: true })).toBe(false);
    expect(shouldAutoLoadOlderPodPage({ ...base, busy: true })).toBe(false);
    expect(shouldAutoLoadOlderPodPage({ ...base, hasParty: false })).toBe(false);
    expect(shouldAutoLoadOlderPodPage({ ...base, hops: TRIP_LIST_EMPTY_PAGE_HOPS })).toBe(false);
  });

  it("keeps earlier pages when a later filter matches nothing on the newest page", async () => {
    const rows: RawTrip[] = [
      { created_at: "2026-11-11T08:00:00.000Z", id: "pending-new", eligible: true },
      { created_at: "2026-11-10T08:00:00.000Z", id: "completed-old", eligible: false },
    ];
    const loaded: RawTrip[] = [];
    let cursor: { createdAt: string; id: string } | null = null;
    while (loaded.length < rows.length) {
      const next = pageOf(rows, cursor, 1);
      loaded.push(...next.raw);
      cursor = next.nextCursor;
      if (!cursor) break;
    }
    expect(loaded.map((row) => row.id)).toEqual(["pending-new", "completed-old"]);
    expect(loaded.filter((row) => row.eligible).map((row) => row.id)).toEqual(["pending-new"]);
    expect(loaded.filter((row) => !row.eligible).map((row) => row.id)).toEqual(["completed-old"]);
  });
});
