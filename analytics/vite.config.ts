import { createRequire } from "node:module";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";

const require = createRequire(import.meta.url);
const {
  devServerSupabaseOverride,
  serviceRoleKeyForTarget,
} = require("../scripts/supabaseProject.cjs");

/** Repo-root `.env` (Expo / shared Pulse). Maps to VITE_* for the admin console. */
const repoRoot = path.resolve(__dirname, "..");

export default defineConfig(({ mode, command }) => {
  const rootEnv = loadEnv(mode, repoRoot, "");
  const localEnv = loadEnv(mode, __dirname, "");
  const env = { ...rootEnv, ...localEnv };

  let supabaseUrl =
    env.VITE_SUPABASE_URL ||
    env.EXPO_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    "";
  let serviceRoleKey =
    env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.service_role_key ||
    "";
  let anonKey =
    env.VITE_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

  const isDev = command === "serve";
  // `.env` may still name production. Dev follows .pulse-supabase-target and
  // will not bundle a service-role key from a different project.
  if (isDev) {
    const resolved = devServerSupabaseOverride(repoRoot, process.env);
    supabaseUrl = resolved.url;
    anonKey = resolved.anonKey;
    serviceRoleKey = serviceRoleKeyForTarget(serviceRoleKey, resolved);
  }
  const adminBase = isDev
    ? env.ADMIN_DEV_BASE || "/admin/"
    : "/ops-9f3a2c/";
  const adminPort = Number(env.ADMIN_DEV_PORT || 3002);
  const adminHost = env.ADMIN_DEV_HOST || "127.0.0.1";

  return {
    plugins: [react(), tailwind()],
    // Dev is served through the Pulse Metro proxy at /admin (same origin as the
    // main app); production keeps the obscured /ops-9f3a2c/ path.
    base: adminBase,
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: {
      host: adminHost,
      port: adminPort,
      strictPort: true,
      // The page is served through Metro's /admin proxy on :8081, but that proxy
      // only forwards HTTP — it cannot forward the HMR websocket upgrade. Point
      // the HMR client straight at this Vite server so hot reload still works.
      hmr: { protocol: 'ws', host: adminHost, port: adminPort, clientPort: adminPort },
    },
    build: { sourcemap: false },
    // Prefer analytics/.env when present; otherwise inject from repo root.
    envDir: __dirname,
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY":
        JSON.stringify(serviceRoleKey),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(anonKey),
    },
  };
});
