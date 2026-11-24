/** Transport / connectivity failures — keep the outbox draft and retry. */
export function isDcoSelfTransportError(error: unknown): boolean {
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

/** Stable key for one locally created party, shared by the live call and the outbox replay. */
export function dcoSelfPartyKey(localPartyId: string): string {
  return `dco-self-party:${localPartyId.trim()}`;
}
