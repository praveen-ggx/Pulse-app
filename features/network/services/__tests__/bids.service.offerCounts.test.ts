import { getIndentOfferCountsForOwnerIndents } from '../bids.service';

const mockTables: Record<string, unknown[]> = {};
const mockSelects: Record<string, string> = {};

function mockBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['in', 'eq']) b[m] = () => b;
  b.select = (cols: string) => {
    mockSelects[table] = cols;
    return b;
  };
  b.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: mockTables[table] ?? [], error: null }).then(resolve);
  return b;
}

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ from: (table: string) => mockBuilder(table) }),
}));

jest.mock('@/lib/supabaseHttp.util', () => ({ isSupabaseCircuitOpen: () => false }));

jest.mock('@/features/connections/services/relationshipService', () => ({
  canAward: jest.fn(),
  getAwardEligibility: jest.fn(),
}));

jest.mock('@/features/clients/services/clients.service', () => ({
  getLinkedOrgProfilesBatch: jest.fn(),
}));

beforeEach(() => {
  for (const k of Object.keys(mockTables)) delete mockTables[k];
  for (const k of Object.keys(mockSelects)) delete mockSelects[k];
});

describe('getIndentOfferCountsForOwnerIndents', () => {
  it('counts pending Marketplace bids, deduped against the same bidder elsewhere', async () => {
    mockTables.direct_quotes = [
      { indent_id: 'i1', bidder_organization_id: 'org-a', amount: 31000, created_at: null, pool_commit_id: null },
    ];
    mockTables.market_bids = [
      { indent_id: 'i1', bidder_type: 'organization', bidder_user_id: 'u-a', bidder_organization_id: 'org-a', amount: 31500, created_at: null },
      { indent_id: 'i1', bidder_type: 'dco', bidder_user_id: 'u-d', bidder_organization_id: null, amount: 31500, created_at: null },
      { indent_id: 'i2', bidder_type: 'dco', bidder_user_id: 'u-e', bidder_organization_id: null, amount: 29000, created_at: null },
    ];
    mockTables.posts = [{ id: 'p1', source_indent_id: 'i1' }];
    mockTables.driver_direct_bids = [
      { post_id: 'p1', driver_user_id: 'u-d', amount: 31500, created_at: null },
    ];

    const res = await getIndentOfferCountsForOwnerIndents('owner', ['i1', 'i2', 'i3']);

    expect(res.error).toBeNull();
    expect(res.counts).toEqual({ i1: 2, i2: 1 });
  });

  it('mockSelects pool_commit_id so exhausted lane commitments drop out of the badge', async () => {
    mockTables.direct_quotes = [
      { indent_id: 'i1', bidder_organization_id: 'org-a', amount: 30000, created_at: null, pool_commit_id: 'c1' },
    ];
    mockTables.network_pool_bid_commits = [
      { id: 'c1', status: 'exhausted', awarded_count: 2, vehicle_limit: 2, valid_until: '2099-01-01T00:00:00Z' },
    ];

    const res = await getIndentOfferCountsForOwnerIndents('owner', ['i1']);

    expect(mockSelects.direct_quotes).toContain('pool_commit_id');
    expect(res.counts).toEqual({});
  });
});
