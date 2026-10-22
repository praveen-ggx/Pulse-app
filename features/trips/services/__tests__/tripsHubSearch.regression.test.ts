/**
 * PR #24 review regressions: LR / e-way numbers for hub search and the Trip Ops
 * export, stage-time paging, and the search_trips_for_org migration's safety rules.
 */
import fs from "fs";
import path from "path";
import { loadHubPodReceiptFlags } from "../tripDocumentLrPod.service";
import { getTripStatusTimes } from "../tripStatusTimes.service";

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => mockFrom(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

type DocRow = { trip_id: string; document_type: string; document_number: string | null };

function docsQuery(rows: DocRow[]) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  q.select = jest.fn(self);
  q.in = jest.fn(self);
  q.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return q;
}

describe("loadHubPodReceiptFlags LR / e-way numbers", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: null, error: { message: "function missing" } });
  });

  it("reads LR numbers from JSON and plain values, and e-way numbers without spaces", async () => {
    mockFrom.mockImplementation(() =>
      docsQuery([
        { trip_id: "trip-a", document_type: "lr", document_number: '{"lrNumber":"LR-101","invoice":"INV9","date":"2026-10-01"}' },
        { trip_id: "trip-a", document_type: "lr", document_number: '{"lrNumber":"LR-101"}' },
        { trip_id: "trip-b", document_type: "lr", document_number: "LR-202" },
        {
          trip_id: "trip-a",
          document_type: "eway_bill",
          document_number: '{"ewayNo":"4444 5555 6666","validTill":"","createdDate":"Sep 1"}',
        },
      ]),
    );

    const flags = await loadHubPodReceiptFlags(["trip-a", "trip-b"]);

    expect(flags.lrNumbersByTripId["trip-a"]).toBe("LR-101");
    expect(flags.lrNumbersByTripId["trip-b"]).toBe("LR-202");
    expect(flags.ewayNumbersByTripId["trip-a"]).toBe("444455556666");
    // JSON metadata (invoice / date) is not exposed as a number.
    expect(flags.lrNumbersByTripId["trip-a"]).not.toMatch(/INV9|2026/);
  });

  it("returns every key for an empty trip list", async () => {
    const flags = await loadHubPodReceiptFlags([]);
    expect(flags).toEqual({
      softTripIds: [],
      hardTripIds: [],
      ewayExpiryByTripId: {},
      lrNumbersByTripId: {},
      ewayNumbersByTripId: {},
    });
  });
});

describe("getTripStatusTimes", () => {
  beforeEach(() => mockFrom.mockReset());

  function auditQuery(pages: Array<Array<{ trip_id: string; status_to: string; changed_at: string }>>) {
    const ranges: Array<[number, number]> = [];
    mockFrom.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = () => q;
      q.select = jest.fn(self);
      q.in = jest.fn(self);
      q.order = jest.fn(self);
      q.range = jest.fn((from: number, to: number) => {
        ranges.push([from, to]);
        return Promise.resolve({ data: pages[ranges.length - 1] ?? [], error: null });
      });
      return q;
    });
    return ranges;
  }

  it("pages past 1,000 rows so later stages are not cut off, keeping the earliest time", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({
      trip_id: "TRIP-1",
      status_to: "in_progress",
      changed_at: `2026-10-01T00:00:${String(i % 60).padStart(2, "0")}Z`,
    }));
    const ranges = auditQuery([
      full,
      [
        { trip_id: "TRIP-1", status_to: "completed", changed_at: "2026-10-02T00:00:00Z" },
        { trip_id: "TRIP-1", status_to: "completed", changed_at: "2026-10-03T00:00:00Z" },
      ],
    ]);

    const { error, times } = await getTripStatusTimes(["TRIP-1"]);

    expect(error).toBeNull();
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(times["trip-1"].in_progress).toBe("2026-10-01T00:00:00Z");
    expect(times["trip-1"].completed).toBe("2026-10-02T00:00:00Z");
  });
});

describe("search_trips_for_org migration", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../../../../supabase/migrations/20261021094632_trips_hub_search.sql"),
    "utf8",
  );

  it("never casts document_number to jsonb without the validity guard", () => {
    // Exactly one cast, and it is the THEN branch of the pg_input_is_valid check.
    expect(sql.match(/document_number\)?::jsonb/g) ?? []).toHaveLength(1);
    expect(sql).toMatch(
      /pg_input_is_valid\(btrim\(td\.document_number\), 'jsonb'\)\s*THEN btrim\(td\.document_number\)::jsonb/,
    );
    // No raw text match on stored document JSON remains.
    expect(sql).not.toMatch(/td\.document_number ILIKE p\.pat/);
  });

  it("revokes public / anon and grants authenticated only", () => {
    expect(sql).toMatch(/revoke execute on function public\.search_trips_for_org\(uuid, text, integer\)\s+from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.search_trips_for_org\(uuid, text, integer\)\s+to authenticated, service_role/i);
  });

  it("keeps the org-membership and Ground Ops visibility rules", () => {
    expect(sql).toMatch(/WHERE public\.is_org_member\(p_org_id\)/);
    expect(sql).toMatch(/'ground_ops'/);
    expect(sql).toMatch(/organization_member_warehouses/);
  });
});
