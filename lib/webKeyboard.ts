/**
 * Mobile web keyboard / viewport platform detection.
 *
 * - Any iOS browser (Safari, Chrome/CriOS, Firefox/FxiOS, Edge/EdgiOS): all run
 *   on WebKit — Apple requires it — so all of them resize `visualViewport` and
 *   scroll the layout document via `offsetTop` the same way. htmlShell's
 *   `html.pulse-ios-web` CSS block (which pins html/body/#root to
 *   `position: fixed`) applies to all of them identically. The JS
 *   that keeps `--app-vh`/`--app-vt` in sync with that CSS must therefore also
 *   run for all of them (gate on isIOSWeb, not isIOSWebSafari) or non-Safari
 *   iOS browsers get the fixed-position cage with no compensating offset sync,
 *   which is what allowed the page to still scroll on iOS Chrome.
 * - Android Chrome: `interactive-widget=overlays-content` keeps layout height;
 *   the keyboard overlays from below. Do NOT shrink a focused form (ScrollView
 *   margin / footer padding) or programmatically scrollIntoView — Chromium
 *   blurs the active input when its overflow ancestor moves, which reads as
 *   the keyboard "unfocusing" on Join your team / Account. Chrome already
 *   keeps the focused field in the visual viewport. `--keyboard-height` stays
 *   a CSS var only (no React reflow).
 */

export const WEB_KEYBOARD_INSET_THRESHOLD_PX = 48;

export function isIOSWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Safari on iOS (not Chrome/Firefox/Edge iOS wrappers). */
export function isIOSWebSafari(): boolean {
  if (!isIOSWeb()) return false;
  const ua = navigator.userAgent || '';
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/i.test(ua);
}

/** Android Chrome / Chromium (not iOS CriOS, not desktop Chrome). */
export function isAndroidChromeWeb(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android/i.test(ua) && /Chrome/i.test(ua);
}

export function isAndroidChromeOverlayKeyboard(): boolean {
  if (!isAndroidChromeWeb() || typeof document === 'undefined') {
    return false;
  }
  const meta = document.querySelector('meta[name="viewport"]');
  const content = meta?.getAttribute('content') || '';
  return content.includes('interactive-widget=overlays-content');
}

/**
 * Signup / onboarding form steps must not reflow or programmatically scroll
 * while an input is focused. Android Chrome dismisses the IME when the
 * focused field's overflow parent is resized or scrollTo'd.
 */
export function shouldAvoidWebKeyboardFormReflow(): boolean {
  return isAndroidChromeWeb();
}

/**
 * Keep the focused input alive when tapping a trailing control (password eye).
 * `mousedown`/`pointerdown` on the icon would otherwise steal focus and close
 * the keyboard. Pointer covers mouse, touch, and pen on mobile Chrome.
 */
export function preventWebFocusSteal(event: { preventDefault?: () => void }): void {
  event.preventDefault?.();
}

/** RN Web View props — attach to any control that must not steal input focus. */
export const WEB_TRAILING_FOCUS_GUARD = {
  onMouseDown: preventWebFocusSteal,
  onPointerDown: preventWebFocusSteal,
} as const;

export interface WebVisualViewportMetrics {
  height: number;
  offsetTop: number;
  keyboardInset: number;
  keyboardOpen: boolean;
}

/** Read visual viewport geometry for keyboard + shell pinning. */
export function readWebVisualViewportMetrics(): WebVisualViewportMetrics {
  if (typeof window === 'undefined') {
    return { height: 0, offsetTop: 0, keyboardInset: 0, keyboardOpen: false };
  }

  const vv = window.visualViewport;
  const inner = window.innerHeight;
  const height = Math.round(vv?.height ?? inner);
  const offsetTop = Math.round(vv?.offsetTop ?? 0);
  const heightShrink = Math.max(0, inner - height);

  if (isIOSWeb()) {
    // Do not subtract offsetTop — WebKit (Safari and every other iOS browser,
    // since Apple mandates WebKit) moves the layout viewport instead of
    // reporting occlusion in (inner - height - offsetTop), which reads 0 and
    // breaks detection.
    const keyboardOpen =
      heightShrink >= WEB_KEYBOARD_INSET_THRESHOLD_PX ||
      offsetTop >= WEB_KEYBOARD_INSET_THRESHOLD_PX;
    return {
      height,
      offsetTop,
      keyboardInset: heightShrink,
      keyboardOpen,
    };
  }

  const keyboardInset = Math.max(0, Math.round(inner - height - offsetTop));
  const keyboardOpen = keyboardInset >= WEB_KEYBOARD_INSET_THRESHOLD_PX;
  return { height, offsetTop, keyboardInset, keyboardOpen };
}

/**
 * Pin the React root to the visible viewport on iOS (any browser — see the
 * file-level comment on why this is isIOSWeb, not isIOSWebSafari).
 * Called once by installWebViewportHeight (initial paint) and then from inside
 * useKeyboardVisible's web sync() on every visualViewport/focus event — that is
 * the single place this runs on an ongoing basis, so the pin and the React
 * keyboard-inset state always update in the same synchronous pass.
 *
 * While the soft keyboard has shrunk visualViewport.height, keep `--app-vt` at 0.
 * Chasing `offsetTop` mid-gesture moves the whole `#root` shell while an RN
 * ScrollView is also scrolling (Org name / onboarding fields) and reads as
 * "scroll cuts off". Document pan is cancelled via `window.scrollTo(0, 0)`.
 *
 * On Android (non-iOS) this instead holds --app-vh at the FULL window height —
 * see the branch below. Despite the iOS-centric name, this must run on Android
 * too: it is the only ongoing writer of --app-vh once React claims ownership.
 */
export function applyIOSWebSafariViewportPin(): void {
  if (typeof document === 'undefined') return;
  if (!isIOSWeb()) {
    // Android Chrome (overlays-content): the keyboard overlays the page rather
    // than resizing it, so the layout height must stay at the full window
    // height. This still has to be written on every viewport event, because the
    // static-HTML bootstrap stops writing --app-vh as soon as React claims
    // ownership (__appVhOwned) — leaving nobody updating it. Using
    // max(visualViewport.height, innerHeight) keeps a keyboard-shrunk visual
    // viewport from clamping html/body/#root via `max-height: var(--app-vh)`.
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    const full = Math.round(
      vv ? Math.max(vv.height, window.innerHeight) : window.innerHeight,
    );
    document.documentElement.style.setProperty('--app-vh', `${full}px`);
    document.documentElement.style.setProperty('--app-vt', '0px');
    return;
  }
  const { height, offsetTop, keyboardInset } = readWebVisualViewportMetrics();
  const keyboardOpenByHeight = keyboardInset >= WEB_KEYBOARD_INSET_THRESHOLD_PX;
  document.documentElement.style.setProperty('--app-vh', `${height}px`);
  document.documentElement.style.setProperty(
    '--app-vt',
    `${keyboardOpenByHeight ? 0 : offsetTop}px`,
  );
  window.scrollTo(0, 0);
}

/**
 * True when `node` is (or is inside, or *contains*) a web editable control.
 *
 * Walking only upwards is not enough on React Native Web: a `TextInput` renders
 * the real `<input>` inside a wrapper `<div>` (plus the field's own padded
 * container / label row). A tap on that padding hits the wrapper, whose
 * ancestors contain no INPUT, so an upward-only check calls it "outside the
 * field" and blurs — the keyboard closes and RN's own press handler immediately
 * refocuses the input, reopening it. That blur/refocus race is what makes the
 * Android keyboard flicker open-closed on the signup form steps. Checking
 * descendants too makes a tap anywhere on the field a no-op for dismissal.
 */
export function isWebEditableDomTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof Node)) {
    return false;
  }
  let node: Node | null = target;
  while (node) {
    if (node instanceof HTMLElement) {
      const tag = node.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (node.isContentEditable) return true;
    }
    node = node.parentNode;
  }
  if (target instanceof HTMLElement) {
    if (target.querySelector('input, textarea, select, [contenteditable="true"]')) {
      return true;
    }
  }
  return false;
}

/**
 * Blur the focused web input/textarea so iOS dismisses the keyboard and the
 * viewport pin can expand again. Safe no-op on native / no focus.
 */
export function blurActiveWebEditable(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) {
    return false;
  }
  cancelPendingWebInputScroll();
  el.blur();
  return true;
}

/**
 * When false, `#root` is pinned to visualViewport height (iOS — any browser,
 * see file-level comment) and scroll padding for keyboard height would
 * double-count occlusion.
 */
export function shouldApplyWebKeyboardScrollInset(): boolean {
  if (typeof window === 'undefined') return true;
  return !isIOSWeb();
}

let pendingFocusScrollFrame: number | null = null;
let pendingFocusScrollTimer: ReturnType<typeof setTimeout> | null = null;

/** Cancel any in-flight focus scroll (new focus / blur supersedes the old one). */
export function cancelPendingWebInputScroll(): void {
  if (pendingFocusScrollFrame != null) {
    cancelAnimationFrame(pendingFocusScrollFrame);
    pendingFocusScrollFrame = null;
  }
  if (pendingFocusScrollTimer != null) {
    clearTimeout(pendingFocusScrollTimer);
    pendingFocusScrollTimer = null;
  }
}

/**
 * Scroll the focused editable into view once the virtual keyboard has settled.
 * Single cancellable pass — see the comment inside on why multi-pass scrolling
 * made the Android keyboard flicker open/closed.
 */
export function scrollFocusedWebInputIntoView(): void {
  if (typeof document === 'undefined') return;
  if (shouldAvoidWebKeyboardFormReflow()) {
    cancelPendingWebInputScroll();
    return;
  }

  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !el.isContentEditable) return;

  // Supersede any scroll queued by a previous field. Tapping quickly between
  // fields used to leave up to three queued passes per field alive (rAF,
  // double-rAF and a 320ms timer); they then fired against whatever input was
  // focused *later*, scrolling the page out from under it while the keyboard
  // was still animating. On Android Chrome each of those document scrolls
  // resizes visualViewport, which re-reads keyboard geometry and relayouts —
  // the keyboard reads as opening and closing on its own, worst when tapping
  // rapidly or switching Full name -> Email.
  cancelPendingWebInputScroll();

  // `nearest` on every platform: `center` forces a document scroll even when
  // the field is already fully visible, which is the common case here since
  // the form's own ScrollView has already positioned it.
  const run = () => {
    pendingFocusScrollFrame = null;
    pendingFocusScrollTimer = null;
    if (document.activeElement !== el) return; // focus moved on; stale pass
    try {
      el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    } catch {
      el.scrollIntoView({ block: 'nearest' });
    }
  };

  // Single pass, after the keyboard has settled. Running one at rAF (before the
  // keyboard exists) only produced a scroll that the later passes had to undo.
  pendingFocusScrollTimer = setTimeout(run, isIOSWeb() ? 0 : 300);
}
