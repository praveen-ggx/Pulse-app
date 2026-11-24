/**
 * Automatic sign-outs must be local-only. A global signOut deletes every session of the user
 * on every device, which left their other tabs/phones anonymous in prod (2026-11-23/24).
 */
const mockSignOut = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ auth: { signOut: (...a: unknown[]) => mockSignOut(...a) } }),
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));
jest.mock('expo-linking', () => ({ createURL: jest.fn(() => 'pulse://auth/callback'), parse: jest.fn() }));
jest.mock('@/features/drivers/services/drivers.service', () => ({
  syncLinkedDriverRowsForCurrentUser: jest.fn(),
  __resetSyncLinkedDriversDedupeForTests: jest.fn(),
}));

import { signOut } from '../auth.service';

describe('auth.service signOut scope', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue({ error: null });
  });

  it('scope local revokes only this device', async () => {
    await signOut({ scope: 'local' });
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('scope local never throws when the client fails', async () => {
    mockSignOut.mockRejectedValue(new Error('network'));
    await expect(signOut({ scope: 'local' })).resolves.toBeUndefined();
  });

  it('explicit user sign-out is unchanged: global first, local fallback on error', async () => {
    await signOut();
    expect(mockSignOut).toHaveBeenCalledWith();
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValueOnce({ error: new Error('x') }).mockResolvedValue({ error: null });
    await signOut();
    expect(mockSignOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
  });
});
