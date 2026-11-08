/**
 * Organization context — current org for list/detail screens. Uses services/organizationService.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type Context,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { bindDriverPartyAvatarWorkspace } from '@/features/drivers/utils/driverPartyAvatar.util';
// Direct path avoids dragging the org barrel (components + visibility helpers)
// into every consumer of the OrganizationContext.
import * as organizationService from '@/features/organization/services/organization.service';
import { markStartupPhase, isStartupComplete } from '@/lib/startupMetrics';
import type { CurrentOrganization } from '@/types/organization';
import { getQueryClient } from '@/lib/queryClient';
import {
  bindLinkedOrgDisplayViewerOrg,
  purgeLinkedOrgDisplayQueries,
} from '@/lib/queries/linkedOrgDisplayCache';
import { isInfrastructureErrorMessage } from '@/lib/supabaseHttp.util';

interface OrganizationContextType {
  currentOrganization: CurrentOrganization | null;
  setCurrentOrganization: (org: CurrentOrganization | null) => void;
  isLoading: boolean;
  error: Error | null;
  refreshOrganization: () => Promise<void>;
}

/** Metro can duplicate this module across async chunks — one Context instance globally. */
const PULSE_ORG_CONTEXT_KEY = '__pulse_organization_context__';

function getOrCreateOrganizationContext(): Context<OrganizationContextType | undefined> {
  const g = globalThis as typeof globalThis & {
    [PULSE_ORG_CONTEXT_KEY]?: Context<OrganizationContextType | undefined>;
  };
  if (!g[PULSE_ORG_CONTEXT_KEY]) {
    g[PULSE_ORG_CONTEXT_KEY] = createContext<OrganizationContextType | undefined>(undefined);
  }
  return g[PULSE_ORG_CONTEXT_KEY];
}

const OrganizationContext = getOrCreateOrganizationContext();

export function useOptionalOrganization() {
  return useContext(OrganizationContext);
}

export function useOrganization() {
  const ctx = useContext(OrganizationContext);
  if (ctx === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return ctx;
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, profile, status } = useAuth();
  const userId = user?.uid ?? null;
  const [currentOrganization, setCurrentOrganizationState] = useState<CurrentOrganization | null>(null);
  const prevOrgIdRef = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  /** Current effect session signal — refresh uses this ref so sign-out / user swap cancels in-flight work (no shared mountedRef race). */
  const sessionSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const userRef = useRef(user);
  userRef.current = user;

  /**
   * Tracks which userId had its org state populated by ActiveWorkspaceContext.
   * Cleared on userId change so a different user is not treated as already hydrated.
   * refreshOrganization (forceRefresh) bypasses the cold-login skip entirely.
   */
  const workspacePopulatedForUserRef = useRef<string | null>(null);

  /**
   * Infra-error retry backoff state. Keyed on a stable counter, NOT on the
   * `error` object identity — `setError` creates a fresh Error each failure,
   * so depending on `error` would re-arm the timer every attempt and produce
   * an uncapped, un-jittered 5s lockstep retry across all clients (this was a
   * contributor to a DB connection-pileup incident). We cap attempts and use
   * exponential backoff + jitter, mirroring lib/supabase.ts's auth-refresh fix.
   */
  const orgRetryAttemptRef = useRef(0);
  const [orgRetryTick, setOrgRetryTick] = useState(0);
  const ORG_RETRY_MAX_ATTEMPTS = 6;
  const ORG_RETRY_BASE_MS = 5_000;
  const ORG_RETRY_CAP_MS = 60_000;

  // Public setter — ActiveWorkspaceContext writes the cold-login org here
  // after its single membership fetch. Do not start a second membership query.
  const setCurrentOrganization = useCallback((org: CurrentOrganization | null) => {
    const currentUid = userRef.current?.uid ?? null;
    if (currentUid) workspacePopulatedForUserRef.current = currentUid;
    bindLinkedOrgDisplayViewerOrg(org?.id ?? null);
    setCurrentOrganizationState((prev) => {
      if (prev?.id === org?.id && prev?.operatingModel === org?.operatingModel && prev?.name === org?.name) {
        return prev;
      }
      return org;
    });
    setError((prev) => (prev ? null : prev));
    setIsLoading((prev) => (prev ? false : prev));
    if (!isStartupComplete()) markStartupPhase('org_resolved');
  }, []);

  /** `signal.cancelled` is set in effect cleanup (user change, unmount). Refresh uses `sessionSignalRef` so it honours the same cancellation. */
  const loadOrganizationsForSession = useCallback(async (signal: { cancelled: boolean }, forceRefresh = false) => {
    const stale = () => signal.cancelled;
    const staleForUser = (uid: string) => stale() || userRef.current?.uid !== uid;

    const sessionUser = userRef.current;
    if (!sessionUser) {
      if (stale()) return;
      setCurrentOrganizationState(null);
      setIsLoading(false);
      return;
    }

    if (profile?.role === 'driver') {
      if (stale()) return;
      setCurrentOrganizationState(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Cold login: ActiveWorkspaceProvider owns organization_members / organizations.
    // Skip getOrganizationsForUser so the two providers cannot race a duplicate fetch.
    // If workspace already called setCurrentOrganization, drop isLoading; otherwise
    // stay loading until that setter runs. forceRefresh (refreshOrganization) still fetches.
    if (!forceRefresh) {
      if (workspacePopulatedForUserRef.current === sessionUser.uid && !stale()) {
        if (!isStartupComplete()) markStartupPhase('org_resolved');
        setIsLoading(false);
      }
      return;
    }

    const sessionUid = sessionUser.uid;
    if (!stale()) {
      setIsLoading(true);
      setError(null);
    }
    try {
      const { error: err, organizations } = await organizationService.getOrganizationsForUser();
      if (staleForUser(sessionUid)) return;
      if (err) {
        setError(err);
        if (isInfrastructureErrorMessage(err.message)) {
          setOrgRetryTick((n) => n + 1); // arm the backoff retry effect
        } else {
          setCurrentOrganizationState(null);
        }
      } else if (organizations.length > 0) {
        orgRetryAttemptRef.current = 0; // recovered — reset infra-retry backoff
        setCurrentOrganizationState(organizations[0]);
      } else {
        orgRetryAttemptRef.current = 0;
        setCurrentOrganizationState(null);
      }
    } catch (e) {
      if (staleForUser(sessionUid)) return;
      const errObj = e instanceof Error ? e : new Error(String(e));
      setError(errObj);
      if (isInfrastructureErrorMessage(errObj.message)) {
        setOrgRetryTick((n) => n + 1); // arm the backoff retry effect
      } else {
        setCurrentOrganizationState(null);
      }
    } finally {
      if (!staleForUser(sessionUid)) {
        // Only mark once during cold boot — not on every org refresh.
        if (!isStartupComplete()) markStartupPhase('org_resolved');
        setIsLoading(false);
      }
    }
  }, [profile?.role]);

  const refreshOrganization = useCallback(async () => {
    await loadOrganizationsForSession(sessionSignalRef.current, true); // forceRefresh — bypasses workspace guard
  }, [loadOrganizationsForSession]);

  useEffect(() => {
    // Clear workspace-populated flag on user change so a different user always
    // gets a fresh fetch — prevents the guard from skipping after account switch.
    workspacePopulatedForUserRef.current = null;
    if (status === 'restoring') return;
    const signal = { cancelled: false };
    sessionSignalRef.current = signal;
    void loadOrganizationsForSession(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [userId, status, loadOrganizationsForSession]);

  // Reset the infra-retry backoff whenever the session identity changes, so a
  // new user/session starts from attempt 0 rather than inheriting a capped-out
  // counter from a previous session.
  useEffect(() => {
    orgRetryAttemptRef.current = 0;
  }, [userId, status]);

  useEffect(() => {
    if (!error || !isInfrastructureErrorMessage(error.message)) return;
    if (status === 'restoring' || !user || profile?.role === 'driver') return;
    if (orgRetryAttemptRef.current >= ORG_RETRY_MAX_ATTEMPTS) return; // give up; stop hammering the DB

    const attempt = orgRetryAttemptRef.current;
    // Exponential backoff capped at ORG_RETRY_CAP_MS, plus ±20% jitter so
    // clients recovering together don't retry in lockstep.
    const base = Math.min(ORG_RETRY_BASE_MS * 2 ** attempt, ORG_RETRY_CAP_MS);
    const jittered = base * (0.8 + Math.random() * 0.4);
    const t = setTimeout(() => {
      orgRetryAttemptRef.current = attempt + 1;
      void refreshOrganization();
      // Re-arm only via this stable counter — never via the changing `error`
      // object identity — so each failure schedules exactly one next retry.
      setOrgRetryTick((n) => n + 1);
    }, jittered);
    return () => clearTimeout(t);
    // orgRetryTick (stable counter) drives re-arming; `error` presence is read
    // but intentionally excluded from deps to avoid identity-churn re-fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgRetryTick, status, userId, profile?.role, refreshOrganization]);

  // Invalidate non-realtime TanStack Query cache on org switch to prevent cross-org data bleed.
  // Realtime-covered queries self-update; the rest need a forced eviction.
  useEffect(() => {
    const newOrgId = currentOrganization?.id ?? null;
    bindLinkedOrgDisplayViewerOrg(newOrgId);
    bindDriverPartyAvatarWorkspace(newOrgId);
    const prevOrgId = prevOrgIdRef.current;
    const qc = getQueryClient();
    if (prevOrgId !== null && prevOrgId !== newOrgId) {
      // Remove all cached entity lists — they're org-scoped and must not leak across orgs.
      // Realtime subscriptions will re-populate fresh data after the switch.
      qc.removeQueries({ predicate: (q) => {
        const key = q.queryKey;
        return Array.isArray(key) && key[0] === 'q';
      }});
    } else if (prevOrgId !== newOrgId) {
      // First org after cold start (prev === null) or logout (new === null):
      // drop any persisted/global linked-org-display map so it cannot be reused.
      purgeLinkedOrgDisplayQueries(qc);
    }
    prevOrgIdRef.current = newOrgId;
  }, [currentOrganization?.id]);

  // Stable context value: consumers only re-render when the fields they actually
  // use change. Without useMemo the object is recreated on every render of
  // OrganizationProvider (e.g. each isLoading flip triggers 20+ consumers).
  const value = useMemo(
    () => ({ currentOrganization, setCurrentOrganization, isLoading, error, refreshOrganization }),
    [currentOrganization, setCurrentOrganization, isLoading, error, refreshOrganization],
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}
