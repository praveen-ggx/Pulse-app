import {
  nextTripKeysetCursor,
  tripKeysetBeforeFilter,
  TRIP_LIST_PAGE_SIZE,
} from "../tripKeysetCursor.util";

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
});
