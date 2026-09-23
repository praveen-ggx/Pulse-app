/**
 * ActiveWorkspaceContext — manages multi-workspace state.
 *
 * Loads all workspaces the authenticated user belongs to via
 * organization_members join, persists the active selection in AsyncStorage,
 * and keeps OrganizationContext in sync when the workspace switches.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabase';
import { isServiceUnavailableError } from '@/lib/supabaseHttp.util';
import { subscribeSharedPostgresChanges } from '@/lib/realtimeRegistry';
import {
  clearPlatformWorkspaceStore,
  syncPlatformWorkspaceFromActive,
} from '@/lib/platform-identity/workspace/workspaceContextStore';
import {
  domainsFromMember,
  platformRoleFromMember,
  type MemberDomainFlags,
  type PlatformTeamRole,
} from '@/features/organization/utils/teamInviteRoles.util';
import type { MemberSurfaceMap } from '@/lib/memberSurfaces';
import type { CurrentOrganization, OrgMemberRole } from '@/types/organization';
import type { ActiveWorkspaceState, Workspace, WorkspaceMember } from '@/types/workspace';

// ─────────────────────────────────────────────────────────────────────────────
// Storage key
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pulse:active_workspace_id';

/** Outer membership-error retry — same shape as OrganizationContext infra retry. */
const WORKSPACE_RETRY_MAX_ATTEMPTS = 6;
const WORKSPACE_RETRY_BASE_MS = 5_000;
const WORKSPACE_RETRY_CAP_MS = 60_000;

// ─────────────────────────────────────────────────────────────────────────────
// Internal DB row type
// ─────────────────────────────────────────────────────────────────────────────

interface WorkspaceMemberRow {
  role: WorkspaceMember['role'];
  status: string;
  permissions: Record<string, unknown> | null;
  organizations: {
    id: string;
    name: string | null;
    slug: string | null;
    logo_url: string | null;
    operating_model: string | null;
    address_line: string | null;
    locality: string | null;
    pincode: string | null;
    city: string | null;
    state: string | null;
    zone: string | null;
    business_pan: string | null;
    gstin: string | null;
    gst_not_applicable: boolean;
    cin: string | null;
    verification_status: string | null;
    verified_at: string | null;
    kyc_rejected_reason: string | null;
  } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapper
// ─────────────────────────────────────────────────────────────────────────────

function mapRowToWorkspace(
  row: WorkspaceMemberRow,
): {
  workspace: Workspace;
  role: WorkspaceMember['role'];
  platformRole: PlatformTeamRole | null;
  domains: MemberDomainFlags;
  surfaces: MemberSurfaceMap;
} | null {
  const o = row.organizations;
  if (!o) return null;

  const memberPick = {
    role: row.role as OrgMemberRole,
    permissions: row.permissions ?? {},
  };
  const platformRole = platformRoleFromMember(memberPick);
  const domains = domainsFromMember(memberPick);
  // Extract surfaces from permissions without org-caps filtering. Hydration is applied
  // later in useMemberAccess with actual org capabilities. Store the raw map from the DB.
  const raw = memberPick.permissions as unknown as { surfaces?: MemberSurfaceMap } | null | undefined;
  const surfaces = (raw?.surfaces && typeof raw.surfaces === "object") ? raw.surfaces : {};
  const operatingModel =
    o.operating_model === 'ASSET_BASED' ||
    o.operating_model === 'NON_ASSET' ||
    o.operating_model === 'HYBRID'
      ? (o.operating_model as Workspace['operating_model'])
      : 'HYBRID';

  const verificationStatus =
    o.verification_status === 'pending' ||
    o.verification_status === 'verified' ||
    o.verification_status === 'rejected'
      ? (o.verification_status as Workspace['verification_status'])
      : 'unverified';

  return {
    workspace: {
      id: o.id,
      name: o.name ?? '',
      slug: o.slug ?? null,
      logo_url: o.logo_url ?? null,
      operating_model: operatingModel,
      address_line: o.address_line ?? null,
      locality: o.locality ?? null,
      pincode: o.pincode ?? null,
      city: o.city ?? null,
      state: o.state ?? null,
      zone: o.zone ?? null,
      business_pan: o.business_pan ?? null,
      gstin: o.gstin ?? null,
      gst_not_applicable: o.gst_not_applicable === true,
      cin: o.cin ?? null,
      verification_status: verificationStatus,
      verified_at: o.verified_at ?? null,
      kyc_rejected_reason: o.kyc_rejected_reason ?? null,
    },
    role: row.role,
    platformRole,
    domains,
    surfaces,
  };
}

function workspaceToCurrentOrganization(
  workspace: Workspace,
): CurrentOrganization {
  return {
    id: workspace.id,
    name: workspace.name,
    logo_url: workspace.logo_url ?? null,
    operatingModel: workspace.operating_model,
    sourcingStrategy: 'MARKETPLACE_FIRST',
    marketplaceEnabled: true,
    capabilities: {
      canPostIndent: true,
      canBid: true,
      canManageAssets: true,
      canUseMarketplace: true,
    },
  };
}

const ACTIVE_MEMBERSHIP_SELECT = `
  role,
  status,
  permissions,
  organizations (
    id, name, slug, logo_url, operating_model,
    address_line, locality, pincode, city, state, zone,
    business_pan, gstin, gst_not_applicable, cin,
    verification_status, verified_at, kyc_rejected_reason
  )
`;

/**
 * AuthenticatedDataPlane only mounts after sessionAttached, so the JWT is
 * almost always present on the first getSession. A long poll here delayed
 * organization_members (and MemberDomainGate) by several seconds after login.
 */
const ACCESS_TOKEN_WAIT_ATTEMPTS = 3;
const EMPTY_MEMBERSHIP_RETRY_COLD = 3;
const EMPTY_MEMBERSHIP_RETRY_HYDRATED = 1;

async function waitForSupabaseAccessToken(
  signal: { cancelled: boolean },
  maxAttempts = ACCESS_TOKEN_WAIT_ATTEMPTS,
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal.cancelled) return null;
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token ?? null;
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
  }
  return null;
}

async function fetchActiveMembershipRows(
  uid: string,
): Promise<{
  rows: WorkspaceMemberRow[];
  error: Error | null;
  serviceUnavailable: boolean;
}> {
  const { data, error: dbError } = await Promise.race([
    supabase()
      .from('organization_members')
      .select(ACTIVE_MEMBERSHIP_SELECT)
      .eq('user_id', uid)
      .eq('status', 'active'),
    new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 15_000),
    ),
  ]);

  if (dbError) {
    // Classify before flattening: `new Error(message)` drops the PostgREST
    // `code`/`status` the caller needs to tell an outage from an empty result.
    return {
      rows: [],
      error: new Error(dbError.message),
      serviceUnavailable: isServiceUnavailableError(dbError),
    };
  }
  return {
    rows: (data ?? []) as unknown as WorkspaceMemberRow[],
    error: null,
    serviceUnavailable: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Context (global singleton — Metro can duplicate modules across async chunks)
// ─────────────────────────────────────────────────────────────────────────────

const PULSE_ACTIVE_WORKSPACE_CONTEXT_KEY = '__pulse_active_workspace_context__';

function getOrCreateActiveWorkspaceContext(): Context<ActiveWorkspaceState | undefined> {
  const g = globalThis as typeof globalThis & {
    [PULSE_ACTIVE_WORKSPACE_CONTEXT_KEY]?: Context<ActiveWorkspaceState | undefined>;
  };
  if (!g[PULSE_ACTIVE_WORKSPACE_CONTEXT_KEY]) {
    g[PULSE_ACTIVE_WORKSPACE_CONTEXT_KEY] = createContext<ActiveWorkspaceState | undefined>(
      undefined,
    );
  }
  return g[PULSE_ACTIVE_WORKSPACE_CONTEXT_KEY];
}

const ActiveWorkspaceContext = getOrCreateActiveWorkspaceContext();

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function ActiveWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, status: authStatus } = useAuth();
  const { setCurrentOrganization } = useOrganization();

  // Capture setter in a ref so loadWorkspaces never needs it as a dep.
  // useState setters are stable, but expressing it as a dep causes unnecessary
  // callback recreation if OrganizationProvider ever remounts.
  const setCurrentOrganizationRef = useRef(setCurrentOrganization);
  setCurrentOrganizationRef.current = setCurrentOrganization;

  // Stable primitive: only re-triggers the load effect when the uid string changes.
  const userId = user?.uid ?? null;

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [memberRole, setMemberRole] = useState<WorkspaceMember['role'] | null>(null);
  const [roleMap, setRoleMap] = useState<Map<string, WorkspaceMember['role']>>(new Map());
  const [memberPlatformRole, setMemberPlatformRole] = useState<PlatformTeamRole | null>(null);
  const [platformRoleMap, setPlatformRoleMap] = useState<Map<string, PlatformTeamRole | null>>(
    new Map(),
  );
  const [memberDomains, setMemberDomains] = useState<MemberDomainFlags | null>(null);
  const [domainsMap, setDomainsMap] = useState<Map<string, MemberDomainFlags>>(new Map());
  const [memberSurfaces, setMemberSurfaces] = useState<MemberSurfaceMap | null>(null);
  const [surfacesMap, setSurfacesMap] = useState<Map<string, MemberSurfaceMap>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [membershipResolved, setMembershipResolved] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sessionSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const userRef = useRef(user);
  userRef.current = user;
  /** Monotonic load id — ignore out-of-order completions from overlapping fetches. */
  const loadGenerationRef = useRef(0);
  const loadInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestLoadWorkspacesRef = useRef<() => Promise<void>>(async () => {});
  /** User id whose membership last resolved — skip loading flash on same-user refresh. */
  const hydratedForUidRef = useRef<string | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current != null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleOuterRetry = useCallback(() => {
    if (retryAttemptRef.current >= WORKSPACE_RETRY_MAX_ATTEMPTS) {
      return false;
    }
    clearRetryTimer();
    const attempt = retryAttemptRef.current;
    const base = Math.min(WORKSPACE_RETRY_BASE_MS * 2 ** attempt, WORKSPACE_RETRY_CAP_MS);
    const jittered = base * (0.8 + Math.random() * 0.4);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      retryAttemptRef.current = attempt + 1;
      void requestLoadWorkspacesRef.current();
    }, jittered);
    return true;
  }, [clearRetryTimer]);

  // ── Load workspaces from DB ─────────────────────────────────────────────────

  const runLoadWorkspaces = useCallback(
    async (signal: { cancelled: boolean }) => {
      const generation = ++loadGenerationRef.current;
      const stale = () => signal.cancelled || generation !== loadGenerationRef.current;
      const currentUser = userRef.current;

      if (!currentUser) {
        if (!stale()) {
          retryAttemptRef.current = 0;
          clearRetryTimer();
          setWorkspaces([]);
          setActiveWorkspace(null);
          setMemberRole(null);
          setRoleMap(new Map());
          setMemberPlatformRole(null);
          setPlatformRoleMap(new Map());
          setMemberDomains(null);
          setDomainsMap(new Map());
          setMemberSurfaces(null);
          setSurfacesMap(new Map());
          setCurrentOrganizationRef.current(null);
          clearPlatformWorkspaceStore();
          setMembershipResolved(true);
          setIsLoading(false);
          hydratedForUidRef.current = null;
        }
        return;
      }

      const alreadyHydrated = hydratedForUidRef.current === currentUser.uid;

      if (!stale()) {
        setError(null);
        // Realtime / coalesced refresh must not blank Network behind workspace.
        if (!alreadyHydrated) {
          setIsLoading(true);
          setMembershipResolved(false);
        }
      }

      let shouldFinishLoading = true;

      try {
        const accessToken = await waitForSupabaseAccessToken(signal);
        if (stale()) return;
        if (!accessToken) {
          shouldFinishLoading = false;
          if (!stale()) {
            if (pendingRefreshRef.current) {
              // Trailing coalesced load will run; do not start a second retry chain.
            } else if (!scheduleOuterRetry()) {
              shouldFinishLoading = true;
            }
          }
          return;
        }

        let {
          rows,
          error: fetchError,
          serviceUnavailable,
        } = await fetchActiveMembershipRows(currentUser.uid);
        if (stale()) return;

        if (fetchError) {
          // Keep membership unresolved so gates hold blank instead of flashing
          // "No workspace access" on a transient PostgREST/RLS failure.
          setError(fetchError);
          shouldFinishLoading = false;
          if (!stale()) {
            if (serviceUnavailable) {
              // PGRST002/PGRST003/5xx: the API layer is down, not slow to warm.
              // Retrying re-queues work onto an instance that is already failing
              // and is what turned one outage into a request storm. Surface once.
              shouldFinishLoading = true;
            } else if (pendingRefreshRef.current) {
              // Trailing coalesced load will run; do not start a second retry chain.
            } else if (!scheduleOuterRetry()) {
              shouldFinishLoading = true;
            }
          }
          return;
        }

        // Cold web boot: JWT can exist while PostgREST still returns 0 RLS rows.
        if (rows.length === 0) {
          const extraAttempts = alreadyHydrated
            ? EMPTY_MEMBERSHIP_RETRY_HYDRATED
            : EMPTY_MEMBERSHIP_RETRY_COLD;
          for (let attempt = 0; attempt < extraAttempts; attempt++) {
            await new Promise((resolve) =>
              setTimeout(resolve, 200 * (attempt + 1)),
            );
            if (stale()) return;
            ({ rows, error: fetchError, serviceUnavailable } =
              await fetchActiveMembershipRows(currentUser.uid));
            if (stale()) return;
            if (fetchError) {
              setError(fetchError);
              shouldFinishLoading = false;
              if (!stale()) {
                if (serviceUnavailable) {
                  shouldFinishLoading = true;
                } else if (pendingRefreshRef.current) {
                  // Trailing coalesced load will run; do not start a second retry chain.
                } else if (!scheduleOuterRetry()) {
                  shouldFinishLoading = true;
                }
              }
              return;
            }
            if (rows.length > 0) break;
          }
        }

        const mapped = rows
          .map(mapRowToWorkspace)
          .filter((r): r is NonNullable<ReturnType<typeof mapRowToWorkspace>> => r !== null);

        const loadedWorkspaces = mapped.map((m) => m.workspace);
        const newRoleMap = new Map<string, WorkspaceMember['role']>(
          mapped.map((m) => [m.workspace.id, m.role]),
        );
        const newPlatformRoleMap = new Map<string, PlatformTeamRole | null>(
          mapped.map((m) => [m.workspace.id, m.platformRole]),
        );
        const newDomainsMap = new Map<string, MemberDomainFlags>(
          mapped.map((m) => [m.workspace.id, m.domains]),
        );
        const newSurfacesMap = new Map<string, MemberSurfaceMap>(
          mapped.map((m) => [m.workspace.id, m.surfaces]),
        );

        if (stale()) return;

        retryAttemptRef.current = 0;
        clearRetryTimer();

        setWorkspaces(loadedWorkspaces);
        setRoleMap(newRoleMap);
        setPlatformRoleMap(newPlatformRoleMap);
        setDomainsMap(newDomainsMap);
        setSurfacesMap(newSurfacesMap);

        // Read persisted workspace ID, fall back to first
        let targetWorkspace: Workspace | null = loadedWorkspaces[0] ?? null;
        try {
          const persisted = await AsyncStorage.getItem(STORAGE_KEY);
          if (persisted) {
            const found = loadedWorkspaces.find((w) => w.id === persisted);
            if (found) targetWorkspace = found;
          }
        } catch {
          // AsyncStorage read failure — use first workspace
        }

        if (stale()) return;

        setActiveWorkspace(targetWorkspace);
        const role = targetWorkspace ? (newRoleMap.get(targetWorkspace.id) ?? null) : null;
        setMemberRole(role);
        setMemberPlatformRole(
          targetWorkspace ? (newPlatformRoleMap.get(targetWorkspace.id) ?? null) : null,
        );
        setMemberDomains(
          targetWorkspace ? (newDomainsMap.get(targetWorkspace.id) ?? null) : null,
        );
        setMemberSurfaces(
          targetWorkspace ? (newSurfacesMap.get(targetWorkspace.id) ?? null) : null,
        );
        setCurrentOrganizationRef.current(
          targetWorkspace ? workspaceToCurrentOrganization(targetWorkspace) : null,
        );
        if (targetWorkspace) {
          syncPlatformWorkspaceFromActive({
            personId: currentUser.uid,
            organizationId: targetWorkspace.id,
            role,
          });
        } else {
          clearPlatformWorkspaceStore();
        }
        setMembershipResolved(true);
        hydratedForUidRef.current = currentUser.uid;
      } catch (e) {
        if (!stale()) {
          setError(e instanceof Error ? e : new Error(String(e)));
          shouldFinishLoading = false;
          if (pendingRefreshRef.current) {
            // Trailing coalesced load will run; do not start a second retry chain.
          } else if (!scheduleOuterRetry()) {
            shouldFinishLoading = true;
          }
        }
      } finally {
        if (!stale() && shouldFinishLoading) {
          setIsLoading(false);
        }
      }
    },
    [clearRetryTimer, scheduleOuterRetry],
  );

  const requestLoadWorkspaces = useCallback((): Promise<void> => {
    if (loadInFlightRef.current && inFlightPromiseRef.current) {
      pendingRefreshRef.current = true;
      return inFlightPromiseRef.current;
    }
    // A live request (auth, Realtime, refresh) replaces a pending delayed retry
    // so we never run two independent outer-retry chains.
    clearRetryTimer();
    loadInFlightRef.current = true;
    const p = (async () => {
        try {
          do {
            pendingRefreshRef.current = false;
            await runLoadWorkspaces(sessionSignalRef.current);
            if (pendingRefreshRef.current) {
              // Coalesced Realtime/refresh during this run: one more load,
              // not a parallel membership fetch and not a second retry timer.
              clearRetryTimer();
            }
          } while (pendingRefreshRef.current);
      } finally {
        loadInFlightRef.current = false;
      }
    })();
    inFlightPromiseRef.current = p.finally(() => {
      if (inFlightPromiseRef.current === p) inFlightPromiseRef.current = null;
    });
    return p;
  }, [runLoadWorkspaces, clearRetryTimer]);
  requestLoadWorkspacesRef.current = requestLoadWorkspaces;

  // ── Re-run on user identity change only ────────────────────────────────────
  // Depend on userId (primitive string) not user (object) to prevent
  // re-firing when the auth object reference changes but the uid is the same.

  useEffect(() => {
    retryAttemptRef.current = 0;
    clearRetryTimer();
    pendingRefreshRef.current = false;

    if (authStatus !== 'authenticated' || !userId) {
      if (authStatus === 'unauthenticated' || authStatus === 'expired') {
        const signal = { cancelled: false };
        sessionSignalRef.current = signal;
        void requestLoadWorkspacesRef.current();
      }
      return;
    }
    const signal = { cancelled: false };
    sessionSignalRef.current = signal;
    void requestLoadWorkspacesRef.current();
    return () => {
      signal.cancelled = true;
    };
  }, [userId, authStatus, clearRetryTimer]);

  // ── Live permission/role updates ────────────────────────────────────────────
  // Revokes (e.g. removing "create indent") are enforced server-side via RLS
  // immediately, but the cached memberSurfaces here would otherwise only
  // refresh on next load/relogin — so the UI could show stale capabilities.
  // Subscribe to this user's own organization_members rows and re-fetch on change.
  useEffect(() => {
    if (authStatus === 'restoring' || !userId) return;
    return subscribeSharedPostgresChanges(
      `active-workspace-membership:${userId}`,
      [
        {
          event: '*',
          schema: 'public',
          table: 'organization_members',
          filter: `user_id=eq.${userId}`,
        },
      ],
      () => {
        void requestLoadWorkspacesRef.current();
      },
    );
  }, [userId, authStatus]);

  // ── Public actions ──────────────────────────────────────────────────────────

  const switchWorkspace = useCallback(
    async (workspaceId: string) => {
      const found = workspaces.find((w) => w.id === workspaceId);
      if (!found) return;
      const role = roleMap.get(workspaceId) ?? null;
      setActiveWorkspace(found);
      setMemberRole(role);
      setMemberPlatformRole(platformRoleMap.get(workspaceId) ?? null);
      setMemberDomains(domainsMap.get(workspaceId) ?? null);
      setMemberSurfaces(surfacesMap.get(workspaceId) ?? null);
      setCurrentOrganizationRef.current(workspaceToCurrentOrganization(found));
      syncPlatformWorkspaceFromActive({
        personId: userRef.current?.uid ?? null,
        organizationId: found.id,
        role,
      });
      try {
        await AsyncStorage.setItem(STORAGE_KEY, workspaceId);
      } catch {
        // Persist failure is non-fatal
      }
    },
    [workspaces, roleMap, platformRoleMap, domainsMap, surfacesMap],
  );

  const refresh = useCallback(async () => {
    await requestLoadWorkspaces();
  }, [requestLoadWorkspaces]);

  const canManageWorkspace =
    memberRole === 'owner' || memberRole === 'admin';

  const value = useMemo<ActiveWorkspaceState>(
    () => ({
      workspaces,
      activeWorkspace,
      memberRole,
      memberPlatformRole,
      memberDomains,
      memberSurfaces,
      isLoading,
      membershipResolved,
      error,
      switchWorkspace,
      refresh,
      canManageWorkspace,
    }),
    [
      workspaces,
      activeWorkspace,
      memberRole,
      memberPlatformRole,
      memberDomains,
      memberSurfaces,
      isLoading,
      membershipResolved,
      error,
      switchWorkspace,
      refresh,
      canManageWorkspace,
    ],
  );

  return (
    <ActiveWorkspaceContext.Provider value={value}>
      {children}
    </ActiveWorkspaceContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Must be used inside ActiveWorkspaceProvider.
 * Throws if the provider is missing — helps catch wiring mistakes early.
 */
export function useActiveWorkspace(): ActiveWorkspaceState {
  const ctx = useContext(ActiveWorkspaceContext);
  if (ctx === undefined) {
    throw new Error('useActiveWorkspace must be used within an ActiveWorkspaceProvider');
  }
  return ctx;
}

/**
 * Same as useActiveWorkspace but returns undefined when used outside the provider.
 * Use in components that may render in both provider and non-provider trees.
 */
export function useOptionalActiveWorkspace(): ActiveWorkspaceState | undefined {
  return useContext(ActiveWorkspaceContext);
}
