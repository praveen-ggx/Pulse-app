const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  PREPROD_REF,
  PRODUCTION_REF,
  applySupabaseProject,
  resolveSupabaseProject,
  syncClientEnvOverride,
} = require("../supabaseProject.cjs");

function jwt(ref: string): string {
  const payload = Buffer.from(JSON.stringify({ ref, role: "anon" })).toString("base64url");
  return `hdr.${payload}.sig`;
}

const LOCAL_URL = "http://127.0.0.1:54321";
const PREPROD_URL = `https://${PREPROD_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_REF}.supabase.co`;

describe("resolveSupabaseProject", () => {
  it("keeps a local development app on the local database when .env is production", () => {
    const resolved = resolveSupabaseProject({
      dotenv: { EXPO_PUBLIC_SUPABASE_URL: PROD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt(PRODUCTION_REF) },
      local: { EXPO_PUBLIC_SUPABASE_URL: LOCAL_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt("local-stack") },
    });
    expect(resolved.target).toBe("local");
    expect(resolved.url).toBe(LOCAL_URL);
    expect(resolved.projectRef).toBe("local");
  });

  it("does not silently use production when no local URL and no target are set", () => {
    expect(() =>
      resolveSupabaseProject({
        dotenv: { EXPO_PUBLIC_SUPABASE_URL: PROD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt(PRODUCTION_REF) },
        local: {},
      }),
    ).toThrow(/Refusing to fall back to \.env/);
  });

  it("uses production only when the target is explicitly production, and ignores .env.local", () => {
    const resolved = resolveSupabaseProject({
      explicitTarget: "production",
      dotenv: { EXPO_PUBLIC_SUPABASE_URL: PROD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt(PRODUCTION_REF) },
      local: { EXPO_PUBLIC_SUPABASE_URL: LOCAL_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt("local-stack") },
    });
    expect(resolved.target).toBe("production");
    expect(resolved.url).toBe(PROD_URL);
    expect(resolved.projectRef).toBe(PRODUCTION_REF);
  });

  it("refuses a production target that would reach the local database", () => {
    expect(() =>
      resolveSupabaseProject({
        explicitTarget: "production",
        dotenv: { EXPO_PUBLIC_SUPABASE_URL: LOCAL_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt("local-stack") },
        local: { EXPO_PUBLIC_SUPABASE_URL: LOCAL_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt("local-stack") },
      }),
    ).toThrow(/target is production/);
  });

  it("locks preprod to xbisiveavvbifbzyfhgy even when .env and .env.local point elsewhere", () => {
    const resolved = resolveSupabaseProject({
      explicitTarget: "preprod",
      dotenv: { EXPO_PUBLIC_SUPABASE_URL: PROD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt(PRODUCTION_REF) },
      local: { EXPO_PUBLIC_SUPABASE_URL: LOCAL_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt("local-stack") },
      processEnv: {},
    });
    expect(resolved.target).toBe("preprod");
    expect(resolved.url).toBe(PREPROD_URL);
    expect(resolved.projectRef).toBe(PREPROD_REF);
    expect(resolved.url).not.toContain(PRODUCTION_REF);
    expect(resolved.url).not.toContain("127.0.0.1");
  });

  it("locks a Netlify deploy preview to preprod and drops an injected production URL", () => {
    const resolved = resolveSupabaseProject({
      netlifyContext: "deploy-preview",
      processEnv: {
        EXPO_PUBLIC_SUPABASE_URL: PROD_URL,
        EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt(PRODUCTION_REF),
      },
    });
    expect(resolved.projectRef).toBe(PREPROD_REF);
    expect(resolved.url).not.toContain(PRODUCTION_REF);
  });

  it("rejects an explicit production target on a deploy preview", () => {
    expect(() =>
      resolveSupabaseProject({
        explicitTarget: "production",
        netlifyContext: "deploy-preview",
      }),
    ).toThrow(/locked to preprod/);
  });

  it("fails explicitly when the selected target has no credentials", () => {
    expect(() => resolveSupabaseProject({ explicitTarget: "local", local: {} })).toThrow(
      /\.env\.local/,
    );
    expect(() =>
      resolveSupabaseProject({ explicitTarget: "production", dotenv: {}, processEnv: {} }),
    ).toThrow(/Production Supabase target requires/);
  });

  it("refuses a CI build with no Netlify context and no target", () => {
    expect(() =>
      resolveSupabaseProject({
        isCI: true,
        dotenv: { EXPO_PUBLIC_SUPABASE_URL: PROD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt(PRODUCTION_REF) },
      }),
    ).toThrow(/PULSE_SUPABASE_TARGET is required/);
  });

  it("writes the same project into every client env var", () => {
    const resolved = resolveSupabaseProject({
      explicitTarget: "production",
      dotenv: { EXPO_PUBLIC_SUPABASE_URL: PROD_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt(PRODUCTION_REF) },
    });
    const env: Record<string, string> = {};
    applySupabaseProject(env, resolved);
    expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe(env.VITE_SUPABASE_URL);
    expect(env.EXPO_PUBLIC_SUPABASE_URL).toContain(PRODUCTION_REF);
    expect(env.PULSE_SUPABASE_TARGET).toBe("production");
  });

  it("stops .env.local from overriding a production target inside the Expo bundle", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-supabase-"));
    const localFile = path.join(dir, ".env.local");
    fs.writeFileSync(
      localFile,
      "EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nEXPO_PUBLIC_SUPABASE_ANON_KEY=local-key\nOTHER=keep\n",
    );
    syncClientEnvOverride(dir, { target: "production" });
    const commented = fs.readFileSync(localFile, "utf8");
    expect(commented).toContain("# EXPO_PUBLIC_SUPABASE_URL=");
    expect(commented).toContain("OTHER=keep");
    expect(commented).not.toMatch(/^EXPO_PUBLIC_SUPABASE_URL=/m);
    syncClientEnvOverride(dir, { target: "local" });
    const restored = fs.readFileSync(localFile, "utf8");
    expect(restored).toMatch(/^EXPO_PUBLIC_SUPABASE_URL=http:\/\/127\.0\.0\.1:54321/m);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a local target that carries a production anon key", () => {
    expect(() =>
      resolveSupabaseProject({
        explicitTarget: "local",
        local: { EXPO_PUBLIC_SUPABASE_URL: LOCAL_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt(PRODUCTION_REF) },
      }),
    ).toThrow(/cloud key/);
  });
});
