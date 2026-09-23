import { getLinkedOrgProfilesBatch } from '@/features/clients/services/clients.service';

const mockGetSession = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    auth: { getSession: (...args: unknown[]) => mockGetSession(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

jest.mock('@/lib/platform', () => ({
  CustomerService: {},
}));

jest.mock('@/lib/enrichConnectionPartnerAvatars', () => ({
  enrichConnectionPartnerAvatars: async (rows: unknown) => rows,
}));

describe('getLinkedOrgProfilesBatch session guard', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockRpc.mockReset();
  });

  it('does not call the RPC when there is no session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const result = await getLinkedOrgProfilesBatch(['org-1']);
    expect(result).toEqual({});
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('calls the RPC for an authenticated session', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt', user: { id: 'user-1' } } },
    });
    mockRpc.mockResolvedValue({
      data: {
        'org-1': { organizationName: 'Acme', contactPerson: 'Ada', phone: '1' },
      },
      error: null,
    });
    const result = await getLinkedOrgProfilesBatch(['org-1']);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_connection_partner_display_batch', {
      p_linked_organization_ids: ['org-1'],
    });
    expect(result['org-1']?.organizationName).toBe('Acme');
  });

  it('returns {} on 401 and does not throw or retry', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'stale', user: { id: 'user-1' } } },
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function get_connection_partner_display_batch', code: '42501', status: 401 },
    });
    const result = await getLinkedOrgProfilesBatch(['org-1', 'org-2']);
    expect(result).toEqual({});
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent calls for the same id set into one RPC call', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt', user: { id: 'user-1' } } },
    });
    let resolveRpc!: (v: unknown) => void;
    mockRpc.mockReturnValue(
      new Promise((resolve) => {
        resolveRpc = resolve;
      }),
    );
    // Two independent call sites request the same org concurrently (e.g. a
    // client detail screen and a chat branding lookup racing on page load).
    const call1 = getLinkedOrgProfilesBatch(['org-1']);
    const call2 = getLinkedOrgProfilesBatch(['org-1']);
    resolveRpc({
      data: { 'org-1': { organizationName: 'Acme', contactPerson: 'Ada', phone: '1' } },
      error: null,
    });
    const [result1, result2] = await Promise.all([call1, call2]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(result2);
    expect(result1['org-1']?.organizationName).toBe('Acme');
  });

  it('does not single-flight calls for a different id set', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt', user: { id: 'user-1' } } },
    });
    mockRpc.mockResolvedValue({ data: {}, error: null });
    await Promise.all([
      getLinkedOrgProfilesBatch(['org-1']),
      getLinkedOrgProfilesBatch(['org-2']),
    ]);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('a later call for the same id set after the first resolves fetches fresh (no stale sharing)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt', user: { id: 'user-1' } } },
    });
    mockRpc.mockResolvedValue({
      data: { 'org-1': { organizationName: 'Acme', contactPerson: 'Ada', phone: '1' } },
      error: null,
    });
    await getLinkedOrgProfilesBatch(['org-1']);
    await getLinkedOrgProfilesBatch(['org-1']);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('chunks partner-display RPC so one page is one or two calls, not one per 8 ids', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt', user: { id: 'user-1' } } },
    });
    mockRpc.mockResolvedValue({ data: {}, error: null });
    const ids = Array.from({ length: 25 }, (_, i) => `org-${i + 1}`);
    await getLinkedOrgProfilesBatch(ids);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc.mock.calls[0][1].p_linked_organization_ids).toHaveLength(24);
    expect(mockRpc.mock.calls[1][1].p_linked_organization_ids).toHaveLength(1);
  });

  it('maps fleet, indent, and signup fields from the batch JSON', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'jwt', user: { id: 'user-1' } } },
    });
    mockRpc.mockResolvedValue({
      data: {
        'org-1': {
          organizationName: 'Acme',
          contactPerson: 'Ada',
          phone: '1',
          ownerSignedUpAt: '2023-06-01T00:00:00.000Z',
          vehicleCount: 4,
          networkIndentCount: 7,
        },
      },
      error: null,
    });
    const result = await getLinkedOrgProfilesBatch(['org-1']);
    expect(result['org-1']?.ownerSignedUpAt).toBe('2023-06-01T00:00:00.000Z');
    expect(result['org-1']?.vehicleCount).toBe(4);
    expect(result['org-1']?.networkIndentCount).toBe(7);
  });
});
