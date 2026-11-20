import {
  detectTrackingGaps,
  detectTripHalts,
  formatHaltDuration,
  formatHaltDurationLong,
  haltIndexSet,
  summarizeTripHalts,
} from '@/features/trips/utils/tripHalts.util';

const at = (min: number) => new Date(Date.UTC(2026, 10, 12, 4, 0) + min * 60_000).toISOString();
// ~0.0001° lat ≈ 11 m; 0.01° ≈ 1.1 km
const pt = (lat: number, lon: number, min: number) => ({ latitude: lat, longitude: lon, recorded_at: at(min) });

describe('detectTripHalts', () => {
  it('finds a 25 min halt between two moving stretches', () => {
    const trail = [
      pt(13.0, 80.0, 0),
      pt(13.02, 80.0, 4),
      pt(13.0401, 80.0, 10), // arrive
      pt(13.0402, 80.0001, 20),
      pt(13.0401, 80.0002, 35), // leave
      pt(13.06, 80.0, 40),
    ];
    const halts = detectTripHalts(trail);
    expect(halts).toHaveLength(1);
    expect(halts[0]).toMatchObject({
      firstIndex: 2,
      lastIndex: 4,
      durationMs: 25 * 60_000,
      severity: 'medium',
      startAt: at(10),
      endAt: at(35),
    });
    expect([...haltIndexSet(halts)]).toEqual([2, 3, 4]);
  });

  it('ignores short stops (< 5 min) and moving traffic', () => {
    const trail = [pt(13.0, 80.0, 0), pt(13.0001, 80.0, 3), pt(13.02, 80.0, 6), pt(13.04, 80.0, 9)];
    expect(detectTripHalts(trail)).toEqual([]);
  });

  it('two far-apart pings in one spot hours apart = long halt', () => {
    const trail = [pt(13.0, 80.0, 0), pt(13.0003, 80.0, 90), pt(13.1, 80.0, 120)];
    const [h] = detectTripHalts(trail);
    expect(h.severity).toBe('long');
    expect(h.durationMs).toBe(90 * 60_000);
  });

  it('severity bands: < 15 short, 15–60 medium, ≥ 60 long', () => {
    const mk = (m: number) => detectTripHalts([pt(13, 80, 0), pt(13, 80, m)])[0]?.severity;
    expect(mk(8)).toBe('short');
    expect(mk(15)).toBe('medium');
    expect(mk(60)).toBe('long');
  });

  it('points without time never form a halt', () => {
    const trail = [
      { latitude: 13, longitude: 80 },
      { latitude: 13, longitude: 80 },
    ];
    expect(detectTripHalts(trail)).toEqual([]);
  });

  it('finds several halts in order', () => {
    const trail = [
      pt(13.0, 80.0, 0),
      pt(13.0, 80.0, 10),
      pt(13.05, 80.0, 20),
      pt(13.1, 80.0, 30),
      pt(13.1, 80.0001, 100),
    ];
    const halts = detectTripHalts(trail);
    expect(halts.map((h) => [h.firstIndex, h.lastIndex])).toEqual([
      [0, 1],
      [3, 4],
    ]);
    const { stoppedMs, movingMs } = summarizeTripHalts(trail, halts);
    expect(stoppedMs).toBe(80 * 60_000);
    expect(movingMs).toBe(20 * 60_000);
  });
});

describe('detectTrackingGaps', () => {
  it('flags a long moving stretch with no pings, not a halt', () => {
    const trail = [pt(13.0, 80.0, 0), pt(13.02, 80.0, 5), pt(13.3, 80.0, 45), pt(13.32, 80.0, 50)];
    expect(detectTrackingGaps(trail)).toEqual([{ fromIndex: 1, durationMs: 40 * 60_000 }]);
  });

  it('sparse trails (older ~12-ping history) never show "no signal"', () => {
    // 8 pings over 2.5 h — spaced out by design.
    const trail = [0, 20, 40, 63, 85, 105, 128, 150].map((m, i) => pt(13 + i * 0.03, 80, m));
    expect(detectTrackingGaps(trail)).toEqual([]);
  });

  it('a long wait in one spot is a halt, not a gap', () => {
    expect(detectTrackingGaps([pt(13.0, 80.0, 0), pt(13.0002, 80.0, 60)])).toEqual([]);
  });
});

describe('formatHaltDuration', () => {
  it('formats short and long forms', () => {
    expect(formatHaltDuration(8 * 60_000)).toBe('8m');
    expect(formatHaltDuration(80 * 60_000)).toBe('1h 20m');
    expect(formatHaltDuration(120 * 60_000)).toBe('2h');
    expect(formatHaltDurationLong(25 * 60_000)).toBe('25 min');
    expect(formatHaltDurationLong(80 * 60_000)).toBe('1 hr 20 min');
  });
});
