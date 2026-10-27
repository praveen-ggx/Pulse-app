import { isIndentFailedStatus } from "@/features/indents/utils/indentCancelReason.util";
import { isIndentStageDone } from "@/features/network/utils/loadCenter.model";
import type { TripRow } from "@/features/trips/services/trips.service";
import {
    countTripsByMetric,
    isCompletedTripStatus,
    isTripCancelledForHub,
    type TripMetricId
} from "@/features/trips/utils/tripHubMetrics";
import {
    tripDayMatchesHubDateFilter,
    type TripHubDateFilter,
} from "@/lib/dateRangePresets";

export type HubTripFact = {
  id: string;
  status: string | null;
  driver_id: string | null;
  indent_id: string | null;
  pickup_date: string | null;
  created_at: string | null;
};

export type HubIndentFact = {
  id: string;
  status: string | null;
  pickup_date: string | null;
  created_at: string | null;
};

export type OrgHubCountSource = {
  trips: HubTripFact[];
  documentTripIds: string[];
  indents: HubIndentFact[];
};

export type OrgHubExactCounts = {
  metrics: Record<TripMetricId, number>;
  active: number;
  history: number;
  allActive: number;
  indentIdsWithTrip: string[];
};

function factAsTrip(fact: HubTripFact): TripRow {
  return {
    id: fact.id,
    status: fact.status,
    driver_id: fact.driver_id,
  } as TripRow;
}

export function buildOrgHubExactCounts(
  source: OrgHubCountSource,
  opts: {
    dateRangeFilter: TripHubDateFilter;
    customFrom?: string | null;
    customTo?: string | null;
  },
): OrgHubExactCounts {
  const dateOpts = {
    customFrom: opts.customFrom,
    customTo: opts.customTo,
  };
  const docs = new Set(source.documentTripIds);
  const indentIdsWithTrip = new Set<string>();
  for (const trip of source.trips) {
    const indentId = trip.indent_id?.trim();
    if (indentId) indentIdsWithTrip.add(indentId);
  }

  const datedTrips = source.trips.filter((trip) =>
    tripDayMatchesHubDateFilter(trip, opts.dateRangeFilter, dateOpts),
  );

  let active = 0;
  let history = 0;
  const activeFacts: HubTripFact[] = [];
  for (const trip of datedTrips) {
    if (isCompletedTripStatus(trip.status)) {
      history += 1;
      continue;
    }
    if (isTripCancelledForHub(trip.status)) continue;
    active += 1;
    activeFacts.push(trip);
  }

  // Active tiles count open trips only; completed trips are History.
  const metrics = countTripsByMetric(
    activeFacts.map(factAsTrip),
    docs,
  );

  const indent = source.indents.filter((row) => {
    const status = row.status ?? "";
    if (isIndentStageDone(status) || isIndentFailedStatus(status)) return false;
    if (indentIdsWithTrip.has(row.id)) return false;
    return tripDayMatchesHubDateFilter(row, opts.dateRangeFilter, dateOpts);
  }).length;
  metrics.indent = indent;

  return {
    metrics,
    active,
    history,
    // Trips only — the indent tile is separate and never adds to ALL.
    allActive: active,
    indentIdsWithTrip: [...indentIdsWithTrip],
  };
}
