import {
  describeIndentModification,
  indentHubActivityPageSize,
  indentMatchesHubActivitySearch,
  indentToHubActivityEvents,
  indentToHubActivityRow,
  nextIndentActivitySelection,
} from "@/features/trips/utils/indentHubActivity.util";
import type { IndentRow } from "@/features/indents/services/indents.service";

function indent(partial: Partial<IndentRow> & Pick<IndentRow, "id">): IndentRow {
  return {
    organization_id: "org",
    pickup_area: "Chennai",
    drop_location: "Coimbatore",
    client_name: "Apollo",
    client_price: 0,
    supplier_target: 0,
    status: "open",
    vehicle_type: "32ft",
    load_type: null,
    pickup_date: "2026-10-07",
    circulation_target: null,
    indent_number: "SAT812GOGIND001974",
    created_at: "2026-10-07T10:00:00.000Z",
    ...partial,
  } as IndentRow;
}

describe("indentHubActivityPageSize", () => {
  it("fits a page of latest rows without going below eight", () => {
    expect(indentHubActivityPageSize(900)).toBeGreaterThanOrEqual(8);
    expect(indentHubActivityPageSize(200)).toBe(8);
  });
});

describe("describeIndentModification", () => {
  it("returns null when the indent was only created", () => {
    expect(
      describeIndentModification({
        status: "open",
        created_at: "2026-10-07T10:00:00.000Z",
        updated_at: "2026-10-07T10:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("names a failed cancel reason", () => {
    expect(
      describeIndentModification({
        status: "cancelled",
        cancel_reason: "wrong_entry",
        created_at: "2026-10-01T10:00:00.000Z",
        updated_at: "2026-10-07T12:00:00.000Z",
      }),
    ).toBe("Marked failed · Wrong entry");
  });

  it("names an award revoke when that is the latest stamp", () => {
    expect(
      describeIndentModification({
        status: "open",
        award_revoked_at: "2026-10-08T09:00:00.000Z",
        created_at: "2026-10-01T10:00:00.000Z",
        updated_at: "2026-10-07T12:00:00.000Z",
      }),
    ).toBe("Award revoked");
  });
});

describe("indentToHubActivityRow", () => {
  it("keeps the latest event first", () => {
    const row = indentToHubActivityRow(
      indent({
        id: "a",
        created_by_user_id: "user-1",
        status: "cancelled",
        cancel_reason: "wrong_entry",
        updated_at: "2026-10-07T12:00:00.000Z",
      }),
    );
    expect(row?.createdByUserId).toBe("user-1");
    expect(row?.action).toBe("marked this indent failed · Wrong entry");
    expect(row?.createdAt).toBe("2026-10-07T10:00:00.000Z");
    expect(row?.at).toBe("2026-10-07T12:00:00.000Z");
    expect(row?.route).toBe("Chennai → Coimbatore");
  });
});

describe("indentToHubActivityEvents", () => {
  it("lists created and failed as separate activities", () => {
    const events = indentToHubActivityEvents(
      indent({
        id: "a",
        created_by_user_id: "user-1",
        status: "cancelled",
        cancel_reason: "wrong_entry",
        updated_at: "2026-10-07T12:00:00.000Z",
      }),
    );
    expect(events.map((event) => event.kind)).toEqual(["failed", "created"]);
    expect(events[0]?.action).toContain("Wrong entry");
  });

  it("includes award, trip, and revoke when those stamps exist", () => {
    const events = indentToHubActivityEvents(
      indent({
        id: "a",
        status: "awarded",
        trip_number: "SAT812GOGTRIP001230",
        shared_at: "2026-10-08T09:00:00.000Z",
        updated_at: "2026-10-09T10:00:00.000Z",
        award_revoked_at: "2026-10-10T11:00:00.000Z",
      }),
    );
    expect(events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["revoked", "trip", "awarded", "shared", "created"]),
    );
    expect(events[0]?.kind).toBe("revoked");
    expect(events.at(-1)?.kind).toBe("created");
  });
});

describe("nextIndentActivitySelection", () => {
  it("selects on first click and unselects on a fast second click", () => {
    const first = nextIndentActivitySelection(null, "a", 1000, 0);
    expect(first.selectedId).toBe("a");
    const second = nextIndentActivitySelection("a", "a", 1200, first.lastClickAt);
    expect(second.selectedId).toBeNull();
  });
});

describe("indentMatchesHubActivitySearch", () => {
  const row = indentToHubActivityRow(
    indent({
      id: "a",
      client_name: "Megha Engineering",
      trip_number: "SAT812GOGTRIP001766",
    }),
  )!;

  it("matches indent, client, or trip id", () => {
    expect(indentMatchesHubActivitySearch(row, "gogind001974")).toBe(true);
    expect(indentMatchesHubActivitySearch(row, "megha")).toBe(true);
    expect(indentMatchesHubActivitySearch(row, "trip001766")).toBe(true);
    expect(indentMatchesHubActivitySearch(row, "nope")).toBe(false);
  });
});
