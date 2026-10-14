import {
  getIndentDisplayNumber,
  type IndentRow,
} from "@/features/indents/services/indents.service";
import { indentCancelReasonLabel } from "@/features/indents/utils/indentCancelReason.util";
import {
  tripDayMatchesHubDateFilter,
  type TripHubDateFilter,
} from "@/lib/dateRangePresets";

/**
 * Client-side Trips toolbar matching for INDENT cards.
 * Uses the already-loaded indent row — no extra fetch.
 */
export function indentMatchesHubSearch(
  indent: IndentRow,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    getIndentDisplayNumber(indent),
    indent.client_name,
    indent.pickup_area,
    indent.drop_location,
    indent.indent_number,
    indent.indent_code,
    indent.indent_operational_code,
    indent.material,
    indent.vehicle_type,
    indent.creator_organization_name,
    indentCancelReasonLabel(indent.cancel_reason),
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
  return hay.includes(q);
}

export function indentMatchesHubDateFilter(
  indent: IndentRow,
  preset: TripHubDateFilter,
  opts?: { customFrom?: string | null; customTo?: string | null },
): boolean {
  return tripDayMatchesHubDateFilter(
    { pickup_date: indent.pickup_date, created_at: indent.created_at },
    preset,
    opts,
  );
}

export function filterIndentsForTripsToolbar(
  indents: readonly IndentRow[],
  opts: {
    dateRangeFilter: TripHubDateFilter;
    customFrom?: string | null;
    customTo?: string | null;
    searchQuery: string;
  },
): IndentRow[] {
  return indents.filter(
    (indent) =>
      indentMatchesHubDateFilter(indent, opts.dateRangeFilter, {
        customFrom: opts.customFrom,
        customTo: opts.customTo,
      }) && indentMatchesHubSearch(indent, opts.searchQuery),
  );
}

/**
 * Append Trips code-search hits that are not already in the loaded list.
 * Loaded rows win, so a hit already inside the finite window is not duplicated.
 * Returns `loaded` unchanged when there is nothing new to add.
 */
export function mergeIndentSearchHits<T extends { id: string }>(
  loaded: readonly T[],
  hits: readonly T[],
): T[] {
  if (hits.length === 0) return loaded as T[];
  const seen = new Set(loaded.map((row) => row.id));
  const extra: T[] = [];
  for (const row of hits) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    extra.push(row);
  }
  if (extra.length === 0) return loaded as T[];
  return [...loaded, ...extra];
}

/** Active ALL toolbar: unallocated indent cards + trip rows (client-side). */
export function tripsHubAllToolbarCountLabel(opts: {
  visibleIndentCount: number;
  dateFilteredIndentCount: number;
  visibleTripCount: number;
  dateFilteredTripCount: number;
}): string {
  const shown = opts.visibleIndentCount + opts.visibleTripCount;
  const total = opts.dateFilteredIndentCount + opts.dateFilteredTripCount;
  return `Showing ${shown} of ${total}`;
}
