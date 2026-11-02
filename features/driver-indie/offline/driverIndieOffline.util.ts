/** Transport / connectivity failures — keep the outbox draft and retry. */
export function isDriverIndieTransportError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message ?? "")
        : String(error ?? "");
  return /failed to fetch|network request failed|network error|offline|timeout|timed out|internet|unreachable|econn|enotfound|etimedout|typeerror|service unavailable|\b503\b/i.test(
    message,
  );
}
