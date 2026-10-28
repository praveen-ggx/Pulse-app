/**
 * Hub document reads must follow the visible page (or search), not the
 * dated catalog. Source contract — not a renderer test.
 */
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(
  join(process.cwd(), "features/trips/screens/TripsScreen.tsx"),
  "utf8",
);

describe("TripsScreen hub document page reads", () => {
  it("loads card POD flags and LR labels from visibleHubTripIdsForDocs only", () => {
    expect(src).toContain('queryFn: () => loadHubPodReceiptFlags(visibleHubTripIdsForDocs)');
    expect(src).toContain(
      "queryFn: () => loadHubTripDocumentLabelsByTripIds(visibleHubTripIdsForDocs)",
    );
    expect(src).toContain('"v7-pod-eway-page"');
    expect(src).toContain("visibleHubTripIdsKey");
    expect(src).toContain(
      "queryFn: () => loadHubPodReceiptFlags(visibleHubTripIdsForDocs)",
    );
  });

  it("uses the mobile visible window, not the full filtered list, for compact viewports", () => {
    expect(src).toContain(
      "return visibleHubTripIds(ids, { page: 0, pageSize: mobileVisibleCount });",
    );
    expect(src).toContain("MOBILE_HUB_INITIAL_BATCH = 20");
    expect(src).toContain("MOBILE_HUB_BATCH_STEP = 20");
  });

  it("loads full-catalog document flags only while searching", () => {
    expect(src).toContain("hubSearchActive = searchQuery.trim().length >= 2");
    expect(src).toContain(
      "enabled: !!orgId && hubSearchActive && baseTripsByStatus.length > 0",
    );
    expect(src).toContain(
      "queryFn: () => loadHubPodReceiptFlags(baseTripsByStatus.map((t) => t.id))",
    );
    expect(src).toContain("searchLrNumbersByTripId[t.id.trim().toLowerCase()]");
    expect(src).toContain("searchEwayNumbersByTripId[t.id.trim().toLowerCase()]");
  });

  it("keeps rail counts independent of trip_documents", () => {
    expect(src).toContain(
      "buildActiveHubRailCounts(hubScopedTrips, EMPTY_HUB_DOC_TRIP_IDS)",
    );
    expect(src).toContain(
      "hubActiveRailMetric(t, EMPTY_HUB_DOC_TRIP_IDS)",
    );
  });
});
