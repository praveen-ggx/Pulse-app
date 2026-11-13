import { buildCompletedTripPath } from '@/features/trips/utils/completedTripPath.util';
import { withinTripWindow } from '@/features/trips/hooks/useCompletedTripPath';

jest.mock('@/features/driver/services/driverLocation.service', () => ({
  getTripLocationHistory: jest.fn(),
}));
jest.mock('@/features/tracking/services/tripCheckpoints.service', () => ({
  getRecentTripCheckpoints: jest.fn(),
}));

const at = (min: number) => new Date(Date.UTC(2026, 10, 12, 15, 0) + min * 60_000).toISOString();
// ~0.0001° lat ≈ 11 m
const pt = (lat: number, lon: number, min: number) => ({ latitude: lat, longitude: lon, recorded_at: at(min) });

describe('buildCompletedTripPath', () => {
  it('office test: driver never moved → one dot at the last fix, no line', () => {
    const wobble = [
      pt(13.0827, 80.2707, 0),
      pt(13.0828, 80.2708, 5), // ~15 m wobble
      pt(13.0826, 80.2706, 10),
      pt(13.0829, 80.2707, 15),
    ];
    const out = buildCompletedTripPath(wobble, []);
    expect(out).toHaveLength(1);
    expect(out[0].recorded_at).toBe(at(15));
  });

  it('real drive: keeps the path in time order and skips GPS wobble', () => {
    const gps = [
      pt(13.1488, 80.2306, 0),
      pt(13.14885, 80.23062, 1), // ~6 m wobble → skipped
      pt(13.12, 80.23, 10),
      pt(13.09, 80.225, 20),
    ];
    const checkpoints = [pt(13.105, 80.228, 15)];
    const out = buildCompletedTripPath(gps, checkpoints);
    expect(out.map((p) => p.recorded_at)).toEqual([at(0), at(10), at(15), at(20)]);
  });

  it('always ends on the final fix', () => {
    const out = buildCompletedTripPath(
      [pt(13.1488, 80.2306, 0), pt(13.09, 80.225, 20), pt(13.09005, 80.22502, 21)],
      [],
    );
    expect(out[out.length - 1].recorded_at).toBe(at(21));
    expect(out).toHaveLength(2);
  });

  it('drops invalid and 0,0 points; empty input → empty path', () => {
    expect(buildCompletedTripPath([], [])).toEqual([]);
    expect(
      buildCompletedTripPath([{ latitude: 0, longitude: 0, recorded_at: at(0) }], []),
    ).toEqual([]);
  });
});

describe('withinTripWindow', () => {
  const pts = [pt(13, 80, -60), pt(13, 80, 5), pt(13, 80, 30), pt(13, 80, 45), pt(13, 80, 200)];

  it('keeps only fixes from trip start to completion (+10 min grace)', () => {
    const out = withinTripWindow(pts, at(0), at(40));
    expect(out.map((p) => p.recorded_at)).toEqual([at(5), at(30), at(45)]);
  });

  it('drops the driver\'s older history the RPC falls back to', () => {
    expect(withinTripWindow([pt(13, 80, -600)], at(0), at(40))).toEqual([]);
  });

  it('no completion time → nothing', () => {
    expect(withinTripWindow(pts, at(0), null)).toEqual([]);
  });
});
