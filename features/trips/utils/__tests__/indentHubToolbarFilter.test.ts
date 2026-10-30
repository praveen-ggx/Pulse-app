import type { IndentRow } from "@/features/indents/services/indents.service";
import {
  countFailedHubReasons,
  filterFailedHubIndents,
  filterIndentsForTripsToolbar,
  indentMatchesHubDateFilter,
  indentMatchesHubSearch,
  mergeIndentSearchHits,
  mergeIndentsByLatestUpdate,
  tripsHubAllToolbarCountLabel,
} from "@/features/trips/utils/indentHubToolbarFilter";

function indent(partial: Partial<IndentRow> & Pick<IndentRow, "id">): IndentRow {
  return {
    organization_id: "org",
    pickup_area: "Chennai",
    drop_location: "Hyderabad",
    client_name: "Apple",
    client_price: 0,
    supplier_target: 0,
    status: "open",
    vehicle_type: "32ft",
    load_type: null,
    pickup_date: "2026-09-14",
    circulation_target: null,
    indent_number: "GODIND000001",
    created_at: "2026-09-14T10:00:00.000Z",
    ...partial,
  } as IndentRow;
}

describe("indentMatchesHubSearch", () => {
  it("matches client, route, and indent number without a new query", () => {
    const row = indent({ id: "a" });
    expect(indentMatchesHubSearch(row, "apple")).toBe(true);
    expect(indentMatchesHubSearch(row, "chennai")).toBe(true);
    expect(indentMatchesHubSearch(row, "godind")).toBe(true);
    expect(indentMatchesHubSearch(row, "nope")).toBe(false);
    expect(indentMatchesHubSearch(row, "  ")).toBe(true);
  });
});

describe("indentMatchesHubDateFilter", () => {
  it("reuses the trip hub date helper on pickup_date", () => {
    const row = indent({ id: "a", pickup_date: "2026-09-14" });
    expect(indentMatchesHubDateFilter(row, "all")).toBe(true);
    expect(
      indentMatchesHubDateFilter(row, "custom", {
        customFrom: "2026-09-14",
        customTo: "2026-09-14",
      }),
    ).toBe(true);
    expect(
      indentMatchesHubDateFilter(row, "custom", {
        customFrom: "2026-01-01",
        customTo: "2026-01-02",
      }),
    ).toBe(false);
  });
});

describe("filterIndentsForTripsToolbar", () => {
  it("filters the already-loaded set by date then search", () => {
    const rows = [
      indent({ id: "keep", client_name: "Apple", pickup_date: "2026-09-14" }),
      indent({
        id: "other-day",
        client_name: "Apple",
        pickup_date: "2026-08-01",
        created_at: "2026-08-01T10:00:00.000Z",
      }),
      indent({ id: "other-name", client_name: "Ajio", pickup_date: "2026-09-14" }),
    ];
    const out = filterIndentsForTripsToolbar(rows, {
      dateRangeFilter: "custom",
      customFrom: "2026-09-14",
      customTo: "2026-09-14",
      searchQuery: "apple",
    });
    expect(out.map((r) => r.id)).toEqual(["keep"]);
  });
});

describe("mergeIndentSearchHits", () => {
  it("leaves the loaded list untouched when the search adds nothing new", () => {
    const loaded = [indent({ id: "loaded" })];
    expect(mergeIndentSearchHits(loaded, [])).toBe(loaded);
    expect(mergeIndentSearchHits(loaded, [indent({ id: "loaded" })])).toBe(loaded);
  });

  it("appends a code hit the finite list did not load, once", () => {
    const loaded = [indent({ id: "loaded", indent_operational_code: "NEWCODE" })];
    const older = indent({
      id: "older",
      indent_operational_code: "SAT812GOGIND000788",
      indent_code: "SAT812-IND-787",
      indent_number: "IND787",
    });
    const merged = mergeIndentSearchHits(loaded, [older, older]);
    expect(merged.map((row) => row.id)).toEqual(["loaded", "older"]);
    expect(
      merged.filter((row) => indentMatchesHubSearch(row, "SAT812GOGIND000788")).map((row) => row.id),
    ).toEqual(["older"]);
    expect(
      filterIndentsForTripsToolbar(merged, {
        dateRangeFilter: "all",
        searchQuery: "nope",
      }).map((row) => row.id),
    ).toEqual([]);
  });
});

describe("tripsHubAllToolbarCountLabel", () => {
  it("counts trips only and ignores indent counts", () => {
    expect(
      tripsHubAllToolbarCountLabel({
        visibleIndentCount: 13,
        dateFilteredIndentCount: 13,
        visibleTripCount: 16,
        dateFilteredTripCount: 16,
      }),
    ).toBe("Showing 16 of 16");
  });
});

describe("mergeIndentsByLatestUpdate", () => {
  it("keeps older failed indents that the capped list does not have", () => {
    const old = indent({ id: "old", status: "expired", updated_at: "2026-10-12T17:47:00Z" });
    const recent = indent({ id: "new", status: "open", updated_at: "2026-10-20T10:00:00Z" });
    const merged = mergeIndentsByLatestUpdate([old], [recent]);
    expect(merged.map((i) => i.id).sort()).toEqual(["new", "old"]);
  });

  it("uses the most recently updated copy of the same indent", () => {
    const staleFailed = indent({ id: "a", status: "expired", updated_at: "2026-10-12T00:00:00Z" });
    const reactivated = indent({ id: "a", status: "open", updated_at: "2026-10-21T00:00:00Z" });
    expect(mergeIndentsByLatestUpdate([staleFailed], [reactivated])).toEqual([reactivated]);
    expect(mergeIndentsByLatestUpdate([reactivated], [staleFailed])).toEqual([reactivated]);
  });
});

describe("filterFailedHubIndents", () => {
  it("keeps cancelled and expired rows and drops live statuses", () => {
    const rows = [
      indent({ id: "open", status: "open" }),
      indent({ id: "awarded", status: "awarded" }),
      indent({ id: "cancelled", status: "cancelled", cancel_reason: "client_cancelled" }),
      indent({ id: "expired", status: "expired" }),
      indent({ id: "other-org", status: "cancelled", organization_id: "other" }),
    ];
    expect(
      filterFailedHubIndents(rows, {
        orgId: "org",
        dateRangeFilter: "all",
        searchQuery: "",
      }).map((row) => row.id),
    ).toEqual(["cancelled", "expired"]);
  });

  it("drops a failed row that later reactivated after merge", () => {
    const staleFailed = indent({
      id: "a",
      status: "expired",
      updated_at: "2026-10-12T00:00:00Z",
    });
    const reactivated = indent({
      id: "a",
      status: "open",
      updated_at: "2026-10-21T00:00:00Z",
    });
    const merged = mergeIndentsByLatestUpdate([staleFailed], [reactivated]);
    expect(
      filterFailedHubIndents(merged, {
        orgId: "org",
        dateRangeFilter: "all",
        searchQuery: "",
      }),
    ).toEqual([]);
  });

  it("drops failed indents that already have a trip", () => {
    expect(
      filterFailedHubIndents(
        [indent({ id: "linked", status: "cancelled" })],
        {
          orgId: "org",
          dateRangeFilter: "all",
          searchQuery: "",
          indentIdsWithTrip: new Set(["linked"]),
        },
      ),
    ).toEqual([]);
  });

  it("drops awarded indents even when a leftover cancel_reason remains", () => {
    expect(
      filterFailedHubIndents(
        [
          indent({
            id: "awarded-leftover",
            status: "awarded",
            cancel_reason: "client_cancelled",
            updated_at: "2026-10-29T12:00:00Z",
          }),
        ],
        {
          orgId: "org",
          dateRangeFilter: "all",
          searchQuery: "",
        },
      ),
    ).toEqual([]);
  });

  it("prefers a newer awarded workload copy over a stale Failed remote row", () => {
    const staleFailed = indent({
      id: "a",
      status: "cancelled",
      cancel_reason: "client_cancelled",
      updated_at: "2026-10-12T00:00:00Z",
    });
    const awarded = indent({
      id: "a",
      status: "awarded",
      cancel_reason: "client_cancelled",
      updated_at: "2026-10-29T12:00:00Z",
    });
    const merged = mergeIndentsByLatestUpdate([staleFailed], [], [awarded]);
    expect(
      filterFailedHubIndents(merged, {
        orgId: "org",
        dateRangeFilter: "all",
        searchQuery: "",
      }),
    ).toEqual([]);
  });
});

describe("countFailedHubReasons", () => {
  it("counts only the failed list, including expired without a stored reason", () => {
    expect(
      countFailedHubReasons([
        indent({ id: "a", status: "cancelled", cancel_reason: "wrong_entry" }),
        indent({ id: "b", status: "cancelled", cancel_reason: "wrong_entry" }),
        indent({ id: "c", status: "expired", cancel_reason: null }),
        indent({ id: "d", status: "open" }),
      ]),
    ).toEqual({
      client_cancelled: 0,
      indent_expired: 1,
      no_rates_available: 0,
      wrong_entry: 2,
    });
  });

  it("does not count leftover cancel_reason on awarded indents", () => {
    expect(
      countFailedHubReasons([
        indent({
          id: "awarded",
          status: "awarded",
          cancel_reason: "client_cancelled",
        }),
        indent({
          id: "cancelled",
          status: "cancelled",
          cancel_reason: "client_cancelled",
        }),
      ]),
    ).toEqual({
      client_cancelled: 1,
      indent_expired: 0,
      no_rates_available: 0,
      wrong_entry: 0,
    });
  });
});
