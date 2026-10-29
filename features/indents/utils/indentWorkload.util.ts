import {
  instantToKolkataDayIso,
  isoStringToKolkataDayIso,
} from "@/lib/dateRangePresets";

/**
 * Trips hub indent workload (agreed 2026-10-28). With no hub date pill it is the
 * current workload:
 *
 * - live: `broadcast` / `open`, pickup today (IST) or later, or no pickup date.
 * - needs_trip: `awarded`, pickup on/after today − 7 days (IST), or no pickup date.
 * Both exclude indents with a linked, non-deleted trip (`trips.indent_id`).
 *
 * With a hub date pill (V1.0.25), live becomes every `broadcast` / `open` indent
 * whose pickup day — or IST created day when pickup is empty — is in the range,
 * past pickups included (they show "PICKUP PASSED"); "All" = every `broadcast` /
 * `open` indent, any date. needs_trip never changes.
 *
 * `pending` / `draft` / `quoted` are deliberately not live until their business
 * meaning is confirmed. Linked-trip exclusion only sees trips the viewer can read
 * (RLS), so a user who cannot see a linked trip (e.g. warehouse-scoped Ground Ops)
 * may see that indent counted.
 */
export type IndentWorkloadKind = "live" | "needs_trip";

export const LIVE_INDENT_STATUSES = ["broadcast", "open"] as const;
export const NEEDS_TRIP_INDENT_STATUSES = ["awarded"] as const;
export const NEEDS_TRIP_WINDOW_DAYS = 7;

export type IndentWorkloadBounds = { today: string; needsTripFrom: string };
/** Hub date pill as inclusive IST days (`hubDateFilterIsoBounds`); "all" = any date. */
export type IndentWorkloadRange = { from: string; to: string } | "all";

function addIsoDays(dayIso: string, days: number): string {
  const [y, m, d] = dayIso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** IST calendar-day bounds (pickup_date is a plain `date`). */
export function indentWorkloadBounds(now: Date = new Date()): IndentWorkloadBounds | null {
  const today = instantToKolkataDayIso(now);
  if (!today) return null;
  return { today, needsTripFrom: addIsoDays(today, -NEEDS_TRIP_WINDOW_DAYS) };
}

function pickupDay(pickupDate: string | null | undefined): string | null {
  const day = (pickupDate ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** IST day a dated hub filter matches on: pickup date, else the created day. */
export function indentWorkloadRangeDay(indent: {
  pickup_date?: string | null;
  created_at?: string | null;
}): string | null {
  return pickupDay(indent.pickup_date) ?? isoStringToKolkataDayIso(indent.created_at);
}

/** Live indent whose pickup day is before today (IST). */
export function isIndentPickupPassed(
  indent: { status?: string | null; pickup_date?: string | null },
  now: Date = new Date(),
): boolean {
  const status = (indent.status ?? "").trim().toLowerCase();
  if (!(LIVE_INDENT_STATUSES as readonly string[]).includes(status)) return false;
  const day = pickupDay(indent.pickup_date);
  const today = instantToKolkataDayIso(now);
  return day != null && today != null && day < today;
}

/** Client mirror of the PostgREST filters below; null = not in either workload set. */
export function classifyIndentWorkload(
  indent: { status?: string | null; pickup_date?: string | null; created_at?: string | null },
  hasLinkedTrip: boolean,
  bounds: IndentWorkloadBounds,
  range?: IndentWorkloadRange | null,
): IndentWorkloadKind | null {
  if (hasLinkedTrip) return null;
  const status = (indent.status ?? "").trim().toLowerCase();
  const day = pickupDay(indent.pickup_date);
  if ((LIVE_INDENT_STATUSES as readonly string[]).includes(status)) {
    if (range === "all") return "live";
    if (range) {
      const rangeDay = indentWorkloadRangeDay(indent);
      return rangeDay != null && rangeDay >= range.from && rangeDay <= range.to ? "live" : null;
    }
    return day == null || day >= bounds.today ? "live" : null;
  }
  if ((NEEDS_TRIP_INDENT_STATUSES as readonly string[]).includes(status)) {
    return day == null || day >= bounds.needsTripFrom ? "needs_trip" : null;
  }
  return null;
}

/** Start of an IST calendar day as a quoted PostgREST timestamp value. */
function kolkataDayStart(dayIso: string): string {
  return `"${dayIso}T00:00:00+05:30"`;
}

/** PostgREST `or=` expression for one workload set (status + pickup window). */
export function indentWorkloadOrFilter(
  kind: IndentWorkloadKind,
  bounds: IndentWorkloadBounds,
  range?: IndentWorkloadRange | null,
): string {
  if (kind === "live" && range === "all") {
    return `status.in.(${LIVE_INDENT_STATUSES.join(",")})`;
  }
  if (kind === "live" && range && range !== "all") {
    const pickupIn = `and(pickup_date.gte.${range.from},pickup_date.lte.${range.to})`;
    const createdIn = `and(pickup_date.is.null,created_at.gte.${kolkataDayStart(
      range.from,
    )},created_at.lt.${kolkataDayStart(addIsoDays(range.to, 1))})`;
    return `and(status.in.(${LIVE_INDENT_STATUSES.join(",")}),or(${pickupIn},${createdIn}))`;
  }
  const statuses = kind === "live" ? LIVE_INDENT_STATUSES : NEEDS_TRIP_INDENT_STATUSES;
  const from = kind === "live" ? bounds.today : bounds.needsTripFrom;
  return `and(status.in.(${statuses.join(",")}),or(pickup_date.gte.${from},pickup_date.is.null))`;
}

/** Indent stage toolbar tag for a workload row: needs_trip rows are their own list. */
export function indentWorkloadStatusTag(
  kind: IndentWorkloadKind,
  bidCount: number,
): "pending" | "bids" | "awarded" {
  if (kind === "needs_trip") return "awarded";
  return bidCount > 0 ? "bids" : "pending";
}
