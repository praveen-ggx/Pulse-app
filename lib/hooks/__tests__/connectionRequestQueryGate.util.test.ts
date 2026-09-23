import { shouldFallbackConnectionRequestFetch } from "@/lib/hooks/connectionRequestQueryGate.util";
import { noteSupabaseOriginDown, resetSupabaseCircuit } from "@/lib/supabaseHttp.util";

describe("shouldFallbackConnectionRequestFetch", () => {
  const base = {
    orgId: "org-1",
    bootstrapReady: false,
    bootstrapStatus: "idle",
    authStatus: "authenticated",
  };

  it("does not fetch during idle/loading/ready bootstrap (auth restore / remount)", () => {
    expect(shouldFallbackConnectionRequestFetch({ ...base, bootstrapStatus: "idle" })).toBe(false);
    expect(shouldFallbackConnectionRequestFetch({ ...base, bootstrapStatus: "loading" })).toBe(false);
    expect(
      shouldFallbackConnectionRequestFetch({
        ...base,
        bootstrapReady: true,
        bootstrapStatus: "ready",
      }),
    ).toBe(false);
  });

  it("fetches only after bootstrap failed", () => {
    expect(shouldFallbackConnectionRequestFetch({ ...base, bootstrapStatus: "error" })).toBe(true);
  });

  it("does not fetch while the origin-down circuit is open", () => {
    noteSupabaseOriginDown();
    expect(shouldFallbackConnectionRequestFetch({ ...base, bootstrapStatus: "error" })).toBe(false);
    resetSupabaseCircuit();
  });

  it("does not fetch while session is restoring", () => {
    expect(
      shouldFallbackConnectionRequestFetch({
        ...base,
        bootstrapStatus: "error",
        authStatus: "loading",
      }),
    ).toBe(false);
  });
});
