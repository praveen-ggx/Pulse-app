import {
    getIndentDisplayNumber,
    type IndentRow,
} from "@/features/indents/services/indents.service";
import {
    indentCancelReasonLabel,
    indentFailedCategory,
    isIndentFailedStatus,
    type IndentCancelReasonId,
} from "@/features/indents/utils/indentCancelReason.util";
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

/**
 * Failed chip list. `mergeIndentsByLatestUpdate` may include live rows from
 * the capped org list; keep cancelled/expired only so Pending/Awarded stay out.
 */
export function filterFailedHubIndents(
  indents: readonly IndentRow[],
  opts: {
    orgId: string;
    dateRangeFilter: TripHubDateFilter;
    customFrom?: string | null;
    customTo?: string | null;
    searchQuery: string;
    indentIdsWithTrip?: ReadonlySet<string>;
  },
): IndentRow[] {
  return indents.filter((indent) => {
    if ((indent.organization_id ?? "") !== opts.orgId) return false;
    if (!isIndentFailedStatus(indent.status)) return false;
    if (opts.indentIdsWithTrip?.has(indent.id)) return false;
    return (
      indentMatchesHubDateFilter(indent, opts.dateRangeFilter, {
        customFrom: opts.customFrom,
        customTo: opts.customTo,
      }) && indentMatchesHubSearch(indent, opts.searchQuery)
    );
  });
}

const EMPTY_FAILED_REASON_COUNTS: Record<IndentCancelReasonId, number> = {
  client_cancelled: 0,
  indent_expired: 0,
  no_rates_available: 0,
  wrong_entry: 0,
};

/** Same rows as the Failed chip / list — not the org-wide RPC totals. */
export function countFailedHubReasons(
  indents: readonly IndentRow[],
): Record<IndentCancelReasonId, number> {
  const counts = { ...EMPTY_FAILED_REASON_COUNTS };
  for (const indent of indents) {
    const reason = indentFailedCategory(indent);
    if (reason && reason in counts) {
      counts[reason as IndentCancelReasonId] += 1;
    }
  }
  return counts;
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

/** Active ALL toolbar: trip rows only. Indent cards stay on the Indent tile. */
export function tripsHubAllToolbarCountLabel(opts: {
  visibleTripCount: number;
  dateFilteredTripCount: number;
  visibleIndentCount?: number;
  dateFilteredIndentCount?: number;
}): string {
  return `Showing ${opts.visibleTripCount} of ${opts.dateFilteredTripCount}`;
}

/** One row per indent id across several lists; the most recently updated copy wins. */
export function mergeIndentsByLatestUpdate(...lists: readonly (readonly IndentRow[])[]): IndentRow[] {
  const byId = new Map<string, IndentRow>();
  for (const list of lists) {
    for (const indent of list) {
      const prev = byId.get(indent.id);
      if (!prev || String(indent.updated_at ?? "") >= String(prev.updated_at ?? "")) {
        byId.set(indent.id, indent);
      }
    }
  }
  return [...byId.values()];
}
