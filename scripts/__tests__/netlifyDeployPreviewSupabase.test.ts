const {
  PREPROD_SUPABASE_REF,
  PROD_SUPABASE_REF,
  PREPROD_SUPABASE_URL,
  applyDeployPreviewSupabaseEnv,
} = require("../netlifyDeployPreviewSupabase.cjs");

describe("applyDeployPreviewSupabaseEnv", () => {
  it("does not rewrite production or unset Netlify contexts", () => {
    const production = {
      CONTEXT: "production",
      EXPO_PUBLIC_SUPABASE_URL: `https://${PROD_SUPABASE_REF}.supabase.co`,
    };
    applyDeployPreviewSupabaseEnv(production);
    expect(production.EXPO_PUBLIC_SUPABASE_URL).toContain(PROD_SUPABASE_REF);

    const local = { EXPO_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };
    applyDeployPreviewSupabaseEnv(local);
    expect(local.EXPO_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });

  it("forces preprod public client config on deploy-preview even if prod was injected", () => {
    const env = {
      CONTEXT: "deploy-preview",
      EXPO_PUBLIC_SUPABASE_URL: `https://${PROD_SUPABASE_REF}.supabase.co`,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "prod-anon",
      VITE_SUPABASE_URL: `https://${PROD_SUPABASE_REF}.supabase.co`,
    };
    applyDeployPreviewSupabaseEnv(env);
    expect(env.EXPO_PUBLIC_SUPABASE_URL).toBe(PREPROD_SUPABASE_URL);
    expect(env.VITE_SUPABASE_URL).toBe(PREPROD_SUPABASE_URL);
    expect(env.EXPO_PUBLIC_SUPABASE_URL).toContain(PREPROD_SUPABASE_REF);
    expect(env.EXPO_PUBLIC_SUPABASE_URL).not.toContain(PROD_SUPABASE_REF);
    expect(env.EXPO_PUBLIC_SUPABASE_ANON_KEY).not.toBe("prod-anon");
    expect(env.EXPO_PUBLIC_SUPABASE_ANON_KEY).not.toMatch(/service_role/);
  });
});
