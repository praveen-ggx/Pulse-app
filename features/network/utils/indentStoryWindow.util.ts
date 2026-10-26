/** Default Pulse LOAD story window after create or reboost. */
export const INDENT_STORY_TTL_MS = 24 * 60 * 60 * 1000;

export function indentStoryExpiresAt(fromMs: number = Date.now()): string {
  return new Date(fromMs + INDENT_STORY_TTL_MS).toISOString();
}

/**
 * Story-reel window.
 * Indent-linked LOAD: indent expire/cancel owns visibility (`expires_at` is
 * only a reboost clock). Other posts still use the 24h `expires_at` clock.
 */
export function isIndentStoryLive(row: {
  is_active?: boolean | null;
  expires_at?: string | null;
  source_indent_id?: string | null;
}): boolean {
  if (row.source_indent_id) {
    return row.is_active !== false;
  }
  if (row.is_active !== true) return false;
  if (!row.expires_at) return true;
  const expires = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expires)) return false;
  return expires > Date.now();
}
