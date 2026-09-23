/**
 * Navigation policy host — evaluate → Actor (enforce via kill switch).
 * Authenticated cold-boot destination (suite / last-tab) stays in app/index.
 */

import { useOptionalAuth } from '@/contexts/AuthContext';
import { useOptionalOrganization } from '@/contexts/OrganizationContext';
import { isNavigationPolicyEnforceEnabled } from '@/lib/navigationPolicy/enforceFlag';
import {
  NavigationPolicyProvider,
  type NavigateFn,
} from '@/lib/navigationPolicy/NavigationPolicyProvider';
import {
  getPredicateSignalVersion,
  subscribePredicateSignals,
} from '@/lib/navigationPolicy/predicateSignals';
import { authStatusToSessionPosture } from '@/lib/navigationPolicy/sessionPosture';
import {
  hydrateSignupFlowFlags,
  isBusinessSignupBrandingActiveSync,
  isDriverSignupSuccessActiveSync,
} from '@/lib/onboarding/businessSignupBranding.util';
import { isOwnerBusinessProfileRequiredSync } from '@/lib/onboarding/incompleteOwnerOrg.util';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

export function NavigationPolicyShadowHost({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const auth = useOptionalAuth();
  const organization = useOptionalOrganization();
  const status = auth?.status ?? 'restoring';
  const profile = auth?.profile ?? null;
  const operatingModel = organization?.currentOrganization?.operatingModel ?? null;
  const [predicateVersion, setPredicateVersion] = useState(getPredicateSignalVersion);
  const [rootNavigatorMounted, setRootNavigatorMounted] = useState(false);
  const enforce = isNavigationPolicyEnforceEnabled();

  useEffect(() => {
    setRootNavigatorMounted(true);
  }, []);

  useEffect(() => {
    void hydrateSignupFlowFlags();
    return subscribePredicateSignals(() => {
      setPredicateVersion(getPredicateSignalVersion());
    });
  }, []);

  const sessionPosture = authStatusToSessionPosture(status);
  const platform =
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

  const navigate = useCallback<NavigateFn>(
    ({ href, replace }) => {
      if (replace) {
        router.replace(href as Href);
      } else {
        router.push(href as Href);
      }
    },
    [router],
  );

  const profileRole = profile?.role ?? null;
  const profileAggregated = profile?.aggregated;
  const profileAsset = profile?.asset;

  const profileForPolicy = useMemo(
    () =>
      profileRole
        ? {
            role: profileRole,
            aggregated: profileAggregated,
            asset: profileAsset,
          }
        : null,
    [profileRole, profileAggregated, profileAsset],
  );

  const predicates = useMemo(
    () => ({
      signup_branding_active: isBusinessSignupBrandingActiveSync(),
      owner_org_incomplete: isOwnerBusinessProfileRequiredSync(),
      driver_signup_success: isDriverSignupSuccessActiveSync(),
    }),
    [predicateVersion, pathname, status, profile?.uid],
  );

  return (
    <NavigationPolicyProvider
      pathname={pathname}
      sessionPosture={sessionPosture}
      profile={profileForPolicy}
      operatingModel={operatingModel}
      predicates={predicates}
      platform={platform}
      enforce={enforce && rootNavigatorMounted}
      navigate={rootNavigatorMounted ? navigate : undefined}
    >
      {children}
    </NavigationPolicyProvider>
  );
}
