const path = require('path');
const fs = require('fs');

require('./scripts/expo-env');
require('./scripts/netlifyDeployPreviewSupabase.cjs').applyDeployPreviewSupabaseEnv(process.env);

// Load .env from same directory as this config file (project root)
const projectRoot = __dirname;
const envPath = path.join(projectRoot, '.env');
const envLocalPath = path.join(projectRoot, '.env.local');

require('dotenv').config({ path: envPath, override: true, quiet: true });
if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath, override: true, quiet: true });
}

// Fallback: if dotenv didn't set them (e.g. "injecting env (0)"), read .env from disk
function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (key) out[key] = val;
  }
  return out;
}

const envVars = parseEnvFile(envPath);
const localVars = fs.existsSync(envLocalPath) ? parseEnvFile(envLocalPath) : {};

// Source of truth order:
// 1) .env.local (developer override)
// 2) .env (project default)
// 3) process.env — CI only (Netlify injects these; no .env files are present there)
// Avoid process.env winning in local dev where stale shell vars could override the wrong project.
const isCI = process.env.CI === 'true';
let supabaseUrl =
  localVars.EXPO_PUBLIC_SUPABASE_URL ||
  envVars.EXPO_PUBLIC_SUPABASE_URL ||
  envVars.VITE_SUPABASE_URL ||
  (isCI ? process.env.EXPO_PUBLIC_SUPABASE_URL : '') ||
  '';
let supabaseAnonKey =
  localVars.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  envVars.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  envVars.VITE_SUPABASE_ANON_KEY ||
  (isCI ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY : '') ||
  '';

let geminiApiKey =
  localVars.EXPO_PUBLIC_GEMINI_API_KEY ||
  envVars.EXPO_PUBLIC_GEMINI_API_KEY ||
  localVars.VITE_GEMINI_API_KEY ||
  envVars.VITE_GEMINI_API_KEY ||
  (isCI ? process.env.EXPO_PUBLIC_GEMINI_API_KEY : '') ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[pulse] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Add them to .env in the project root and restart: npx expo start'
  );
} else {
  try {
    const host = new URL(supabaseUrl).hostname;
    console.log('[pulse][config] envPath:', envPath);
    console.log('[pulse][config] envLocalPath:', envLocalPath);
    console.log('[pulse][config] resolved Supabase host:', host);
  } catch (_) {
    // no-op
  }
}

// Build identity, resolved at config-eval time (i.e. per build, not per request).
// Netlify sets COMMIT_REF/BUILD_ID; EAS sets EAS_BUILD_ID. Locally there is no
// stable build, so fall back to the app version — a dev server restart must NOT
// wipe the cache on every reload, which a Date.now() stamp would do.
const buildStamp =
  process.env.EXPO_PUBLIC_BUILD_ID ||
  process.env.COMMIT_REF ||
  process.env.BUILD_ID ||
  process.env.EAS_BUILD_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  'dev';

// Static config inlined from the former app.json. Kept here (rather than a separate
// app.json) because expo-doctor cannot tell that a dynamic app.config.js consumes
// app.json, and flags the pair as conflicting. Single source of truth now.
const config = {
  expo: {
    name: 'PULSE',
    slug: 'pulse',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'pulse',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      bundleIdentifier: 'com.pulse.app',
      supportsTablet: true,
      infoPlist: {
        LSApplicationQueriesSchemes: ['whatsapp'],
        UIBackgroundModes: ['location'],
        NSLocationWhenInUseUsageDescription:
          'Driver location is used for live trip tracking.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Location tracking continues during trips even when the app is in background.',
        NSLocationAlwaysUsageDescription:
          'This app tracks driver location for logistics trip monitoring.',
        NSCameraUsageDescription:
          'Allow PULSE to use the camera for odometer photos, receipts, and document uploads.',
        NSPhotoLibraryUsageDescription:
          'Allow PULSE to access your photos for odometer photos, receipts, and document uploads.',
      },
    },
    android: {
      package: 'com.pulse.app',
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#000000',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
      meta: {
        viewport: {
          content:
            'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
        },
      },
    },
    plugins: [
      [
        'expo-router',
        {
          asyncRoutes: {
            web: false,
            ios: false,
            android: false,
            default: 'development',
          },
        },
      ],
      '@maplibre/maplibre-react-native',
      [
        'expo-image-picker',
        {
          cameraPermission:
            'Allow PULSE to use the camera for odometer photos, receipts, and document uploads.',
          photosPermission:
            'Allow PULSE to access your photos for odometer photos, receipts, and document uploads.',
        },
      ],
      'expo-detox-config-plugin',
    ],
    experiments: {
      typedRoutes: true,
    },
  },
};

// Only include config plugins when their packages are installed (e.g. after npm install).
// This avoids "Failed to resolve plugin" when node_modules is missing or deps not installed.
const basePlugins = Array.isArray(config.expo?.plugins) ? config.expo.plugins : [];
let detoxAvailable = false;
let contactsAvailable = false;
try {
  require.resolve('expo-detox-config-plugin');
  detoxAvailable = true;
} catch (_) {}
try {
  require.resolve('expo-contacts');
  contactsAvailable = true;
} catch (_) {}
const pluginsFromConfig = basePlugins.filter(
  (p) => p !== 'expo-detox-config-plugin' || detoxAvailable
);
const expoContactsPlugin = contactsAvailable
  ? [['expo-contacts', { contactsPermission: 'Allow $(PRODUCT_NAME) to access your contacts to fill name and phone when adding clients, suppliers, or drivers.' }]]
  : [];

// Sentry Expo config plugin: enables native crash symbolication + source-map
// upload so production stack traces are readable. Only included when installed
// AND a Sentry org/project are configured, so local/dev builds are unaffected.
let sentryPluginAvailable = false;
try {
  require.resolve('@sentry/react-native/app.plugin');
  sentryPluginAvailable = true;
} catch (_) {}
const sentryPlugin =
  sentryPluginAvailable && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? [['@sentry/react-native/expo', {
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      }]]
    : [];

// react-native-maps 1.20.x does not ship an Expo config plugin; do not add it to plugins.
// For Android release, set Google Maps API key in native project (e.g. android/app/src/main/AndroidManifest.xml) if needed.

// Production (https Supabase URL): disable cleartext on Android. Local dev (http): allow.
const useCleartextTraffic = typeof supabaseUrl === 'string' && supabaseUrl.startsWith('http://');

// SPA mode for both dev and export. Pulse is an authenticated dashboard — SEO has no value
// inside the app, and static rendering forces the λ render.js server bundle (~3300 modules,
// ~5.8k-module server graph) to be built on every Netlify deploy, which is the dominant
// build-time cost. Netlify's /* → /index.html redirect handles client-side routing.
// PULSE_WEB_OUTPUT=static can reproduce the old static export mode locally if ever needed.
const webOutput = process.env.PULSE_WEB_OUTPUT || 'single';

module.exports = {
  ...config,
  expo: {
    ...config.expo,
    web: {
      ...config.expo?.web,
      output: webOutput,
    },
    extra: {
      supabaseUrl,
      supabaseAnonKey,
      geminiApiKey,
      // Build identity for the client-cache buster. Any new deploy changes this,
      // which discards every persisted TanStack cache + delta cursor on next load.
      // Without it a poisoned cache survives redeploys for its full 6h maxAge and
      // the only remedy is asking the user to clear site data (GX-PULSE-CACHE).
      buildId: buildStamp,
      // Use app/+not-found.tsx — built-in Unmatched.js crashes when async-loaded (StyleSheet undefined).
      router: {
        notFound: false,
      },
    },
    scheme: config.expo?.scheme ?? 'pulse',
    android: {
      ...config.expo?.android,
      permissions: ['android.permission.INTERNET'],
      softwareKeyboardLayoutMode: 'resize',
    },
    plugins: [
      ...pluginsFromConfig,
      ['expo-build-properties', { android: { usesCleartextTraffic: useCleartextTraffic }, ios: {} }],
      ...expoContactsPlugin,
      ...sentryPlugin,
    ].filter(Boolean),
  },
};
