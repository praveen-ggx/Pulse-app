import type { IndentRow } from "@/features/indents/services/indents.service";
import {
  collectIndentHubSearchMatches,
  indentHubSearchStageForIndent,
  pickIndentHubSearchStage,
  scoreIndentHubSearchMatch,
} from "@/features/trips/utils/indentHubSearchStage.util";

function indent(partial: Partial<IndentRow> & Pick<IndentRow, "id">): IndentRow {
  return {
    organization_id: "org",
    pickup_area: "Chennai",
    drop_location: "Hyderabad",
    client_name: "Apollo",
    client_price: 0,
    supplier_target: 0,
    status: "open",
    vehicle_type: "32ft",
    load_type: null,
    pickup_date: "2026-09-14",
    circulation_target: null,
    indent_number: "SAT812GOGIND003250",
    created_at: "2026-09-14T10:00:00.000Z",
    ...partial,
  } as IndentRow;
}

describe("indentHubSearchStageForIndent", () => {
  it("maps live bid counts to pending / bids and awarded / failed", () => {
    expect(
      indentHubSearchStageForIndent(
        { status: "open" },
        { hasLinkedTrip: false, bidCount: 0, workloadKind: "live" },
      ),
    ).toBe("pending");
    expect(
      indentHubSearchStageForIndent(
        { status: "open" },
        { hasLinkedTrip: false, bidCount: 2, workloadKind: "live" },
      ),
    ).toBe("bids");
    expect(
      indentHubSearchStageForIndent(
        { status: "awarded" },
        { hasLinkedTrip: false, bidCount: 0, workloadKind: "needs_trip" },
      ),
    ).toBe("awarded");
    expect(
      indentHubSearchStageForIndent(
        { status: "cancelled" },
        { hasLinkedTrip: false, bidCount: 0, workloadKind: null },
      ),
    ).toBe("failed");
  });

  it("drops indents that already have a trip", () => {
    expect(
      indentHubSearchStageForIndent(
        { status: "awarded" },
        { hasLinkedTrip: true, bidCount: 0, workloadKind: "needs_trip" },
      ),
    ).toBeNull();
  });
});

describe("pickIndentHubSearchStage", () => {
  it("prefers the strongest score, then Needs trip over Bids", () => {
    expect(
      pickIndentHubSearchStage([
        { indentId: "a", stage: "bids", score: 10 },
        { indentId: "b", stage: "awarded", score: 10 },
      ]),
    ).toBe("awarded");
    expect(
      pickIndentHubSearchStage([
        { indentId: "a", stage: "pending", score: 20 },
        { indentId: "b", stage: "failed", score: 100 },
      ]),
    ).toBe("failed");
  });

  it("returns null when there are no matches", () => {
    expect(pickIndentHubSearchStage([])).toBeNull();
  });
});

describe("collectIndentHubSearchMatches", () => {
  it("finds a September awarded indent in Needs trip creation", () => {
    const awarded = indent({
      id: "sep",
      status: "awarded",
      indent_number: "SAT812GOGIND003250",
      pickup_date: "2026-09-10",
    });
    const kindById = new Map([["sep", "needs_trip" as const]]);
    const matches = collectIndentHubSearchMatches({
      query: "SAT812GOGIND003250",
      unallocated: [awarded],
      failed: [],
      bidCountById: {},
      workloadKindById: kindById,
      indentIdsWithTrip: new Set(),
    });
    expect(matches).toEqual([
      { indentId: "sep", stage: "awarded", score: 100 },
    ]);
    expect(pickIndentHubSearchStage(matches)).toBe("awarded");
  });

  it("scores failed matches and ignores non-matching rows", () => {
    const matches = collectIndentHubSearchMatches({
      query: "apollo",
      unallocated: [indent({ id: "live", status: "open", client_name: "Berger" })],
      failed: [
        indent({
          id: "fail",
          status: "expired",
          client_name: "Apollo",
          indent_number: "OTHER",
        }),
      ],
      bidCountById: {},
      workloadKindById: new Map([["live", "live"]]),
      indentIdsWithTrip: new Set(),
    });
    expect(pickIndentHubSearchStage(matches)).toBe("failed");
    expect(scoreIndentHubSearchMatch(indent({ id: "x", client_name: "Apollo" }), "apollo")).toBe(
      40,
    );
  });
});
