import {
  companyNameForInitials,
  networkNotificationPartyName,
} from "@/lib/alertRegistry/networkNotificationParty.util";

describe("network notification party names", () => {
  it("reads the company out of a bid title instead of the sentence", () => {
    expect(networkNotificationPartyName("GOGOVAN INDIA PVT LTD placed a bid")).toBe(
      "GOGOVAN INDIA PVT LTD",
    );
    expect(networkNotificationPartyName("AJIO quoted on GOD684GODIND000052")).toBe("AJIO");
    expect(networkNotificationPartyName("Quote requested on SAT812GOGIND000788")).toBeNull();
  });

  it("drops legal suffixes so initials are not taken from LTD", () => {
    expect(companyNameForInitials("GOGOVAN INDIA PVT LTD")).toBe("GOGOVAN INDIA");
    expect(companyNameForInitials("AJIO")).toBe("AJIO");
  });
});
