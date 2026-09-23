import { resolveMapTruckLocation } from "@/features/trips/utils/mapDriverTracking.util";

describe("resolveMapTruckLocation", () => {
  it("uses the simulated pin when the driver has never pinged", () => {
    expect(
      resolveMapTruckLocation({
        tripCompleted: false,
        currentPosition: null,
        driverLocation: null,
        trail: [],
        simulatedLocation: { latitude: 15.139, longitude: 76.921 },
      }),
    ).toEqual({ latitude: 15.139, longitude: 76.921 });
  });

  it("prefers a live ping over the simulated pin", () => {
    expect(
      resolveMapTruckLocation({
        tripCompleted: false,
        currentPosition: null,
        driverLocation: { latitude: 12, longitude: 77 },
        trail: [],
        simulatedLocation: { latitude: 15.139, longitude: 76.921 },
      }),
    ).toEqual({ latitude: 12, longitude: 77 });
  });
});
