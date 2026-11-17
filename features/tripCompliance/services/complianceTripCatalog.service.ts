import { isComplianceOpsPipelineTrip } from "@/features/tripCompliance/utils/compliancePipelineTrips.util";
import {
  getComplianceOpsPipelinePage,
  loadHubTripKeysetRange,
  type HubKeysetCursor,
  type TripRow,
} from "@/features/trips/services/trips.service";

/**
 * Compliance queue membership.
 *
 * Rows come from list_compliance_ops_pipeline_keyset, which uses the same
 * status and driver rule as isComplianceOpsPipelineTrip. Assigned and draft
 * trips are included only for Ground Ops and Sourcing. A database that does
 * not have the function yet falls back to the hub walk. A short walk, a
 * repeated id, or a stuck cursor returns no rows.
 */
export async function loadComplianceTripCatalog(
  orgId: string,
): Promise<{ error: Error | null; trips: TripRow[] }> {
  const first = await getComplianceOpsPipelinePage(orgId, { includeAssigned: true });
  if (first.missing) return loadComplianceTripCatalogFromHub(orgId);
  return walkCompliancePages(orgId, first);
}

async function walkCompliancePages(
  orgId: string,
  first: Awaited<ReturnType<typeof getComplianceOpsPipelinePage>>,
): Promise<{ error: Error | null; trips: TripRow[] }> {
  const trips: TripRow[] = [];
  const seen = new Set<string>();
  let cursor: HubKeysetCursor | null = null;
  let page = first;
  let total = first.total;
  for (;;) {
    if (page.error) return { error: page.error, trips: [] };
    if (page.total != null) total = page.total;
    if (page.trips.length === 0) break;
    for (const trip of page.trips) {
      if (!trip.id || seen.has(trip.id)) {
        return { error: new Error("Compliance page cursor repeated a trip."), trips: [] };
      }
      seen.add(trip.id);
    }
    trips.push(...page.trips);
    if (!page.hasMore) break;
    const last = page.trips[page.trips.length - 1];
    if (!last?.created_at || !last.id) {
      return { error: new Error("Compliance page cursor did not advance."), trips: [] };
    }
    const next = { createdAt: String(last.created_at), id: String(last.id) };
    if (cursor && next.createdAt === cursor.createdAt && next.id === cursor.id) {
      return { error: new Error("Compliance page cursor did not advance."), trips: [] };
    }
    cursor = next;
    page = await getComplianceOpsPipelinePage(orgId, { cursor, includeAssigned: true });
    if (page.missing) {
      return { error: new Error("Compliance queue page could not be loaded."), trips: [] };
    }
  }
  if (total != null && trips.length !== total) {
    return {
      error: new Error(`Compliance queue loaded ${trips.length} of ${total} trips.`),
      trips: [],
    };
  }
  return { error: null, trips };
}

async function loadComplianceTripCatalogFromHub(
  orgId: string,
): Promise<{ error: Error | null; trips: TripRow[] }> {
  const res = await loadHubTripKeysetRange(orgId);
  if (res.error) return { error: res.error, trips: [] };
  return {
    error: null,
    trips: res.trips.filter((trip) =>
      isComplianceOpsPipelineTrip(trip, { includeAssigned: true }),
    ),
  };
}
