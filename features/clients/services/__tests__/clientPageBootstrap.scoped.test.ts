import { CLIENT_PAGE_TRIP_COLUMNS } from "../../utils/clientPageTripColumns.util";

describe("client page bootstrap fallback", () => {
  it("loads scoped trips with a column list, never select *", () => {
    expect(CLIENT_PAGE_TRIP_COLUMNS.includes("*")).toBe(false);
    expect(CLIENT_PAGE_TRIP_COLUMNS).toContain("client_id");
    expect(CLIENT_PAGE_TRIP_COLUMNS).toContain("client_price");
  });
});
