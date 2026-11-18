/**
 * Inclusion window for the Business Sales Report only.
 *
 * The date that controls filtering is the indent's own `created_at`, as an
 * Asia/Kolkata calendar day. Pickup, awarded, assigned, and cancel dates are
 * not part of this decision. Those values are displayed from the indent or
 * its award record and must not be copied from another trip or from the
 * selected range.
 *
 * The Trips hub keeps its own pickup-or-created matcher. Do not reuse it here.
 */

import { isoStringToKolkataDayIso } from "@/lib/dateRangePresets";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type SalesReportDayBounds = { from: string; to: string };

export function salesReportDayBounds(
  from: string | null | undefined,
  to: string | null | undefined,
): SalesReportDayBounds | null {
  const start = (from ?? "").slice(0, 10);
  const end = (to ?? "").slice(0, 10);
  if (!DAY_RE.test(start) || !DAY_RE.test(end)) return null;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

function addIsoDays(dayIso: string, days: number): string {
  const [year, month, day] = dayIso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Inclusive start and exclusive end, Asia/Kolkata, for timestamp filters. */
export function salesReportKolkataInstantBounds(
  bounds: SalesReportDayBounds,
): { start: string; end: string } {
  return {
    start: `${bounds.from}T00:00:00+05:30`,
    end: `${addIsoDays(bounds.to, 1)}T00:00:00+05:30`,
  };
}

/** Quoted Asia/Kolkata midnight for a PostgREST timestamp filter. */
export function kolkataDayStartLiteral(dayIso: string): string {
  return `"${dayIso}T00:00:00+05:30"`;
}

/**
 * PostgREST filter. Inclusion is the indent creation day only.
 * Pickup and close dates stay off this filter so an older indent is not
 * pulled in by a later pickup, award, or trip.
 */
export function salesReportIndentOrFilter(bounds: SalesReportDayBounds): string {
  const start = kolkataDayStartLiteral(bounds.from);
  const end = kolkataDayStartLiteral(addIsoDays(bounds.to, 1));
  return `and(created_at.gte.${start},created_at.lt.${end})`;
}

export function salesReportDayInWindow(
  raw: string | null | undefined,
  bounds: SalesReportDayBounds,
): boolean {
  const day = isoStringToKolkataDayIso(raw);
  return Boolean(day && day >= bounds.from && day <= bounds.to);
}

/** True only when this indent's own creation day is inside the selected range. */
export function salesReportIndentInWindow(
  indent: {
    pickup_date?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    status?: string | null;
  },
  bounds: SalesReportDayBounds,
): boolean {
  return salesReportDayInWindow(indent.created_at, bounds);
}
