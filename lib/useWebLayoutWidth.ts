import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

/** Match Network / Workspace mobile stack breakpoint. */
const NARROW_VIEWPORT = 820;

/**
 * On web, `useWindowDimensions()` can lag or disagree with the real CSS viewport
 * when DevTools are docked or the window is resized.
 *
 * - Docked tools: RN width shrinks; prefer the larger CSS `innerWidth` so desktop
 *   chrome still matches the visible page.
 * - Device emulation: CSS viewport is phone-sized while RN may still report the
 *   desktop window — prefer the smaller CSS width so mobile layout actually runs
 *   (avoids desktop grids / flex:1 scroll gaps crushed into a phone frame).
 */
export function useWebLayoutWidth(): number {
  const { width } = useWindowDimensions();
  const [innerW, setInnerW] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const read = () => {
      const css =
        typeof document !== 'undefined' && document.documentElement?.clientWidth
          ? document.documentElement.clientWidth
          : window.innerWidth;
      setInnerW(css || window.innerWidth || 0);
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  if (Platform.OS !== 'web') return width;
  const css = innerW || 0;
  if (css <= 0) return width;
  // Emulated / CSS-narrow phone while RN still reports a wide window.
  if (css < NARROW_VIEWPORT && width > css + 80) return css;
  return Math.max(width, css);
}
