import { getOptimalRoute, isRoutableLatLon } from "@/lib/routingService";

describe("isRoutableLatLon", () => {
  it("rejects Null Island and out-of-range points", () => {
    expect(isRoutableLatLon({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isRoutableLatLon({ latitude: 17.61, longitude: 78.47 })).toBe(true);
    expect(isRoutableLatLon({ latitude: 91, longitude: 78 })).toBe(false);
    expect(isRoutableLatLon(null)).toBe(false);
  });
});

describe("getOptimalRoute", () => {
  it("does not fetch a route when the destination is 0,0", async () => {
    const fetchMock = jest.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchMock as typeof fetch;
    try {
      const route = await getOptimalRoute(
        { latitude: 17.6107583, longitude: 78.4683703 },
        { latitude: 0, longitude: 0 },
      );
      expect(route).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
