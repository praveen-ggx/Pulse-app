/**
 * Trip Ops structural search (Indent ID / Trip ID / Vehicle): stage-scoped
 * counts + matching ids. Never auto-navigates — callers only filter/highlight.
 */
import type { IndentRow } from "@/features/indents/services/indents.service";
import type { TripRow } from "@/features/trips/services/trips.service";
import type { IndentHubStatusTag } from "@/features/trips/utils/indentHubCardPresentation";
import type { TripMetricId } from "@/features/trips/utils/hubMetrics.model";
import {
  INDENT_HUB_SEARCH_STRONG_SCORE,
  type IndentHubSearchMatch,
} from "@/features/trips/utils/indentHubSearchStage.util";
import {
  TRIP_HUB_SEARCH_STRONG_SCORE,
  scoreTripCodeHubSearchMatch,
  tripHubSearchStageForTrip,
  type TripHubSearchMatch,
  type TripHubSearchStage,
} from "@/features/trips/utils/tripHubSearchStage.util";
import { foldSearchToken } from "@/features/trips/utils/tripHubSearch.util";

export type HubStructuralSearchMode =
  | "off"
  | "indent_id"
  | "trip_id"
  | "vehicle";

export type HubSearchScopedCounts = {
  mode: HubStructuralSearchMode;
  /** Rail tiles + Live Indents (`indent`). */
  metricCounts: Record<TripMetricId, number>;
  /** Open matching trips (All Trips tile). */
  activeAllCount: number;
  /** Completed matching trips (Delivered / History). */
  historyCount: number;
  indentTagCounts: Record<IndentHubStatusTag, number>;
  matchingTripIds: ReadonlySet<string>;
  matchingIndentIds: ReadonlySet<string>;
  /** Stages with count > 0 (for highlight; may be several for vehicle). */
  highlightedTripMetrics: ReadonlySet<TripMetricId | "all">;
  highlightedIndentTags: ReadonlySet<IndentHubStatusTag>;
};

const EMPTY_TRIP_METRICS = (): Record<TripMetricId, number> => ({
  indent: 0,
  unassigned: 0,
  assigned: 0,
  loading: 0,
  in_transit: 0,
  unloading: 0,
  delivered_docs_pending: 0,
});

const EMPTY_INDENT_TAGS = (): Record<IndentHubStatusTag, number> => ({
  pending: 0,
  bids: 0,
  awarded: 0,
  failed: 0,
});

/** Vehicle plate exact / includes — treated as strong structural search. */
export function scoreTripVehicleHubSearchMatch(
  trip: Pick<TripRow, "vehicle_display_number"> & {
    vehicle_number?: string | null;
  },
  query: string,
): number {
  const qFold = foldSearchToken(query.trim());
  if (qFold.length < 3) return 0;
  const vehicle = foldSearchToken(
    String(
      trip.vehicle_display_number ??
        (trip as { vehicle_number?: string | null }).vehicle_number ??
        "",
    ),
  );
  if (!vehicle) return 0;
  if (vehicle === qFold) return 100;
  if (vehicle.includes(qFold) || qFold.includes(vehicle)) return 85;
  return 0;
}

export function isStrongVehicleHubSearchScore(score: number): boolean {
  return score >= TRIP_HUB_SEARCH_STRONG_SCORE;
}

/**
 * Classify Indent ID / Trip ID / Vehicle structural search.
 * Strong trip-code → trip_id; else strong indent → indent_id; else vehicle plate.
 */
export function resolveHubStructuralSearchMode(opts: {
  query: string;
  tripMatches: readonly TripHubSearchMatch[];
  indentMatches: readonly IndentHubSearchMatch[];
  tripsById: ReadonlyMap<string, TripRow>;
  organizationId?: string | null;
}): HubStructuralSearchMode {
  const q = opts.query.trim();
  if (q.length < 2) return "off";

  let bestCode = 0;
  let bestIndent = 0;
  let strongVehicle = false;

  for (const row of opts.tripMatches) {
    const trip = opts.tripsById.get(row.tripId);
    if (!trip) continue;
    bestCode = Math.max(
      bestCode,
      scoreTripCodeHubSearchMatch(trip, q, opts.organizationId),
    );
    if (
      isStrongVehicleHubSearchScore(scoreTripVehicleHubSearchMatch(trip, q))
    ) {
      strongVehicle = true;
    }
  }
  for (const row of opts.indentMatches) {
    bestIndent = Math.max(bestIndent, row.score);
  }

  if (bestCode >= TRIP_HUB_SEARCH_STRONG_SCORE) return "trip_id";
  if (bestIndent >= INDENT_HUB_SEARCH_STRONG_SCORE) return "indent_id";
  if (strongVehicle) return "vehicle";
  return "off";
}

export function buildHubSearchScopedCounts(opts: {
  mode: HubStructuralSearchMode;
  query: string;
  tripMatches: readonly TripHubSearchMatch[];
  indentMatches: readonly IndentHubSearchMatch[];
  tripsById: ReadonlyMap<string, TripRow>;
  organizationId?: string | null;
  tripIdsWithAnyDocument?: ReadonlySet<string>;
}): HubSearchScopedCounts {
  const empty: HubSearchScopedCounts = {
    mode: "off",
    metricCounts: EMPTY_TRIP_METRICS(),
    activeAllCount: 0,
    historyCount: 0,
    indentTagCounts: EMPTY_INDENT_TAGS(),
    matchingTripIds: new Set(),
    matchingIndentIds: new Set(),
    highlightedTripMetrics: new Set(),
    highlightedIndentTags: new Set(),
  };
  if (opts.mode === "off") return empty;

  const metricCounts = EMPTY_TRIP_METRICS();
  const indentTagCounts = EMPTY_INDENT_TAGS();
  const matchingTripIds = new Set<string>();
  const matchingIndentIds = new Set<string>();
  const docs = opts.tripIdsWithAnyDocument ?? new Set<string>();
  const q = opts.query.trim();

  if (opts.mode === "indent_id") {
    let best: IndentHubSearchMatch | null = null;
    for (const row of opts.indentMatches) {
      if (row.score < INDENT_HUB_SEARCH_STRONG_SCORE) continue;
      if (!best || row.score > best.score) best = row;
    }
    if (best) {
      matchingIndentIds.add(best.indentId);
      indentTagCounts[best.stage] = 1;
      // Live Indents tile highlights for any indent-stage hit (incl. awarded/failed).
      metricCounts.indent = 1;
    }
  } else if (opts.mode === "trip_id") {
    let best: TripHubSearchMatch | null = null;
    for (const row of opts.tripMatches) {
      const trip = opts.tripsById.get(row.tripId);
      if (!trip) continue;
      const code = scoreTripCodeHubSearchMatch(trip, q, opts.organizationId);
      if (code < TRIP_HUB_SEARCH_STRONG_SCORE) continue;
      const ranked = { ...row, score: code };
      if (!best || ranked.score > best.score) best = ranked;
    }
    if (best) {
      matchingTripIds.add(best.tripId);
      metricCounts[best.stage] = 1;
    }
  } else if (opts.mode === "vehicle") {
    for (const row of opts.tripMatches) {
      const trip = opts.tripsById.get(row.tripId);
      if (!trip) continue;
      if (
        !isStrongVehicleHubSearchScore(scoreTripVehicleHubSearchMatch(trip, q))
      ) {
        continue;
      }
      // Prefer live stage from the trip row; fall back to the scored match stage.
      const stage = tripHubSearchStageForTrip(trip, docs) ?? row.stage;
      if (!stage) continue;
      if (matchingTripIds.has(trip.id)) continue;
      matchingTripIds.add(trip.id);
      metricCounts[stage] += 1;
    }
  }

  let activeAllCount = 0;
  let historyCount = 0;
  for (const stage of Object.keys(metricCounts) as TripMetricId[]) {
    if (stage === "indent") continue;
    if (stage === "delivered_docs_pending") {
      historyCount = metricCounts[stage];
    } else {
      activeAllCount += metricCounts[stage];
    }
  }

  const highlightedTripMetrics = new Set<TripMetricId | "all">();
  const highlightedIndentTags = new Set<IndentHubStatusTag>();
  if (metricCounts.indent > 0) highlightedTripMetrics.add("indent");
  for (const stage of [
    "unassigned",
    "assigned",
    "loading",
    "in_transit",
    "unloading",
    "delivered_docs_pending",
  ] as TripHubSearchStage[]) {
    if (metricCounts[stage] > 0) highlightedTripMetrics.add(stage);
  }
  if (activeAllCount > 0) highlightedTripMetrics.add("all");
  for (const tag of Object.keys(indentTagCounts) as IndentHubStatusTag[]) {
    if (indentTagCounts[tag] > 0) highlightedIndentTags.add(tag);
  }

  return {
    mode: opts.mode,
    metricCounts,
    activeAllCount,
    historyCount,
    indentTagCounts,
    matchingTripIds,
    matchingIndentIds,
    highlightedTripMetrics,
    highlightedIndentTags,
  };
}

/** Whether the current indent surface can show structural indent hits. */
export function hubIndentViewShowsStructuralMatch(opts: {
  mode: HubStructuralSearchMode;
  activeMetricTab: string;
  indentStatusTag: IndentHubStatusTag | "failed" | null;
  matchingStages: ReadonlySet<IndentHubStatusTag>;
}): boolean {
  if (opts.mode !== "indent_id") return false;
  if (opts.activeMetricTab !== "indent") return false;
  if (opts.indentStatusTag == null) {
    return (
      opts.matchingStages.has("pending") || opts.matchingStages.has("bids")
    );
  }
  return opts.matchingStages.has(opts.indentStatusTag);
}

/** Whether the current trip surface can show structural trip hits. */
export function hubTripViewShowsStructuralMatch(opts: {
  mode: HubStructuralSearchMode;
  tripFilter: "Active" | "History";
  activeMetricTab: string;
  matchingTripMetrics: ReadonlySet<TripMetricId | "all">;
}): boolean {
  if (opts.mode !== "trip_id" && opts.mode !== "vehicle") return false;
  if (opts.tripFilter === "History") {
    return opts.matchingTripMetrics.has("delivered_docs_pending");
  }
  if (opts.activeMetricTab === "indent") return false;
  if (opts.activeMetricTab === "all") {
    return opts.matchingTripMetrics.has("all");
  }
  return opts.matchingTripMetrics.has(
    opts.activeMetricTab as TripMetricId | "all",
  );
}

export function filterIndentsForHubStructuralSearch(opts: {
  mode: HubStructuralSearchMode;
  list: readonly IndentRow[];
  matchingIndentIds: ReadonlySet<string>;
  viewCanShowIndents: boolean;
}): IndentRow[] {
  if (opts.mode === "off") return [...opts.list];
  if (opts.mode === "trip_id" || opts.mode === "vehicle") return [];
  if (!opts.viewCanShowIndents) return [];
  const out = opts.list.filter((indent) =>
    opts.matchingIndentIds.has(indent.id),
  );
  return out;
}

export function filterTripsForHubStructuralSearch(opts: {
  mode: HubStructuralSearchMode;
  list: readonly TripRow[];
  matchingTripIds: ReadonlySet<string>;
  hubTrips: readonly TripRow[];
  viewCanShowTrips: boolean;
  /** When injecting a hit missing from `list`, confirm it belongs on this surface. */
  tripBelongsOnView?: (trip: TripRow) => boolean;
}): TripRow[] {
  if (opts.mode === "off") return [...opts.list];
  if (opts.mode === "indent_id") return [];
  if (!opts.viewCanShowTrips) return [];
  const out = opts.list.filter((trip) => opts.matchingTripIds.has(trip.id));
  if (out.length >= opts.matchingTripIds.size) return out;
  const have = new Set(out.map((trip) => trip.id));
  const belongs = opts.tripBelongsOnView ?? (() => true);
  for (const trip of opts.hubTrips) {
    if (!opts.matchingTripIds.has(trip.id) || have.has(trip.id)) continue;
    if (!belongs(trip)) continue;
    out.push(trip);
    have.add(trip.id);
  }
  return out;
}
