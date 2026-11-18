/**
 * Bulk ratings: 40-id chunks run concurrently (bounded), every row comes back,
 * and one failed chunk still fails the whole read (no partial averages).
 */
let mockInFlight = 0;
let mockMaxInFlight = 0;
let mockFailChunk = -1;
const mockChunks: string[][] = [];

jest.mock("@/lib/supabase", () => ({
  supabase: () => ({
    from: () => {
      let chunk: string[] = [];
      const b = {
        select: () => b,
        eq: () => b,
        in: (_c: string, ids: string[]) => ((chunk = ids), b),
        order: () => {
          const index = mockChunks.push(chunk) - 1;
          mockInFlight += 1;
          mockMaxInFlight = Math.max(mockMaxInFlight, mockInFlight);
          return new Promise((r) => setTimeout(r, 2)).then(() => {
            mockInFlight -= 1;
            if (index === mockFailChunk) return { data: null, error: { message: "boom" } };
            return { data: chunk.map((id) => ({ id: `r-${id}`, rated_id: id, score: 4 })), error: null };
          });
        },
      };
      return b;
    },
  }),
}));

jest.mock("@/features/clients/services/clients.service", () => ({ getClientsByOrganization: jest.fn() }));

import { getRatingsForClients } from "../ratings.service";

const ids = Array.from({ length: 170 }, (_, i) => `c-${i}`);

beforeEach(() => {
  mockInFlight = 0;
  mockMaxInFlight = 0;
  mockFailChunk = -1;
  mockChunks.length = 0;
});

describe("bulk ratings read", () => {
  it("reads 5 chunks concurrently and returns every client's rows", async () => {
    const { error, byClientId } = await getRatingsForClients(ids);
    expect(error).toBeNull();
    expect(mockChunks).toHaveLength(5);
    expect(mockMaxInFlight).toBeGreaterThan(1);
    expect(mockMaxInFlight).toBeLessThanOrEqual(4);
    for (const id of ids) expect(byClientId[id]).toHaveLength(1);
  });

  it("fails the whole read when one chunk fails", async () => {
    mockFailChunk = 1;
    const { error, byClientId } = await getRatingsForClients(ids);
    expect(error?.message).toBe("boom");
    expect(byClientId).toEqual({});
  });
});
