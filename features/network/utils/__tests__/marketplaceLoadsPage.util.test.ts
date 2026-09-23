import {
  MARKETPLACE_LOAD_PAGE_SIZE,
  nextMarketplacePageOffset,
  sliceMarketplaceLoadsPage,
} from "@/features/network/utils/marketplaceLoadsPage.util";

describe("marketplaceLoadsPage", () => {
  it("pages 15 rows and stops when the prefix is short", () => {
    expect(MARKETPLACE_LOAD_PAGE_SIZE).toBe(15);
    const rows = Array.from({ length: 15 }, (_, i) => i);
    expect(sliceMarketplaceLoadsPage(rows, 0)).toEqual({
      page: rows,
      hasMore: true,
    });
    expect(sliceMarketplaceLoadsPage(rows.slice(0, 7), 0)).toEqual({
      page: rows.slice(0, 7),
      hasMore: false,
    });
    expect(nextMarketplacePageOffset(0, 15)).toBe(15);
    expect(nextMarketplacePageOffset(15, 4)).toBeUndefined();
  });
});
