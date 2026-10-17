import { ScrollViewStyleReset } from 'expo-router/html';

import {
  SHELL_STYLE_ID,
  VIEWPORT_CONTENT_BASE,
  mobileWebReset,
  setupAndroidInteractiveWidgetViewport,
  setupViewportHeightBootstrap,
} from '@/lib/htmlShell';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering (web.output "static", i.e. `expo export`).
// The dev server runs web.output "single" and does NOT render this file —
// lib/htmlShell.ensureWebShellParity() applies the same customizations at
// runtime there. Keep all shell CSS/JS in lib/htmlShell.ts, not here.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content={VIEWPORT_CONTENT_BASE} />
        <link rel="icon" href="/favicon.ico?v=mascot-clear" type="image/x-icon" />

        {/* Open Graph — link previews on WhatsApp/LinkedIn/Slack/etc. og:image must be an absolute URL. */}
        <meta property="og:title" content="Pulse — Fleet Management Platform" />
        <meta
          property="og:description"
          content="Manage fleets, drivers, trips, and logistics from one platform."
        />
        <meta property="og:image" content="https://gogopulse.com/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content="https://gogopulse.com" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Pulse" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Pulse — Fleet Management Platform" />
        <meta
          name="twitter:description"
          content="Manage fleets, drivers, trips, and logistics from one platform."
        />
        <meta name="twitter:image" content="https://gogopulse.com/og-image.png" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Static CSS only; no user input — safe for dangerouslySetInnerHTML. */}
        <style id={SHELL_STYLE_ID} dangerouslySetInnerHTML={{ __html: mobileWebReset }} />
        <script
          dangerouslySetInnerHTML={{ __html: `(${setupViewportHeightBootstrap.toString()})();` }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(${setupAndroidInteractiveWidgetViewport.toString()})();`,
          }}
        />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}
