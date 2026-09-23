import { evaluateNavigationPolicy } from '@/lib/navigationPolicy/evaluate';
import { buildPrincipal } from '@/lib/navigationPolicy/grants';
import { NavigationActor } from '@/lib/navigationPolicy/NavigationActor';
import type { PolicySnapshot } from '@/lib/navigationPolicy/types';
import {
  DRIVER_HOME_PATH,
  SIGN_IN_PATH,
} from '@/lib/navigationPolicy/types';

function snap(
  partial: Partial<PolicySnapshot> & Pick<PolicySnapshot, 'sessionPosture'>,
): PolicySnapshot {
  return {
    principal: null,
    predicates: {},
    platform: 'web',
    ...partial,
  };
}

describe('evaluateNavigationPolicy', () => {
  it('restoring → wait for protected and public paths', () => {
    for (const path of ['/workspace', '/sign-in', '/trips']) {
      const d = evaluateNavigationPolicy({
        rawPathname: path,
        snapshot: snap({ sessionPosture: 'restoring' }),
      });
      expect(d).toEqual({ type: 'wait' });
    }
  });

  it('expired → redirect sign_in', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/trips',
      snapshot: snap({ sessionPosture: 'expired' }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to.startsWith(SIGN_IN_PATH)).toBe(true);
      expect(d.to).toContain('returnTo=');
      expect(d.replace).toBe(true);
    }
  });

  it('anonymous + public process/content → allow (except boot `/`)', () => {
    for (const path of ['/sign-in', '/terminal-website']) {
      const d = evaluateNavigationPolicy({
        rawPathname: path,
        snapshot: snap({ sessionPosture: 'anonymous' }),
      });
      expect(d.type).toBe('allow');
    }
  });

  it('anonymous + boot `/` → marketing (web) or sign-in (native)', () => {
    const web = evaluateNavigationPolicy({
      rawPathname: '/',
      snapshot: snap({ sessionPosture: 'anonymous', platform: 'web' }),
    });
    expect(web.type).toBe('redirect');
    if (web.type === 'redirect') {
      expect(web.to).toBe('/terminal-website');
    }
    const native = evaluateNavigationPolicy({
      rawPathname: '/',
      snapshot: snap({ sessionPosture: 'anonymous', platform: 'ios' }),
    });
    expect(native.type).toBe('redirect');
    if (native.type === 'redirect') {
      expect(native.to).toBe(SIGN_IN_PATH);
    }
  });

  it('anonymous + org stack → redirect sign_in (fail-closed)', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/workspace',
      snapshot: snap({ sessionPosture: 'anonymous' }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe(`${SIGN_IN_PATH}?returnTo=${encodeURIComponent('/workspace')}`);
      expect(d.reason).toBe('anonymous_protected');
    }
  });

  it('anonymous + trip → redirect sign_in', () => {
    for (const platform of ['web', 'ios'] as const) {
      const d = evaluateNavigationPolicy({
        rawPathname: '/trip/abc',
        snapshot: snap({ sessionPosture: 'anonymous', platform }),
      });
      expect(d.type).toBe('redirect');
      if (d.type === 'redirect') {
        expect(d.to.startsWith(SIGN_IN_PATH)).toBe(true);
        expect(d.reason).toBe('anonymous_protected');
      }
    }
  });

  it('anonymous + tabs → redirect sign_in', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/trips',
      snapshot: snap({ sessionPosture: 'anonymous' }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe(`${SIGN_IN_PATH}?returnTo=${encodeURIComponent('/trips')}`);
      expect(d.reason).toBe('anonymous_protected');
    }
  });

  it('authenticated driver + tabs → driver home', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/trips',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({ role: 'driver' }),
      }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe(DRIVER_HOME_PATH);
      expect(d.reason).toBe('experience_mismatch_driver');
    }
  });

  it('authenticated driver + org stack → driver home', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/workspace',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({ role: 'driver' }),
      }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe(DRIVER_HOME_PATH);
      expect(d.reason).toBe('experience_mismatch_driver');
    }
  });
  it('authenticated org + Finance Pro path → redirect product_locked', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/finance-pro',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({
          role: 'user',
          aggregated: true,
          asset: true,
        }),
      }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe('/trips');
      expect(d.reason).toBe('product_locked');
    }
  });

  it('authenticated org with dispatch → allow /trips', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/(tabs)/trips',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({
          role: 'user',
          aggregated: true,
          asset: false,
        }),
      }),
    });
    expect(d.type).toBe('allow');
    if (d.type === 'allow') {
      expect(d.policyId).toBe('org.trips');
    }
  });

  it('authenticated org without finance grant → soft allow when softDeny', () => {
    const d2 = evaluateNavigationPolicy({
      rawPathname: '/finance',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({
          role: 'user',
          aggregated: false,
          asset: false,
        }),
      }),
    });
    expect(d2.type).toBe('allow');
    if (d2.type === 'allow') {
      expect(d2.soft).toBe(true);
      expect(d2.reason).toBe('grants_soft_deny');
    }
  });

  it('authenticated driver + trip verification → soft allow (shared)', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/trip/abc-trip/verification',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({ role: 'driver' }),
      }),
    });
    expect(d.type).toBe('allow');
    if (d.type === 'allow') {
      expect(d.policyId).toBe('org.trip-verification');
      expect(d.soft).toBe(true);
      expect(d.reason).toBe('grants_soft_deny');
    }
  });

  it('authenticated driver + trip other expense → soft allow (shared)', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/trip/abc-trip/operations/other',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({ role: 'driver' }),
      }),
    });
    expect(d.type).toBe('allow');
    if (d.type === 'allow') {
      expect(d.policyId).toBe('org.trip-ops-other');
      expect(d.soft).toBe(true);
    }
  });

  it('authenticated + driver_signup_success → /driver-signup (not experience home)', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/trips',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({ role: 'driver' }),
        predicates: { driver_signup_success: true },
      }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe('/driver-signup');
      expect(d.reason).toBe('predicate_onboarding');
    }
  });

  it('authenticated + branding → /onboarding/business', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({
          role: 'user',
          aggregated: true,
          asset: false,
        }),
        predicates: { signup_branding_active: true },
      }),
    });
    expect(d.type).toBe('redirect');
    if (d.type === 'redirect') {
      expect(d.to).toBe('/onboarding/business');
    }
  });

  it('authenticated on /onboarding/business with branding → allow', () => {
    const d = evaluateNavigationPolicy({
      rawPathname: '/onboarding/business',
      snapshot: snap({
        sessionPosture: 'authenticated',
        principal: buildPrincipal({
          role: 'user',
          aggregated: true,
          asset: false,
        }),
        predicates: { signup_branding_active: true },
      }),
    });
    expect(d.type).toBe('allow');
  });
});

describe('NavigationActor', () => {
  it('does not navigate on allow or wait', () => {
    const calls: { href: string; replace: boolean }[] = [];
    const actor = new NavigationActor((opts) => calls.push(opts));
    expect(actor.apply({ type: 'wait' }).status).toBe('wait');
    expect(
      actor.apply({ type: 'allow', policyId: 'x', reason: 'ok' }).status,
    ).toBe('none');
    expect(calls).toHaveLength(0);
  });

  it('replace-navigates on redirect and prevents loop', () => {
    const calls: { href: string; replace: boolean }[] = [];
    const actor = new NavigationActor((opts) => calls.push(opts));
    const redirect = {
      type: 'redirect' as const,
      to: SIGN_IN_PATH,
      reason: 'test',
      replace: true as const,
    };
    expect(actor.apply(redirect).status).toBe('navigated');
    expect(calls[0]).toEqual({ href: SIGN_IN_PATH, replace: true });
    expect(actor.apply(redirect).status).toBe('loop_prevented');
    expect(calls).toHaveLength(1);
  });
});
