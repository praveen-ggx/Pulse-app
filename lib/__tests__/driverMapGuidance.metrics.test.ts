import { resolveDriverGuidanceMetrics } from "@/lib/driverMapRoute.util";
import type { RouteResult } from "@/lib/routingService";

function route(
  distanceM: number,
  durationS: number,
): RouteResult {
  return {
    coordinates: [
      { latitude: 19.07, longitude: 72.87 },
      { latitude: 17.38, longitude: 78.48 },
    ],
    distance: distanceM,
    duration: durationS,
  };
}

describe("resolveDriverGuidanceMetrics", () => {
  it("prefers live navigation route for remaining + ETA", () => {
    const metrics = resolveDriverGuidanceMetrics({
      activeNavigationRoute: route(50_000, 3600),
      tripLegRoute: route(700_000, 50_000),
      hasLiveGps: true,
      storedPlannedKm: 800,
    });
    expect(metrics.remainingKm).toBe(50);
    expect(metrics.corridorKm).toBe(700);
    expect(metrics.etaSeconds).toBe(3600);
    expect(metrics.isLiveRemaining).toBe(true);
  });

  it("falls back to from→to corridor when no live route (no GPS yet)", () => {
    const metrics = resolveDriverGuidanceMetrics({
      activeNavigationRoute: null,
      tripLegRoute: route(1_245_500, 55_080),
      hasLiveGps: false,
      storedPlannedKm: null,
    });
    expect(metrics.remainingKm).toBeCloseTo(1245.5, 5);
    expect(metrics.corridorKm).toBeCloseTo(1245.5, 5);
    expect(metrics.etaSeconds).toBe(55_080);
    expect(metrics.isLiveRemaining).toBe(false);
  });

  it("uses stored planned km when routing API has not resolved", () => {
    const metrics = resolveDriverGuidanceMetrics({
      activeNavigationRoute: null,
      tripLegRoute: null,
      hasLiveGps: false,
      storedPlannedKm: 420,
    });
    expect(metrics.remainingKm).toBe(420);
    expect(metrics.corridorKm).toBe(420);
    expect(metrics.etaSeconds).toBeNull();
  });
});
