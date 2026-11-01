import { isDriverIndieTransportError } from "../driverIndieOffline.util";

describe("isDriverIndieTransportError", () => {
  it("keeps classic connectivity failures as retryable", () => {
    expect(isDriverIndieTransportError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isDriverIndieTransportError(new Error("Network request failed"))).toBe(true);
  });

  it("treats gateway 503 / Service Unavailable as offline (retry, do not reject)", () => {
    expect(
      isDriverIndieTransportError(new Error("ServiceUnavailableError: Service Unavailable 503")),
    ).toBe(true);
    expect(isDriverIndieTransportError({ message: "HTTP 503" })).toBe(true);
  });

  it("does not soft-retry business denials", () => {
    expect(isDriverIndieTransportError(new Error("driver_indie_not_due"))).toBe(false);
    expect(isDriverIndieTransportError(new Error("driver_indie_denied"))).toBe(false);
  });
});
