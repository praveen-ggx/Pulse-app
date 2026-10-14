/**
 * Guards Load Center B+C: market remount honors staleTime; marketplace RPC
 * uses the same urgent bootstrap gate as market/quotes (not orgId-only).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Load Center marketplace + market remount gates", () => {
  it("useMarketIndentsQuery refetches on mount only when stale", () => {
    const source = readFileSync(
      join(__dirname, "../../../../lib/queries/useIndentsQuery.ts"),
      "utf8",
    );
    const marketHook = source.slice(
      source.indexOf("export function useMarketIndentsQuery"),
      source.indexOf("export async function getIntegratedSupplierOrgIdsForShipper"),
    );
    expect(marketHook).toContain("refetchOnMountIfEntityListEmpty");
    expect(marketHook).not.toContain("refetchOnMount: true");
  });

  it("Load Center does not auto-fetch open Marketplace (search lives on Find Loads)", () => {
    const source = readFileSync(
      join(__dirname, "../LoadCenterView.tsx"),
      "utf8",
    );
    expect(source).not.toContain("listOpenMarketplaceLoadsPage");
    expect(source).not.toContain("useInfiniteQuery(");
    expect(source).toContain("getLoadPending = waitingForLoadGate || marketPending");
    // Network loads page on scroll (95fbde60); the hint replaced the Load more button.
    expect(source).toContain("Scroll for more");
    expect(source).not.toContain("Boolean(orgId) && !isTripsPresentation");
  });
});
