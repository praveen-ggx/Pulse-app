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

  it("Load Center marketplace list is gated with urgent useAppQueryGate", () => {
    const source = readFileSync(
      join(__dirname, "../LoadCenterView.tsx"),
      "utf8",
    );
    expect(source).toContain("useInfiniteQuery(");
    expect(source).toContain("listOpenMarketplaceLoadsPage");
    expect(source).toContain("MARKETPLACE_LOAD_PAGE_SIZE");
    expect(source).toContain("getLoadPending = waitingForLoadGate || marketPending");
    expect(source).not.toContain("Boolean(orgId) && !isTripsPresentation");
  });
});
