const LEGAL_SUFFIX =
  /^(pvt|pvt\.|ltd|ltd\.|limited|private|llp|llc|inc|inc\.|co|company)$/i;

/** Drop trailing legal tokens so initials come from the company, not "LTD". */
export function companyNameForInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIX.test(words[words.length - 1] ?? "")) {
    words.pop();
  }
  return words.join(" ") || name.trim();
}

/**
 * Org name when the notification title starts with it.
 * Action-only titles ("Quote requested on …") return null so we don't
 * initial the sentence ("QS").
 */
export function networkNotificationPartyName(
  title: string | null | undefined,
): string | null {
  const text = (title ?? "").trim();
  if (!text) return null;
  const placed = /^(.*?)\s+placed a bid$/i.exec(text);
  if (placed?.[1] && !/^a partner$/i.test(placed[1].trim())) return placed[1].trim();
  const quoted = /^(.*?)\s+quoted on\s+\S+/i.exec(text);
  if (quoted?.[1] && !/^a partner$/i.test(quoted[1].trim())) return quoted[1].trim();
  return null;
}
