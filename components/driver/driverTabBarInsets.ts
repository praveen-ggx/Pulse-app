/** Breathing room between the dock and the system nav bar / home indicator. */
const NAV_BAR_GAP = 8;

/**
 * Bottom padding under the floating driver dock (DriverTabBar).
 *
 * Uses the full bottom safe-area inset plus a small gap. Android builds draw
 * edge-to-edge, so with 3-button navigation the inset is ~48dp; using only a
 * fraction of it put the dock on top of the system ☰ ▢ ◁ buttons. Screens that
 * reserve clearance for the dock must use this same value.
 */
export function driverTabBarBottomPad(insetsBottom: number): number {
  const inset = Math.round(insetsBottom);
  return inset > 0 ? inset + NAV_BAR_GAP : 10;
}
