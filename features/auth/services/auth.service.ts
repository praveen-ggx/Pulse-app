/**
 * Auth service — Supabase Auth only (mobile).
 * Single bounded context: auth (sign-in, sign-up, session, role).
 * One service per domain (microservices). Same DB as pulse-unified-base.
 * Service-layer validation: single pass over inputs before Supabase calls.
 */
import { validateEmail } from "@/lib/emailValidation";
import { PHONE_LOOKUP_TIMEOUT_MS } from "@/features/auth/signup/signUpConstants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OnboardingType } from '@/lib/onboarding/onboardingTypes';
import { createsOrganization, onboardingTypeToMetadata } from '@/lib/onboarding/onboardingTypes';
import { registrationTypeFromBusinessType } from '@/features/organization/utils/kycVerification.util';
import { syncLinkedDriverRowsForCurrentUser } from "@/features/drivers/services/drivers.service";
import {
  extractIndianMobileTenDigits,
  normalizeIndianPhoneForMetadata,
  validatePhone,
} from "@/lib/phoneValidation";
import { supabase } from "@/lib/supabase";
import { isServiceUnavailableError } from "@/lib/supabaseHttp.util";
import {
    VALIDATION,
    containsNullByte,
    maxLength,
    validateFullName,
    validatePassword,
    validatePasswordForSignIn,
} from "@/lib/validation";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Platform } from "react-native";

export type UserRole = "user" | "driver";

/** Business model: asset-based, aggregate (non-asset), or both (hybrid). Matches organizations.operating_model. */
export type OperatingModel = "ASSET_BASED" | "NON_ASSET" | "HYBRID";

export interface AuthUser {
  uid: string;
  email: string;
  displayName?: string;
}

export interface AuthProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  aggregated: boolean;
  asset: boolean;
  full_name?: string;
  avatar_url?: string;
  /** Custom avatar seed for presets (e.g. pilot-1). Stored in DB so it persists across devices. */
  avatar_seed?: string;
  phone?: string;
  company_name?: string;
  /** Profile quote/status (WhatsApp-style), shown under name on profile. */
  status_text?: string;
  memberships?: Record<string, unknown>;
}

const AUTH_EVENT_DEBOUNCE_MS = 800;
const REFRESH_DEBOUNCE_MS = 1000;
let refreshSessionInFlight: Promise<{ user: AuthUser; profile: AuthProfile } | null> | null = null;
let lastRefreshSessionAt = 0;
let lastRefreshSessionResult: { user: AuthUser; profile: AuthProfile } | null = null;

function mapSupabaseUserToAuth(user: SupabaseUser): {
  user: AuthUser;
  profile: AuthProfile;
} {
  const uid = user.id;
  const email = user.email ?? "";
  const meta = user.user_metadata ?? {};
  const fullName = meta.full_name ?? meta.name ?? email.split("@")[0] ?? "User";
  const role = (meta.role === "driver" ? "driver" : "user") as UserRole;
  const isDriver = role === "driver";
  const opModel = meta.operating_model as string | undefined;
  const aggregated = isDriver
    ? false
    : opModel === "NON_ASSET"
      ? true
      : opModel === "ASSET_BASED"
        ? false
        : meta.aggregated !== false && meta.aggregated !== "false";
  const asset = isDriver
    ? false
    : opModel === "ASSET_BASED"
      ? true
      : opModel === "NON_ASSET"
        ? false
        : meta.asset !== false && meta.asset !== "false";

  return {
    user: { uid, email, displayName: fullName },
    profile: {
      uid,
      email,
      displayName: fullName,
      full_name: fullName,
      role,
      aggregated,
      asset,
      company_name: meta.company_name,
      phone: meta.phone,
      avatar_url: meta.avatar_url,
      avatar_seed: meta.avatar_seed,
      status_text: meta.status_text,
      memberships: {},
    },
  };
}

/** Map public.profiles row to AuthProfile. */
function mapDbProfileToAuth(profile: Record<string, unknown>): AuthProfile {
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
  return {
    uid: str(profile.id) ?? '',
    email: str(profile.email) ?? '',
    displayName: str(profile.full_name) || str(profile.email)?.split('@')[0] || 'User',
    full_name: str(profile.full_name),
    role: (profile.role === 'driver' ? 'driver' : 'user') as UserRole,
    aggregated: bool(profile.aggregated, true),
    asset: bool(profile.asset, true),
    company_name: str(profile.company_name),
    phone: str(profile.phone),
    avatar_url: str(profile.avatar_url),
    avatar_seed: str(profile.avatar_seed),
    status_text: str(profile.bio), // profiles table uses 'bio' for status_text
    memberships: {},
  };
}

export interface SignInResult {
  error: Error | null;
  /** True when Supabase email confirmation is enabled and the user must click the verification link. */
  emailVerificationRequired?: boolean;
  /**
   * Set when sign-in itself succeeded but onboarding metadata (business profile
   * details captured before the OAuth session existed) failed to fully save.
   * Callers should branch on this status — not on the presence of a message —
   * and use OAUTH_METADATA_PARTIAL_FAILURE_MESSAGE (or their own copy) to inform the user.
   */
  metadataStatus?: 'partial_failure' | 'identity_mismatch';
  /** Set with `identity_mismatch`: user-facing copy explaining nothing was written. */
  metadataMessage?: string;
  /**
   * Set when the signup email's company domain already has an org. Org creation
   * was skipped (onboarding_type forced to 'member') — caller must call
   * createOrgDomainJoinRequest(domainOrgMatch.organizationId) to file the
   * pending join request the existing org's owner/admin approves.
   */
  domainOrgMatch?: { organizationId: string; organizationName: string };
}

export interface OrgForEmailDomainMatch {
  organizationId: string;
  organizationName: string;
  emailDomain: string;
}

/** Does this email's company domain already have an org? Free/public domains (gmail.com etc.) never match. */
export async function checkOrgForEmailDomain(
  email: string,
): Promise<{ error: Error | null; match: OrgForEmailDomainMatch | null }> {
  const trimmed = (email ?? '').trim();
  if (!trimmed || !trimmed.includes('@')) return { error: null, match: null };
  try {
    const { data, error } = await supabase().rpc('check_org_for_email_domain', {
      p_email: trimmed,
    });
    if (error) return { error: new Error(error.message), match: null };
    const row = (data ?? null) as Record<string, unknown> | null;
    if (!row || row.org_found !== true) return { error: null, match: null };
    return {
      error: null,
      match: {
        organizationId: String(row.organization_id ?? ''),
        organizationName: String(row.organization_name ?? 'Organization'),
        emailDomain: String(row.email_domain ?? ''),
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), match: null };
  }
}

/** File the pending join request after a domain-matched signup. Requires an authenticated session. */
export async function createOrgDomainJoinRequest(
  organizationId: string,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().rpc('create_org_domain_join_request', {
      p_organization_id: organizationId,
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Checks whether handle_new_user already filed a domain join request for the
 * signed-in user (org creation was skipped server-side). Google OAuth signup
 * runs the trigger during exchangeCodeForSession — before any client code —
 * so this is how the client discovers the domain-match outcome after the fact.
 */
export async function getMyPendingDomainJoinRequest(): Promise<{
  error: Error | null;
  request: { organizationId: string; organizationName: string } | null;
}> {
  try {
    const { data, error } = await supabase()
      .rpc('get_my_pending_domain_join_request')
      .maybeSingle();
    if (error) return { error: new Error(error.message), request: null };
    if (!data) return { error: null, request: null };
    const row = data as Record<string, unknown>;
    return {
      error: null,
      request: {
        organizationId: String(row.organization_id ?? ''),
        organizationName: String(row.organization_name ?? 'Organization'),
      },
    };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)), request: null };
  }
}

export interface SignUpOptions {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  companyName?: string;
  role?: UserRole;
  operatingModel?: OperatingModel;
  addressLine?: string;
  locality?: string;
  pincode?: string;
  city?: string;
  state?: string;
  zone?: string;
  /** Office HQ from places search (create-trip LocationSearchField). */
  officeLatitude?: number;
  officeLongitude?: number;
  /** Legal structure of the business: Individual, Sole Proprietor, Partnership, Pvt Ltd, LLP, OPC, or Other. */
  businessType?: string;
  /** Number of employees band, e.g. "1-10", "11-50", "51-200", "201-500", "500+". */
  employeeCount?: string;
  /** Own-fleet size band from signup (stored in auth metadata; org column TBD). */
  fleetSizeBand?: string;
  /** Monthly shipment volume band for broker / hybrid (auth metadata). */
  monthlyVolumeBand?: string;
  /**
   * What the user is becoming during onboarding (stored as onboarding_type in auth metadata).
   * `owner` provisions org + membership; `member` and other types join existing orgs later.
   * @deprecated Use onboardingType. Kept for backward compatibility with older clients.
   */
  skipOrgCreation?: boolean;
  onboardingType?: OnboardingType;
}

export interface PendingOAuthOnboardingMetadata {
  fullName?: string;
  phone?: string;
  companyName?: string;
  role?: UserRole;
  operatingModel?: OperatingModel;
  addressLine?: string;
  locality?: string;
  pincode?: string;
  city?: string;
  state?: string;
  zone?: string;
  officeLatitude?: number;
  officeLongitude?: number;
  businessType?: string;
  employeeCount?: string;
  fleetSizeBand?: string;
  monthlyVolumeBand?: string;
  /** @deprecated Use onboardingType */
  skipOrgCreation?: boolean;
  onboardingType?: OnboardingType;
}

const PENDING_OAUTH_METADATA_KEY = "@pulse_pending_oauth_metadata_v1";

export async function signUp({
  email,
  password,
  fullName,
  phone,
  companyName,
  role = "user",
  operatingModel: operatingModelOption,
  addressLine,
  locality,
  pincode,
  city,
  state,
  zone,
  officeLatitude,
  officeLongitude,
  businessType,
  employeeCount,
  fleetSizeBand,
  monthlyVolumeBand,
  skipOrgCreation,
  onboardingType: onboardingTypeOption,
}: SignUpOptions): Promise<SignInResult> {
  const emailErr = validateEmail(email ?? "");
  if (emailErr) return { error: new Error(emailErr) };
  const pwdErr = validatePassword(password);
  if (pwdErr) return { error: new Error(pwdErr) };
  if (fullName?.trim()) {
    const nameErr = validateFullName(false)(fullName);
    if (nameErr) return { error: new Error(nameErr) };
  }
  if (phone != null && String(phone).trim()) {
    const phoneErr = validatePhone(phone);
    if (phoneErr) return { error: new Error(phoneErr) };
  }
  const wantsOwnerOnboarding =
    (onboardingTypeOption ?? (skipOrgCreation ? 'member' : 'owner')) === 'owner';

  let domainOrgMatch: OrgForEmailDomainMatch | null = null;
  if (wantsOwnerOnboarding) {
    const domainCheck = await checkOrgForEmailDomain(email);
    if (domainCheck.error) return { error: domainCheck.error };
    domainOrgMatch = domainCheck.match;
  }

  if (companyName != null && String(companyName).trim()) {
    const c = companyName.trim();
    const companyErr = maxLength(
      VALIDATION.COMPANY_NAME_MAX_LENGTH,
      `Company name must be at most ${VALIDATION.COMPANY_NAME_MAX_LENGTH} characters.`,
    )(c);
    if (companyErr) return { error: new Error(companyErr) };
    // Skip the name-uniqueness check when the email's company domain already
    // matched an org — that match takes precedence and routes to a join
    // request instead of org creation, so a name collision here is moot.
    if (!domainOrgMatch) {
      const dup = await checkOrganizationNameTaken(c);
      if (dup.error) return { error: dup.error };
      if (dup.taken) {
        return { error: new Error("Company name already exists.") };
      }
    }
  }
  try {
    const operatingModel: OperatingModel = operatingModelOption ?? "HYBRID";
    const metadata: Record<string, unknown> = {
      role,
      operating_model: operatingModel,
    };
    if (fullName?.trim()) metadata.full_name = fullName.trim();
    if (companyName != null && companyName.trim())
      metadata.company_name = companyName.trim();
    if (addressLine?.trim()) metadata.address_line = addressLine.trim();
    if (locality?.trim()) metadata.locality = locality.trim();
    if (pincode?.trim()) {
      const digits = pincode.replace(/\D/g, '');
      if (digits) metadata.pincode = digits;
    }
    if (city?.trim()) metadata.city = city.trim();
    if (state?.trim()) metadata.state = state.trim();
    if (zone?.trim()) metadata.zone = zone.trim();
    if (officeLatitude != null && Number.isFinite(officeLatitude)) {
      metadata.office_latitude = officeLatitude;
    }
    if (officeLongitude != null && Number.isFinite(officeLongitude)) {
      metadata.office_longitude = officeLongitude;
    }
    if (businessType?.trim()) metadata.business_type = businessType.trim();
    if (employeeCount?.trim()) metadata.employee_count = employeeCount.trim();
    if (fleetSizeBand?.trim()) metadata.fleet_size_band = fleetSizeBand.trim();
    if (monthlyVolumeBand?.trim()) metadata.monthly_volume_band = monthlyVolumeBand.trim();

    const onboardingType: OnboardingType = domainOrgMatch
      ? 'member'
      : (onboardingTypeOption ?? (skipOrgCreation ? 'member' : 'owner'));
    Object.assign(metadata, onboardingTypeToMetadata(onboardingType));

    // Canonical E.164-style India (+91…) for profiles.phone and metadata; RPCs normalize to 10 digits for lookup.
    if (phone != null && phone !== "") {
      const e164 = normalizeIndianPhoneForMetadata(phone);
      if (e164) metadata.phone = e164;
    }
    // Auto-assign a random avatar seed for business users so their profile
    // always has a visual identity immediately (drivers pick theirs in signup UI).
    if (role === 'user' && !metadata.avatar_seed) {
      metadata.avatar_seed = `driver-${Math.floor(Math.random() * 10) + 1}`;
    }

    const webBase = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, '');
    const emailRedirectTo = webBase ? `${webBase}/auth/callback` : undefined;

    const { data, error } = await supabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: metadata, ...(emailRedirectTo ? { emailRedirectTo } : {}) },
    });
    if (error) {
      if (error.message.includes("Company name already exists")) {
        return { error: new Error("Company name already exists.") };
      }
      return { error: new Error(error.message || "Sign up failed") };
    }
    if (!data.user) return { error: new Error("No user returned") };

    // Org, organization_members, and (if driver) drivers row are created by DB trigger on auth.users INSERT.
    // email_confirmed_at is null when Supabase email confirmation is enabled.
    const emailVerificationRequired = !data.user.email_confirmed_at;
    return {
      error: null,
      emailVerificationRequired,
      ...(domainOrgMatch
        ? {
            domainOrgMatch: {
              organizationId: domainOrgMatch.organizationId,
              organizationName: domainOrgMatch.organizationName,
            },
          }
        : {}),
    };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
      };
    }
    return { error: e instanceof Error ? e : new Error("Sign up failed") };
  }
}

export async function resendVerificationEmail(email: string): Promise<{ error: Error | null }> {
  const { error } = await supabase().auth.resend({ type: 'signup', email });
  return { error: error ? new Error(error.message) : null };
}

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message === "Network request failed")
    return true;
  if (e instanceof Error && /network|fetch|failed/i.test(e.message))
    return true;
  return false;
}

/** Safe user-facing copy; never forward raw DB/server messages from GoTrue. */
function mapSignInErrorMessage(raw: string): string {
  const m = (raw ?? "").toLowerCase();
  if (
    m.includes("invalid login") ||
    m.includes("invalid email or password") ||
    m.includes("invalid credentials") ||
    m.includes("wrong password") ||
    m.includes("email not found")
  ) {
    return "Incorrect email or password.";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "Confirm your email before signing in. Check your inbox.";
  }
  if (
    m.includes("too many") ||
    m.includes("rate limit") ||
    m.includes("over_email") ||
    m.includes("over_request") ||
    m.includes("too_many_requests")
  ) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  if (m.includes("user_banned") || m.includes("banned")) {
    return "This account cannot sign in. Contact support.";
  }
  if (m.includes("network") || m.includes("fetch failed") || m.includes("econnrefused")) {
    return "Cannot reach server. Check your internet connection.";
  }
  if (
    m.includes("database") ||
    m.includes("sql") ||
    m.includes("internal server") ||
    m.includes("syntax error") ||
    m.includes("relation ") ||
    m.includes("column ")
  ) {
    return "Sign in failed. Try again or contact support.";
  }
  return "Sign in failed. Please try again.";
}

/** DB RPC: link roster drivers.user_id by profile email/phone (migration 20260510123000).
 * Goes through syncLinkedDriverRowsForCurrentUser so sign-in + driver-home share dedupe.
 */
async function trySyncMyDriverRowsUserId(): Promise<void> {
  try {
    const { error } = await syncLinkedDriverRowsForCurrentUser();
    if (error && __DEV__) {
      console.warn("[auth] sync_my_driver_rows_user_id:", error.message);
    }
  } catch (e) {
    if (__DEV__) console.warn("[auth] sync_my_driver_rows_user_id failed", e);
  }
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignInResult> {
  const trimmedEmail = (email ?? "").trim();
  if (trimmedEmail.length === 0) {
    return { error: new Error("Enter your email address.") };
  }
  if (containsNullByte(trimmedEmail) || containsNullByte(password)) {
    return { error: new Error("Input contains invalid characters.") };
  }
  const emailErr = validateEmail(trimmedEmail);
  if (emailErr) return { error: new Error(emailErr) };
  const pwdErr = validatePasswordForSignIn(password);
  if (pwdErr) return { error: new Error(pwdErr) };
  try {
    const { data, error } = await supabase().auth.signInWithPassword({
      email: trimmedEmail,
      password: password ?? "",
    });
    if (error) {
      return { error: new Error(mapSignInErrorMessage(error.message)) };
    }
    if (!data.user) return { error: new Error("No user returned") };
    void trySyncMyDriverRowsUserId();
    return { error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
      };
    }
    return { error: e instanceof Error ? e : new Error("Sign in failed") };
  }
}

function getGoogleRedirectTo(): string {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  return Linking.createURL("/auth/callback");
}

/**
 * URL Supabase redirects to after the user taps "reset password" in email.
 * Must be listed under Authentication → URL configuration → Redirect URLs in Supabase Dashboard.
 * Native builds without EXPO_PUBLIC_WEB_BASE_URL use the app scheme from `Linking.createURL`.
 */
export function getPasswordRecoveryRedirectTo(): string {
  const webBase = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/auth/reset-password`;
  }
  if (webBase && /^https?:\/\//i.test(webBase)) {
    return `${webBase}/auth/reset-password`;
  }
  return Linking.createURL("/auth/reset-password");
}

/** Sends Supabase password recovery email (does not reveal whether the email is registered). */
export async function requestPasswordResetEmail(email: string): Promise<SignInResult> {
  const trimmedEmail = (email ?? "").trim();
  if (trimmedEmail.length === 0) {
    return { error: new Error("Enter your email address.") };
  }
  if (containsNullByte(trimmedEmail)) {
    return { error: new Error("Input contains invalid characters.") };
  }
  const emailErr = validateEmail(trimmedEmail);
  if (emailErr) return { error: new Error(emailErr) };
  try {
    const { error } = await supabase().auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: getPasswordRecoveryRedirectTo(),
    });
    if (error) {
      return { error: new Error(error.message || "Could not send reset email.") };
    }
    return { error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
      };
    }
    return { error: e instanceof Error ? e : new Error("Could not send reset email.") };
  }
}

/** Call while authenticated with a recovery session (after opening the email link). */
export async function updatePasswordWithCurrentSession(newPassword: string): Promise<SignInResult> {
  if (containsNullByte(newPassword)) {
    return { error: new Error("Password contains invalid characters.") };
  }
  const trimmed = newPassword.trim();
  const pwdErr = validatePassword(trimmed);
  if (pwdErr) return { error: new Error(pwdErr) };
  try {
    const { error } = await supabase().auth.updateUser({ password: trimmed });
    if (error) {
      return { error: new Error(error.message || "Could not update password.") };
    }
    return { error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
      };
    }
    return { error: e instanceof Error ? e : new Error("Could not update password.") };
  }
}

/**
 * OAuth must run in a top-level browsing context. Embedded previews (e.g. IDE
 * simple browser) load the app in a sandboxed iframe where Supabase/Google pages
 * cannot execute scripts.
 */
function startWebOAuthRedirect(url: string): void {
  if (typeof window === "undefined") return;

  if (window.self !== window.top) {
    try {
      window.top!.location.href = url;
      return;
    } catch {
      // Cross-origin parent — fall through to popup.
    }
    const popup = window.open(url, "pulse_oauth", "noopener,noreferrer");
    if (popup) return;
  }

  window.location.assign(url);
}

/** Google OAuth sign-in for web and native (Expo). */
export async function signInWithGoogle(): Promise<SignInResult> {
  try {
    const redirectTo = getGoogleRedirectTo();

    if (Platform.OS === "web") {
      const { data, error } = await supabase().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) return { error: new Error(error.message || "Google sign in failed") };
      if (!data?.url) return { error: new Error("Could not start Google sign in.") };
      startWebOAuthRedirect(data.url);
      return { error: null };
    }

    const { data, error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) return { error: new Error(error.message || "Google sign in failed") };
    if (!data?.url) return { error: new Error("Could not start Google sign in.") };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success" || !result.url) {
      return { error: new Error("Google sign in cancelled.") };
    }

    const parsed = Linking.parse(result.url);
    const code = typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : null;
    const oauthError =
      typeof parsed.queryParams?.error_description === "string"
        ? parsed.queryParams.error_description
        : typeof parsed.queryParams?.error === "string"
          ? parsed.queryParams.error
          : null;

    if (oauthError) return { error: new Error(oauthError) };
    if (!code) return { error: new Error("Missing auth code from Google.") };

    const { error: exchangeError } = await supabase().auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return { error: new Error(exchangeError.message || "Google sign in failed") };
    }

    const metadataResult = await applyPendingOAuthMetadata();
    if (metadataResult.status === 'partial_failure') {
      return { error: null, metadataStatus: 'partial_failure' };
    }
    if (metadataResult.status === 'identity_mismatch') {
      return {
        error: null,
        metadataStatus: 'identity_mismatch',
        metadataMessage: oauthIdentityMismatchMessage(
          metadataResult.formName,
          metadataResult.accountEmail,
        ),
      };
    }
    return { error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
      };
    }
    return { error: e instanceof Error ? e : new Error("Google sign in failed") };
  }
}

/**
 * Sends a real Supabase phone OTP (via the project's configured SMS provider).
 * `phone` must be E.164 (e.g. "+919876543210") — callers resolve/validate the
 * number before calling this.
 */
export async function sendDriverPhoneOtp(phone: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase().auth.signInWithOtp({ phone });
    if (error) return { error: new Error(error.message || "Could not send OTP.") };
    return { error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error("Cannot reach server. Check your internet connection and try again."),
      };
    }
    return { error: e instanceof Error ? e : new Error("Could not send OTP.") };
  }
}

/**
 * Verifies a driver's phone OTP and completes sign-in against their REAL, existing
 * account. verifyOtp alone would only prove phone possession — Supabase has no
 * verified phone identity on existing driver accounts yet, so the first successful
 * verification here lands on a brand-new, disconnected auth identity for the phone.
 * The link-driver-phone Edge Function finds the driver's real account (by the same
 * phone, read from THIS now-verified session — never from client input) and, on
 * first use, hands back a magic-link token that completes sign-in against the real
 * account. On every sign-in after the first, Supabase's own phone auth already
 * resolves straight to the real account and no further step is needed.
 */
export async function verifyDriverPhoneOtp(phone: string, token: string): Promise<SignInResult> {
  try {
    const { error: verifyError } = await supabase().auth.verifyOtp({
      phone,
      token,
      type: "sms",
    });
    if (verifyError) {
      return { error: new Error(verifyError.message || "Incorrect or expired code.") };
    }

    const { data: linkData, error: linkError } = await supabase().functions.invoke(
      "link-driver-phone",
      { body: {} },
    );
    if (linkError) {
      return { error: new Error(linkError.message || "Could not complete sign in.") };
    }
    const payload = linkData as
      | { linked?: boolean; alreadyCurrent?: boolean; email?: string; magicLinkToken?: string; error?: string; message?: string }
      | null;

    if (payload?.alreadyCurrent) {
      return { error: null };
    }
    if (payload?.magicLinkToken && payload?.email) {
      const { error: magicLinkError } = await supabase().auth.verifyOtp({
        email: payload.email,
        token: payload.magicLinkToken,
        type: "magiclink",
      });
      if (magicLinkError) {
        return { error: new Error(magicLinkError.message || "Could not complete sign in.") };
      }
      return { error: null };
    }
    return {
      error: new Error(payload?.message || payload?.error || "Could not complete sign in."),
    };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error("Cannot reach server. Check your internet connection and try again."),
      };
    }
    return { error: e instanceof Error ? e : new Error("Could not complete sign in.") };
  }
}

/**
 * TEMPORARY / INSECURE: signs a driver in from a phone number alone, with no real
 * OTP check — Supabase's SMS provider isn't configured yet, so there is currently
 * no way to prove phone possession. Anyone who knows a driver's phone number can
 * sign in as that driver via this path. Replace call sites with
 * sendDriverPhoneOtp/verifyDriverPhoneOtp once the SMS provider is enabled, then
 * delete this function and supabase/functions/driver-phone-signin-unverified/.
 */
export async function signInDriverByPhoneUnverified(phone: string): Promise<SignInResult> {
  const normalized = normalizePhoneToTenDigits(phone);
  if (!normalized) {
    return { error: new Error("Enter a valid 10-digit mobile number.") };
  }

  try {
    const payload = await invokeDriverPhoneSignInEdgeFunction(normalized);
    if ("error" in payload) {
      return { error: payload.error };
    }
    if ("session" in payload) {
      return applyDriverAuthSession(payload.session);
    }
    return completeDriverMagicLinkSignIn(payload.email, payload.magicLinkToken);
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error("Cannot reach server. Check your internet connection and try again."),
      };
    }
    return { error: e instanceof Error ? e : new Error("Could not sign in.") };
  }
}

type DriverPhoneSignInPayload = {
  email?: string;
  magicLinkToken?: string;
  session?: {
    access_token?: string;
    refresh_token?: string;
  };
  error?: string;
  message?: string;
};

type DriverPhoneSignInSuccess =
  | { session: { access_token: string; refresh_token: string } }
  | { email: string; magicLinkToken: string };

async function invokeDriverPhoneSignInEdgeFunction(
  normalizedPhone: string,
): Promise<DriverPhoneSignInSuccess | { error: Error }> {
  const invoke = async (
    functionName: string,
    body: Record<string, string>,
  ): Promise<{ data: DriverPhoneSignInPayload | null; error: Error | null }> => {
    const { data, error } = await supabase().functions.invoke(functionName, { body });
    const payload = (data ?? null) as DriverPhoneSignInPayload | null;
    if (error) {
      // supabase-js often still parses the JSON body on non-2xx — keep it for messaging.
      const fromBody =
        payload?.message?.trim() ||
        payload?.error?.trim() ||
        "";
      if (fromBody) {
        return { data: payload, error: new Error(fromBody) };
      }
      const context = (error as { context?: Response }).context;
      if (context && typeof context.json === "function") {
        try {
          const bodyJson = (await context.json()) as DriverPhoneSignInPayload;
          const msg =
            bodyJson?.message?.trim() ||
            bodyJson?.error?.trim() ||
            error.message ||
            "Could not sign in.";
          return { data: bodyJson, error: new Error(msg) };
        } catch {
          // fall through
        }
      }
      return {
        data: payload,
        error: new Error(error.message || "Could not sign in."),
      };
    }
    return { data: payload, error: null };
  };

  const primary = await invoke("check-user-by-phone", {
    phone: normalizedPhone,
    intent: "driver_signin",
  });
  const primarySession = extractDriverSignInSession(primary.data);
  if (primarySession) {
    return primarySession;
  }
  const primaryMagicEarly = extractDriverSignInMagicLink(primary.data);
  if (primaryMagicEarly) {
    return primaryMagicEarly;
  }

  const legacy = await invoke("driver-phone-signin-unverified", { phone: normalizedPhone });
  const legacyResult = extractDriverSignInPayload(legacy.data);
  if (legacyResult) {
    return legacyResult;
  }

  if (
    primary.error &&
    !isEdgeFunctionUnavailableError(primary.error) &&
    !isRecoverableDriverSignInEdgeError(primary.error)
  ) {
    return { error: primary.error };
  }

  const message =
    legacy.data?.message ||
    legacy.data?.error ||
    primary.data?.message ||
    primary.data?.error ||
    legacy.error?.message ||
    primary.error?.message ||
    "Driver sign-in is unavailable. Please try again shortly.";
  return { error: new Error(message) };
}

function isRecoverableDriverSignInEdgeError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("could not complete sign in") ||
    message.includes("sign-in session could not be created") ||
    message.includes("non-2xx")
  );
}

function extractDriverSignInSession(
  payload: DriverPhoneSignInPayload | null,
): { session: { access_token: string; refresh_token: string } } | null {
  const accessToken = payload?.session?.access_token?.trim();
  const refreshToken = payload?.session?.refresh_token?.trim();
  if (accessToken && refreshToken) {
    return { session: { access_token: accessToken, refresh_token: refreshToken } };
  }
  return null;
}

function extractDriverSignInMagicLink(
  payload: DriverPhoneSignInPayload | null,
): { email: string; magicLinkToken: string } | null {
  const email = payload?.email?.trim();
  const magicLinkToken = payload?.magicLinkToken?.trim();
  if (email && magicLinkToken) {
    return { email, magicLinkToken };
  }
  return null;
}

function extractDriverSignInPayload(
  payload: DriverPhoneSignInPayload | null,
): DriverPhoneSignInSuccess | null {
  const session = extractDriverSignInSession(payload);
  if (session) return session;
  return extractDriverSignInMagicLink(payload);
}

async function applyDriverAuthSession(session: {
  access_token: string;
  refresh_token: string;
}): Promise<SignInResult> {
  try {
    await supabase().auth.signOut({ scope: "local" });
  } catch {
    // Best-effort — stale local session must not block a fresh driver sign-in.
  }

  const { error } = await supabase().auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) {
    return { error: new Error(error.message || "Could not complete sign in.") };
  }
  return { error: null };
}

function isEdgeFunctionUnavailableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("failed to send a request to the edge function") ||
    message.includes("requested function was not found") ||
    message.includes("not_found")
  );
}

async function completeDriverMagicLinkSignIn(
  email: string,
  magicLinkToken: string,
): Promise<SignInResult> {
  try {
    await supabase().auth.signOut({ scope: "local" });
  } catch {
    // Best-effort — stale local session must not block magic-link exchange.
  }

  const verifyAttempts = [
    () =>
      supabase().auth.verifyOtp({
        token_hash: magicLinkToken,
        type: "email",
      }),
    () =>
      supabase().auth.verifyOtp({
        token_hash: magicLinkToken,
        type: "magiclink",
      }),
    () =>
      supabase().auth.verifyOtp({
        email,
        token: magicLinkToken,
        type: "email",
      }),
    () =>
      supabase().auth.verifyOtp({
        email,
        token: magicLinkToken,
        type: "magiclink",
      }),
  ];

  let lastMessage = "Could not complete sign in.";
  for (const attempt of verifyAttempts) {
    const { error } = await attempt();
    if (!error) {
      return { error: null };
    }
    lastMessage = error.message || lastMessage;
  }

  return { error: new Error(lastMessage) };
}

export async function setPendingOAuthMetadata(
  metadata: PendingOAuthOnboardingMetadata,
): Promise<{ error: Error | null }> {
  try {
    await AsyncStorage.setItem(PENDING_OAUTH_METADATA_KEY, JSON.stringify(metadata));
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error("Could not save onboarding details."),
    };
  }
}

export type PendingOAuthMetadataStep = 'auth_metadata' | 'profile' | 'organization';

export type PendingOAuthMetadataResult =
  | { status: 'success' }
  | { status: 'skipped' }
  | { status: 'partial_failure'; failedSteps: PendingOAuthMetadataStep[] }
  /** Form details are someone else's — nothing was written to this account. */
  | { status: 'identity_mismatch'; formName: string; accountEmail: string | null };

export function oauthIdentityMismatchMessage(formName: string, accountEmail: string | null): string {
  const who = accountEmail ?? 'this Google account';
  return (
    `You signed in as ${who}, but the signup form was for "${formName}". ` +
    `We didn't change your account. To register ${formName}, sign out and sign up ` +
    `with their own email or Google account.`
  );
}

/** Pending signup data older than this account is never applied (another person's leftover). */
const PENDING_METADATA_MAX_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

const nameTokens = (value: string): Set<string> =>
  new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  );

/**
 * Does the pending signup form belong to the person who just signed in?
 *
 * Incident 2026-09-02: a staff member filled a transporter's business signup
 * (SHIVSHAKTI TRANSPORT CO) and pressed Continue with Google, which signed in
 * with her own work account — the transporter's name, phone and address were
 * written onto her login, and her pending team invite then attached it to the
 * workspace under the transporter's name. Mismatch when:
 *  - the account is older than a day (stale data left on a shared device), or
 *  - the Google-provided name shares no word with the form's name.
 */
export function pendingOAuthMetadataMatchesUser(
  pending: Pick<PendingOAuthOnboardingMetadata, 'fullName'>,
  user: { created_at?: string | null; user_metadata?: Record<string, unknown> | null },
  now: number = Date.now(),
): boolean {
  const createdAt = user.created_at ? Date.parse(user.created_at) : NaN;
  if (Number.isFinite(createdAt) && now - createdAt > PENDING_METADATA_MAX_ACCOUNT_AGE_MS) {
    return false;
  }
  const formName = pending.fullName?.trim();
  // `name` is set by Google and never overwritten by our metadata writes.
  const providerName =
    typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '';
  if (!formName || !providerName) return true;
  const form = nameTokens(formName);
  const provider = nameTokens(providerName);
  if (form.size === 0 || provider.size === 0) return true;
  for (const t of form) if (provider.has(t)) return true;
  return false;
}

export const OAUTH_METADATA_PARTIAL_FAILURE_MESSAGE =
  "You're signed in, but we couldn't finish saving some of your business information. " +
  'Please review your business profile after entering the workspace.';

/** True when AsyncStorage still holds pending Google onboarding metadata. */
export async function hasPendingOAuthMetadata(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_OAUTH_METADATA_KEY);
    return !!raw;
  } catch {
    return false;
  }
}

/**
 * Applies onboarding metadata (role, business profile details) captured before the
 * OAuth session existed. Auth metadata, profile, and organization writes are each
 * checked independently — callers must not infer success from the absence of a
 * thrown error; inspect the returned status instead.
 *
 * Pending storage is cleared only after every required write succeeds so a retry
 * (callback re-entry or session restore) can finish a partial failure.
 */
export async function applyPendingOAuthMetadata(): Promise<PendingOAuthMetadataResult> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(PENDING_OAUTH_METADATA_KEY);
  } catch {
    raw = null;
  }
  if (!raw) {
    // No pending OAuth work — do not sync driver rows here.
    // Auth restore calls this on every cold boot; boot-time sync belongs in
    // sign-in / driver-home once-per-session paths (incident 2026-09-18).
    return { status: 'skipped' };
  }

  let pending: PendingOAuthOnboardingMetadata | null = null;
  try {
    pending = JSON.parse(raw) as PendingOAuthOnboardingMetadata;
  } catch {
    pending = null;
  }
  if (!pending) {
    // Corrupt payload — drop it so we do not retry forever.
    await AsyncStorage.removeItem(PENDING_OAUTH_METADATA_KEY).catch(() => {});
    return { status: 'skipped' };
  }

  const { data: signedIn } = await supabase().auth.getUser();
  if (signedIn.user && !pendingOAuthMetadataMatchesUser(pending, signedIn.user)) {
    // Never write another person's / business's details onto this login.
    console.warn('[auth] applyPendingOAuthMetadata: pending form does not match the signed-in account; discarded');
    await AsyncStorage.removeItem(PENDING_OAUTH_METADATA_KEY).catch(() => {});
    return {
      status: 'identity_mismatch',
      formName: pending.fullName?.trim() || pending.companyName?.trim() || 'this business',
      accountEmail: signedIn.user.email ?? null,
    };
  }

  const failedSteps: PendingOAuthMetadataStep[] = [];

  const authData: Record<string, unknown> = {};
  const role = pending.role === "driver" ? "driver" : "user";
  authData.role = role;
  authData.operating_model = pending.operatingModel ?? "HYBRID";
  if (pending.fullName?.trim()) authData.full_name = pending.fullName.trim();
  if (pending.companyName?.trim()) authData.company_name = pending.companyName.trim();
  if (pending.addressLine?.trim()) authData.address_line = pending.addressLine.trim();
  if (pending.locality?.trim()) authData.locality = pending.locality.trim();
  if (pending.pincode?.trim()) {
    const digits = pending.pincode.replace(/\D/g, '');
    if (digits) authData.pincode = digits;
  }
  if (pending.city?.trim()) authData.city = pending.city.trim();
  if (pending.state?.trim()) authData.state = pending.state.trim();
  if (pending.zone?.trim()) authData.zone = pending.zone.trim();
  if (pending.officeLatitude != null && Number.isFinite(pending.officeLatitude)) {
    authData.office_latitude = pending.officeLatitude;
  }
  if (pending.officeLongitude != null && Number.isFinite(pending.officeLongitude)) {
    authData.office_longitude = pending.officeLongitude;
  }
  if (pending.businessType?.trim()) authData.business_type = pending.businessType.trim();
  if (pending.employeeCount?.trim()) authData.employee_count = pending.employeeCount.trim();
  if (pending.fleetSizeBand?.trim()) authData.fleet_size_band = pending.fleetSizeBand.trim();
  if (pending.monthlyVolumeBand?.trim()) authData.monthly_volume_band = pending.monthlyVolumeBand.trim();

  const pendingOnboardingType: OnboardingType =
    pending.onboardingType ??
    (pending.skipOrgCreation ? 'member' : 'owner');
  // Explicit so Google INSERT (which defaults onboarding_type in the trigger) and
  // post-session auth.user metadata stay aligned with the wizard intent.
  Object.assign(authData, onboardingTypeToMetadata(pendingOnboardingType));

  if (pending.phone != null && pending.phone !== "") {
    const e164 = normalizeIndianPhoneForMetadata(pending.phone);
    if (e164) authData.phone = e164;
  }

  const { error: updateAuthError } = await supabase().auth.updateUser({ data: authData });
  if (updateAuthError) {
    console.warn('[auth] applyPendingOAuthMetadata: auth metadata update failed:', updateAuthError.message);
    failedSteps.push('auth_metadata');
  }

  const { data: userData } = await supabase().auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    failedSteps.push('profile', 'organization');
    return { status: 'partial_failure', failedSteps };
  }

  const profileUpdates: Record<string, unknown> = {};
  if (pending.fullName?.trim()) profileUpdates.full_name = pending.fullName.trim();
  if (pending.companyName?.trim()) profileUpdates.company_name = pending.companyName.trim();
  if (pending.phone != null && pending.phone !== "") {
    const e164 = normalizeIndianPhoneForMetadata(pending.phone);
    if (e164) profileUpdates.phone = e164;
  }
  // Keep profiles.aggregated/asset aligned with org operating model (RBAC source).
  if (pending.operatingModel === "ASSET_BASED") {
    profileUpdates.aggregated = false;
    profileUpdates.asset = true;
  } else if (pending.operatingModel === "NON_ASSET") {
    profileUpdates.aggregated = true;
    profileUpdates.asset = false;
  } else if (pending.operatingModel === "HYBRID") {
    profileUpdates.aggregated = true;
    profileUpdates.asset = true;
  }
  const orgUpdates: Record<string, unknown> = {};
  if (createsOrganization(pendingOnboardingType)) {
    if (pending.companyName?.trim()) orgUpdates.name = pending.companyName.trim();
    if (pending.operatingModel) orgUpdates.operating_model = pending.operatingModel;
    if (pending.addressLine?.trim()) orgUpdates.address_line = pending.addressLine.trim();
    if (pending.locality?.trim()) orgUpdates.locality = pending.locality.trim();
    if (pending.pincode?.trim()) {
      const digits = pending.pincode.replace(/\D/g, '');
      if (digits) {
        orgUpdates.pincode = digits;
        orgUpdates.address_pincode = digits;
      }
    }
    if (pending.city?.trim()) orgUpdates.city = pending.city.trim();
    if (pending.state?.trim()) orgUpdates.state = pending.state.trim();
    if (pending.zone?.trim()) orgUpdates.zone = pending.zone.trim();
    if (pending.businessType?.trim()) {
      orgUpdates.business_type = pending.businessType.trim();
      // Keep KYC registration_type in sync with signup structure.
      const mapped = registrationTypeFromBusinessType(pending.businessType);
      if (mapped) orgUpdates.registration_type = mapped;
    }
    if (pending.employeeCount?.trim()) orgUpdates.employee_count = pending.employeeCount.trim();
  }

  const profileResult = Object.keys(profileUpdates).length > 0
    ? await supabase().from("profiles").update(profileUpdates).eq("id", userId).select("id")
    : null;

  if (profileResult?.error) {
    console.warn('[auth] applyPendingOAuthMetadata: profile update failed:', profileResult.error.message);
    failedSteps.push('profile');
  } else if (profileResult && (!profileResult.data || profileResult.data.length === 0)) {
    console.warn('[auth] applyPendingOAuthMetadata: profile update matched 0 rows');
    failedSteps.push('profile');
  }

  if (Object.keys(orgUpdates).length > 0) {
    // handle_new_user's trigger (which creates the organizations +
    // organization_members rows) runs asynchronously relative to this
    // call — right after exchangeCodeForSession, it may not have committed
    // yet. A single immediate lookup can find nothing and silently drop
    // address/city/state with no error. Retry briefly instead of giving up
    // on the first miss.
    let orgId: string | undefined;
    for (let attempt = 0; attempt < 5 && !orgId; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 400));
      const { data } = await supabase()
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .in("role", ["owner", "admin"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      orgId = data?.organization_id;
    }

    const orgFilter = orgId
      ? { column: "id" as const, value: orgId }
      : { column: "owner_id" as const, value: userId };
    const { data: updatedOrgs, error: orgUpdateError } = await supabase()
      .from("organizations")
      .update(orgUpdates)
      .eq(orgFilter.column, orgFilter.value)
      .select("id");
    if (orgUpdateError) {
      console.warn('[auth] applyPendingOAuthMetadata: organization update failed:', orgUpdateError.message);
      failedSteps.push('organization');
    } else if (!updatedOrgs || updatedOrgs.length === 0) {
      console.warn('[auth] applyPendingOAuthMetadata: organization update matched 0 rows');
      failedSteps.push('organization');
    }
  }

  void trySyncMyDriverRowsUserId();

  if (failedSteps.length > 0) {
    return { status: 'partial_failure', failedSteps };
  }

  await AsyncStorage.removeItem(PENDING_OAUTH_METADATA_KEY).catch(() => {});
  return { status: 'success' };
}

export async function signOut(): Promise<void> {
  try {
    const { error } = await supabase().auth.signOut();
    if (error) {
      console.warn("Sign out server error:", error);
      await supabase().auth.signOut({ scope: "local" });
    }
  } catch (e) {
    console.error("Sign out exception:", e);
    try {
      await supabase().auth.signOut({ scope: "local" });
    } catch (_localErr) {
      // ignore
    }
  }
}

/** Detect auth errors that mean the session is invalid (e.g. refresh token not found, user deleted). */
export function isSessionExpiredError(e: unknown): boolean {
  const msg =
    typeof (e as { message?: string })?.message === "string"
      ? (e as { message: string }).message
      : e instanceof Error
        ? e.message
        : "";
  const name = e instanceof Error ? e.name || "" : "";
  const msgLower = (msg || "").toLowerCase();
  const nameLower = (name || "").toLowerCase();
  return (
    nameLower === "authapierror" ||
    /invalid refresh token|refresh token not found|refresh token|session.*expired/i.test(
      msgLower,
    ) ||
    /user from sub claim.*does not exist|jwt.*does not exist/i.test(msgLower)
  );
}

function isInvalidSessionError(e: unknown): boolean {
  return isSessionExpiredError(e);
}

function isTransientAuthNetworkError(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message
      : typeof (e as { message?: string })?.message === "string"
        ? (e as { message: string }).message
        : String(e ?? "");
  return (
    msg === "Network request failed" ||
    msg === "Failed to fetch" ||
    msg === "Load failed" ||
    /access control checks|timeout|network|failed to fetch|fetch failed/i.test(
      msg,
    )
  );
}

/** Clear local session when the server says the user/session is invalid (e.g. after a DB reset or refresh token not found). */
export async function clearLocalSessionIfInvalid(error: unknown): Promise<boolean> {
  if (error == null || !isInvalidSessionError(error)) return false;
  try {
    await supabase().auth.signOut({ scope: "local" });
    if (__DEV__) {
      console.info(
        "[Auth] Session invalid or expired; cleared local session. Please sign in again.",
      );
    }
    return true;
  } catch {
    return false;
  }
}

/** Ten-digit national number for get_email_by_phone / check-user-by-phone (aligned with validatePhone). */
function normalizePhoneToTenDigits(phone: string): string | null {
  return extractIndianMobileTenDigits(phone ?? "");
}

/** Mask email for display (e.g. ni***@gmail.com). */
function maskEmail(email: string): string {
  const t = (email ?? "").trim();
  if (t.length === 0) return "";
  const at = t.indexOf("@");
  if (at <= 0) return "***";
  const local = t.slice(0, at);
  const domain = t.slice(at);
  if (local.length <= 2) return local[0] + "***" + domain;
  return local.slice(0, 2) + "***" + domain;
}

export interface CheckOrganizationNameTakenResult {
  error: Error | null;
  taken: boolean;
}

/**
 * True if an organization already uses this display name (trimmed, case-insensitive).
 * Used before sign-up; callable by anon via SECURITY DEFINER RPC.
 */
export async function checkOrganizationNameTaken(
  companyName: string,
): Promise<CheckOrganizationNameTakenResult> {
  const key = (companyName ?? "").trim();
  if (!key) return { error: null, taken: false };
  try {
    const { data, error } = await supabase().rpc("organization_name_is_taken", {
      p_name: key,
    });
    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (
        msg.includes("function") &&
        (msg.includes("does not exist") ||
          msg.includes("not found") ||
          msg.includes("could not find"))
      ) {
        if (__DEV__) {
          console.warn(
            "[auth] organization_name_is_taken RPC missing; blocking sign-up to enforce uniqueness. Run NOTIFY pgrst, reload_schema; in your DB.",
          );
        }
        // STRICT ENFORCEMENT: If the database function is missing, we must NOT allow sign-up,
        // because we cannot guarantee the company name is unique.
        return { 
          error: new Error("System update required: Cannot verify if company name exists. Please run the SQL migrations."), 
          taken: false 
        };
      }
      return {
        error: new Error("Could not verify company name. Please try again."),
        taken: false,
      };
    }
    return { error: null, taken: data === true };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
        taken: false,
      };
    }
    return {
      error: e instanceof Error ? e : new Error("Check failed"),
      taken: false,
    };
  }
}

export interface CheckExistingUserByPhoneResult {
  error: Error | null;
  exists: boolean;
  email?: string;
  masked_email?: string;
}

/**
 * Check if a phone is already registered (profiles table). Call before sign-up to redirect
 * existing users to sign-in with email prefilled. Uses fast RPC get_email_by_phone when available,
 * falls back to Edge Function check-user-by-phone.
 */
export async function checkExistingUserByPhone(
  phone: string,
): Promise<CheckExistingUserByPhoneResult> {
  const normalized = normalizePhoneToTenDigits(phone);
  if (!normalized || normalized.length !== 10) {
    return { error: null, exists: false };
  }

  const lookup = lookupExistingUserByPhone(normalized);
  const timed = withPhoneLookupTimeout(lookup);
  try {
    return await timed;
  } catch {
    return { error: null, exists: false };
  }
}

async function lookupExistingUserByPhone(
  normalized: string,
): Promise<CheckExistingUserByPhoneResult> {
  try {
    const { data, error } = await supabase().rpc("get_email_by_phone", {
      p_phone: normalized,
    });
    if (!error) {
      if (data != null && typeof data === "string" && data.trim() !== "") {
        const email = data.trim();
        return {
          error: null,
          exists: true,
          email,
          masked_email: maskEmail(email),
        };
      }
      return { error: null, exists: false };
    }
  } catch {
    // RPC may not exist (old DB); fall back to Edge Function
  }
  try {
    const { data, error } = await supabase().functions.invoke(
      "check-user-by-phone",
      {
        body: { phone: normalized },
      },
    );
    if (error) {
      return {
        error: new Error(error.message ?? "Check failed"),
        exists: false,
      };
    }
    const payload = data as {
      exists?: boolean;
      email?: string;
      masked_email?: string;
    } | null;
    const exists = Boolean(payload?.exists);
    return {
      error: null,
      exists,
      email: payload?.email,
      masked_email: payload?.masked_email,
    };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
        exists: false,
      };
    }
    return {
      error: e instanceof Error ? e : new Error("Check failed"),
      exists: false,
    };
  }
}

function withPhoneLookupTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("phone_lookup_timeout")),
      PHONE_LOOKUP_TIMEOUT_MS,
    );
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export interface CheckEmailRegisteredResult {
  error: Error | null;
  exists: boolean;
  masked_email?: string;
}

/** Pre-signup check: email already registered on Pulse (anon-safe RPC). */
export async function checkEmailRegisteredForSignup(
  email: string,
): Promise<CheckEmailRegisteredResult> {
  const trimmed = (email ?? "").trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return { error: null, exists: false };
  }
  try {
    const { data, error } = await supabase().rpc("check_email_registered_for_signup", {
      p_email: trimmed,
    });
    if (error) return { error: new Error(error.message), exists: false };
    const payload = (data ?? {}) as { exists?: boolean; masked_email?: string };
    return {
      error: null,
      exists: Boolean(payload.exists),
      masked_email: payload.masked_email,
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      exists: false,
    };
  }
}

/**
 * Read session from local storage only (no network). Use for cold start so we don't
 * depend on getUser() network latency; onAuthStateChange and token refresh handle validation.
 */
export async function getSession(): Promise<{
  user: AuthUser;
  profile: AuthProfile;
} | null> {
  try {
    const { data: { session }, error } = await supabase().auth.getSession();
    if (error || !session?.user) return null;
    return mapSupabaseUserToAuth(session.user);
  } catch {
    return null;
  }
}

/** Access token expiry (ms since epoch) from persisted session — no getUser() round trip. */
export async function getAccessTokenExpiresAtMs(): Promise<number | null> {
  try {
    const { data: { session }, error } = await supabase().auth.getSession();
    if (error || !session?.expires_at) return null;
    return session.expires_at * 1000;
  } catch {
    return null;
  }
}

export function isAccessTokenFresh(
  expiresAtMs: number | null,
  minRemainingMs = 5 * 60 * 1000,
): boolean {
  if (expiresAtMs == null || !Number.isFinite(expiresAtMs)) return false;
  return expiresAtMs - Date.now() > minRemainingMs;
}

/**
 * Refresh user and profile from server (network call).
 * Uses getUser() for latest metadata and queries public.profiles for DB-side updates.
 */
export async function refreshSession(): Promise<{
  user: AuthUser;
  profile: AuthProfile;
} | null> {
  const now = Date.now();
  if (refreshSessionInFlight) return refreshSessionInFlight;
  if (now - lastRefreshSessionAt < REFRESH_DEBOUNCE_MS && lastRefreshSessionResult) {
    return lastRefreshSessionResult;
  }
  refreshSessionInFlight = (async () => {
    try {
      const { data: { user }, error } = await supabase().auth.getUser();
      if (error || !user) {
        await clearLocalSessionIfInvalid(error);
        return null;
      }

      // Base profile from auth metadata (immediate source after avatar/profile updates).
      const base = mapSupabaseUserToAuth(user);

      // Fetch from public.profiles and merge with metadata so stale DB values don't hide fresh updates.
      const { data: profile } = await supabase()
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        const dbProfile = mapDbProfileToAuth(profile);
        const meta = user.user_metadata ?? {};
        const opModel = meta.operating_model as string | undefined;
        // Prefer auth metadata operating_model over stale profiles.aggregated/asset.
        const preferMetaModel =
          opModel === "ASSET_BASED" ||
          opModel === "NON_ASSET" ||
          opModel === "HYBRID";
        const merged: AuthProfile = {
          ...base.profile,
          ...dbProfile,
          aggregated: preferMetaModel
            ? base.profile.aggregated
            : dbProfile.aggregated,
          asset: preferMetaModel ? base.profile.asset : dbProfile.asset,
          avatar_url: dbProfile.avatar_url ?? base.profile.avatar_url,
          avatar_seed: dbProfile.avatar_seed ?? base.profile.avatar_seed,
          status_text: dbProfile.status_text ?? base.profile.status_text,
          company_name: dbProfile.company_name ?? base.profile.company_name,
          phone: dbProfile.phone ?? base.profile.phone,
          full_name: dbProfile.full_name ?? base.profile.full_name,
          displayName: dbProfile.displayName || base.profile.displayName,
        };
        return {
          user: { uid: user.id, email: user.email ?? "", displayName: merged.displayName || "User" },
          profile: merged,
        };
      }

      return base;
    } catch (e) {
      await clearLocalSessionIfInvalid(e);
      return null;
    }
  })();
  const result = await refreshSessionInFlight;
  lastRefreshSessionAt = Date.now();
  lastRefreshSessionResult = result;
  refreshSessionInFlight = null;
  return result;
}

const authEventGate = new Map<string, number>();

function shouldSkipAuthEvent(event: string, userId: string | null): boolean {
  const gateKey = `${event}:${userId ?? "none"}`;
  const now = Date.now();
  const last = authEventGate.get(gateKey) ?? 0;
  authEventGate.set(gateKey, now);
  return now - last < AUTH_EVENT_DEBOUNCE_MS;
}

function flushAuthEventGate(maxEntries = 64) {
  if (authEventGate.size <= maxEntries) return;
  const items = Array.from(authEventGate.entries()).sort((a, b) => b[1] - a[1]);
  authEventGate.clear();
  for (const [key, ts] of items.slice(0, maxEntries)) {
    authEventGate.set(key, ts);
  }
}

/**
 * SDK can emit sign-out-ish events with a null session during token refresh races
 * (common on web HMR / cold restore). Confirm storage + refresh before clearing UI.
 */
async function readStoredAuthSession(): Promise<{
  user: AuthUser;
  profile: AuthProfile;
} | null> {
  try {
    const {
      data: { session },
      error,
    } = await supabase().auth.getSession();
    if (error || !session?.user) return null;
    return mapSupabaseUserToAuth(session.user);
  } catch {
    return null;
  }
}

async function confirmSignOutOrRecover(
  runCallback: (payload: { user: AuthUser; profile: AuthProfile } | null) => void,
  event: string,
): Promise<void> {
  try {
    const stored = await readStoredAuthSession();
    if (!stored) {
      if (__DEV__) console.info(`[auth] ${event} confirmed — session unrecoverable`);
      runCallback(null);
      return;
    }

    try {
      const { data: { session: refreshed }, error } =
        await supabase().auth.refreshSession();
      if (refreshed?.user && !error) {
        if (__DEV__) {
          console.info(
            `[auth] ${event} suppressed — session recovered via refresh`,
          );
        }
        runCallback(mapSupabaseUserToAuth(refreshed.user));
        return;
      }
      if (error && (await clearLocalSessionIfInvalid(error))) {
        runCallback(null);
        return;
      }
    } catch (e) {
      if (await clearLocalSessionIfInvalid(e)) {
        runCallback(null);
        return;
      }
      if (isTransientAuthNetworkError(e)) {
        if (__DEV__) {
          console.warn(
            `[auth] ${event} refresh failed (network) — keeping stored session`,
          );
        }
        runCallback(stored);
        return;
      }
    }

    const stillStored = await readStoredAuthSession();
    if (!stillStored) {
      runCallback(null);
      return;
    }

    if (__DEV__) {
      console.warn(
        `[auth] ${event} refresh failed — keeping stored session`,
      );
    }
    runCallback(stored);
  } catch (e) {
    if (await clearLocalSessionIfInvalid(e)) {
      runCallback(null);
      return;
    }
    const stored = await readStoredAuthSession();
    if (stored && isTransientAuthNetworkError(e)) {
      if (__DEV__) {
        console.warn(
          `[auth] ${event} verify failed (network?) — keeping stored session`,
        );
      }
      runCallback(stored);
      return;
    }
    if (__DEV__) {
      console.warn(`[auth] ${event} verify failed — suppressing sign-out`);
    }
  }
}

export function onAuthStateChange(
  callback: (auth: { user: AuthUser; profile: AuthProfile } | null) => void | Promise<void>,
): () => void {
  let isProcessing = false;
  let queuedPayload: { user: AuthUser; profile: AuthProfile } | null | undefined;
  let signOutVerifyInFlight = false;

  const runCallback = (payload: { user: AuthUser; profile: AuthProfile } | null) => {
    if (isProcessing) {
      queuedPayload = payload;
      return;
    }
    isProcessing = true;
    void Promise.resolve(callback(payload))
      .catch((err: unknown) => {
        console.warn("[auth] onAuthStateChange callback failed:", err);
      })
      .finally(() => {
        isProcessing = false;
        if (queuedPayload !== undefined) {
          const next = queuedPayload;
          queuedPayload = undefined;
          runCallback(next ?? null);
        }
      });
  };

  const {
    data: { subscription },
  } = supabase().auth.onAuthStateChange((event, session) => {
    if (
      event === 'TOKEN_REFRESHED' ||
      event === 'INITIAL_SESSION' ||
      event === 'USER_UPDATED'
    ) {
      return;
    }
    const userId = session?.user?.id ?? null;
    if (shouldSkipAuthEvent(event, userId)) return;
    flushAuthEventGate();

    if (!session?.user) {
      if (signOutVerifyInFlight) return;
      signOutVerifyInFlight = true;
      void confirmSignOutOrRecover(runCallback, event).finally(() => {
        signOutVerifyInFlight = false;
      });
      return;
    }
    runCallback(mapSupabaseUserToAuth(session.user));
  });
  return () => subscription.unsubscribe();
}

const PROFILE_SELECT_COLUMNS =
  "id,email,full_name,role,aggregated,asset,company_name,phone,avatar_url,avatar_seed,bio";

/**
 * In-flight `getProfile` calls keyed by uid, shared process-wide so AuthContext
 * and useIdentityQuery collapse onto one request instead of each issuing their
 * own. Cleared as soon as the fetch settles — this dedupes concurrency, it is
 * not a result cache.
 */
const profileInflight = new Map<string, Promise<AuthProfile | null>>();

/**
 * Last `getProfile` failure per uid, set only when the API layer was
 * unavailable (PGRST002/PGRST003/5xx). Callers read it to decide whether an
 * immediate re-fetch is worth attempting; a null profile alone cannot tell an
 * outage apart from a user who genuinely has no row.
 */
const profileLastErrorWasServiceUnavailable = new Map<string, boolean>();

/** True when this uid's most recent getProfile failed because the API was down. */
export function lastProfileFetchWasServiceUnavailable(uid: string): boolean {
  return profileLastErrorWasServiceUnavailable.get(uid) === true;
}

/** Fetch a specific user's profile from the public.profiles table. */
export async function getProfile(uid: string): Promise<AuthProfile | null> {
  const existing = profileInflight.get(uid);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { data, error } = await supabase()
        .from("profiles")
        .select(PROFILE_SELECT_COLUMNS)
        .eq("id", uid)
        .maybeSingle();
      profileLastErrorWasServiceUnavailable.set(
        uid,
        error ? isServiceUnavailableError(error) : false,
      );
      if (error || !data) return null;
      return mapDbProfileToAuth(data);
    } catch (e) {
      profileLastErrorWasServiceUnavailable.set(uid, isServiceUnavailableError(e));
      return null;
    } finally {
      profileInflight.delete(uid);
    }
  })();

  profileInflight.set(uid, promise);
  return promise;
}

/**
 * Self-heal for environments where DB auth trigger did not provision profiles.
 * Upserts the current user's own profile using auth metadata under RLS (auth.uid() = id).
 */
export async function ensureCurrentUserProfile(): Promise<{ error: Error | null }> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase().auth.getUser();
    if (userError || !user) {
      return { error: new Error(userError?.message || "Not signed in") };
    }

    const mapped = mapSupabaseUserToAuth(user).profile;
    const payload = {
      id: user.id,
      email: user.email ?? mapped.email,
      full_name: mapped.full_name ?? mapped.displayName,
      role: mapped.role,
      aggregated: mapped.aggregated,
      asset: mapped.asset,
      company_name: mapped.company_name ?? null,
      phone: mapped.phone ?? null,
      avatar_url: mapped.avatar_url ?? null,
      avatar_seed: mapped.avatar_seed ?? null,
      bio: mapped.status_text ?? null,
    };

    const { error } = await supabase().from("profiles").upsert(payload, {
      onConflict: "id",
    });
    if (error) return { error: new Error(error.message || "Profile provisioning failed") };
    return { error: null };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error("Profile provisioning failed"),
    };
  }
}


/** Updates to apply to the current user's profile (stored in auth user_metadata and public.profiles). */
export interface UpdateProfileOptions {
  full_name?: string;
  phone?: string;
  company_name?: string;
  /** Profile photo URL; pass null to clear. */
  avatar_url?: string | null;
  /** Custom avatar seed for presets (e.g. pilot-1). */
  avatar_seed?: string | null;
  /** Profile quote/status (WhatsApp-style). */
  status_text?: string | null;
}

/**
 * Update the current user's profile. Stored in both auth.users.raw_user_meta_data (Supabase Auth)
 * and the public.profiles table for relational integrity and searchability.
 * Connection invite-by-phone (get_invitee_by_phone) reads from auth.users. Triggers onAuthStateChange so AuthContext reflects the new profile.
 */
export async function updateProfile(
  updates: UpdateProfileOptions,
): Promise<{ error: Error | null }> {
  if (updates.full_name !== undefined) {
    const nameErr = validateFullName(true)(updates.full_name);
    if (nameErr) return { error: new Error(nameErr) };
  }
  if (updates.phone !== undefined && String(updates.phone).trim()) {
    const phoneErr = validatePhone(updates.phone);
    if (phoneErr) return { error: new Error(phoneErr) };
  }
  if (updates.company_name !== undefined) {
    const companyErr = maxLength(VALIDATION.COMPANY_NAME_MAX_LENGTH)(
      updates.company_name,
    );
    if (companyErr) return { error: new Error(companyErr) };
  }
  if (updates.status_text !== undefined && updates.status_text !== null) {
    const statusErr = maxLength(
      VALIDATION.STATUS_TEXT_MAX_LENGTH,
      "Status must be at most " +
        VALIDATION.STATUS_TEXT_MAX_LENGTH +
        " characters.",
    )(String(updates.status_text).trim());
    if (statusErr) return { error: new Error(statusErr) };
  }
  try {
    const {
      data: { user },
    } = await supabase().auth.getUser();
    if (!user) return { error: new Error("Not signed in") };

    // 1. Update auth.users metadata (for fast local access and sync across devices)
    const data: Record<string, unknown> = {};
    if (updates.full_name !== undefined)
      data.full_name = updates.full_name.trim();
    if (updates.phone !== undefined) {
      const t = updates.phone.trim();
      if (!t) {
        data.phone = "";
      } else {
        const e164 = normalizeIndianPhoneForMetadata(updates.phone);
        data.phone = e164 ?? "";
      }
    }
    if (updates.company_name !== undefined)
      data.company_name = updates.company_name.trim();
    if (updates.avatar_url !== undefined)
      data.avatar_url = updates.avatar_url || null;
    if (updates.avatar_seed !== undefined)
      data.avatar_seed = updates.avatar_seed || null;
    if (updates.status_text !== undefined)
      data.status_text = updates.status_text?.trim() ?? "";

    if (updates.phone !== undefined && String(updates.phone).trim()) {
      const nextTen = extractIndianMobileTenDigits(updates.phone);
      const currentTen =
        extractIndianMobileTenDigits(String(user.user_metadata?.phone ?? "")) ??
        extractIndianMobileTenDigits(user.phone ?? "");
      if (nextTen && nextTen !== currentTen) {
        const taken = await checkExistingUserByPhone(nextTen);
        const existingEmail = (taken.email ?? "").trim().toLowerCase();
        const myEmail = (user.email ?? "").trim().toLowerCase();
        if (taken.exists && (!existingEmail || existingEmail !== myEmail)) {
          return {
            error: new Error(
              "This mobile number is already used by another Pulse account.",
            ),
          };
        }
      }
    }

    const { error: authError } = await supabase().auth.updateUser({ data });
    if (authError) return { error: new Error(authError.message || "Auth update failed") };

    // 2. Sync to public.profiles table (for relational use, searching, and public profile view)
    const profileUpdates: Record<string, string | null> = {};
    if (updates.full_name !== undefined) profileUpdates.full_name = updates.full_name.trim();
    if (updates.phone !== undefined) {
      const t = updates.phone.trim();
      profileUpdates.phone = t
        ? normalizeIndianPhoneForMetadata(updates.phone) ?? ""
        : "";
    }
    if (updates.company_name !== undefined) profileUpdates.company_name = updates.company_name.trim();
    if (updates.avatar_url !== undefined) profileUpdates.avatar_url = updates.avatar_url;
    if (updates.avatar_seed !== undefined) profileUpdates.avatar_seed = updates.avatar_seed;
    // Note: Profiles table uses 'bio' for status/quote (from migrations)
    if (updates.status_text !== undefined) profileUpdates.bio = updates.status_text?.trim() ?? "";
    
    // We update public.profiles but don't block the UI if it fails (metadata is the primary driver for the current user)
    const { error: dbError } = await supabase()
      .from("profiles")
      .update(profileUpdates)
      .eq("id", user.id);

    if (dbError) {
      console.warn("[authService] Failed to sync profile to public table:", dbError.message);
      // We still return success if metadata update worked, as it drives the app UI
    }

    return { error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      return {
        error: new Error(
          "Cannot reach server. Check your internet connection and try again.",
        ),
      };
    }
    return { error: e instanceof Error ? e : new Error("Update failed") };
  }
}
