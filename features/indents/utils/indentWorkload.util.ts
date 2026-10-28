import { instantToKolkataDayIso } from "@/lib/dateRangePresets";

/**
 * Trips hub indent workload (agreed 2026-10-28). Current workload only: the hub
 * date pills never change these sets.
 *
 * - live: `broadcast` / `open`, pickup today (IST) or later, or no pickup date.
 * - needs_trip: `awarded`, pickup on/after today − 7 days (IST), or no pickup date.
 * Both exclude indents with a linked, non-deleted trip (`trips.indent_id`).
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

/** Client mirror of the PostgREST filters below; null = not in either workload set. */
export function classifyIndentWorkload(
  indent: { status?: string | null; pickup_date?: string | null },
  hasLinkedTrip: boolean,
  bounds: IndentWorkloadBounds,
): IndentWorkloadKind | null {
  if (hasLinkedTrip) return null;
  const status = (indent.status ?? "").trim().toLowerCase();
  const day = pickupDay(indent.pickup_date);
  if ((LIVE_INDENT_STATUSES as readonly string[]).includes(status)) {
    return day == null || day >= bounds.today ? "live" : null;
  }
  if ((NEEDS_TRIP_INDENT_STATUSES as readonly string[]).includes(status)) {
    return day == null || day >= bounds.needsTripFrom ? "needs_trip" : null;
  }
  return null;
}

/** PostgREST `or=` expression for one workload set (status + pickup window). */
export function indentWorkloadOrFilter(
  kind: IndentWorkloadKind,
  bounds: IndentWorkloadBounds,
): string {
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
