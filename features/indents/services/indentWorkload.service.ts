import {
  normalizeIndentRow,
  type IndentRow,
} from "@/features/indents/services/indents.service";
import {
  indentWorkloadOrFilter,
  type IndentWorkloadBounds,
  type IndentWorkloadKind,
  type IndentWorkloadRange,
} from "@/features/indents/utils/indentWorkload.util";
import { supabase } from "@/lib/supabase";

/**
 * Trips hub indent workload (rules in indentWorkload.util). Exact counts come from
 * `count=exact` HEAD requests, so the org's full indent history is never loaded.
 * Linked-trip exclusion is a PostgREST anti-join on trips_indent_id_fkey, applied
 * after the status / pickup filters so trips RLS only runs on the few candidates.
 */
const LINKED_TRIP_EMBED = "trips!trips_indent_id_fkey(id)";

export const INDENT_WORKLOAD_PAGE_SIZE = 500;
export const INDENT_WORKLOAD_MAX_PAGES = 4;

function workloadQuery(
  orgId: string,
  select: string,
  opts?: { count?: "exact"; head?: boolean },
) {
  return supabase()
    .from("indents")
    .select(select, opts)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .is("trips.deleted_at", null)
    .is("trips", null);
}

export async function countIndentWorkload(
  orgId: string,
  bounds: IndentWorkloadBounds,
  range?: IndentWorkloadRange | null,
): Promise<{ error: Error | null; counts: Record<IndentWorkloadKind, number> | null }> {
  const kinds: IndentWorkloadKind[] = ["live", "needs_trip"];
  const results = await Promise.all(
    kinds.map((kind) =>
      workloadQuery(orgId, `id, ${LINKED_TRIP_EMBED}`, { count: "exact", head: true }).or(
        indentWorkloadOrFilter(kind, bounds, range),
      ),
    ),
  );
  const counts = { live: 0, needs_trip: 0 } as Record<IndentWorkloadKind, number>;
  for (let i = 0; i < kinds.length; i += 1) {
    const { error, count } = results[i];
    if (error) return { error: new Error(error.message), counts: null };
    if (count == null) return { error: new Error("indent workload count unavailable"), counts: null };
    counts[kinds[i]] = count;
  }
  return { error: null, counts };
}

/**
 * Rows for both workload sets, newest first, paged by INDENT_WORKLOAD_PAGE_SIZE.
 * `truncated` when the page limit was reached (the count stays exact).
 */
export async function listIndentWorkload(
  orgId: string,
  bounds: IndentWorkloadBounds,
  range?: IndentWorkloadRange | null,
): Promise<{ error: Error | null; indents: IndentRow[]; truncated: boolean }> {
  const filter = `${indentWorkloadOrFilter("live", bounds, range)},${indentWorkloadOrFilter(
    "needs_trip",
    bounds,
    range,
  )}`;
  const indents: IndentRow[] = [];
  for (let page = 0; page < INDENT_WORKLOAD_MAX_PAGES; page += 1) {
    const from = page * INDENT_WORKLOAD_PAGE_SIZE;
    const { data, error } = await workloadQuery(orgId, `*, ${LINKED_TRIP_EMBED}`)
      .or(filter)
      .order("created_at", { ascending: false })
      .range(from, from + INDENT_WORKLOAD_PAGE_SIZE - 1);
    if (error) return { error: new Error(error.message), indents: [], truncated: false };
    const rows = (data ?? []) as unknown as (IndentRow & { trips?: unknown })[];
    for (const { trips: _linked, ...row } of rows) {
      indents.push(normalizeIndentRow(row as IndentRow));
    }
    if (rows.length < INDENT_WORKLOAD_PAGE_SIZE) {
      return { error: null, indents, truncated: false };
    }
  }
  return { error: null, indents, truncated: true };
}
