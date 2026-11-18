import {
  buildActiveHubRailCounts,
  filterHubTripsForActiveList,
  filterHubTripsForHistoryList,
  hubActiveAllTripCount,
  hubActiveRailMetric,
  hubCountText,
  hubHistoryPodMetricIds,
  hubSoftPodCheckedTripIds,
  hubSoftPodChipState,
  hubHistoryTripCount,
  hubShowingCountLabel,
  hubTabTripCounts,
  hubTripBucket,
  hubTripCompletenessNote,
  isOpenActiveHubTrip,
  resolveHubTripDataset,
} from "@/features/trips/utils/hubTripListCounts.util";
import { buildOrgHubExactCounts } from "@/features/trips/utils/hubExactCounts.util";
import { tripDayMatchesHubDateFilter } from "@/lib/dateRangePresets";
import type { TripRow } from "@/features/trips/services/trips.service";

function trip(overrides: Partial<TripRow>): TripRow {
  return {
    id: overrides.id ?? "t",
    status: overrides.status ?? "assigned",
    driver_id: overrides.driver_id ?? "d1",
    ...overrides,
  } as TripRow;
}

const SOURCE = [
  trip({ id: "open-unassigned", status: "assigned", driver_id: null }),
  trip({ id: "open-assigned", status: "assigned", driver_id: "d1" }),
  trip({ id: "open-loading", status: "in_progress", driver_id: "d1" }),
  trip({ id: "open-transit", status: "in_transit", driver_id: "d1" }),
  trip({ id: "open-unload", status: "at_drop", driver_id: "d1" }),
  trip({ id: "open-docs", status: "at_destination", driver_id: "d1" }),
  trip({ id: "done", status: "completed", driver_id: "d1" }),
  trip({ id: "delivered", status: "delivered", driver_id: "d1" }),
  trip({ id: "cancelled", status: "cancelled", driver_id: null }),
];

const DOCS = new Set(["open-docs"]);

describe("canonical hub trip classification", () => {
  it("normalises case and whitespace", () => {
    expect(hubTripBucket(" Completed ")).toBe("history");
    expect(hubTripBucket("DELIVERED")).toBe("history");
    expect(hubTripBucket("done\n")).toBe("history");
    expect(hubTripBucket(" CANCELLED")).toBe("cancelled");
    expect(hubTripBucket("In_Transit ")).toBe("active");
    expect(hubTripBucket(null)).toBe("active");
    expect(hubTripBucket("")).toBe("active");
  });

  it("splits mixed open / completed / delivered / done / cancelled rows", () => {
    const rows = [
      trip({ id: "a", status: "assigned" }),
      trip({ id: "b", status: "IN_TRANSIT" }),
      trip({ id: "c", status: "completed" }),
      trip({ id: "d", status: " Delivered" }),
      trip({ id: "e", status: "done" }),
      trip({ id: "f", status: "Cancelled" }),
      trip({ id: "g", status: "draft", driver_id: null }),
    ];
    expect(hubTabTripCounts(rows)).toEqual({ active: 3, history: 3, cancelled: 1 });
    expect(filterHubTripsForActiveList(rows).map((r) => r.id)).toEqual(["a", "b", "g"]);
    expect(filterHubTripsForHistoryList(rows).map((r) => r.id)).toEqual(["c", "d", "e"]);
  });

  it("cancelled trips are in neither Active nor History", () => {
    const counts = hubTabTripCounts(SOURCE);
    expect(filterHubTripsForActiveList(SOURCE).some((r) => r.id === "cancelled")).toBe(false);
    expect(filterHubTripsForHistoryList(SOURCE).some((r) => r.id === "cancelled")).toBe(false);
    expect(counts.active + counts.history + counts.cancelled).toBe(SOURCE.length);
  });

  it("POD / document state never moves a trip between Active and History", () => {
    const withPod = trip({
      id: "pod-on-file",
      status: "at_destination",
      pod_received_at: "2026-10-20T10:00:00Z",
    } as Partial<TripRow>);
    const completedNoDocs = trip({ id: "completed-no-docs", status: "completed" });
    const docs = new Set(["pod-on-file"]);
    expect(isOpenActiveHubTrip(withPod.status)).toBe(true);
    expect(filterHubTripsForHistoryList([withPod, completedNoDocs]).map((r) => r.id)).toEqual([
      "completed-no-docs",
    ]);
    const rail = buildActiveHubRailCounts([withPod, completedNoDocs], docs);
    // Open trip with POD stays on Unloading; Delivered is the completed (History) trip.
    expect(rail.unloading).toBe(1);
    expect(rail.delivered_docs_pending).toBe(1);
    expect(hubActiveRailMetric(withPod, docs)).toBe("unloading");
    expect(hubActiveAllTripCount(rail)).toBe(1);
    // Same rows without docs: same Active / History split.
    expect(hubTabTripCounts([withPod, completedNoDocs])).toEqual({
      active: 1,
      history: 1,
      cancelled: 0,
    });
  });
});

describe("Active rail", () => {
  it("open tiles and ALL derive from the Active set only", () => {
    const active = filterHubTripsForActiveList(SOURCE);
    const rail = buildActiveHubRailCounts(SOURCE, DOCS);
    expect(rail).toEqual({
      indent: 0,
      unassigned: 1,
      assigned: 1,
      loading: 1,
      in_transit: 1,
      unloading: 2,
      delivered_docs_pending: 2,
    });
    expect(hubActiveAllTripCount(rail)).toBe(active.length);
    expect(hubActiveAllTripCount(rail)).toBe(hubTabTripCounts(SOURCE).active);
    for (const t of active) {
      expect(hubActiveRailMetric(t, DOCS)).not.toBe("delivered_docs_pending");
    }
  });

  it("Delivered tile always equals the History count", () => {
    const rail = buildActiveHubRailCounts(SOURCE, DOCS);
    expect(rail.delivered_docs_pending).toBe(hubHistoryTripCount(SOURCE));
    expect(rail.delivered_docs_pending).toBe(hubTabTripCounts(SOURCE).history);
    // Cancelled is in neither.
    const onlyCancelled = buildActiveHubRailCounts([trip({ status: "cancelled" })], DOCS);
    expect(onlyCancelled.delivered_docs_pending).toBe(0);
    expect(hubActiveAllTripCount(onlyCancelled)).toBe(0);
  });

  it("metric counts follow the selected date filter", () => {
    const now = new Date("2026-10-27T06:00:00Z");
    const rows = [
      trip({ id: "today-open", status: "in_transit", created_at: "2026-10-27T04:00:00Z" }),
      trip({ id: "today-done", status: "completed", created_at: "2026-10-27T05:00:00Z" }),
      trip({ id: "old-open", status: "assigned", created_at: "2026-09-02T04:00:00Z" }),
      trip({ id: "old-done", status: "completed", created_at: "2026-09-03T04:00:00Z" }),
    ];
    const dated = rows.filter((r) =>
      tripDayMatchesHubDateFilter(r, "today", undefined, now),
    );
    expect(dated.map((r) => r.id)).toEqual(["today-open", "today-done"]);
    const rail = buildActiveHubRailCounts(dated, new Set());
    expect(rail.delivered_docs_pending).toBe(1);
    expect(hubActiveAllTripCount(rail)).toBe(1);
    expect(rail.in_transit).toBe(1);
    expect(rail.assigned).toBe(0);
    expect(hubTabTripCounts(dated)).toEqual({ active: 1, history: 1, cancelled: 0 });
  });
});

describe("Showing X of Y", () => {
  it("never prints X > Y", () => {
    for (let shown = 0; shown <= 30; shown += 1) {
      for (let total = 0; total <= 30; total += 1) {
        for (const partial of [false, true]) {
          const label = hubShowingCountLabel({ shown, total, partial });
          const m = /^Showing (\d+) of (\d+)(\+?)$/.exec(label);
          expect(m).not.toBeNull();
          expect(Number(m![1])).toBeLessThanOrEqual(Number(m![2]));
          if (shown > total) expect(m![3]).toBe("+");
        }
      }
    }
  });

  it("screenshot case: History list against the Active total", () => {
    // Before: tripsHubAllToolbarCountLabel({ visibleTripCount: 312, dateFilteredTripCount: 88 })
    // printed "Showing 312 of 88" on History. History now uses the History total.
    expect(hubShowingCountLabel({ shown: 312, total: 312, partial: false })).toBe(
      "Showing 312 of 312",
    );
    expect(hubShowingCountLabel({ shown: 312, total: 88, partial: false })).toBe(
      "Showing 312 of 312+",
    );
  });

  it("appends the Partial warning so every list view shows it", () => {
    const note = hubTripCompletenessNote("error");
    expect(hubShowingCountLabel({ shown: 7, total: 7, partial: true, note })).toBe(
      "Showing 7 of 7+ · Partial: couldn't load all trips (newest 400 shown)",
    );
    expect(
      hubShowingCountLabel({ shown: 7, total: 7, partial: false, note: hubTripCompletenessNote("exact") }),
    ).toBe("Showing 7 of 7");
  });

  it("partial totals carry a + marker", () => {
    expect(hubCountText(88, true)).toBe("88+");
    expect(hubCountText(88, false)).toBe("88");
  });
});

describe("dataset beyond the 400-row default list", () => {
  // Mirrors prod org 5b471ecb on 2026-10-28: 856 visible trips, 101 open, 755 completed.
  // Newest 400 by created_at held 88 open + 312 completed.
  function buildOrg(): TripRow[] {
    const rows: TripRow[] = [];
    const base = Date.parse("2026-10-27T12:00:00Z");
    for (let i = 0; i < 856; i += 1) {
      const newest = i < 400;
      const open = newest ? i < 88 : i - 400 < 13;
      rows.push(
        trip({
          id: `t${i}`,
          status: open ? "in_transit" : "completed",
          created_at: new Date(base - i * 3_600_000).toISOString(),
        }),
      );
    }
    return rows;
  }

  it("exact counts include older matching trips", () => {
    const all = buildOrg();
    const newest400 = all.slice(0, 400);
    const ds = resolveHubTripDataset({
      rangeRows: all,
      rangeFetched: true,
      rangeError: false,
      newestRows: newest400,
    });
    expect(ds.completeness).toBe("exact");
    expect(hubTripCompletenessNote(ds.completeness)).toBeNull();
    expect(hubTabTripCounts(ds.trips)).toEqual({ active: 101, history: 755, cancelled: 0 });
    const rail = buildActiveHubRailCounts(ds.trips as TripRow[], new Set());
    expect(rail.delivered_docs_pending).toBe(755);
    expect(hubActiveAllTripCount(rail)).toBe(101);
    // Before the fix the badges came from the newest 400 only.
    expect(hubTabTripCounts(newest400)).toEqual({ active: 88, history: 312, cancelled: 0 });
  });

  it("while loading or after an error the 400-row fallback is labelled partial", () => {
    const all = buildOrg();
    const newest400 = all.slice(0, 400);
    for (const state of [
      { rangeFetched: false, rangeError: false, expected: "loading" },
      { rangeFetched: false, rangeError: true, expected: "error" },
    ] as const) {
      const ds = resolveHubTripDataset({
        rangeRows: [],
        rangeFetched: state.rangeFetched,
        rangeError: state.rangeError,
        newestRows: newest400,
      });
      expect(ds.completeness).toBe(state.expected);
      expect(ds.trips).toBe(newest400);
      expect(hubTripCompletenessNote(ds.completeness)).toMatch(/^Partial:/);
      const { history } = hubTabTripCounts(ds.trips);
      expect(hubShowingCountLabel({ shown: history, total: history, partial: true })).toBe(
        "Showing 312 of 312+",
      );
    }
  });

  it("a 2000-row dated page is capped, not exact", () => {
    const rows = Array.from({ length: 2000 }, (_, i) => trip({ id: `c${i}` }));
    const ds = resolveHubTripDataset({
      rangeRows: rows,
      rangeFetched: true,
      rangeError: false,
      newestRows: [],
    });
    expect(ds.completeness).toBe("capped");
    expect(hubTripCompletenessNote(ds.completeness)).toBe(
      "Partial: newest 2000 matching trips loaded",
    );
  });

  it("paging the list does not change the authoritative total", () => {
    const all = buildOrg();
    const history = filterHubTripsForHistoryList(all);
    const pageSize = 50;
    for (let page = 0; page * pageSize < history.length; page += 1) {
      const pageRows = history.slice(page * pageSize, (page + 1) * pageSize);
      expect(pageRows.length).toBeLessThanOrEqual(pageSize);
      expect(hubShowingCountLabel({ shown: history.length, total: hubTabTripCounts(all).history, partial: false })).toBe(
        "Showing 755 of 755",
      );
    }
  });
});

describe("History POD cards", () => {
  it("omits Pending soft POD when document flags are not loaded (History)", () => {
    // GOGOVAN 2026-10-28: 688 of 755 completed trips had a document, yet the card read 755.
    expect(hubHistoryPodMetricIds(false)).toEqual(["pending_hard_pod"]);
    expect(hubHistoryPodMetricIds(true)).toEqual(["pending_soft_pod", "pending_hard_pod"]);
  });

  it("Soft chip is unknown (hidden), not red, when flags are not loaded", () => {
    expect(hubSoftPodChipState(false, false)).toBeNull();
    expect(hubSoftPodChipState(true, false)).toBe(false);
    expect(hubSoftPodChipState(true, true)).toBe(true);
  });

  it("only trips whose flags were fetched count as checked", () => {
    // Active loads flags for open trips; the Delivered tile lists completed ones.
    const checked = hubSoftPodCheckedTripIds([
      { loaded: true, tripIds: ["Open-1", " open-2 ", ""] },
      { loaded: false, tripIds: ["older-hit"] },
    ]);
    expect([...checked].sort()).toEqual(["open-1", "open-2"]);
    expect(hubSoftPodChipState(checked.has("completed-1"), false)).toBeNull();
    expect(hubSoftPodChipState(checked.has("open-1"), false)).toBe(false);
  });
});

describe("indents stay out of trip counts", () => {
  it("indent rows never change Active, History or ALL", () => {
    const facts = SOURCE.map((t) => ({
      id: t.id,
      status: t.status ?? null,
      driver_id: (t.driver_id as string | null) ?? null,
      indent_id: t.id === "open-assigned" ? "ind-allocated" : null,
      pickup_date: null,
      created_at: "2026-10-20T04:00:00Z",
    }));
    const withoutIndents = buildOrgHubExactCounts(
      { trips: facts, documentTripIds: ["open-docs"], indents: [] },
      { dateRangeFilter: "all" },
    );
    const withIndents = buildOrgHubExactCounts(
      {
        trips: facts,
        documentTripIds: ["open-docs"],
        indents: [
          { id: "ind-allocated", status: "open", pickup_date: null, created_at: "2026-10-20" },
          { id: "ind-open-1", status: "open", pickup_date: null, created_at: "2026-10-20" },
          { id: "ind-open-2", status: "draft", pickup_date: null, created_at: "2026-10-20" },
          { id: "ind-done", status: "completed", pickup_date: null, created_at: "2026-10-20" },
        ],
      },
      { dateRangeFilter: "all" },
    );
    expect(withIndents.active).toBe(withoutIndents.active);
    expect(withIndents.history).toBe(withoutIndents.history);
    expect(withIndents.allActive).toBe(withoutIndents.allActive);
    expect(withIndents.allActive).toBe(6);
    expect(withIndents.history).toBe(2);
    expect(withIndents.metrics.indent).toBe(2);
    const { indent: _indent, ...tripTiles } = withIndents.metrics;
    const { indent: _none, ...tripTilesNoIndents } = withoutIndents.metrics;
    expect(tripTiles).toEqual(tripTilesNoIndents);
  });
});
