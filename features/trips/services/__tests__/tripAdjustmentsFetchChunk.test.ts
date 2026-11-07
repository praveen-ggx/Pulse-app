/**
 * ADJ_FETCH_CHUNK (40): trip_finance_adjustments IN lookups must stay
 * sequential and must not emit PostgREST IN lists larger than the chunk.
 */
import {
  fetchTripFinanceAdjustmentsByTripIds,
  normTripFinanceAdjustmentKey,
} from '../tripAdjustments';

const mockInChunks: string[][] = [];
let mockInFlight = 0;
let mockMaxConcurrent = 0;

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: (table: string) => {
      expect(table).toBe('trip_finance_adjustments');
      return {
        select: () => ({
          in: (_col: string, chunk: string[]) => {
            mockInChunks.push([...chunk]);
            mockInFlight += 1;
            mockMaxConcurrent = Math.max(mockMaxConcurrent, mockInFlight);
            return {
              order: async () => {
                const data = chunk.map((trip_id) => ({
                  id: `adj-${trip_id}`,
                  trip_id,
                  organization_id: 'org-1',
                  type: 'revenue',
                  impact: 'plus',
                  amount: 1,
                  reason: 'Other',
                  created_at: '2026-01-01T00:00:00.000Z',
                }));
                await Promise.resolve();
                mockInFlight -= 1;
                return { data, error: null };
              },
            };
          },
        }),
      };
    },
  }),
}));

function ids(n: number): string[] {
  // trip_id is uuid — non-UUID booking refs (BKG-…) must never enter the IN list.
  return Array.from({ length: n }, (_, i) => {
    const hex = (i + 1).toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}`;
  });
}

function keysFromMap(map: Map<string, unknown>): string[] {
  return [...map.keys()].sort();
}

beforeEach(() => {
  mockInChunks.length = 0;
  mockInFlight = 0;
  mockMaxConcurrent = 0;
});

describe('fetchTripFinanceAdjustmentsByTripIds chunking', () => {
  it('skips non-UUID booking refs so PostgREST does not 22P02', async () => {
    const uuid = 'a4084b6b-2758-4aa1-ae20-8f36ceb880e2';
    const found = await fetchTripFinanceAdjustmentsByTripIds([uuid, 'BKG-8xgrnf', '']);
    expect(mockInChunks).toEqual([[uuid]]);
    expect(found.has(normTripFinanceAdjustmentKey(uuid))).toBe(true);
    expect(found.has(normTripFinanceAdjustmentKey('BKG-8xgrnf'))).toBe(false);
  });

  it('39 ids → one request and every id in the result map', async () => {
    const input = ids(39);
    const found = await fetchTripFinanceAdjustmentsByTripIds(input);
    expect(mockInChunks).toHaveLength(1);
    expect(mockInChunks[0]).toEqual(input);
    expect(found.size).toBe(39);
    expect(keysFromMap(found)).toEqual(input.map(normTripFinanceAdjustmentKey).sort());
    expect(mockMaxConcurrent).toBe(1);
  });

  it('40 ids → one request and every id in the result map', async () => {
    const input = ids(40);
    const found = await fetchTripFinanceAdjustmentsByTripIds(input);
    expect(mockInChunks).toHaveLength(1);
    expect(mockInChunks[0]).toHaveLength(40);
    expect(found.size).toBe(40);
    expect(keysFromMap(found)).toEqual(input.map(normTripFinanceAdjustmentKey).sort());
    expect(mockMaxConcurrent).toBe(1);
  });

  it('41 ids → two sequential requests and every id in the result map', async () => {
    const input = ids(41);
    const found = await fetchTripFinanceAdjustmentsByTripIds(input);
    expect(mockInChunks).toHaveLength(2);
    expect(mockInChunks[0]).toHaveLength(40);
    expect(mockInChunks[1]).toEqual([input[40]]);
    expect(mockInChunks[0].concat(mockInChunks[1])).toEqual(input);
    expect(found.size).toBe(41);
    expect(keysFromMap(found)).toEqual(input.map(normTripFinanceAdjustmentKey).sort());
    expect(mockMaxConcurrent).toBe(1);
  });
});
