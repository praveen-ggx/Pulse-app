import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  forgetLastFullPath,
  resolveRestorableDispatcherRoute,
  resolveRestorableFullPath,
} from '@/lib/lastRoute';

describe('resolveRestorableFullPath', () => {
  it('keeps trip detail (and query) so refresh can restore the same page', () => {
    expect(resolveRestorableFullPath('/trip/abc-id?tab=docs')).toBe(
      '/trip/abc-id?tab=docs',
    );
  });

  it('keeps other app stacks', () => {
    expect(resolveRestorableFullPath('/vehicle/xyz')).toBe('/vehicle/xyz');
    expect(resolveRestorableFullPath('/trips')).toBe('/trips');
  });

  it('rejects boot and auth destinations', () => {
    expect(resolveRestorableFullPath('/')).toBeNull();
    expect(resolveRestorableFullPath('/sign-in')).toBeNull();
    expect(resolveRestorableFullPath('/onboarding/business')).toBeNull();
    expect(resolveRestorableFullPath('https://evil.example/trip/1')).toBeNull();
  });
});

describe('resolveRestorableDispatcherRoute', () => {
  it('still maps tab pathnames to dispatcher tabs', () => {
    expect(resolveRestorableDispatcherRoute('/trips')).toBe('/(tabs)/trips');
    expect(resolveRestorableDispatcherRoute('/trip/abc')).toBeNull();
  });
});

describe('forgetLastFullPath', () => {
  const storage = AsyncStorage as unknown as { getItem: jest.Mock; removeItem: jest.Mock };

  beforeEach(() => {
    storage.getItem.mockReset();
    storage.removeItem.mockClear();
  });

  it('clears the stored trip (any query) so cold start falls back to the last tab', async () => {
    storage.getItem.mockResolvedValue('/trip/abc?tab=docs');
    await forgetLastFullPath('/trip/abc');
    expect(storage.removeItem).toHaveBeenCalledWith('app:last_full_path');
  });

  it('keeps a different stored screen', async () => {
    storage.getItem.mockResolvedValue('/trip/other');
    await forgetLastFullPath('/trip/abc');
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});
