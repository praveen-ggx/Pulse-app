import { submitPulseBidWithDirectQuote } from '../bids.service';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: () => ({ rpc: mockRpc }) }));
jest.mock('@/features/connections/services/relationshipService', () => ({
  canAward: jest.fn(),
  getAwardEligibility: jest.fn(),
}));
jest.mock('@/features/clients/services/clients.service', () => ({
  getLinkedOrgProfilesBatch: jest.fn(),
}));

const input = { postId: 'post-1', bidderOrganizationId: 'org-1', amount: 18000 };

beforeEach(() => {
  mockRpc.mockReset();
});

describe('submitPulseBidWithDirectQuote', () => {
  it('writes new bids and edits through the story RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'bid-1', error: null });
    await submitPulseBidWithDirectQuote(input);
    expect(mockRpc).toHaveBeenCalledWith('submit_pulse_bid_with_direct_quote', {
      p_post_id: 'post-1',
      p_bidder_org_id: 'org-1',
      p_amount: 18000,
      p_note: '',
    });
    expect(mockRpc).not.toHaveBeenCalledWith(
      'submit_network_pool_quote',
      expect.anything(),
    );
    expect(mockRpc).not.toHaveBeenCalledWith(
      'submit_network_quote',
      expect.anything(),
    );
  });

  it('explains a countered or decided quote instead of the raw code', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'quote_locked: quote has been countered or decided' },
    });
    const res = await submitPulseBidWithDirectQuote(input);
    expect(res.error?.message).toBe(
      'Your quote on this load has been countered or decided, so it can no longer be changed here.',
    );
  });

  it('explains an invalid amount', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'invalid_amount: amount must be greater than zero' },
    });
    const res = await submitPulseBidWithDirectQuote(input);
    expect(res.error?.message).toBe('Enter an amount greater than 0.');
  });
});
