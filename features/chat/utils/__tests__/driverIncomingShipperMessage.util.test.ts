import {
  isDriverOwnChatSender,
  isShipperSideChatSender,
  resolveDriverFacingShipperName,
} from "@/features/chat/utils/driverIncomingShipperMessage.util";

describe("driverIncomingShipperMessage", () => {
  it("treats client / dispatcher / supplier as shipper-side", () => {
    expect(isShipperSideChatSender("client")).toBe(true);
    expect(isShipperSideChatSender("dispatcher")).toBe(true);
    expect(isShipperSideChatSender("supplier")).toBe(true);
    expect(isShipperSideChatSender("CLIENT")).toBe(true);
  });

  it("rejects driver and system for the inbound toast", () => {
    expect(isShipperSideChatSender("driver")).toBe(false);
    expect(isShipperSideChatSender("system")).toBe(false);
    expect(isShipperSideChatSender(null)).toBe(false);
    expect(isDriverOwnChatSender("driver")).toBe(true);
    expect(isDriverOwnChatSender("client")).toBe(false);
  });

  it("prefers shipper org over driver-lane party_name", () => {
    expect(
      resolveDriverFacingShipperName({
        party_type: "driver",
        party_name: "Vasanth",
        trip_organization_name: "AJIO",
        indent_creator_organization_name: null,
      }),
    ).toBe("AJIO");
    expect(
      resolveDriverFacingShipperName({
        party_type: "driver",
        party_name: "Vasanth",
        trip_organization_name: null,
        indent_creator_organization_name: null,
      }),
    ).toBe("Shipper");
  });
});
