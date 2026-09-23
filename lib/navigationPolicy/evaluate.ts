/**
 * Pure navigation policy evaluator (RFC §5).
 * No router, no AsyncStorage, no fetch.
 */

import { grantsSatisfy } from '@/lib/navigationPolicy/grants';
import { canonicalizePath } from '@/lib/navigationPolicy/pathCanonicalize';
import {
  findMatchingPolicy,
  getRegistry,
  type MatchedPolicy,
} from '@/lib/navigationPolicy/registry';
import { buildSignInHrefWithReturnTo } from '@/lib/navigationPolicy/returnTo';
import type {
  Decision,
  Experience,
  OnDenyTarget,
  PolicyRecord,
  PolicySnapshot,
  Principal,
} from '@/lib/navigationPolicy/types';
import {
  DRIVER_HOME_PATH,
  FAIL_CLOSED_HOME_PATH,
  ORG_HOME_PATH,
  SIGN_IN_PATH,
  TERMINAL_WEBSITE_PATH,
} from '@/lib/navigationPolicy/types';
import { isLockedProductPath } from '@/lib/suite/productLock';

function resolveOnDeny(
  onDeny: OnDenyTarget | undefined,
  snapshot: PolicySnapshot,
): string {
  if (!onDeny) {
    return snapshot.sessionPosture === 'anonymous' ? SIGN_IN_PATH : FAIL_CLOSED_HOME_PATH;
  }
  switch (onDeny.type) {
    case 'sign_in':
      return SIGN_IN_PATH;
    case 'fail_closed_home':
      return FAIL_CLOSED_HOME_PATH;
    case 'path':
      return onDeny.path;
    case 'experience_home':
      return onDeny.experience === 'driver' ? DRIVER_HOME_PATH : ORG_HOME_PATH;
    default:
      return FAIL_CLOSED_HOME_PATH;
  }
}

function principalExperience(principal: Principal | null): Experience | null {
  if (!principal) return null;
  return principal.role === 'driver' ? 'driver' : 'org';
}

function experienceAllows(
  policyExperience: Experience,
  principal: Principal | null,
  posture: PolicySnapshot['sessionPosture'],
): boolean {
  if (policyExperience === 'public_content' || policyExperience === 'public_process') {
    return true;
  }
  if (posture !== 'authenticated' || !principal) {
    return false;
  }
  // Shared stacks (odometer / trip expenses) are used by both office and driver apps.
  if (policyExperience === 'shared') {
    return true;
  }
  const pe = principalExperience(principal);
  return pe === policyExperience;
}

function predicatesPass(
  policy: PolicyRecord,
  predicates: Readonly<Record<string, boolean>>,
): boolean {
  const req = policy.predicates;
  if (!req) return true;
  if (req.requireTrue) {
    for (const id of req.requireTrue) {
      if (predicates[id] !== true) return false;
    }
  }
  if (req.requireFalse) {
    for (const id of req.requireFalse) {
      if (predicates[id] === true) return false;
    }
  }
  return true;
}

function resolveOnboardingRedirect(
  predicates: Readonly<Record<string, boolean>>,
  canonicalPath: string,
): string | null {
  // Already on destinations — do not bounce (public_process / completion flows).
  if (
    canonicalPath === '/driver-signup' ||
    canonicalPath.startsWith('/onboarding') ||
    canonicalPath === '/sign-up'
  ) {
    return null;
  }
  if (predicates.driver_signup_success === true) {
    return '/driver-signup';
  }
  if (
    predicates.signup_branding_active === true ||
    predicates.owner_org_incomplete === true
  ) {
    return '/onboarding/business';
  }
  return null;
}

function redirect(
  to: string,
  reason: string,
  policyId?: string,
): Decision {
  return { type: 'redirect', to, reason, replace: true, policyId };
}

/**
 * Expo Web strips `(driver)` from usePathname (same as tabs groups in the URL).
 * Registry keys keep `/(driver)/…`. When an authenticated driver hits a
 * group-stripped path that matches a driver policy under the prefix, rematch.
 */
export function expandDriverGroupStrippedPath(
  canonicalPath: string,
  registry: readonly PolicyRecord[],
): string {
  if (canonicalPath === '/(driver)' || canonicalPath.startsWith('/(driver)/')) {
    return canonicalPath;
  }
  if (canonicalPath === '/') {
    return '/(driver)';
  }
  const prefixed = `/(driver)${canonicalPath}`;
  if (findMatchingPolicy(prefixed, registry)) {
    return prefixed;
  }
  return canonicalPath;
}

export type EvaluateInput = {
  rawPathname: string;
  snapshot: PolicySnapshot;
  /** Override registry (tests). */
  registry?: readonly PolicyRecord[];
};

/**
 * Evaluate navigation policy for a pathname + snapshot.
 */
export function evaluateNavigationPolicy(input: EvaluateInput): Decision {
  const { rawPathname, snapshot, registry = getRegistry() } = input;
  let { path: canonicalPath } = canonicalizePath(rawPathname);

  if (
    snapshot.sessionPosture === 'authenticated' &&
    snapshot.principal?.role === 'driver'
  ) {
    canonicalPath = expandDriverGroupStrippedPath(canonicalPath, registry);
  }

  if (snapshot.sessionPosture === 'restoring') {
    return { type: 'wait' };
  }

  if (snapshot.sessionPosture === 'expired') {
    return redirect(
      buildSignInHrefWithReturnTo(rawPathname),
      'session_expired',
    );
  }

  const matched: MatchedPolicy | null = findMatchingPolicy(canonicalPath, registry);

  if (!matched) {
    if (snapshot.sessionPosture === 'anonymous') {
      return redirect(
        buildSignInHrefWithReturnTo(rawPathname),
        'unknown_path_anonymous',
      );
    }
    return redirect(FAIL_CLOSED_HOME_PATH, 'unknown_path_fail_closed');
  }

  const { policy } = matched;

  if (
    snapshot.sessionPosture === 'authenticated' &&
    isLockedProductPath(canonicalPath)
  ) {
    return redirect(ORG_HOME_PATH, 'product_locked', policy.id);
  }

  // Authenticated onboarding predicates — first-class (before public allow / experience).
  if (snapshot.sessionPosture === 'authenticated') {
    const onboardingTo = resolveOnboardingRedirect(
      snapshot.predicates,
      canonicalPath,
    );
    if (onboardingTo) {
      return redirect(onboardingTo, 'predicate_onboarding', policy.id);
    }
  }

  // Anonymous
  if (snapshot.sessionPosture === 'anonymous') {
    // Boot `/` — marketing (web) or sign-in (native)
    if (canonicalPath === '/' && policy.id === 'public.root-boot') {
      const to =
        snapshot.platform === 'web' ? TERMINAL_WEBSITE_PATH : SIGN_IN_PATH;
      return redirect(to, 'boot_anonymous', policy.id);
    }

    if (
      policy.experience === 'public_content' ||
      policy.experience === 'public_process'
    ) {
      return {
        type: 'allow',
        policyId: policy.id,
        reason: 'public_anonymous',
      };
    }

    return redirect(
      buildSignInHrefWithReturnTo(rawPathname),
      'anonymous_protected',
      policy.id,
    );
  }

  // authenticated
  if (!experienceAllows(policy.experience, snapshot.principal, snapshot.sessionPosture)) {
    const pe = principalExperience(snapshot.principal);
    if (pe === 'driver') {
      return redirect(DRIVER_HOME_PATH, 'experience_mismatch_driver', policy.id);
    }
    if (pe === 'org') {
      return redirect(ORG_HOME_PATH, 'experience_mismatch_org', policy.id);
    }
    return redirect(
      SIGN_IN_PATH,
      'experience_mismatch_no_principal',
      policy.id,
    );
  }

  // Public routes for authenticated users: allow (optional bounce handled later / soft)
  if (
    policy.experience === 'public_content' ||
    policy.experience === 'public_process'
  ) {
    return {
      type: 'allow',
      policyId: policy.id,
      reason: 'public_authenticated',
    };
  }

  const grants = snapshot.principal?.grants ?? new Set<string>();
  if (!grantsSatisfy(grants, policy.grants)) {
    if (policy.softDeny) {
      return {
        type: 'allow',
        soft: true,
        policyId: policy.id,
        reason: 'grants_soft_deny',
      };
    }
    return redirect(
      resolveOnDeny(policy.onDeny, snapshot),
      'grants_denied',
      policy.id,
    );
  }

  if (!predicatesPass(policy, snapshot.predicates)) {
    return redirect(
      resolveOnDeny(policy.onDeny, snapshot),
      'predicates_denied',
      policy.id,
    );
  }

  return {
    type: 'allow',
    policyId: policy.id,
    reason: 'policy_allow',
  };
}

/** @deprecated use evaluateNavigationPolicy — alias for RFC wording */
export const evaluate = evaluateNavigationPolicy;

export { TERMINAL_WEBSITE_PATH };
