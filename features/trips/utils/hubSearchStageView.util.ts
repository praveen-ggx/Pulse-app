/**
 * Trip Ops hub ID search — which stage owns a hit, and whether the current
 * view should show that exclusive row (no auto-tab-switch).
 */
import type { IndentHubStatusTag } from "@/features/trips/utils/indentHubCardPresentation";
import type { TripHubSearchStage } from "@/features/trips/utils/tripHubSearchStage.util";
import type { ActiveMetricTabId } from "@/features/trips/components/TripsHubBentoMetrics";

export type HubSearchStageHint =
  | {
      kind: "indent";
      stage: IndentHubStatusTag;
      id: string;
      strong: boolean;
    }
  | {
      kind: "trip";
      stage: TripHubSearchStage;
      id: string;
      strong: boolean;
    };

export type HubSearchViewState = {
  tripFilter: "Active" | "History";
  activeMetricTab: ActiveMetricTabId;
  indentStatusTag: IndentHubStatusTag | "failed" | null;
};

/**
 * True when the current hub surface is the stage that owns the strong ID hit.
 * Live Indents with no status chip selected still owns Pending / Bids (same list).
 * Completed / Delivered hits are owned by Active→Delivered or the History tab.
 */
export function hubSearchViewOwnsMatch(
  hint: HubSearchStageHint | null | undefined,
  view: HubSearchViewState,
): boolean {
  if (!hint?.strong) return false;

  if (hint.kind === "indent") {
    if (view.activeMetricTab !== "indent") return false;
    if (view.indentStatusTag == null) {
      return hint.stage === "pending" || hint.stage === "bids";
    }
    return view.indentStatusTag === hint.stage;
  }

  if (hint.stage === "delivered_docs_pending") {
    if (view.tripFilter === "History") return true;
    return (
      view.tripFilter === "Active" &&
      view.activeMetricTab === "delivered_docs_pending"
    );
  }

  if (view.tripFilter !== "Active") return false;
  return view.activeMetricTab === hint.stage;
}

/** Prefer a strong trip-code hit over indent text when both match the query. */
export function preferTripHubSearchHint(opts: {
  trip: HubSearchStageHint | null;
  indent: HubSearchStageHint | null;
}): HubSearchStageHint | null {
  const { trip, indent } = opts;
  if (!trip && !indent) return null;
  if (trip && !indent) return trip;
  if (indent && !trip) return indent;
  if (trip!.strong && !indent!.strong) return trip;
  if (indent!.strong && !trip!.strong) return indent;
  // Both strong or both weak: trip ID wins (user typed a trip code).
  return trip;
}
