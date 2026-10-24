import { useAuth } from '@/contexts/AuthContext';
import { useIsOnline } from '@/contexts/NetworkContext';
import {
  checkExistingUserByPhone,
  checkEmailRegisteredForSignup,
  checkOrganizationNameTaken,
  checkOrgForEmailDomain,
  applyPendingOAuthMetadata,
  oauthIdentityMismatchMessage,
  getMyPendingDomainJoinRequest,
  OAUTH_METADATA_PARTIAL_FAILURE_MESSAGE,
  resendVerificationEmail,
  setPendingOAuthMetadata,
  updateProfile,
  type OperatingModel,
} from '@/features/auth';
import { getOrganizationsForUser } from '@/features/organization/services/organization.service';
import {
  formatInvitationAge,
  type InvitationResolverResult,
} from '@/features/organization/services/teamInvitationResolver.service';
import { shadowCheckPlatformIdentity } from '@/features/organization/utils/platformIdentityShadowCheck.util';
import { validateEmail } from '@/lib/emailValidation';
import { formatMobileNumber } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { phoneIdentity } from '@/lib/onboarding/identityTypes';
import { entryChannelFromParams } from '@/lib/onboarding/onboardingEntryChannels';
import { platformIdentityService } from '@/lib/platform-identity';
import {
  onboardingContextAnalyticsEvent,
  onboardingContextToUi,
  type ResolvedOnboardingContext,
} from '@/lib/onboarding/onboardingContext';
import { trackOnboardingEvent } from '@/lib/onboarding/onboardingAnalytics';
import {
  clearBusinessSignupBranding,
  hydrateBusinessSignupBrandingFlag,
  persistBusinessSignupBrandingStep,
  readBusinessSignupBrandingStep,
  setBusinessSignupBrandingActive,
} from '@/lib/onboarding/businessSignupBranding.util';
import {
  clearOwnerBusinessProfileRequired,
  hydrateOwnerBusinessProfileFlag,
  persistOwnerBusinessProfileStep,
  readOwnerBusinessProfileStep,
  setOwnerBusinessProfileRequired,
} from '@/lib/onboarding/incompleteOwnerOrg.util';
import {
  clearPendingPersonalization,
  getPendingPersonalization,
  markPendingPersonalizationRetried,
  setPendingPersonalization,
} from '@/lib/onboarding/pendingPersonalization.util';
import {
  extractIndianMobileTenDigits,
  isPhoneValid,
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from '@/lib/phoneValidation';
import {
  validateAddressLocality,
  validateFullName,
  validateIndianPincode,
  validatePassword,
  validateStreetAddress,
} from '@/lib/validation';
import {
  pickAndUploadAvatar,
  pickAndUploadOrgLogo,
  uploadAvatarFromLocal,
  updateOrganizationLogo,
} from '@/lib/avatarUpload';
import { supabase } from '@/lib/supabase';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';

import type { IndiaLocation } from '../components/CityPicker';
import {
  DEBOUNCE_MS,
  DESKTOP_BREAKPOINT,
  DESKTOP_MAX_PANEL_WIDTH,
  EMAIL_RESEND_SECS,
  OTP_LENGTH,
  OTP_RESEND_SECS,
  PHONE_CHECK_DEBOUNCE_MS,
  STEP_LABELS,
  type BusinessType,
  type EmployeeCount,
  type FleetSize,
  type MonthlyVolume,
} from '../signUpConstants';
import { useCountdown } from './useCountdown';
import { parseSignupEntryIntent, signupEntrySource } from '../signupEntryIntent';

import { useCompleteInvitationJoin } from './useCompleteInvitationJoin';
import type { InvitePhase, SignupTrack } from '../signupInviteTypes';
import { usePendingOnboarding } from '@/contexts/PendingOnboardingContext';
import { reverseGeocodePlaceInIndia, resolveIndiaPincode } from '@/lib/placesService';
import { coordsOrUnset } from '@/lib/placeSearch.util';
import { useViewportWidth } from '@/lib/hooks/useViewportWidth';
import {
  matchIndiaLocation,
  parsePlaceDisplayName,
} from '../utils/matchIndiaLocation.util';
import { legacyTeamInviteToIdentityInvitation } from '@/lib/onboarding/invitationModel.util';

export { STEP_LABELS };
export type { InvitePhase, SignupTrack } from '../signupInviteTypes';

export function useBusinessSignUpFlow() {
  // Width only — height ticks from the Android Chrome keyboard would re-render
  // every Join-your-team TextInput under the caret (see useViewportWidth).
  const width = useViewportWidth();
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ intent?: string; invite?: string; ref?: string }>();
  const entryIntent = parseSignupEntryIntent(searchParams);
  const entrySource = signupEntrySource(searchParams);
  const isTeamInviteEntry = entryIntent === 'team';
  const isOnline = useIsOnline();
  const { signUp, signIn, signInWithGoogle, refreshSession } = useAuth();
  const { pending: pendingOnboarding, isHydrated: pendingHydrated, setPendingInvitation, clearPending } =
    usePendingOnboarding();
  const { completeInvitationJoin, completeTeamJoinAfterAuth } = useCompleteInvitationJoin();
  const scrollRef = useRef<ScrollView>(null);
  const accountScrollRef = useRef<ScrollView>(null);
  const locationScrollRef = useRef<ScrollView>(null);
  const sessionEnsuredRef = useRef(false);

  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const useMobileLayout = !isDesktop;
  const pageWidth = isDesktop ? Math.min(DESKTOP_MAX_PANEL_WIDTH, width - 120) : width;

  const [step, setStep] = useState(0);
  const [introDismissed, setIntroDismissed] = useState(() => isTeamInviteEntry);
  /** After welcome-Google (or shell-org gate): collect Org → Profile → City, skip Account. */
  const [postGoogleOwnerWizard, setPostGoogleOwnerWizard] = useState(false);

  // Step 0
  const [phone, setPhoneRaw] = useState('');
  const [phoneExistsCheck, setPhoneExistsCheck] = useState<{
    loading: boolean; exists: boolean; email?: string; masked_email?: string;
  } | null>(null);
  const phoneCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phoneCheckGenRef = useRef(0);

  // Step 1
  const [otp, setOtp] = useState('');
  const [otpResendSecs, setOtpResendSecs] = useState(0);
  const otpCountdown = useCountdown();

  // Step 2
  const [orgName, setOrgNameRaw] = useState('');
  const [orgCheck, setOrgCheck] = useState<{ loading: boolean; taken: boolean } | null>(null);
  const orgCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orgTakenError, setOrgTakenError] = useState<string | null>(null);
  const [accountOrgConflictMessage, setAccountOrgConflictMessage] = useState<string | null>(null);

  // Step 3
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [employeeCount, setEmployeeCount] = useState<EmployeeCount | null>(null);
  const [operatingModel, setOperatingModelRaw] = useState<OperatingModel>('HYBRID');
  const [fleetSize, setFleetSize] = useState<FleetSize | null>(null);
  const [monthlyVolume, setMonthlyVolume] = useState<MonthlyVolume | null>(null);
  const [streetAddress, setStreetAddress] = useState('');
  const [officePlaceLabel, setOfficePlaceLabel] = useState('');
  const [officeLatitude, setOfficeLatitude] = useState<number | null>(null);
  const [officeLongitude, setOfficeLongitude] = useState<number | null>(null);
  const [officePlaceResolving, setOfficePlaceResolving] = useState(false);
  const [locality, setLocality] = useState('');
  const [pincode, setPincode] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<IndiaLocation | null>(null);

  // Step 4
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Step 5 (account)
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [resendingSecs, setResendingSecs] = useState(0);
  const resendEmailCountdown = useCountdown();

  // Live check as the account email is typed: does its domain already have an
  // org (e.g. vasanth@gogox.com after nihas@gogox.com created the workspace)?
  const [emailDomainMatch, setEmailDomainMatch] = useState<{
    organizationId: string;
    organizationName: string;
  } | null>(null);
  const emailDomainCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set when signup's email domain already matched an existing org: org
  // creation was skipped server-side and a join request was filed instead.
  const [domainJoinOrgName, setDomainJoinOrgName] = useState<string | null>(null);

  // Step 6 — workspace logo (post-auth)
  const [provisionedOrgId, setProvisionedOrgId] = useState<string | null>(null);
  const [logoPreviewUri, setLogoPreviewUri] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [pendingLogoPath, setPendingLogoPath] = useState<string | null>(null);

  // Step 7 — profile photo (post-auth)
  const [profileAvatarSeed, setProfileAvatarSeed] = useState<string | null>(null);
  const [profilePreviewUri, setProfilePreviewUri] = useState<string | null>(null);
  const [profileLocalBase64, _setProfileLocalBase64] = useState<string | null>(null);
  const [profileAvatarPath, setProfileAvatarPath] = useState<string | null>(null);
  const [profileUploading, setProfileUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  const [step2Attempted, setStep2Attempted] = useState(false);
  const [step3Attempted, setStep3Attempted] = useState(false);
  const [step4Attempted, setStep4Attempted] = useState(false);
  const [step5Attempted, setStep5Attempted] = useState(false);
  const [inviteAccountAttempted, setInviteAccountAttempted] = useState(false);
  const [inviteEmailMasked, setInviteEmailMasked] = useState<string | null>(null);
  const [_inviteUseAlternateEmail, setInviteUseAlternateEmail] = useState(false);

  // Invitation resolver (post-OTP, pre-org onboarding)
  const [signupTrack, setSignupTrack] = useState<SignupTrack>('owner');
  const [invitePhase, setInvitePhase] = useState<InvitePhase>('accept');
  const [resolvedInvites, setResolvedInvites] = useState<InvitationResolverResult | null>(null);
  const [selectedInviteId, setSelectedInviteId] = useState<string | null>(null);
  const [onboardingContext, setOnboardingContext] = useState<ResolvedOnboardingContext | null>(null);

  const selectedInvite = useMemo(() => {
    const pool = resolvedInvites?.active ?? [];
    if (selectedInviteId) {
      return pool.find((i) => i.inviteId === selectedInviteId) ?? null;
    }
    return pool[0] ?? null;
  }, [resolvedInvites, selectedInviteId]);

  useEffect(() => {
    trackOnboardingEvent(
      isTeamInviteEntry ? 'join_company_started' : 'owner_signup_started',
      { entryHint: entryIntent, source: entrySource },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Derived / memoised ──────────────────────────────────────────────────

  const phoneInlineError = useMemo(() => {
    if (!phone.trim()) return null;
    if (!isPhoneValid(phone)) return 'Enter a valid 10-digit number.';
    return null;
  }, [phone]);

  const phoneValid = useMemo(() => validatePhone(phone) === null, [phone]);

  const step3Errors = useMemo(() => ({
    businessType: !businessType ? 'Select your business structure.' : null,
    fleetSize:
      (operatingModel === 'ASSET_BASED' || operatingModel === 'HYBRID') && !fleetSize
        ? 'Select your fleet size.' : null,
    monthlyVolume:
      (operatingModel === 'NON_ASSET' || operatingModel === 'HYBRID') && !monthlyVolume
        ? 'Select your monthly shipment volume.' : null,
    employeeCount: !employeeCount ? 'Select your employee count.' : null,
  }), [businessType, fleetSize, monthlyVolume, employeeCount, operatingModel]);

  const step4Errors = useMemo(() => ({
    street: validateStreetAddress(streetAddress),
    locality: validateAddressLocality(locality),
    pincode: validateIndianPincode(pincode),
    city: !selectedLocation ? 'Select your city.' : null,
  }), [streetAddress, locality, pincode, selectedLocation]);

  const step4Valid = useMemo(
    () => !step4Errors.street && !step4Errors.locality && !step4Errors.pincode && !step4Errors.city,
    [step4Errors],
  );

  const step5Errors = useMemo(() => ({
    fullName: validateFullName(true)(fullName),
    email: !email.trim() ? 'Email is required.' : validateEmail(email),
    password: !password ? 'Password is required.' : validatePassword(password),
    confirmPassword: !confirmPassword
      ? 'Please confirm your password.'
      : password !== confirmPassword ? 'Passwords do not match.' : null,
  }), [fullName, email, password, confirmPassword]);

  const passwordStrength = useMemo(() => {
    if (!password || password.length < OTP_LENGTH) return 0;
    let score = 1;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
  }, [password]);

  const confirmMismatch =
    password.length > 0 && confirmPassword.length > 0 && password !== confirmPassword;

  // ─── Side effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!phone.trim() || !isPhoneValid(phone)) {
      setPhoneExistsCheck(null);
      phoneCheckGenRef.current += 1;
      if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);
      return;
    }
    if (!isOnline) return;
    if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);

    const generation = ++phoneCheckGenRef.current;
    phoneCheckRef.current = setTimeout(async () => {
      if (generation !== phoneCheckGenRef.current) return;
      setPhoneExistsCheck((prev) =>
        prev ? { ...prev, loading: true } : { loading: true, exists: false },
      );
      const r = await checkExistingUserByPhone(phone);
      if (generation !== phoneCheckGenRef.current) return;
      setPhoneExistsCheck({
        loading: false,
        exists: r.exists,
        email: r.email,
        masked_email: r.masked_email,
      });
    }, PHONE_CHECK_DEBOUNCE_MS);

    return () => {
      if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);
    };
  }, [phone, isOnline]);

  useEffect(() => {
    const raw = orgName.trim();
    if (!raw) {
      setOrgCheck(null);
      if (orgCheckRef.current) clearTimeout(orgCheckRef.current);
      return;
    }
    if (!isOnline) return;
    if (orgCheckRef.current) clearTimeout(orgCheckRef.current);
    setOrgCheck(p => (p ? { ...p, loading: true } : { loading: true, taken: false }));
    orgCheckRef.current = setTimeout(async () => {
      const r = await checkOrganizationNameTaken(raw);
      setOrgCheck({ loading: false, taken: !r.error && r.taken });
    }, DEBOUNCE_MS);
    return () => { if (orgCheckRef.current) clearTimeout(orgCheckRef.current); };
  }, [orgName, isOnline]);

  useEffect(() => {
    const raw = email.trim();
    setEmailDomainMatch(null);
    if (emailDomainCheckRef.current) clearTimeout(emailDomainCheckRef.current);
    if (!raw || validateEmail(raw) || !isOnline) return;
    emailDomainCheckRef.current = setTimeout(async () => {
      const r = await checkOrgForEmailDomain(raw);
      if (!r.error && r.match) setEmailDomainMatch(r.match);
    }, DEBOUNCE_MS);
    return () => { if (emailDomainCheckRef.current) clearTimeout(emailDomainCheckRef.current); };
  }, [email, isOnline]);

  // Restore branding steps after auth refresh / navigation bounce.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const active = await hydrateBusinessSignupBrandingFlag();
      if (cancelled || !active) return;
      const savedStep = await readBusinessSignupBrandingStep();
      if (cancelled || savedStep == null) return;
      setIntroDismissed(true);
      setStep(savedStep);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resume post-Google owner wizard (org/profile/city) after bounce or incomplete-org gate.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const required = await hydrateOwnerBusinessProfileFlag();
      if (cancelled || !required) return;
      setPostGoogleOwnerWizard(true);
      setIntroDismissed(true);
      const savedStep = await readOwnerBusinessProfileStep();
      if (cancelled) return;
      setStep(savedStep != null ? savedStep : 2);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist org wizard progress while the incomplete-owner gate is active.
  useEffect(() => {
    if (!postGoogleOwnerWizard) return;
    if (step >= 2 && step <= 4) {
      void persistOwnerBusinessProfileStep(step);
    }
  }, [postGoogleOwnerWizard, step]);

  // Resume member invite onboarding after app restart (pending invitation in storage).
  useEffect(() => {
    if (!pendingHydrated || !pendingOnboarding) return;
    if (step !== 0) return;
    const storedPhone = pendingOnboarding.phone.trim();
    if (!storedPhone) return;

    setIntroDismissed(true);
    setPhoneRaw(formatMobileNumber(storedPhone));
    setSignupTrack('invite');
    setInvitePhase(pendingOnboarding.phase);
    setResolvedInvites(pendingOnboarding.resolved);
    setSelectedInviteId(pendingOnboarding.inviteId);
    if (pendingOnboarding.invitation?.inviteeName && !fullName.trim()) {
      setFullName(pendingOnboarding.invitation.inviteeName.trim());
    }
    const ui = onboardingContextToUi({
      type:
        pendingOnboarding.phase === 'existing_account'
          ? 'existing_member'
          : pendingOnboarding.phase === 'no_invite'
            ? 'no_invitation'
            : pendingOnboarding.phase === 'expired'
              ? 'expired_invites'
              : pendingOnboarding.phase === 'picker'
                ? 'multiple_invites'
                : 'team',
      invitations: pendingOnboarding.resolved,
      selectedInvite: pendingOnboarding.invitation,
      selectedInviteId: pendingOnboarding.inviteId,
      phoneAccountExists: false,
      existingAccountEmail: null,
      existingAccountMasked: null,
    });
    setOnboardingContext({
      type:
        ui.invitePhase === 'existing_account'
          ? 'existing_member'
          : ui.invitePhase === 'no_invite'
            ? 'no_invitation'
            : ui.invitePhase === 'expired'
              ? 'expired_invites'
              : ui.invitePhase === 'picker'
                ? 'multiple_invites'
                : 'team',
      invitations: pendingOnboarding.resolved,
      selectedInvite: pendingOnboarding.invitation,
      selectedInviteId: pendingOnboarding.inviteId,
      phoneAccountExists: false,
      existingAccountEmail: null,
      existingAccountMasked: null,
    });
    setStep(2);
  }, [pendingHydrated, pendingOnboarding]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve org when entering branding steps (trigger may lag sign-up).
  // sessionEnsuredRef prevents re-running ensureAuthSession on every back/forward
  // between steps 6 and 7, which would otherwise fire signIn+refreshSession on each
  // step change and risk a routing cascade from app/index.tsx.
  useEffect(() => {
    if (step !== 6 && step !== 7) return;
    let cancelled = false;
    void (async () => {
      if (!sessionEnsuredRef.current) {
        const ok = await ensureAuthSession();
        if (cancelled) return;
        if (ok) sessionEnsuredRef.current = true;
      }
      if (cancelled || provisionedOrgId) return;
      const orgId = await resolveProvisionedOrgId();
      if (!cancelled && orgId) setProvisionedOrgId(orgId);
    })();
    return () => {
      cancelled = true;
    };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply any personalization queued before email verification (see persistProfilePhoto),
  // once a session exists. Runs independent of `step` since the resumed step after
  // verification can be 6, 7, or 8. Retried exactly once per mount; cleared on success only.
  // TODO: this only replays because the branding gate (businessSignupBranding.util)
  // keeps routing the user back into this hook until Step 8 finishes — that's a signup
  // implementation detail, not a real dependency of the personalization queue. Move this
  // replay into something that watches session/auth state directly (e.g. AuthContext or a
  // profile bootstrap step) so it keeps working if the branding gate's lifecycle changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entry = await getPendingPersonalization('profile_photo');
      if (!entry || entry.retried || cancelled) return;

      const { data: { session } } = await supabase().auth.getSession();
      if (!session?.user?.id || cancelled) return;

      const { error } = await updateProfile({ avatar_url: null, avatar_seed: entry.avatarSeed });
      if (cancelled) return;
      if (error) {
        await markPendingPersonalizationRetried('profile_photo');
        return;
      }
      await clearPendingPersonalization('profile_photo');
      setProfileAvatarSeed(entry.avatarSeed);
      setProfilePreviewUri(null);
      await refreshSession();
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step >= 6 && step <= 8) {
      setBusinessSignupBrandingActive(true);
      void persistBusinessSignupBrandingStep(step);
    }
  }, [step]);

  // Cleanup debounce timers on unmount (countdowns clean themselves via useCountdown).
  useEffect(() => () => {
    if (phoneCheckRef.current) clearTimeout(phoneCheckRef.current);
    if (orgCheckRef.current) clearTimeout(orgCheckRef.current);
  }, []);

  // ─── Web browser history (Android back gesture) ──────────────────────────
  // Push a history entry per step (1-5) so Android back gesture = previous step,
  // not browser navigation away from the page.

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.history.replaceState({ signupStep: step }, '');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPop = (e: PopStateEvent) => {
      // Post-auth steps: block browser back to avoid landing on a submitted form.
      if (step >= 6) {
        window.history.pushState({ signupStep: step }, '');
        return;
      }
      const target = typeof e.state?.signupStep === 'number' ? e.state.signupStep : Math.max(0, step - 1);
      setStep(target);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [step]);

  // ─── Navigation ──────────────────────────────────────────────────────────

  const goToPage = (index: number) => {
    setStep(index);
    if (index >= 6 && index <= 8) {
      setBusinessSignupBrandingActive(true);
      void persistBusinessSignupBrandingStep(index);
    }
    // Push history for forward navigation on steps 1-5 so Android back gesture
    // goes to the previous signup step instead of leaving the page.
    if (Platform.OS === 'web' && typeof window !== 'undefined' && index > step && index <= 5) {
      window.history.pushState({ signupStep: index }, '');
    }
    scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  const handleBack = () => {
    if (step === 0) { router.back(); return; }
    if (step === 2 && signupTrack === 'invite') {
      if (invitePhase === 'accept' && (resolvedInvites?.active.length ?? 0) > 1) {
        setInvitePhase('picker');
        return;
      }
      if (invitePhase === 'existing_account') {
        setInvitePhase('accept');
        return;
      }
      if (invitePhase === 'no_invite' || invitePhase === 'expired') {
        setSignupTrack('owner');
        setResolvedInvites(null);
        setSelectedInviteId(null);
        void clearPending();
        goToPage(1);
        return;
      }
      setSignupTrack('owner');
      setResolvedInvites(null);
      setSelectedInviteId(null);
      void clearPending();
      goToPage(1);
      return;
    }
    if (step === 8 || step === 9) {
      clearBusinessSignupBranding();
      router.replace('/');
      return;
    }
    // Invite track jumps straight from step 2 to step 7 (skips the org-creation
    // steps 3-6 entirely, since they join an existing org rather than build one)
    // — back from step 7 must not fall through to goToPage(6)/OrgLogoStep,
    // a screen for a company they never created.
    if (step === 7 && signupTrack === 'invite') {
      clearBusinessSignupBranding();
      router.replace('/');
      return;
    }
    // Step 6 is the first post-account-creation step. Pressing back here would
    // land on an already-submitted form, and further back presses would trigger
    // router.back() which exits the screen — then the branding flag redirects
    // straight back, creating a reload loop. Treat back from step 6 as "finish
    // later": clear the flag and let app/index.tsx route to the right screen.
    if (step === 6) {
      clearBusinessSignupBranding();
      router.replace('/');
      return;
    }
    // On web, use browser history.back() so the history stack stays consistent
    // with the pushState entries added in goToPage.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.back();
      return;
    }
    goToPage(step - 1);
  };

  const resolveProvisionedOrgId = async (): Promise<string | null> => {
    const trimmed = orgName.trim().toLowerCase();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const { organizations, error } = await getOrganizationsForUser();
      if (error) {
        console.warn('[signup] resolve org failed:', error.message);
      } else if (organizations.length > 0) {
        const match =
          organizations.find((o) => o.name.trim().toLowerCase() === trimmed) ?? organizations[0];
        if (match?.id) {
          void shadowCheckPlatformIdentity({
            flow: 'business_signup',
            legacyOrganizationIds: organizations.map((o) => o.id),
          });
          return match.id;
        }
      }
      if (attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    return null;
  };

  const ensureAuthSession = async (): Promise<boolean> => {
    const { data: { session } } = await supabase().auth.getSession();
    if (session?.user?.id) return true;

    const signInResult = await signIn(email.trim(), password, true);
    if (!signInResult.error) {
      await refreshSession();
      return true;
    }

    const { data: { session: afterSignIn } } = await supabase().auth.getSession();
    return !!afterSignIn?.user?.id;
  };

  // ─── Setters with side-effects ───────────────────────────────────────────

  const setPhone = (t: string) => setPhoneRaw(formatMobileNumber(t));

  const setOrgName = (t: string) => {
    setOrgNameRaw(t);
    setStep2Attempted(false);
    setOrgTakenError(null);
    setAccountOrgConflictMessage(null);
  };

  const orgTakenMessage = (name: string) =>
    `The workspace '${name}' is already registered. Please ask your company's administrator to send you an invite.`;

  const ACCOUNT_ORG_CONFLICT_MESSAGE =
    'This workspace name is no longer available. Please choose a different name to continue.';

  const setOperatingModel = (m: OperatingModel) => {
    setOperatingModelRaw(m);
    setFleetSize(null);
    setMonthlyVolume(null);
  };

  const toggleShowPassword = () => setShowPassword(v => !v);
  const toggleShowConfirmPassword = () => setShowConfirmPassword(v => !v);

  // ─── Step actions ────────────────────────────────────────────────────────

  const applyOnboardingContext = async (context: ResolvedOnboardingContext) => {
    const ui = onboardingContextToUi(context);
    setOnboardingContext(context);
    setSignupTrack(ui.signupTrack);
    setInvitePhase(ui.invitePhase);
    setResolvedInvites(context.invitations);
    setSelectedInviteId(context.selectedInviteId);

    if (context.existingAccountEmail && !email.trim()) {
      setEmail(context.existingAccountEmail);
    }
    if (context.existingAccountMasked) {
      setInviteEmailMasked(context.existingAccountMasked);
    }
    if (context.selectedInvite && !fullName.trim() && context.selectedInvite.inviteeName.trim()) {
      setFullName(context.selectedInvite.inviteeName.trim());
    }

    const phase = ui.invitePhase;
    await setPendingInvitation({
      phone,
      resolved: context.invitations,
      phase,
      inviteId: context.selectedInviteId,
      invitation: context.selectedInvite,
    });

    trackOnboardingEvent(
      onboardingContextAnalyticsEvent(context.type) as Parameters<typeof trackOnboardingEvent>[0],
      {
        entryHint: entryIntent,
        onboardingType: context.type,
        inviteId: context.selectedInviteId,
        inviteCount: context.invitations.active.length,
        phoneAccountExists: context.phoneAccountExists,
        source: entrySource,
      },
    );
  };

  const startOtpCountdown = () => otpCountdown.start(OTP_RESEND_SECS, setOtpResendSecs);

  const continuePhone = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    const phoneErr = validatePhone(phone);
    if (phoneErr) return Alert.alert('Invalid', phoneErr);

    // Cancel any in-flight debounce and use the cached result if fresh, else re-fetch once.
    if (phoneCheckRef.current) { clearTimeout(phoneCheckRef.current); phoneCheckRef.current = null; }

    let existing = phoneExistsCheck;
    if (!existing || existing.loading) {
      setLoading(true);
      const r = await checkExistingUserByPhone(phone);
      setLoading(false);
      existing = { loading: false, exists: r.exists, email: r.email, masked_email: r.masked_email };
      setPhoneExistsCheck(existing);
    }

    if (existing.exists && existing.email) {
      setEmail((prev) => prev || existing.email || '');
    }

    setOtp('');
    startOtpCountdown();
    goToPage(1);
  };

  const verifyOtp = async () => {
    const clean = otp.replace(/\s/g, '');
    if (clean.length < OTP_LENGTH) return Alert.alert('Invalid', 'Enter the 6-digit OTP.');
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');

    setLoading(true);

    try {
      let phoneAccount = phoneExistsCheck;
      if (!phoneAccount || phoneAccount.loading) {
        const r = await checkExistingUserByPhone(phone);
        phoneAccount = {
          loading: false,
          exists: r.exists,
          email: r.email,
          masked_email: r.masked_email,
        };
        setPhoneExistsCheck(phoneAccount);
      }

      const storedPhone = normalizeIndianPhoneForMetadata(phone) ?? phone.trim();
      const verifiedPhone = phoneIdentity(storedPhone, true);
      const entryChannel = entryChannelFromParams(searchParams);
      const emptyInvites: InvitationResolverResult = { active: [], expired: [] };

      const { error, result } = await platformIdentityService.resolveInvitations({
        identities: [verifiedPhone],
      });

      // Mock OTP accepts any 6 digits — never block verification on resolver/DB failures.
      // Team join → limited-access screen; owner path → continue without invites.
      const inviteResult = error ? emptyInvites : result;
      if (error) {
        if (__DEV__) {
          console.warn('[onboarding] invitation resolver unavailable:', error.message);
        }
      }

      const context = await platformIdentityService.resolveOnboardingContext({
        entryHint: entryIntent,
        entryChannel,
        verifiedIdentities: [verifiedPhone],
        inviteResult,
        phoneAccountExists: Boolean(phoneAccount?.exists),
        existingAccountEmail: phoneAccount?.email ?? null,
        existingAccountMasked: phoneAccount?.masked_email ?? null,
        isInviteEmailRegistered: async (em) => {
          const r = await checkEmailRegisteredForSignup(em);
          return { exists: r.exists, masked_email: r.masked_email };
        },
      });

      trackOnboardingEvent('otp_verified', {
        entryHint: entryIntent,
        onboardingType: context.type,
        inviteCount: inviteResult.active.length,
        phoneAccountExists: context.phoneAccountExists,
        source: entrySource,
      });

      platformIdentityService.recordIdentityVerified({
        method: 'phone_otp',
        identities: [verifiedPhone],
        entryChannel,
        entryHint: entryIntent,
      });

      await applyOnboardingContext(context);

      if (context.type === 'owner') {
        await clearPending();
      }

      goToPage(2);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Verification could not complete.';
      Alert.alert('Could not continue', message);
    } finally {
      setLoading(false);
    }
  };

  const selectInvite = (inviteId: string) => setSelectedInviteId(inviteId);

  const continueInvitePicker = async () => {
    if (!selectedInviteId || !resolvedInvites) return;
    const invite = resolvedInvites.active.find((i) => i.inviteId === selectedInviteId);
    if (invite && !fullName.trim()) setFullName(invite.inviteeName.trim());
    setInviteUseAlternateEmail(false);

    const phoneAccount = phoneExistsCheck;
    const verifiedPhone = phoneIdentity(phone, true);
    const context = await platformIdentityService.resolveOnboardingContext({
      entryHint: entryIntent,
      verifiedIdentities: [verifiedPhone],
      inviteResult: {
        active: invite ? [invite] : [],
        expired: resolvedInvites.expired,
      },
      phoneAccountExists: Boolean(phoneAccount?.exists),
      existingAccountEmail: phoneAccount?.email ?? null,
      existingAccountMasked: phoneAccount?.masked_email ?? null,
      isInviteEmailRegistered: async (em) => {
        const r = await checkEmailRegisteredForSignup(em);
        return { exists: r.exists, masked_email: r.masked_email };
      },
    });
    await applyOnboardingContext(context);
  };

  const useAlternateEmailForInvite = () => {
    setInviteUseAlternateEmail(true);
    setInviteEmailMasked(null);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setInviteAccountAttempted(false);
    setInvitePhase('accept');
  };

  const startOwnerOnboarding = async () => {
    setSignupTrack('owner');
    setInvitePhase('accept');
    setResolvedInvites(null);
    setSelectedInviteId(null);
    setInviteUseAlternateEmail(false);
    setInviteEmailMasked(null);
    await clearPending();
    goToPage(2);
  };

  const requestNewInvitation = () => {
    Alert.alert(
      'Request a new invitation',
      'Ask your workspace admin to invite this phone number again from Team members.',
    );
  };

  const acceptTeamInvitation = async () => {
    if (!selectedInvite) return;
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    setInviteAccountAttempted(true);
    const { fullName: fn, email: em, password: pw, confirmPassword: cp } = step5Errors;
    if (fn || em || pw || cp) return;

    const emailCheck = await checkEmailRegisteredForSignup(email.trim());
    if (emailCheck.exists) {
      setInviteEmailMasked(emailCheck.masked_email ?? email.trim());
      setInvitePhase('existing_account');
      return Alert.alert(
        'Account already exists',
        'This email is already registered. Sign in to accept the invite, or use a different email.',
      );
    }

    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    if (!storedPhone || !extractIndianMobileTenDigits(phone)) {
      return Alert.alert('Invalid', 'Enter a valid phone number.');
    }

    setLoading(true);
    const signUpResult = await signUp({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      role: 'user',
      phone: storedPhone,
      operatingModel: 'HYBRID',
      onboardingType: 'member',
    });
    if (signUpResult.error) {
      setLoading(false);
      return Alert.alert('Error', signUpResult.error.message);
    }

    const hasSession = await ensureAuthSession();
    if (!hasSession) {
      setLoading(false);
      return Alert.alert(
        'Confirm your email',
        'Verify your email, then sign in to accept the invitation.',
      );
    }

    const joinResult = await completeInvitationJoin(selectedInvite.inviteId, {
      invitationStatus: legacyTeamInviteToIdentityInvitation(selectedInvite).status,
      role: selectedInvite.platformRole ?? undefined,
    });
    setLoading(false);
    if (joinResult.error) {
      trackOnboardingEvent('invitation_accept_failed', { inviteId: selectedInvite.inviteId });
      return Alert.alert('Could not accept invitation', joinResult.error.message);
    }

    trackOnboardingEvent('invitation_accepted', { inviteId: selectedInvite.inviteId });
    // Let the invited member pick their own avatar before landing in the app,
    // same step the "create new org" track already uses (case 7 in
    // BusinessSignUpScreen renders it regardless of signupTrack). continueFromProfilePhoto
    // / skipProfilePhoto route to Trips instead of SuccessStep for this track.
    goToPage(7);
  };

  const signInToAcceptInvitation = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    setInviteAccountAttempted(true);
    const { email: em, password: pw } = step5Errors;
    if (em || pw) return;

    const signInEmail = email.trim() || onboardingContext?.existingAccountEmail?.trim() || '';
    if (!signInEmail) {
      return Alert.alert('Email required', 'Enter the email for your existing Pulse account.');
    }

    setLoading(true);
    const signInResult = await signIn(signInEmail, password, true);
    if (signInResult.error) {
      setLoading(false);
      return Alert.alert('Sign in failed', signInResult.error.message);
    }

    await ensureAuthSession();
    trackOnboardingEvent('existing_account_signed_in', {
      inviteId: selectedInvite?.inviteId ?? selectedInviteId,
    });

    const joinResult = await completeTeamJoinAfterAuth(
      selectedInvite?.inviteId ?? selectedInviteId,
      selectedInvite
        ? {
            invitationStatus: legacyTeamInviteToIdentityInvitation(selectedInvite).status,
            role: selectedInvite.platformRole ?? undefined,
          }
        : undefined,
    );
    setLoading(false);
    if (joinResult.error) {
      trackOnboardingEvent('invitation_accept_failed', {
        inviteId: selectedInvite?.inviteId ?? selectedInviteId,
      });
      const msg = joinResult.error.message;
      if (/phone number does not match/i.test(msg)) {
        return Alert.alert(
          'Phone mismatch',
          'Your account phone does not match this invite. Ask your admin to invite your registered email instead.',
        );
      }
      return Alert.alert('Could not accept invitation', msg);
    }

    trackOnboardingEvent('invitation_accepted', {
      inviteId: selectedInvite?.inviteId ?? selectedInviteId,
    });
    router.replace(ROUTES.TABS.TRIPS as Parameters<typeof router.replace>[0]);
  };

  const formatInviteAge = formatInvitationAge;

  const continueOrgCheck = async () => {
    setStep2Attempted(true);
    const trimmed = orgName.trim();
    if (!trimmed) return;
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');

    if (orgCheckRef.current) {
      clearTimeout(orgCheckRef.current);
      orgCheckRef.current = null;
    }

    let check = orgCheck;
    if (!check || check.loading) {
      setLoading(true);
      const r = await checkOrganizationNameTaken(trimmed);
      setLoading(false);
      if (r.error) return Alert.alert('Error', r.error.message);
      check = { loading: false, taken: r.taken };
      setOrgCheck(check);
    }

    if (check.taken) {
      setOrgTakenError(orgTakenMessage(trimmed));
      return;
    }

    setOrgTakenError(null);
    goToPage(3);
  };

  const continueCompanyDetails = () => {
    setStep3Attempted(true);
    const { businessType: bt, fleetSize: fs, monthlyVolume: mv, employeeCount: ec } = step3Errors;
    if (bt || fs || mv || ec) return;
    goToPage(4);
  };

  const continueCompanyLocation = async () => {
    setStep4Attempted(true);
    if (!step4Valid) return;

    // Post-Google path: session already exists — write business fields, skip Account.
    if (postGoogleOwnerWizard) {
      if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
      setLoading(true);
      const storedPhone = normalizeIndianPhoneForMetadata(phone);
      const pending = await setPendingOAuthMetadata({
        fullName: fullName.trim() || undefined,
        phone: storedPhone && extractIndianMobileTenDigits(phone) ? storedPhone : undefined,
        companyName: orgName.trim(),
        role: 'user',
        operatingModel,
        addressLine: streetAddress.trim(),
        locality: locality.trim() || undefined,
        pincode: pincode.replace(/\D/g, ''),
        city: selectedLocation?.city,
        state: selectedLocation?.state,
        zone: selectedLocation?.zone,
        officeLatitude: officeLatitude ?? undefined,
        officeLongitude: officeLongitude ?? undefined,
        businessType: businessType ?? undefined,
        employeeCount: employeeCount ?? undefined,
        fleetSizeBand: fleetSize ?? undefined,
        monthlyVolumeBand: monthlyVolume ?? undefined,
        onboardingType: 'owner',
      });
      if (pending.error) {
        setLoading(false);
        return Alert.alert('Error', pending.error.message);
      }
      const applied = await applyPendingOAuthMetadata();
      setLoading(false);
      if (applied.status === 'identity_mismatch') {
        return Alert.alert(
          'Signed in to a different account',
          oauthIdentityMismatchMessage(applied.formName, applied.accountEmail),
        );
      }
      if (applied.status === 'partial_failure') {
        return Alert.alert("You're signed in", OAUTH_METADATA_PARTIAL_FAILURE_MESSAGE);
      }
      clearOwnerBusinessProfileRequired();
      setPostGoogleOwnerWizard(false);
      await enterPostAuthBranding();
      return;
    }

    goToPage(5);
  };

  const clearOfficePlace = () => {
    setOfficePlaceLabel('');
    setOfficeLatitude(null);
    setOfficeLongitude(null);
    setPincode('');
    setSelectedLocation(null);
  };

  const applyOfficePlaceFromMap = async (
    displayName: string,
    lat: number | null | undefined,
    lon: number | null | undefined,
    hints?: { pincode?: string | null; city?: string | null; state?: string | null },
  ) => {
    setOfficePlaceLabel(displayName);
    setPincode('');

    const placeCoords = coordsOrUnset({ lat, lon });
    if (placeCoords.lat == null || placeCoords.lon == null) {
      setOfficeLatitude(null);
      setOfficeLongitude(null);
      const fromName = parsePlaceDisplayName(displayName);
      const matched = matchIndiaLocation(fromName.city, fromName.state);
      if (matched) setSelectedLocation(matched);
      const resolvedPin = await resolveIndiaPincode({
        lat: 0,
        lon: 0,
        displayName,
        hintPincode: hints?.pincode,
        city: hints?.city || fromName.city,
        state: hints?.state || fromName.state,
      });
      setPincode(resolvedPin ?? '');
      return;
    }

    setOfficeLatitude(placeCoords.lat);
    setOfficeLongitude(placeCoords.lon);
    setOfficePlaceResolving(true);

    try {
      const fromName = parsePlaceDisplayName(displayName);
      const geo = await reverseGeocodePlaceInIndia(placeCoords.lat, placeCoords.lon);
      const city = geo.city || hints?.city || fromName.city || null;
      const state = geo.state || hints?.state || fromName.state || null;
      const resolvedPin = await resolveIndiaPincode({
        lat: placeCoords.lat,
        lon: placeCoords.lon,
        displayName,
        hintPincode: hints?.pincode,
        city,
        state,
        reverseGeo: geo,
      });

      setPincode(resolvedPin ?? '');

      const matched = matchIndiaLocation(city, state);
      if (matched) setSelectedLocation(matched);
    } finally {
      setOfficePlaceResolving(false);
    }
  };

  /**
   * Validate org name before submit only when cache is stale (> 10s old would
   * require a timestamp — here we trust the debounced result is fresh enough
   * since orgCheck is reset on every orgName change). Skip the extra round-trip.
   */
  const guardOrgName = async (): Promise<boolean> => {
    const trimmed = orgName.trim();
    if (orgCheck && !orgCheck.loading) {
      if (orgCheck.taken) {
        setAccountOrgConflictMessage(ACCOUNT_ORG_CONFLICT_MESSAGE);
        return false;
      }
      return true;
    }
    const dup = await checkOrganizationNameTaken(trimmed);
    if (dup.error) {
      Alert.alert('Error', dup.error.message);
      return false;
    }
    if (dup.taken) {
      setOrgCheck({ loading: false, taken: true });
      setAccountOrgConflictMessage(ACCOUNT_ORG_CONFLICT_MESSAGE);
      return false;
    }
    return true;
  };

  /**
   * Enters the post-auth branding flow (workspace logo / profile photo / success) —
   * the single transition an authenticated "owner" business signup uses regardless of
   * whether authentication came from email/password or Google, so the two paths can't
   * drift apart on navigation the way they did before PR-012B. Safe to call more than
   * once: setBusinessSignupBrandingActive/goToPage are idempotent, and — like the
   * step 6/7 resolution effect above — a null resolveProvisionedOrgId() result never
   * overwrites an already-resolved id.
   */
  const enterPostAuthBranding = async () => {
    // Set before resolving the org so the index boot guard can't route the user
    // away from logo/photo while org resolution is still in flight.
    setBusinessSignupBrandingActive(true);
    goToPage(6);

    await ensureAuthSession();
    const orgId = await resolveProvisionedOrgId();
    if (orgId) setProvisionedOrgId(orgId);
  };

  /**
   * Signup's email domain matched an existing org — the handle_new_user
   * trigger already filed the pending join request server-side and skipped
   * org creation for this user. Routes straight to the "request sent" step,
   * skipping workspace-logo/profile-photo (there is no org to brand yet).
   */
  const enterDomainJoinRequestFlow = async (
    match: { organizationId: string; organizationName: string },
  ) => {
    await ensureAuthSession();
    setDomainJoinOrgName(match.organizationName);
    goToPage(9);
  };

  const createAccount = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to create an account.');
    setStep5Attempted(true);
    const { fullName: fn, email: em, password: pw, confirmPassword: cp } = step5Errors;
    if (fn || em || pw || cp) return;

    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    if (!storedPhone || !extractIndianMobileTenDigits(phone)) {
      return Alert.alert('Invalid', 'Enter a valid phone number.');
    }

    setLoading(true);
    // No workspace is created when the email's domain already matched an org
    // (signUp() routes to a join request instead), so a company-name
    // collision here is moot — only guard it for the real owner-signup path.
    if (!emailDomainMatch) {
      const ok = await guardOrgName();
      if (!ok) { setLoading(false); return; }
    }

    const result = await signUp({
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      role: 'user',
      phone: storedPhone,
      operatingModel,
      onboardingType: 'owner',
      companyName: orgName.trim(),
      addressLine: streetAddress.trim(),
      locality: locality.trim() || undefined,
      pincode: pincode.replace(/\D/g, ''),
      city: selectedLocation?.city,
      state: selectedLocation?.state,
      zone: selectedLocation?.zone,
      officeLatitude: officeLatitude ?? undefined,
      officeLongitude: officeLongitude ?? undefined,
      businessType: businessType ?? undefined,
      employeeCount: employeeCount ?? undefined,
      fleetSizeBand: fleetSize ?? undefined,
      monthlyVolumeBand: monthlyVolume ?? undefined,
    });
    setLoading(false);
    if (result.error) return Alert.alert('Error', result.error.message);
    if (result.emailVerificationRequired) setEmailVerificationRequired(true);

    if (result.domainOrgMatch) {
      setLoading(true);
      await enterDomainJoinRequestFlow(result.domainOrgMatch);
      setLoading(false);
      return;
    }

    setLoading(true);
    await enterPostAuthBranding();
    setLoading(false);
  };

  const continueWithGoogle = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    const trimmedName = fullName.trim();
    if (trimmedName) {
      const nameErr = validateFullName(true)(trimmedName);
      if (nameErr) return Alert.alert('Invalid', nameErr);
    }
    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    if (!storedPhone || !extractIndianMobileTenDigits(phone)) {
      return Alert.alert('Invalid', 'Enter a valid phone number.');
    }

    setGoogleLoading(true);
    const ok = await guardOrgName();
    if (!ok) { setGoogleLoading(false); return; }

    const pending = await setPendingOAuthMetadata({
      fullName: trimmedName || undefined,
      phone: storedPhone,
      companyName: orgName.trim(),
      role: 'user',
      operatingModel,
      addressLine: streetAddress.trim(),
      locality: locality.trim() || undefined,
      pincode: pincode.replace(/\D/g, ''),
      city: selectedLocation?.city,
      state: selectedLocation?.state,
      zone: selectedLocation?.zone,
      officeLatitude: officeLatitude ?? undefined,
      officeLongitude: officeLongitude ?? undefined,
      businessType: businessType ?? undefined,
      employeeCount: employeeCount ?? undefined,
      fleetSizeBand: fleetSize ?? undefined,
      monthlyVolumeBand: monthlyVolume ?? undefined,
      onboardingType: 'owner',
    });
    if (pending.error) { setGoogleLoading(false); return Alert.alert('Error', pending.error.message); }

    const { error, metadataStatus, metadataMessage } = await signInWithGoogle(true);
    setGoogleLoading(false);
    if (error) return Alert.alert('Error', error.message);
    if (metadataStatus === 'identity_mismatch') {
      return Alert.alert('Signed in to a different account', metadataMessage ?? '');
    }
    if (metadataStatus === 'partial_failure') {
      Alert.alert("You're signed in", OAUTH_METADATA_PARTIAL_FAILURE_MESSAGE);
    }

    // The signup trigger runs during exchangeCodeForSession, before this code —
    // check whether it found a domain match and filed a join request instead
    // of creating an org, same outcome as the email/password path.
    const { request: domainJoinRequest } = await getMyPendingDomainJoinRequest();
    if (domainJoinRequest) {
      setDomainJoinOrgName(domainJoinRequest.organizationName);
      goToPage(9);
      return;
    }

    // Follow the same post-auth progression as the email/password path (createAccount)
    // instead of leaving the user on this screen with no way forward.
    await enterPostAuthBranding();
  };

  const continueWithGoogleFromWelcome = async () => {
    if (!isOnline) return Alert.alert('No internet', 'Connect to continue.');
    setGoogleLoading(true);
    const storedPhone = normalizeIndianPhoneForMetadata(phone);
    const tenDigits = extractIndianMobileTenDigits(phone);
    const pending = await setPendingOAuthMetadata({
      role: 'user',
      operatingModel: 'HYBRID',
      onboardingType: 'owner',
      ...(storedPhone && tenDigits ? { phone: storedPhone } : {}),
    });
    if (pending.error) { setGoogleLoading(false); return Alert.alert('Error', pending.error.message); }
    const { error, metadataStatus, metadataMessage } = await signInWithGoogle(true);
    setGoogleLoading(false);
    if (error) return Alert.alert('Error', error.message);
    if (metadataStatus === 'identity_mismatch') {
      return Alert.alert('Signed in to a different account', metadataMessage ?? '');
    }
    if (metadataStatus === 'partial_failure') {
      Alert.alert("You're signed in", OAUTH_METADATA_PARTIAL_FAILURE_MESSAGE);
    }

    // Same as continueWithGoogle: the trigger already ran during sign-in — if
    // it found a domain match, org creation was skipped and a join request
    // was filed. No point collecting Org/Profile/City for an org that won't
    // be created.
    const { request: domainJoinRequest } = await getMyPendingDomainJoinRequest();
    if (domainJoinRequest) {
      setDomainJoinOrgName(domainJoinRequest.organizationName);
      goToPage(9);
      return;
    }

    // Keep the user on signup to collect Org → Profile → City (do not dump into workspace).
    setOwnerBusinessProfileRequired(true);
    setPostGoogleOwnerWizard(true);
    setIntroDismissed(true);
    goToPage(2);
  };

  const resendVerification = async () => {
    const { error: resendErr } = await resendVerificationEmail(email.trim());
    if (resendErr) { Alert.alert('Error', resendErr.message); return; }
    resendEmailCountdown.start(EMAIL_RESEND_SECS, setResendingSecs);
  };

  const uploadOrgLogo = async () => {
    setLogoUploading(true);
    try {
      const hasSession = await ensureAuthSession();
      if (!hasSession) {
        Alert.alert(
          'Sign in required',
          'Confirm your email or sign in to upload a logo. You can skip and add one later in settings.',
        );
        return;
      }

      let orgId = provisionedOrgId;
      if (!orgId) {
        orgId = await resolveProvisionedOrgId();
        if (orgId) setProvisionedOrgId(orgId);
      }
      if (!orgId) {
        Alert.alert(
          'Workspace provisioning',
          'Your workspace is still being created. Skip for now and upload a logo from workspace settings.',
        );
        return;
      }

      const result = await pickAndUploadOrgLogo(orgId);
      if (result.error) {
        Alert.alert('Upload failed', result.error.message);
        return;
      }
      if (!result.path) return;
      const { error } = await updateOrganizationLogo(orgId, result.path);
      if (error) {
        Alert.alert('Save failed', error.message);
        return;
      }
      setPendingLogoPath(result.path);
      if (result.previewUri) setLogoPreviewUri(result.previewUri);
    } finally {
      setLogoUploading(false);
    }
  };

  const continueFromLogo = () => goToPage(7);
  const skipOrgLogo = () => goToPage(7);

  const selectProfileAvatarSeed = (seed: string) => {
    setProfileAvatarSeed(seed);
    setProfileAvatarPath(null);
    setProfilePreviewUri(null);
  };

  const uploadProfilePhoto = async () => {
    setProfileUploading(true);
    try {
      const hasSession = await ensureAuthSession();
      if (!hasSession) {
        Alert.alert(
          'Sign in required',
          'Confirm your email to upload a photo, or pick a preset and continue.',
        );
        return;
      }

      const { data: { user } } = await supabase().auth.getUser();
      if (!user?.id) return;

      const result = await pickAndUploadAvatar(user.id);
      if (result.error) {
        Alert.alert('Upload failed', result.error.message);
        return;
      }
      if (!result.path) return;
      setProfileAvatarPath(result.path);
      setProfileAvatarSeed('');
      if (result.previewUri) setProfilePreviewUri(result.previewUri);
    } finally {
      setProfileUploading(false);
    }
  };

  const persistProfilePhoto = async (): Promise<boolean> => {
    setProfileSaving(true);
    try {
      const { data: { session } } = await supabase().auth.getSession();
      if (!session?.user?.id) {
        // Email verification pending — queue the choice instead of discarding it
        // silently; it's applied automatically once a session exists (see effect below).
        if (profileAvatarSeed) {
          await setPendingPersonalization({
            kind: 'profile_photo',
            avatarSeed: profileAvatarSeed,
            retried: false,
          });
        }
        return true;
      }

      const userId = session.user.id;

      if (profilePreviewUri) {
        const uploaded = await uploadAvatarFromLocal(
          userId,
          profilePreviewUri,
          profileLocalBase64,
        );
        if (uploaded.error) {
          Alert.alert('Photo upload failed', uploaded.error.message);
          return false;
        }
        if (uploaded.path) {
          const { error } = await updateProfile({
            avatar_url: uploaded.path,
            avatar_seed: null,
          });
          if (error) {
            Alert.alert('Save failed', error.message);
            return false;
          }
          if (uploaded.previewUri) setProfilePreviewUri(uploaded.previewUri);
          setProfileAvatarPath(uploaded.path);
        }
      } else if (profileAvatarSeed) {
        const { error } = await updateProfile({
          avatar_url: null,
          avatar_seed: profileAvatarSeed,
        });
        if (error) {
          Alert.alert('Save failed', error.message);
          return false;
        }
      }
      await refreshSession();
      return true;
    } finally {
      setProfileSaving(false);
    }
  };

  const finishProfilePhotoStep = () => {
    // Invite track: the org already exists (they joined it, not created it) —
    // SuccessStep's "workspace created" messaging doesn't apply. Go straight in.
    // Must clear the branding-active flag first: app/index.tsx's boot redirect
    // holds off entirely while it's set (isBusinessSignupBrandingActiveSync),
    // so leaving it on would strand this user on a reload right after landing.
    if (signupTrack === 'invite') {
      clearBusinessSignupBranding();
      router.replace(ROUTES.TABS.TRIPS as Parameters<typeof router.replace>[0]);
      return;
    }
    goToPage(8);
  };

  const continueFromProfilePhoto = async () => {
    const ok = await persistProfilePhoto();
    if (ok) finishProfilePhotoStep();
  };

  const skipProfilePhoto = async () => {
    const ok = await persistProfilePhoto();
    if (ok) finishProfilePhotoStep();
  };


  const showIntro = !introDismissed && signupTrack === 'owner' && step === 0;

  return {
    // layout
    isDesktop,
    useMobileLayout,
    pageWidth,
    scrollRef,
    accountScrollRef,
    locationScrollRef,
    isOnline,

    postGoogleOwnerWizard,
    // step
    step,
    showIntro,
    dismissIntro: () => setIntroDismissed(true),
    goToPage,
    handleBack,
    entryIntent,
    isTeamInviteEntry,
    onboardingContext,

    // step 0
    phone,
    setPhone,
    phoneInlineError,
    phoneValid,
    phoneExistsCheck,

    // step 1
    otp,
    setOtp,
    otpResendSecs,
    startOtpCountdown,

    // step 2
    orgName,
    setOrgName,
    orgCheck,
    orgTakenError,
    step2Attempted,

    // step 3
    businessType,
    setBusinessType,
    employeeCount,
    setEmployeeCount,
    operatingModel,
    setOperatingModel,
    fleetSize,
    setFleetSize,
    monthlyVolume,
    setMonthlyVolume,
    step3Attempted,
    step3Errors,

    // step 4 (location)
    streetAddress,
    setStreetAddress,
    officePlaceLabel,
    setOfficePlaceLabel,
    officeLatitude,
    officeLongitude,
    officePlaceResolving,
    setOfficeCoordinates: (lat: number | null, lon: number | null) => {
      setOfficeLatitude(lat);
      setOfficeLongitude(lon);
    },
    clearOfficePlace,
    applyOfficePlaceFromMap,
    locality,
    setLocality,
    pincode,
    setPincode,
    selectedLocation,
    setSelectedLocation,
    step4Attempted,
    step4Errors,
    step4Valid,

    // step 5 (account)
    fullName,
    setFullName,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    showPassword,
    toggleShowPassword,
    showConfirmPassword,
    toggleShowConfirmPassword,
    loading,
    googleLoading,
    emailDomainMatch,
    step5Attempted,
    step5Errors,
    accountOrgConflictMessage,
    passwordStrength,
    confirmMismatch,

    // step 6 — logo
    provisionedOrgId,
    logoPreviewUri,
    logoUploading,
    pendingLogoPath,

    // step 7 — profile photo
    profileAvatarSeed,
    profilePreviewUri,
    profileAvatarPath,
    profileUploading,
    profileSaving,

    // step 8 — success
    emailVerificationRequired,
    resendingSecs,

    // actions
    continuePhone,
    verifyOtp,
    continueOrgCheck,
    continueCompanyDetails,
    continueCompanyLocation,
    createAccount,
    continueWithGoogle,
    continueWithGoogleFromWelcome,
    resendVerification,
    uploadOrgLogo,
    continueFromLogo,
    skipOrgLogo,
    selectProfileAvatarSeed,
    uploadProfilePhoto,
    continueFromProfilePhoto,
    skipProfilePhoto,
    finishBusinessSignup: () => {
      clearBusinessSignupBranding();
      clearOwnerBusinessProfileRequired();
    },
    domainJoinOrgName,

    // invitation resolver
    signupTrack,
    invitePhase,
    resolvedInvites,
    selectedInviteId,
    selectedInvite,
    inviteAccountAttempted,
    inviteEmailMasked,
    selectInvite,
    continueInvitePicker,
    startOwnerOnboarding,
    requestNewInvitation,
    acceptTeamInvitation,
    signInToAcceptInvitation,
    useAlternateEmailForInvite,
    formatInviteAge,
  };
}

export type SignUpFlow = ReturnType<typeof useBusinessSignUpFlow>;
