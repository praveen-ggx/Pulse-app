/**
 * Indent lists attach trip display codes with chunked `indent_id IN()` reads.
 * Those chunks run concurrently (bounded) instead of one round trip each, every
 * indent still gets its own trip's codes, and a failed chunk only blanks its
 * own indents.
 */
import { getIndentsByOrganization } from "../indents.service";

const mockIndentLimit = jest.fn();
let mockInFlight = 0;
let mockMaxInFlight = 0;
const mockTripChunks: string[][] = [];
let mockFailChunk = -1;

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: (table: string) => {
      if (table === "trips") {
        return {
          select: () => ({
            in: (_col: string, ids: string[]) => {
              const index = mockTripChunks.push(ids) - 1;
              mockInFlight += 1;
              mockMaxInFlight = Math.max(mockMaxInFlight, mockInFlight);
              return new Promise((r) => setTimeout(r, 2)).then(() => {
                mockInFlight -= 1;
                if (index === mockFailChunk) return { data: null, error: { message: "boom" } };
                return {
                  data: ids.map((id) => ({ indent_id: id, trip_operational_code: `T-${id}`, trip_number: null, trip_code: null })),
                  error: null,
                };
              });
            },
          }),
        };
      }
      return { select: () => ({ eq: () => ({ order: () => ({ limit: mockIndentLimit }) }) }) };
    },
  }),
}));

const indents = Array.from({ length: 500 }, (_, i) => ({
  id: `ind-${String(i).padStart(3, "0")}`,
  organization_id: "org-1",
  status: "awarded",
  created_at: "2026-11-01T00:00:00Z",
}));

beforeEach(() => {
  mockInFlight = 0;
  mockMaxInFlight = 0;
  mockTripChunks.length = 0;
  mockFailChunk = -1;
  mockIndentLimit.mockResolvedValue({ data: indents, error: null });
});

describe("attachActiveTripRefs", () => {
  it("reads the 7 trip-code chunks of a 500-indent list concurrently", async () => {
    const result = await getIndentsByOrganization("org-1");
    expect(mockTripChunks).toHaveLength(7);
    expect(mockTripChunks.every((c) => c.length <= 80)).toBe(true);
    expect(mockMaxInFlight).toBeGreaterThan(1);
    expect(mockMaxInFlight).toBeLessThanOrEqual(6);
    expect(result.indents).toHaveLength(500);
    for (const row of result.indents) {
      expect(row.active_trip?.[0]?.trip_operational_code).toBe(`T-${row.id}`);
    }
  });

  it("a failed chunk blanks only its own indents", async () => {
    mockFailChunk = 2;
    const result = await getIndentsByOrganization("org-1");
    const failedIds = new Set(mockTripChunks[2]);
    for (const row of result.indents) {
      if (failedIds.has(row.id)) expect(row.active_trip).toEqual([]);
      else expect(row.active_trip?.[0]?.trip_operational_code).toBe(`T-${row.id}`);
    }
  });
});
