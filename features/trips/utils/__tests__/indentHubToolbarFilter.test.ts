import type { IndentRow } from "@/features/indents/services/indents.service";
import {
  filterIndentsForTripsToolbar,
  indentMatchesHubDateFilter,
  indentMatchesHubSearch,
  mergeIndentSearchHits,
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
  it("adds unallocated indents to the active trip count", () => {
    expect(
      tripsHubAllToolbarCountLabel({
        visibleIndentCount: 13,
        dateFilteredIndentCount: 13,
        visibleTripCount: 16,
        dateFilteredTripCount: 16,
      }),
    ).toBe("Showing 29 of 29");
  });
});
