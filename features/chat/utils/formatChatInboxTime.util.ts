/**
 * Smart inbox / list timestamps — only when a real activity instant exists.
 * Returns null for missing, invalid, or epoch placeholder dates (no empty preview).
 */
export function parseChatActivityMs(iso: string | null | undefined): number | null {
  if (iso == null) return null;
  const raw = String(iso).trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  // Guard Invalid Date and unix-epoch placeholders from null coalescing.
  if (!Number.isFinite(ms) || ms < 86_400_000) return null;
  return ms;
}

/** Desktop / mobile conversation list time — omit when no real chat activity. */
export function formatChatInboxTime(iso: string | null | undefined): string | null {
  const ms = parseChatActivityMs(iso);
  if (ms == null) return null;

  const d = new Date(ms);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (day.getTime() === today.getTime()) {
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (day.getTime() === yesterday.getTime()) return "Yesterday";

  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: day.getFullYear() !== now.getFullYear() ? "2-digit" : undefined,
  });
}

/** Document hub upload stamp — null when missing/invalid (no empty date chip). */
export function formatChatDocumentUploadedAt(
  iso: string | null | undefined,
): string | null {
  const ms = parseChatActivityMs(iso);
  if (ms == null) return null;
  try {
    return new Date(ms).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
}
