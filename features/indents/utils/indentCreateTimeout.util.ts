export function isIndentWriteTimeout(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: string } | null)?.message ?? "");
  return name === "TimeoutError" || /request timed out/i.test(message);
}
