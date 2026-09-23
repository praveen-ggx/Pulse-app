import { sliceHubListPage } from "@/features/trips/utils/hubListPageSlice.util";

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
