/**
 * Pulse-gx production deploys keep the production Supabase project.
 * Netlify deploy previews must use preprod so PR sign-off never hits prod.
 *
 * Only the public anon client config is set here. Never add service_role.
 */
"use strict";

const PREPROD_SUPABASE_REF = "xbisiveavvbifbzyfhgy";
const PROD_SUPABASE_REF = "nafxpivddesgsrthmosv";
const PREPROD_SUPABASE_URL = `https://${PREPROD_SUPABASE_REF}.supabase.co`;
/** Legacy anon JWT for preprod — public-by-design, same class as netlify.toml prod anon. */
const PREPROD_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhiaXNpdmVhdnZiaWZienlmaGd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxMDM0MjIsImV4cCI6MjEwNDY3OTQyMn0.CcTUwoX9tKkp0_4Uj-Q45FVkzrW_qIF4mMqnkHD_3o4";

function supabaseHost(url) {
  try {
    return new URL(String(url || "")).hostname;
  } catch {
    return "";
  }
}

function isDeployPreviewContext(env) {
  return (env.CONTEXT || env.EXPO_PUBLIC_NETLIFY_CONTEXT || "") === "deploy-preview";
}

function applyDeployPreviewSupabaseEnv(env) {
  if (!isDeployPreviewContext(env)) return env;
  env.EXPO_PUBLIC_SUPABASE_URL = PREPROD_SUPABASE_URL;
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY = PREPROD_SUPABASE_ANON_KEY;
  env.VITE_SUPABASE_URL = PREPROD_SUPABASE_URL;
  env.VITE_SUPABASE_ANON_KEY = PREPROD_SUPABASE_ANON_KEY;
  const host = supabaseHost(env.EXPO_PUBLIC_SUPABASE_URL);
  if (host.includes(PROD_SUPABASE_REF) || !host.includes(PREPROD_SUPABASE_REF)) {
    throw new Error(
      `Deploy preview must use preprod ${PREPROD_SUPABASE_REF}, got ${host || "(empty)"}`,
    );
  }
  return env;
}

module.exports = {
  PREPROD_SUPABASE_REF,
  PROD_SUPABASE_REF,
  PREPROD_SUPABASE_URL,
  applyDeployPreviewSupabaseEnv,
  isDeployPreviewContext,
  supabaseHost,
};
