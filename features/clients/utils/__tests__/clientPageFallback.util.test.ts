import {
  CLIENT_PAGE_TX_PAGE_SIZE,
  mapClientPageTripIdRows,
  shouldFailClosedWithoutTripIdRpc,
  shouldFetchNextTransactionPage,
} from "../clientPageFallback.util";

describe("client page fallback membership", () => {
  it("reads trip ids from client_page_trip_ids rows", () => {
    expect(
      mapClientPageTripIdRows([
        { id: "trip-client-id" },
        { id: "trip-name-match" },
        { id: "trip-ledger-linked" },
        { id: "" },
      ]),
    ).toEqual(["trip-client-id", "trip-name-match", "trip-ledger-linked"]);
  });

  it("fails closed when the trip-id RPC is missing instead of using client_id-only trips", () => {
    expect(shouldFailClosedWithoutTripIdRpc(true)).toBe(true);
    expect(shouldFailClosedWithoutTripIdRpc(false)).toBe(false);
  });

  it("keeps paging transactions until a short page, including past 500 rows", () => {
    expect(shouldFetchNextTransactionPage(200, CLIENT_PAGE_TX_PAGE_SIZE)).toBe(true);
    expect(shouldFetchNextTransactionPage(500, 200)).toBe(true);
    expect(shouldFetchNextTransactionPage(199, CLIENT_PAGE_TX_PAGE_SIZE)).toBe(false);
  });
});
