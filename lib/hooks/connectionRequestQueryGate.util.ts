import { isSupabaseCircuitOpen } from "@/lib/supabaseHttp.util";

export function shouldFallbackConnectionRequestFetch(args: {
  orgId: string | null;
  enabled?: boolean;
  bootstrapReady: boolean;
  bootstrapStatus: string;
  authStatus: string;
}): boolean {
  if (isSupabaseCircuitOpen()) return false;
  return (
    !!args.orgId &&
    args.enabled !== false &&
    !args.bootstrapReady &&
    args.bootstrapStatus === "error" &&
    args.authStatus === "authenticated"
  );
}
