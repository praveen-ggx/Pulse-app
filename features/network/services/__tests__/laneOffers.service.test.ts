const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ rpc: mockRpc }),
}));

import {
  LANE_OFFERS_PAGE_SIZE,
  listLaneOffersForIndent,
  listMyLaneBidInvites,
  normalizeLaneOffersPage,
  respondLaneBidInvite,
} from '../laneOffers.service';

beforeEach(() => mockRpc.mockReset());

describe('normalizeLaneOffersPage', () => {
  it('coerces numeric strings and keeps the keyset cursor', () => {
    const page = normalizeLaneOffersPage(
      {
        indent_id: 'i1',
        pool_key: 'a|b|c',
        network_open: true,
        marketplace_open: false,
        total_count: '1205',
        network_count: 5,
        marketplace_count: '1200',
        min_network_amount: '30000',
        min_marketplace_amount: null,
        has_more: true,
        next_cursor: { amount: '31500', key: 'mb:x' },
        items: [{ offer_key: 'mb:x', amount: '31500', vehicles_left: null }],
      },
      'i1',
    );
    expect(page.total_count).toBe(1205);
    expect(page.marketplace_count).toBe(1200);
    expect(page.min_network_amount).toBe(30000);
    expect(page.min_marketplace_amount).toBeNull();
    expect(page.next_cursor).toEqual({ amount: 31500, key: 'mb:x' });
    expect(page.items[0]?.amount).toBe(31500);
  });

  it('tolerates an empty payload', () => {
    const page = normalizeLaneOffersPage(null, 'i1');
    expect(page).toMatchObject({ indent_id: 'i1', total_count: 0, has_more: false, next_cursor: null, items: [] });
  });
});

describe('lane offers RPC calls', () => {
  it('pages with the server cursor', async () => {
    mockRpc.mockResolvedValue({ data: { items: [] }, error: null });
    await listLaneOffersForIndent('i1');
    expect(mockRpc).toHaveBeenLastCalledWith('list_lane_offers_for_indent', {
      p_indent_id: 'i1',
      p_limit: LANE_OFFERS_PAGE_SIZE,
    });
    await listLaneOffersForIndent('i1', { cursor: { amount: 31500, key: 'mb:x' } });
    expect(mockRpc).toHaveBeenLastCalledWith('list_lane_offers_for_indent', {
      p_indent_id: 'i1',
      p_limit: LANE_OFFERS_PAGE_SIZE,
      p_after_amount: 31500,
      p_after_key: 'mb:x',
    });
  });

  it('pages carrier invites by (created_at, id)', async () => {
    mockRpc.mockResolvedValue({ data: { total_count: 1, items: [{ invite_id: 'v', amount: '9' }] }, error: null });
    const res = await listMyLaneBidInvites({ cursor: { created_at: 't', id: 'v0' } });
    expect(mockRpc).toHaveBeenLastCalledWith('list_my_lane_bid_invites', {
      p_limit: LANE_OFFERS_PAGE_SIZE,
      p_after_created_at: 't',
      p_after_id: 'v0',
    });
    expect(res.page?.items[0]?.amount).toBe(9);
  });

  it('returns server errors instead of throwing', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'invite_not_pending' } });
    const res = await respondLaneBidInvite('v', true);
    expect(res.result).toBeNull();
    expect(res.error?.message).toBe('invite_not_pending');
  });
});
