/**
 * Focused tests: pending metadata must survive failed org writes and clear on success.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_KEY = '@pulse_pending_oauth_metadata_v1';

const mockUpdateUser = jest.fn();
const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    auth: {
      updateUser: (...a: unknown[]) => mockUpdateUser(...a),
      getUser: (...a: unknown[]) => mockGetUser(...a),
    },
    from: (...a: unknown[]) => mockFrom(...a),
    rpc: (...a: unknown[]) => mockRpc(...a),
  }),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'pulse://auth/callback'),
  parse: jest.fn(),
}));

const mockSyncLinked = jest.fn();
jest.mock('@/features/drivers/services/drivers.service', () => ({
  syncLinkedDriverRowsForCurrentUser: (...a: unknown[]) => mockSyncLinked(...a),
  __resetSyncLinkedDriversDedupeForTests: jest.fn(),
}));

import { applyPendingOAuthMetadata, pendingOAuthMetadataMatchesUser } from '../auth.service';

function updateChain(result: { data: unknown; error: unknown }) {
  const chain: {
    eq: jest.Mock;
    select: jest.Mock;
  } = {
    eq: jest.fn(),
    select: jest.fn(),
  };
  chain.eq.mockReturnValue(chain);
  chain.select.mockResolvedValue(result);
  return chain;
}

describe('applyPendingOAuthMetadata retention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: 0, error: null });
    mockSyncLinked.mockReset();
    mockSyncLinked.mockResolvedValue({ error: null, linkedCount: 0 });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns skipped and does not clear when empty', async () => {
    await expect(applyPendingOAuthMetadata()).resolves.toEqual({ status: 'skipped' });
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(mockSyncLinked).not.toHaveBeenCalled();
  });

  it('does not sync drivers when there is no pending OAuth work', async () => {
    await expect(applyPendingOAuthMetadata()).resolves.toEqual({ status: 'skipped' });
    expect(mockSyncLinked).not.toHaveBeenCalled();
  });

  it('does not sync drivers when pending OAuth metadata is corrupt', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('{not-json');
    await expect(applyPendingOAuthMetadata()).resolves.toEqual({ status: 'skipped' });
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
    expect(mockSyncLinked).not.toHaveBeenCalled();
  });

  it('does not sync when applyPending is invoked twice with empty pending (restore storm)', async () => {
    await applyPendingOAuthMetadata();
    await applyPendingOAuthMetadata();
    expect(mockSyncLinked).not.toHaveBeenCalled();
  });

  it('keeps pending when organization update matches 0 rows', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        role: 'user',
        operatingModel: 'HYBRID',
        companyName: 'Acme',
        addressLine: '1 St',
        city: 'Chennai',
        state: 'TN',
        pincode: '600001',
        onboardingType: 'owner',
      }),
    );
    mockUpdateUser.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const profileChain = updateChain({ data: [{ id: 'u1' }], error: null });
    const orgChain = updateChain({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return { update: () => profileChain };
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: { organization_id: 'o1' } }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'organizations') return { update: () => orgChain };
      return { update: () => updateChain({ data: [], error: null }) };
    });

    const result = await applyPendingOAuthMetadata();
    expect(result.status).toBe('partial_failure');
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(PENDING_KEY);
  });

  it('clears pending after successful writes', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        role: 'user',
        operatingModel: 'HYBRID',
        companyName: 'Acme',
        addressLine: '1 St',
        city: 'Chennai',
        state: 'TN',
        pincode: '600001',
        phone: '+919876543210',
        onboardingType: 'owner',
      }),
    );
    mockUpdateUser.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const profileChain = updateChain({ data: [{ id: 'u1' }], error: null });
    const orgChain = updateChain({ data: [{ id: 'o1' }], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return { update: () => profileChain };
      if (table === 'organization_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: { organization_id: 'o1' } }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'organizations') return { update: () => orgChain };
      return { update: () => updateChain({ data: [], error: null }) };
    });

    await expect(applyPendingOAuthMetadata()).resolves.toEqual({ status: 'success' });
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(PENDING_KEY);
    expect(mockSyncLinked).toHaveBeenCalled();
  });
});

describe('applyPendingOAuthMetadata identity guard (incident 2026-09-02)', () => {
  const NOW = Date.parse('2026-09-02T06:32:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('flags a transporter form completed with a staff Google account', () => {
    expect(
      pendingOAuthMetadataMatchesUser(
        { fullName: 'SHIVSHAKTI TRANSPORT CO' },
        { created_at: '2026-09-02T06:31:37Z', user_metadata: { name: 'Dihya Zayeem' } },
        NOW,
      ),
    ).toBe(false);
  });

  it('accepts the same person with a shorter / longer form name', () => {
    expect(
      pendingOAuthMetadataMatchesUser(
        { fullName: 'Dihya' },
        { created_at: '2026-09-02T06:31:37Z', user_metadata: { name: 'Dihya Zayeem' } },
        NOW,
      ),
    ).toBe(true);
  });

  it('flags pending data applied to an account older than a day', () => {
    expect(
      pendingOAuthMetadataMatchesUser(
        { fullName: 'Ravi Kumar' },
        { created_at: '2026-08-01T00:00:00Z', user_metadata: { name: 'Ravi Kumar' } },
        NOW,
      ),
    ).toBe(false);
  });

  it('writes nothing and clears pending on a mismatch', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({ fullName: 'SHIVSHAKTI TRANSPORT CO', phone: '9569817004', onboardingType: 'owner' }),
    );
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          email: 'dihya.zayeem@gogox.com',
          created_at: new Date().toISOString(),
          user_metadata: { name: 'Dihya Zayeem' },
        },
      },
    });

    const result = await applyPendingOAuthMetadata();

    expect(result).toEqual({
      status: 'identity_mismatch',
      formName: 'SHIVSHAKTI TRANSPORT CO',
      accountEmail: 'dihya.zayeem@gogox.com',
    });
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(PENDING_KEY);
  });
});
