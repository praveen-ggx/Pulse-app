import {
  isFinancePartyTabBlocking,
  shouldShowFinancePartyCatalogLoading,
} from "../financePartyTabLoading.util";

describe("finance party tab loading", () => {
  it("does not block cash on entity fetches", () => {
    expect(
      isFinancePartyTabBlocking({
        activeTab: "cash",
        clientsLoading: true,
        suppliersLoading: true,
        entitiesLoading: true,
      }),
    ).toBe(false);
  });

  it("blocks customers only while the client catalog is pending", () => {
    expect(
      isFinancePartyTabBlocking({
        activeTab: "customers",
        clientsLoading: true,
        suppliersLoading: false,
        entitiesLoading: true,
      }),
    ).toBe(true);
    expect(
      isFinancePartyTabBlocking({
        activeTab: "customers",
        clientsLoading: false,
        suppliersLoading: false,
        entitiesLoading: true,
      }),
    ).toBe(false);
  });

  it("paints the catalog as soon as any row exists", () => {
    expect(
      shouldShowFinancePartyCatalogLoading({
        hasRows: true,
        catalogPending: true,
      }),
    ).toBe(false);
    expect(
      shouldShowFinancePartyCatalogLoading({
        hasRows: false,
        catalogPending: true,
      }),
    ).toBe(true);
  });
});
