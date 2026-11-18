import type { TripRow } from "@/features/trips/services/trips.service";
import {
  GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP,
  GET_TRIPS_FOR_ORG_DEFAULT_CAP,
  isDatedGetTripsForOrgCapped,
} from "@/features/trips/utils/tripOrgFetch.util";
import {
  classifyTripMetric,
  isCompletedTripStatus,
  isTripCancelledForHub,
  type TripMetricId,
} from "@/features/trips/utils/tripHubMetrics";

/**
 * One trip classification for every Trips hub surface (tabs, rail, cards, toolbar).
 * Status only: POD / document state never moves a trip between Active and History.
 * Indents are separate rows and never pass through here.
 */
export type HubTripBucket = "active" | "history" | "cancelled";

export function hubTripBucket(status: string | null | undefined): HubTripBucket {
  if (isCompletedTripStatus(status)) return "history";
  if (isTripCancelledForHub(status)) return "cancelled";
  return "active";
}

export function isOpenActiveHubTrip(status: string | null | undefined): boolean {
  return hubTripBucket(status) === "active";
}

export function filterHubTripsForActiveList<T extends Pick<TripRow, "status">>(
  trips: readonly T[],
): T[] {
  return trips.filter((trip) => hubTripBucket(trip.status) === "active");
}

export function filterHubTripsForHistoryList<T extends Pick<TripRow, "status">>(
  trips: readonly T[],
): T[] {
  return trips.filter((trip) => hubTripBucket(trip.status) === "history");
}

/**
 * Rows the hub list may show for the current tab.
 * The Unassigned server page includes cancelled trips. The Active filter drops
 * those, so a full 250-row page was labelled 249. Keep cancelled rows on that tile.
 */
export function rowsForHubStatusList<T extends Pick<TripRow, "status">>(
  trips: readonly T[],
  opts: { history: boolean; tileBucket: string },
): T[] {
  if (opts.history) return filterHubTripsForHistoryList(trips);
  if (opts.tileBucket === "unassigned") {
    return trips.filter((trip) => hubTripBucket(trip.status) !== "history");
  }
  return filterHubTripsForActiveList(trips);
}

export function hubHistoryTripCount(
  trips: readonly Pick<TripRow, "status">[],
): number {
  return filterHubTripsForHistoryList(trips).length;
}

export function hubTabTripCounts(
  trips: readonly Pick<TripRow, "status">[],
): { active: number; history: number; cancelled: number } {
  const counts = { active: 0, history: 0, cancelled: 0 };
  for (const trip of trips) counts[hubTripBucket(trip.status)] += 1;
  return counts;
}

/**
 * Rail tile for an open trip. The hub's Delivered tile is the History set, so an
 * open trip at the drop point stays on Unloading even once a document is on file.
 */
export function hubActiveRailMetric(
  trip: TripRow,
  tripIdsWithAnyDocument: Set<string>,
): Exclude<TripMetricId, "indent" | "delivered_docs_pending"> {
  const metric = classifyTripMetric(trip, tripIdsWithAnyDocument);
  if (metric === "delivered_docs_pending" || metric === "indent") return "unloading";
  return metric;
}

/**
 * Rail tiles. Open-trip tiles partition the Active set; Delivered is the History
 * count of the same rows, so Delivered and History always match.
 * `indent` stays 0; the screen sets it from indents.
 */
export function buildActiveHubRailCounts(
  trips: readonly TripRow[],
  tripIdsWithAnyDocument: Set<string>,
): Record<TripMetricId, number> {
  const counts: Record<TripMetricId, number> = {
    indent: 0,
    unassigned: 0,
    assigned: 0,
    loading: 0,
    in_transit: 0,
    unloading: 0,
    delivered_docs_pending: 0,
  };
  for (const trip of trips) {
    const bucket = hubTripBucket(trip.status);
    if (bucket === "history") counts.delivered_docs_pending += 1;
    if (bucket !== "active") continue;
    counts[hubActiveRailMetric(trip, tripIdsWithAnyDocument)] += 1;
  }
  return counts;
}

const HUB_SERVER_TILES = new Set([
  "unassigned",
  "assigned",
  "loading",
  "in_transit",
  "unloading",
]);

/**
 * Badges while a single tile page is loaded.
 * The selected tile uses the server bucket count, which includes cancelled rows
 * on Unassigned. The other tiles keep the counts from the last full Active or
 * History page for the same filters, so one tile page does not zero them.
 */
export function hubTileBadgeCounts(
  rail: Record<TripMetricId, number>,
  opts: {
    tileBucket: string;
    tileTotal: number | null;
    preservedRail: Record<TripMetricId, number> | null;
  },
): Record<TripMetricId, number> {
  const tileQuery = HUB_SERVER_TILES.has(opts.tileBucket);
  const counts: Record<TripMetricId, number> =
    tileQuery && opts.preservedRail ? { ...opts.preservedRail } : { ...rail };
  if (
    tileQuery &&
    opts.tileTotal != null &&
    opts.tileBucket in counts
  ) {
    counts[opts.tileBucket as TripMetricId] = opts.tileTotal;
  }
  return counts;
}

/** ALL = open trips (Active tab). Delivered (History) is not part of it. */
export function hubActiveAllTripCount(
  rail: Pick<
    Record<TripMetricId, number>,
    "unassigned" | "assigned" | "loading" | "in_transit" | "unloading"
  >,
): number {
  return (
    rail.unassigned +
    rail.assigned +
    rail.loading +
    rail.in_transit +
    rail.unloading
  );
}

/**
 * How complete the hub's trip rows are.
 * - exact: get_trips_for_org dated mode returned under its 2000 cap.
 * - capped: dated mode hit 2000, so older matching trips are missing.
 * - loading / error: only the newest-400 list is on screen.
 */
export type HubTripCompleteness = "exact" | "capped" | "paged" | "loading" | "error";

export function resolveHubTripDataset<T>(opts: {
  rangeRows: readonly T[];
  rangeFetched: boolean;
  rangeError: boolean;
  newestRows: readonly T[];
  /** The server has more rows than this page window. Totals stay on the count RPC. */
  rangePartial?: boolean;
}): { trips: readonly T[]; completeness: HubTripCompleteness } {
  if (opts.rangeError) return { trips: opts.newestRows, completeness: "error" };
  if (!opts.rangeFetched) return { trips: opts.newestRows, completeness: "loading" };
  if (opts.rangePartial) return { trips: opts.rangeRows, completeness: "paged" };
  return {
    trips: opts.rangeRows,
    completeness: isDatedGetTripsForOrgCapped(opts.rangeRows.length) ? "capped" : "exact",
  };
}

export function hubTripCompletenessNote(
  completeness: HubTripCompleteness,
): string | null {
  switch (completeness) {
    case "exact":
      return null;
    case "capped":
      return `Partial: newest ${GET_TRIPS_FOR_ORG_DATED_SAFETY_CAP} matching trips loaded`;
    case "paged":
      return null;
    case "loading":
      return `Partial: loading all trips (newest ${GET_TRIPS_FOR_ORG_DEFAULT_CAP} shown)`;
    case "error":
      return `Partial: couldn't load all trips (newest ${GET_TRIPS_FOR_ORG_DEFAULT_CAP} shown)`;
  }
}

/**
 * History POD cards. Soft POD needs trip_documents flags, which History does not
 * load (perf, see shouldFetchHubDigitalPodFlags); without them every trip would
 * count as "pending", so the card is left out instead of showing a wrong number.
 */
export function hubHistoryPodMetricIds(
  softPodFlagsLoaded: boolean,
): ("pending_soft_pod" | "pending_hard_pod")[] {
  return softPodFlagsLoaded ? ["pending_soft_pod", "pending_hard_pod"] : ["pending_hard_pod"];
}

/**
 * Soft POD chip state: null unless this trip's document flags were actually fetched.
 * The Active flags cover open trips only, so completed trips (Delivered tile) stay unknown.
 */
export function hubSoftPodChipState(
  softPodChecked: boolean,
  hasSoftPod: boolean,
): boolean | null {
  return softPodChecked ? hasSoftPod : null;
}

/** Lower-cased ids whose soft-POD flags were requested and returned. */
export function hubSoftPodCheckedTripIds(
  batches: readonly { loaded: boolean; tripIds: readonly string[] }[],
): Set<string> {
  const ids = new Set<string>();
  for (const batch of batches) {
    if (!batch.loaded) continue;
    for (const id of batch.tripIds) {
      const key = id.trim().toLowerCase();
      if (key) ids.add(key);
    }
  }
  return ids;
}

/** Tab badge / tile count text. Partial totals get a trailing "+". */
export function hubCountText(count: number, partial: boolean): string {
  return partial ? `${count}+` : String(count);
}

/**
 * Toolbar "Showing X of Y". Y is the tab's total; X is the filtered list (a subset).
 * Never prints X > Y: a larger X means Y is incomplete, so it is shown as partial.
 * `note` (the completeness warning) is appended; the toolbar is the one label every
 * list view renders, so the warning cannot be hidden by the date filter mode.
 */
export function hubShowingCountLabel(opts: {
  shown: number;
  total: number;
  partial: boolean;
  note?: string | null;
}): string {
  const shown = Math.max(0, opts.shown);
  const total = Math.max(shown, opts.total);
  const partial = opts.partial || opts.shown > opts.total;
  const label = `Showing ${shown} of ${hubCountText(total, partial)}`;
  return opts.note ? `${label} · ${opts.note}` : label;
}
