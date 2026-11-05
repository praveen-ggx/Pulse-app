import type {
  ActiveTripRecentEvent,
  ActiveTripSummary,
  GlobalAlertRow,
  GlobalNotificationRow,
} from './types';

/** Visual band for the Operations Island (drives Moti + haptics). */
export type OperationsIslandVisualKind = 'neutral' | 'warning' | 'critical' | 'success';

/** Cockpit routing / copy — shared mobile + web. */
export type OperationCategory =
  | 'vehicle_idle'
  | 'payment_received'
  | 'payment_paid'
  | 'unassigned_trip'
  | 'late_log'
  | 'salary'
  | 'other';

/** Single ranked item for the island / selectors. */
export interface GlobalOperationAlert {
  id: string;
  priority_weight: number;
  kind: OperationsIslandVisualKind;
  category: OperationCategory;
  trip_id: string | null;
  trip_number: string | null;
  title: string;
  subtitle: string | null;
  amount: number | null;
  created_at: string;
  /** Trace source for debugging — not shown in UI. */
  source:
    | 'global_alert'
    | 'global_notification'
    | 'trip_recent_event'
    | 'trip_synthetic_unassigned'
    | 'trip_synthetic_idle'
    | 'trip_synthetic_late_log'
    | 'client_ribbon';
}

/** Last high-signal row from B2B chat path (no extra SELECT). */
export interface ClientOperationsRibbon {
  id: string;
  priority_weight: number;
  kind: OperationsIslandVisualKind;
  category: OperationCategory;
  trip_id: string;
  trip_number: string | null;
  title: string;
  subtitle: string | null;
  amount: number | null;
  created_at: string;
}

// ── Weight constants (align with default trip_messages.priority_weight = 40) ─

export const PRIORITY_WEIGHT_DEFAULT_MESSAGE = 40;
export const PRIORITY_WEIGHT_IDLE_WARNING = 72;
export const PRIORITY_WEIGHT_LEDGER_SUCCESS = 88;
export const PRIORITY_WEIGHT_B2B_FEED = 52;
export const PRIORITY_WEIGHT_SALARY_WARNING = 96;
export const PRIORITY_WEIGHT_DISPUTE_CRITICAL = 122;
export const PRIORITY_WEIGHT_UNASSIGNED_CRITICAL = 118;
/** Driver on-road but mission `system_log` heartbeat is stale. */
export const PRIORITY_WEIGHT_LATE_LOG = 66;
/** Long-haul schedule slip (`metadata.long_haul_late` / `event_tag` LATE) — tops ops shelf + island. */
export const PRIORITY_WEIGHT_LONG_HAUL_LATE = 135;

const FOUR_H_MS = 4 * 60 * 60 * 1000;
const FIVE_H_MS = 5 * 60 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

const ACTIVE_MOVEMENT_STATUSES = new Set([
  'in_transit',
  'picked_up',
  'in_progress',
  'transit',
  'at_drop',
  'loading',
  'unloading',
  'at_pickup',
  'assigned',
  'active',
]);

function parseTs(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** DB / Realtime `trip_messages.priority_weight` when present; else heuristic from type. */
export function assignPriorityWeightFromTripMessage(
  messageType: string | undefined,
  explicit: unknown,
  meta: Record<string, unknown> | null | undefined,
): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  if (typeof explicit === 'string' && explicit.trim() && Number.isFinite(Number(explicit))) {
    return Number(explicit);
  }
  const mw = meta?.priority_weight;
  if (typeof mw === 'number' && Number.isFinite(mw)) return mw;
  if (typeof mw === 'string' && mw.trim() && Number.isFinite(Number(mw))) return Number(mw);
  const ep0 =
    meta?.event_payload && typeof meta.event_payload === 'object' && !Array.isArray(meta.event_payload)
      ? (meta.event_payload as Record<string, unknown>)
      : null;
  if (meta?.long_haul_late === true || String(ep0?.event_tag ?? '').toUpperCase() === 'LATE') {
    return PRIORITY_WEIGHT_LONG_HAUL_LATE;
  }
  const mt = String(messageType ?? '').toLowerCase();
  if (mt === 'ledger_event' || mt === 'ledger' || mt === 'payment') return PRIORITY_WEIGHT_LEDGER_SUCCESS;
  if (mt === 'system_log') return 55;
  if (mt === 'dispute' || mt === 'challenge') return 100;
  if (mt === 'document_upload' || mt === 'assignment_update') return 48;
  return PRIORITY_WEIGHT_DEFAULT_MESSAGE;
}

function ledgerAmountFromMetadata(meta: unknown): number | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  const ep =
    m.event_payload && typeof m.event_payload === 'object' && !Array.isArray(m.event_payload)
      ? (m.event_payload as Record<string, unknown>)
      : null;
  const raw = m.amount ?? ep?.amount;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function buildClientRibbonFromTripMessage(
  tripId: string,
  tripNumber: string | null,
  row: {
    id?: string;
    message_type?: string;
    content?: string | null;
    created_at?: string;
    metadata?: unknown;
    priority_weight?: unknown;
    event_payload?: unknown;
  },
): ClientOperationsRibbon | null {
  if (!row.id || !row.message_type) return null;
  const meta =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  const epRibbon =
    meta?.event_payload && typeof meta.event_payload === 'object' && !Array.isArray(meta.event_payload)
      ? (meta.event_payload as Record<string, unknown>)
      : null;
  const isLongHaulLate =
    meta?.long_haul_late === true || String(epRibbon?.event_tag ?? '').toUpperCase() === 'LATE';
  const w = assignPriorityWeightFromTripMessage(row.message_type, row.priority_weight ?? meta?.priority_weight, meta);
  const mt = String(row.message_type);
  const amount = ledgerAmountFromMetadata(meta);
  const isLedger = mt === 'ledger_event' || mt === 'ledger' || mt === 'payment';
  const kind: OperationsIslandVisualKind = isLedger
    ? 'success'
    : isLongHaulLate
      ? 'critical'
      : w >= 90
        ? 'warning'
        : 'neutral';
  const category: OperationCategory = isLedger
    ? 'payment_received'
    : mt === 'system_log'
      ? 'late_log'
      : 'other';
  const title = isLedger
    ? 'Ledger update'
    : isLongHaulLate
      ? 'LATE — schedule'
      : mt === 'system_log'
        ? 'Trip log'
        : 'Trip update';
  const c = typeof row.content === 'string' ? row.content.trim() : '';
  const subtitle = c ? c.slice(0, 140) : null;
  return {
    id: `ribbon:${row.id}`,
    priority_weight: w,
    kind,
    category,
    trip_id: tripId,
    trip_number: tripNumber,
    title,
    subtitle,
    amount,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function lastLocationMs(trip: ActiveTripSummary): number {
  const a = parseTs(trip.last_location_at);
  const b = parseTs(trip.last_known_location?.recorded_at);
  return Math.max(a, b);
}

function syntheticUnassigned(trip: ActiveTripSummary, now: number): GlobalOperationAlert | null {
  if (trip.driver_id) return null;
  const st = String(trip.status ?? '').toLowerCase();
  if (st === 'completed' || st === 'cancelled' || st === 'delivered' || st === 'done') return null;
  const age = now - parseTs(trip.created_at);
  if (age < THIRTY_MIN_MS) return null;
  return {
    id: `syn:unassigned:${trip.trip_id}`,
    priority_weight: PRIORITY_WEIGHT_UNASSIGNED_CRITICAL,
    kind: 'critical',
    category: 'unassigned_trip',
    trip_id: trip.trip_id,
    trip_number: trip.display_trip_id ?? trip.trip_number,
    title: 'Driver unassigned',
    subtitle: `${trip.trip_number} · Assign a driver to continue`,
    amount: null,
    created_at: new Date(now).toISOString(),
    source: 'trip_synthetic_unassigned',
  };
}

function syntheticIdle(trip: ActiveTripSummary, now: number): GlobalOperationAlert | null {
  if (!trip.driver_id) return null;
  const st = String(trip.status ?? '').toLowerCase();
  if (!ACTIVE_MOVEMENT_STATUSES.has(st)) return null;
  const locMs = lastLocationMs(trip);
  if (!locMs) return null;
  if (now - locMs < FOUR_H_MS) return null;
  return {
    id: `syn:idle:${trip.trip_id}`,
    priority_weight: PRIORITY_WEIGHT_IDLE_WARNING,
    kind: 'warning',
    category: 'vehicle_idle',
    trip_id: trip.trip_id,
    trip_number: trip.display_trip_id ?? trip.trip_number,
    title: 'Vehicle idle',
    subtitle: 'No location ping in 4+ hours',
    amount: null,
    // Event time = last GPS ping (the reason this fired). Non-zero via the `!locMs` guard above.
    created_at: new Date(locMs).toISOString(),
    source: 'trip_synthetic_idle',
  };
}

function lastSystemLogMs(events: ActiveTripRecentEvent[]): number {
  let best = 0;
  for (const e of events) {
    if (e.message_type !== 'system_log') continue;
    const t = parseTs(e.created_at);
    if (t > best) best = t;
  }
  return best;
}

/** Stale B2B `system_log` heartbeat while vehicle is on active duty (distinct from GPS idle). */
function syntheticLateLog(trip: ActiveTripSummary, now: number): GlobalOperationAlert | null {
  if (!trip.driver_id) return null;
  const st = String(trip.status ?? '').toLowerCase();
  if (!ACTIVE_MOVEMENT_STATUSES.has(st)) return null;
  const events = trip.recent_events ?? [];
  const lastLog = lastSystemLogMs(events);
  if (lastLog > 0 && now - lastLog < FIVE_H_MS) return null;
  if (lastLog === 0 && now - parseTs(trip.created_at) < THIRTY_MIN_MS) return null;
  if (lastLocationMs(trip) && now - lastLocationMs(trip) < FOUR_H_MS) {
    // GPS is fresh — do not stack late-log on top of healthy pings.
    return null;
  }
  return {
    id: `syn:latelog:${trip.trip_id}`,
    priority_weight: PRIORITY_WEIGHT_LATE_LOG,
    kind: 'warning',
    category: 'late_log',
    trip_id: trip.trip_id,
    trip_number: trip.display_trip_id ?? trip.trip_number,
    title: 'Mission log overdue',
    subtitle: 'No driver system_log in 5+ hours',
    amount: null,
    // Event time = last driver system_log; when none was ever sent (lastLog === 0) the
    // overdue window starts at trip creation, which the guard above already uses.
    created_at: lastLog > 0 ? new Date(lastLog).toISOString() : trip.created_at,
    source: 'trip_synthetic_late_log',
  };
}

function alertToSignal(a: GlobalAlertRow): GlobalOperationAlert {
  return {
    id: `alert:${a.id}`,
    priority_weight: a.dismissed ? -1 : PRIORITY_WEIGHT_SALARY_WARNING,
    kind: 'warning',
    category: 'salary',
    trip_id: null,
    trip_number: null,
    title: a.title,
    subtitle: a.body,
    amount: a.amount,
    created_at: a.created_at,
    source: 'global_alert',
  };
}

function notifToSignal(n: GlobalNotificationRow): GlobalOperationAlert | null {
  if (n.is_read) return null;
  if (n.source === 'salary_request') {
    return {
      id: `notif:${n.id}`,
      priority_weight: PRIORITY_WEIGHT_SALARY_WARNING - 4,
      kind: 'warning',
      category: 'salary',
      trip_id: null,
      trip_number: null,
      title: n.title,
      subtitle: n.subtitle,
      amount: n.amount_meta,
      created_at: n.created_at,
      source: 'global_notification',
    };
  }
  if (n.source === 'b2b_feed') {
    return {
      id: `notif:${n.id}`,
      priority_weight: PRIORITY_WEIGHT_B2B_FEED,
      kind: 'neutral',
      category: 'other',
      trip_id: null,
      trip_number: null,
      title: n.title,
      subtitle: n.subtitle,
      amount: n.amount_meta,
      created_at: n.created_at,
      source: 'global_notification',
    };
  }
  return null;
}

const LEDGER_MESSAGE_TYPES = new Set([
  'ledger_event',
  'ledger',
  'payment',
  'ledger_update',
]);

export function isLedgerMessageType(messageType: string): boolean {
  return LEDGER_MESSAGE_TYPES.has(messageType);
}

/** Every ledger card on the trip, not the last-12 island slice. */
export function ledgerAlertsFromTripEvents(
  trips: ActiveTripSummary[],
): GlobalOperationAlert[] {
  const out: GlobalOperationAlert[] = [];
  for (const trip of trips) {
    for (const ev of trip.recent_events ?? []) {
      if (!isLedgerMessageType(String(ev.message_type))) continue;
      out.push(recentEventToSignal(trip, ev));
    }
  }
  return out;
}

function recentEventToSignal(trip: ActiveTripSummary, ev: ActiveTripRecentEvent): GlobalOperationAlert {
  const meta =
    ev.metadata && typeof ev.metadata === 'object' && !Array.isArray(ev.metadata)
      ? (ev.metadata as Record<string, unknown>)
      : null;
  const explicit = (ev as { priority_weight?: unknown }).priority_weight ?? meta?.priority_weight;
  const w = assignPriorityWeightFromTripMessage(ev.message_type, explicit, meta);
  const mt = String(ev.message_type);
  const amount = ledgerAmountFromMetadata(meta);
  const isLedger = isLedgerMessageType(mt);
  const kind: OperationsIslandVisualKind = isLedger
    ? 'success'
    : w >= PRIORITY_WEIGHT_DISPUTE_CRITICAL - 20
      ? 'critical'
      : w >= PRIORITY_WEIGHT_IDLE_WARNING
        ? 'warning'
        : 'neutral';
  const category: OperationCategory = isLedger
    ? 'payment_received'
    : mt === 'system_log'
      ? 'late_log'
      : 'other';
  return {
    id: `ev:${trip.trip_id}:${ev.id}`,
    priority_weight: w,
    kind,
    category,
    trip_id: trip.trip_id,
    trip_number: trip.display_trip_id ?? trip.trip_number,
    title: isLedger ? 'Payment activity' : ev.message_type.replace(/_/g, ' '),
    subtitle: ev.content?.slice(0, 140) ?? null,
    amount,
    created_at: ev.created_at,
    source: 'trip_recent_event',
  };
}

export interface OperationsPrioritySnapshot {
  activeTrips: ActiveTripSummary[];
  alertRows: GlobalAlertRow[];
  notificationRows: GlobalNotificationRow[];
  clientOperationsRibbon: ClientOperationsRibbon | null;
  /** Client + server (Realtime) dismissed keys — `GlobalOperationAlert.id`. */
  dismissedOperationKeys?: Record<string, true> | null;
}

/** Flatten all weighted candidates (bootstrap trips + alerts + client ribbon). */
export function collectAllOperationSignals(snapshot: OperationsPrioritySnapshot): GlobalOperationAlert[] {
  const now = Date.now();
  const out: GlobalOperationAlert[] = [];
  const dismissed = snapshot.dismissedOperationKeys ?? null;

  for (const a of snapshot.alertRows) {
    if (!a.dismissed) out.push(alertToSignal(a));
  }
  for (const n of snapshot.notificationRows) {
    const s = notifToSignal(n);
    if (s) out.push(s);
  }

  for (const trip of snapshot.activeTrips) {
    const u = syntheticUnassigned(trip, now);
    if (u) out.push(u);
    const i = syntheticIdle(trip, now);
    if (i) out.push(i);
    else {
      const l = syntheticLateLog(trip, now);
      if (l) out.push(l);
    }
    const events = trip.recent_events ?? [];
    const tail = events.slice(-12);
    for (const ev of tail) {
      out.push(recentEventToSignal(trip, ev));
    }
  }

  const ribbon = snapshot.clientOperationsRibbon;
  if (ribbon) {
    out.push({
      id: ribbon.id,
      priority_weight: ribbon.priority_weight,
      kind: ribbon.kind,
      category: ribbon.category,
      trip_id: ribbon.trip_id,
      trip_number: ribbon.trip_number,
      title: ribbon.title,
      subtitle: ribbon.subtitle,
      amount: ribbon.amount,
      created_at: ribbon.created_at,
      source: 'client_ribbon',
    });
  }

  return out.filter(
    (x) =>
      x.priority_weight > 0 &&
      !(dismissed && dismissed[x.id]),
  );
}

/** Highest-weight operational item (Operations Island). */
export function selectCurrentActiveAlert(snapshot: OperationsPrioritySnapshot): GlobalOperationAlert | null {
  const all = collectAllOperationSignals(snapshot);
  if (!all.length) return null;
  all.sort((a, b) => b.priority_weight - a.priority_weight || parseTs(b.created_at) - parseTs(a.created_at));
  return all[0] ?? null;
}

/**
 * Desktop “Live Operations” shelf: dedupe by trip+category, highest weight wins, newest first.
 */
/** First undismissed `vehicle_idle` (for persistent web toast). */
export function selectVehicleIdleToast(snapshot: OperationsPrioritySnapshot): GlobalOperationAlert | null {
  const all = collectAllOperationSignals(snapshot);
  return all.find((x) => x.category === 'vehicle_idle') ?? null;
}

export function selectOperationsShelfItems(
  snapshot: OperationsPrioritySnapshot,
  maxItems = 24,
): GlobalOperationAlert[] {
  const all = collectAllOperationSignals(snapshot);
  const best = new Map<string, GlobalOperationAlert>();
  for (const item of all) {
    const tripKey = item.trip_id ?? 'fleet';
    const key = `${item.category}:${tripKey}`;
    const prev = best.get(key);
    if (!prev || item.priority_weight > prev.priority_weight) best.set(key, item);
    else if (item.priority_weight === prev.priority_weight && parseTs(item.created_at) > parseTs(prev.created_at)) {
      best.set(key, item);
    }
  }
  const list = [...best.values()];
  list.sort((a, b) => b.priority_weight - a.priority_weight || parseTs(b.created_at) - parseTs(a.created_at));
  return list.slice(0, maxItems);
}

/** Replace ribbon only if the new message outranks the current ribbon (patch model). */
export function mergeClientRibbon(
  prev: ClientOperationsRibbon | null,
  next: ClientOperationsRibbon | null,
): ClientOperationsRibbon | null {
  if (!next) return prev;
  if (!prev) return next;
  if (next.priority_weight > prev.priority_weight) return next;
  if (next.priority_weight < prev.priority_weight) return prev;
  return parseTs(next.created_at) >= parseTs(prev.created_at) ? next : prev;
}
