/**
 * Slack-like channel name → channel_key slug.
 * Mirrors `fn_normalize_team_channel_key` in SQL.
 */

const MAX_KEY_LEN = 80;

export function normalizeTeamChannelKey(raw: string): string {
  let v = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (v.length > MAX_KEY_LEN) {
    v = v.slice(0, MAX_KEY_LEN).replace(/-+$/g, "");
  }
  return v;
}

export function channelDisplayTitle(
  title: string | null | undefined,
  channelKey: string | null | undefined,
): string {
  const t = String(title ?? "").trim();
  if (t) return t;
  const key = String(channelKey ?? "").trim();
  if (!key) return "channel";
  return key
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatChannelHandle(
  channelKey: string | null | undefined,
): string {
  const key = String(channelKey ?? "").trim();
  if (!key) return "#channel";
  return key.startsWith("#") ? key : `#${key}`;
}
