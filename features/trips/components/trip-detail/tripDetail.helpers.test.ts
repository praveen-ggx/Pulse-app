import { resolveTripSupplierDisplayName } from "./tripDetail.helpers";

describe("resolveTripSupplierDisplayName", () => {
  it("rejects the viewer org name so an awarded carrier is not their own supplier", () => {
    expect(
      resolveTripSupplierDisplayName({
        partnerName: "Godrej India",
        linkedOrganizationName: "Godrej India",
        clientName: "AJIO",
        viewerOrganizationName: "Godrej India",
      }),
    ).toBeNull();
  });

  it("still returns the supplier name for the shipper viewer", () => {
    expect(
      resolveTripSupplierDisplayName({
        partnerName: "Godrej India",
        clientName: "AJIO",
        viewerOrganizationName: "AJIO",
      }),
    ).toBe("Godrej India");
  });
});
