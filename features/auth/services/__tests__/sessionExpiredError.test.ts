jest.mock('@/lib/supabase', () => ({
  supabase: () => ({ auth: { signOut: jest.fn() } }),
  getSupabaseBaseUrl: () => 'http://127.0.0.1:54321',
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'pulse://auth/callback'),
  parse: jest.fn(),
}));

jest.mock('@/features/drivers/services/drivers.service', () => ({
  syncLinkedDriverRowsForCurrentUser: jest.fn(),
  __resetSyncLinkedDriversDedupeForTests: jest.fn(),
}));

import { isSessionExpiredError } from '@/features/auth/services/auth.service';

describe('isSessionExpiredError', () => {
  it('does not treat a rejected password as an expired session', () => {
    const error = new Error('Invalid login credentials');
    error.name = 'AuthApiError';
    (error as Error & { code?: string }).code = 'invalid_credentials';
    expect(isSessionExpiredError(error)).toBe(false);
  });

  it('still treats a missing refresh token as an expired session', () => {
    const error = new Error('Invalid Refresh Token: Refresh Token Not Found');
    error.name = 'AuthApiError';
    (error as Error & { code?: string }).code = 'refresh_token_not_found';
    expect(isSessionExpiredError(error)).toBe(true);
  });

  it('does not treat an unrelated AuthApiError name as expiry', () => {
    const error = new Error('Request rate limit reached');
    error.name = 'AuthApiError';
    expect(isSessionExpiredError(error)).toBe(false);
  });
});
