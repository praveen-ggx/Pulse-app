/**
 * Which fuel / toll save failures may go to the offline outbox.
 *
 * Only failures an offline replay can fix are queued. A permission, validation or
 * business-rule error would fail the same way on every replay while the driver is
 * told "Saved offline", so those surface immediately instead.
 *
 * Input is what the services return: an Error carrying PostgREST `code` and HTTP
 * `status` when the server answered, or postgrest-js's "<ErrorName>: <message>"
 * wrapper when the fetch itself threw (offline, timeout, circuit open, queue full).
 */
import { isBrowserTransportFailure } from "@/lib/supabaseHttp.util";

export type OperationsSaveErrorCategory =
  | "offline"
  | "timeout"
  | "transient"
  | "auth"
  | "forbidden"
  | "validation"
  | "business"
  | "unknown";

function fieldOf(error: unknown, key: "code" | "status" | "message" | "name"): unknown {
  return error && typeof error === "object" ? (error as Record<string, unknown>)[key] : undefined;
}

export function classifyOperationsSaveError(error: unknown): OperationsSaveErrorCategory {
  const code = String(fieldOf(error, "code") ?? "").toUpperCase();
  const statusRaw = fieldOf(error, "status");
  const status = typeof statusRaw === "number" ? statusRaw : 0;
  const message = String(fieldOf(error, "message") ?? (typeof error === "string" ? error : ""));
  const name = String(fieldOf(error, "name") ?? "");
  const text = `${name} ${message}`;

  if (/DeviceOfflineError/.test(text) || isBrowserTransportFailure(message)) return "offline";
  if (/TimeoutError|timed out/i.test(text) || status === 408 || status === 504 || code === "57014") {
    return "timeout";
  }
  if (
    /ServiceUnavailableError|SupabaseQueueRejectedError/.test(text) ||
    status === 429 ||
    status >= 500 ||
    /^PGRST00[0-3]$/.test(code) ||
    code === "57P01" ||
    code === "57P03"
  ) {
    return "transient";
  }
  if (status === 401 || code === "PGRST301" || code === "PGRST302" || /JWT/i.test(message)) return "auth";
  if (status === 403 || code === "42501" || /row-level security|permission denied/i.test(message)) {
    return "forbidden";
  }
  if (code === "P0001") return "business";
  if (
    code.startsWith("22") ||
    code.startsWith("23") ||
    code.startsWith("PGRST1") ||
    code.startsWith("PGRST2") ||
    status === 400 ||
    status === 404 ||
    status === 409 ||
    status === 422
  ) {
    return "validation";
  }
  return "unknown";
}

/** Offline, timed out or the origin is temporarily unavailable — replay can succeed. */
export function isRecoverableOperationsSaveError(error: unknown): boolean {
  const category = classifyOperationsSaveError(error);
  return category === "offline" || category === "timeout" || category === "transient";
}
