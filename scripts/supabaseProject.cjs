/**
 * Explicit Supabase project selection.
 *
 * local        → .env.local only (loopback). Never reads .env.
 * preprod      → xbisiveavvbifbzyfhgy only.
 * production   → nafxpivddesgsrthmosv only. Ignores .env.local.
 *
 * There is no silent fallback. A missing target does not use .env, because
 * .env on a developer machine may be a cloud project.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const PREPROD_REF = "xbisiveavvbifbzyfhgy";
const PRODUCTION_REF = "nafxpivddesgsrthmosv";
const PREPROD_URL = `https://${PREPROD_REF}.supabase.co`;
const TARGETS = new Set(["local", "preprod", "production"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "10.0.2.2", "::1"]);

function hostOf(url) {
  try {
    return new URL(String(url || "")).hostname;
  } catch {
    return "";
  }
}

function classifySupabaseUrl(url) {
  const host = hostOf(url);
  if (!host) return "missing";
  if (LOCAL_HOSTS.has(host)) return "local";
  if (host === `${PREPROD_REF}.supabase.co`) return "preprod";
  if (host === `${PRODUCTION_REF}.supabase.co`) return "production";
  return "unknown";
}

function anonKeyProjectRef(key) {
  const parts = String(key || "").split(".");
  if (parts.length < 2) return null;
  try {
    const json = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof json.ref === "string" ? json.ref : null;
  } catch {
    return null;
  }
}

function parseEnvFile(filePath) {
  const out = {};
  if (!filePath || !fs.existsSync(filePath)) return out;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function readTargetFile(projectRoot) {
  const targetPath = path.join(projectRoot, ".pulse-supabase-target");
  if (!fs.existsSync(targetPath)) return "";
  const word = fs.readFileSync(targetPath, "utf8").trim().split(/\s+/)[0] || "";
  return word.toLowerCase();
}

/**
 * @param {{
 *   explicitTarget?: string,
 *   dotenv?: Record<string, string>,
 *   local?: Record<string, string>,
 *   processEnv?: Record<string, string | undefined>,
 *   isCI?: boolean,
 *   netlifyContext?: string,
 * }} input
 */
function resolveSupabaseProject(input) {
  const dotenv = input.dotenv || {};
  const local = input.local || {};
  const processEnv = input.processEnv || {};
  const netlifyContext = String(input.netlifyContext || "");
  const requested = String(
    input.explicitTarget || processEnv.PULSE_SUPABASE_TARGET || "",
  )
    .trim()
    .toLowerCase();

  let selected = requested;
  if (netlifyContext === "deploy-preview") {
    if (requested && requested !== "preprod") {
      throw new Error(
        `Deploy preview cannot use Supabase target "${requested}". It is locked to preprod ${PREPROD_REF}.`,
      );
    }
    selected = "preprod";
  } else if (netlifyContext === "production") {
    if (requested && requested !== "production") {
      throw new Error(
        `Production deploy cannot use Supabase target "${requested}". It is locked to ${PRODUCTION_REF}.`,
      );
    }
    selected = "production";
  } else if (!selected) {
    if (input.isCI) {
      throw new Error(
        "PULSE_SUPABASE_TARGET is required for a CI build that is not a Netlify production or deploy-preview context. Refusing to guess a Supabase project.",
      );
    }
    if (local.EXPO_PUBLIC_SUPABASE_URL) {
      selected = "local";
    } else {
      throw new Error(
        "No Supabase target. Set PULSE_SUPABASE_TARGET to local, preprod, or production (or write .pulse-supabase-target). Refusing to fall back to .env.",
      );
    }
  }

  if (!TARGETS.has(selected)) {
    throw new Error(
      `Unknown Supabase target "${selected}". Use local, preprod, or production.`,
    );
  }

  let url = "";
  let anonKey = "";
  if (selected === "local") {
    url = local.EXPO_PUBLIC_SUPABASE_URL || "";
    anonKey = local.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
    if (!url || !anonKey) {
      throw new Error(
        "Local Supabase target requires EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.local. .env was not consulted.",
      );
    }
  } else if (selected === "preprod") {
    const envUrl = processEnv.EXPO_PUBLIC_SUPABASE_URL || processEnv.VITE_SUPABASE_URL || "";
    const envKey = processEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY || processEnv.VITE_SUPABASE_ANON_KEY || "";
    if (classifySupabaseUrl(envUrl) === "preprod" && envKey) {
      url = envUrl;
      anonKey = envKey;
    } else {
      url = PREPROD_URL;
      anonKey =
        processEnv.PULSE_PREPROD_SUPABASE_ANON_KEY ||
        require("./netlifyDeployPreviewSupabase.cjs").PREPROD_SUPABASE_ANON_KEY;
    }
  } else {
    const fileUrl = dotenv.EXPO_PUBLIC_SUPABASE_URL || dotenv.VITE_SUPABASE_URL || "";
    const fileKey = dotenv.EXPO_PUBLIC_SUPABASE_ANON_KEY || dotenv.VITE_SUPABASE_ANON_KEY || "";
    const envUrl = processEnv.EXPO_PUBLIC_SUPABASE_URL || processEnv.VITE_SUPABASE_URL || "";
    const envKey = processEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY || processEnv.VITE_SUPABASE_ANON_KEY || "";
    if (classifySupabaseUrl(fileUrl) === "production" && fileKey) {
      url = fileUrl;
      anonKey = fileKey;
    } else if (classifySupabaseUrl(envUrl) === "production" && envKey) {
      url = envUrl;
      anonKey = envKey;
    } else {
      url = fileUrl || envUrl;
      anonKey = fileKey || envKey;
    }
    if (!url || !anonKey) {
      throw new Error(
        `Production Supabase target requires the ${PRODUCTION_REF} URL and anon key in .env or the process environment. .env.local was not consulted.`,
      );
    }
  }

  const actual = classifySupabaseUrl(url);
  if (actual !== selected) {
    throw new Error(
      `Supabase target is ${selected} but ${url || "(empty)"} is ${actual}. Refusing to send authentication to a different project.`,
    );
  }

  const keyRef = anonKeyProjectRef(anonKey);
  if (selected === "local" && (keyRef === PREPROD_REF || keyRef === PRODUCTION_REF)) {
    throw new Error(
      `Local Supabase target is configured with the ${keyRef} anon key. Refusing to use a cloud key against the local database.`,
    );
  }
  if (selected === "preprod" && keyRef && keyRef !== PREPROD_REF) {
    throw new Error(
      `Preprod Supabase target has an anon key for ${keyRef}. Refusing to continue.`,
    );
  }
  if (selected === "production" && keyRef && keyRef !== PRODUCTION_REF) {
    throw new Error(
      `Production Supabase target has an anon key for ${keyRef}. Refusing to continue.`,
    );
  }

  return {
    target: selected,
    url,
    anonKey,
    projectRef: selected === "local" ? "local" : selected === "preprod" ? PREPROD_REF : PRODUCTION_REF,
  };
}

function applySupabaseProject(env, resolved) {
  env.PULSE_SUPABASE_TARGET = resolved.target;
  env.EXPO_PUBLIC_SUPABASE_URL = resolved.url;
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY = resolved.anonKey;
  env.VITE_SUPABASE_URL = resolved.url;
  env.VITE_SUPABASE_ANON_KEY = resolved.anonKey;
  const hosts = [
    env.EXPO_PUBLIC_SUPABASE_URL,
    env.VITE_SUPABASE_URL,
  ].map(classifySupabaseUrl);
  if (hosts.some((host) => host !== resolved.target)) {
    throw new Error(
      `Supabase clients resolved to different projects (${hosts.join(", ")}).`,
    );
  }
  return env;
}

const CLIENT_OVERRIDE_KEYS = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
];

/**
 * Expo's dev client merges `.env.local` on top of `process.env`. A local URL
 * in that file therefore replaces the selected project inside the bundle.
 * Keep the local values, but only let them be active when the target is local.
 */
function syncClientEnvOverride(projectRoot, resolved) {
  const localPath = path.join(projectRoot, ".env.local");
  if (!fs.existsSync(localPath)) return;
  const raw = fs.readFileSync(localPath, "utf8");
  const allowLocalKeys = resolved.target === "local";
  const next = raw.split(/\n/).map((line) => {
    const active = line.match(/^([A-Z0-9_]+)=/);
    const commented = line.match(/^#\s*([A-Z0-9_]+)=/);
    const key = (active && active[1]) || (commented && commented[1]);
    if (!key || !CLIENT_OVERRIDE_KEYS.includes(key)) return line;
    if (allowLocalKeys) return line.replace(/^#\s*/, "");
    if (line.trimStart().startsWith("#")) return line;
    return "# " + line;
  });
  const text = next.join("\n");
  if (text !== raw) fs.writeFileSync(localPath, text);
}

function resolveSupabaseProjectFromDisk(projectRoot, env = process.env) {
  return resolveSupabaseProject({
    explicitTarget: env.PULSE_SUPABASE_TARGET || readTargetFile(projectRoot),
    dotenv: parseEnvFile(path.join(projectRoot, ".env")),
    local: parseEnvFile(path.join(projectRoot, ".env.local")),
    processEnv: env,
    isCI: env.CI === "true",
    netlifyContext: env.CONTEXT || env.EXPO_PUBLIC_NETLIFY_CONTEXT || "",
  });
}

/**
 * Metro, Commerce, and the ops console each keep their own request burst.
 * On the Small production database that pins the PostgREST pool (90 connection
 * cap) and holds RAM after the queries have finished. Dev servers stay off
 * that database unless the operator sets PULSE_ALLOW_PRODUCTION=1.
 */
function devServerProductionBlock(projectRoot, env = process.env) {
  if (env.PULSE_ALLOW_PRODUCTION === "1") return null;
  const selected = String(
    env.PULSE_SUPABASE_TARGET || readTargetFile(projectRoot) || "",
  ).trim();
  let resolvedTarget = selected;
  if (!resolvedTarget) {
    try {
      resolvedTarget = resolveSupabaseProjectFromDisk(projectRoot, env).target;
    } catch {
      resolvedTarget = "";
    }
  }
  if (resolvedTarget !== "production") return null;
  return (
    "Refusing to start a dev server against production (" +
    PRODUCTION_REF +
    "). That database is a Small instance with 90 connections; " +
    "Metro, Commerce, and the ops console keep the PostgREST pool warm and the RAM near its ceiling. " +
    "Point .pulse-supabase-target at local or preprod. " +
    "Set PULSE_ALLOW_PRODUCTION=1 only for a deliberate production session."
  );
}

/**
 * Dev servers must use the selected target. A production URL left in `.env`
 * is not a fallback for `vite` / Commerce / the ops console.
 */
function devServerSupabaseOverride(projectRoot, env = process.env) {
  const block = devServerProductionBlock(projectRoot, env);
  if (block) throw new Error(block);
  return resolveSupabaseProjectFromDisk(projectRoot, env);
}

/** Drop a service-role key that belongs to a different project than the selected target. */
function serviceRoleKeyForTarget(serviceRoleKey, resolved) {
  if (!serviceRoleKey || !resolved || resolved.target === "local") return "";
  const ref = anonKeyProjectRef(serviceRoleKey);
  const expected =
    resolved.target === "preprod" ? PREPROD_REF : resolved.projectRef;
  if (ref && ref !== expected) return "";
  return serviceRoleKey;
}

function loadSupabaseProject(projectRoot, env = process.env) {
  const resolved = resolveSupabaseProject({
    explicitTarget: env.PULSE_SUPABASE_TARGET || readTargetFile(projectRoot),
    dotenv: parseEnvFile(path.join(projectRoot, ".env")),
    local: parseEnvFile(path.join(projectRoot, ".env.local")),
    processEnv: env,
    isCI: env.CI === "true",
    netlifyContext: env.CONTEXT || env.EXPO_PUBLIC_NETLIFY_CONTEXT || "",
  });
  applySupabaseProject(env, resolved);
  syncClientEnvOverride(projectRoot, resolved);
  return resolved;
}

module.exports = {
  PREPROD_REF,
  PRODUCTION_REF,
  classifySupabaseUrl,
  resolveSupabaseProject,
  applySupabaseProject,
  loadSupabaseProject,
  devServerProductionBlock,
  devServerSupabaseOverride,
  serviceRoleKeyForTarget,
  readTargetFile,
  syncClientEnvOverride,
};
