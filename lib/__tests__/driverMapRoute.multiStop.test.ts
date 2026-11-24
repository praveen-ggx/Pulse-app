const mockGetOptimalRoute = jest.fn();

jest.mock("@/lib/routingService", () => ({
  getOptimalRoute: (...args: unknown[]) => mockGetOptimalRoute(...args),
  parseRouteFetchKey: jest.fn(),
}));

import { fetchUsableMultiStopRoute } from "@/lib/driverMapRoute.util";

const A = { latitude: 12.8231, longitude: 80.2232 };
const B = { latitude: 12.95, longitude: 80.1 };
const C = { latitude: 13.1431, longitude: 79.9081 };

function leg(from: typeof A, to: typeof A, distance: number) {
  const mid = {
    latitude: (from.latitude + to.latitude) / 2,
    longitude: (from.longitude + to.longitude) / 2 + 0.01,
  };
  return { coordinates: [from, mid, to], distance, duration: distance / 10 };
}

beforeEach(() => {
  mockGetOptimalRoute.mockReset();
});

describe("fetchUsableMultiStopRoute", () => {
  it("joins every leg into one road path without duplicating the shared stop", async () => {
    mockGetOptimalRoute.mockImplementation(async (from) =>
      from === A ? leg(A, B, 20_000) : leg(B, C, 30_000),
    );
    const route = await fetchUsableMultiStopRoute([A, B, C]);
    expect(route?.coordinates).toHaveLength(5);
    expect(route?.coordinates[0]).toEqual(A);
    expect(route?.coordinates[2]).toEqual(B);
    expect(route?.coordinates[4]).toEqual(C);
    expect(route?.distance).toBe(50_000);
  });

  it("returns null when any leg cannot be routed, so the dotted fallback shows", async () => {
    mockGetOptimalRoute.mockImplementation(async (from) =>
      from === A ? leg(A, B, 20_000) : null,
    );
    expect(await fetchUsableMultiStopRoute([A, B, C])).toBeNull();
  });

  it("skips repeated stops at the same place", async () => {
    mockGetOptimalRoute.mockImplementation(async (from, to) => leg(from, to, 10_000));
    await fetchUsableMultiStopRoute([A, A, C]);
    expect(mockGetOptimalRoute).toHaveBeenCalledTimes(1);
  });
});
