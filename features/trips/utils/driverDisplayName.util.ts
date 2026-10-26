/**
 * Phone is the unique driver reference.
 * `trips.driver_display_name` is the dispatcher's local label for this trip.
 * The platform / fleet profile name is only a suggestion.
 */

export function trimDriverLabel(value: string | null | undefined): string | null {
  const next = (value ?? "").trim();
  return next.length > 0 ? next : null;
}

/** Trip UI: keep the locally saved name; fall back to the app profile, then phone. */
export function resolveTripDriverDisplayName(args: {
  localDisplayName?: string | null;
  appName?: string | null;
  phoneFallback?: string | null;
}): string | null {
  return (
    trimDriverLabel(args.localDisplayName) ??
    trimDriverLabel(args.appName) ??
    trimDriverLabel(args.phoneFallback)
  );
}

/**
 * When a phone lookup returns an existing app driver, fill their profile name
 * unless the dispatcher already typed a local name for this same number.
 */
export function suggestedNameForPhoneLookup(args: {
  currentName: string;
  suggestedAppName: string | null;
  nameOwnedLocally: boolean;
}): string {
  if (args.nameOwnedLocally) return args.currentName;
  const suggested = trimDriverLabel(args.suggestedAppName);
  return suggested ?? args.currentName;
}
