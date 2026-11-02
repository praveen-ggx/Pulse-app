import {
  getTripDisplayNumber,
  type TripRow,
} from "@/features/trips/services/trips.service";
import {
  hubActiveRailMetric,
  hubTripBucket,
} from "@/features/trips/utils/hubTripListCounts.util";
import type { TripMetricId } from "@/features/trips/utils/hubMetrics.model";
import { tripMatchesHubSearch } from "@/features/trips/utils/tripHubSearch.util";

/** Active-rail stages a trip-id search can jump to (includes Delivered / History). */
export type TripHubSearchStage = Exclude<TripMetricId, "indent">;

const STAGE_TIEBREAK: TripHubSearchStage[] = [
  "unassigned",
  "assigned",
  "loading",
  "in_transit",
  "unloading",
  "delivered_docs_pending",
];

/**
 * Stage card for one trip on Trip Ops.
 * History / completed → Delivered; open trips → Active rail tile.
 */
export function tripHubSearchStageForTrip(
  trip: TripRow,
  tripIdsWithAnyDocument: ReadonlySet<string> = new Set(),
): TripHubSearchStage | null {
  const bucket = hubTripBucket(trip.status);
  if (bucket === "cancelled") return null;
  if (bucket === "history") return "delivered_docs_pending";
  return hubActiveRailMetric(trip, tripIdsWithAnyDocument as Set<string>);
}

/** Higher = better match for auto-navigation (exact trip code beats fuzzy text). */
export function scoreTripHubSearchMatch(
  trip: TripRow,
  query: string,
  organizationId?: string | null,
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const codes = [
    getTripDisplayNumber(trip, organizationId),
    trip.trip_number,
    trip.display_trip_id,
    trip.trip_operational_code,
    trip.trip_code,
    trip.booking_ref,
  ]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (codes.some((c) => c === q)) return 100;
  if (codes.some((c) => c.includes(q))) return 80;
  if (!tripMatchesHubSearch(trip, q, { organizationId })) return 0;
  const client = String(trip.client_name ?? "").trim().toLowerCase();
  if (client && client === q) return 40;
  if (client && client.includes(q)) return 20;
  return 10;
}

export type TripHubSearchMatch = {
  tripId: string;
  stage: TripHubSearchStage;
  score: number;
};

/**
 * Pick the rail stage to open for the current search.
 * Exact / strong code matches win; otherwise prefer earlier lifecycle stages.
 */
export function pickTripHubSearchStage(
  matches: readonly TripHubSearchMatch[],
): TripHubSearchStage | null {
  if (matches.length === 0) return null;
  let best = matches[0];
  for (let i = 1; i < matches.length; i += 1) {
    const row = matches[i];
    if (row.score > best.score) {
      best = row;
      continue;
    }
    if (row.score < best.score) continue;
    const rowRank = STAGE_TIEBREAK.indexOf(row.stage);
    const bestRank = STAGE_TIEBREAK.indexOf(best.stage);
    if (rowRank >= 0 && (bestRank < 0 || rowRank < bestRank)) best = row;
  }
  return best.stage;
}

/** Collect scored stage matches from loaded + server hub-search trip pools. */
export function collectTripHubSearchMatches(opts: {
  query: string;
  trips: readonly TripRow[];
  organizationId?: string | null;
  tripIdsWithAnyDocument?: ReadonlySet<string>;
}): TripHubSearchMatch[] {
  const q = opts.query.trim();
  if (!q) return [];
  const docs = opts.tripIdsWithAnyDocument ?? new Set<string>();
  const out: TripHubSearchMatch[] = [];
  const seen = new Set<string>();

  for (const trip of opts.trips) {
    if (seen.has(trip.id)) continue;
    if (!tripMatchesHubSearch(trip, q, { organizationId: opts.organizationId })) {
      continue;
    }
    const stage = tripHubSearchStageForTrip(trip, docs);
    if (!stage) continue;
    const score = scoreTripHubSearchMatch(trip, q, opts.organizationId);
    if (score <= 0) continue;
    seen.add(trip.id);
    out.push({ tripId: trip.id, stage, score });
  }
  return out;
}

export function bestTripHubSearchMatch(
  matches: readonly TripHubSearchMatch[],
  stage: TripHubSearchStage | null,
): TripHubSearchMatch | null {
  if (!stage) return null;
  let best: TripHubSearchMatch | null = null;
  for (const row of matches) {
    if (row.stage !== stage) continue;
    if (!best || row.score > best.score) best = row;
  }
  return best;
}
