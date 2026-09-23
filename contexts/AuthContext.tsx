/**
 * Auth context — thin React adapter around lib/authEngine.
 *
 * Public API: user, profile, status, roleVerified, signIn/Out/Up/Google, refreshSession.
 * Derived: loading = status === "restoring", sessionExpired = status === "expired".
 *
 * Platform-specific side effects live in dedicated hooks:
 *   - useMobileKeepSignedInSignOut (AppState)
 *   - useWebKeepSignedInSignOut   (cross-tab storage sync only)
 *
 * Core auth logic (profile merge, comparison, timeout, circuit-breaker)
 * lives in lib/authEngine.
 */
import { useMobileKeepSignedInSignOut } from "@/features/auth/hooks/useMobileKeepSignedInSignOut";
import { useWebKeepSignedInSignOut } from "@/features/auth/hooks/useWebKeepSignedInSignOut";
import type { AuthUser } from "@/features/auth/services/auth.service";
import * as authService from "@/features/auth/services/auth.service";
import {
  areUserProfilesEqual,
  AUTH_RESTORE_REFRESH_TIMEOUT_MS,
  AUTH_SESSION_FRESH_MS,
  AUTH_TIMEOUT_MS,
  AuthError,
  PROFILE_VERIFY_TIMEOUT_MS,
  authErrorFromUnknown,
  authProfileToUserProfile,
  freezeInDev,
  isCircuitBreakerTripped,
  isForceExpiredSessionEnabled,
  logAuth,
  logAuthError,
  mergeAuthProfiles,
  recordCircuitBreakerHit,
  resetCircuitBreaker,
  isTimeoutError,
  withTimeout,
  type AuthStatus,
  type UserProfile,
} from "@/lib/authEngine";
import { noteDriverLoginAttempt, resetDriverPerfMetrics } from "@/lib/driverPerfMetrics";
import { clearStaleAuthOnFirstLaunch } from "@/lib/firstLaunch";
import { setCrashReporterUser, clearCrashReporterUser } from "@/lib/crashReporter";
import { resetIndexBootRedirect } from "@/lib/indexBootRedirect.util";
import { getKeepSignedIn, setKeepSignedIn } from "@/lib/keepSignedInPreference";
import { clearAllRealtimeChannels } from "@/lib/realtimeRegistry";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from "react";
import { Platform } from "react-native";

export { AuthError } from "@/lib/authEngine";
export type { AuthErrorCode, AuthStatus, UserProfile } from "@/lib/authEngine";

// ---------------------------------------------------------------------------
// Context type — narrow public surface
// ---------------------------------------------------------------------------

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  roleVerified: boolean;
  status: AuthStatus;
  /**
   * True only after the Supabase JS client has hydrated and getSession() (or an
   * equivalent restore/sign-in commit) attached a real session. Cached web JWT
   * identity must not set this — it gates the authenticated data-plane mount.
   */
  sessionAttached: boolean;
  /** @deprecated Use `status === "restoring"` */
  loading: boolean;
  /** @deprecated Use `status === "expired"` */
  sessionExpired: boolean;
  /** Set when cold-start session restore fails; cleared on sign-in / refresh / sign-out. */
  restoreError: AuthError | null;
  clearRestoreError: () => void;
  refreshSession: () => Promise<void>;
  /** Optimistic profile patch after avatar/name edits (before refreshSession completes). */
  patchProfile: (updates: Partial<UserProfile>) => void;
  signIn: (email: string, password: string, keepSignedIn?: boolean) => Promise<{ error: Error | null }>;
  signInWithGoogle: (
    keepSignedIn?: boolean,
  ) => Promise<{ error: Error | null; metadataStatus?: 'partial_failure' }>;
  signUp: (options: authService.SignUpOptions) => Promise<{
    error: Error | null;
    emailVerificationRequired?: boolean;
    domainOrgMatch?: { organizationId: string; organizationName: string };
  }>;
  signOut: () => Promise<void>;
}

/** Metro can duplicate this module across async chunks — one Context instance globally. */
const PULSE_AUTH_CONTEXT_KEY = '__pulse_auth_context__';

function getOrCreateAuthContext(): Context<AuthContextType | undefined> {
  const g = globalThis as typeof globalThis & {
    [PULSE_AUTH_CONTEXT_KEY]?: Context<AuthContextType | undefined>;
  };
  if (!g[PULSE_AUTH_CONTEXT_KEY]) {
    g[PULSE_AUTH_CONTEXT_KEY] = createContext<AuthContextType | undefined>(undefined);
  }
  return g[PULSE_AUTH_CONTEXT_KEY];
}

const AuthContext = getOrCreateAuthContext();

export function useOptionalAuth() {
  return useContext(AuthContext);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * On web, Supabase persists the session in localStorage synchronously accessible.
 * Read it before React renders so splash/chrome can show a returning-user identity.
 * This MUST NOT be treated as "Supabase JS session attached" — the client hydrates
 * storage asynchronously. Authenticated data-plane mount uses sessionAttached.
 */
function tryReadWebSession(): {
  status: AuthStatus;
  user: AuthUser | null;
  profile: UserProfile | null;
} {
  const empty = { status: "restoring" as AuthStatus, user: null, profile: null };
  if (typeof window === "undefined" || typeof localStorage === "undefined") return empty;
  try {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    if (!key) return empty;
    const raw = localStorage.getItem(key);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      expires_at?: number;
      user?: {
        id?: string;
        email?: string;
        user_metadata?: Record<string, unknown>;
      };
    };
    if (!parsed?.access_token || !parsed?.user?.id) return empty;
    const now = Math.floor(Date.now() / 1000);
    if (parsed.expires_at && parsed.expires_at < now) return empty;
    const meta = parsed.user.user_metadata ?? {};
    const uid = parsed.user.id;
    const email = parsed.user.email ?? "";
    const fullName =
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      email.split("@")[0] ??
      "User";
    const role = meta.role === "driver" ? ("driver" as const) : ("user" as const);
    const opModel = meta.operating_model as string | undefined;
    const aggregated =
      role === "driver"
        ? false
        : opModel === "NON_ASSET"
          ? true
          : opModel === "ASSET_BASED"
            ? false
            : meta.aggregated !== false && meta.aggregated !== "false";
    const asset =
      role === "driver"
        ? false
        : opModel === "ASSET_BASED"
          ? true
          : opModel === "NON_ASSET"
            ? false
            : meta.asset !== false && meta.asset !== "false";
    const user: AuthUser = { uid, email, displayName: fullName };
    const profile: UserProfile = {
      uid,
      email,
      displayName: fullName,
      full_name: fullName,
      role,
      aggregated: aggregated as boolean,
      asset: asset as boolean,
      company_name: meta.company_name as string | undefined,
      phone: meta.phone as string | undefined,
      avatar_url: meta.avatar_url as string | undefined,
      avatar_seed: meta.avatar_seed as string | undefined,
      status_text: meta.status_text as string | undefined,
    };
    return { status: "authenticated", user, profile };
  } catch {
    return empty;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize auth state from localStorage synchronously to avoid race condition
  // where hooks run before useLayoutEffect populates auth.
  const initAuthState = () => {
    const web = tryReadWebSession();
    return {
      user: web.user,
      profile: web.profile,
      status: web.status,
    };
  };
  const init = initAuthState();
  const [user, setUser] = useState<AuthUser | null>(init.user);
  const [profile, setProfile] = useState<UserProfile | null>(init.profile);
  const [roleVerified, setRoleVerified] = useState(false);
  const [status, setStatus] = useState<AuthStatus>(init.status);
  const [sessionAttached, setSessionAttached] = useState(false);
  const [restoreError, setRestoreError] = useState<AuthError | null>(null);

  // On web: read localStorage synchronously before first paint so AppBootGate
  // never blocks for returning authenticated users. useLayoutEffect fires after
  // DOM mutations but before the browser paints, which avoids both the SSR
  // hydration mismatch (useState initializer would differ server vs client) and
  // the visible flash (useEffect fires after paint).
  useLayoutEffect(() => {
    const web = tryReadWebSession();
    if (web.status === "authenticated" && web.user && web.profile) {
      setUser(web.user);
      setProfile(web.profile);
      setStatus("authenticated");
      setRoleVerified(web.profile.role === "driver" || web.profile.role === "user");
    }
  }, []);

  // Attach/detach the signed-in user for crash reports. Observability only —
  // reads auth state, never mutates it.
  useEffect(() => {
    if (user?.uid) {
      setCrashReporterUser({ id: user.uid, email: user.email });
    } else {
      clearCrashReporterUser();
    }
  }, [user?.uid, user?.email]);

  const clearRestoreError = useCallback(() => setRestoreError(null), []);

  const signOutRequestedRef = useRef(false);
  const authAttemptRef = useRef(0);
  const listenerSeqRef = useRef(0);
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  /** True while cold-start restore runs — ignore spurious SDK sign-out events. */
  const restoringRef = useRef(true);
  /** Coalesce concurrent DB profile lookups (restore + listener + zombie recovery). */
  const profileVerifyInflightRef = useRef(
    new Map<string, Promise<authService.AuthProfile | null>>(),
  );

  // ---- sequence guards ----

  const beginAuthAttempt = () => {
    authAttemptRef.current += 1;
    return authAttemptRef.current;
  };
  const isCurrentAuthAttempt = (id: number) => authAttemptRef.current === id;

  const beginListenerSeq = () => {
    listenerSeqRef.current += 1;
    return listenerSeqRef.current;
  };
  const isCurrentListenerSeq = (id: number) => listenerSeqRef.current === id;

  // ---- state transitions ----

  const clearAuthState = useCallback((expired: boolean) => {
    // Clear the module-level index boot-redirect guard here — not just in
    // app/index.tsx — because on web logout navigates straight to /sign-in and
    // index.tsx's reset branch (gated on pathname === '/') never runs. Leaving
    // bootRedirectUid set makes the next login's claimIndexBootRedirect() return
    // false, so no router.replace fires and the app hangs on the splash until a
    // hard refresh discards the module. See lib/indexBootRedirect.util.ts.
    resetIndexBootRedirect();
    resetDriverPerfMetrics();
    setUser(null);
    setProfile(null);
    setRoleVerified(false);
    setSessionAttached(false);
    setStatus(expired ? "expired" : "unauthenticated");
  }, []);

  const forceSignOutOnAuthFailure = useCallback(async (reason: string) => {
    recordCircuitBreakerHit();
    if (isCircuitBreakerTripped()) {
      logAuth(
        "circuit_breaker_tripped",
        { reason },
        "warn",
      );
      clearAuthState(true);
      return;
    }

    signOutRequestedRef.current = true;
    try {
      await withTimeout(() => authService.signOut(), AUTH_TIMEOUT_MS);
    } catch (e) {
      // Local state is cleared below regardless, so a remote-revoke timeout is
      // not an error — same rationale as signOut().
      if (isTimeoutError(e)) {
        logAuth("force_sign_out_timeout_local_cleared", { reason }, "warn");
      } else {
        logAuthError("force_sign_out_error", e, { reason });
      }
    }
    clearAuthState(true);
    logAuth("forced_sign_out", { reason });
  }, [clearAuthState]);

  // ---- profile verification with timeout ----

  const getVerifiedDbProfile = useCallback(
    async (uid: string): Promise<authService.AuthProfile | null> => {
      const inflight = profileVerifyInflightRef.current.get(uid);
      if (inflight) return inflight;

      const promise = (async () => {
        const loadVerifiedProfile = async () => {
          const dbProfile = await authService.getProfile(uid);
          if (dbProfile) return dbProfile;

          const provision = await authService.ensureCurrentUserProfile();
          if (provision.error) return null;

          return await authService.getProfile(uid);
        };

        try {
          return await withTimeout(() => loadVerifiedProfile(), PROFILE_VERIFY_TIMEOUT_MS);
        } catch (e) {
          // A timeout whose underlying fetch failed with PGRST002/PGRST003/5xx
          // means the API layer is down. Re-running the same load immediately
          // just adds a second request to an instance that is already failing.
          if (
            isTimeoutError(e) &&
            authService.lastProfileFetchWasServiceUnavailable(uid)
          ) {
            logAuth("profile_verification_service_unavailable", { uid });
            return null;
          }
          if (isTimeoutError(e)) {
            try {
              return await withTimeout(() => loadVerifiedProfile(), PROFILE_VERIFY_TIMEOUT_MS);
            } catch (retryErr) {
              if (isTimeoutError(retryErr)) {
                logAuth("profile_verification_timeout", { uid, retried: true });
              } else {
                logAuthError("profile_verification_error", retryErr, { uid, retried: true });
              }
              return null;
            }
          }
          logAuthError("profile_verification_error", e, { uid });
          return null;
        } finally {
          profileVerifyInflightRef.current.delete(uid);
        }
      })();

      profileVerifyInflightRef.current.set(uid, promise);
      return promise;
    },
    [],
  );

  /** Trust signed JWT metadata for routing; DB profile merges in background. */
  const commitAuthenticatedSession = useCallback(
    (
      nextUser: AuthUser,
      sessionProfile: authService.AuthProfile,
      options?: { logEvent?: string; logLevel?: "info" | "warn" },
    ) => {
      const trustRole =
        sessionProfile.role === "driver" || sessionProfile.role === "user";
      setUser(nextUser);
      setProfile(freezeInDev(authProfileToUserProfile(sessionProfile)));
      setRoleVerified(trustRole);
      setSessionAttached(true);
      setStatus("authenticated");
      setRestoreError(null);
      if (options?.logEvent) {
        logAuth(
          options.logEvent,
          { uid: nextUser.uid, role: sessionProfile.role },
          options.logLevel ?? "info",
        );
      }
    },
    [],
  );

  const scheduleDbProfileHydration = useCallback(
    (
      uid: string,
      sessionProfile: authService.AuthProfile,
      isActive: () => boolean,
    ) => {
      void getVerifiedDbProfile(uid).then((dbProfile) => {
        if (!isActive() || !dbProfile) return;
        const merged = mergeAuthProfiles(sessionProfile, dbProfile);
        const nextProfile = freezeInDev(authProfileToUserProfile(merged));
        setProfile((prev) =>
          areUserProfilesEqual(prev, nextProfile) ? prev : nextProfile,
        );
        setRoleVerified(true);
        resetCircuitBreaker();
        logAuth("db_profile_hydrated", { uid, role: merged.role });
      });
    },
    [getVerifiedDbProfile],
  );

  // ---- session restore + subscription ----

  useEffect(() => {
    let mounted = true;
    restoringRef.current = true;

    // Dev toggle: skip restore and jump straight to expired
    if (isForceExpiredSessionEnabled()) {
      logAuth("dev_force_expired_session", {}, "warn");
      restoringRef.current = false;
      clearAuthState(true);
      return;
    }

    const setupAuthSubscription = () => {
      if (unsubscribeRef.current) return;
      try {
        unsubscribeRef.current = authService.onAuthStateChange(async (auth) => {
          const seqId = beginListenerSeq();
          if (!mounted || !isCurrentListenerSeq(seqId)) return;
          try {
            if (auth) {
              if (restoringRef.current) return;
              commitAuthenticatedSession(auth.user, auth.profile, {
                logEvent: "auth_state_signed_in",
              });
              // Finish Google wizard metadata if a prior apply was partial / interrupted.
              void authService.applyPendingOAuthMetadata();
              scheduleDbProfileHydration(auth.user.uid, auth.profile, () =>
                mounted && isCurrentListenerSeq(seqId),
              );
            } else {
              if (restoringRef.current) {
                logAuth("auth_state_signed_out_ignored_during_restore");
                return;
              }
              const wasRequested = signOutRequestedRef.current;
              signOutRequestedRef.current = false;
              clearAuthState(!wasRequested);
              logAuth("auth_state_signed_out", { requested: wasRequested });
            }
          } catch (err) {
            if (!mounted || !isCurrentListenerSeq(seqId)) return;
            logAuthError("auth_state_callback_error", err);
            if (restoringRef.current) {
              logAuth("auth_state_callback_error_ignored_during_restore");
              return;
            }
            await forceSignOutOnAuthFailure("auth_state_callback_error");
          }
        });
      } catch {
        // Subscription setup failed; sign-in still works
      }
    };

    // Subscribe before restore so token-refresh races during getUser() are recovered.
    setupAuthSubscription();

    (async () => {
      const initAttemptId = beginAuthAttempt();
      try {
        await clearStaleAuthOnFirstLaunch();
        if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
      } catch {
        // Proceed with restore even if first-launch clear fails
      }

      try {
        const session = await withTimeout(() => authService.getSession(), AUTH_TIMEOUT_MS).catch(() => null);
        if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
        if (session) {
          // On web there is no AppState "background" event, so the keep-signed-in
          // preference has no meaning for page reloads — always restore the session.
          const keep = Platform.OS === 'web' ? true : await getKeepSignedIn();
          if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
          if (!keep) {
            signOutRequestedRef.current = true;
            await authService.signOut();
            if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
            setUser(null);
            setProfile(null);
            setRoleVerified(false);
            setStatus("unauthenticated");
            logAuth("restore_signed_out_keep_off", { uid: session.user.uid });
          } else {
            const sessionUser = session.user;
            const sessionProfile = session.profile;

            commitAuthenticatedSession(sessionUser, sessionProfile, {
              logEvent: "restore_session_applied",
            });
            restoringRef.current = false;
            // Retry deferred Google onboarding writes kept in AsyncStorage.
            void authService.applyPendingOAuthMetadata();

            void (async () => {
              try {
                const tokenExpiresAtMs =
                  await authService.getAccessTokenExpiresAtMs();
                if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;

                const tokenFresh = authService.isAccessTokenFresh(
                  tokenExpiresAtMs,
                  AUTH_SESSION_FRESH_MS,
                );

                if (!tokenFresh) {
                  try {
                    const refreshed = await withTimeout(
                      () => authService.refreshSession(),
                      AUTH_RESTORE_REFRESH_TIMEOUT_MS,
                    );
                    if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                    if (refreshed) {
                      commitAuthenticatedSession(refreshed.user, refreshed.profile, {
                        logEvent: "restore_refresh_completed",
                      });
                      scheduleDbProfileHydration(
                        refreshed.user.uid,
                        refreshed.profile,
                        () => mounted && isCurrentAuthAttempt(initAttemptId),
                      );
                      return;
                    }
                    const stillStored = await authService.getSession();
                    if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                    if (!stillStored) {
                      clearAuthState(true);
                      logAuth(
                        "restore_refresh_invalid_session",
                        { uid: sessionUser.uid },
                        "warn",
                      );
                      return;
                    }
                  } catch (e) {
                    if (!mounted || !isCurrentAuthAttempt(initAttemptId)) return;
                    if (isTimeoutError(e)) {
                      logAuth(
                        "restore_refresh_timeout",
                        { uid: sessionUser.uid },
                        "warn",
                      );
                    } else {
                      logAuthError("restore_refresh_error", e, {
                        uid: sessionUser.uid,
                      });
                    }
                  }
                } else {
                  logAuth("restore_skip_refresh_token_fresh", {
                    uid: sessionUser.uid,
                  });
                }

                scheduleDbProfileHydration(
                  sessionUser.uid,
                  sessionProfile,
                  () => mounted && isCurrentAuthAttempt(initAttemptId),
                );
              } catch (e) {
                logAuthError("restore_background_hydration_error", e, {
                  uid: sessionUser.uid,
                });
              }
            })();
          }
        } else {
          setRestoreError(null);
          clearAuthState(false);
          logAuth("restore_no_session");
        }
      } catch (err) {
        if (mounted && isCurrentAuthAttempt(initAttemptId)) {
          logAuthError("restore_error", err);
          const stored = await authService.getSession().catch(() => null);
          if (stored) {
            commitAuthenticatedSession(stored.user, stored.profile, {
              logEvent: "restore_error_degraded_session_preserved",
              logLevel: "warn",
            });
            setRestoreError(authErrorFromUnknown(err));
          } else {
            setRestoreError(authErrorFromUnknown(err));
            clearAuthState(false);
          }
        }
      } finally {
        restoringRef.current = false;
        if (mounted && isCurrentAuthAttempt(initAttemptId)) {
          setStatus((prev) => (prev === "restoring" ? "unauthenticated" : prev));
        }
      }
    })();

    return () => {
      mounted = false;
      restoringRef.current = false;
      unsubscribeRef.current?.();
      unsubscribeRef.current = undefined;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- profile backfill (session metadata when DB/network is flaky) ----

  useEffect(() => {
    if (!user || profile) return;
    let cancelled = false;
    void authService.getSession().then((stored) => {
      if (cancelled || !stored) return;
      setProfile(freezeInDev(authProfileToUserProfile(stored.profile)));
      setStatus("authenticated");
      logAuth("profile_backfill_from_session", { uid: stored.user.uid });
    });
    return () => {
      cancelled = true;
    };
  }, [user, profile]);

  // ---- zombie recovery ----

  useEffect(() => {
    if (status === "restoring" || !user || roleVerified) return;
    const timer = setTimeout(async () => {
      if (!user) return;
      if (profileVerifyInflightRef.current.has(user.uid)) {
        logAuth("zombie_recovery_skipped_verify_inflight", { uid: user.uid });
        return;
      }
      logAuth("zombie_recovery_triggered", { uid: user.uid });
      try {
        const dbProfile = await getVerifiedDbProfile(user.uid);
        if (dbProfile) {
          setRoleVerified(true);
          resetCircuitBreaker();
          logAuth("zombie_recovery_success", { uid: user.uid });
          return;
        }
      } catch {
        // Fall through to session check
      }
      // Profile lookup failed — could be a transient network issue, not an expired session.
      // Genuinely expired sessions are handled by the onAuthStateChange subscription
      // (Supabase fires SIGNED_OUT when auto-refresh fails server-side).
      // Only force sign-out here when the local session token is also gone, meaning
      // the app already has no credentials to restore on reload.
      try {
        const stored = await withTimeout(() => authService.getSession(), AUTH_TIMEOUT_MS).catch(() => null);
        if (stored) {
          logAuth("zombie_recovery_deferred_session_present", { uid: user.uid });
          return;
        }
      } catch {
        // Cannot read storage — be conservative and do not sign out.
        logAuth("zombie_recovery_storage_error", { uid: user.uid }, "warn");
        return;
      }
      await forceSignOutOnAuthFailure("zombie_recovery_failed_no_session");
    }, 12_000);
    return () => clearTimeout(timer);
  }, [status, user, roleVerified, getVerifiedDbProfile, forceSignOutOnAuthFailure]);

  // ---- platform hooks: sign out on background/hidden when keep-signed-in is off ----

  useMobileKeepSignedInSignOut(clearAuthState, signOutRequestedRef);
  useWebKeepSignedInSignOut(clearAuthState, signOutRequestedRef);

  // ---- actions ----

  const signIn = useCallback(async (
    email: string,
    password: string,
    keepSignedIn: boolean = true,
  ) => {
    noteDriverLoginAttempt();
    const signInAttemptId = beginAuthAttempt();
    const result = await authService.signInWithPassword(email, password);
    if (!result.error) {
      setRestoreError(null);
      setStatus("authenticated");
      resetCircuitBreaker();
      await setKeepSignedIn(keepSignedIn);
      if (!isCurrentAuthAttempt(signInAttemptId)) return { error: null };
      // SIGNED_IN already hydrates profile. Extra getUser + profiles.select here
      // stacked on password grant during the 2026-09-22 unhealthy cascade.
    }
    return wrapActionResult(result);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signInWithGoogle = useCallback(async (keepSignedIn: boolean = true) => {
    noteDriverLoginAttempt();
    const signInAttemptId = beginAuthAttempt();
    const result = await authService.signInWithGoogle();
    if (!result.error) {
      setRestoreError(null);
      setStatus("authenticated");
      resetCircuitBreaker();
      await setKeepSignedIn(keepSignedIn);
      if (!isCurrentAuthAttempt(signInAttemptId)) return { error: null };
    }
    return { ...wrapActionResult(result), metadataStatus: result.metadataStatus };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = useCallback(async (
    options: authService.SignUpOptions,
  ) => {
    const result = await authService.signUp(options);
    if (!result.error) {
      setRestoreError(null);
      await refreshSessionInternal();
    }
    return {
      ...wrapActionResult(result),
      emailVerificationRequired: result.emailVerificationRequired,
      domainOrgMatch: result.domainOrgMatch,
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSessionInternal = async () => {
    const refreshAttemptId = beginAuthAttempt();
    try {
      const session = await withTimeout(
        () => authService.refreshSession(),
        AUTH_RESTORE_REFRESH_TIMEOUT_MS,
      );
      if (!isCurrentAuthAttempt(refreshAttemptId)) return;
      if (session) {
        commitAuthenticatedSession(session.user, session.profile, {
          logEvent: "refresh_session_applied",
        });
        scheduleDbProfileHydration(
          session.user.uid,
          session.profile,
          () => isCurrentAuthAttempt(refreshAttemptId),
        );
      } else {
        const stored = await authService.getSession();
        if (!isCurrentAuthAttempt(refreshAttemptId)) return;
        if (stored) {
          commitAuthenticatedSession(stored.user, stored.profile, {
            logEvent: "refresh_degraded_session_preserved",
            logLevel: "warn",
          });
        } else {
          clearAuthState(true);
          logAuth("refresh_invalid_session_cleared", {}, "warn");
        }
      }
    } catch (e) {
      if (await authService.clearLocalSessionIfInvalid(e)) {
        if (isCurrentAuthAttempt(refreshAttemptId)) {
          clearAuthState(true);
          logAuth("refresh_invalid_session_cleared", {}, "warn");
        }
        return;
      }
      if (isTimeoutError(e)) {
        logAuth("refresh_session_timeout", { message: e.message }, "warn");
      } else {
        logAuthError("refresh_session_error", e);
      }
      if (!isCurrentAuthAttempt(refreshAttemptId)) return;
      const stored = await authService.getSession();
      if (!isCurrentAuthAttempt(refreshAttemptId)) return;
      const err = authErrorFromUnknown(e);
      if (stored) {
        commitAuthenticatedSession(stored.user, stored.profile, {
          logEvent: "refresh_timeout_degraded_session_preserved",
          logLevel: "warn",
        });
        setRestoreError(err);
      } else {
        setRestoreError(err);
        clearAuthState(true);
      }
    }
  };

  /**
   * Wraps a service-layer `{ error }` result: if the original error
   * is a TimeoutError, returns an AuthError with code so callers
   * can show tailored UI (e.g. retry button vs generic message).
   */
  const wrapActionResult = (result: { error: Error | null }): { error: Error | null } => {
    if (!result.error) return result;
    if (isTimeoutError(result.error)) {
      return { error: new AuthError("NETWORK_TIMEOUT", result.error.message, result.error) };
    }
    return result;
  };

  const refreshSession = useCallback(refreshSessionInternal, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patchProfile = useCallback((updates: Partial<UserProfile>) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      return areUserProfilesEqual(prev, next) ? prev : freezeInDev(next);
    });
  }, []);

  const signOut = useCallback(async () => {
    signOutRequestedRef.current = true;
    clearAllRealtimeChannels();
    try {
      await withTimeout(() => authService.signOut(), AUTH_TIMEOUT_MS);
    } catch (e) {
      // Local state is cleared below either way, so the user is signed out even
      // when the remote revoke times out on a flaky network. Warn, don't error.
      if (isTimeoutError(e)) {
        logAuth("sign_out_timeout_local_cleared", { message: e.message }, "warn");
      } else {
        logAuthError("sign_out_error", e);
      }
    }
    setRestoreError(null);
    clearAuthState(false);
  }, [clearAuthState]);

  // ---- render ----

  const loading = status === "restoring";
  const sessionExpired = status === "expired";

  const authContextValue = useMemo(
    () => ({
      user,
      profile,
      roleVerified,
      status,
      sessionAttached,
      loading,
      sessionExpired,
      restoreError,
      clearRestoreError,
      refreshSession,
      patchProfile,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
    }),
    [
      user,
      profile,
      roleVerified,
      status,
      sessionAttached,
      loading,
      sessionExpired,
      restoreError,
      clearRestoreError,
      refreshSession,
      patchProfile,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
    ],
  );

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>

  );
}
