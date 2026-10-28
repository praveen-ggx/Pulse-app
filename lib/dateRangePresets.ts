/**
 * Shared date-window helpers for Treasury pills, trip lists, and load board.
 * Uses local calendar day boundaries (YYYY-MM-DD).
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Monday-start week containing `ref`. */
export function startOfIsoWeekMonday(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function endOfIsoWeekMonday(ref: Date): Date {
  const s = startOfIsoWeekMonday(ref);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return e;
}

export function startOfMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth(), 1);
}

export function endOfMonth(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
}

/** Local calendar YYYY-MM-DD from a date-only or ISO datetime string. */
export function isoStringToLocalDayIso(
  raw: string | null | undefined,
): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const dateOnly = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  if (s.length === 10) return dateOnly;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? toIsoDateLocal(new Date(ms)) : dateOnly;
}

/** Pickup day and created day (for hub presets — match if either falls in range). */
export function tripFilterDayCandidates(trip: {
  pickup_date?: string | null;
  created_at?: string | null;
}): string[] {
  const out: string[] = [];
  const pickup = isoStringToLocalDayIso(trip.pickup_date);
  if (pickup) out.push(pickup);
  const created = isoStringToLocalDayIso(trip.created_at);
  if (created && !out.includes(created)) out.push(created);
  return out;
}

/** Same timezone SQL uses: `(timezone('Asia/Kolkata', created_at))::date`. */
export const HUB_TRIP_DATE_TIME_ZONE = "Asia/Kolkata";

/** Date-only pickup matches the SQL `date` column; datetimes use Asia/Kolkata. */
export function isoStringToKolkataDayIso(
  raw: string | null | undefined,
): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const dateOnly = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  if (s.length === 10) return dateOnly;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return dateOnly;
  return instantToKolkataDayIso(new Date(ms)) ?? dateOnly;
}

export function instantToKolkataDayIso(now: Date): string | null {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: HUB_TRIP_DATE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return /^\d{4}-\d{2}-\d{2}$/.test(formatted) ? formatted : null;
}

function addIsoDays(dayIso: string, days: number): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function startOfMondayWeekIso(dayIso: string): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addIsoDays(dayIso, diff);
}

function endOfMondayWeekIso(dayIso: string): string {
  return addIsoDays(startOfMondayWeekIso(dayIso), 6);
}

function startOfMonthIso(dayIso: string): string {
  return `${dayIso.slice(0, 7)}-01`;
}

function endOfMonthIso(dayIso: string): string {
  const [y, m] = dayIso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${dayIso.slice(0, 7)}-${pad2(last)}`;
}

/** Hub list/RPC match days: pickup date or Asia/Kolkata created day. */
export function tripHubMatchDayCandidates(trip: {
  pickup_date?: string | null;
  created_at?: string | null;
}): string[] {
  const out: string[] = [];
  const pickupRaw = (trip.pickup_date ?? "").trim();
  const pickupDay = pickupRaw.length >= 10 && /^\d{4}-\d{2}-\d{2}$/.test(pickupRaw.slice(0, 10))
    ? pickupRaw.slice(0, 10)
    : isoStringToKolkataDayIso(trip.pickup_date);
  if (pickupDay) out.push(pickupDay);
  const created = isoStringToKolkataDayIso(trip.created_at);
  if (created && !out.includes(created)) out.push(created);
  return out;
}

/** Trip sort / filter day: scheduled pickup if set, else created (local calendar). */
export function tripDayIso(trip: {
  pickup_date?: string | null;
  created_at?: string | null;
}): string {
  return tripFilterDayCandidates(trip)[0] ?? "";
}

/** Sort key: noon local on filter day, else created_at instant. */
export function tripSortAnchorMs(trip: {
  pickup_date?: string | null;
  created_at?: string | null;
}): number {
  const day = tripDayIso(trip);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-").map(Number);
    const ms = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  const ms = new Date(trip.created_at ?? "").getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function compareTripsByScheduleDesc(
  a: { pickup_date?: string | null; created_at?: string | null },
  b: { pickup_date?: string | null; created_at?: string | null },
): number {
  return tripSortAnchorMs(b) - tripSortAnchorMs(a);
}

export function compareTripsByScheduleAsc(
  a: { pickup_date?: string | null; created_at?: string | null },
  b: { pickup_date?: string | null; created_at?: string | null },
): number {
  return tripSortAnchorMs(a) - tripSortAnchorMs(b);
}

export function indentDayIso(indent: {
  pickup_date?: string | null;
  created_at?: string | null;
}): string {
  const p = isoStringToLocalDayIso(indent.pickup_date);
  if (p) return p;
  return isoStringToLocalDayIso(indent.created_at) ?? "";
}

export type CalendarPeriodFilter =
  | "TODAY"
  | "YESTERDAY"
  | "WEEK"
  | "MONTH"
  | "RANGE"
  | "CUSTOM";

export type TripHubDateFilter =
  | "all"
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "this_month"
  | "custom";

export type CalendarPeriodFilterOptions = {
  customFrom?: string | null;
  customTo?: string | null;
};

export function dayIsoMatchesPeriod(
  dayIso: string,
  period: CalendarPeriodFilter,
  opts?: CalendarPeriodFilterOptions,
): boolean {
  if (!dayIso || dayIso.length < 10) return period === "RANGE";
  const d = dayIso.slice(0, 10);
  const now = new Date();
  const today = toIsoDateLocal(now);

  if (period === "RANGE") return true;

  if (period === "CUSTOM") {
    const from = (opts?.customFrom ?? "").slice(0, 10);
    const to = (opts?.customTo ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return true;
    }
    return d >= from && d <= to;
  }

  if (period === "TODAY") return d === today;

  if (period === "YESTERDAY") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return d === toIsoDateLocal(y);
  }

  if (period === "WEEK") {
    const s = toIsoDateLocal(startOfIsoWeekMonday(now));
    const e = toIsoDateLocal(endOfIsoWeekMonday(now));
    return d >= s && d <= e;
  }

  if (period === "MONTH") {
    const s = toIsoDateLocal(startOfMonth(now));
    const e = toIsoDateLocal(endOfMonth(now));
    return d >= s && d <= e;
  }

  return true;
}

/** Trips hub date pills — pickup date or Asia/Kolkata created day (not started_at). */
export function tripDayMatchesHubDateFilter(
  trip: {
    pickup_date?: string | null;
    created_at?: string | null;
  },
  preset: TripHubDateFilter,
  opts?: CalendarPeriodFilterOptions,
  now: Date = new Date(),
): boolean {
  if (preset === "all") return true;
  const days = tripHubMatchDayCandidates(trip);
  if (days.length === 0) return false;
  const bounds = hubDateFilterIsoBounds(preset, opts, now);
  if (!bounds) return false;
  return days.some((d) => d >= bounds.from && d <= bounds.to);
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Compact local-calendar label: `17 Aug 2026`. */
export function formatIsoDayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  const month = MONTH_SHORT[Number(m) - 1];
  if (!y || !month || !d) return iso;
  return `${Number(d)} ${month} ${y}`;
}

export function formatIsoDayRangeLabel(fromIso: string, toIso: string): string {
  if (fromIso === toIso) return formatIsoDayLabel(fromIso);
  return `${formatIsoDayLabel(fromIso)} – ${formatIsoDayLabel(toIso)}`;
}

/**
 * Inclusive Asia/Kolkata calendar bounds for a Trips hub date pill.
 * These are the same `p_from` / `p_to` values sent to get_trips_for_org.
 * Null = no server fetch. Finance/Treasury still uses getCalendarPeriodBounds (device local).
 */
export function hubDateFilterIsoBounds(
  preset: TripHubDateFilter,
  opts?: CalendarPeriodFilterOptions,
  now: Date = new Date(),
): { from: string; to: string } | null {
  if (preset === "all") return null;
  if (preset === "custom") {
    return getCalendarPeriodBounds("CUSTOM", opts, now);
  }
  const today = instantToKolkataDayIso(now);
  if (!today) return null;
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const iso = addIsoDays(today, -1);
    return { from: iso, to: iso };
  }
  if (preset === "tomorrow") {
    const iso = addIsoDays(today, 1);
    return { from: iso, to: iso };
  }
  if (preset === "this_week") {
    return { from: startOfMondayWeekIso(today), to: endOfMondayWeekIso(today) };
  }
  if (preset === "this_month") {
    return { from: startOfMonthIso(today), to: endOfMonthIso(today) };
  }
  return null;
}

/** Always both ends: `From 1 Aug 2026  To 31 Aug 2026`. */
export function formatFromToDateLabel(fromIso: string, toIso: string): string {
  return `From ${formatIsoDayLabel(fromIso)}  To ${formatIsoDayLabel(toIso)}`;
}

export function minMaxIsoDays(
  days: Array<string | null | undefined>,
): { from: string; to: string } | null {
  let from: string | null = null;
  let to: string | null = null;
  for (const raw of days) {
    const d = (raw ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!from || d < from) from = d;
    if (!to || d > to) to = d;
  }
  if (!from || !to) return null;
  return { from, to };
}

export function getCalendarPeriodBounds(
  period: CalendarPeriodFilter,
  opts?: CalendarPeriodFilterOptions,
  now: Date = new Date(),
): { from: string; to: string } | null {
  const today = toIsoDateLocal(now);
  if (period === "RANGE") return null;
  if (period === "TODAY") return { from: today, to: today };
  if (period === "YESTERDAY") {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const iso = toIsoDateLocal(y);
    return { from: iso, to: iso };
  }
  if (period === "WEEK") {
    return {
      from: toIsoDateLocal(startOfIsoWeekMonday(now)),
      to: toIsoDateLocal(endOfIsoWeekMonday(now)),
    };
  }
  if (period === "MONTH") {
    return {
      from: toIsoDateLocal(startOfMonth(now)),
      to: toIsoDateLocal(endOfMonth(now)),
    };
  }
  if (period === "CUSTOM") {
    const from = (opts?.customFrom ?? "").slice(0, 10);
    const to = (opts?.customTo ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return null;
    }
    return from <= to ? { from, to } : { from: to, to: from };
  }
  return null;
}

/** Human date range for report headers (tiny caption under the title). */
export function formatCalendarPeriodRangeLabel(
  period: CalendarPeriodFilter,
  opts?: CalendarPeriodFilterOptions,
  now: Date = new Date(),
): string | null {
  const bounds = getCalendarPeriodBounds(period, opts, now);
  if (!bounds) return null;
  return formatFromToDateLabel(bounds.from, bounds.to);
}
