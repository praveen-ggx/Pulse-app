/**
 * Single source for the web HTML shell customizations. Consumed two ways:
 * - app/+html.tsx inlines these into the statically rendered HTML
 *   (web.output "static", used by `expo export`).
 * - ensureWebShellParity() injects them at runtime when the shell was NOT
 *   statically rendered — the dev server runs web.output "single" (SPA) to
 *   avoid per-request SSR Metro OOMs (see app.config.js webOutput), and
 *   "single" does not render +html.tsx.
 */

/** id on the reset <style> tag; its presence means the static shell already applied everything. */
export const SHELL_STYLE_ID = 'pulse-mobile-web-reset';

/**
 * maximum-scale=1, user-scalable=no: Prevents iOS Safari from auto-zooming when a
 * text input with font-size < 16px is focused. This is the primary fix for the
 * "form field zoom" bug on mobile web.
 *
 * viewport-fit=cover: Allows content to render under the device notch/home indicator,
 * so safe-area insets are applied correctly by the app.
 *
 * interactive-widget is NOT in the base meta — Safari/Firefox ignore it with a
 * console warning. Android Chrome gets it via setupAndroidInteractiveWidgetViewport().
 */
/**
 * Base viewport — safe on all browsers (Safari, Firefox, desktop).
 * Does not include `interactive-widget` (Android Chrome only; added at runtime).
 */
export const VIEWPORT_CONTENT_BASE =
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

/** Desktop browsers: allow Ctrl/trackpad zoom. Mobile keeps BASE (form-field zoom). */
export const VIEWPORT_CONTENT_DESKTOP =
  'width=device-width, initial-scale=1, viewport-fit=cover';

/** @deprecated Use VIEWPORT_CONTENT_BASE — interactive-widget is Android-only. */
export const VIEWPORT_CONTENT = VIEWPORT_CONTENT_BASE;

/**
 * interactive-widget=overlays-content: Prevents Android Chrome from resizing the
 * layout viewport when the virtual keyboard appears. Without this, window.innerHeight
 * shrinks on keyboard open, causing Dimensions-based modal heights to recalculate and
 * visually collapse ("layout crash"). The keyboard overlays content instead, matching
 * native app behaviour.
 *
 * Must stay self-contained (no closures) — inlined into static HTML via toString().
 */
export function setupAndroidInteractiveWidgetViewport() {
  var ua = navigator.userAgent || '';
  var isAndroidChrome = /Android/i.test(ua) && /Chrome/i.test(ua);
  if (!isAndroidChrome) return;
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  var content = meta.getAttribute('content') || '';
  if (content.indexOf('interactive-widget=') >= 0) return;
  meta.setAttribute('content', content + ', interactive-widget=overlays-content');
}

/**
 * Keeps --app-vh in sync with the visual viewport (keyboard-aware height).
 * Must stay self-contained (no closures) — inlined into static HTML via toString().
 */
export function setupViewportHeightBootstrap() {
  // Any iOS browser (Safari, Chrome/CriOS, etc.) runs on WebKit — Apple
  // requires it — so all of them get the same @supports (-webkit-touch-callout:
  // none) fixed-position CSS in mobileWebReset below and need the same
  // --app-vh/--app-vt sync. Gating this on Safari specifically left iOS Chrome
  // with the fixed-position cage but no offset sync, which is what let the
  // page still scroll on iOS Chrome — see lib/webKeyboard.ts's file comment.
  function isIOSWeb() {
    var ua = navigator.userAgent || '';
    return (
      /iPad|iPhone|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  function isDesktopFinePointer() {
    var ua = navigator.userAgent || '';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return false;
    try {
      return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch (e) {
      return false;
    }
  }

  if (isIOSWeb()) {
    document.documentElement.classList.add('pulse-ios-web');
  } else if (isDesktopFinePointer()) {
    document.documentElement.classList.add('pulse-desktop-web');
    var desktopMeta = document.querySelector('meta[name="viewport"]');
    if (desktopMeta) {
      desktopMeta.setAttribute(
        'content',
        'width=device-width, initial-scale=1, viewport-fit=cover',
      );
    }
  }

  function setAppVh() {
    // Once installWebViewportHeight (React runtime) takes over, stop writing.
    if ((window as Window & { __appVhOwned?: boolean }).__appVhOwned) return;
    var vv = window.visualViewport;
    var inner = window.innerHeight;
    if (isIOSWeb() && vv) {
      document.documentElement.style.setProperty(
        '--app-vh',
        Math.round(vv.height) + 'px',
      );
      document.documentElement.style.setProperty(
        '--app-vt',
        Math.round(vv.offsetTop || 0) + 'px',
      );
      window.scrollTo(0, 0);
      return;
    }
    // Android Chrome runs with interactive-widget=overlays-content: the soft
    // keyboard OVERLAYS the page instead of resizing it, and occlusion is
    // handled separately via --keyboard-height. So the app's layout height must
    // stay at the full window height. Using vv.height here shrank html/body/#root
    // (they are clamped by `max-height: var(--app-vh)`) the moment the keyboard
    // opened, which re-laid out the form under the focused input, moved it, and
    // fed another viewport event — the keyboard reading as opening and closing
    // by itself. Take the larger of the two so a keyboard-shrunk visualViewport
    // can never shorten the layout.
    var h = Math.round(vv && vv.height ? Math.max(vv.height, inner) : inner);
    document.documentElement.style.setProperty('--app-vh', h + 'px');
    document.documentElement.style.setProperty('--app-vt', '0px');
  }
  setAppVh();
  window.addEventListener('resize', setAppVh);
  window.addEventListener('orientationchange', setAppVh);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppVh);
    window.visualViewport.addEventListener('scroll', setAppVh);
  }
}

export const mobileWebReset = `
html, body, #root {
  /* Fallback chain: JS --app-vh (visualViewport) → dvh → legacy % / fill-available */
  height: 100%;
  height: 100dvh;
  height: var(--app-vh, 100dvh);
  min-height: 100%;
  min-height: 100dvh;
  min-height: var(--app-vh, 100dvh);
  max-height: var(--app-vh, 100dvh);
  overflow: hidden;
}

@supports (-webkit-touch-callout: none) {
  html, body, #root {
    min-height: -webkit-fill-available;
  }
}

body {
  /* Match Theme.screenBackground + native splash — avoids white/black flash on reload */
  background-color: #ffffff;
  /* Let env(safe-area-inset-*) resolve for RN web probes (viewport-fit=cover in meta). */
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
  /* Prevent pull-to-refresh and over-scroll bounce on iOS / Android */
  overscroll-behavior: none;
  /* Prevent iOS from enlarging small text (e.g. inside cards) */
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

/* Desktop: let browser zoom resize type instead of locking at 100%. */
html.pulse-desktop-web,
html.pulse-desktop-web body,
html.pulse-desktop-web #root {
  max-height: none;
  height: 100%;
  height: 100dvh;
  min-height: 100dvh;
}
html.pulse-desktop-web body {
  -webkit-text-size-adjust: auto;
  text-size-adjust: auto;
}

/*
  iOS only (class set by setupViewportHeightBootstrap). The old
  @supports (-webkit-touch-callout: none) block also matched desktop Safari
  and broke Ctrl/trackpad zoom (fixed cage + visualViewport desync).
*/
html.pulse-ios-web,
html.pulse-ios-web body {
  position: fixed;
  width: 100%;
  left: 0;
  right: 0;
  overflow: hidden;
}

html.pulse-ios-web #root {
  position: fixed;
  left: 0;
  right: 0;
  width: 100%;
  top: var(--app-vt, 0px);
  height: var(--app-vh, 100dvh);
  max-height: var(--app-vh, 100dvh);
  overflow: hidden;
}

/* Remove the gray/blue tap flash on tappable elements (iOS/Android) */
* {
  -webkit-tap-highlight-color: transparent;
}

/*
  Eliminate the 300 ms tap delay on interactive elements.
  "manipulation" allows single-tap and scroll but disables double-tap zoom,
  which is what causes the delay.
*/
a, button, input, textarea, select, label, [role="button"] {
  touch-action: manipulation;
}

/*
  Remove the browser's default blue focus ring from inputs on mobile web.
  React Native Web applies its own focus styles via StyleSheet.
*/
input:focus,
textarea:focus,
select:focus {
  outline: none;
}

/*
  Strip iOS Safari's inner shadow and system appearance from inputs so they
  render exactly as styled by React Native Web's StyleSheet.
*/
input,
textarea,
select {
  -webkit-appearance: none;
  appearance: none;
}

/*
  RN Web bordered shells (SignUpPulseField, modals): native <input> must not paint its
  own box inside a styled wrapper — otherwise borders/backgrounds overlap at the edges.
*/
.pulse-input-shell input,
.pulse-input-shell textarea {
  background-color: transparent !important;
  border: none !important;
  box-shadow: none !important;
  outline: none;
}

/* Neutralize Chrome/Safari autofill blue/yellow fill inside Pulse shells */
.pulse-input-shell input:-webkit-autofill,
.pulse-input-shell input:-webkit-autofill:hover,
.pulse-input-shell input:-webkit-autofill:focus {
  -webkit-text-fill-color: #111827;
  caret-color: #111827;
  transition: background-color 99999s ease-in-out 0s;
  box-shadow: 0 0 0 1000px #ffffff inset !important;
}

.pulse-input-shell.pulse-input-shell--error input:-webkit-autofill,
.pulse-input-shell.pulse-input-shell--error input:-webkit-autofill:hover,
.pulse-input-shell.pulse-input-shell--error input:-webkit-autofill:focus {
  box-shadow: 0 0 0 1000px #fef2f2 inset !important;
}

/* Standalone RN Web inputs — delay autofill tint so themed backgrounds win */
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
textarea:-webkit-autofill,
textarea:-webkit-autofill:hover,
textarea:-webkit-autofill:focus {
  transition: background-color 99999s ease-in-out 0s;
}

/*
  Desktop web: full-bleed shell. #root spans the full viewport width so the top
  nav, hero, and content stretch edge-to-edge on any monitor. Mobile web unchanged.
*/
#root {
  width: 100%;
  max-width: none;
}
`;

/**
 * Runtime fallback for the SPA dev shell. No-ops when the static shell
 * (app/+html.tsx) already rendered, or off-web. Safe to call multiple times.
 */
const FAVICON_HREF = "/favicon.ico?v=mascot-clear";

/** Browsers keep the tab icon cached against /favicon.ico. A versioned link forces a fresh fetch. */
function ensureFavicon() {
  if (typeof document === "undefined") return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") === FAVICON_HREF) return;
  link.type = "image/x-icon";
  link.href = FAVICON_HREF;
}

export function ensureWebShellParity() {
  if (typeof document === 'undefined') return;
  ensureFavicon();
  if (document.getElementById(SHELL_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = SHELL_STYLE_ID;
  style.textContent = mobileWebReset;
  document.head.appendChild(style);

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport) {
    viewport.setAttribute('content', VIEWPORT_CONTENT_BASE);
  } else {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    meta.setAttribute('content', VIEWPORT_CONTENT_BASE);
    document.head.appendChild(meta);
  }

  setupViewportHeightBootstrap();
  setupAndroidInteractiveWidgetViewport();
}
