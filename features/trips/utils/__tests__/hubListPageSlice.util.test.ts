import {
  sliceHubListPage,
  visibleHubTripIds,
} from "@/features/trips/utils/hubListPageSlice.util";

describe("sliceHubListPage", () => {
  it("pages trip-only tabs", () => {
    expect(
      sliceHubListPage({
        indentCount: 0,
        tripCount: 45,
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({
      indentOffset: 0,
      indentLimit: 0,
      tripOffset: 20,
      tripLimit: 20,
    });
  });

  it("pages indent-only tabs", () => {
    expect(
      sliceHubListPage({
        indentCount: 25,
        tripCount: 0,
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({
      indentOffset: 20,
      indentLimit: 5,
      tripOffset: 0,
      tripLimit: 0,
    });
  });

  it("fills the first mixed page with indents then trips", () => {
    expect(
      sliceHubListPage({
        indentCount: 5,
        tripCount: 100,
        page: 0,
        pageSize: 20,
      }),
    ).toEqual({
      indentOffset: 0,
      indentLimit: 5,
      tripOffset: 0,
      tripLimit: 15,
    });
  });

  it("continues mixed pages with trips after indents are exhausted", () => {
    expect(
      sliceHubListPage({
        indentCount: 5,
        tripCount: 100,
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({
      indentOffset: 5,
      indentLimit: 0,
      tripOffset: 15,
      tripLimit: 20,
    });
  });

  it("keeps an indent-heavy first page trip-free", () => {
    expect(
      sliceHubListPage({
        indentCount: 50,
        tripCount: 100,
        page: 0,
        pageSize: 20,
      }),
    ).toEqual({
      indentOffset: 0,
      indentLimit: 20,
      tripOffset: 0,
      tripLimit: 0,
    });
  });
});

describe("visibleHubTripIds", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const catalog = Array.from({ length: 2000 }, (_, i) => `trip-${i}`);

  it("returns only the current web page slice", () => {
    expect(
      visibleHubTripIds(ids, sliceHubListPage({
        indentCount: 0,
        tripCount: ids.length,
        page: 1,
        pageSize: 2,
      })),
    ).toEqual(["c", "d"]);
  });

  it("returns the growing mobile window from the start", () => {
    expect(visibleHubTripIds(ids, { page: 0, pageSize: 3 })).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("returns nothing on an indent-only page", () => {
    expect(
      visibleHubTripIds(ids, sliceHubListPage({
        indentCount: 20,
        tripCount: ids.length,
        page: 0,
        pageSize: 20,
      })),
    ).toEqual([]);
  });

  it("web pages stay at pageSize and never send the 2000-trip catalog", () => {
    const page0 = visibleHubTripIds(
      catalog,
      sliceHubListPage({ indentCount: 0, tripCount: catalog.length, page: 0, pageSize: 20 }),
    );
    const page1 = visibleHubTripIds(
      catalog,
      sliceHubListPage({ indentCount: 0, tripCount: catalog.length, page: 1, pageSize: 20 }),
    );
    expect(page0).toHaveLength(20);
    expect(page1).toHaveLength(20);
    expect(page0).toEqual(catalog.slice(0, 20));
    expect(page1).toEqual(catalog.slice(20, 40));
    expect(page0.some((id) => page1.includes(id))).toBe(false);
    expect(page0.length + page1.length).toBeLessThan(catalog.length);
  });

  it("returning to a web page yields the same ids for query-cache reuse", () => {
    const first = visibleHubTripIds(
      catalog,
      sliceHubListPage({ indentCount: 0, tripCount: catalog.length, page: 0, pageSize: 20 }),
    );
    visibleHubTripIds(
      catalog,
      sliceHubListPage({ indentCount: 0, tripCount: catalog.length, page: 3, pageSize: 20 }),
    );
    const again = visibleHubTripIds(
      catalog,
      sliceHubListPage({ indentCount: 0, tripCount: catalog.length, page: 0, pageSize: 20 }),
    );
    expect(again).toEqual(first);
  });

  it("mobile scroll grows the window without fetching the full catalog", () => {
    const firstPaint = visibleHubTripIds(catalog, { page: 0, pageSize: 20 });
    const afterScroll = visibleHubTripIds(catalog, { page: 0, pageSize: 40 });
    expect(firstPaint).toEqual(catalog.slice(0, 20));
    expect(afterScroll).toEqual(catalog.slice(0, 40));
    expect(afterScroll.slice(0, 20)).toEqual(firstPaint);
    expect(afterScroll).toHaveLength(40);
    expect(afterScroll.length).toBeLessThan(catalog.length);
  });
});
