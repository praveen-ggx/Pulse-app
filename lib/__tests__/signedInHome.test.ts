import { resolveSignedInHomeRoute } from '@/lib/indexBootRedirect.util';

const none = {
  trips: false,
  loadCenter: false,
  finance: false,
  compliance: false,
  network: false,
};

describe('resolveSignedInHomeRoute', () => {
  it('opens Trips when the member can run trips', () => {
    expect(resolveSignedInHomeRoute({ ...none, trips: true, network: true })).toBe(
      '/(tabs)/trips',
    );
  });

  it('opens Load Center before Finance when trips are closed', () => {
    expect(
      resolveSignedInHomeRoute({
        ...none,
        loadCenter: true,
        finance: true,
        network: true,
      }),
    ).toBe('/find-loads');
  });

  it('opens Finance when that is the first allowed work page', () => {
    expect(resolveSignedInHomeRoute({ ...none, finance: true, network: true })).toBe(
      '/(tabs)/finance',
    );
  });

  it('opens Compliance before the Network hub', () => {
    expect(
      resolveSignedInHomeRoute({ ...none, compliance: true, network: true }),
    ).toBe('/compliance');
  });

  it('falls back to Network when that is the only top-nav page', () => {
    expect(resolveSignedInHomeRoute({ ...none, network: true })).toBe('/(tabs)/network');
  });

  it('falls back to Trips when the member has no top-nav page', () => {
    expect(resolveSignedInHomeRoute(none)).toBe('/(tabs)/trips');
  });
});
