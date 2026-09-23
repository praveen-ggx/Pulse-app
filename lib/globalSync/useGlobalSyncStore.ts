/**
 * useGlobalSyncStore — Zustand store for the Global Sync framework.
 *
 * SLICE ARCHITECTURE:
 * ───────────────────
 * The store is organized into four logical slices that are independent
 * and future-proof. Adding a new feature (e.g. Live Map Tracking) only
 * requires:
 *   1. Adding a new slice of state fields here.
 *   2. Adding a new `case` in `routeRealtimeEvent` for the new table.
 *   3. Populating the slice from the `get_global_app_bootstrap` RPC result.
 *
 * Slices:
 *   activeTrips    — Lightweight metadata + last 5 events per active trip.
 *                    Full message history lives in useChatStore (separate).
 *   notifications  — Salary requests + B2B feed as unified notification rows.
 *   alerts         — Actionable operational alerts requiring user attention.
 *   network        — Organization link counts and partner org list.
 *
 * BOOTSTRAP MODEL (fetch once, sync forever):
 *   bootstrap(orgId) → get_global_app_bootstrap + registry finance slices in parallel.
 *   After that: only Realtime CDC events via routeRealtimeEvent() update state.
 *   Registry actions patch local slices first, then write DB (WhatsApp-style).
 *
 * REALTIME:
 *   The GlobalSyncContext mounts a single Supabase Realtime channel and routes
 *   all Postgres changes through routeRealtimeEvent(table, event, row, orgId).
 *   Zero extra DB calls on any event.
 */

import { markAppQueryGateBootstrapReady } from '@/lib/hooks/appQueryGateState';
import { isSupabaseCircuitOpen } from '@/lib/supabaseHttp.util';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { runSingleflight } from '@/lib/cache/singleflight';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/authEngine';
import { fetchInboundProtocolSnapshot } from '@/lib/globalSync/inboundProtocol.util';
import type { InboundPartnerDisplay } from '@/lib/globalSync/inboundProtocol.types';
import {
  REGISTRY_BOOTSTRAP_SALARY_LIMIT,
  REGISTRY_LOAD_MORE_SALARY_LIMIT,
} from '@/lib/globalSync/registryFeed.constants';
// Service modules are dynamic-imported inside actions only — keeps the
// finance / drivers / connections service graphs (and their transitive
// trips/chat dependencies) out of the startup chunk. Types are still pulled
// statically via `import type`, which is erased by babel-preset-expo and
// produces no runtime cost.
import type { SalaryRequestWithDriverRow } from '@/features/drivers/services/salaryRequests.service';
import type { ConnectionRequestRow } from '@/features/connections/services/connectionRequests.service';

const loadSalaryRequestsService = () =>
  import('@/features/drivers/services/salaryRequests.service');
const loadConnectionRequestsService = () =>
  import('@/features/connections/services/connectionRequests.service');
import type {
  ActiveTripLastKnownLocation,
  ActiveTripSummary,
  GlobalAlertRow,
  GlobalAppBootstrapPayload,
  GlobalNetworkStatus,
  GlobalNotificationRow,
  GlobalSyncBootstrapStatus,
} from './types';
import type { ClientOperationsRibbon } from './priorityEngine.util';
import {
  buildClientRibbonFromTripMessage,
  mergeClientRibbon,
  selectCurrentActiveAlert,
  selectOperationsShelfItems,
} from './priorityEngine.util';

/** Prevents duplicate concurrent get_global_app_bootstrap (Strict Mode / remounts). */
let globalBootstrapInFlightFor: string | null = null;
/** Incremented on every bootstrap/reset so a superseded in-flight write cannot land. */
let globalBootstrapEpoch = 0;

// ── Default values ────────────────────────────────────────────────────────────

const DEFAULT_NETWORK_STATUS: GlobalNetworkStatus = {
  total_links:    0,
  client_links:   0,
  supplier_links: 0,
  partner_orgs:   [],
};

// ── Store interface ───────────────────────────────────────────────────────────

interface GlobalSyncStore {
  // ── Bootstrap metadata ──────────────────────────────────────────────────
  bootstrapStatus:    GlobalSyncBootstrapStatus;
  bootstrappedOrgId:  string | null;
  bootstrapDuration:  number | null;  // ms — exposed to health check
  bootstrapError:     string | null;

  // ── Active trips slice ──────────────────────────────────────────────────
  activeTrips: ActiveTripSummary[];

  /** Latest high-priority B2B chat signal (fed from useChatStore Realtime — no SELECT). */
  clientOperationsRibbon: ClientOperationsRibbon | null;

  /** Local + server-synced dismissals for toasts / shelf rows (`GlobalOperationAlert.id`). */
  dismissedOperationKeys: Record<string, true>;
  /** Web shelf: last ledger hit per trip for glow animation. */
  ledgerPulseTripId: string | null;
  ledgerPulseAtMs: number;
  /** Mobile Dynamic Island: brief success pulse after chat "Add to ledger". */
  ledgerBookSuccessAtMs: number;

  // ── Notifications slice ─────────────────────────────────────────────────
  notificationRows:         GlobalNotificationRow[];
  notificationUnreadCount:  number;
  /** Registry finance cards (bootstrap + Realtime; avoids tab-scoped SELECT polls). */
  salaryRequestRows:        SalaryRequestWithDriverRow[];
  /** True when bootstrap / load-more returned a full salary page (more may exist). */
  salaryRequestsHasMore:    boolean;

  // ── Alerts slice ────────────────────────────────────────────────────────
  alertRows: GlobalAlertRow[];

  // ── Network slice ───────────────────────────────────────────────────────
  networkStatus: GlobalNetworkStatus;

  // ── Inbound Protocol (connection invites) ───────────────────────────────
  connectionRequestsReceived: ConnectionRequestRow[];
  connectionRequestsSent:     ConnectionRequestRow[];
  partnerDisplayByOrgId:      Record<string, InboundPartnerDisplay>;
  partnerAvatarUriByOrgId:    Record<string, string | null>;
  partnerOwnerIdByOrgId:      Record<string, string>;

  // ── Root actions ─────────────────────────────────────────────────────────
  bootstrap: (orgId: string, options?: { force?: boolean }) => Promise<void>;
  reset:     () => void;

  /** Patch salary + unified notification slices locally (WhatsApp-style, before DB). */
  patchSalaryRequestStatusLocal: (requestId: string, status: string) => void;
  /** Optimistic reject → DB update → Realtime confirms (no list re-fetch). */
  rejectSalaryRequest: (requestId: string, orgId: string) => Promise<{ error: Error | null }>;
  /** Append next salary page for registry “load more” (bounded SELECT). */
  loadMoreSalaryRequests: (orgId: string) => Promise<{ error: Error | null }>;
  /** Re-hydrate connection invites + partner avatars (2 RPCs + 1 batch). */
  refreshInboundProtocol: (orgId: string) => Promise<void>;

  // ── Unified Realtime router ──────────────────────────────────────────────
  // Single entry point for all Postgres CDC events. New features add a new
  // case here — zero changes needed in the context or subscription layer.
  routeRealtimeEvent: (
    table:  string,
    event:  'INSERT' | 'UPDATE' | 'DELETE',
    row:    Record<string, unknown>,
    orgId:  string,
  ) => void;

  // ── Notifications actions ─────────────────────────────────────────────────
  markNotificationRead:    (id: string) => void;
  markAllNotificationsRead: () => void;
  /**
   * When a B2B `trip_messages` row carries `metadata.global_bell` or
   * `metadata.event_payload.global_bell`, upsert a lightweight bell row and bump
   * unread by 1 (no DB `count(*)` — derived from local rows + delta).
   */
  ingestB2BMessageForBell: (row: {
    id: string;
    content?: string | null;
    created_at?: string | null;
    metadata?: unknown;
  }) => void;

  /** Merge latest location from a chat row into `activeTrips` (no DB / no trigger). */
  applyActiveTripLocationFromChat: (
    tripId: string,
    payload: ActiveTripLastKnownLocation,
  ) => void;

  /** Latest hubometer / heartbeat row from chat `location_data` (3h adaptive ping path). */
  applyActiveTripHeartbeatFromChat: (
    tripId: string,
    payload: { odometer_km: number; recorded_at: string },
  ) => void;

  /** Bump ranking signal when any B2B chat row arrives for this trip (in-memory only). */
  touchActiveTripClientActivity: (tripId: string, atIso?: string) => void;

  /** Priority engine: merge chat row into the operations ribbon when it outranks prior. */
  ingestTripMessageForOperationsIsland: (tripId: string, row: Record<string, unknown>) => void;

  /** Mobile: Dynamic Island success pulse after atomic "Add to ledger" from chat. */
  pulseLedgerBookSuccess: () => void;

  /** Selector helper (reads only in-memory slices). */
  getCurrentActiveOperationAlert: () => ReturnType<typeof selectCurrentActiveAlert>;
  getOperationsShelfItems: () => ReturnType<typeof selectOperationsShelfItems>;

  dismissOperationAlert: (alertId: string) => void;
  /** Persists dismissal for all devices (Realtime fan-out). */
  acknowledgeGlobalAlert: (alertKey: string, orgId: string) => Promise<{ error: Error | null }>;

  // ── Alerts actions ────────────────────────────────────────────────────────
  dismissAlert: (id: string) => void;
}

// ── Synthesis helpers (pure functions) ───────────────────────────────────────

function salaryRowToNotification(row: Record<string, unknown>): GlobalNotificationRow {
  return {
    id:          `salary_${String(row.id)}`,
    source:      'salary_request',
    source_id:   String(row.id),
    title:       'Salary Request',
    subtitle:    typeof row.request_type === 'string' ? row.request_type : null,
    amount_meta: row.amount != null ? Number(row.amount) : null,
    is_read:     String(row.status ?? 'pending') !== 'pending',
    created_at:  typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function salaryRowToAlert(row: Record<string, unknown>): GlobalAlertRow {
  const amount = row.amount != null ? Number(row.amount) : null;
  return {
    id:          `salary_${String(row.id)}`,
    source:      'salary_request',
    source_id:   String(row.id),
    alert_type:  'salary_request_pending',
    severity:    'warning',
    title:       'Pending Salary Request',
    body:        amount != null ? `Amount: ₹${amount.toLocaleString('en-IN')}` : 'Awaiting approval',
    amount,
    driver_id:   typeof row.driver_id === 'string' ? row.driver_id : null,
    created_at:  typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function countUnread(rows: GlobalNotificationRow[]): number {
  return rows.reduce((n, r) => n + (r.is_read ? 0 : 1), 0);
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex(x => x.id === item.id);
  if (idx === -1) return [item, ...list];
  const next = [...list];
  next[idx] = item;
  return next;
}

function mergeSalaryRowIntoCache(
  list: SalaryRequestWithDriverRow[],
  row: Record<string, unknown>,
): SalaryRequestWithDriverRow[] {
  const id = String(row.id ?? '');
  if (!id) return list;
  const existing = list.find((r) => r.id === id);
  const tripIds = Array.isArray(row.trip_ids)
    ? (row.trip_ids as string[])
    : (existing?.trip_ids ?? []);
  const merged: SalaryRequestWithDriverRow = {
    id,
    organization_id: String(row.organization_id ?? existing?.organization_id ?? ''),
    driver_id: String(row.driver_id ?? existing?.driver_id ?? ''),
    request_type: String(row.request_type ?? existing?.request_type ?? 'advance'),
    amount:
      row.amount != null
        ? Number(row.amount)
        : (existing?.amount ?? 0),
    currency: String(row.currency ?? existing?.currency ?? 'INR'),
    status: String(row.status ?? existing?.status ?? 'pending'),
    note:
      row.note === undefined
        ? (existing?.note ?? null)
        : row.note == null
          ? null
          : String(row.note),
    trip_ids: tripIds,
    cash_entry_id:
      row.cash_entry_id === undefined
        ? (existing?.cash_entry_id ?? null)
        : row.cash_entry_id == null
          ? null
          : String(row.cash_entry_id),
    salary_month:
      row.salary_month === undefined
        ? (existing?.salary_month ?? null)
        : row.salary_month == null
          ? null
          : String(row.salary_month),
    created_at: String(row.created_at ?? existing?.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? existing?.updated_at ?? new Date().toISOString()),
    created_by:
      row.created_by === undefined
        ? (existing?.created_by ?? null)
        : row.created_by == null
          ? null
          : String(row.created_by),
    drivers: existing?.drivers ?? null,
  };
  return upsertById(list, merged);
}

function applySalaryStatusToSlices(
  state: Pick<
    GlobalSyncStore,
    'salaryRequestRows' | 'notificationRows' | 'alertRows'
  >,
  requestId: string,
  status: string,
): Pick<
  GlobalSyncStore,
  'salaryRequestRows' | 'notificationRows' | 'notificationUnreadCount' | 'alertRows'
> {
  const salaryRequestRows = state.salaryRequestRows.map((r) =>
    r.id === requestId ? { ...r, status } : r,
  );
  const notifId = `salary_${requestId}`;
  const isPending = status === 'pending';
  const notificationRows = state.notificationRows.map((n) =>
    n.id === notifId ? { ...n, is_read: !isPending } : n,
  );
  const alertId = `salary_${requestId}`;
  const alertRows = isPending
    ? state.alertRows
    : state.alertRows.filter((a) => a.id !== alertId);
  return {
    salaryRequestRows,
    notificationRows,
    notificationUnreadCount: countUnread(notificationRows),
    alertRows,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGlobalSyncStore = create<GlobalSyncStore>()(
  subscribeWithSelector((set, get) => ({
    // ── Initial state ───────────────────────────────────────────────────────
    bootstrapStatus:          'idle',
    bootstrappedOrgId:        null,
    bootstrapDuration:        null,
    bootstrapError:           null,
    activeTrips:              [],
    clientOperationsRibbon:   null,
    dismissedOperationKeys:     {},
    ledgerPulseTripId:        null,
    ledgerPulseAtMs:          0,
    ledgerBookSuccessAtMs:    0,
    notificationRows:         [],
    notificationUnreadCount:  0,
    salaryRequestRows:        [],
    salaryRequestsHasMore:    false,
    connectionRequestsReceived: [],
    connectionRequestsSent:     [],
    partnerDisplayByOrgId:      {},
    partnerAvatarUriByOrgId:    {},
    partnerOwnerIdByOrgId:      {},
    alertRows:                [],
    networkStatus:            { ...DEFAULT_NETWORK_STATUS },

    refreshInboundProtocol: async (orgId) => {
      if (isSupabaseCircuitOpen()) return;
      return runSingleflight(`globalSync.refreshInboundProtocol:${orgId}`, async () => {
        try {
          const { data: { session } } = await supabase().auth.getSession();
          if (!session) return;
          const { getConnectionRequestsReceived, getConnectionRequestsSent } =
            await loadConnectionRequestsService();
          const [receivedRes, sentRes] = await withTimeout(
            (signal) =>
              Promise.all([
                getConnectionRequestsReceived(orgId, { signal }),
                getConnectionRequestsSent(orgId, { signal }),
              ]),
            15_000,
          );
          const received = receivedRes.error ? [] : receivedRes.requests;
          const sent = sentRes.error ? [] : sentRes.requests;
          const { partnerDisplayByOrgId, partnerAvatarUriByOrgId, partnerOwnerIdByOrgId } =
            await withTimeout(
              () => fetchInboundProtocolSnapshot(orgId, received, sent),
              15_000,
            );
          set({
            connectionRequestsReceived: received,
            connectionRequestsSent: sent,
            partnerDisplayByOrgId,
            partnerAvatarUriByOrgId,
            partnerOwnerIdByOrgId,
          });
        } catch (err) {
          if (__DEV__) {
            console.warn("[globalSync] refreshInboundProtocol failed", err);
          }
        }
      });
    },

    // ── bootstrap ────────────────────────────────────────────────────────────
    bootstrap: async (orgId, options) => {
      const force = options?.force === true;
      if (isSupabaseCircuitOpen()) {
        if (get().bootstrapStatus !== 'ready') {
          set({ bootstrapStatus: 'error', bootstrapError: 'origin_down' });
          markAppQueryGateBootstrapReady();
        }
        return;
      }
      if (
        !force &&
        get().bootstrappedOrgId === orgId &&
        get().bootstrapStatus === 'ready'
      ) {
        return;
      }
      // Set the in-flight key synchronously — before any await — so StrictMode
      // remounts and parallel callers cannot both pass the guard.
      if (!force && globalBootstrapInFlightFor === orgId) {
        return;
      }
      if (!force) {
        globalBootstrapInFlightFor = orgId;
      }
      const bootstrapEpoch = ++globalBootstrapEpoch;

      // Abort if there is no valid session. Bootstrap fans out to several calls;
      // without this guard a token gap (SIGNED_OUT → SIGNED_IN, or a failed
      // refresh while React context still holds the previous orgId) turns into
      // a burst of 401s.
      // Leaves any already-hydrated slices intact and stays retryable —
      // bootstrappedOrgId is not set, so the next call proceeds.
      const { data: { session } } = await supabase().auth.getSession();
      if (!session) {
        if (globalBootstrapInFlightFor === orgId) {
          globalBootstrapInFlightFor = null;
        }
        if (get().bootstrapStatus !== 'ready') {
          set({ bootstrapStatus: 'idle', bootstrapError: 'no_session' });
        }
        return;
      }

      if (force) {
        globalBootstrapInFlightFor = orgId;
      }
      set({ bootstrapStatus: 'loading', bootstrapError: null });
      const t0 = Date.now();

      try {
        // Lazy-load the three feature services in parallel so the startup
        // chunk never sees them. Bootstrap fires after sign-in so this adds
        // negligible latency (chunk is fetched alongside the RPC).
        const [
          { getSalaryRequestsByOrganization },
          { getConnectionRequestsReceived, getConnectionRequestsSent },
        ] = await Promise.all([
          loadSalaryRequestsService(),
          loadConnectionRequestsService(),
        ]);

        const [bootstrapRes, salaryRes, receivedRes, sentRes] =
          await withTimeout(
            (signal) =>
              Promise.all([
                supabase().rpc(
                  'get_global_app_bootstrap',
                  { p_org_id: orgId },
                  { abortSignal: signal },
                ),
                getSalaryRequestsByOrganization(orgId, {
                  limit: REGISTRY_BOOTSTRAP_SALARY_LIMIT,
                  offset: 0,
                }),
                getConnectionRequestsReceived(orgId, { signal }),
                getConnectionRequestsSent(orgId, { signal }),
              ]),
            20_000,
          );

        if (bootstrapRes.error) throw bootstrapRes.error;

        const payload = bootstrapRes.data as GlobalAppBootstrapPayload;
        const received = receivedRes.error ? [] : receivedRes.requests;
        const sent = sentRes.error ? [] : sentRes.requests;
        const { partnerDisplayByOrgId, partnerAvatarUriByOrgId, partnerOwnerIdByOrgId } =
          await withTimeout(
            () => fetchInboundProtocolSnapshot(orgId, received, sent),
            15_000,
          );
        const duration = Date.now() - t0;

        const notifRows: GlobalNotificationRow[] = Array.isArray(
          payload?.notifications?.rows,
        )
          ? payload.notifications.rows
          : [];

        if (bootstrapEpoch !== globalBootstrapEpoch) {
          return;
        }

        set({
          bootstrapStatus:         'ready',
          bootstrappedOrgId:       orgId,
          bootstrapDuration:       duration,
          bootstrapError:          null,
          activeTrips:             Array.isArray(payload?.active_trips)   ? payload.active_trips   : [],
          clientOperationsRibbon:  null,
          dismissedOperationKeys:  {},
          ledgerPulseTripId:       null,
          ledgerPulseAtMs:         0,
          ledgerBookSuccessAtMs:   0,
          notificationRows:        notifRows,
          notificationUnreadCount: payload?.notifications?.unread_count ?? countUnread(notifRows),
          salaryRequestRows:       salaryRes.error ? [] : salaryRes.requests,
          salaryRequestsHasMore:   !salaryRes.error &&
            salaryRes.requests.length >= REGISTRY_BOOTSTRAP_SALARY_LIMIT,
          connectionRequestsReceived: received,
          connectionRequestsSent:     sent,
          partnerDisplayByOrgId,
          partnerAvatarUriByOrgId,
          partnerOwnerIdByOrgId,
          alertRows:               Array.isArray(payload?.global_alerts)  ? payload.global_alerts  : [],
          networkStatus:           payload?.network_status ?? { ...DEFAULT_NETWORK_STATUS },
        });
        markAppQueryGateBootstrapReady();
      } catch (err) {
        if (bootstrapEpoch !== globalBootstrapEpoch) {
          return;
        }
        set({
          bootstrapStatus:   'error',
          bootstrapDuration: Date.now() - t0,
          bootstrapError:    err instanceof Error ? err.message : String(err),
        });
        markAppQueryGateBootstrapReady();
      } finally {
        if (globalBootstrapInFlightFor === orgId) {
          globalBootstrapInFlightFor = null;
        }
      }
    },

    // ── reset ─────────────────────────────────────────────────────────────────
    reset: () => {
      globalBootstrapInFlightFor = null;
      globalBootstrapEpoch += 1;
      set({
        bootstrapStatus:         'idle',
        bootstrappedOrgId:       null,
        bootstrapDuration:       null,
        bootstrapError:          null,
        activeTrips:             [],
        clientOperationsRibbon:  null,
        dismissedOperationKeys:  {},
        ledgerPulseTripId:       null,
        ledgerPulseAtMs:         0,
        ledgerBookSuccessAtMs:   0,
        notificationRows:        [],
        notificationUnreadCount: 0,
        salaryRequestRows:       [],
        salaryRequestsHasMore:   false,
        connectionRequestsReceived: [],
        connectionRequestsSent:     [],
        partnerDisplayByOrgId:      {},
        partnerAvatarUriByOrgId:    {},
        partnerOwnerIdByOrgId:      {},
        alertRows:               [],
        networkStatus:           { ...DEFAULT_NETWORK_STATUS },
      });
    },

    patchSalaryRequestStatusLocal: (requestId, status) => {
      set((s) => applySalaryStatusToSlices(s, requestId, status));
    },

    rejectSalaryRequest: async (requestId, orgId) => {
      get().patchSalaryRequestStatusLocal(requestId, 'rejected');
      const { updateSalaryRequestStatus } = await loadSalaryRequestsService();
      const { error } = await updateSalaryRequestStatus(requestId, 'rejected');
      if (error) {
        void get().bootstrap(orgId, { force: true });
        return { error };
      }
      return { error: null };
    },

    loadMoreSalaryRequests: async (orgId) => {
      const offset = get().salaryRequestRows.length;
      const { getSalaryRequestsByOrganization } = await loadSalaryRequestsService();
      const { error, requests } = await getSalaryRequestsByOrganization(orgId, {
        limit: REGISTRY_LOAD_MORE_SALARY_LIMIT,
        offset,
      });
      if (error) return { error };

      set((s) => {
        const merged = [...s.salaryRequestRows];
        for (const row of requests) {
          if (!merged.some((r) => r.id === row.id)) merged.push(row);
        }
        return {
          salaryRequestRows: merged,
          salaryRequestsHasMore: requests.length >= REGISTRY_LOAD_MORE_SALARY_LIMIT,
        };
      });
      return { error: null };
    },

    // ── routeRealtimeEvent ────────────────────────────────────────────────────
    routeRealtimeEvent: (table, event, row, orgId) => {
      const state = get();

      // ── driver_salary_requests ────────────────────────────────────────────
      if (table === 'driver_salary_requests') {
        const notif   = salaryRowToNotification(row);
        const isPending = String(row.status ?? 'pending') === 'pending';

        const salaryCache = mergeSalaryRowIntoCache(state.salaryRequestRows, row);

        if (event === 'INSERT') {
          const nextNotifs = upsertById(state.notificationRows, notif);
          const nextAlerts = isPending
            ? upsertById(state.alertRows, salaryRowToAlert(row))
            : state.alertRows;
          set({
            notificationRows:        nextNotifs,
            notificationUnreadCount: countUnread(nextNotifs),
            alertRows:               nextAlerts,
            salaryRequestRows:       salaryCache,
          });
        } else if (event === 'UPDATE') {
          const nextNotifs = upsertById(state.notificationRows, notif);
          const alertId    = `salary_${String(row.id)}`;
          const nextAlerts = isPending
            ? upsertById(state.alertRows, salaryRowToAlert(row))
            : state.alertRows.filter(a => a.id !== alertId);
          set({
            notificationRows:        nextNotifs,
            notificationUnreadCount: countUnread(nextNotifs),
            alertRows:               nextAlerts,
            salaryRequestRows:       salaryCache,
          });
        }
        return;
      }

      // ── b2b_operations_dismissals — cross-device toast / shelf dismiss ─────
      if (table === 'b2b_operations_dismissals' && (event === 'INSERT' || event === 'UPDATE')) {
        const oid = String(row.organization_id ?? '');
        if (oid !== orgId) return;
        const key = String(row.alert_key ?? '').trim();
        if (!key) return;
        set((s) => ({
          dismissedOperationKeys: { ...s.dismissedOperationKeys, [key]: true },
        }));
        return;
      }

      // ── trips (fleet health: driver / last_location_at) — no chat coupling ─
      if (table === 'trips' && event === 'UPDATE') {
        const tid = typeof row.id === 'string' ? row.id : '';
        if (!tid) return;
        set((s) => ({
          activeTrips: s.activeTrips.map((t) => {
            if (t.trip_id !== tid) return t;
            const next: ActiveTripSummary = { ...t };
            if (typeof row.status === 'string' && row.status.trim()) next.status = row.status;
            if ('driver_id' in row) {
              next.driver_id =
                row.driver_id === null || typeof row.driver_id === 'string' ? (row.driver_id as string | null) : t.driver_id;
            }
            if ('last_location_at' in row) {
              next.last_location_at =
                typeof row.last_location_at === 'string' && row.last_location_at.trim()
                  ? row.last_location_at
                  : row.last_location_at === null
                    ? null
                    : t.last_location_at;
            }
            return next;
          }),
        }));
        return;
      }

      // ── organization_links ────────────────────────────────────────────────
      if (table === 'organization_links') {
        const linkType  = String(row.link_type ?? '') as 'client' | 'supplier';
        const orgId_    = typeof row.linked_org_id === 'string' ? row.linked_org_id : '';
        const orgName   = typeof row.org_name === 'string' ? row.org_name : '';
        const ns        = state.networkStatus;

        if (event === 'INSERT') {
          const partnerAlreadyExists = ns.partner_orgs.some(p => p.org_id === orgId_);
          const nextPartners = partnerAlreadyExists
            ? ns.partner_orgs
            : [...ns.partner_orgs, { org_id: orgId_, org_name: orgName, link_type: linkType }];
          set({
            networkStatus: {
              total_links:    ns.total_links + (partnerAlreadyExists ? 0 : 1),
              client_links:   linkType === 'client'   ? ns.client_links   + 1 : ns.client_links,
              supplier_links: linkType === 'supplier' ? ns.supplier_links + 1 : ns.supplier_links,
              partner_orgs:   nextPartners,
            },
          });
        } else if (event === 'DELETE') {
          const nextPartners = ns.partner_orgs.filter(p => p.org_id !== orgId_);
          const removed      = ns.partner_orgs.length - nextPartners.length;
          set({
            networkStatus: {
              total_links:    Math.max(0, ns.total_links    - removed),
              client_links:   Math.max(0, ns.client_links   - (linkType === 'client'   ? 1 : 0)),
              supplier_links: Math.max(0, ns.supplier_links - (linkType === 'supplier' ? 1 : 0)),
              partner_orgs:   nextPartners,
            },
          });
        }
        return;
      }

      // ── future slices ─────────────────────────────────────────────────────
      // Add new cases here. Example: Live Map Tracking.
      // case 'driver_locations': routeTrackingEvent(row); return;
    },

    // ── markNotificationRead ──────────────────────────────────────────────────
    markNotificationRead: (id) => {
      const rows = get().notificationRows.map(n =>
        n.id === id ? { ...n, is_read: true } : n,
      );
      set({ notificationRows: rows, notificationUnreadCount: countUnread(rows) });
    },

    // ── markAllNotificationsRead ──────────────────────────────────────────────
    markAllNotificationsRead: () => {
      const rows = get().notificationRows.map(n => ({ ...n, is_read: true }));
      set({ notificationRows: rows, notificationUnreadCount: 0 });
    },

    applyActiveTripLocationFromChat: (tripId, payload) => {
      set((s) => ({
        activeTrips: s.activeTrips.map((t) =>
          t.trip_id === tripId ? { ...t, last_known_location: { ...payload } } : t,
        ),
      }));
    },

    applyActiveTripHeartbeatFromChat: (tripId, payload) => {
      set((s) => ({
        activeTrips: s.activeTrips.map((t) =>
          t.trip_id === tripId
            ? {
                ...t,
                last_heartbeat_odometer_km: payload.odometer_km,
                last_heartbeat_recorded_at: payload.recorded_at,
              }
            : t,
        ),
      }));
    },

    touchActiveTripClientActivity: (tripId, atIso) => {
      const at = atIso?.trim() || new Date().toISOString();
      set((s) => ({
        activeTrips: s.activeTrips.map((t) =>
          t.trip_id === tripId ? { ...t, client_activity_at: at } : t,
        ),
      }));
    },

    ingestTripMessageForOperationsIsland: (tripId, row) => {
      const mt = String(row.message_type ?? '');
      if (
        mt !== 'ledger_event' &&
        mt !== 'ledger' &&
        mt !== 'payment' &&
        mt !== 'ledger_update' &&
        mt !== 'system_log' &&
        mt !== 'location_log' &&
        mt !== 'document_upload' &&
        mt !== 'assignment_update'
      ) {
        return;
      }
      const trip = get().activeTrips.find((t) => t.trip_id === tripId);
      const label = trip?.display_trip_id?.trim() || trip?.trip_number || null;
      const ribbon = buildClientRibbonFromTripMessage(tripId, label, row);
      if (!ribbon) return;
      const ledgerHit =
        mt === 'ledger_event' || mt === 'ledger' || mt === 'payment' || mt === 'ledger_update';
      set((s) => {
        const nextRibbon = mergeClientRibbon(s.clientOperationsRibbon, ribbon);
        return {
          clientOperationsRibbon: nextRibbon,
          ledgerPulseTripId:    ledgerHit ? tripId : s.ledgerPulseTripId,
          ledgerPulseAtMs:      ledgerHit ? Date.now() : s.ledgerPulseAtMs,
        };
      });
    },

    pulseLedgerBookSuccess: () => {
      set({ ledgerBookSuccessAtMs: Date.now() });
    },

    getCurrentActiveOperationAlert: () =>
      selectCurrentActiveAlert({
        activeTrips:              get().activeTrips,
        alertRows:                get().alertRows,
        notificationRows:         get().notificationRows,
        clientOperationsRibbon:   get().clientOperationsRibbon,
        dismissedOperationKeys:   get().dismissedOperationKeys,
      }),

    getOperationsShelfItems: () =>
      selectOperationsShelfItems({
        activeTrips:              get().activeTrips,
        alertRows:                get().alertRows,
        notificationRows:         get().notificationRows,
        clientOperationsRibbon:   get().clientOperationsRibbon,
        dismissedOperationKeys:   get().dismissedOperationKeys,
      }),

    dismissOperationAlert: (alertId) =>
      set((s) => ({
        dismissedOperationKeys: { ...s.dismissedOperationKeys, [alertId]: true },
      })),

    acknowledgeGlobalAlert: async (alertKey, orgId) => {
      try {
        const { error } = await supabase().rpc('acknowledge_global_alert', {
          p_alert_key: alertKey,
          p_org_id:    orgId,
        });
        if (error) return { error: new Error(error.message) };
        set((s) => ({
          dismissedOperationKeys: { ...s.dismissedOperationKeys, [alertKey]: true },
        }));
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },

    ingestB2BMessageForBell: (row) => {
      const meta = row.metadata as Record<string, unknown> | null | undefined;
      const ep =
        meta?.event_payload && typeof meta.event_payload === 'object' && !Array.isArray(meta.event_payload)
          ? (meta.event_payload as Record<string, unknown>)
          : null;
      const ring = meta?.global_bell === true || ep?.global_bell === true;
      if (!ring) return;

      const id = `b2b_${row.id}`;
      const titleRaw = ep?.notification_title ?? meta?.notification_title;
      const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : 'Trip update';
      const subtitle =
        typeof row.content === 'string' && row.content.trim() ? row.content.trim().slice(0, 160) : null;
      const amountRaw = ep?.amount ?? meta?.amount;
      const amount_meta =
        typeof amountRaw === 'number'
          ? amountRaw
          : amountRaw != null && !Number.isNaN(Number(amountRaw))
            ? Number(amountRaw)
            : null;

      const item: GlobalNotificationRow = {
        id,
        source:      'b2b_feed',
        source_id:   row.id,
        title,
        subtitle,
        amount_meta,
        is_read:     false,
        created_at:  typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      };

      set((s) => {
        const existed = s.notificationRows.some((r) => r.id === id);
        const nextNotifs = upsertById(s.notificationRows, item);
        return {
          notificationRows:        nextNotifs,
          notificationUnreadCount: existed ? s.notificationUnreadCount : s.notificationUnreadCount + 1,
        };
      });
    },

    // ── dismissAlert (client-side only — optimistic) ──────────────────────────
    dismissAlert: (id) =>
      set({
        alertRows: get().alertRows.map(a =>
          a.id === id ? { ...a, dismissed: true } : a,
        ),
      }),
  })),
);
