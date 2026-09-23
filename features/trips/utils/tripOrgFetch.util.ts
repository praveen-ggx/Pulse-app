import { isInfrastructureErrorMessage } from "@/lib/supabaseHttp.util";

/**
 * Table-scan fallback for `get_trips_for_org` is only for a missing RPC
 * (local/old schema). 503/504/timeout must not start a second `trips` SELECT
 * — that pair is ~13% of CPU in the 2026-09-22 statement snapshot.
 */
export function shouldFallbackTripsTableScan(error: {
  message?: string | null;
  code?: string | null;
} | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "42883" || code === "PGRST202") return true;
  const message = String(error.message ?? "");
  if (isInfrastructureErrorMessage(message)) return false;
  return /does not exist|could not find the function/i.test(message);
}
