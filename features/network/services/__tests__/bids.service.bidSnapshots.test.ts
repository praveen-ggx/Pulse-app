import { indentBidSnapshotsFromBids } from '../bids.service';

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ from: jest.fn() }),
}));

jest.mock('@/features/connections/services/relationshipService', () => ({
  canAward: jest.fn(),
  getAwardEligibility: jest.fn(),
}));

jest.mock('@/features/clients/services/clients.service', () => ({
  getLinkedOrgProfilesBatch: jest.fn(),
}));

describe('indentBidSnapshotsFromBids', () => {
  it('counts distinct bidders and keeps each bidder at their latest offer', () => {
    const snapshots = indentBidSnapshotsFromBids([
      { indentId: 'i1', bidderKey: 'org-a', amount: 50000, at: '2026-10-01T10:00:00Z' },
      { indentId: 'i1', bidderKey: 'org-a', amount: 47000, at: '2026-10-02T10:00:00Z' },
      { indentId: 'i1', bidderKey: 'org-b', amount: 48000, at: '2026-10-01T12:00:00Z' },
      { indentId: 'i1', bidderKey: 'ddb:driver-1', amount: 0, at: null },
      { indentId: 'i2', bidderKey: 'org-a', amount: 30000, at: '2026-10-03T09:00:00Z' },
    ]);
    expect(snapshots.i1).toEqual({
      count: 3,
      lowestAmount: 47000,
      highestAmount: 48000,
      latestAt: '2026-10-02T10:00:00Z',
    });
    expect(snapshots.i2).toEqual({
      count: 1,
      lowestAmount: 30000,
      highestAmount: 30000,
      latestAt: '2026-10-03T09:00:00Z',
    });
  });

  it('a superseded lower offer does not count as the lowest', () => {
    const snapshots = indentBidSnapshotsFromBids([
      { indentId: 'i1', bidderKey: 'org-a', amount: 40000, at: '2026-10-01T10:00:00Z' },
      { indentId: 'i1', bidderKey: 'org-a', amount: 45000, at: '2026-10-02T10:00:00Z' },
    ]);
    expect(snapshots.i1?.lowestAmount).toBe(45000);
  });
});
