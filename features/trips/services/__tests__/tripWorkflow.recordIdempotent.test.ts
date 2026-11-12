import { recordTripWorkflowEvent } from '../tripWorkflow.service';

const mockInsert = jest.fn();
let mockExistingRow: { id: string } | null = null;

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: () => {
      const builder: Record<string, unknown> = {
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        limit: jest.fn(() => builder),
        maybeSingle: jest.fn(() => Promise.resolve({ data: mockExistingRow, error: null })),
        insert: (row: unknown) => {
          mockInsert(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'new' }, error: null }),
            }),
          };
        },
      };
      return builder;
    },
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockExistingRow = null;
});

describe('recordTripWorkflowEvent', () => {
  it('skips the insert when the singleton event is already recorded', async () => {
    mockExistingRow = { id: 'old' };
    const result = await recordTripWorkflowEvent({
      tripId: 't1',
      orgId: 'o1',
      eventType: 'trip.completed',
    });
    expect(result).toEqual({ error: null, event: null, alreadyExists: true });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('inserts with the deterministic key when none exists', async () => {
    const result = await recordTripWorkflowEvent({
      tripId: 't1',
      orgId: 'o1',
      eventType: 'trip.completed',
    });
    expect(result.alreadyExists).toBe(false);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: 't1:trip.completed' }),
    );
  });
});
